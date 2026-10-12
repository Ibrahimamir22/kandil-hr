"""Private, transaction-bound revision/import command audit adapters.

Server invocation identities are deterministic replay keys, not client command
IDs. Endpoints retain their existing replay, authorization and transaction rules.
"""

import hashlib

import frappe

from kandil_hr.foundation import command_audit
from kandil_hr.organization.audit_projections import project
from kandil_hr.organization.current import rows


def before(doc):
	return project(doc) if command_audit.active() else None


def invocation(operation, doc, reviewed):
	return hashlib.sha256(
		command_audit.canonical(
			[operation, doc.doctype, doc.name, frappe.session.user, str(reviewed)]
		).encode()
	).hexdigest()


def record(operation, doc, reviewed, payload, before, related_before, result, related_after):
	if not command_audit.active():
		return None
	identity = invocation(operation, doc, reviewed)
	return command_audit.record_command(
		domain="organization",
		operation=operation,
		command_id=identity,
		command_origin="server_invocation",
		receipt_key=identity,
		reviewed_version=str(reviewed),
		target=doc,
		before=before,
		after=project(doc),
		payload=payload,
		result=result,
		related_before=related_before,
		related_after=related_after,
	)


def revision_related(doc):
	if not command_audit.active():
		return []
	result = []
	if doc.doctype == "Kandil JD Revision":
		for doctype, name in (
			(doc.doctype, doc.supersedes),
			("Kandil Grade Band", doc.grade_band),
			("Kandil Position", doc.position),
		):
			if name:
				target = frappe.get_doc(doctype, name, for_update=True)
				if target.company != doc.company:
					raise frappe.PermissionError("Revision audit reference is outside the reviewed company")
				result.append(command_audit.project_related(target))
	return result


def import_related(doc, preview, result=None):
	"""Capture exact referenced/affected identities, with current locking reads.

	Absent records have no fabricated before state. Existing dated rows and
	ledgers are retained unchanged in the envelope when import merely reuses
	them. Master references are taken only from the already validated preview.
	"""
	if not command_audit.active():
		return []
	identities = set()
	positions = set()
	kind = doc.get("import_kind") or "Positions"
	for item in preview:
		data = item["data"]
		if kind == "Positions":
			positions.add(item["code"])
			identities.add(("Department", data["department"]))
			identities.add(("Designation", data["designation"]))
		elif kind in ("Hierarchy", "Assignments"):
			positions.add(data["position"])
			if data.get("parent_position"):
				positions.add(data["parent_position"])
		else:
			identities.add((item["doctype"], item["target"]))
			if data.get("parent_department"):
				identities.add(("Department", data["parent_department"]))
		if kind in ("Positions", "Units", "Jobs"):
			from kandil_hr.organization.codes import identity

			entity = {"Positions": "Position", "Units": "Unit", "Jobs": "Job"}[kind]
			code = (data.get("external_id") or item["code"]) if kind == "Positions" else item["code"]
			identities.add(("Kandil Organization Code", identity(doc.company, entity, code)))
	for position in sorted(positions):
		identities.add(("Kandil Position", position))
		for doctype in ("Kandil Capacity", "Kandil Position Hierarchy", "Kandil Position Assignment"):
			for row in rows(doctype, filters={"company": doc.company, "position": position}, fields=["name"]):
				identities.add((doctype, row.name))
	if result and result.get("snapshot"):
		identities.add(("Kandil Structure Snapshot", result["snapshot"]))
	captured = []
	for doctype, name in sorted(identities):
		if not rows(doctype, filters={"name": name}, fields=["name"]):
			continue
		target = frappe.get_doc(doctype, name, for_update=True)
		# Designation is a global native identity. It is allowed only because
		# this exact explicit target was validated in this company's preview.
		if doctype != "Designation" and target.get("company") != doc.company:
			raise frappe.PermissionError("Import audit target is outside the reviewed company")
		captured.append(command_audit.project_related(target))
	return captured
