"""Audited reversal of an incorrect, unused external-hire joining.

Keeps the original offer outcome, assignment and draft onboarding. Transfers,
exits and any downstream HR/payroll use require their own reviewed process.
"""

from contextlib import contextmanager

import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import cint

from kandil_hr.foundation.clock import now_cairo
from kandil_hr.foundation.teams import effective_lead
from kandil_hr.organization.api import transition as organization_transition
from kandil_hr.organization.current import rows
from kandil_hr.organization.occupancy import values
from kandil_hr.pilot.api import change_capacity, transactional_retry
from kandil_hr.pilot.models import internal
from kandil_hr.recruitment.api import command, dump, save
from kandil_hr.recruitment.employee_links import EMPLOYEE_LINKS


def install_fields():
	if not frappe.conf.get("kandil_parity_enabled"):
		return
	marker = dict(
		fieldname="custom_kandil_joining_voided",
		label="Joining Voided",
		fieldtype="Check",
		default=0,
		read_only=1,
		no_copy=1,
	)
	create_custom_fields(
		{
			"Job Offer": [
				dict(marker, allow_on_submit=1),
				dict(
					fieldname="custom_kandil_void_reason",
					label="Joining Void Reason",
					fieldtype="Small Text",
					read_only=1,
					no_copy=1,
					allow_on_submit=1,
				),
				dict(
					fieldname="custom_kandil_voided_by",
					label="Joining Voided By",
					fieldtype="Link",
					options="User",
					read_only=1,
					no_copy=1,
					allow_on_submit=1,
				),
				dict(
					fieldname="custom_kandil_voided_on",
					label="Joining Voided On",
					fieldtype="Datetime",
					read_only=1,
					no_copy=1,
					allow_on_submit=1,
				),
			],
			"Employee": [dict(marker)],
			"Employee Onboarding": [dict(marker)],
		}
	)


@contextmanager
def void_context():
	old = frappe.flags.get("kandil_joining_void")
	frappe.flags.kandil_joining_void = True
	try:
		yield
	finally:
		frappe.flags.kandil_joining_void = old


def validate_onboarding(doc, method=None):
	if not frappe.conf.get("kandil_parity_enabled"):
		return
	old = doc.get_doc_before_save()
	if not internal() and cint(doc.get("custom_kandil_joining_voided")) != cint(
		old.get("custom_kandil_joining_voided") if old else 0
	):
		frappe.throw(_("Joining reversal markers are managed by the authorized HR action."))
	if doc.get("custom_kandil_joining_voided") and not frappe.flags.get("kandil_joining_void"):
		frappe.throw(_("A voided joining handoff cannot be edited or submitted."))
	validate_employee_use(doc, method)


def protect_onboarding_delete(doc, method=None):
	if frappe.conf.get("kandil_parity_enabled") and doc.get("custom_kandil_joining_voided"):
		frappe.throw(_("The voided joining handoff must remain available as audit history."))


def validate_employee_use(doc, method=None):
	"""Reject new operational use of a voided hire; never change payroll records."""
	if (
		not frappe.conf.get("kandil_parity_enabled")
		or frappe.flags.get("kandil_joining_void")
		or not doc.get("employee")
	):
		return
	# The reversal locks this same Employee before checking downstream records.
	# A current read also sees a void committed while this writer was waiting.
	employees = frappe.db.sql(
		"SELECT custom_kandil_joining_voided FROM `tabEmployee` WHERE name=%s FOR UPDATE",
		(doc.employee,),
		as_dict=True,
	)
	if employees and employees[0].custom_kandil_joining_voided:
		frappe.throw(_("This employee belongs to a voided joining and cannot be used for HR operations."))


def unused_lineage(offer, opening, cap):
	people = rows("Employee", filters={"custom_kandil_offer": offer.name}, fields=["name"])
	if len(people) != 1:
		frappe.throw(_("Joining lineage is inconsistent. Request a manual reconciliation."))
	employee = frappe.get_doc("Employee", people[0].name, for_update=True)
	assignment = frappe.get_doc("Kandil Position Assignment", offer.custom_kandil_assignment, for_update=True)
	handoffs = rows(
		"Employee Onboarding",
		filters={"job_offer": offer.name},
		fields=["name", "docstatus", "employee", "project"],
	)
	if (
		employee.status != "Active"
		or employee.user_id
		or employee.get("custom_kandil_joining_voided")
		or employee.company != cap.company
		or employee.department != cap.department
		or (employee.branch or "") != (cap.branch or "")
		or employee.job_applicant != offer.job_applicant
		or employee.job_offer != offer.name
		or employee.custom_kandil_applicant != offer.job_applicant
		or assignment.employee != employee.name
		or assignment.position != cap.position
		or assignment.allocation != "Primary"
		or assignment.is_voided
		or assignment.valid_until
		or len(handoffs) != 1
		or handoffs[0].docstatus != 0
		or handoffs[0].project
		or handoffs[0].employee != employee.name
	):
		frappe.throw(_("Only an unchanged external-hire joining with an unused draft handoff can be voided."))
	other = rows(
		"Kandil Position Assignment",
		filters={"employee": employee.name, "name": ["!=", assignment.name]},
		fields=["name"],
		include_voided=True,
	)
	if other:
		frappe.throw(_("Later position history requires a separate reviewed reconciliation."))
	if rows(
		"Payroll Employee Detail",
		filters={"employee": employee.name, "parenttype": "Payroll Entry"},
		fields=["name"],
		limit_page_length=1,
	):
		frappe.throw(
			_("This employee is already selected in payroll. Use a separately reviewed reconciliation.")
		)
	# These are reads only. Any operational use, even a draft, prevents this
	# narrow correction from silently changing an employee used elsewhere.
	for dt in (*EMPLOYEE_LINKS, "Employee Onboarding"):
		filters = {"employee": employee.name}
		if dt == "Employee Onboarding":
			filters["name"] = ["!=", handoffs[0].name]
		if rows(dt, filters=filters, fields=["name"], limit_page_length=1):
			frappe.throw(
				_("This employee has downstream HR records. Use a separately reviewed reconciliation.")
			)
	return employee, assignment, frappe.get_doc("Employee Onboarding", handoffs[0].name, for_update=True)


