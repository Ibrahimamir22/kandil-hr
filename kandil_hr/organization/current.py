"""Current locking reads for invariants after acquiring the Company mutex.

MariaDB REPEATABLE READ consistent SELECTs can predate a waited-for Company
lock. Locking reads see committed winners instead of that earlier snapshot.
This helper intentionally bypasses row permissions; callers enforce scope first.
"""

import frappe


def rows(doctype, **kwargs):
	include_voided = kwargs.pop("include_voided", False)
	if (
		doctype == "Kandil Position Assignment"
		and not include_voided
		and frappe.conf.get("kandil_parity_enabled")
	):
		filters = kwargs.get("filters") or {}
		if isinstance(filters, dict):
			filters = {**filters, "is_voided": 0}
		else:
			filters = [*filters, ["is_voided", "=", 0]]
		kwargs["filters"] = filters
	pluck = kwargs.pop("pluck", None)
	if pluck:
		kwargs["fields"] = [pluck]
	query = frappe.get_all(doctype, run=False, **kwargs)
	result = query.for_update().run(as_dict=True)
	return [row[pluck] for row in result] if pluck else result
