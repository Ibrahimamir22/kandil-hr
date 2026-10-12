"""Versioned native HR actions. All command effects share one Frappe transaction."""

import hashlib
import json
import uuid

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, getdate

from kandil_hr.foundation.clock import now_cairo
from kandil_hr.foundation.clock import today_cairo as today


def now_datetime():
	# Frappe stores site-local naive datetimes; the business clock is explicitly Cairo.
	return now_cairo().replace(tzinfo=None)


from kandil_hr.pilot.api import can_act, change_capacity, lock_capacities, transactional_retry, transition
from kandil_hr.recruitment.models import guard

ROLES = {
	"Headcount Exception": "Kandil Sector Approver",
	"Department Approval": "Kandil Approver",
	"Sector Approval": "Kandil Sector Approver",
	"HR Approval": "Kandil Recruiter",
	"CEO Approval": "Kandil CEO Approver",
	"Board Approval": "Kandil Board Approver",
}


def dump(value):
	return json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)


def command(name, operation, command_id, expected_version, payload, handler):
	guard()
	if not command_id or len(command_id) > 100 or not expected_version:
		frappe.throw(_("A command ID and reviewed record version are required."))
	# All recruitment writes share the organization/joining Company-first order.
	company = frappe.db.get_value("Kandil Hiring Request", name, "company")
	frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
	parent_name = frappe.db.get_value("Kandil Hiring Request", name, "amends")
	if parent_name:
		frappe.db.sql("SELECT name FROM `tabKandil Hiring Request` WHERE name=%s FOR UPDATE", (parent_name,))
	doc = frappe.get_doc("Kandil Hiring Request", name, for_update=True)
	doc.check_permission("read")
	from kandil_hr.foundation.security import request_scope

	if not request_scope(doc, frappe.session.user, "manage"):
		frappe.throw(_("The request is outside your assigned scope."), frappe.PermissionError)
	# Domain locks precede current User/role/grant checks. Lock known recipients
	# together so approval notifications do not reverse the account lock order.
	lock_capacities(doc)
	for opening_name in sorted({x.job_opening for x in doc.lines if x.job_opening}):
		frappe.db.sql("SELECT name FROM `tabJob Opening` WHERE name=%s FOR UPDATE", (opening_name,))
	users = {frappe.session.user, doc.requested_by} | {s.principal for s in doc.approval_steps if s.principal}
	if payload.get("lead"):
		users.add(payload["lead"])
	members = payload.get("members") or []
	if isinstance(members, list):
		users.update(x for x in members if isinstance(x, str))
	for user in sorted(users):
		frappe.db.sql("SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE", (user,))
	from kandil_hr.foundation.mutation_access import assert_current_request_scope

	hr_operations = {
		"review",
		"send_to_ceo",
		"vacancy_state",
		"vacancy_team",
		"bulk_vacancy_team",
		"vacancy_pin",
	}
	roles = (
		("Kandil Recruiter",)
		if operation in hr_operations
		else tuple(set(ROLES.values()) | {"Kandil Requester"})
	)
	if operation == "amend" and doc.requested_by != frappe.session.user:
		roles = ("Kandil Recruiter",)
	if operation == "cancel" and doc.requested_by != frappe.session.user:
		roles = ("Kandil Recruiter", "Kandil Sector Approver")
	assert_current_request_scope(doc, required_roles=roles)
	key = hashlib.sha256(f"{frappe.session.user}|{name}|{command_id}".encode()).hexdigest()
	digest = hashlib.sha256(dump([operation, payload, str(expected_version)]).encode()).hexdigest()
	# Current locking read: a snapshot established before waiting for the request
	# lock must still see the receipt committed by the preceding command.
	receipts = frappe.db.sql(
		"SELECT payload_hash,result_json FROM `tabKandil Command Receipt` WHERE name=%s FOR UPDATE",
		(key,),
		as_dict=True,
	)
	prior = receipts[0] if receipts else None

	if prior:
		if prior.payload_hash != digest:
			frappe.throw(_("Command ID was already used with different data."))
		return json.loads(prior.result_json)
	if get_datetime(doc.modified) != get_datetime(expected_version):
		frappe.throw(_("This record changed. Reload it before deciding."), frappe.TimestampMismatchError)
	with transition():
		result = handler(doc)
		frappe.get_doc(
			dict(
				doctype="Kandil Command Receipt",
				dedupe_key=key,
				request=name,
				actor=frappe.session.user,
				payload_hash=digest,
				result_json=dump(result),
			)
		).insert(ignore_permissions=True)
		return result


