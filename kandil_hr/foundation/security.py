"""Scope is an additional restriction, never a replacement for Frappe role permissions.

No grant caching: revocation must affect the next action. Administrator remains a
documented break-glass account. Disabled ordinary users never receive a scope.
"""

import frappe
from frappe import _
from frappe.utils import cint, today


def enabled():
	return bool(frappe.conf.get("kandil_pilot_enabled") and frappe.conf.get("kandil_foundation_enabled"))


def has_scope(user, company, department=None, branch=None, capability="read"):
	if not enabled():
		return True
	if user == "Administrator":
		return True
	if not company or user == "Guest" or not frappe.db.get_value("User", user, "enabled"):
		return False
	if capability not in ("read", "manage", "sensitive"):
		return False
	filters = {"user": user, "company": company, "revoked": 0, "valid_from": ["<=", today()]}
	grants = frappe.get_all(
		"Kandil Access Grant",
		filters=filters,
		fields=["department", "branch", "valid_until", "can_manage_recruitment", "can_view_sensitive"],
	)
	for grant in grants:
		if grant.valid_until and str(grant.valid_until) < today():
			continue
		if grant.department and grant.department != department:
			continue
		if grant.branch and grant.branch != branch:
			continue
		if capability == "manage" and not cint(grant.can_manage_recruitment):
			continue
		if capability == "sensitive" and not cint(grant.can_view_sensitive):
			continue
		return True
	return False


def assert_scope(company, department=None, branch=None, user=None, capability="manage"):
	if not has_scope(user or frappe.session.user, company, department, branch, capability):
		frappe.throw(
			_("Your access grant does not cover this company, department and location."),
			frappe.PermissionError,
		)


def request_scope(doc, user=None, capability="read"):
	user = user or frappe.session.user
	if not enabled():
		return True
	branches = []
	if frappe.conf.get("kandil_parity_enabled") and doc.get("requested_position"):
		position = frappe.db.get_value(
			"Kandil Position", doc.requested_position, ["company", "department", "branch"], as_dict=True
		)
		if not position or position.company != doc.company or position.department != doc.department:
			return False
		branches.append(position.branch)
	for line in doc.get("lines") or []:
		branch = frappe.db.get_value("Kandil Capacity", line.capacity, "branch")
		if not branch:
			return False
		branches.append(branch)
	return all(
		has_scope(user, doc.company, doc.department, branch, capability) for branch in (branches or [None])
	)


def scope_query(doctype, user=None, capability="read"):
	"""SQL list/search/export restriction. Only call with an application-owned DocType."""
	if not enabled():
		return ""
	user = user or frappe.session.user
	if user == "Administrator":
		return ""
	if not frappe.db.get_value("User", user, "enabled"):
		return "1=0"
	meta = frappe.get_meta(doctype)
	if not meta.has_field("company"):
		return "1=0"
	# DocType names must originate in code/hooks, not an untrusted HTTP parameter.
	if "`" in doctype:
		raise ValueError("Invalid DocType")
	table = f"`tab{doctype}`"
	u, day = frappe.db.escape(user), frappe.db.escape(today())
	department = (
		f"(IFNULL(g.department,'')='' OR g.department={table}.department)"
		if meta.has_field("department")
		else "IFNULL(g.department,'')=''"
	)
	branch = (
		f"(IFNULL(g.branch,'')='' OR g.branch={table}.branch)"
		if meta.has_field("branch")
		else "IFNULL(g.branch,'')=''"
	)
	extra = {
		"read": "",
		"manage": " AND g.can_manage_recruitment=1",
		"sensitive": " AND g.can_view_sensitive=1",
	}.get(capability)
	if extra is None:
		return "1=0"
	base = f"g.user={u} AND g.company={table}.company AND g.revoked=0 AND g.valid_from<={day} AND (g.valid_until IS NULL OR g.valid_until>={day}) AND {department}{extra}"
	if doctype == "Kandil Hiring Request":
		position_scope = ""
		if frappe.conf.get("kandil_parity_enabled"):
			position_scope = f"""AND (IFNULL({table}.requested_position,'')='' OR EXISTS (
			SELECT 1 FROM `tabKandil Position` p WHERE p.name={table}.requested_position
			AND p.company={table}.company AND p.department={table}.department
			AND EXISTS (SELECT 1 FROM `tabKandil Access Grant` g WHERE {base}
			AND (IFNULL(g.branch,'')='' OR g.branch=p.branch))))"""
		# A document exposes ALL its lines and its selected position.
		return f"""EXISTS (SELECT 1 FROM `tabKandil Access Grant` g WHERE {base}) {position_scope}
		AND (EXISTS (SELECT 1 FROM `tabKandil Request Line` present_line WHERE present_line.parent={table}.name AND present_line.parenttype='Kandil Hiring Request')
		OR EXISTS (SELECT 1 FROM `tabKandil Access Grant` g WHERE {base} AND IFNULL(g.branch,'')=''))
		AND NOT EXISTS (SELECT 1 FROM `tabKandil Request Line` l
		LEFT JOIN `tabKandil Capacity` c ON c.name=l.capacity
		WHERE l.parent={table}.name AND l.parenttype='Kandil Hiring Request'
		AND (c.name IS NULL OR NOT EXISTS (SELECT 1 FROM `tabKandil Access Grant` g WHERE {base}
		AND (IFNULL(g.branch,'')='' OR g.branch=c.branch))))"""
	return f"EXISTS (SELECT 1 FROM `tabKandil Access Grant` g WHERE {base} AND {branch})"


