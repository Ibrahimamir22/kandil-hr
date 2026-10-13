"""Scoped vacancy actions reuse the request transaction, version and receipt contract."""

import frappe
from frappe import _
from frappe.utils import cint, getdate

from kandil_hr.foundation.clock import today_cairo as today
from kandil_hr.foundation.security import has_scope, request_scope
from kandil_hr.pilot.api import change_capacity, lock_capacities, transactional_retry
from kandil_hr.recruitment.api import command, save
from kandil_hr.recruitment.models import guard
from kandil_hr.recruitment.priority import score

ACTIVE = ("Approved", "Open", "Partially Filled", "On Hold", "Frozen")


def lifecycle_targets(opening):
	"""Shared domain transitions for execution and read-only portal review."""
	state = opening.custom_kandil_vacancy_state or "Approved"
	if state not in ACTIVE:
		return {}
	targets = {"Close": "Closed", "Cancel": "Cancelled"}
	if state == "Approved":
		targets["Open"] = "Open"
	if state in ("Approved", "Open", "Partially Filled"):
		targets["Hold"] = "On Hold"
	if state != "Frozen":
		targets["Freeze"] = "Frozen"
	if state == "On Hold":
		target = opening.custom_kandil_before_pause or "Approved"
		if target in ("Approved", "Open", "Partially Filled"):
			targets["Resume"] = target
	if state == "Frozen":
		target = opening.custom_kandil_before_freeze or "Approved"
		if target in ("Approved", "Open", "Partially Filled", "On Hold"):
			targets["Unfreeze"] = target
	return targets


def valid_reason(reason):
	if not isinstance(reason, str) or not reason.strip() or len(reason) > 2000:
		frappe.throw(_("Give a reason between 1 and 2000 characters."))


def valid_pin_date(pin_until):
	from datetime import date
	if pin_until in (None, ""):
		return
	if not isinstance(pin_until, str) or len(pin_until) != 10:
		frappe.throw(_("Choose a valid pin expiry date."))
	try:
		value = date.fromisoformat(pin_until)
	except ValueError:
		frappe.throw(_("Choose a valid pin expiry date."))
	if value < getdate(today()):
		frappe.throw(_("A pin requires a reason and a current or future expiry date."))


def require_hr():
	if "Kandil Recruiter" not in frappe.get_roles():
		frappe.throw(_("Only authorized HR recruiters may manage vacancies."), frappe.PermissionError)


def opening_for(doc, name):
	line = next((x for x in doc.lines if x.job_opening == name), None)
	if not line or doc.status != "Approved":
		frappe.throw(_("This vacancy is not part of an open approved request."))
	caps = lock_capacities(doc)
	opening = frappe.get_doc("Job Opening", name, for_update=True)
	from kandil_hr.recruitment.vacancy_access import check_opening
	check_opening(doc, opening)
	return opening, line, caps[line.capacity]


def vacancy_snapshot(opening, request):
	value = {
		k: opening.get(k)
		for k in [
			"name",
			"custom_kandil_vacancy_state",
			"custom_kandil_lead",
			"custom_kandil_pin_until",
			"custom_kandil_pin_reason",
			"custom_kandil_priority_score",
			"status",
			"custom_kandil_started_on",
			"custom_kandil_before_pause",
			"custom_kandil_before_freeze",
		]
	}

	# Explicit shared projection: adding a private child field must never add it
	# to the request audit. Previously stored snapshots remain unchanged.
	value["custom_kandil_team"] = [{"user": row.user} for row in opening.get("custom_kandil_team") or []]

	# The queue computes a live score; the stored field may still be its default
	# before the first pin. Record the same evaluated value the reviewer saw.
	value["custom_kandil_priority_score"] = score(
		request.hr_priority or request.requested_priority,
		opening.custom_kandil_started_on or opening.creation,
		request.required_by,
		opening.custom_kandil_pin_until,
		today(),
		opening.custom_kandil_vacancy_state in ("Approved", "Open", "Partially Filled"),
	)["score"]
	value["requested_priority"] = request.requested_priority
	value["hr_priority"] = request.hr_priority
	return value


def audit(doc, opening, action, reason, initiated_by=None):
	before = vacancy_snapshot(frappe.get_doc("Job Opening", opening.name, for_update=True), doc)
	opening.save(ignore_permissions=True)
	# Vacancy before/after history lives in immutable request revisions, including this snapshot.
	doc.decision_note = frappe.as_json(
		{
			"reason": reason,
			"before": before,
			"after": vacancy_snapshot(opening, doc),
			"initiated_by": initiated_by or frappe.session.user,
		}
	)
	return save(doc, action, doc.decision_note)


