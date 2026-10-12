"""Affected structural records for the reviewed structure-command envelope."""

import json

import frappe

from kandil_hr.foundation.command_audit import project_related
from kandil_hr.organization.current import rows


def related_state(doc):
	positions = {item.get("position") for item in json.loads(doc.changes_json or "[]")}
	positions.update(json.loads(doc.created_positions_json or "{}").values())
	positions.update(item.get("target_position") for item in json.loads(doc.changes_json or "[]"))
	result = []
	for name in sorted(positions - {None, ""}):
		position = frappe.get_doc("Kandil Position", name, for_update=True)
		if position.company != doc.company:
			raise frappe.PermissionError("Structural audit target is outside the reviewed company")
		result.append(project_related(position))
		for kind in ("Kandil Position Hierarchy", "Kandil Capacity", "Kandil Position Assignment"):
			for row in rows(kind, filters={"position": name}, fields=["name"], order_by="name"):
				result.append(project_related(frappe.get_doc(kind, row.name, for_update=True)))
	if doc.snapshot:
		result.append(
			project_related(frappe.get_doc("Kandil Structure Snapshot", doc.snapshot, for_update=True))
		)
	return result