def snapshot_payload(doc):
	from kandil_hr.recruitment.privacy import shared_snapshot

	return shared_snapshot(doc)


def snapshot(doc, action):
	from kandil_hr.pilot.api import event

	frappe.get_doc(
		dict(
			doctype="Kandil Request Revision",
			request=doc.name,
			company=doc.company,
			department=doc.department,
			revision=doc.revision,
			action=action,
			actor=frappe.session.user,
			snapshot_json=dump(snapshot_payload(doc)),
		)
	).insert(ignore_permissions=True)
	event(doc, action, doc.decision_note or "")


def save(doc, action, note=""):
	doc.decision_note = note
	doc.save(ignore_permissions=True)
	snapshot(doc, action)
	from kandil_hr.foundation.outbox import enqueue

	step = next((x for x in doc.approval_steps if x.decision == "Pending"), None)
	recipients = {doc.requested_by}
	if step and doc.status == "Pending":
		recipients.add(step.principal)
	for user in sorted(recipients):
		enqueue(
			f"{doc.name}:{doc.modified}:{action}:{user}",
			user,
			_("Recruitment request updated"),
			f"{doc.name}: {_(action)}",
			"Kandil Hiring Request",
			doc.name,
		)
	return doc.as_dict()


def route_config(doc):
	# Consume current locking reads after submission waits for Company; an earlier
	# consistent snapshot must not retain superseded route authorities.
	from kandil_hr.organization.current import rows

	names = rows(
		"Kandil Recruitment Route",
		filters={"company": doc.company, "department": doc.department, "enabled": 1},
		pluck="name",
	)
	if len(names) != 1:
		frappe.throw(_("Configure one enabled recruitment route for this department."))
	config = frappe.get_doc("Kandil Recruitment Route", names[0], for_update=True)
	settings = frappe.get_doc("Kandil Organization Settings", doc.company, for_update=True)
	for key, source in [
		("hr_approver", "hr_approver"),
		("exception_approver", "sector_approver"),
		("ceo_approver", "ceo_approver"),
		("board_approver", "board_approver"),
	]:
		principal = settings.get(source)
		if config.get(key) and config.get(key) != principal:
			frappe.throw(_("Recruitment authorities must match the company organization settings."))
		config.set(key, principal)
	return config


def resolve_chain(doc, excess):
	from kandil_hr.organization.api import resolve_route
	from kandil_hr.organization.current import rows

	config = route_config(doc)
	resolved = resolve_route(doc.company, doc.department, doc.requested_position, today())
	chain = [(s["principal"], s["authority"], s.get("position")) for s in resolved["steps"]]
	if not any(a == "HR Approval" for _, a, _ in chain):
		chain.append((config.hr_approver, "HR Approval", None))
	if excess:
		authority = config.exception_approver
		if authority == doc.requested_by:
			if not config.ceo_approver:
				frappe.throw(_("Personal headcount exceptions require an independent CEO authority."))
			chain.insert(0, (config.ceo_approver, "CEO Approval", None))
		else:
			chain.insert(0, (authority, "Headcount Exception", None))
	if config.ceo_for_critical and doc.requested_priority == "Critical":
		chain.append((config.ceo_approver, "CEO Approval", None))
	for rule in rows(
		"Kandil Authority Rule",
		filters={"company": doc.company, "enabled": 1},
		fields=["*"],
		order_by="creation asc",
	):
		if rule.department and rule.department != doc.department:
			continue
		if rule.position and rule.position != doc.requested_position:
			continue
		if getdate(rule.from_date) > getdate(today()) or (
			rule.to_date and getdate(rule.to_date) < getdate(today())
		):
			continue
		if not any(p == rule.principal and a == rule.authority for p, a, _ in chain):
			chain.append((rule.principal, rule.authority, None))
	if config.board_after_ceo and any(a == "CEO Approval" for _, a, _ in chain):
		chain.append((config.board_approver, "Board Approval", None))
	# Preserve distinct authority steps even when a principal repeats.
	filtered = []
	skips = []
	for principal, authority, position in chain:
		if principal == doc.requested_by:
			if authority in ("CEO Approval", "Board Approval", "Headcount Exception"):
				frappe.throw(_("Configure an independent authority for this personal request."))
			skips.append(dict(principal=principal, authority=authority, reason="Requester self-approval"))
			continue
		if (
			not principal
			or not frappe.db.get_value("User", principal, "enabled")
			or ROLES.get(authority) not in frappe.get_roles(principal)
		):
			frappe.throw(_("Approval authority is missing, disabled or has the wrong role."))
		filtered.append((principal, authority, position))
	if not filtered:
		frappe.throw(_("At least one independent approval is required."))
	doc.route_snapshot = dump({"resolved": resolved, "skipped": skips, "config": config.name})
	return filtered


