"""Native organization records; all approvals and immutable revisions are server controlled."""

import json

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import cint, get_datetime, getdate

from kandil_hr.foundation.mutation_access import assert_current_scope, current_identity
from kandil_hr.foundation.security import assert_scope
from kandil_hr.organization import rules
from kandil_hr.organization.contracts import AUTHORITY_ROLES, SETTINGS_AUTHORITIES
from kandil_hr.organization.current import rows as current_rows
from kandil_hr.pilot.models import enabled_guard


def internal():
	return bool(frappe.flags.get("kandil_organization_transition"))


def fail(message):
	frappe.throw(_(message), frappe.ValidationError)


def lock_company(company):
	frappe.db.sql("select name from `tabCompany` where name=%s for update", company)


def guard(doc):
	enabled_guard()
	assert_scope(doc.company, doc.get("department"), doc.get("branch"), capability="manage")
	old = doc.get_doc_before_save()
	if old:
		assert_scope(old.company, old.get("department"), old.get("branch"), capability="manage")
		if old.company != doc.company:
			fail("Organization record company cannot change.")
	lock_company(doc.company)
	if doc.get("department") and frappe.db.get_value("Department", doc.department, "company") != doc.company:
		fail("Department must belong to the selected company.")


def dates(doc):
	if doc.get("valid_until") and getdate(doc.valid_until) < getdate(doc.valid_from):
		fail("Valid Until cannot be before Valid From.")


def position_guard(doc):
	p = frappe.get_doc("Kandil Position", doc.position, for_update=True)
	if (doc.company, doc.department, doc.get("branch") or "") != (
		p.company,
		p.department,
		p.get("branch") or "",
	):
		fail("Position scope must match company, department and branch.")
	return p


def protected(doc, fields):
	if internal():
		return
	old = doc.get_doc_before_save()
	for field in fields:
		if doc.get(field) != (old.get(field) if old else None):
			# Draft is the only client-supplied initial status.
			if not old and field == "status" and doc.get(field) == "Draft":
				continue
			if not old and not doc.get(field):
				continue
			fail("This field is managed by an authorized server action.")


def draft_author(doc, old):
	if old and old.get("status") == "Draft" and old.owner != frappe.session.user and not internal():
		frappe.throw(_("Only the author can edit draft organization content."), frappe.PermissionError)


class HistoryDocument(Document):
	def before_validate(self):
		old = self.get_doc_before_save()
		if old and (self.owner != old.owner or get_datetime(self.creation) != get_datetime(old.creation)):
			fail("Organization record authorship and creation time are immutable.")

	def before_save(self):
		"""Final mutation authorization after native validation/domain locks.

		Frappe runs before_save after validate and before the database write.
		All organization history deletions remain unconditionally denied.
		"""
		if not frappe.conf.get("kandil_foundation_enabled"):
			return
		old = self.get_doc_before_save()
		users = {frappe.session.user, self.owner}
		users.update(row.principal for row in self.get("approval_steps") or [] if row.principal)
		if self.doctype == "Kandil Organization Settings":
			users.update(self.get(field) for field in SETTINGS_AUTHORITIES if self.get(field))
		if self.doctype == "Kandil Position Assignment" and self.get("user"):
			users.add(self.user)
		for user in sorted(users - {None, ""}):
			frappe.db.sql("SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE", user)
		permission = "create" if self.is_new() else "write"
		roles = tuple(p.role for p in self.meta.permissions if p.get(permission) and not p.permlevel)
		if internal():
			roles = (
				"Kandil Recruiter",
				"Kandil Sector Approver",
				"Kandil Approver",
				"Kandil CEO Approver",
				"Kandil Board Approver",
				"System Manager",
			)
		if old and old.get("status") == "Draft" and self.get("status") in ("Approved", "Reviewed"):
			if self.doctype in ("Kandil JD Revision", "Kandil Grade Band", "Kandil Organization Import"):
				roles = ("Kandil Sector Approver",)
		if old and self.doctype == "Kandil Structure Change":
			previous = {row.step_key: row.decision for row in old.approval_steps}
			decided = [
				row
				for row in self.approval_steps
				if previous.get(row.step_key) == "Pending" and row.decision != "Pending"
			]
			if decided:
				roles = tuple(AUTHORITY_ROLES[row.authority] for row in decided)
		company_wide = self.doctype in (
			"Kandil JD Revision",
			"Kandil Structure Change",
			"Kandil Structure Snapshot",
			"Kandil Organization Import",
			"Kandil Organization Settings",
		)
		for scope in [self] + ([old] if old else []):
			assert_current_scope(
				scope.company,
				None if company_wide else scope.get("department"),
				None if company_wide else scope.get("branch"),
				required_roles=roles,
			)
		if self.doctype == "Kandil Grade Band":
			assert_current_scope(self.company, capability="sensitive")
		if self.doctype == "Kandil Organization Settings":
			for field, authority in SETTINGS_AUTHORITIES.items():
				if self.get(field) and AUTHORITY_ROLES[authority] not in current_identity(self.get(field)):
					fail("Configured authorities must be enabled users with the appropriate approval role.")
		if self.doctype == "Kandil Position Assignment" and self.get("user"):
			historical = internal() and self.valid_until and getdate(self.valid_until) < getdate()
			if not historical:
				current_identity(self.user)

	def on_trash(self):
		fail("Organization history cannot be deleted. Close or supersede the record.")


