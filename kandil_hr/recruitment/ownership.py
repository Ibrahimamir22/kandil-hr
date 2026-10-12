"""Application accountability and disabled-account handoff, parity only.

Reference Referrals.gs: active team actor defaults as owner, otherwise the lead;
owner/lead/HR may hand over to an active team member. Services.gs clears owner
and Next_Action_Owner on deactivation. The explicit HR unassigned queue is a
fallback, never a guessed replacement user. Generic native ToDo is outside this
application-next-action contract.
"""

import hashlib
import json
import uuid
from contextlib import contextmanager
from functools import partial

import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import CallbackManager, cint, get_datetime, getdate

from kandil_hr.foundation.clock import now_cairo
from kandil_hr.foundation.mutation_access import assert_current_request_scope
from kandil_hr.foundation.security import request_scope
from kandil_hr.pilot.api import transactional_retry, transition
from kandil_hr.recruitment.models import enabled, guard

FIELDS = (
	"custom_kandil_responsible_user",
	"custom_kandil_next_action_owner",
	"custom_kandil_ownership_state",
	"custom_kandil_ownership_reason",
	"custom_kandil_ownership_history",
	"custom_kandil_next_action",
	"custom_kandil_next_action_due",
)
ACTIVE = ("Approved", "Open", "Partially Filled", "On Hold", "Frozen")


def install_ownership_fields():
	if not enabled():
		return
	fields = [
		("custom_kandil_responsible_user", "Responsible Recruiter", "Link", "User"),
		("custom_kandil_next_action_owner", "Next Action Owner", "Link", "User"),
		("custom_kandil_ownership_state", "Recruitment Ownership", "Select", "Assigned\nUnassigned"),
		("custom_kandil_ownership_reason", "Ownership Routing Reason", "Small Text", None),
		("custom_kandil_ownership_history", "Ownership History", "Long Text", None),
		("custom_kandil_next_action", "Recruitment Next Action", "Small Text", None),
		("custom_kandil_next_action_due", "Next Action Due", "Date", None),
	]
	create_custom_fields(
		{
			"Job Applicant": [
				dict(fieldname=name, label=label, fieldtype=kind, options=options, read_only=1, no_copy=1)
				for name, label, kind, options in fields
			]
		}
	)


@contextmanager
def effect():
	old = frappe.flags.get("kandil_ownership_effect")
	frappe.flags.kandil_ownership_effect = True
	try:
		yield
	finally:
		frappe.flags.kandil_ownership_effect = old


def live(app, current=False):
	if app.status == "Rejected":
		return False
	rows = (
		frappe.db.sql(
			"SELECT custom_kandil_outcome FROM `tabJob Offer` WHERE job_applicant=%s AND docstatus<2"
			+ (" FOR UPDATE" if current else ""),
			(app.name,),
			as_dict=True,
		)
		if not app.is_new()
		else []
	)
	return not rows or any(
		row.custom_kandil_outcome not in ("Joined", "No Show", "Withdrawn") for row in rows
	)


def team_users(opening):
	return {row.user for row in opening.get("custom_kandil_team") or []} | {opening.get("custom_kandil_lead")}


def effective_owner(app, opening, request, field="custom_kandil_responsible_user"):
	user = app.get(field)
	return (
		user
		if user
		and user in team_users(opening)
		and frappe.db.get_value("User", user, "enabled")
		and "Kandil Recruiter" in frappe.get_roles(user)
		and request_scope(request, user, "manage")
		else None
	)


def require_owner(user, opening, request):
	if not user or user not in team_users(opening):
		frappe.throw(_("The responsible recruiter must belong to the vacancy team."), frappe.PermissionError)
	assert_current_request_scope(request, user=user, required_roles=("Kandil Recruiter",))


def append_history(app, action, reason, before, actor=None, audit_context=None):
	history = json.loads(app.get("custom_kandil_ownership_history") or "[]")
	history.append(
		dict(
			action=action,
			reason=reason,
			actor=actor or frappe.session.user,
			at=now_cairo().isoformat(),
			before=before,
			after={field: app.get(field) for field in FIELDS if field != "custom_kandil_ownership_history"},
			**({"invocation": audit_context} if audit_context else {}),
		)
	)
	app.custom_kandil_ownership_history = frappe.as_json(history)


