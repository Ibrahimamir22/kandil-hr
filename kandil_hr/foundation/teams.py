"""Conservative candidate-team policy; deployment default pending HR acceptance.

Opening metadata stays scope-readable for allocation. Candidate records require
current team membership or an explicit company HR authority override. Native role
permissions, request scope and offer-sensitive grants remain additional checks.
Only current company HR/sector authorities may allocate teams, preventing a
non-team recruiter from granting themself candidate access. No silent reassignment.
"""

import frappe


def can_manage_team(doc, user=None):
	from kandil_hr.foundation.security import request_scope

	user = user or frappe.session.user
	if user == "Administrator":
		return True
	if not frappe.db.get_value("User", user, "enabled") or not request_scope(doc, user, "manage"):
		return False
	settings = frappe.db.get_value(
		"Kandil Organization Settings", doc.company, ["hr_approver", "sector_approver"], as_dict=True
	)
	if not settings:
		return False
	roles = frappe.get_roles(user)
	return bool(
		(settings.hr_approver == user and "Kandil Recruiter" in roles)
		or (settings.sector_approver == user and "Kandil Sector Approver" in roles)
	)


def candidate_access(opening, request, user=None):
	from kandil_hr.recruitment.models import enabled

	if not enabled():
		return True
	user = user or frappe.session.user
	if can_manage_team(request, user):
		return True
	if "Kandil Recruiter" not in frappe.get_roles(user):
		return False
	return user == opening.get("custom_kandil_lead") or any(
		row.user == user for row in opening.get("custom_kandil_team") or []
	)


def effective_lead(opening):
	"""Return the still-authorized stored lead, or None; never change assignment."""
	from kandil_hr.foundation.security import linked_request, request_scope

	lead = opening.get("custom_kandil_lead")
	if (
		not lead
		or not frappe.db.get_value("User", lead, "enabled")
		or "Kandil Recruiter" not in frappe.get_roles(lead)
	):
		return None
	request = linked_request(opening)
	return lead if request and request_scope(request, lead, "manage") else None


def is_unassigned(opening):
	return effective_lead(opening) is None


def candidate_opening_condition(user):
	"""Condition for tabJob Opening; detail/query/export use the same policy."""
	from kandil_hr.foundation.security import scope_query
	from kandil_hr.recruitment.models import enabled

	if not enabled() or user == "Administrator":
		return "1=1"
	u = frappe.db.escape(user)
	roles = frappe.get_roles(user)
	conditions = []
	if "Kandil Recruiter" in roles:
		team_type = frappe.get_meta("Job Opening").get_field("custom_kandil_team").options
		conditions.append(
			f"(`tabJob Opening`.custom_kandil_lead={u} OR EXISTS (SELECT 1 FROM `tab{team_type}` team WHERE team.parent=`tabJob Opening`.name AND team.parenttype='Job Opening' AND team.parentfield='custom_kandil_team' AND team.user={u}))"
		)
	contacts = []
	if "Kandil Recruiter" in roles:
		contacts.append(f"settings.hr_approver={u}")
	if "Kandil Sector Approver" in roles:
		contacts.append(f"settings.sector_approver={u}")
	if contacts:
		conditions.append(
			f"(EXISTS (SELECT 1 FROM `tabKandil Organization Settings` settings WHERE settings.company=`tabJob Opening`.company AND ({' OR '.join(contacts)})) AND `tabJob Opening`.custom_kandil_request IN (SELECT name FROM `tabKandil Hiring Request` WHERE {scope_query('Kandil Hiring Request', user, 'manage')}))"
		)
	return "(" + " OR ".join(conditions) + ")" if conditions else "1=0"