@frappe.whitelist(methods=["POST"])
@transactional_retry
def set_state(name, opening_name, action, reason, command_id, expected_version):
	require_hr()

	def act(doc):
		opening, line, cap = opening_for(doc, opening_name)
		state = opening.custom_kandil_vacancy_state or "Approved"
		valid_reason(reason)
		targets = lifecycle_targets(opening)
		if not isinstance(action, str) or action not in targets:
			frappe.throw(_("This action is unavailable for the current vacancy state."))
		if action == "Open":
			from kandil_hr.foundation.teams import effective_lead
			from kandil_hr.foundation.mutation_access import assert_current_request_scope
			if not effective_lead(opening):
				frappe.throw(_("Assign a lead before opening an approved vacancy."))
			assert_current_request_scope(doc, user=opening.custom_kandil_lead, required_roles=("Kandil Recruiter",))
			opening.custom_kandil_started_on = today()
		elif action == "Hold":
			opening.custom_kandil_before_pause = state
		elif action == "Freeze":
			opening.custom_kandil_before_freeze = state
		elif action in ("Close", "Cancel"):
			from kandil_hr.recruitment.guards import resolved_candidates
			resolved_candidates(opening.name)
			remaining = cint(line.approved_qty) - cint(line.joined_qty) - cint(line.closed_qty)
			if remaining < 0:
				frappe.throw(_("The vacancy quantities need reconciliation before closing."))
			change_capacity(cap, opened=-remaining)
			line.closed_qty = cint(line.closed_qty) + remaining
			if all(cint(x.joined_qty) + cint(x.closed_qty) >= cint(x.approved_qty) for x in doc.lines):
				doc.status = "Closed"
		opening.custom_kandil_vacancy_state = targets[action]
		opening.status = (
			"Open" if opening.custom_kandil_vacancy_state in ("Open", "Partially Filled") else "Closed"
		)
		return audit(doc, opening, "Vacancy " + action, reason)

	return command(
		name,
		"vacancy_state",
		command_id,
		expected_version,
		dict(opening=opening_name, action=action, reason=reason),
		act,
	)


def _assign(doc, opening_name, lead, members, reason):
	from kandil_hr.foundation.mutation_access import assert_current_request_scope

	settings = frappe.get_doc("Kandil Organization Settings", doc.company, for_update=True)
	roles = assert_current_request_scope(doc)
	user = frappe.session.user
	allowed = user == "Administrator" or (
		(settings.hr_approver == user and "Kandil Recruiter" in roles)
		or (settings.sector_approver == user and "Kandil Sector Approver" in roles)
	)
	if not allowed:
		frappe.throw(
			_("Only the configured HR or sector authority may assign recruiter teams."),
			frappe.PermissionError,
		)
	opening, _line, _cap = opening_for(doc, opening_name)
	if opening.custom_kandil_vacancy_state not in ACTIVE:
		frappe.throw(_("Cannot assign a closed vacancy."))
	if not lead or not reason.strip():
		frappe.throw(_("A lead and a reason are required."))
	team = list(dict.fromkeys([lead, *members]))
	for user in sorted(team):
		assert_current_request_scope(doc, user=user, required_roles=("Kandil Recruiter",))
	# save() also notifies the requester; lock the entire recipient set in one order.
	for user in sorted(set(team) | {doc.requested_by}):
		frappe.db.sql("SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE", (user,))
	previous = [x.user for x in opening.custom_kandil_team]
	opening.custom_kandil_lead = lead
	opening.set("custom_kandil_team", [{"user": x} for x in team])
	result = audit(doc, opening, "Recruiter team changed", reason)
	from kandil_hr.recruitment.ownership import reconcile_team

	result["application_handoffs"] = reconcile_team(opening, doc, reason)
	from kandil_hr.foundation.outbox import enqueue

	for user in sorted(set(team) - set(previous)):
		enqueue(
			f"{doc.name}:{doc.modified}:team:{user}",
			user,
			_("Vacancy assigned"),
			opening.name,
			"Job Opening",
			opening.name,
		)
	return result


