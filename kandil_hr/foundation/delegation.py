"""CHG-76 process-scoped delegation; source implementation, not HR sign-off.

APPROVALS and TEAM are independent capabilities; ALL includes both. Existing
request-only grants default to APPROVALS. This does not implement TEAM transfer
or probation workflows, and does not grant native roles, scopes or payroll rights.
"""

import hashlib
from contextlib import contextmanager

import frappe
from frappe import _
from frappe.utils import cint, date_diff, get_datetime, getdate

from kandil_hr.foundation.clock import now_cairo, today_cairo
from kandil_hr.foundation.mutation_access import assert_current_scope, current_identity
from kandil_hr.foundation.security import has_scope
from kandil_hr.pilot.api import transactional_retry

PROCESSES = ("APPROVALS", "TEAM", "ALL")
IMMUTABLE = (
	"company",
	"department",
	"from_user",
	"to_user",
	"from_date",
	"to_date",
	"reason",
	"process_scope",
	"supersedes",
	"delegation_version",
)
MANAGED = ("approval_status", "approved_by", "approved_on", "decision_reason", "decision_key", "revision_key")


def enabled():
	return bool(frappe.conf.get("kandil_parity_enabled"))


@contextmanager
def effect():
	old = frappe.flags.get("kandil_delegation_effect")
	frappe.flags.kandil_delegation_effect = True
	try:
		yield
	finally:
		frappe.flags.kandil_delegation_effect = old


def delegation_sql(alias="d", process="APPROVALS"):
	if alias not in ("d", "delegation") or process not in ("APPROVALS", "TEAM"):
		raise ValueError("Unsupported delegation query")
	p = frappe.db.escape(process)
	return f"""{alias}.approval_status='Active'
	AND COALESCE(NULLIF({alias}.process_scope,''),'APPROVALS') IN ({p},'ALL')
	AND EXISTS (SELECT 1 FROM `tabUser` du WHERE du.name={alias}.from_user AND du.enabled=1)
	AND EXISTS (SELECT 1 FROM `tabUser` dt WHERE dt.name={alias}.to_user AND dt.enabled=1)
	AND EXISTS (SELECT 1 FROM `tabHas Role` dr WHERE dr.parent={alias}.to_user AND dr.parenttype='User' AND dr.role='Kandil Approver')
	AND NOT EXISTS (SELECT 1 FROM `tabHas Role` br WHERE br.parent={alias}.from_user AND br.parenttype='User' AND br.role='Kandil Board Approver')
	AND (NOT EXISTS (SELECT 1 FROM `tabHas Role` cr WHERE cr.parent={alias}.from_user AND cr.parenttype='User' AND cr.role='Kandil CEO Approver')
	OR ({alias}.approved_by={alias}.from_user AND {alias}.approved_on IS NOT NULL
	AND EXISTS (SELECT 1 FROM `tabKandil Organization Settings` cs WHERE cs.company={alias}.company AND cs.ceo_approver={alias}.from_user)))"""


def find_delegation(doc, principal, user=None, process="APPROVALS", current=False):
	if process not in ("APPROVALS", "TEAM"):
		return None
	user = user or frappe.session.user
	if user == principal or principal == doc.get("requested_by") or user == doc.get("requested_by"):
		return None
	if current:
		roles = {account: current_identity(account) for account in sorted({principal, user})}
		if "Kandil Approver" not in roles[user] or "Kandil Board Approver" in roles[principal]:
			return None
	else:
		if not all(frappe.db.get_value("User", account, "enabled") for account in (principal, user)):
			return None
	day = today_cairo()
	matches = frappe.db.sql(
		"""SELECT name,approved_by,approved_on FROM `tabKandil Delegation` d
	WHERE from_user=%s AND to_user=%s AND company=%s AND department=%s
	AND revoked=0 AND from_date<=%s AND to_date>=%s AND """
		+ delegation_sql(process=process)
		+ " ORDER BY creation DESC,name"
		+ (" FOR UPDATE" if current else ""),
		(principal, user, doc.company, doc.department, day, day),
		as_dict=True,
	)
	if current and "Kandil CEO Approver" in roles[principal]:
		ceo = frappe.db.get_value(
			"Kandil Organization Settings", doc.company, "ceo_approver", for_update=True
		)
		if ceo != principal:
			return None
		matches = [row for row in matches if row.approved_by == principal and row.approved_on]
	return matches[0].name if matches else None


