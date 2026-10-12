"""Transactional recruitment actions. No commits here: Frappe commits or rolls back the request."""

import json
import random
import time
from contextlib import contextmanager
from functools import wraps

import frappe
from frappe.utils import cint, getdate, now_datetime, today

from kandil_hr.pilot.models import deny, enabled_guard


def transactional_retry(fn):
	"""Retry only a whole rolled-back DB transaction, never a partial write.

	Native Frappe child-table range locks can deadlock across independent requests.
	These actions have no external side effects; rollback discards deferred events.
	Business validation and authorization errors are never retried.
	"""

	@wraps(fn)
	def wrapped(*args, **kwargs):
		for attempt in range(4):
			try:
				result = fn(*args, **kwargs)
				frappe.local.response["kandil_transaction_retries"] = attempt
				return result
			except frappe.QueryDeadlockError:
				frappe.db.rollback()
				frappe.local.document_cache = {}
				if attempt == 3:
					raise
				time.sleep(random.uniform(0.01, 0.04) * (attempt + 1))

	return wrapped


@contextmanager
def transition():
	previous = frappe.flags.get("kandil_transition")
	frappe.flags.kandil_transition = True
	try:
		yield
	finally:
		frappe.flags.kandil_transition = previous


def require_role(*roles):
	enabled_guard()
	if not set(roles).intersection(frappe.get_roles()):
		deny("Your role cannot perform this recruitment action.")


def lock_request(name):
	enabled_guard()
	doc = frappe.get_doc("Kandil Hiring Request", name, for_update=True)
	doc.check_permission("read")
	return doc


def lock_capacities(doc):
	if frappe.conf.get("kandil_parity_enabled"):
		from kandil_hr.organization.models import lock_company

		lock_company(doc.company)
	caps = {
		key: frappe.get_doc("Kandil Capacity", key, for_update=True)
		for key in sorted({line.capacity for line in doc.lines})
	}
	if frappe.conf.get("kandil_parity_enabled"):
		from kandil_hr.organization.occupancy import refresh_locked

		for cap in caps.values():
			if cap.company != doc.company:
				frappe.throw(frappe._("Every capacity must match the request company and department."))
			refresh_locked(cap)
	return caps


def change_capacity(cap, reserved=0, opened=0, occupied=0):
	if frappe.conf.get("kandil_parity_enabled") and any(x > 0 for x in (reserved, opened, occupied)):
		from kandil_hr.organization.occupancy import assert_increase

		assert_increase(cap)
	cap.reserved = cint(cap.reserved) + reserved
	cap.open_slots = cint(cap.open_slots) + opened
	cap.occupied = cint(cap.occupied) + occupied
	if min(cap.reserved, cap.open_slots, cap.occupied) < 0:
		frappe.throw(frappe._("Capacity invariant violated; transaction rolled back."))
	cap.save(ignore_permissions=True)


def event(doc, action, note="", principal=None):
	frappe.get_doc(
		dict(
			doctype="Kandil Recruitment Event",
			request=doc.name,
			action=action,
			actor=frappe.session.user,
			principal=principal,
			note=note,
			snapshot=json.dumps(
				{
					"status": doc.status,
					"lines": [
						{
							"capacity": x.capacity,
							"requested": x.requested_qty,
							"approved": x.approved_qty,
							"joined": x.joined_qty,
							"opening": x.job_opening,
						}
						for x in doc.lines
					],
				},
				ensure_ascii=False,
			),
		)
	).insert(ignore_permissions=True)


def save(doc, action, note="", principal=None):
	doc.save(ignore_permissions=True)
	event(doc, action, note, principal)
	return doc.as_dict()


def delegate_for(doc, principal, user=None):
	user = user or frappe.session.user
	return frappe.db.exists(
		"Kandil Delegation",
		{
			"from_user": principal,
			"to_user": user,
			"company": doc.company,
			"department": doc.department,
			"revoked": 0,
			"from_date": ["<=", today()],
			"to_date": [">=", today()],
		},
	)


