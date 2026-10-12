"""Called by Capacity.validate only on the parity site; keeps old review sites intact."""

import frappe
from frappe.utils import cint, getdate

from kandil_hr.organization.models import fail, internal


def validate_capacity(doc):
	if not frappe.conf.get("kandil_parity_enabled"):
		return
	if not doc.get("position"):
		fail("Every parity capacity ledger must reference a position.")
	p = frappe.get_doc("Kandil Position", doc.position, for_update=True)
	if any(
		(doc.get(k) or "") != (p.get(k) or "") for k in ["company", "department", "branch", "designation"]
	):
		fail("Capacity dimensions must match the position.")
	old = doc.get_doc_before_save()
	if not frappe.flags.get("kandil_occupancy_refresh"):
		for field in ("occupancy_basis", "occupancy_as_of"):
			default = "Legacy Baseline" if field == "occupancy_basis" else None
			if str(doc.get(field) or default or "") != str(
				(old.get(field) if old else default) or default or ""
			):
				fail("Occupancy provenance is managed by reviewed server actions.")
	if old and old.get("position") != doc.position:
		fail("Capacity position cannot change.")
	expected = 0 if p.closed_on and getdate(p.closed_on) <= getdate() else cint(p.structural)
	if cint(doc.structural) != expected:
		fail("Capacity structural seats must match the approved position.")
	if old and cint(old.structural) != cint(doc.structural):
		if not internal():
			fail("Use an approved structure change to resize or close a position.")
		if cint(doc.structural) < cint(doc.occupied) + cint(doc.reserved) + cint(doc.open_slots):
			fail("Structural seats cannot be below allocated or committed headcount.")
	if expected == 0 and any(cint(doc.get(k)) for k in ["occupied", "reserved", "open_slots"]):
		fail("A closed position cannot retain or receive headcount commitments.")
