"""Native Department maintenance by a scoped structural authority on parity."""

import json

import frappe
from frappe import _

from kandil_hr.foundation.models import record_security_event
from kandil_hr.foundation.mutation_access import assert_current_scope
from kandil_hr.foundation.security import has_scope, scope_query
from kandil_hr.organization.current import rows
from kandil_hr.organization.models import internal, lock_company

FIELDS = ("department_name", "company", "parent_department", "is_group", "disabled")
ROLES = {"Kandil Sector Approver", "System Manager"}


def enabled():
	return bool(frappe.conf.get("kandil_parity_enabled"))


def setup_context():
	return frappe.session.user == "Administrator" and not getattr(frappe.local, "request", None)


def permission(doc, user=None, ptype=None):
	if not enabled():
		return True
	user = user or frappe.session.user
	if user == "Administrator":
		return True
	if ptype in ("write", "create", "delete", "submit", "cancel"):
		if not ROLES.intersection(frappe.get_roles(user)):
			return False
		if doc.company and not has_scope(user, doc.company, capability="manage"):
			return False
	elif not doc.company or not frappe.db.sql(
		"SELECT name FROM `tabDepartment` WHERE name=%s AND (" + query(user) + ")", (doc.name,)
	):
		return False
	return True


def query(user=None):
	if not enabled():
		return ""
	# Department is the unit itself, not a document with a department column.
	return (
		scope_query("Department", user)
		.replace(
			"IFNULL(g.department,'')=''",
			"(IFNULL(g.department,'')='' OR g.department=`tabDepartment`.name)",
			1,
		)
		.replace("IFNULL(g.branch,'')=''", "1=1")
	)


def validate(doc, method=None):
	if not enabled() or internal() or setup_context():
		return
	if not doc.company:
		frappe.throw(_("Select a company for this organization unit."))
	lock_company(doc.company)
	old = doc.get_doc_before_save()
	if old and old.company != doc.company:
		frappe.throw(_("Organization units cannot move between companies."))
	if (doc.get("payroll_cost_center") or "") != ((old.get("payroll_cost_center") if old else None) or ""):
		frappe.throw(
			_("Unit maintenance cannot change payroll cost center configuration."), frappe.PermissionError
		)
	if not doc.department_name or len(doc.department_name.strip()) < 2:
		frappe.throw(_("Enter a unit name of at least two characters."))
	if doc.parent_department:
		parent = frappe.get_doc("Department", doc.parent_department, for_update=True)
		# The native neutral root is shared across the company's Department trees.
		if parent.company and parent.company != doc.company:
			frappe.throw(_("The parent unit must belong to the same company."))
		if not parent.is_group or parent.disabled:
			frappe.throw(_("The parent unit must be an active group."))
	if not old or any(doc.get(k) != old.get(k) for k in FIELDS):
		reason = doc.get("custom_kandil_change_reason")
		if not isinstance(reason, str) or len(reason.strip()) < 3 or len(reason) > 2000:
			frappe.throw(_("Enter a unit change reason between 3 and 2000 characters."))
	if doc.disabled and (not old or not old.disabled):
		if rows(
			"Department", filters={"parent_department": doc.name, "disabled": 0}, fields=["name"]
		) or rows("Kandil Position", filters={"department": doc.name, "status": "Active"}, fields=["name"]):
			frappe.throw(_("Close active child units and positions before disabling this unit."))


def before_save(doc, method=None):
	if enabled() and not internal() and not setup_context():
		assert_current_scope(doc.company, required_roles=tuple(ROLES))


def on_update(doc, method=None):
	if not enabled() or internal() or setup_context():
		return
	old = doc.get_doc_before_save()
	before = {key: old.get(key) for key in FIELDS} if old else None
	after = {key: doc.get(key) for key in FIELDS}
	if before != after:
		record_security_event(
			"Organization unit maintained",
			frappe.session.user,
			json.dumps(
				dict(
					actor=frappe.session.user,
					before=before,
					after=after,
					reason=doc.custom_kandil_change_reason,
				),
				ensure_ascii=False,
			),
			reference=doc.name,
		)


def install():
	"""Parity-only native permission/schema setup; no upstream source changes."""
	if not enabled():
		return {"enabled": False}
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
	from frappe.permissions import add_permission, update_permission_property

	create_custom_fields(
		{
			"Department": [
				dict(
					fieldname="custom_kandil_change_reason",
					label="Unit Change Reason",
					fieldtype="Small Text",
					insert_after="disabled",
					description="Reason for the current unit creation or update.",
				)
			]
		}
	)
	for role in ("Kandil Sector Approver",):
		add_permission("Department", role, 0)
		for action in ("read", "write", "create", "select", "report"):
			update_permission_property("Department", role, 0, action, 1)
	add_permission("Department", "Kandil Requester", 0)
	for action in ("read", "select"):
		update_permission_property("Department", "Kandil Requester", 0, action, 1)
	frappe.clear_cache(doctype="Department")
	return {
		"doctype": "Department",
		"role": "Kandil Sector Approver",
		"scope": "company manage",
		"reason_required": True,
	}
