import frappe
from frappe.utils import today

from kandil_hr.pilot.models import enabled


def request_query(user=None):
	if not enabled():
		return "1=0"
	user = user or frappe.session.user
	if user == "Administrator" or {"Kandil Recruiter", "Kandil Sector Approver"}.intersection(
		frappe.get_roles(user)
	):
		return ""
	u = frappe.db.escape(user)
	day = frappe.db.escape(today())
	return f"""(`tabKandil Hiring Request`.requested_by={u} OR EXISTS (
        SELECT 1 FROM `tabKandil Approval Step` s WHERE s.parent=`tabKandil Hiring Request`.name
        AND (s.principal={u} OR EXISTS (SELECT 1 FROM `tabKandil Delegation` d
        WHERE d.from_user=s.principal AND d.to_user={u} AND d.revoked=0
        AND d.company=`tabKandil Hiring Request`.company AND d.department=`tabKandil Hiring Request`.department
        AND d.from_date<={day} AND d.to_date>={day}))))"""


def request_permission(doc, user=None, ptype=None):
	if not enabled():
		return False
	user = user or frappe.session.user
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
	from kandil_hr.pilot.api import delegate_for

	return (
		True
		if any(s.principal == user or delegate_for(doc, s.principal, user) for s in doc.approval_steps)
		else False
	)


def event_permission(doc, user=None, ptype=None):
	if ptype != "read":
		return True
	return request_permission(frappe.get_doc("Kandil Hiring Request", doc.request), user, "read")


def event_query(user=None):
	condition = request_query(user)
	if not condition:
		return ""
	return f"`tabKandil Recruitment Event`.request IN (SELECT name FROM `tabKandil Hiring Request` WHERE {condition})"
