"""Narrow scoped CSV register, distinct from unrestricted native data export.

Read grants are sufficient: this exports only the same public organizational
fields visible in the position register. No wages, grades, employees, documents
or private notes are included. No File record or public URL is created.
"""

import csv
import io

import frappe
from frappe import _
from werkzeug.wrappers import Response

from kandil_hr.foundation.security import enabled

FIELDS = ("name", "position_code", "title", "company", "department", "branch", "status")
MAX_ROWS = 5000


def csv_value(value):
	value = str(value or "")
	# Treat user-entered labels as text when a spreadsheet opens the download.
	return "'" + value if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else value


@frappe.whitelist(methods=["GET"])
def export_positions(company=None, department=None, branch=None):
	if not enabled() or not frappe.conf.get("kandil_parity_enabled"):
		frappe.throw(_("The scoped position register is not enabled on this site."), frappe.PermissionError)
	if frappe.session.user == "Guest" or (
		frappe.session.user != "Administrator"
		and (
			not frappe.db.get_value("User", frappe.session.user, "enabled")
			or "Kandil Recruiter" not in frappe.get_roles()
		)
	):
		frappe.throw(
			_("Only authorized recruiters can export the position register."), frappe.PermissionError
		)
	filters = {}
	for field, value in (("company", company), ("department", department), ("branch", branch)):
		if value is not None:
			if not isinstance(value, str) or len(value) > 140:
				frappe.throw(_("Position export filters must be text values."))
			if value:
				filters[field] = value
	rows = frappe.get_list(
		"Kandil Position",
		fields=list(FIELDS),
		filters=filters,
		order_by="name asc",
		limit_page_length=MAX_ROWS + 1,
	)
	if len(rows) > MAX_ROWS:
		frappe.throw(_("Narrow the register filters to export at most 5000 positions."))
	buffer = io.StringIO(newline="")
	writer = csv.writer(buffer)
	writer.writerow(FIELDS)
	for row in rows:
		# Query hooks AND detail-level native permissions are required; a future
		# extra detail rule must not silently make CSV less restrictive.
		frappe.get_doc("Kandil Position", row.name).check_permission("read")
		writer.writerow(csv_value(row.get(field)) for field in FIELDS)
	return Response(
		("\ufeff" + buffer.getvalue()).encode("utf-8"),
		mimetype="text/csv",
		headers={
			"Content-Disposition": 'attachment; filename="kandil-position-register.csv"',
			"Cache-Control": "private, no-store",
			"X-Content-Type-Options": "nosniff",
		},
	)