def scoped_permission(doc, user=None, ptype=None):
	if not enabled():
		return True
	capability = "read" if ptype in (None, "read", "select", "print", "export", "report") else "manage"
	allowed = has_scope(
		user or frappe.session.user, doc.get("company"), doc.get("department"), doc.get("branch"), capability
	)
	return bool(allowed)


def validate_scoped_document(doc, method=None):
	if not enabled() or frappe.flags.get("kandil_transition"):
		return
	assert_scope(doc.get("company"), doc.get("department"), doc.get("branch"))
	old = doc.get_doc_before_save()
	if old:
		assert_scope(old.get("company"), old.get("department"), old.get("branch"))


def sensitive_permission(doc, user=None, ptype=None):
	if not enabled():
		return True
	user = user or frappe.session.user
	if not has_scope(user, doc.get("company"), doc.get("department"), doc.get("branch"), "sensitive"):
		return False
	return scoped_permission(doc, user, ptype)


def file_permission(doc, user=None, ptype=None):
	if not enabled() or not doc.attached_to_doctype or not doc.attached_to_name:
		return True
	from kandil_hr.foundation.files import strict_file_access

	return strict_file_access(doc, user, "read" if ptype in (None, "read", "select") else "write")


def validate_private_file(doc, method=None):
	from kandil_hr.foundation.files import protected_target

	old = doc.get_doc_before_save()
	if (
		enabled()
		and old
		and (
			protected_attachment(old.attached_to_doctype)
			or protected_target(old.attached_to_doctype, old.attached_to_name)
		)
	):
		# Detaching or relabelling a private HR file must not turn it into a public file.
		if not cint(doc.is_private) or (old.attached_to_doctype, old.attached_to_name) != (
			doc.attached_to_doctype,
			doc.attached_to_name,
		):
			frappe.throw(_("An HR attachment cannot be made public or moved to another record."))
	if enabled() and (
		protected_attachment(doc.attached_to_doctype)
		or protected_target(doc.attached_to_doctype, doc.attached_to_name)
	):
		if not cint(doc.is_private):
			frappe.throw(_("Kandil HR attachments must be private."))
		if doc.attached_to_name:
			frappe.get_doc(doc.attached_to_doctype, doc.attached_to_name).check_permission("write")
	from kandil_hr.foundation.files import validate_file_alias

	validate_file_alias(doc)


def protected_attachment(doctype):
	return (doctype or "").startswith("Kandil ") or doctype in (
		"Employee",
		"Job Opening",
		"Job Applicant",
		"Job Offer",
		"Interview",
		"Interview Feedback",
		"Employee Onboarding",
	)


def linked_opening(doc):
	if doc.doctype == "Job Opening":
		return doc
	if doc.doctype == "Job Applicant":
		return frappe.get_doc("Job Opening", doc.job_title) if doc.job_title else None
	if doc.doctype in ("Job Offer", "Interview"):
		return (
			linked_opening(frappe.get_doc("Job Applicant", doc.job_applicant)) if doc.job_applicant else None
		)
	if doc.doctype == "Interview Feedback":
		return linked_opening(frappe.get_doc("Interview", doc.interview)) if doc.interview else None
	return None


def linked_request(doc):
	if doc.doctype == "Kandil Hiring Request":
		return doc
	if doc.doctype == "Job Opening":
		name = doc.get("custom_kandil_request")
		return frappe.get_doc("Kandil Hiring Request", name) if name else None
	if doc.doctype == "Job Applicant":
		return linked_request(frappe.get_doc("Job Opening", doc.job_title)) if doc.job_title else None
	if doc.doctype in ("Job Offer", "Interview"):
		return (
			linked_request(frappe.get_doc("Job Applicant", doc.job_applicant)) if doc.job_applicant else None
		)
	if doc.doctype == "Interview Feedback":
		return linked_request(frappe.get_doc("Interview", doc.interview)) if doc.interview else None
	return None