def validate_payroll_entry(doc, method=None):
	if not frappe.conf.get("kandil_parity_enabled"):
		return
	for employee in sorted({row.employee for row in doc.get("employees") or [] if row.employee}):
		validate_employee_use(frappe._dict(employee=employee), method)


@frappe.whitelist(methods=["POST"])
@transactional_retry
def void_joining(name, offer_name, command_id, expected_version, reason):
	if not isinstance(reason, str) or not 3 <= len(reason.strip()) <= 2000:
		frappe.throw(_("A joining reversal reason of 3 to 2000 characters is required."))

	def act(doc):
		settings = frappe.get_doc("Kandil Organization Settings", doc.company, for_update=True)
		if settings.hr_approver != frappe.session.user:
			frappe.throw(_("Only the configured HR authority can void a joining."), frappe.PermissionError)
		if doc.amends or doc.status not in ("Approved", "Closed"):
			frappe.throw(_("Only an approved recruitment request can have an incorrect joining voided."))
		if rows(
			"Kandil Hiring Request",
			filters={"amends": doc.name, "status": ["in", ["Draft", "Pending", "Returned"]]},
			fields=["name"],
		):
			frappe.throw(_("Resolve the active amendment before voiding a joining."))
		offer = frappe.get_doc("Job Offer", offer_name, for_update=True)
		offer.check_permission("read")
		applicant = frappe.get_doc("Job Applicant", offer.job_applicant, for_update=True)
		line = next((r for r in doc.lines if r.job_opening == applicant.job_title), None)
		if not line:
			frappe.throw(_("The offer does not belong to this request."), frappe.PermissionError)
		opening = frappe.get_doc("Job Opening", line.job_opening, for_update=True)
		if (
			offer.custom_kandil_outcome != "Joined"
			or offer.get("custom_kandil_joining_voided")
			or opening.custom_kandil_vacancy_state in ("Closed", "Cancelled")
			or cint(line.joined_qty) < 1
		):
			frappe.throw(_("This joining is not eligible for reversal."))
		cap = frappe.get_doc("Kandil Capacity", line.capacity, for_update=True)
		employee, assignment, onboarding = unused_lineage(offer, opening, cap)
		before = dict(
			request_status=doc.status,
			vacancy_state=opening.custom_kandil_vacancy_state,
			joined=line.joined_qty,
			occupied=cap.occupied,
			open_slots=cap.open_slots,
			reserved=cap.reserved,
			structural=cap.structural,
			employee=employee.name,
			assignment=assignment.name,
			onboarding=onboarding.name,
			offer=offer.name,
		)
		with organization_transition(), void_context():
			assignment.is_voided = 1
			assignment.void_reason = reason.strip()
			assignment.voided_by = frappe.session.user
			assignment.voided_on = now_cairo().replace(tzinfo=None)
			assignment.save(ignore_permissions=True)
			employee.status = "Inactive"
			employee.custom_kandil_joining_voided = 1
			employee.save(ignore_permissions=True)
			onboarding.custom_kandil_joining_voided = 1
			onboarding.save(ignore_permissions=True)
		line.joined_qty = cint(line.joined_qty) - 1
		change_capacity(cap, occupied=-1, opened=1)
		if values(cap)["difference"] != 0:
			frappe.throw(_("Reversal occupancy did not reconcile; no changes were saved."))
		resumed = "Partially Filled" if line.joined_qty else "Open"
		if opening.custom_kandil_vacancy_state not in ("On Hold", "Frozen"):
			opening.custom_kandil_vacancy_state = resumed if effective_lead(opening) else "Approved"
			opening.status = "Open" if effective_lead(opening) else "Closed"
		else:
			# Paused vacancies stay paused; a later resume uses the corrected count.
			if opening.custom_kandil_before_pause:
				opening.custom_kandil_before_pause = resumed
			if opening.custom_kandil_before_freeze and opening.custom_kandil_before_freeze != "On Hold":
				opening.custom_kandil_before_freeze = resumed
		opening.save(ignore_permissions=True)
		doc.status = "Approved"
		offer.custom_kandil_joining_voided = 1
		offer.custom_kandil_void_reason = reason.strip()
		offer.custom_kandil_voided_by = frappe.session.user
		offer.custom_kandil_voided_on = now_cairo().replace(tzinfo=None)
		offer.save(ignore_permissions=True)
		after = dict(
			request_status=doc.status,
			vacancy_state=opening.custom_kandil_vacancy_state,
			joined=line.joined_qty,
			occupied=cap.occupied,
			open_slots=cap.open_slots,
			reserved=cap.reserved,
			structural=cap.structural,
			assignment_voided=True,
			employee_status="Inactive",
			onboarding_voided=True,
		)
		save(doc, "Joining voided", dump(dict(reason=reason.strip(), before=before, after=after)))
		return dict(
			name=doc.name,
			modified=str(doc.modified),
			outcome="Voided",
			employee=employee.name,
			assignment=assignment.name,
			onboarding=onboarding.name,
			vacancy_state=opening.custom_kandil_vacancy_state,
		)

	return command(
		name, "void_joining", command_id, expected_version, dict(offer=offer_name, reason=reason), act
	)