def parent_for(doc):
	if not doc.amends:
		return None
	parent = frappe.get_doc("Kandil Hiring Request", doc.amends, for_update=True)
	parent.check_permission("read")
	if any(cint(x.closed_qty) for x in parent.lines):
		frappe.throw(_("Closed locations require a new recruitment request."))
	if parent.status not in ("Approved", "Filled"):
		frappe.throw(_("The original request must be approved."))
	if get_datetime(parent.modified) != get_datetime(doc.baseline_modified):
		frappe.throw(_("The original request changed. Return and refresh this amendment."))
	return parent


@frappe.whitelist(methods=["POST"])
@transactional_retry
def submit_request(name, command_id, expected_version):
	def act(doc):
		if doc.requested_by != frappe.session.user or doc.status != "Draft":
			frappe.throw(_("Only the requester can submit this draft."), frappe.PermissionError)
		parent = parent_for(doc)
		caps = lock_capacities(doc)
		old = {x.capacity: x for x in parent.lines} if parent else {}
		config = route_config(doc)
		excess = False
		for line in doc.lines:
			if parent and line.capacity not in old:
				frappe.throw(_("Amendment locations must match the original request."))
			if parent and cint(line.requested_qty) < cint(old[line.capacity].joined_qty):
				frappe.throw(_("Quantity cannot be lower than actual joiners."))
			line.proposed_qty = cint(line.requested_qty)
			line.reserved_qty = max(
				0, line.proposed_qty - (cint(old[line.capacity].approved_qty) if parent else 0)
			)
			excess = excess or (line.reserved_qty > 0 and line.reserved_qty > caps[line.capacity].available)
		if excess and not (doc.exception_reason or "").strip():
			frappe.throw(_("Headcount exception requires a justification."))
		if excess and config.headcount_mode == "Block":
			frappe.throw(_("Headcount blocking is enabled. Adjust capacity or requested quantity."))
		chain = resolve_chain(doc, excess)
		from kandil_hr.organization.occupancy import capture_basis

		capture_basis(doc, caps)
		doc.set("approval_steps", [])
		for i, (principal, authority, position) in enumerate(chain):
			doc.append(
				"approval_steps",
				dict(
					principal=principal,
					authority=authority,
					authority_position=position,
					decision="Pending",
					step_key=uuid.uuid4().hex,
					waiting_since=now_datetime() if i == 0 else None,
				),
			)
		doc.needs_exception = int(excess)
		doc.submitted_snapshot = dump(snapshot_payload(doc))
		for line in doc.lines:
			change_capacity(caps[line.capacity], reserved=line.reserved_qty)
		doc.status = "Pending"
		return save(doc, "Submitted")

	return command(name, "submit", command_id, expected_version, {}, act)