def values(app):
	return {field: app.get(field) for field in FIELDS if field != "custom_kandil_ownership_history"}


def validate_applicant(app, method=None):
	if not enabled() or not app.job_title:
		return
	opening = frappe.get_doc("Job Opening", app.job_title)
	if not opening.get("custom_kandil_request"):
		return
	old = app.get_doc_before_save()
	if frappe.flags.get("kandil_ownership_effect"):
		return
	if old:
		if any((app.get(field) or "") != (old.get(field) or "") for field in FIELDS):
			frappe.throw(
				_("Application ownership and next actions are managed by authorized commands."),
				frappe.PermissionError,
			)
		return
	if any(app.get(field) for field in FIELDS if field != "custom_kandil_ownership_state") or app.get(
		"custom_kandil_ownership_state"
	) not in (None, "", "Assigned"):
		# Frappe supplies the first Select option even when the client omitted it.
		# It conveys no authority: the server overwrites the state below.
		frappe.throw(_("Initial application ownership is assigned by the server."), frappe.PermissionError)
	company = frappe.db.get_value("Kandil Hiring Request", opening.custom_kandil_request, "company")
	frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
	request = frappe.get_doc("Kandil Hiring Request", opening.custom_kandil_request, for_update=True)
	opening = frappe.get_doc("Job Opening", opening.name, for_update=True)
	actor = frappe.session.user
	owner = actor if actor in team_users(opening) else opening.custom_kandil_lead
	if owner:
		require_owner(owner, opening, request)
	app.custom_kandil_responsible_user = owner
	app.custom_kandil_ownership_state = "Assigned" if owner else "Unassigned"
	app.custom_kandil_ownership_reason = (
		_("Vacancy team default owner.") if owner else _("No authorized recruiter; HR assignment required.")
	)
	append_history(app, "Created", app.custom_kandil_ownership_reason, {})


def current_manager(request):
	roles = assert_current_request_scope(request, required_roles=("Kandil Recruiter",))
	if frappe.session.user == "Administrator":
		return True
	settings = frappe.get_doc("Kandil Organization Settings", request.company, for_update=True)
	return settings.hr_approver == frappe.session.user and "Kandil Recruiter" in roles


def authorize_application(app, opening, request):
	app.check_permission("write")
	manager = current_manager(request)
	if not manager and frappe.session.user not in (
		app.custom_kandil_responsible_user,
		opening.custom_kandil_lead,
	):
		frappe.throw(
			_(
				"Only the responsible recruiter, vacancy lead or configured HR authority may hand over this application."
			),
			frappe.PermissionError,
		)


def store(
	app, owner, reason, action, *, next_owner=None, task=None, due=None, actor=None, audit_context=None
):
	before = values(app)
	app.custom_kandil_responsible_user = owner or None
	if next_owner is not None:
		app.custom_kandil_next_action_owner = next_owner or None
	if task is not None:
		app.custom_kandil_next_action = task or None
		app.custom_kandil_next_action_due = due or None
	app.custom_kandil_ownership_state = "Assigned" if owner else "Unassigned"
	app.custom_kandil_ownership_reason = reason
	append_history(app, action, reason, before, actor, audit_context)
	with transition(), effect():
		app.save(ignore_permissions=True)
	return dict(
		name=app.name,
		owner=app.custom_kandil_responsible_user,
		next_action_owner=app.custom_kandil_next_action_owner,
		modified=str(app.modified),
		ownership_state=app.custom_kandil_ownership_state,
	)


