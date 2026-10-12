"""Confidential HR notes are separate records, never part of shared requests.

The shared snapshot schema is deliberately explicit: new/custom salary or HR-only
fields do not become public just because somebody adds them to a form. Existing
legacy snapshots are not rewritten; they require a separate reviewed migration.
"""

import frappe
from frappe import _
from frappe.model.document import Document

from kandil_hr.foundation.security import request_scope, scope_query
from kandil_hr.recruitment.models import enabled, guard

REQUEST_FIELDS = (
	"doctype",
	"name",
	"company",
	"department",
	"title",
	"requested_by",
	"status",
	"exception_reason",
	"needs_exception",
	"decision_note",
	"requested_position",
	"request_kind",
	"amends",
	"baseline_modified",
	"revision",
	"need_reason",
	"replacement_employee",
	"employment_type",
	"required_by",
	"qualifications",
	"skills_required",
	"experience_required",
	"working_conditions",
	"requested_priority",
	"hr_priority",
	"route_snapshot",
	"creation",
	"modified",
	"owner",
	"modified_by",
	"docstatus",
)
LINE_FIELDS = (
	"name",
	"idx",
	"capacity",
	"requested_qty",
	"approved_qty",
	"joined_qty",
	"job_opening",
	"reserved_qty",
	"proposed_qty",
	"closed_qty",
)
STEP_FIELDS = (
	"name",
	"idx",
	"principal",
	"authority",
	"decision",
	"actor",
	"decided_at",
	"comment",
	"step_key",
	"waiting_since",
	"authority_position",
	"board_evidence",
)


def shared_snapshot(doc):
	value = {key: doc.get(key) for key in REQUEST_FIELDS}
	value["lines"] = [{key: row.get(key) for key in LINE_FIELDS} for row in doc.lines]
	value["approval_steps"] = [{key: row.get(key) for key in STEP_FIELDS} for row in doc.approval_steps]
	return value


def protect_noted_request_scope(doc, old):
	"""Native save already locked the request; note creation uses the same lock.

	Use a current locking read so a note committed while save waited cannot be
	missed by an older repeatable-read snapshot. Quantities/text may still change.
	"""
	if not old:
		return
	changed = any(doc.get(key) != old.get(key) for key in ("company", "department")) or {
		row.capacity for row in doc.lines
	} != {row.capacity for row in old.lines}
	if changed and frappe.db.sql(
		"SELECT name FROM `tabKandil HR Note` WHERE request=%s LIMIT 1 FOR UPDATE", (doc.name,)
	):
		frappe.throw(
			_(
				"This request has confidential HR notes. Create a new request to change its company, department or locations."
			),
			frappe.PermissionError,
		)


def can_read_notes(request, user=None):
	user = user or frappe.session.user
	return bool(
		enabled()
		and (user == "Administrator" or "Kandil Recruiter" in frappe.get_roles(user))
		and request_scope(request, user, "sensitive")
		and request.has_permission("read", user=user)
	)


def note_permission(doc, user=None, ptype=None):
	if not enabled() or ptype not in (None, "read", "select", "create", "write"):
		return False
	if ptype == "write" and not doc.is_new():
		return False
	if not doc.request:
		return False
	request = frappe.get_doc("Kandil Hiring Request", doc.request)
	return can_read_notes(request, user)


def note_query(user=None):
	user = user or frappe.session.user
	if not enabled() or (user != "Administrator" and "Kandil Recruiter" not in frappe.get_roles(user)):
		return "1=0"
	condition = scope_query("Kandil Hiring Request", user, "sensitive") or "1=1"
	return (
		"`tabKandil HR Note`.request IN (SELECT name FROM `tabKandil Hiring Request` WHERE " + condition + ")"
	)


class KandilHRNote(Document):
	def validate(self):
		guard()
		if not self.is_new():
			frappe.throw(
				_("Confidential HR notes are immutable; add a correction note instead."),
				frappe.PermissionError,
			)
		if not self.note or not self.note.strip() or len(self.note) > 10000:
			frappe.throw(_("Enter a confidential HR note of 1 to 10000 characters."))
		company = frappe.db.get_value("Kandil Hiring Request", self.request, "company")
		frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
		request = frappe.get_doc("Kandil Hiring Request", self.request, for_update=True)
		request.check_permission("read")
		from kandil_hr.foundation.mutation_access import assert_current_request_scope

		assert_current_request_scope(request, capability="sensitive", required_roles=("Kandil Recruiter",))
		assert_current_request_scope(request, capability="manage", required_roles=("Kandil Recruiter",))
		self.company = request.company
		self.department = request.department
		# No shared request save, Comment, Version, recruitment event or outbox message.
		self.owner = frappe.session.user

	def on_trash(self):
		frappe.throw(_("Confidential HR notes cannot be deleted."), frappe.PermissionError)