def finalize(doc, caps):
	parent = parent_for(doc)
	target = parent or doc
	target.status = "Approved"
	old = {x.capacity: x for x in target.lines}
	for line in doc.lines:
		destination = old[line.capacity]
		qty = cint(line.proposed_qty)
		previous = cint(destination.approved_qty) if parent else 0
		if qty < cint(destination.joined_qty):
			frappe.throw(_("Quantity cannot be lower than actual joiners."))
		change_capacity(caps[line.capacity], reserved=-cint(line.reserved_qty), opened=qty - previous)
		line.reserved_qty = 0
		destination.approved_qty = qty
		if destination.job_opening:
			opening = frappe.get_doc("Job Opening", destination.job_opening, for_update=True)
			opening.vacancies = qty
			if qty <= cint(destination.joined_qty):
				opening.status = "Closed"
				opening.custom_kandil_vacancy_state = "Closed"
			elif opening.custom_kandil_vacancy_state == "Closed" and previous == cint(destination.joined_qty):
				opening.custom_kandil_vacancy_state = "Approved"
				opening.status = "Open"
			# Increasing/reducing quantity never resumes a held/frozen/preparation vacancy.
			# The explicit lifecycle action remains the only way to reopen recruitment.
			opening.save(ignore_permissions=True)
		elif qty:
			cap = caps[line.capacity]
			opening = frappe.get_doc(
				dict(
					doctype="Job Opening",
					job_title=f"{cap.designation} — {cap.branch} — {target.name}",
					designation=cap.designation,
					company=doc.company,
					department=doc.department,
					location=cap.branch,
					status="Open",
					vacancies=qty,
					publish=0,
					currency="EGP",
					prevent_duplicate_applicant=1,
					custom_kandil_request=target.name,
					custom_kandil_capacity=cap.name,
					custom_kandil_vacancy_state="Approved",
				)
			).insert(ignore_permissions=True)
			destination.job_opening = opening.name
	target.status = (
		"Filled" if all(cint(x.joined_qty) >= cint(x.approved_qty) for x in target.lines) else "Approved"
	)
	if parent:
		save(parent, "Amendment applied", doc.name)
		doc.status = "Applied"


@frappe.whitelist(methods=["POST"])
@transactional_retry
def decide(name, decision, step_id, command_id, expected_version, comment="", board_evidence=None):
	def act(doc):
		if decision not in ("Approve", "Reject", "Return"):
			frappe.throw(_("Choose Approve, Reject or Return."))
		step = next((s for s in doc.approval_steps if s.decision == "Pending"), None)
		if doc.status != "Pending" or not step or step.step_key != step_id:
			frappe.throw(_("This is no longer the active approval step."))
		from kandil_hr.foundation.mutation_access import assert_current_request_scope
		from kandil_hr.organization.current import rows

		principal_roles = assert_current_request_scope(
			doc, user=step.principal, required_roles=(ROLES.get(step.authority),)
		)
		if frappe.session.user != step.principal:
			assert_current_request_scope(doc, required_roles=("Kandil Approver",))
			delegations = rows(
				"Kandil Delegation",
				filters={
					"from_user": step.principal,
					"to_user": frappe.session.user,
					"company": doc.company,
					"department": doc.department,
					"revoked": 0,
					"from_date": ["<=", today()],
					"to_date": [">=", today()],
				},
				fields=["name"],
			)
			if not delegations or {"Kandil CEO Approver", "Kandil Board Approver"}.intersection(
				principal_roles
			):
				frappe.throw(_("You are not the active independent authority."), frappe.PermissionError)
		if not can_act(doc, step.principal) or ROLES.get(step.authority) not in principal_roles:
			frappe.throw(_("You are not the active independent authority."), frappe.PermissionError)
		if decision != "Approve" and not comment.strip():
			frappe.throw(_("A reason is required."))
		if step.authority == "Board Approval" and frappe.session.user != step.principal:
			evidence = frappe.get_doc("File", board_evidence) if board_evidence else None
			if (
				not evidence
				or not evidence.is_private
				or evidence.attached_to_doctype != doc.doctype
				or evidence.attached_to_name != doc.name
			):
				frappe.throw(
					_("Board decisions on behalf require private evidence attached to this request.")
				)
			evidence.check_permission("read")
		caps = lock_capacities(doc)
		if decision == "Approve":
			from kandil_hr.organization.occupancy import assert_approval

			assert_approval(doc, caps)
		step.reviewed_snapshot = dump(snapshot_payload(doc))
		step.actor = frappe.session.user
		step.decided_at = now_datetime()
		step.comment = comment
		step.board_evidence = board_evidence if step.authority == "Board Approval" else None
		step.decision = {"Approve": "Approved", "Reject": "Rejected", "Return": "Returned"}[decision]
		if decision != "Approve":
			for line in doc.lines:
				change_capacity(caps[line.capacity], reserved=-cint(line.reserved_qty))
				line.reserved_qty = 0
			doc.status = "Returned" if decision == "Return" else "Rejected"
		elif all(s.decision == "Approved" for s in doc.approval_steps):
			finalize(doc, caps)
		else:
			next(s for s in doc.approval_steps if s.decision == "Pending").waiting_since = now_datetime()
		return save(doc, decision, comment)

	return command(
		name,
		"decide",
		command_id,
		expected_version,
		dict(decision=decision, step_id=step_id, comment=comment, board_evidence=board_evidence),
		act,
	)


