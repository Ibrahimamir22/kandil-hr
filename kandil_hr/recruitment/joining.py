"""Parity joining keeps the position, capacity, vacancy and request in one transaction.

Existing pilot behavior is unchanged. Incorrect external-hire joins can be voided
through joining_corrections after checking their complete retained lineage.
"""

import frappe
from frappe import _
from frappe.utils import cint, getdate

from kandil_hr.foundation.clock import today_cairo
from kandil_hr.foundation.security import request_scope
from kandil_hr.foundation.teams import effective_lead
from kandil_hr.pilot.api import change_capacity, lock_capacities, require_role, transition
from kandil_hr.recruitment import joining_audit
from kandil_hr.recruitment.api import save
from kandil_hr.recruitment.models import guard


def offer_context(offer_name):
	guard()
	require_role("Kandil Recruiter")
	initial_offer = frappe.get_doc("Job Offer", offer_name)
	initial_offer.check_permission("read")
	applicant = frappe.get_doc("Job Applicant", initial_offer.job_applicant)
	initial_opening = frappe.get_doc("Job Opening", applicant.job_title)
	request_name = initial_opening.get("custom_kandil_request")
	if not request_name:
		frappe.throw(_("This offer is not part of the Kandil pilot."))
	company = frappe.db.get_value("Kandil Hiring Request", request_name, "company")
	# Organization assignments also serialize on Company. Acquire that lock first,
	# then the same parent/capacity/opening order used by vacancy commands.
	frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
	doc = frappe.get_doc("Kandil Hiring Request", request_name, for_update=True)
	doc.check_permission("read")
	if doc.company != company or not request_scope(doc, frappe.session.user, "manage"):
		frappe.throw(_("Management access is required for joining actions."), frappe.PermissionError)
	doc.flags.joining_audit = joining_audit.start(doc)
	# Read/lock the recorded ledger here. Replay must not persist a dated
	# occupancy refresh before returning its original result.
	caps = {
		name: frappe.get_doc("Kandil Capacity", name, for_update=True)
		for name in sorted({row.capacity for row in doc.lines})
	}
	# This must be a current read: a plain get_value can retain the pre-lock
	# REPEATABLE READ snapshot and miss a Hold/Freeze committed while waiting.
	opening = frappe.get_doc("Job Opening", initial_opening.name, for_update=True)
	offer = frappe.get_doc("Job Offer", offer_name, for_update=True)
	offer.check_permission("read")
	applicant = frappe.get_doc("Job Applicant", offer.job_applicant, for_update=True)
	if offer.job_applicant != initial_offer.job_applicant or applicant.job_title != opening.name:
		frappe.throw(_("The offer or application changed. Reload before recording an outcome."))
	line = next((row for row in doc.lines if row.job_opening == opening.name), None)
	if not line or opening.custom_kandil_request != doc.name:
		frappe.throw(_("Opening is not linked to a request line."))
	cap = caps[line.capacity]
	if cap.position:
		frappe.db.sql("SELECT name FROM `tabKandil Position` WHERE name=%s FOR UPDATE", (cap.position,))
		frappe.db.sql(
			"SELECT name FROM `tabKandil Position Assignment` WHERE position=%s ORDER BY name FOR UPDATE",
			(cap.position,),
		)
	if doc.requested_position:
		frappe.db.sql(
			"SELECT name FROM `tabKandil Position` WHERE name=%s FOR UPDATE", (doc.requested_position,)
		)
	joining_audit.attach(doc.flags.joining_audit, doc, cap, offer, applicant, opening)
	# Save notifies the requester. Lock all eventual User rows in one order before
	# current identity/grant checks to avoid opposing actor/recipient lock order.
	for user in sorted(
		{frappe.session.user, doc.requested_by, opening.get("custom_kandil_lead")} - {None, ""}
	):
		frappe.db.sql("SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE", (user,))
	from kandil_hr.foundation.mutation_access import assert_current_request_scope

	assert_current_request_scope(doc, required_roles=("Kandil Recruiter",))
	return doc, cap, line, offer, applicant, opening


def existing_result(offer, outcome, reason, joining_date, date_of_birth, gender):
	employees = [
		row[0]
		for row in frappe.db.sql(
			"SELECT name FROM `tabEmployee` WHERE custom_kandil_offer=%s FOR UPDATE", (offer.name,)
		)
	]
	if reason != (offer.custom_kandil_outcome_reason or ""):
		frappe.throw(_("Recorded outcome reason cannot change on replay."))
	if outcome == "Joined":
		if len(employees) != 1:
			frappe.throw(_("Recorded joining is inconsistent. Request an authorized reconciliation."))
		employee = frappe.get_doc("Employee", employees[0], for_update=True)
		if (
			(joining_date and getdate(joining_date) != getdate(employee.date_of_joining))
			or (date_of_birth and getdate(date_of_birth) != getdate(employee.date_of_birth))
			or (gender and gender != employee.gender)
		):
			frappe.throw(_("Recorded joining details cannot change on replay."))
		assignments = [
			row[0]
			for row in frappe.db.sql(
				"SELECT name FROM `tabKandil Position Assignment` WHERE name=%s AND employee=%s AND allocation='Primary' FOR UPDATE",
				(offer.custom_kandil_assignment, employee.name),
			)
		]
		onboardings = [
			row[0]
			for row in frappe.db.sql(
				"SELECT name FROM `tabEmployee Onboarding` WHERE job_offer=%s FOR UPDATE", (offer.name,)
			)
		]
		if len(assignments) != 1 or len(onboardings) != 1:
			frappe.throw(_("Recorded joining is inconsistent. Request an authorized reconciliation."))
		return dict(
			outcome=outcome,
			employee=employee.name,
			onboarding=onboardings[0],
			assignment=assignments[0],
			onboarding_status="Draft",
		)
	return dict(outcome=outcome, employee=None, onboarding=None, assignment=None, onboarding_status=None)


