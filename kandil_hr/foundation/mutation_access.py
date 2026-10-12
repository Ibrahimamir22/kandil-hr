"""Current authorization reads for mutations after the business mutex is held.

Generic reads/lists continue to use security.has_scope. These internal helpers
must be called after Company/request/capacity/other domain locks, before writing.
They never acquire Company. If an operation will touch several users (including
notification recipients), acquire those User rows in sorted order before calling
these helpers; never discover a reverse User -> Company dependency afterwards.
User administration locks User before Has Role; grant administration does not
acquire Company. No commit, cache mutation, or privilege fallback occurs here.
"""

import frappe
from frappe import _
from frappe.utils import cint, today

from kandil_hr.foundation.security import enabled


def current_identity(user):
	"""Lock one User then its explicit roles; reject disabled/missing accounts."""
	rows = frappe.db.sql("SELECT name,enabled FROM `tabUser` WHERE name=%s FOR UPDATE", (user,), as_dict=True)
	if user == "Guest" or not rows or not rows[0].enabled:
		frappe.throw(_("This account is no longer enabled for this action."), frappe.PermissionError)
	return {
		row[0]
		for row in frappe.db.sql(
			"SELECT role FROM `tabHas Role` WHERE parent=%s AND parenttype='User' ORDER BY name FOR UPDATE",
			(user,),
		)
	}


def assert_current_scope(
	company, department=None, branch=None, *, user=None, capability="manage", required_roles=(), branches=None
):
	"""Require current explicit roles and grants for every requested location.

	Callers retain native permission checks. required_roles is an any-of collection
	of business role names, not implicit All/Desk User roles. Returned roles come
	from current SQL and do not rely on Frappe's role cache.
	"""
	if not enabled():
		return set()
	user = user or frappe.session.user
	roles = current_identity(user)
	if user == "Administrator":
		return roles
	if required_roles and not set(required_roles).intersection(roles):
		frappe.throw(_("Your current role no longer permits this action."), frappe.PermissionError)
	if not company or capability not in ("read", "manage", "sensitive"):
		frappe.throw(_("Your current access grant does not permit this action."), frappe.PermissionError)
	day = today()
	grants = frappe.db.sql(
		"""SELECT department,branch,valid_from,valid_until,revoked,
		can_manage_recruitment,can_view_sensitive FROM `tabKandil Access Grant`
		WHERE user=%s AND company=%s ORDER BY name FOR UPDATE""",
		(user, company),
		as_dict=True,
	)
	locations = list(branches) if branches is not None else [branch]
	if not locations:
		locations = [None]
	for location in locations:
		allowed = any(
			not cint(g.revoked)
			and str(g.valid_from) <= day
			and (not g.valid_until or str(g.valid_until) >= day)
			and (not g.department or g.department == department)
			and (not g.branch or g.branch == location)
			and (capability != "manage" or cint(g.can_manage_recruitment))
			and (capability != "sensitive" or cint(g.can_view_sensitive))
			for g in grants
		)
		if not allowed:
			frappe.throw(_("Your current access grant does not permit this action."), frappe.PermissionError)
	return roles


def assert_current_request_scope(doc, *, user=None, capability="manage", required_roles=()):
	"""Current-lock sorted capacities before User/grants; request already locked."""
	if not enabled():
		return set()
	branches = []
	if frappe.conf.get("kandil_parity_enabled") and doc.get("requested_position"):
		position = frappe.db.sql(
			"SELECT company,department,branch FROM `tabKandil Position` WHERE name=%s FOR UPDATE",
			(doc.requested_position,),
			as_dict=True,
		)
		if not position or position[0].company != doc.company or position[0].department != doc.department:
			frappe.throw(
				_("The requested position no longer matches its company and department."),
				frappe.PermissionError,
			)
		branches.append(position[0].branch)
	for name in sorted({line.capacity for line in doc.get("lines") or []}):
		rows = frappe.db.sql(
			"SELECT company,department,branch FROM `tabKandil Capacity` WHERE name=%s FOR UPDATE",
			(name,),
			as_dict=True,
		)
		if (
			not rows
			or rows[0].company != doc.company
			or rows[0].department != doc.department
			or not rows[0].branch
		):
			frappe.throw(
				_("The request capacity no longer matches its company and location."), frappe.PermissionError
			)
		branches.append(rows[0].branch)
	return assert_current_scope(
		doc.company,
		doc.department,
		user=user,
		capability=capability,
		required_roles=required_roles,
		branches=branches,
	)