@frappe.whitelist(methods=["POST"])
@transactional_retry
def revise(name, command_id, expected_version, reason):
	def act(doc):
		if doc.status != "Returned" or doc.requested_by != frappe.session.user:
			frappe.throw(_("Only the requester can revise a returned request."), frappe.PermissionError)
		if not reason.strip():
			frappe.throw(_("A reason is required."))
		snapshot(doc, "Revision source")
		doc.status = "Draft"
		doc.revision = cint(doc.revision) + 1
		doc.set("approval_steps", [])
		doc.submitted_snapshot = None
		doc.route_snapshot = None
		doc.needs_exception = 0
		for line in doc.lines:
			line.proposed_qty = 0
			line.reserved_qty = 0
		if doc.amends:
			doc.baseline_modified = frappe.db.get_value("Kandil Hiring Request", doc.amends, "modified")
		save(doc, "Revised", reason)
		# Draft validation protects transition-only metadata; retain reason in history only.
		doc.decision_note = None
		doc.save(ignore_permissions=True)
		return doc.as_dict()

	return command(name, "revise", command_id, expected_version, {"reason": reason}, act)


@frappe.whitelist(methods=["POST"])
@transactional_retry
def review(name, command_id, expected_version, quantities, priority, reason):
	quantities = frappe.parse_json(quantities)

	def act(doc):
		step = next((s for s in doc.approval_steps if s.decision == "Pending"), None)
		if (
			doc.status != "Pending"
			or not step
			or step.authority != "HR Approval"
			or not can_act(doc, step.principal)
			or "Kandil Recruiter" not in frappe.get_roles(step.principal)
		):
			frappe.throw(_("Only the active HR authority may review quantities."), frappe.PermissionError)
		if not reason.strip() or priority not in ("Normal", "Important", "Critical"):
			frappe.throw(_("Select a valid priority and enter a reason."))
		caps = lock_capacities(doc)
		for line in doc.lines:
			if line.name not in quantities:
				continue
			from kandil_hr.pilot.models import integer

			qty = integer(quantities[line.name])
			if qty > cint(line.proposed_qty):
				frappe.throw(_("Increases require a returned revision."))
			baseline = cint(line.proposed_qty) - cint(line.reserved_qty)
			new_reserved = max(0, qty - baseline)
			change_capacity(caps[line.capacity], reserved=new_reserved - cint(line.reserved_qty))
			line.proposed_qty = qty
			line.reserved_qty = new_reserved
		if not doc.amends and not any(x.proposed_qty for x in doc.lines):
			frappe.throw(_("Reject the request instead of approving zero positions."))
		doc.hr_priority = priority
		return save(doc, "HR review", reason)

	return command(
		name,
		"review",
		command_id,
		expected_version,
		dict(quantities=quantities, priority=priority, reason=reason),
		act,
	)


@frappe.whitelist(methods=["POST"])
@transactional_retry
def send_to_ceo(name, command_id, expected_version, reason):
	def act(doc):
		step = next((s for s in doc.approval_steps if s.decision == "Pending"), None)
		if (
			doc.status != "Pending"
			or not step
			or step.authority != "HR Approval"
			or not can_act(doc, step.principal)
			or "Kandil Recruiter" not in frappe.get_roles(step.principal)
		):
			frappe.throw(_("Only the active HR authority can route to the CEO."), frappe.PermissionError)
		principal = route_config(doc).ceo_approver
		if (
			not principal
			or principal == doc.requested_by
			or "Kandil CEO Approver" not in frappe.get_roles(principal)
		):
			frappe.throw(_("Configure an independent CEO authority."))
		if not reason.strip():
			frappe.throw(_("A reason is required."))
		if any(s.authority == "CEO Approval" and s.decision == "Pending" for s in doc.approval_steps):
			frappe.throw(_("A CEO approval is already pending."))
		doc.append(
			"approval_steps",
			dict(
				principal=principal, authority="CEO Approval", decision="Pending", step_key=uuid.uuid4().hex
			),
		)
		return save(doc, "Routed to CEO", reason)

	return command(name, "send_to_ceo", command_id, expected_version, {"reason": reason}, act)


