"""Current delivery authorization under domain -> recipient -> grants -> outbox.

Supported production targets: Hiring Request, Job Opening and Structure Change.
Company-scoped organization records (including Capacity) use the same contract.
Unknown targets raise a visible retryable failure, rather than bypassing scope.
The native permission check remains an additional restriction. Current account,
explicit roles and dated grants never rely on its repeatable-read/cache state.
"""

import frappe
from frappe.utils import cint, today

from kandil_hr.foundation.mutation_access import (
	assert_current_request_scope,
	assert_current_scope,
	current_identity,
)

SCOPED_TYPES = {
	"Kandil Capacity",
	"Kandil Organization Settings",
	"Kandil Position",
	"Kandil Position Hierarchy",
	"Kandil Position Assignment",
	"Kandil Grade Band",
	"Kandil JD Revision",
	"Kandil Structure Change",
	"Kandil Structure Snapshot",
	"Kandil Organization Import",
}
ROUTING_FIELDS = ("recipient", "reference_doctype", "reference_name", "payload_hash")


def lock_domain(doctype, name):
	"""Acquire all domain locks before any recipient/authorization/outbox locks."""
	if not doctype:
		return None, None
	if doctype not in SCOPED_TYPES | {"Kandil Hiring Request", "Job Opening"}:
		raise ValueError("Notification reference needs a reviewed current-access adapter")
	fields = ["company", "custom_kandil_request"] if doctype == "Job Opening" else ["company"]
	hint = frappe.db.get_value(doctype, name, fields, as_dict=True)
	if not hint or not hint.company:
		return None, None
	frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (hint.company,))
	request = None
	if doctype == "Job Opening":
		# The immutable routing hint may come from an old RR snapshot. Lock its
		# parent first, then verify it against the current opening below; any
		# changed link causes a whole-transaction retry, never reordered locks.
		if hint.custom_kandil_request:
			request = frappe.get_doc("Kandil Hiring Request", hint.custom_kandil_request, for_update=True)
	elif doctype == "Kandil Hiring Request":
		request = frappe.get_doc(doctype, name, for_update=True)
	if request:
		if request.company != hint.company:
			raise RuntimeError("Notification reference company changed; retry transaction")
		for capacity in sorted({line.capacity for line in request.lines}):
			frappe.db.sql("SELECT name FROM `tabKandil Capacity` WHERE name=%s FOR UPDATE", (capacity,))
	doc = request if doctype == "Kandil Hiring Request" else frappe.get_doc(doctype, name, for_update=True)
	if doctype == "Job Opening" and doc.custom_kandil_request != hint.custom_kandil_request:
		raise RuntimeError("Notification parent changed; retry transaction")
	if doc.company != hint.company:
		raise RuntimeError("Notification reference company changed; retry transaction")
	return doc, request


def current_role_read(doc, user, roles):
	if user == "Administrator":
		return True
	# Read role grants from current rows too; stale role-permission caches may
	# remain in a worker that started before an administrator changed the user.
	permissions = frappe.db.sql(
		"SELECT role,permlevel,`read`,if_owner FROM `tabCustom DocPerm` WHERE parent=%s ORDER BY name FOR UPDATE",
		(doc.doctype,),
		as_dict=True,
	)
	if not permissions:
		permissions = frappe.db.sql(
			"SELECT role,permlevel,`read`,if_owner FROM `tabDocPerm` WHERE parent=%s ORDER BY name FOR UPDATE",
			(doc.doctype,),
			as_dict=True,
		)
	roles = set(roles) | {"All"}
	if frappe.db.get_value("User", user, "user_type", for_update=True) == "System User":
		roles.add("Desk User")
	return any(
		row.role in roles
		and not cint(row.permlevel)
		and cint(row.read)
		and (not cint(row.if_owner) or doc.owner == user)
		for row in permissions
	)


def request_relationship(doc, user, roles):
	if (
		user == "Administrator"
		or {"Kandil Recruiter", "Kandil Sector Approver"} & roles
		or doc.requested_by == user
	):
		return True
	principals = {row.principal for row in doc.approval_steps}
	if user in principals:
		return True
	delegations = frappe.db.sql(
		"SELECT from_user,revoked,from_date,to_date FROM `tabKandil Delegation` WHERE to_user=%s AND company=%s AND department=%s ORDER BY name FOR UPDATE",
		(user, doc.company, doc.department),
		as_dict=True,
	)
	day = today()
	return any(
		d.from_user in principals and not cint(d.revoked) and str(d.from_date) <= day <= str(d.to_date)
		for d in delegations
	)


def lock_delivery(name):
	"""Return locked outbox and suppression reason; no effects or commits."""
	hint = frappe.db.get_value("Kandil Notification Outbox", name, (*ROUTING_FIELDS, "status"), as_dict=True)
	if not hint:
		raise frappe.DoesNotExistError("Notification outbox record does not exist")
	if hint.status in ("Delivered locally", "Suppressed", "Failed"):
		# A terminal replay needs only its own row. Do not acquire any domain or
		# user locks afterwards; a concurrently retried Failed row starts fresh.
		terminal = frappe.get_doc("Kandil Notification Outbox", name, for_update=True)
		if terminal.status not in ("Delivered locally", "Suppressed", "Failed"):
			raise RuntimeError("Notification retry state changed; retry transaction")
		return terminal, ""
	doc, request = lock_domain(hint.reference_doctype, hint.reference_name)
	reason = ""
	try:
		roles = current_identity(hint.recipient)
		if hint.reference_doctype:
			if not doc:
				reason = "Reference no longer exists"
			else:
				if request:
					assert_current_request_scope(request, user=hint.recipient, capability="read")
				else:
					assert_current_scope(
						doc.company,
						doc.get("department"),
						doc.get("branch"),
						user=hint.recipient,
						capability="sensitive" if doc.doctype == "Kandil Grade Band" else "read",
					)
				if not current_role_read(doc, hint.recipient, roles) or (
					doc.doctype == "Kandil Hiring Request"
					and not request_relationship(doc, hint.recipient, roles)
				):
					reason = "Reference access revoked"
				elif not frappe.has_permission(
					doc.doctype, "read", doc=doc, user=hint.recipient, ignore_share_permissions=True
				):
					reason = "Reference access revoked"
	except frappe.PermissionError:
		reason = "Recipient account or reference access revoked"
	outbox = frappe.get_doc("Kandil Notification Outbox", name, for_update=True)
	if any(outbox.get(field) != hint.get(field) for field in ROUTING_FIELDS):
		raise RuntimeError("Notification routing changed; retry transaction")
	return outbox, reason
