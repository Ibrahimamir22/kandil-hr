"""Pilot controls: all business transitions go through server-checked actions."""

import hashlib

import frappe
from frappe.model.document import Document
from frappe.utils import cint, date_diff, getdate


def enabled():
	return bool(frappe.conf.get("kandil_pilot_enabled"))


def internal():
	return bool(frappe.flags.get("kandil_transition"))


def deny(message):
	frappe.throw(frappe._(message), frappe.PermissionError)


def enabled_guard():
	if not enabled():
		deny("Kandil recruitment pilot is not enabled on this site.")


def identity(*parts):
	return hashlib.sha256("|".join(str(x) for x in parts).encode()).hexdigest()[:24]


def integer(value):
	try:
		number = float(value)
		if not number.is_integer() or number < 0:
			raise ValueError
		return int(number)
	except ValueError, TypeError:
		frappe.throw(frappe._("Quantities must be non-negative whole numbers."))


class KandilCapacity(Document):
	def autoname(self):
		self.name = (
			"KCAP-" + identity(self.company, self.department, self.designation, self.branch, self.position)
			if self.get("position")
			else "KCAP-" + identity(self.company, self.department, self.designation, self.branch)
		)

	def validate(self):
		enabled_guard()
		old = self.get_doc_before_save()
		if self.get("position"):
			p = frappe.get_doc("Kandil Position", self.position)
			if any(self.get(k) != p.get(k) for k in ["company", "department", "designation", "branch"]):
				frappe.throw(frappe._("Capacity dimensions must match the position."))
			if frappe.db.exists("Kandil Capacity", {"position": self.position, "name": ["!=", self.name]}):
				frappe.throw(frappe._("A position can have only one capacity ledger."))
			if old and self.position != old.position:
				deny("Capacity position cannot change.")
		for k in ["structural", "occupied", "reserved", "open_slots"]:
			self.set(k, integer(self.get(k) or 0))
		if old and any(self.get(k) != old.get(k) for k in ["company", "department", "designation", "branch"]):
			deny("Capacity identity cannot change. Create a new capacity record.")
		if not internal():
			if any(cint(self.get(k)) != cint(old.get(k) if old else 0) for k in ["reserved", "open_slots"]):
				deny("Reservation counters are server managed.")
			if old and self.occupied != old.occupied:
				deny("Occupied count is a baseline on creation; joining changes it through the pilot.")
		if self.structural < self.occupied and (not old or self.structural != old.structural):
			frappe.throw(frappe._("Structural headcount cannot be below the occupied baseline."))
		if frappe.conf.get("kandil_parity_enabled"):
			from kandil_hr.organization.capacity import validate_capacity

			validate_capacity(self)
		self.available = self.structural - self.occupied - self.reserved - self.open_slots

	def on_trash(self):
		deny("Capacity history cannot be deleted through the pilot.")


class KandilRecruitmentRoute(Document):
	def autoname(self):
		self.name = "KROUTE-" + identity(self.company, self.department)

	def validate(self):
		enabled_guard()
		for field, role in [
			("manager_approver", "Kandil Approver"),
			("hr_approver", "Kandil Recruiter"),
			("exception_approver", "Kandil Sector Approver"),
		]:
			user = self.get(field)
			if not frappe.db.get_value("User", user, "enabled") or role not in frappe.get_roles(user):
				frappe.throw(frappe._("{0} must be an enabled user with {1}.").format(field, role))


class KandilRequestLine(Document):
	pass


class KandilApprovalStep(Document):
	pass


