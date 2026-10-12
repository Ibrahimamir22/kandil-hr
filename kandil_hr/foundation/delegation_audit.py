"""Atomic delegation audit adapters; no original native HTTP body is invented.

Endpoint commands preserve their actual argument dictionary. Native saves have
only an observed, explicit field delta and a labelled server invocation ID.
The endpoint context suppresses hook duplicates, including both version writes.
"""

import hashlib
from contextlib import contextmanager

import frappe
from frappe.utils import get_datetime, getdate

from kandil_hr.foundation import command_audit as central

FIELDS = (
	"doctype",
	"name",
	"company",
	"department",
	"owner",
	"creation",
	"modified",
	"modified_by",
	"docstatus",
	"from_user",
	"to_user",
	"from_date",
	"to_date",
	"reason",
	"process_scope",
	"supersedes",
	"delegation_version",
	"approval_status",
	"approved_by",
	"approved_on",
	"decision_reason",
	"decision_key",
	"revision_key",
	"revoked",
	"revocation_reason",
)
BUSINESS_FIELDS = ("company", "department", *FIELDS[9:])


def project(doc):
	# Native JSON saves and ORM reloads represent the same dates differently.
	# Normalize these typed fields only; payload arguments remain exactly supplied.
	value = {}
	for field in FIELDS:
		item = doc.get(field)
		if item and field in ("from_date", "to_date"):
			item = getdate(item).isoformat()
		elif item and field in ("creation", "modified", "approved_on"):
			item = get_datetime(item).isoformat()
		value[field] = item
	return central.copy(value)


@contextmanager
def endpoint():
	old = frappe.flags.get("kandil_delegation_audit_endpoint")
	frappe.flags.kandil_delegation_audit_endpoint = True
	try:
		yield
	finally:
		frappe.flags.kandil_delegation_audit_endpoint = old


def record(
	operation,
	doc,
	before,
	payload,
	command_id,
	reviewed_version,
	receipt_key,
	*,
	new_version=None,
	origin="client_command",
):
	if not central.active():
		return None
	old = frappe.flags.get("kandil_delegation_audit")
	frappe.flags.kandil_delegation_audit = True
	try:
		return central.record_command(
			domain="delegation",
			operation=operation,
			command_id=command_id,
			command_origin=origin,
			receipt_key=receipt_key,
			reviewed_version=reviewed_version,
			target=doc,
			before=before,
			after=project(doc),
			payload=payload,
			result=project(new_version or doc),
			principal=frappe.session.user,
			authority={"frozen_principal": doc.from_user, "authority": "Delegation administration"},
			related_before=[],
			related_after=[project(new_version)] if new_version else [],
		)
	finally:
		frappe.flags.kandil_delegation_audit = old


def native(doc):
	if not central.active() or frappe.flags.get("kandil_delegation_audit_endpoint"):
		return None
	old = doc.get_doc_before_save()
	if old and (old.revoked or not doc.revoked):
		return None
	operation = "revoke" if old else "create"
	before = project(old) if old else {"doctype": doc.doctype, "name": doc.name, "record_exists": False}
	after = project(doc)
	delta = {
		key: {"before": before.get(key), "after": after.get(key)}
		for key in BUSINESS_FIELDS
		if not old or before.get(key) != after.get(key)
	}
	payload = {"native_change": delta}
	identity = hashlib.sha256(
		central.canonical(
			[
				operation,
				doc.name,
				frappe.session.user,
				str(doc.modified),
				before,
				after,
			]
		).encode()
	).hexdigest()
	return record(
		operation,
		doc,
		before,
		payload,
		identity,
		str(old.modified) if old else "absent",
		identity,
		origin="server_invocation",
	)