def can_act(doc, principal):
	user = frappe.session.user
	if user == doc.requested_by or principal == doc.requested_by:
		return False
	if not frappe.db.get_value("User", principal, "enabled"):
		return False
	if (
		frappe.conf.get("kandil_parity_enabled")
		and user != principal
		and {"Kandil CEO Approver", "Kandil Board Approver"}.intersection(frappe.get_roles(principal))
	):
		return False
	return user == principal or (
		"Kandil Approver" in frappe.get_roles(user) and bool(delegate_for(doc, principal))
	)


@frappe.whitelist(methods=["POST"])
@transactional_retry
def submit_request(name, command_id=None, expected_version=None):
	if frappe.conf.get("kandil_parity_enabled"):
		from kandil_hr.recruitment.api import submit_request as extended

		return extended(name, command_id, expected_version)
	doc = lock_request(name)
	if doc.requested_by != frappe.session.user:
		deny("Only the requester can submit this draft.")
	if doc.status == "Pending":
		return doc.as_dict()
	if doc.status != "Draft":
		frappe.throw(frappe._("Only a draft can be submitted."))
	caps = lock_capacities(doc)
	routes = frappe.get_all(
		"Kandil Recruitment Route",
		filters={"company": doc.company, "department": doc.department, "enabled": 1},
		pluck="name",
	)
	if len(routes) != 1:
		frappe.throw(frappe._("Configure one enabled department approval route first."))
	route = frappe.get_doc("Kandil Recruitment Route", routes[0])
	excess = any(cint(line.requested_qty) > caps[line.capacity].available for line in doc.lines)
	if excess and not (doc.exception_reason or "").strip():
		frappe.throw(frappe._("Headcount exception requires a justification; no capacity was reserved."))
	chain = []
	if excess:
		chain.append((route.exception_approver, "Headcount Exception"))
	chain.extend([(route.manager_approver, "Department Approval"), (route.hr_approver, "HR Approval")])
	# A requester cannot supply their own exception authority; do not silently skip this gate.
	if excess and route.exception_approver == doc.requested_by:
		deny("The exception authority cannot approve their own request; configure an independent route.")
	with transition():
		doc.set("approval_steps", [])
		for principal, authority in chain:
			if principal == doc.requested_by:
				event(doc, "Self approval step skipped", authority, principal)
				continue
			doc.append("approval_steps", dict(principal=principal, authority=authority, decision="Pending"))
		if not doc.approval_steps:
			frappe.throw(frappe._("At least one independent approver is required."))
		doc.needs_exception = int(excess)
		doc.submitted_snapshot = json.dumps(
			{
				"company": doc.company,
				"department": doc.department,
				"title": doc.title,
				"reason": doc.exception_reason,
				"capacities": {
					k: {
						x: c.get(x) for x in ["structural", "occupied", "reserved", "open_slots", "available"]
					}
					for k, c in caps.items()
				},
				"lines": [{"capacity": x.capacity, "quantity": x.requested_qty} for x in doc.lines],
				"route": [{"principal": x.principal, "authority": x.authority} for x in doc.approval_steps],
			},
			ensure_ascii=False,
		)
		for line in doc.lines:
			change_capacity(caps[line.capacity], reserved=cint(line.requested_qty))
		doc.status = "Pending"
		return save(doc, "Submitted", "Headcount reserved atomically.")