class KandilOrganizationSettings(HistoryDocument):
	def autoname(self):
		self.name = self.company

	def validate(self):
		guard(self)
		if self.name and not self.is_new() and self.name != self.company:
			fail("Organization settings company cannot change.")
		roles = {field: AUTHORITY_ROLES[authority] for field, authority in SETTINGS_AUTHORITIES.items()}
		for field, role in roles.items():
			user = self.get(field)
			if user and (
				not frappe.db.get_value("User", user, "enabled") or role not in frappe.get_roles(user)
			):
				fail("Configured authorities must be enabled users with the appropriate approval role.")


class KandilPosition(HistoryDocument):
	def autoname(self):
		self.position_code = self.position_code or make_autoname("KPOS-.#####")
		self.name = self.position_code

	def validate(self):
		guard(self)
		if cint(self.structural) < 1 or float(self.structural) != cint(self.structural):
			fail("Structural seats must be a positive whole number.")
		old = self.get_doc_before_save()
		if old:
			for field in ["company", "department", "branch", "designation", "position_code"]:
				if self.get(field) != old.get(field):
					fail("Position identity is immutable. Create a new position for another scope or job.")
			if not internal() and any(
				self.get(f) != old.get(f) for f in ["structural", "status", "closed_on"]
			):
				fail("Use an approved structure change to resize or close a position.")
		elif frappe.conf.get("kandil_parity_enabled") and not internal():
			fail("Use a structure-change request or reviewed baseline import to create approved positions.")
		elif self.status != "Active" or self.closed_on:
			fail("New positions must be active.")
		elif cint(self.structural) != 1 and not internal():
			fail(
				"New positions default to one seat. Additional seats require a reviewed import or structure change."
			)


class KandilPositionHierarchy(HistoryDocument):
	def validate(self):
		guard(self)
		dates(self)
		position_guard(self)
		if not internal():
			fail("Hierarchy revisions must be created by an approved structure change.")
		if self.parent_position:
			if frappe.db.get_value("Kandil Position", self.parent_position, "company") != self.company:
				fail("Parent position must belong to the same company.")
		rows = current_rows(
			self.doctype,
			filters={"company": self.company, "name": ["!=", self.name or ""]},
			fields=["position", "parent_position", "valid_from", "valid_until"],
		)
		rows.append(self.as_dict())
		try:
			rules.validate_hierarchy(rows)
		except ValueError as exc:
			fail(str(exc))


class KandilPositionAssignment(HistoryDocument):
	def validate(self):
		guard(self)
		dates(self)
		p = position_guard(self)
		if p.closed_on and (not self.valid_until or getdate(self.valid_until) >= getdate(p.closed_on)):
			fail("An assignment cannot overlap a position closure.")
		employee = frappe.get_doc("Employee", self.employee, for_update=True)
		if employee.company != self.company:
			fail("Employee must belong to the selected company.")
		historical = internal() and self.valid_until and getdate(self.valid_until) < getdate()
		if self.user and (
			employee.get("user_id") != self.user
			or (not historical and not frappe.db.get_value("User", self.user, "enabled"))
		):
			fail("Assignment user must be the enabled user linked to the employee.")
		old = self.get_doc_before_save()
		if old and not internal():
			if any(
				(
					getdate(self.get(k)) != getdate(old.get(k))
					if k == "valid_from"
					else (self.get(k) or "") != (old.get(k) or "")
				)
				for k in [
					"employee",
					"position",
					"company",
					"department",
					"branch",
					"valid_from",
					"user",
					"allocation",
				]
			):
				fail("Assignment identity is immutable. End the assignment and create a new record.")
			if self.get("valid_until") != old.get("valid_until") and (
				not self.valid_until or getdate(self.valid_until) < getdate()
			):
				fail("Assignment end dates cannot be removed or backdated.")
		rows = current_rows(
			self.doctype,
			filters={"company": self.company, "name": ["!=", self.name or ""]},
			fields=["position", "employee", "user", "valid_from", "valid_until", "allocation"],
		)
		for row in rows:
			if (
				row.employee == self.employee
				and row.allocation == self.allocation == "Primary"
				and rules.overlap(row, self.as_dict())
			):
				fail("An employee cannot have overlapping primary position assignments.")
			if (
				row.position == self.position
				and row.allocation == self.allocation == "Acting"
				and rules.overlap(row, self.as_dict())
			):
				fail("A position cannot have overlapping acting authorities.")
		if (
			rules.peak_occupancy([r for r in rows if r.position == self.position] + [self.as_dict()])
			> p.structural
		):
			fail("Position assignments exceed structural seats.")