def application_command(name, operation, command_id, expected_version, application_version, payload, handler):
	from kandil_hr.recruitment.api import command

	opening_name = frappe.db.get_value("Job Applicant", name, "job_title")
	request_name = (
		frappe.db.get_value("Job Opening", opening_name, "custom_kandil_request") if opening_name else None
	)
	if not request_name:
		frappe.throw(_("This application has no managed vacancy."), frappe.PermissionError)
	payload = dict(payload, application=name, application_version=str(application_version))

	def act(request):
		opening = frappe.get_doc("Job Opening", opening_name, for_update=True)
		app = frappe.get_doc("Job Applicant", name, for_update=True)
		if app.job_title != opening.name or opening.custom_kandil_request != request.name:
			frappe.throw(_("The application no longer belongs to this vacancy."))
		authorize_application(app, opening, request)
		if not application_version or get_datetime(app.modified) != get_datetime(application_version):
			frappe.throw(
				_("This application changed. Reload before assigning it."), frappe.TimestampMismatchError
			)
		if (
			request.status != "Approved"
			or opening.custom_kandil_vacancy_state not in ACTIVE
			or not live(app, current=True)
		):
			frappe.throw(_("Only an active application can be assigned."))
		return handler(app, opening, request)

	return command(request_name, operation, command_id, expected_version, payload, act)


def reason_text(reason):
	if not isinstance(reason, str) or not 3 <= len(reason.strip()) <= 2000:
		frappe.throw(_("An assignment reason of 3 to 2000 characters is required."))
	return reason.strip()


@frappe.whitelist(methods=["POST"])
@transactional_retry
def assign_application(name, owner, reason, command_id, expected_version, application_version):
	guard()
	reason = reason_text(reason)

	def act(app, opening, request):
		require_owner(owner, opening, request)
		if owner == app.custom_kandil_responsible_user:
			frappe.throw(_("This recruiter is already responsible for the application."))
		result = store(app, owner, reason, "Owner reassigned")
		notify_assignment(app, opening, owner)
		return result

	return application_command(
		name,
		"application_owner",
		command_id,
		expected_version,
		application_version,
		dict(owner=owner, reason=reason),
		act,
	)


@frappe.whitelist(methods=["POST"])
@transactional_retry
def set_next_action(name, task, due, owner, reason, command_id, expected_version, application_version):
	guard()
	reason = reason_text(reason)
	if not isinstance(task, str) or len(task) > 1000:
		frappe.throw(_("A next action must contain at most 1000 characters."))
	due = str(getdate(due)) if due else None

	def act(app, opening, request):
		if task.strip():
			require_owner(owner, opening, request)
		return store(
			app,
			app.custom_kandil_responsible_user,
			reason,
			"Next action updated",
			next_owner=owner if task.strip() else "",
			task=task.strip(),
			due=due if task.strip() else None,
		)

	return application_command(
		name,
		"application_task",
		command_id,
		expected_version,
		application_version,
		dict(task=task, due=due, owner=owner, reason=reason),
		act,
	)


def notify_assignment(app, opening, owner):
	from kandil_hr.foundation.outbox import enqueue

	# Notification references opening metadata, never candidate name/contact or notes.
	enqueue(
		f"application-owner:{app.name}:{app.modified}:{owner}",
		owner,
		_("Application assignment updated"),
		_("Open the scoped application queue to review your assigned work."),
		"Job Opening",
		opening.name,
	)


def reconcile_team(opening, request, reason):
	"""Called after an explicit team save under its request command mutex."""
	lead = opening.custom_kandil_lead
	require_owner(lead, opening, request)
	changed = []
	for name in frappe.db.sql(
		"SELECT name FROM `tabJob Applicant` WHERE job_title=%s ORDER BY name FOR UPDATE",
		(opening.name,),
		pluck=True,
	):
		app = frappe.get_doc("Job Applicant", name, for_update=True)
		if not live(app, current=True):
			continue
		# _assign has validated every incoming member with current locking reads.
		owner = (
			app.custom_kandil_responsible_user
			if app.custom_kandil_responsible_user in team_users(opening)
			else None
		)
		next_owner = (
			app.custom_kandil_next_action_owner
			if app.custom_kandil_next_action_owner in team_users(opening)
			else None
		)
		if owner and (not app.custom_kandil_next_action or next_owner):
			continue
		changed.append(
			store(
				app,
				owner or lead,
				reason,
				"Vacancy team handoff",
				next_owner=(next_owner or lead) if app.custom_kandil_next_action else None,
			)
		)
	return changed


