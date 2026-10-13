"""Opt-in full recruitment contracts. Existing pilot sites retain their behavior."""

import re

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, get_datetime, getdate


def enabled():
	return bool(
		frappe.conf.get("kandil_parity_enabled")
		and frappe.conf.get("kandil_foundation_enabled")
		and frappe.conf.get("kandil_pilot_enabled")
	)


def guard():
	if not enabled():
		frappe.throw(_("Extended recruitment is not enabled on this site."), frappe.PermissionError)


class KandilCommandReceipt(Document):
	def autoname(self):
		if not re.fullmatch(r"[0-9a-f]{64}", self.dedupe_key or ""):
			frappe.throw(_("Invalid command receipt identity."))
		self.name = self.dedupe_key

	def validate(self):
		guard()
		if not frappe.flags.get("kandil_transition") or not self.is_new():
			frappe.throw(_("Command receipts are server managed."), frappe.PermissionError)

	def on_trash(self):
		frappe.throw(_("Command receipts cannot be deleted."), frappe.PermissionError)


class KandilRequestRevision(Document):
	def validate(self):
		guard()
		if not frappe.flags.get("kandil_transition") or not self.is_new():
			frappe.throw(_("Request revisions are immutable."), frappe.PermissionError)

	def on_trash(self):
		frappe.throw(_("Request revisions cannot be deleted."), frappe.PermissionError)


class KandilAuthorityRule(Document):
	def validate(self):
		guard()
		if self.to_date and getdate(self.to_date) < getdate(self.from_date):
			frappe.throw(_("Authority dates are invalid."))
		role = {"CEO Approval": "Kandil CEO Approver", "Board Approval": "Kandil Board Approver"}.get(
			self.authority
		)
		if (
			not role
			or role not in frappe.get_roles(self.principal)
			or not frappe.db.get_value("User", self.principal, "enabled")
		):
			frappe.throw(_("Authority requires an enabled user with the appropriate role."))
		if self.department and frappe.db.get_value("Department", self.department, "company") != self.company:
			frappe.throw(_("Department must belong to the selected company."))


def validate_request(doc):
	from kandil_hr.foundation.security import request_scope
	from kandil_hr.pilot.models import integer, internal

	guard()
	old = doc.get_doc_before_save()
	from kandil_hr.recruitment.privacy import protect_noted_request_scope

	protect_noted_request_scope(doc, old)
	if not internal():
		if doc.status != "Draft" or (old and old.status != "Draft"):
			frappe.throw(_("Use recruitment actions to change a submitted request."), frappe.PermissionError)
		if doc.requested_by != frappe.session.user:
			frappe.throw(_("Only the requester can edit this draft."), frappe.PermissionError)
		protected = [
			"requested_by",
			"owner",
			"request_kind",
			"amends",
			"baseline_modified",
			"revision",
			"hr_priority",
			"route_snapshot",
		]
		if old and (
			any(doc.get(k) != old.get(k) for k in protected)
			or get_datetime(doc.creation) != get_datetime(old.creation)
		):
			frappe.throw(_("Revision and routing fields are server managed."), frappe.PermissionError)
		if not old and (
			doc.amends or doc.request_kind not in ["", None, "New Recruitment"] or cint(doc.revision) != 1
		):
			frappe.throw(_("Create amendments through the amendment action."), frappe.PermissionError)
		if doc.approval_steps or doc.submitted_snapshot or doc.needs_exception or doc.decision_note:
			frappe.throw(_("Approval state is server managed."), frappe.PermissionError)
		if any(
			x.approved_qty
			or x.joined_qty
			or x.job_opening
			or x.reserved_qty
			or x.proposed_qty
			or x.closed_qty
			for x in doc.lines
		):
			frappe.throw(_("Line outcomes are server managed."), frappe.PermissionError)
		if not request_scope(doc, frappe.session.user, "manage"):
			frappe.throw(_("The request is outside your assigned scope."), frappe.PermissionError)
	if doc.get("beneficiary_user") and (
		doc.beneficiary_user in ("Guest", "Administrator")
		or not frappe.db.get_value("User", doc.beneficiary_user, "enabled")
	):
		# Existing submitted history may retain a subsequently disabled beneficiary.
		if not old or old.get("beneficiary_user") != doc.beneficiary_user:
			frappe.throw(_("Select an enabled ordinary beneficiary account."))
	if doc.docstatus != 0:
		frappe.throw(_("Use the recruitment action workflow."))
	if not doc.requested_position or not doc.lines:
		frappe.throw(_("Select a position and at least one location."))
	position = frappe.get_doc("Kandil Position", doc.requested_position)
	if position.company != doc.company or position.department != doc.department:
		frappe.throw(_("Position must match the request company and department."))
	if not internal() and position.status != "Active":
		frappe.throw(_("Recruitment requires an active position."))
	seen = set()
	for line in doc.lines:
		line.requested_qty = integer(line.requested_qty)
		if not doc.amends and line.requested_qty < 1:
			frappe.throw(_("Requested quantity must be positive."))
		if line.capacity in seen:
			frappe.throw(_("Use one line per capacity."))
		seen.add(line.capacity)
		cap = frappe.get_doc("Kandil Capacity", line.capacity)
		if (
			cap.company != doc.company
			or cap.department != doc.department
			or cap.designation != position.designation
			or not cap.position
		):
			frappe.throw(_("Capacity must match the job, company and department and have a position."))
		if not internal() and frappe.db.get_value("Kandil Position", cap.position, "status") != "Active":
			frappe.throw(_("Every recruitment location must have an active position."))
	if doc.need_reason == "Replacement" and not doc.replacement_employee:
		frappe.throw(_("Select the employee being replaced."))
	if doc.replacement_employee:
		emp = frappe.get_doc("Employee", doc.replacement_employee)
		# Enforce for native draft saves as well as the portal selector. Preserve an
		# unchanged stored reference if access is later restricted; never expose it.
		if not internal() and (not old or old.replacement_employee != doc.replacement_employee):
			from kandil_hr.recruitment.reference_access import can_reference_employee
			if not can_reference_employee(emp):
				frappe.throw(_("Replacement employee is outside your permitted recruitment scope."), frappe.PermissionError)
		if emp.company != doc.company or emp.department != doc.department:
			frappe.throw(_("Replacement employee must be within this department."))


def revision_permission(doc, user=None, ptype=None):
	from kandil_hr.recruitment.history_access import allowed

	if ptype not in ("read", "select", "print"):
		return False
	return allowed(doc, user)


def revision_query(user=None):
	from kandil_hr.recruitment.history_access import condition

	return condition(user)


def authority_query(user=None):
	from kandil_hr.foundation.security import scope_query

	return scope_query("Kandil Authority Rule", user)