class KandilGradeBand(HistoryDocument):
	def validate(self):
		guard(self)
		dates(self)
		if self.minimum < 0 or self.maximum < self.minimum:
			fail("Grade range must have a non-negative minimum and a valid maximum.")
		old = self.get_doc_before_save()
		draft_author(self, old)
		if old and old.status == "Approved":
			fail("Approved grade versions are immutable.")
		protected(self, ["status", "approved_by"])
		if self.status == "Approved":
			for row in current_rows(
				self.doctype,
				filters={
					"company": self.company,
					"grade_code": self.grade_code,
					"status": "Approved",
					"name": ["!=", self.name],
				},
				fields=["valid_from", "valid_until"],
			):
				if rules.overlap(row, self.as_dict()):
					fail("Approved grade versions cannot overlap.")


class KandilJDCompetency(Document):
	def validate(self):
		if frappe.conf.get("kandil_parity_enabled"):
			fail("Job description competencies must be saved through their parent revision.")

	def on_trash(self):
		if frappe.conf.get("kandil_parity_enabled"):
			fail("Job description competencies must be saved through their parent revision.")


class KandilJDRevision(HistoryDocument):
	def validate(self):
		guard(self)
		position = position_guard(self)
		assert_scope(self.company, capability="manage")
		self.designation = position.designation
		old = self.get_doc_before_save()
		draft_author(self, old)
		if old and old.status == "Approved":
			fail("Approved job descriptions are immutable. Create a new revision.")
		protected(self, ["status", "approved_by", "approved_at", "revision"])
		try:
			from kandil_hr.organization.jd_rules import validate

			warnings = validate(
				[r.as_dict() for r in self.responsibility_rows],
				[r.as_dict() for r in self.kpis],
				self.job_level,
				self.responsibility_reason,
			)
			for warning in warnings:
				frappe.msgprint(_(warning), alert=True, indicator="orange")
		except ValueError as exc:
			fail(str(exc))
		if self.supersedes:
			prior = frappe.get_doc(self.doctype, self.supersedes, for_update=True)
			prior_job = prior.get("designation") or frappe.db.get_value(
				"Kandil Position", prior.position, "designation"
			)
			if (
				prior.company != self.company
				or prior_job != self.designation
				or prior.status != "Approved"
				or getdate(self.valid_from) <= getdate(prior.valid_from)
			):
				fail(
					"A revision must supersede an approved description for the same position on a later date."
				)
		if self.grade_band:
			grade = frappe.get_doc("Kandil Grade Band", self.grade_band, for_update=True)
			if (
				grade.company != self.company
				or grade.status != "Approved"
				or not rules.effective(grade.as_dict(), self.valid_from)
			):
				fail("Select an approved grade version valid on the job description date.")


class KandilStructureChange(HistoryDocument):
	def validate(self):
		guard(self)
		old = self.get_doc_before_save()
		draft_author(self, old)
		if old and old.status in ["Approved", "Rejected"]:
			fail("Decided structure changes are immutable.")
		if old and old.status == "Pending" and not internal():
			fail("Pending structure changes must use authorized approval actions.")
		protected(
			self,
			[
				"status",
				"approved_by",
				"approved_at",
				"snapshot",
				"preview_hash",
				"snapshot_hash",
				"command_history",
				"route_snapshot",
				"created_positions_json",
			],
		)
		if not internal() and self.approval_steps:
			fail("Approval steps are managed by the server.")
		if (
			old
			and old.status == "Pending"
			and any(self.get(k) != old.get(k) for k in ["company", "effective_on", "reason", "changes_json"])
		):
			fail("Pending structure change contents cannot change.")
		try:
			changes = json.loads(self.changes_json)
			if not isinstance(changes, list) or not changes or len(changes) > 200:
				raise ValueError
		except ValueError, TypeError:
			fail("Proposed changes must be a non-empty JSON list with at most 200 operations.")
		if getdate(self.effective_on) < getdate() and self.status != "Rejected":
			fail("Structure changes cannot be backdated.")
		if old and (self.changes_json != old.changes_json or self.effective_on != old.effective_on):
			self.preview_hash = None
			self.snapshot_hash = None


class KandilStructureSnapshot(HistoryDocument):
	def validate(self):
		guard(self)
		if not internal() or not self.is_new():
			fail("Structure snapshots are immutable and created by server actions.")


class KandilOrganizationImport(HistoryDocument):
	def validate(self):
		guard(self)
		old = self.get_doc_before_save()
		draft_author(self, old)
		protected(self, ["status", "preview_json", "digest", "reviewed_by", "result_json"])
		if old and old.status in ["Reviewed", "Applied"] and not internal():
			fail("Reviewed imports are frozen. Create a new import batch for changes.")