def schedule_disabled_handoff(doc, method=None):
	if not enabled() or doc.name in ("Administrator", "Guest"):
		return
	old = doc.get_doc_before_save()
	if old and cint(old.enabled) and not cint(doc.enabled):
		frappe.db.after_commit.add(partial(_after_disable, doc.name, frappe.session.user))


def _after_disable(user, actor):
	# Cleanup is a new transaction after the native account commit. Isolate all
	# callback queues so a rollback cannot drop sibling account/session callbacks,
	# and a nested commit cannot execute them recursively inside this cleanup.
	names = ("before_commit", "after_commit", "before_rollback", "after_rollback")
	outer = {name: getattr(frappe.db, name) for name in names}
	for name in names:
		setattr(frappe.db, name, CallbackManager())
	try:
		try:
			handoff_disabled_user(user, actor)
		except Exception as exc:
			frappe.db.rollback()
			# Persistent scheduler scan retries cleanup; effective_owner already
			# treats this account as unassigned. Log no candidate/account payload.
			frappe.logger("kandil_ownership").error(
				"Recruitment ownership cleanup pending: %s", type(exc).__name__
			)
			return
		# Callback errors are not domain rollback errors: the commit has occurred.
		frappe.db.commit()
	finally:
		for name, manager in outer.items():
			setattr(frappe.db, name, manager)


@transactional_retry
def handoff_disabled_user(user, actor="Internal scheduler (original actor unavailable)"):
	"""Atomic cleanup and dedicated histories; never commits its caller's work."""
	point = "handoff_" + uuid.uuid4().hex
	callbacks = {
		key: (getattr(frappe.db, key), len(getattr(frappe.db, key)))
		for key in ("before_commit", "after_commit", "before_rollback", "after_rollback")
	}
	frappe.db.savepoint(point)
	try:
		return _handoff_disabled_user(user, actor)
	except frappe.QueryDeadlockError:
		# The outer retry owns full-transaction rollback after InnoDB deadlock.
		raise
	except Exception:
		frappe.db.rollback(save_point=point)
		for manager, length in callbacks.values():
			manager.truncate(length)
		frappe.local.document_cache = {}
		raise