@frappe.whitelist(methods=["POST"])
@transactional_retry
def assign_team(name, opening_name, lead, members, reason, command_id, expected_version):
	require_hr()
	members = frappe.parse_json(members)
	if not isinstance(members, list) or not all(isinstance(x, str) for x in members):
		frappe.throw(_("Recruiter members must be a list of users."))

	def act(doc):
		return _assign(doc, opening_name, lead, members, reason)

	return command(
		name,
		"vacancy_team",
		command_id,
		expected_version,
		dict(opening=opening_name, lead=lead, members=members, reason=reason),
		act,
	)


@frappe.whitelist(methods=["POST"])
@transactional_retry
def pin(name, opening_name, pin_until, reason, command_id, expected_version):
	require_hr()

	def act(doc):
		opening, _line, _cap = opening_for(doc, opening_name)
		valid_reason(reason)
		valid_pin_date(pin_until)
		if opening.custom_kandil_vacancy_state not in ACTIVE:
			frappe.throw(_("Only active or paused vacancies can have a priority pin changed."))
		opening.custom_kandil_pin_until = pin_until or None
		opening.custom_kandil_pin_reason = reason
		opening.custom_kandil_priority_score = score(
			doc.hr_priority or doc.requested_priority,
			opening.custom_kandil_started_on or opening.creation,
			doc.required_by,
			pin_until,
			today(),
			opening.custom_kandil_vacancy_state in ("Approved", "Open", "Partially Filled"),
		)["score"]
		return audit(doc, opening, "Vacancy priority changed", reason)

	return command(
		name,
		"vacancy_pin",
		command_id,
		expected_version,
		dict(opening=opening_name, pin_until=pin_until, reason=reason),
		act,
	)


@frappe.whitelist(methods=["GET"])
def queue(unassigned=0, limit=100, start=0):
	guard()
	limit = max(1, min(cint(limit), 200))
	start = max(0, cint(start))
	rows = []
	requests = {}
	filters = {"custom_kandil_request": ["is", "set"], "custom_kandil_vacancy_state": ["in", list(ACTIVE)]}
	# get_list enforces native query hooks. The parent read check prevents mixed-line scope leaks.
	for opening in frappe.get_list(
		"Job Opening",
		filters=filters,
		fields=[
			"name",
			"custom_kandil_request",
			"custom_kandil_lead",
			"custom_kandil_vacancy_state",
			"custom_kandil_started_on",
			"custom_kandil_pin_until",
			"creation",
		],
		limit_page_length=0,
	):
		opening.doctype = "Job Opening"
		request_name = opening.custom_kandil_request
		if request_name not in requests:
			requests[request_name] = frappe.get_doc("Kandil Hiring Request", request_name)
		doc = requests[request_name]
		if doc.status != "Approved" or not any(line.job_opening == opening.name for line in doc.lines):
			continue
		from kandil_hr.foundation.teams import effective_lead

		lead = effective_lead(opening)
		if cint(unassigned) and lead:
			continue
		if not doc.has_permission("read"):
			continue
		rank = score(
			doc.hr_priority or doc.requested_priority,
			opening.custom_kandil_started_on or opening.creation,
			doc.required_by,
			opening.custom_kandil_pin_until,
			today(),
			opening.custom_kandil_vacancy_state in ("Approved", "Open", "Partially Filled"),
		)
		rows.append(
			dict(
				opening,
				effective_lead=lead,
				assignment_warning=None if lead else _("No active authorized lead; HR assignment required."),
				priority=rank,
				expected_version=str(doc.modified),
			)
		)
	return sorted(rows, key=lambda x: (-x["priority"]["score"], x["name"]))[start : start + limit]


@frappe.whitelist(methods=["GET"])
def actions(opening_name):
	from kandil_hr.recruitment.models import enabled

	if not enabled():
		return {"enabled": False}
	guard()
	opening = frappe.get_doc("Job Opening", opening_name)
	opening.check_permission("read")
	if not opening.get("custom_kandil_request"):
		return {"enabled": False}
	doc = frappe.get_doc("Kandil Hiring Request", opening.custom_kandil_request)
	doc.check_permission("read")
	from kandil_hr.foundation.security import request_scope
	from kandil_hr.foundation.teams import can_manage_team

	return {
		"enabled": True,
		"can_assign": can_manage_team(doc),
		"name": doc.name,
		"expected_version": str(doc.modified),
		"can_manage": doc.status == "Approved"
		and "Kandil Recruiter" in frappe.get_roles()
		and request_scope(doc, frappe.session.user, "manage"),
		"state": opening.custom_kandil_vacancy_state or "Approved",
	}


