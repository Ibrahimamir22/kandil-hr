"""Parity-only deny gate for unaudited HR Script/Query/Custom Reports.

Native query/report-builder lists retain scoped ORM access. Script/Query reports
can execute get_all/raw SQL, so row hooks cannot establish isolation. Until a
report has a reviewed scoped replacement, non-Administrator users cannot execute
these HR reports or retrieve their prepared payloads. This also covers exports:
query_report._export_query calls run/get_report_doc, and background execution
calls the Report controller. PreparedReport payload/conversion/download and raw
File download each have an independent guard. No upstream source is patched.
"""

import frappe
from frappe import _


def sensitive_report(report, seen=None, include_builder=False):
	if isinstance(report, str):
		report = frappe.get_doc("Report", report)
	seen = set() if seen is None else seen
	if report.name in seen:
		return True
	seen.add(report.name)
	if report.report_type == "Custom Report" and report.reference_report:
		return sensitive_report(report.reference_report, seen, include_builder)
	if report.report_type == "Report Builder" and not include_builder:
		return False
	reference = report.ref_doctype or ""
	module = frappe.db.get_value("DocType", reference, "module") if reference else None
	return (
		report.module in ("HR", "Payroll", "Kandil HR")
		or module in ("HR", "Payroll", "Kandil HR")
		or reference.startswith("Kandil ")
	)


def report_allowed(report, user=None, include_builder=False):
	from kandil_hr.recruitment.models import enabled

	return (
		not enabled()
		or (user or frappe.session.user) == "Administrator"
		or not sensitive_report(report, include_builder=include_builder)
	)


def assert_report_allowed(report, user=None, include_builder=False):
	if not report_allowed(report, user, include_builder):
		frappe.throw(
			_("This HR report is unavailable until its scoped data access has been verified."),
			frappe.PermissionError,
		)


class ReportMixin:
	def is_permitted(self):
		return report_allowed(self) and super().is_permitted()

	def execute_query_report(self, filters):
		assert_report_allowed(self)
		return super().execute_query_report(filters)

	def execute_script_report(self, filters):
		assert_report_allowed(self)
		return super().execute_script_report(filters)

	def execute_module(self, filters):
		assert_report_allowed(self)
		return super().execute_module(filters)

	def execute_script(self, filters):
		assert_report_allowed(self)
		return super().execute_script(filters)

	def execute_snapshot_report(self, filters):
		assert_report_allowed(self)
		return super().execute_snapshot_report(filters)


class PreparedReportMixin:
	def before_insert(self):
		assert_report_allowed(self.report_name, include_builder=True)
		return super().before_insert()

	def get_prepared_data(self, with_file_name=False):
		assert_report_allowed(self.report_name, include_builder=True)
		return super().get_prepared_data(with_file_name=with_file_name)


def prepared_permission(doc, user=None, ptype=None):
	return report_allowed(doc.report_name, user, include_builder=True)


def blocked_report_names(user=None):
	from kandil_hr.recruitment.models import enabled

	if not enabled() or (user or frappe.session.user) == "Administrator":
		return []
	return [
		row.name
		for row in frappe.get_all(
			"Report", fields=["name", "module", "ref_doctype", "report_type", "reference_report"]
		)
		if sensitive_report(row, include_builder=True)
	]


def prepared_query(user=None):
	blocked = blocked_report_names(user)
	if not blocked:
		return ""
	return (
		"`tabPrepared Report`.report_name NOT IN ("
		+ ",".join(frappe.db.escape(name) for name in blocked)
		+ ")"
	)


def report_file_query(user=None):
	blocked = blocked_report_names(user)
	if not blocked:
		return ""
	names = ",".join(frappe.db.escape(name) for name in blocked)
	return f"(IFNULL(`tabFile`.attached_to_doctype,'')!='Report' OR `tabFile`.attached_to_name NOT IN ({names})) AND (IFNULL(`tabFile`.attached_to_doctype,'')!='Prepared Report' OR `tabFile`.attached_to_name IN (SELECT name FROM `tabPrepared Report` WHERE report_name NOT IN ({names})))"