@frappe.whitelist(methods=["POST"])
@transactional_retry
def amend(name, command_id, expected_version, reason):
	def act(doc):
		if doc.status not in ("Approved", "Filled") or doc.amends:
			frappe.throw(_("Only an approved original request can be amended."))
		if doc.requested_by != frappe.session.user and "Kandil Recruiter" not in frappe.get_roles():
			frappe.throw(_("Only the requester or HR may propose an amendment."), frappe.PermissionError)
		if not reason.strip():
			frappe.throw(_("A reason is required."))
		if frappe.db.exists(
			"Kandil Hiring Request", {"amends": doc.name, "status": ["in", ["Draft", "Pending", "Returned"]]}
		):
			frappe.throw(_("An active amendment already exists."))
		fields = [
			"company",
			"department",
			"requested_position",
			"employment_type",
			"required_by",
			"qualifications",
			"skills_required",
			"experience_required",
			"working_conditions",
			"requested_priority",
			"need_reason",
			"replacement_employee",
		]
		values = {k: doc.get(k) for k in fields}
		amended = frappe.get_doc(
			dict(
				doctype=doc.doctype,
				**values,
				title=_("Amendment: {0}").format(doc.title),
				request_kind="Amendment",
				amends=doc.name,
				baseline_modified=str(doc.modified),
				revision=1,
				exception_reason=reason,
				lines=[dict(capacity=x.capacity, requested_qty=x.approved_qty) for x in doc.lines],
			)
		).insert(ignore_permissions=True)
		snapshot(amended, "Amendment created")
		return dict(name=amended.name, amends=doc.name)

	return command(name, "amend", command_id, expected_version, {"reason": reason}, act)


@frappe.whitelist(methods=["POST"])
@transactional_retry
def cancel_request(name, command_id, expected_version, reason):
	def act(doc):
		if not reason.strip():
			frappe.throw(_("A reason is required."))
		if doc.requested_by != frappe.session.user and "Kandil Recruiter" not in frappe.get_roles():
			frappe.throw(_("Only the requester or HR may cancel."), frappe.PermissionError)
		if doc.status not in ("Draft", "Returned", "Pending", "Approved"):
			frappe.throw(_("This request cannot be cancelled."))
		if frappe.db.exists(
			doc.doctype, {"amends": doc.name, "status": ["in", ["Draft", "Pending", "Returned"]]}
		):
			frappe.throw(_("Resolve the active amendment before cancelling."))
		caps = lock_capacities(doc)
		if doc.status == "Approved":
			from kandil_hr.recruitment.guards import resolved_candidates

			for line in doc.lines:
				if line.job_opening:
					frappe.get_doc("Job Opening", line.job_opening, for_update=True)
					resolved_candidates(line.job_opening)
		for line in doc.lines:
			if doc.status == "Pending":
				change_capacity(caps[line.capacity], reserved=-cint(line.reserved_qty))
				line.reserved_qty = 0
			elif doc.status == "Approved":
				remaining = cint(line.approved_qty) - cint(line.joined_qty) - cint(line.closed_qty)
				change_capacity(caps[line.capacity], opened=-remaining)
				line.closed_qty = cint(line.closed_qty) + remaining
				if line.job_opening:
					opening = frappe.get_doc("Job Opening", line.job_opening, for_update=True)
					opening.status = "Closed"
					opening.custom_kandil_vacancy_state = "Cancelled"
					opening.save(ignore_permissions=True)
		doc.status = "Cancelled"
		return save(doc, "Cancelled", reason)

	return command(name, "cancel", command_id, expected_version, {"reason": reason}, act)