@frappe.whitelist(methods=["POST"])
@transactional_retry
def decide(
	name, decision, comment="", step_id=None, command_id=None, expected_version=None, board_evidence=None
):
	if frappe.conf.get("kandil_parity_enabled"):
		from kandil_hr.recruitment.api import decide as extended

		return extended(name, decision, step_id, command_id, expected_version, comment, board_evidence)
	doc = lock_request(name)
	if decision not in ["Approve", "Reject"]:
		frappe.throw(frappe._("Choose Approve or Reject."))
	if doc.status != "Pending":
		frappe.throw(frappe._("Request is no longer pending."))
	step = next((x for x in doc.approval_steps if x.decision == "Pending"), None)
	if not step or not can_act(doc, step.principal):
		deny("You are not the active independent approver or an effective delegate.")
	role = {
		"Headcount Exception": "Kandil Sector Approver",
		"Department Approval": "Kandil Approver",
		"HR Approval": "Kandil Recruiter",
	}[step.authority]
	if role not in frappe.get_roles(step.principal):
		deny("Required authority is no longer assigned to the principal.")
	if decision == "Reject" and not comment.strip():
		frappe.throw(frappe._("Rejection requires a reason."))
	caps = lock_capacities(doc)
	with transition():
		step.decision = "Approved" if decision == "Approve" else "Rejected"
		step.actor = frappe.session.user
		step.decided_at = now_datetime()
		step.comment = comment
		if decision == "Reject":
			for line in doc.lines:
				change_capacity(caps[line.capacity], reserved=-cint(line.requested_qty))
			doc.status = "Rejected"
			doc.decision_note = comment
		elif all(x.decision == "Approved" for x in doc.approval_steps):
			doc.status = "Approved"
			for line in doc.lines:
				cap = caps[line.capacity]
				qty = cint(line.requested_qty)
				change_capacity(cap, reserved=-qty, opened=qty)
				line.approved_qty = qty
				opening = frappe.get_doc(
					dict(
						doctype="Job Opening",
						job_title=f"{cap.designation} — {cap.branch} — {doc.name}",
						designation=cap.designation,
						company=doc.company,
						department=doc.department,
						location=cap.branch,
						status="Open",
						vacancies=qty,
						publish=0,
						currency="EGP",
						prevent_duplicate_applicant=1,
						custom_kandil_request=doc.name,
						custom_kandil_capacity=cap.name,
					)
				).insert(ignore_permissions=True)
				line.job_opening = opening.name
		return save(doc, decision, comment, step.principal)


@frappe.whitelist(methods=["POST"])
@transactional_retry
def cancel_request(name, reason, command_id=None, expected_version=None):
	if frappe.conf.get("kandil_parity_enabled"):
		from kandil_hr.recruitment.api import cancel_request as extended

		return extended(name, command_id, expected_version, reason)
	if not reason.strip():
		frappe.throw(frappe._("Cancellation requires a reason."))
	doc = lock_request(name)
	if doc.requested_by != frappe.session.user and not set(
		["Kandil Recruiter", "Kandil Sector Approver"]
	).intersection(frappe.get_roles()):
		deny("Only the requester or recruitment authority can cancel.")
	if doc.status == "Cancelled":
		return doc.as_dict()
	if doc.status not in ["Draft", "Pending", "Approved"]:
		frappe.throw(frappe._("This request cannot be cancelled."))
	caps = lock_capacities(doc)
	with transition():
		for line in doc.lines:
			cap = caps[line.capacity]
			if doc.status == "Pending":
				change_capacity(cap, reserved=-cint(line.requested_qty))
			elif doc.status == "Approved":
				change_capacity(cap, opened=-(cint(line.approved_qty) - cint(line.joined_qty)))
				opening = frappe.get_doc("Job Opening", line.job_opening, for_update=True)
				opening.status = "Closed"
				opening.save(ignore_permissions=True)
		doc.status = "Cancelled"
		doc.decision_note = reason
		return save(doc, "Cancelled", reason)


def offer_context(offer_name):
	if frappe.conf.get("kandil_parity_enabled"):
		from kandil_hr.recruitment.joining import offer_context as parity_context

		return parity_context(offer_name)[:5]
	require_role("Kandil Recruiter")
	# Resolve identifiers first, then acquire locks in request -> capacities -> offer order everywhere.
	offer = frappe.get_doc("Job Offer", offer_name)
	offer.check_permission("read")
	applicant = frappe.get_doc("Job Applicant", offer.job_applicant)
	opening = frappe.get_doc("Job Opening", applicant.job_title)
	if not opening.get("custom_kandil_request"):
		frappe.throw(frappe._("This offer is not part of the Kandil pilot."))
	doc = lock_request(opening.custom_kandil_request)
	if frappe.conf.get("kandil_parity_enabled"):
		from kandil_hr.foundation.security import request_scope

		if not request_scope(doc, frappe.session.user, "manage"):
			deny("Management access is required for joining actions.")
		state = frappe.db.get_value("Job Opening", opening.name, "custom_kandil_vacancy_state")
		if state not in ("Open", "Partially Filled"):
			frappe.throw(frappe._("Recruitment is paused or has not started for this vacancy."))
	caps = lock_capacities(doc)
	offer = frappe.get_doc("Job Offer", offer_name, for_update=True)
	line = next((x for x in doc.lines if x.job_opening == opening.name), None)
	if not line:
		frappe.throw(frappe._("Opening is not linked to a request line."))
	return doc, caps[line.capacity], line, offer, applicant


