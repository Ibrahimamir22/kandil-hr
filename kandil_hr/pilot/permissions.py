import frappe
from frappe.utils import today

from kandil_hr.foundation.security import enabled as foundation_enabled
from kandil_hr.foundation.security import request_scope, scope_query
from kandil_hr.pilot.models import enabled


def request_query(user=None, include_amendments=True, include_privileged=True):
	if not enabled():
		return "1=0"
	user = user or frappe.session.user
	scope = scope_query("Kandil Hiring Request", user)
	if user == "Administrator" or (include_privileged and {"Kandil Recruiter", "Kandil Sector Approver"}.intersection(
		frappe.get_roles(user)
	)):
		return scope
	u = frappe.db.escape(user)
	day = frappe.db.escape(today())
	extra, board = "", "1=0"
	if frappe.conf.get("kandil_parity_enabled"):
		from kandil_hr.foundation.clock import today_cairo
		from kandil_hr.foundation.delegation import delegation_sql
		from kandil_hr.recruitment.authority import board_query

		extra = (
			" AND "
			+ delegation_sql("d", process="APPROVALS")
			+ " AND d.from_user<>`tabKandil Hiring Request`.requested_by"
		)
		board = board_query(user)
		if not include_privileged:
			board = f"({board}) AND EXISTS (SELECT 1 FROM `tabHas Role` br WHERE br.parent={u} AND br.parenttype='User' AND br.role='Kandil Board Approver')"
		day = frappe.db.escape(str(today_cairo()))
	relationship = f"""(`tabKandil Hiring Request`.requested_by={u} OR EXISTS (
        SELECT 1 FROM `tabKandil Approval Step` s WHERE s.parent=`tabKandil Hiring Request`.name
        AND (s.principal={u} OR EXISTS (SELECT 1 FROM `tabKandil Delegation` d
        WHERE d.from_user=s.principal AND d.to_user={u} AND d.revoked=0
        AND d.company=`tabKandil Hiring Request`.company AND d.department=`tabKandil Hiring Request`.department
        AND d.from_date<={day} AND d.to_date>={day} {extra}))) OR {board})"""
	if include_amendments and frappe.conf.get("kandil_parity_enabled"):
		from kandil_hr.recruitment.amendment_access import condition

		relationship = f"({relationship}) OR ({condition(user)})"
	return f"({scope}) AND ({relationship})" if scope else relationship


def request_permission(doc, user=None, ptype=None):
	if not enabled():
		return False
	user = user or frappe.session.user
	if foundation_enabled() and not request_scope(
		doc,
		user,
		"read" if ptype in [None, "read", "select", "print", "export", "report", "email"] else "manage",
	):
		return False
	if user == "Administrator" or {"Kandil Recruiter", "Kandil Sector Approver"}.intersection(
		frappe.get_roles(user)
	):
		return True
	if doc.is_new():
		return True
	if doc.requested_by == user:
		return True
	if ptype not in ["read", "select", "print", "email"]:
		return False
	if frappe.conf.get("kandil_parity_enabled"):
		from kandil_hr.recruitment.authority import board_reader

		from kandil_hr.recruitment.amendment_access import allowed

		if allowed(doc, user):
			return True
		if board_reader(doc, user):
			return True
	from kandil_hr.pilot.api import delegate_for

	return (
		True
		if any(s.principal == user or delegate_for(doc, s.principal, user) for s in doc.approval_steps)
		else False
	)


def event_permission(doc, user=None, ptype=None):
	if frappe.conf.get("kandil_parity_enabled"):
		from kandil_hr.recruitment.event_access import allowed
		return ptype in (None, "read", "select", "print", "report") and allowed(doc, user)
	if ptype not in (None, "read", "select", "print", "export", "report", "email"):
		return False
	return request_permission(frappe.get_doc("Kandil Hiring Request", doc.request), user, "read")


def event_query(user=None):
	if frappe.conf.get("kandil_parity_enabled"):
		from kandil_hr.recruitment.event_access import condition
		return condition(user)
	condition = request_query(user)
	if not condition:
		return ""
	return f"`tabKandil Recruitment Event`.request IN (SELECT name FROM `tabKandil Hiring Request` WHERE {condition})"