def hr_permission(doc, user=None, ptype=None):
	"""Conservative protection for native HR records on the parity site.

	Offer compensation is withheld as an entire document unless explicitly granted;
	this does not claim selective field redaction is implemented.
	"""
	if not enabled():
		return True
	user = user or frappe.session.user
	if user == "Administrator":
		return True
	if not frappe.db.get_value("User", user, "enabled"):
		return False
	if doc.doctype == "Employee Onboarding":
		return (
			hr_permission(frappe.get_doc("Employee", doc.employee), user, ptype)
			if doc.get("employee")
			else False
		)
	if (
		doc.doctype == "Employee"
		and doc.get("user_id") == user
		and ptype in (None, "read", "select", "print")
	):
		return True
	request = linked_request(doc)
	capability = "read" if ptype in (None, "read", "select", "print", "export", "report") else "manage"
	if request and doc.doctype in ("Job Applicant", "Job Offer", "Interview", "Interview Feedback"):
		from kandil_hr.foundation.teams import candidate_access

		if not candidate_access(linked_opening(doc), request, user):
			return False
	if doc.doctype == "Job Offer":
		allowed = (
			request_scope(request, user, "sensitive")
			if request
			else has_scope(user, doc.get("company"), doc.get("department"), doc.get("branch"), "sensitive")
		)
		if not allowed:
			return False
	if request:
		return True if request_scope(request, user, capability) else False
	if doc.get("company"):
		return (
			True
			if has_scope(user, doc.company, doc.get("department"), doc.get("branch"), capability)
			else False
		)
	# Unlinked personal recruitment records have no verifiable scope yet.
	return False


def validate_hr_document(doc, method=None):
	if not enabled() or frappe.flags.get("kandil_transition"):
		return
	if hr_permission(doc, ptype="write") is False:
		frappe.throw(
			_("Your access grant does not permit changes to this HR record."), frappe.PermissionError
		)
	old = doc.get_doc_before_save()
	if old and hr_permission(old, ptype="write") is False:
		frappe.throw(
			_("Your access grant does not permit changes to the original HR record."), frappe.PermissionError
		)


def hr_query(doctype, user=None):
	if not enabled() or (user or frappe.session.user) == "Administrator":
		return ""
	user = user or frappe.session.user
	if user == "Guest" or not frappe.db.get_value("User", user, "enabled"):
		return "1=0"
	request = scope_query("Kandil Hiring Request", user, "sensitive" if doctype == "Job Offer" else "read")
	opening = f"SELECT name FROM `tabJob Opening` WHERE custom_kandil_request IN (SELECT name FROM `tabKandil Hiring Request` WHERE {request})"
	if doctype == "Job Opening":
		return f"`tabJob Opening`.name IN ({opening})"
	from kandil_hr.foundation.teams import candidate_opening_condition

	opening += f" AND {candidate_opening_condition(user)}"
	applicant = f"SELECT name FROM `tabJob Applicant` WHERE job_title IN ({opening})"
	if doctype == "Job Applicant":
		return f"`tabJob Applicant`.name IN ({applicant})"
	if doctype in ("Job Offer", "Interview"):
		return f"`tab{doctype}`.job_applicant IN ({applicant})"
	if doctype == "Interview Feedback":
		return f"`tabInterview Feedback`.interview IN (SELECT name FROM `tabInterview` WHERE job_applicant IN ({applicant}))"
	if doctype == "Employee":
		return f"({scope_query(doctype, user)}) OR `tabEmployee`.user_id={frappe.db.escape(user)}"
	if doctype == "Employee Onboarding":
		return f"`tabEmployee Onboarding`.employee IN (SELECT name FROM `tabEmployee` WHERE {hr_query('Employee', user)})"
	return "1=0"