def validate(doc):
	old = doc.get_doc_before_save()
	# The same business mutex is used by requests and explicit delegation commands.
	for company in sorted({doc.company} | ({old.company} if old else set())):
		frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
	for user in sorted({doc.from_user, doc.to_user, frappe.session.user}):
		frappe.db.sql("SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE", (user,))
	if not frappe.flags.get("kandil_delegation_effect"):
		assert_current_scope(doc.company, doc.department, required_roles=("Kandil Sector Approver",))
	if not doc.process_scope:
		doc.process_scope = "APPROVALS"
	if not cint(doc.delegation_version):
		doc.delegation_version = 1
	if doc.process_scope not in PROCESSES:
		frappe.throw(_("Select an explicit delegation process."))
	if doc.from_user == doc.to_user:
		frappe.throw(_("Self delegation is not allowed."))
	if getdate(doc.to_date) < getdate(doc.from_date) or date_diff(doc.to_date, doc.from_date) > 89:
		frappe.throw(_("Delegation must cover 1 to 90 calendar days."))
	if frappe.db.get_value("Department", doc.department, "company") != doc.company:
		frappe.throw(_("The delegation department must belong to its company."))
	if not isinstance(doc.reason, str) or len(doc.reason.strip()) < 3:
		frappe.throw(_("A delegation reason is required."))
	managed = frappe.flags.get("kandil_delegation_effect")
	# Revocation explains a new action; the immutable creation reason cannot stand in for it.
	if old and cint(old.revoked):
		if (doc.get("revocation_reason") or "") != (old.get("revocation_reason") or ""):
			frappe.throw(_("A recorded delegation revocation reason is immutable."))
	elif cint(doc.revoked):
		reason = doc.get("revocation_reason")
		if not isinstance(reason, str) or len(reason.strip()) < 3 or len(reason) > 2000:
			frappe.throw(_("Enter a fresh revocation reason between 3 and 2000 characters."))
		doc.revocation_reason = reason.strip()
	elif doc.get("revocation_reason"):
		frappe.throw(_("A revocation reason can only be recorded when revoking a delegation."))
	if old:

		def comparable(key, value):
			# Native JSON saves serialize dates; compare their meaning, not Python types.
			if key in ("from_date", "to_date") and value:
				return getdate(value)
			if key == "approved_on" and value:
				return get_datetime(value)
			if key == "process_scope":
				return value or "APPROVALS"
			if key == "delegation_version":
				return cint(value) or 1
			return value

		if any(comparable(k, doc.get(k)) != comparable(k, old.get(k)) for k in IMMUTABLE):
			frappe.throw(_("Delegation scope is immutable. Create a new version."))
		if old.revoked and not doc.revoked:
			frappe.throw(_("A revoked delegation cannot be reactivated."))
		if not managed and any(comparable(k, doc.get(k)) != comparable(k, old.get(k)) for k in MANAGED):
			frappe.throw(
				_("Delegation approval metadata is managed by authorized commands."), frappe.PermissionError
			)
		if doc.revoked:
			doc.approval_status = "Revoked"
		return
	if not managed:
		if (
			doc.get("supersedes")
			or cint(doc.get("delegation_version") or 1) != 1
			or any(doc.get(k) for k in MANAGED if k != "approval_status")
			or doc.get("approval_status") not in (None, "", "Active")
		):
			frappe.throw(
				_("Initial delegation authority and version are assigned by the server."),
				frappe.PermissionError,
			)
		doc.delegation_version = 1
	if frappe.session.user == doc.to_user:
		frappe.throw(_("You cannot create a delegation to yourself."), frappe.PermissionError)
	roles = {}
	for user in sorted({doc.from_user, doc.to_user, frappe.session.user}):
		roles[user] = current_identity(user)
	assert_current_scope(doc.company, doc.department, required_roles=("Kandil Sector Approver",))
	if "Kandil Approver" not in roles[doc.to_user]:
		frappe.throw(_("Delegate needs the Kandil Approver role."))
	for user in (doc.from_user, doc.to_user):
		assert_current_scope(doc.company, doc.department, user=user)
	if "Kandil Board Approver" in roles[doc.from_user]:
		frappe.throw(_("Board delegation requires its separate authority workflow."), frappe.PermissionError)
	if "Kandil CEO Approver" in roles[doc.from_user]:
		if frappe.db.get_value("Kandil Organization Settings", doc.company, "ceo_approver") != doc.from_user:
			frappe.throw(_("CEO delegation must name the configured company CEO."), frappe.PermissionError)
		doc.approval_status = "Pending CEO"
	else:
		doc.approval_status = "Active"
	if not doc.revoked:
		duplicates = frappe.db.sql(
			"""SELECT name FROM `tabKandil Delegation` WHERE company=%s AND department=%s AND from_user=%s AND to_user=%s AND revoked=0 AND approval_status IN ('Active','Pending CEO') AND from_date<=%s AND to_date>=%s FOR UPDATE""",
			(doc.company, doc.department, doc.from_user, doc.to_user, doc.to_date, doc.from_date),
			pluck=True,
		)
		if duplicates:
			frappe.throw(_("An overlapping delegation already exists. Revise or revoke it first."))
	if doc.revoked:
		doc.approval_status = "Revoked"


def audit(doc):
	from kandil_hr.foundation.models import record_security_event

	old = doc.get_doc_before_save()
	changes = [
		key
		for key in (*IMMUTABLE, *MANAGED, "revoked", "revocation_reason")
		if not old or doc.get(key) != old.get(key)
	]
	if changes:
		record_security_event("Delegation changed", doc.to_user, ",".join(changes), doc.name)
	from kandil_hr.foundation import delegation_audit

	delegation_audit.native(doc)
	from kandil_hr.recruitment.invitations import schedule_delegation

	schedule_delegation(doc)