def record_outcome(offer_name, outcome, reason="", joining_date=None, date_of_birth=None, gender=None):
	if outcome not in ("Joined", "No Show", "Withdrawn"):
		frappe.throw(_("Choose Joined, No Show or Withdrawn."))
	doc, cap, line, offer, applicant, opening = offer_context(offer_name)
	if offer.get("custom_kandil_joining_voided"):
		frappe.throw(_("This joining was voided. Create a new application for a later hire."))
	previous = offer.custom_kandil_outcome or "Pending"
	# Replay remains possible after the final fill closes the vacancy and parent.
	# Current authentication/scope is checked before returning any recorded result.
	if previous == outcome:
		return existing_result(offer, outcome, reason, joining_date, date_of_birth, gender)
	if previous != "Pending":
		frappe.throw(_("This offer already has a final joining outcome."))
	# Only a new outcome refreshes effective-dated occupancy. The audit start
	# retained the recorded pre-refresh ledger while the same mutex was held.
	cap = lock_capacities(doc)[line.capacity]
	if doc.status != "Approved":
		frappe.throw(_("The request is not open for recruitment."))
	if opening.custom_kandil_vacancy_state not in ("Open", "Partially Filled"):
		frappe.throw(_("Recruitment is paused or has not started for this vacancy."))
	if not effective_lead(opening):
		frappe.throw(_("Assign an active authorized lead before accepting applications."))
	from kandil_hr.foundation.mutation_access import assert_current_request_scope

	assert_current_request_scope(doc, user=opening.custom_kandil_lead, required_roles=("Kandil Recruiter",))
	if offer.docstatus != 1 or offer.status != "Accepted":
		frappe.throw(_("A submitted, accepted offer is required."))
	if outcome != "Joined" and not (reason or "").strip():
		frappe.throw(_("No-show or withdrawal requires a reason."))
	with transition():
		employee = onboarding = assignment = None
		if outcome == "Joined":
			if not joining_date or not date_of_birth or not gender:
				frappe.throw(
					_("Joining date, date of birth and gender are required for the Employee record.")
				)
			if getdate(joining_date) > getdate(today_cairo()):
				frappe.throw(_("Actual joining cannot be in the future."))
			if getdate(date_of_birth) >= getdate(joining_date):
				frappe.throw(_("Date of birth must precede joining."))
			if cint(line.joined_qty) + cint(line.closed_qty) >= cint(line.approved_qty) or cap.open_slots < 1:
				frappe.throw(_("The approved line has no remaining vacancy."))
			if not cap.position:
				frappe.throw(_("Map this capacity to an approved position before recording joining."))
			position = frappe.get_doc("Kandil Position", cap.position, for_update=True)
			if (
				(position.company, position.department, position.get("branch") or "")
				!= (doc.company, doc.department, cap.branch or "")
				or position.status != "Active"
				or (position.closed_on and getdate(position.closed_on) <= getdate(today_cairo()))
			):
				frappe.throw(_("Joining requires an active position matching the request location."))
			# Read allocations currently, not from an earlier consistent-read snapshot.
			# This prevents a second joining that waited on Company from overlooking
			# a just-committed dated assignment.
			allocations = frappe.db.sql(
				"SELECT valid_from,valid_until,allocation FROM `tabKandil Position Assignment` WHERE position=%s AND is_voided=0 FOR UPDATE",
				(position.name,),
				as_dict=True,
			)
			from kandil_hr.organization.rules import peak_occupancy

			if peak_occupancy([*allocations, dict(valid_from=joining_date, allocation="Primary")]) > cint(
				position.structural
			):
				frappe.throw(_("Position assignments exceed structural seats."))
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
			assignment = frappe.get_doc(
				dict(
					doctype="Kandil Position Assignment",
					company=doc.company,
					department=doc.department,
					branch=cap.branch,
					position=cap.position,
					employee=employee.name,
					user=employee.user_id or None,
					allocation="Primary",
					valid_from=joining_date,
				)
			).insert(ignore_permissions=True)
			line.joined_qty = cint(line.joined_qty) + 1
			change_capacity(cap, opened=-1, occupied=1)
			full = cint(line.joined_qty) + cint(line.closed_qty) >= cint(line.approved_qty)
			opening.custom_kandil_vacancy_state = "Filled" if full else "Partially Filled"
			opening.status = "Closed" if full else "Open"
			opening.save(ignore_permissions=True)
			if all(
				cint(row.joined_qty) + cint(row.closed_qty) >= cint(row.approved_qty) for row in doc.lines
			):
				doc.status = "Closed"
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
			# P0-P3 prepares a draft handoff. Native task orchestration belongs to P7.
		if assignment:
			offer.custom_kandil_assignment = assignment.name
		offer.custom_kandil_outcome = outcome
		offer.custom_kandil_outcome_reason = reason
		offer.save(ignore_permissions=True)
		save(doc, outcome, reason)
		result = dict(
			outcome=outcome,
			employee=employee.name if employee else None,
			onboarding=onboarding.name if onboarding else None,
			assignment=assignment.name if assignment else None,
			onboarding_status="Draft" if onboarding else None,
		)
		joining_audit.finish(
			doc.flags.joining_audit,
			doc,
			dict(
				offer_name=offer_name,
				outcome=outcome,
				reason=reason,
				joining_date=joining_date,
				date_of_birth=date_of_birth,
				gender=gender,
			),
			result,
		)
		return result