def file_query(user=None):
	"""Additional list restriction; native File rules remain in force.

	Unknown Kandil attachment types fail closed until their parent query is mapped.
	This protects file metadata as well as relying on parent checks for downloads.
	"""
	if not enabled() or (user or frappe.session.user) == "Administrator":
		return ""
	user = user or frappe.session.user
	if user == "Guest" or not frappe.db.get_value("User", user, "enabled"):
		return "1=0"
	from kandil_hr.pilot.permissions import request_query

	native = (
		"Employee",
		"Job Opening",
		"Job Applicant",
		"Job Offer",
		"Interview",
		"Interview Feedback",
		"Employee Onboarding",
	)
	known = list(native) + frappe.get_all(
		"DocType", filters={"name": ["like", "Kandil %"], "istable": 0}, pluck="name"
	)
	conditions = []
	for doctype in known:
		if doctype in native:
			condition = hr_query(doctype, user)
		elif doctype == "Kandil Hiring Request":
			condition = request_query(user)
		elif doctype == "Kandil Request Revision":
			# A readable live request does not imply access to every raw old
			# revision. Match the revision list/detail boundary before File
			# pagination, including historical scope and nested User Permissions.
			from kandil_hr.recruitment.history_access import condition as revision_condition, user_permissions
			condition = f"({revision_condition(user)}) AND ({user_permissions(doctype, user)})"
		elif doctype == "Kandil Recruitment Event":
			condition = f"`tab{doctype}`.request IN (SELECT name FROM `tabKandil Hiring Request` WHERE {request_query(user) or '1=1'})"
		elif frappe.get_meta(doctype).has_field("company"):
			condition = scope_query(doctype, user, "sensitive" if doctype == "Kandil Grade Band" else "read")
		else:
			continue
		if not frappe.has_permission(doctype, "read", user=user):
			continue
		conditions.append(
			f"(`tabFile`.attached_to_doctype={frappe.db.escape(doctype)} AND `tabFile`.attached_to_name IN (SELECT name FROM `tab{doctype}` WHERE {condition or '1=1'}))"
		)
	protected = (
		"LEFT(IFNULL(`tabFile`.attached_to_doctype,''),7)='Kandil ' OR IFNULL(`tabFile`.attached_to_doctype,'') IN ("
		+ ",".join(frappe.db.escape(x) for x in native)
		+ ")"
	)
	from kandil_hr.foundation.reports import report_file_query

	report_files = report_file_query(user)
	extra = f" AND ({report_files})" if report_files else ""
	return "(NOT (" + protected + ") OR " + (" OR ".join(conditions) or "1=0") + ")" + extra


def validate_user_security(doc, method=None):
	if not enabled():
		return
	old = doc.get_doc_before_save()
	if not old:
		if doc.get("user_type") == "System User" and "System Manager" not in frappe.get_roles():
			frappe.throw(_("Only System Managers may create system accounts."), frappe.PermissionError)
		doc.flags.kandil_security_changes = ["account_created"]
		return
	fields = [
		"enabled",
		"email",
		"user_type",
		"role_profile_name",
		"restrict_ip",
		"bypass_restrict_ip_check_if_2fa_enabled",
		"api_key",
		"module_profile",
		"simultaneous_sessions",
	]
	changed = [f for f in fields if old.get(f) != doc.get(f)]
	if sorted(r.role for r in old.roles) != sorted(r.role for r in doc.roles):
		changed.append("roles")
	if sorted(r.role_profile for r in old.get("role_profiles") or []) != sorted(
		r.role_profile for r in doc.get("role_profiles") or []
	):
		changed.append("role_profiles")
	identity_fields = ("provider", "userid", "username")
	if sorted(
		tuple(row.get(key) or "" for key in identity_fields) for row in old.get("social_logins") or []
	) != sorted(
		tuple(row.get(key) or "" for key in identity_fields) for row in doc.get("social_logins") or []
	):
		changed.append("social_logins")
	if doc.get("api_secret") and doc.get("api_secret") != old.get("api_secret"):
		changed.append("api_secret_rotated")
	if changed and "System Manager" not in frappe.get_roles():
		frappe.throw(
			_("Security-sensitive account changes require a System Manager."), frappe.PermissionError
		)
	doc.flags.kandil_security_changes = changed


def user_security_audit(doc, method=None):
	if not enabled() or not doc.flags.get("kandil_security_changes"):
		return
	from kandil_hr.foundation.models import record_security_event

	record_security_event("Account policy changed", doc.name, ", ".join(doc.flags.kandil_security_changes))


def validate_user_rename(doc, method=None, old_name=None, new_name=None, merge=False):
	if not enabled():
		return
	frappe.only_for("System Manager")
	if merge:
		frappe.throw(_("Account merging requires a separately reviewed identity migration."))


def audit_user_rename(doc, method=None, old_name=None, new_name=None, merge=False):
	if not enabled():
		return
	from kandil_hr.foundation.models import record_security_event

	record_security_event("Account identifier changed", new_name or doc.name, "account_identifier")
