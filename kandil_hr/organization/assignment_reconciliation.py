"""Complete row-level Employee/Position matching before assignment import review."""

import frappe
from frappe import _

from kandil_hr.organization.current import rows


def preview(doc):
	from kandil_hr.organization.api import import_rows

	source = import_rows(doc)
	employees = {row.name for row in rows("Employee", filters={"company": doc.company}, fields=["name"])}
	positions = {
		row.name for row in rows("Kandil Position", filters={"company": doc.company}, fields=["name"])
	}
	result, issues = [], []
	for number, item in enumerate(source, 1):
		unmatched = []
		for field, allowed in (("employee", employees), ("position", positions)):
			value = item.get(field)
			if not isinstance(value, str) or value not in allowed:
				unmatched.append(field)
		row = {
			"row": number,
			"employee": item.get("employee"),
			"position": item.get("position"),
			"unmatched": unmatched,
		}
		result.append(row)
		if unmatched:
			issues.append(row)
	return {
		"valid": not issues,
		"row_count": len(source),
		"rows": result,
		"issues": issues,
		"unmatched_count": sum(len(row["unmatched"]) for row in issues),
	}


def require_matches(doc):
	result = preview(doc)
	if not result["valid"]:
		frappe.throw(
			_(
				"Unmatched Employee or Position references in rows {0}. Open Reconcile Assignments to review every unmatched reference."
			).format(", ".join(str(row["row"]) for row in result["issues"]))
		)
	return result