def _handoff_disabled_user(user, actor):
	guard()
	if frappe.db.get_value("User", user, "enabled") != 0:
		return dict(openings=0, applications=0)
	rows = frappe.db.sql(
		"""SELECT DISTINCT o.name,o.custom_kandil_request,r.company
		FROM `tabJob Opening` o JOIN `tabKandil Hiring Request` r ON r.name=o.custom_kandil_request
		LEFT JOIN `tabKandil Recruiter Member` t ON t.parent=o.name AND t.parenttype='Job Opening'
		LEFT JOIN `tabJob Applicant` a ON a.job_title=o.name
		WHERE r.status='Approved' AND o.custom_kandil_vacancy_state IN %s
		AND (o.custom_kandil_lead=%s OR t.user=%s OR a.custom_kandil_responsible_user=%s OR a.custom_kandil_next_action_owner=%s)
		ORDER BY o.name""",
		(ACTIVE, user, user, user, user),
		as_dict=True,
	)
	for company in sorted({row.company for row in rows}):
		frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
	requests = {
		name: frappe.get_doc("Kandil Hiring Request", name, for_update=True)
		for name in sorted({row.custom_kandil_request for row in rows})
	}
	# Team cleanup must not refresh/persist occupancy as a side effect. Lock the
	# capacity rows read-only; this operation never changes their ledger.
	for capacity in sorted({line.capacity for request in requests.values() for line in request.lines}):
		frappe.db.sql("SELECT name FROM `tabKandil Capacity` WHERE name=%s FOR UPDATE", (capacity,))
	openings = [frappe.get_doc("Job Opening", row.name, for_update=True) for row in rows]
	applications = {}
	for opening in openings:
		applications[opening.name] = []
		for name in frappe.db.sql(
			"SELECT name FROM `tabJob Applicant` WHERE job_title=%s ORDER BY name FOR UPDATE",
			(opening.name,),
			pluck=True,
		):
			app = frappe.get_doc("Job Applicant", name, for_update=True)
			if live(app, current=True):
				applications[opening.name].append(app)
	for recipient in sorted({user} | {request.requested_by for request in requests.values()}):
		frappe.db.sql("SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE", (recipient,))
	account = frappe.db.get_value("User", user, ["enabled", "modified"], as_dict=True, for_update=True)
	if not account or account.enabled != 0:
		return dict(openings=0, applications=0)
	before_user = frappe.session.user
	frappe.set_user("Administrator")
	counts = dict(openings=0, applications=0)
	try:
		with transition():
			for opening in openings:
				request = requests[opening.custom_kandil_request]
				if request.status != "Approved" or opening.custom_kandil_vacancy_state not in ACTIVE:
					continue
				from kandil_hr.recruitment.vacancies import vacancy_snapshot

				before = json.loads(frappe.as_json(vacancy_snapshot(opening, request)))
				reason = _("Recruiter account disabled; HR assignment required.")
				invocation = {
					"command": "kandil_hr.recruitment.ownership.handoff_disabled_user",
					"origin": "system_invocation",
					"actor": actor,
					"principal": actor,
					"executor": "Administrator",
					"payload": {"user": user, "actor": actor, "reason": reason},
					"invocation_id": hashlib.sha256(
						frappe.as_json(
							[user, str(account.modified), opening.name, str(opening.modified)]
						).encode()
					).hexdigest(),
					"at": now_cairo().isoformat(),
				}
				changed = opening.custom_kandil_lead == user or any(
					row.user == user for row in opening.custom_kandil_team
				)
				if opening.custom_kandil_lead == user:
					opening.custom_kandil_lead = None
				opening.set(
					"custom_kandil_team",
					[dict(user=row.user) for row in opening.custom_kandil_team if row.user != user],
				)
				application_changes = []
				for app in applications[opening.name]:
					if user not in (app.custom_kandil_responsible_user, app.custom_kandil_next_action_owner):
						continue
					app_before = values(app)
					store(
						app,
						None
						if app.custom_kandil_responsible_user == user
						else app.custom_kandil_responsible_user,
						reason,
						"Account disabled",
						next_owner="" if app.custom_kandil_next_action_owner == user else None,
						actor=actor,
						audit_context=invocation,
					)
					application_changes.append({"name": app.name, "before": app_before, "after": values(app)})
					counts["applications"] += 1
				if changed:
					from kandil_hr.recruitment.api import save

					opening.save(ignore_permissions=True)
					# Preserve the shared vacancy projection only. Private Applicant
					# and task values stay in each protected ownership history.
					save(
						request,
						"Disabled recruiter unassigned",
						frappe.as_json(
							{
								"reason": reason,
								"initiated_by": actor,
								"before": before,
								"after": vacancy_snapshot(opening, request),
								"invocation": invocation,
							}
						),
					)
					counts["openings"] += 1
				if changed or application_changes:
					from kandil_hr.foundation.models import record_security_event

					# Independent immutable PRIVATE history survives Applicant deletion.
					# Only ownership/task projections are retained, never contact/CV/pay.
					record_security_event(
						"Recruitment ownership cleanup",
						user,
						frappe.as_json(
							{
								"invocation": invocation,
								"request": request.name,
								"company": request.company,
								"opening": opening.name,
								"before": before,
								"after": vacancy_snapshot(opening, request),
								"application_count": len(application_changes),
							}
						),
						reference=invocation["invocation_id"],
					)
					# Each application has its own bounded TEXT payload. Aggregating
					# all Arabic task bodies into one event can exceed MariaDB's
					# 65535-byte TEXT limit and prevent the entire cleanup.
					for application in application_changes:
						key = hashlib.sha256(
							(invocation["invocation_id"] + "\0" + application["name"]).encode()
						).hexdigest()
						record_security_event(
							"Recruitment application cleanup",
							user,
							frappe.as_json(
								{
									"invocation": invocation,
									"request": request.name,
									"company": request.company,
									"opening": opening.name,
									"application": application,
								}
							),
							reference=key,
						)
		return counts
	finally:
		frappe.set_user(before_user)


