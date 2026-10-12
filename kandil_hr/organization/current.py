"""Current locking reads for invariants after acquiring the Company mutex.

MariaDB REPEATABLE READ consistent SELECTs can predate a waited-for Company
lock. Locking reads see committed winners instead of that earlier snapshot.
This helper intentionally bypasses row permissions; callers enforce scope first.
"""

import frappe


def rows(doctype, **kwargs):
	pluck = kwargs.pop("pluck", None)
	if pluck:
		kwargs["fields"] = [pluck]
	query = frappe.get_all(doctype, run=False, **kwargs)
	result = query.for_update().run(as_dict=True)
	return [row[pluck] for row in result] if pluck else result