@frappe.whitelist(methods=["POST"])
@transactional_retry
def bulk_assign(items, lead, members, reason, command_id):
	"""All-or-nothing assignment with a reviewed version for every parent request."""
	require_hr()
	guard()
	items = frappe.parse_json(items)
	members = frappe.parse_json(members)
	if not isinstance(items, list) or not 1 <= len(items) <= 50:
		frappe.throw(_("Select between one and fifty vacancies."))
	if not isinstance(members, list) or not all(isinstance(x, str) for x in members):
		frappe.throw(_("Recruiter members must be a list of users."))
	if not isinstance(command_id, str) or not command_id or len(command_id) > 64:
		frappe.throw(_("A command ID is required."))
	if not isinstance(lead, str) or not lead or not isinstance(reason, str) or not reason.strip():
		frappe.throw(_("A lead and a reason are required."))
	groups = {}
	seen = set()
	for item in items:
		if (
			not isinstance(item, dict)
			or set(item) != {"name", "opening_name", "expected_version"}
			or not all(isinstance(x, str) and x for x in item.values())
		):
			frappe.throw(_("Every selected vacancy needs its request and reviewed version."))
		if item["opening_name"] in seen:
			frappe.throw(_("Select each vacancy only once."))
		seen.add(item["opening_name"])
		groups.setdefault(item["name"], []).append(item)
	# Match the single-command and joining Company-first order across the batch.
	companies = {frappe.db.get_value("Kandil Hiring Request", name, "company") for name in groups}
	if None in companies:
		frappe.throw(_("The request is outside your assigned scope."), frappe.PermissionError)
	for company in sorted(companies):
		frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
	# Lock every parent before any capacity, opening, or notification recipient.
	docs = {}
	for name in sorted(groups):
		doc = frappe.get_doc("Kandil Hiring Request", name, for_update=True)
		doc.check_permission("read")
		if not request_scope(doc, frappe.session.user, "manage"):
			frappe.throw(_("The request is outside your assigned scope."), frappe.PermissionError)
		versions = {x["expected_version"] for x in groups[name]}
		if len(versions) != 1:
			frappe.throw(_("Selected vacancies from one request must use the same reviewed version."))
		if any(x["opening_name"] not in {line.job_opening for line in doc.lines} for x in groups[name]):
			frappe.throw(_("This vacancy is not part of an open approved request."))
		docs[name] = doc
	# Prelock shared resources globally to keep bulk operations in a deterministic order.
	for name in sorted({d.requested_position for d in docs.values() if d.requested_position}):
		frappe.db.sql("SELECT name FROM `tabKandil Position` WHERE name=%s FOR UPDATE", (name,))
	caps = sorted({x.capacity for doc in docs.values() for x in doc.lines})
	for name in caps:
		frappe.db.sql("SELECT name FROM `tabKandil Capacity` WHERE name=%s FOR UPDATE", (name,))
	for name in sorted(seen):
		frappe.db.sql("SELECT name FROM `tabJob Opening` WHERE name=%s FOR UPDATE", (name,))
	for user in sorted(
		set([lead, *members, frappe.session.user])
		| {d.requested_by for d in docs.values()}
		| {s.principal for d in docs.values() for s in d.approval_steps if s.principal}
	):
		frappe.db.sql("SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE", (user,))
	payload = dict(
		items=sorted(items, key=lambda x: x["opening_name"]), lead=lead, members=members, reason=reason
	)
	point = "kandil_bulk_assignment"
	frappe.db.savepoint(point)
	try:
		result = []
		for name in sorted(groups):

			def act(doc):
				assigned = []
				handoffs = []
				for item in sorted(groups[doc.name], key=lambda x: x["opening_name"]):
					# Internal handler: one receipt represents the complete reviewed batch.
					change = _assign(doc, item["opening_name"], lead, members, reason)
					handoffs.append(
						dict(opening=item["opening_name"], applications=change["application_handoffs"])
					)
					assigned.append(item["opening_name"])
				return dict(
					name=doc.name,
					openings=assigned,
					application_handoffs=handoffs,
					modified=str(doc.modified),
				)

			result.append(
				command(
					name, "bulk_vacancy_team", command_id, groups[name][0]["expected_version"], payload, act
				)
			)
		return result
	except frappe.QueryDeadlockError:
		# MariaDB already rolled back the whole transaction; outer retry owns recovery.
		raise
	except Exception:
		frappe.db.rollback(save_point=point)
		frappe.local.document_cache = {}
		raise