def process_disabled_handoffs():
	if not enabled():
		return
	if getattr(frappe.local, "request", None) or frappe.session.user != "Administrator":
		frappe.throw(
			_("Recruitment cleanup runs only as an internal scheduler task."), frappe.PermissionError
		)
	for user in frappe.get_all("User", filters={"enabled": 0}, pluck="name", limit_page_length=0):
		_after_disable(user, "Internal scheduler (original actor unavailable)")


@frappe.whitelist(methods=["GET"])
def application_queue(unassigned=0, limit=100):
	guard()
	rows = []
	for name in frappe.get_list(
		"Job Applicant", filters={"status": ["!=", "Rejected"]}, pluck="name", limit_page_length=0
	):
		app = frappe.get_doc("Job Applicant", name)
		app.check_permission("read")
		if not app.job_title:
			continue
		opening = frappe.get_doc("Job Opening", app.job_title)
		if not opening.custom_kandil_request or opening.custom_kandil_vacancy_state not in ACTIVE:
			continue
		request = frappe.get_doc("Kandil Hiring Request", opening.custom_kandil_request)
		if request.status != "Approved" or not live(app):
			continue
		owner = effective_owner(app, opening, request)
		next_owner = effective_owner(app, opening, request, "custom_kandil_next_action_owner")
		missing = not owner or bool(app.custom_kandil_next_action and not next_owner)
		if cint(unassigned) and not missing:
			continue
		rows.append(
			dict(
				name=app.name,
				applicant_name=app.applicant_name,
				opening=opening.name,
				request=request.name,
				company=request.company,
				owner=owner,
				next_action=app.custom_kandil_next_action,
				next_action_due=app.custom_kandil_next_action_due,
				next_action_owner=next_owner,
				assignment_state="Unassigned" if missing else "Assigned",
				assignment_warning=_("No authorized recruiter; HR assignment required.") if missing else None,
				application_version=str(app.modified),
				expected_version=str(request.modified),
			)
		)
	return rows[: max(1, min(cint(limit), 200))]


@frappe.whitelist(methods=["GET"])
def actions(name):
	if not enabled():
		return dict(enabled=False)
	guard()
	app = frappe.get_doc("Job Applicant", name)
	app.check_permission("read")
	if not app.job_title:
		return dict(enabled=False)
	opening = frappe.get_doc("Job Opening", app.job_title)
	if not opening.custom_kandil_request:
		return dict(enabled=False)
	request = frappe.get_doc("Kandil Hiring Request", opening.custom_kandil_request)
	hr = frappe.db.get_value("Kandil Organization Settings", request.company, "hr_approver")
	actor = frappe.session.user
	allowed = actor == "Administrator" or actor in (
		hr,
		opening.custom_kandil_lead,
		app.custom_kandil_responsible_user,
	)
	can_manage = bool(
		allowed
		and app.has_permission("write")
		and request_scope(request, actor, "manage")
		and request.status == "Approved"
		and opening.custom_kandil_vacancy_state in ACTIVE
		and live(app)
	)
	owners = []
	if can_manage:
		for user in sorted(team_users(opening) - {None, ""}):
			if (
				frappe.db.get_value("User", user, "enabled")
				and "Kandil Recruiter" in frappe.get_roles(user)
				and request_scope(request, user, "manage")
			):
				owners.append(dict(user=user, label=frappe.db.get_value("User", user, "full_name") or user))
	return dict(
		enabled=True,
		can_manage=can_manage,
		owners=owners,
		expected_version=str(request.modified),
		application_version=str(app.modified),
	)