class KandilHiringRequest(Document):
	def _load_child_table_from_db(self, fieldname, child_doctype):
		if self.flags.for_update and fieldname == "approval_steps" and self.status == "Draft":
			return []  # Draft invariants forbid approval steps; avoids an empty range gap lock.
		return super()._load_child_table_from_db(fieldname, child_doctype)

	def before_insert(self):
		enabled_guard()
		self.requested_by = frappe.session.user
		self.status = "Draft"

	def validate(self):
		enabled_guard()
		from kandil_hr.recruitment.note_projection import shared_note
		self.decision_reason = shared_note(self.decision_note)
		if frappe.conf.get("kandil_parity_enabled"):
			from kandil_hr.recruitment.models import validate_request

			return validate_request(self)
		old = self.get_doc_before_save()
		if not internal():
			if self.status != "Draft" or (old and old.status != "Draft"):
				deny("Use the recruitment action buttons to change a submitted request.")
			if self.requested_by != frappe.session.user:
				deny("Only the requester can edit their draft.")
			if self.approval_steps or self.submitted_snapshot or self.needs_exception or self.decision_note:
				deny("Approval state is server managed.")
			if any(x.approved_qty or x.joined_qty or x.job_opening for x in self.lines):
				deny("Line outcomes are server managed.")
		if self.docstatus != 0:
			deny("Pilot request lifecycle uses action states, not native submit/cancel.")
		if not internal() and not {"Kandil Recruiter", "Kandil Sector Approver"}.intersection(
			frappe.get_roles()
		):
			employee = frappe.db.get_value(
				"Employee",
				{"user_id": frappe.session.user, "status": "Active"},
				["company", "department"],
				as_dict=True,
			)
			if not employee or employee.company != self.company or employee.department != self.department:
				deny("Requesters may request only for their assigned company and department.")
		if not self.lines:
			frappe.throw(frappe._("Add at least one location line."))
		seen = set()
		for line in self.lines:
			line.requested_qty = integer(line.requested_qty)
			if line.requested_qty < 1:
				frappe.throw(frappe._("Requested quantity must be positive."))
			if line.capacity in seen:
				frappe.throw(frappe._("Use one line per capacity/location."))
			seen.add(line.capacity)
			cap = frappe.get_doc("Kandil Capacity", line.capacity)
			if cap.company != self.company or cap.department != self.department:
				frappe.throw(frappe._("Every capacity must match the request company and department."))

	def on_trash(self):
		deny("Use Cancel; recruitment history is retained.")


class KandilDelegation(Document):
	def validate(self):
		enabled_guard()
		if (
			frappe.conf.get("kandil_parity_enabled")
			and not self.revoked
			and {"Kandil CEO Approver", "Kandil Board Approver"}.intersection(
				frappe.get_roles(self.from_user)
			)
		):
			deny("CEO and Board delegation requires a separately approved authority workflow.")
		if self.from_user == self.to_user:
			frappe.throw(frappe._("Self delegation is not allowed."))
		if getdate(self.to_date) < getdate(self.from_date) or date_diff(self.to_date, self.from_date) > 89:
			frappe.throw(frappe._("Delegation must cover 1 to 90 calendar days."))
		for user in [self.from_user, self.to_user]:
			if not frappe.db.get_value("User", user, "enabled"):
				frappe.throw(frappe._("Delegation requires enabled users."))
		if "Kandil Approver" not in frappe.get_roles(self.to_user):
			frappe.throw(frappe._("Delegate needs the Kandil Approver role."))
		old = self.get_doc_before_save()
		if old and any(
			self.get(k) != old.get(k)
			for k in ["company", "department", "from_user", "to_user", "from_date", "to_date", "reason"]
		):
			deny("Delegation is immutable; revoke it and create a new record.")
		if old and old.revoked and not self.revoked:
			deny("A revoked delegation cannot be reactivated.")

	def on_trash(self):
		deny("Revoke delegations instead of deleting their history.")


class KandilRecruitmentEvent(Document):
	def before_insert(self):
		if not internal():
			deny("Audit events are generated only by recruitment actions.")

	def validate(self):
		if not self.is_new():
			deny("Audit events are immutable.")
		from kandil_hr.recruitment.note_projection import shared_note
		self.public_note = shared_note(self.note)

	def on_trash(self):
		deny("Audit events cannot be deleted.")