@frappe.whitelist(methods=["POST"])
@transactional_retry
def record_outcome(offer_name, outcome, reason="", joining_date=None, date_of_birth=None, gender=None):
	if frappe.conf.get("kandil_parity_enabled"):
		from kandil_hr.recruitment.joining import record_outcome as parity_outcome

		return parity_outcome(offer_name, outcome, reason, joining_date, date_of_birth, gender)
	if outcome not in ["Joined", "No Show", "Withdrawn"]:
		frappe.throw(frappe._("Choose Joined, No Show or Withdrawn."))
	doc, cap, line, offer, applicant = offer_context(offer_name)
	previous = offer.get("custom_kandil_outcome") or "Pending"
	if previous == outcome:
		return {
			"outcome": outcome,
			"employee": frappe.db.get_value(
				"Employee", {"custom_kandil_offer": offer.name}, "name", for_update=True
			),
			"idempotent": True,
		}
	if previous != "Pending":
		frappe.throw(frappe._("This offer already has a final joining outcome."))
	if doc.status != "Approved":
		frappe.throw(frappe._("The request is not open for recruitment."))
	if offer.docstatus != 1 or offer.status != "Accepted":
		frappe.throw(frappe._("A submitted, accepted offer is required."))
	if outcome != "Joined" and not reason.strip():
		frappe.throw(frappe._("No-show or withdrawal requires a reason."))
	with transition():
		employee = None
		onboarding = None
		if outcome == "Joined":
			if not joining_date or not date_of_birth or not gender:
				frappe.throw(
					frappe._("Joining date, date of birth and gender are required for the Employee record.")
				)
			if getdate(joining_date) > getdate(today()):
				frappe.throw(frappe._("Actual joining cannot be in the future."))
			if getdate(date_of_birth) >= getdate(joining_date):
				frappe.throw(frappe._("Date of birth must precede joining."))
			if cint(line.joined_qty) >= cint(line.approved_qty) or cap.open_slots < 1:
				frappe.throw(frappe._("The approved line has no remaining vacancy."))
			employee = frappe.get_doc(
				dict(
					doctype="Employee",
					first_name=applicant.applicant_name,
					date_of_birth=date_of_birth,
					gender=gender,
					date_of_joining=joining_date,
					status="Active",
					company=doc.company,
					department=doc.department,
					designation=cap.designation,
					branch=cap.branch,
					personal_email=applicant.email_id or None,
					cell_number=applicant.phone_number,
					job_applicant=applicant.name,
					job_offer=offer.name,
					custom_kandil_offer=offer.name,
					custom_kandil_applicant=applicant.name,
				)
			).insert(ignore_permissions=True)
			line.joined_qty = cint(line.joined_qty) + 1
			change_capacity(cap, opened=-1, occupied=1)
			if line.joined_qty == line.approved_qty:
				opening = frappe.get_doc("Job Opening", line.job_opening, for_update=True)
				opening.status = "Closed"
				opening.save(ignore_permissions=True)
			if all(cint(x.joined_qty) == cint(x.approved_qty) for x in doc.lines):
				doc.status = "Filled"
			onboarding = frappe.get_doc(
				dict(
					doctype="Employee Onboarding",
					employee=employee.name,
					employee_name=employee.employee_name,
					job_offer=offer.name,
					job_applicant=applicant.name,
					company=doc.company,
					date_of_joining=joining_date,
					boarding_begins_on=joining_date,
					notify_users=0,
					activities=[
						dict(
							activity_name="PILOT: issue badge and verify joining documents",
							user=frappe.session.user,
							begin_on=0,
							duration=1,
						)
					],
				)
			).insert(ignore_permissions=True)
			onboarding.submit()
		# Custom allow-on-submit fields; the accepted offer remains an historical fact.
		offer.custom_kandil_outcome = outcome
		offer.custom_kandil_outcome_reason = reason
		offer.save(ignore_permissions=True)
		save(doc, outcome, reason)
		return {
			"outcome": outcome,
			"employee": employee.name if employee else None,
			"onboarding": onboarding.name if onboarding else None,
		}