def lock_context(name):
	company = frappe.db.get_value("Kandil Delegation", name, "company")
	if not company:
		frappe.throw(_("Delegation not found."))
	frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
	info = frappe.db.get_value("Kandil Delegation", name, ["from_user", "to_user"], as_dict=True)
	for user in sorted({info.from_user, info.to_user, frappe.session.user}):
		frappe.db.sql("SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE", (user,))
	return frappe.get_doc("Kandil Delegation", name, for_update=True)


def digest(*values):
	return hashlib.sha256(frappe.as_json(values).encode()).hexdigest()


@frappe.whitelist(methods=["POST"])
@transactional_retry
def decide(name, decision, reason, expected_version, command_id):
	if not enabled():
		frappe.throw(_("Delegation workflow is not enabled."), frappe.PermissionError)
	if (
		decision not in ("Approve", "Reject")
		or not isinstance(reason, str)
		or len(reason.strip()) < 3
		or not command_id
	):
		frappe.throw(_("Choose an approval decision and supply a reason and command ID."))
	doc = lock_context(name)
	doc.check_permission("read")
	roles = assert_current_scope(doc.company, doc.department, required_roles=("Kandil CEO Approver",))
	ceo = frappe.db.get_value("Kandil Organization Settings", doc.company, "ceo_approver", for_update=True)
	if (
		frappe.session.user != ceo
		or doc.from_user != ceo
		or doc.to_user == ceo
		or "Kandil CEO Approver" not in roles
	):
		frappe.throw(
			_("Only this company CEO may decide their authority delegation."), frappe.PermissionError
		)
	for user in (doc.from_user, doc.to_user):
		assert_current_scope(doc.company, doc.department, user=user)
	key = digest(frappe.session.user, command_id, decision, reason, expected_version)
	if doc.revoked:
		frappe.throw(_("A revoked delegation cannot be approved."))
	if doc.decision_key == key:
		return doc.as_dict()
	if doc.approval_status != "Pending CEO" or get_datetime(doc.modified) != get_datetime(expected_version):
		frappe.throw(_("This delegation changed. Reload before deciding."), frappe.TimestampMismatchError)
	from kandil_hr.foundation import delegation_audit

	before = delegation_audit.project(doc)
	payload = dict(
		name=name, decision=decision, reason=reason, expected_version=expected_version, command_id=command_id
	)
	with effect(), delegation_audit.endpoint():
		doc.approval_status = "Active" if decision == "Approve" else "Rejected"
		doc.approved_by = frappe.session.user
		doc.approved_on = now_cairo().replace(tzinfo=None)
		doc.decision_reason = reason.strip()
		doc.decision_key = key
		doc.save(ignore_permissions=True)
		delegation_audit.record("decide", doc, before, payload, command_id, expected_version, key)
	return doc.as_dict()


@frappe.whitelist(methods=["POST"])
@transactional_retry
def revise(name, process_scope, from_date, to_date, reason, expected_version, command_id):
	if not enabled():
		frappe.throw(_("Delegation workflow is not enabled."), frappe.PermissionError)
	if not command_id:
		frappe.throw(_("A command ID is required."))
	doc = lock_context(name)
	doc.check_permission("write")
	assert_current_scope(doc.company, doc.department, required_roles=("Kandil Sector Approver",))
	key = digest(frappe.session.user, command_id, process_scope, from_date, to_date, reason, expected_version)
	prior = frappe.db.sql(
		"SELECT name FROM `tabKandil Delegation` WHERE supersedes=%s AND revision_key=%s FOR UPDATE",
		(name, key),
		pluck=True,
	)
	if prior:
		return frappe.get_doc("Kandil Delegation", prior[0]).as_dict()
	if doc.revoked or get_datetime(doc.modified) != get_datetime(expected_version):
		frappe.throw(_("This delegation changed. Reload before revising."), frappe.TimestampMismatchError)
	from kandil_hr.foundation import delegation_audit

	before = delegation_audit.project(doc)
	payload = dict(
		name=name,
		process_scope=process_scope,
		from_date=from_date,
		to_date=to_date,
		reason=reason,
		expected_version=expected_version,
		command_id=command_id,
	)
	with effect(), delegation_audit.endpoint():
		doc.revoked = 1
		doc.revocation_reason = reason
		doc.save()
		new = frappe.get_doc(
			dict(
				doctype="Kandil Delegation",
				company=doc.company,
				department=doc.department,
				from_user=doc.from_user,
				to_user=doc.to_user,
				from_date=from_date,
				to_date=to_date,
				reason=reason,
				process_scope=process_scope,
				supersedes=doc.name,
				delegation_version=(cint(doc.delegation_version) or 1) + 1,
				revision_key=key,
			)
		).insert()
		delegation_audit.record(
			"revise", doc, before, payload, command_id, expected_version, key, new_version=new
		)
	return new.as_dict()
