"""Native report/file/account entry-point checks on the isolated parity site."""

import gzip
import io
import unittest
import uuid
import zipfile
from unittest.mock import patch

import frappe

from kandil_hr.foundation import files, reports


class TestReportsAndAccounts(unittest.TestCase):
	def setUp(self):
		from kandil_hr.foundation.test_foundation import TestFoundationDatabase

		self.fixture = TestFoundationDatabase()
		self.addCleanup(self.fixture.doCleanups)
		self.fixture.setUp()
		self.user = self.fixture.user
		user = frappe.get_doc("User", self.user)
		user.append("roles", {"role": "HR User"})
		user.append("roles", {"role": "Prepared Report User"})
		user.save(ignore_permissions=True)
		self.report = "Recruitment Analytics"

	def test_native_run_export_script_and_prepare_reject_unscoped_hr_report(self):
		from frappe.core.doctype.prepared_report.prepared_report import make_prepared_report
		from frappe.desk import query_report

		frappe.set_user(self.user)
		filters = {"company": self.fixture.companies[0], "on_date": "2026-10-12"}
		for action in (
			lambda: query_report.run(self.report, filters=filters),
			lambda: query_report.get_script(self.report),
			lambda: make_prepared_report(self.report, filters),
			lambda: query_report._export_query(
				frappe._dict(
					report_name=self.report, file_format_type="CSV", filters=filters, custom_columns="[]"
				),
				{},
			),
			lambda: frappe.get_doc("Report", self.report).execute_script_report(filters),
		):
			with self.assertRaises(frappe.PermissionError):
				action()

	def test_existing_prepared_payload_and_owned_file_cannot_bypass_report_gate(self):
		from frappe.client import get as client_get
		from frappe.client import get_list
		from frappe.core.doctype.file.utils import find_file_by_url
		from frappe.core.doctype.prepared_report.prepared_report import (
			download_attachment,
			enqueue_json_to_csv_conversion,
		)

		# A legacy completed row bypasses new insertion guard and enqueuing deliberately.
		prepared = frappe.get_doc(
			dict(
				doctype="Prepared Report",
				name=uuid.uuid4().hex,
				report_name=self.report,
				owner=self.user,
				status="Completed",
				filters="{}",
			)
		)
		prepared.db_insert()
		file = frappe.get_doc(
			dict(
				doctype="File",
				owner=self.user,
				file_name="synthetic-report-" + uuid.uuid4().hex + ".json.gz",
				content=gzip.compress(b'{"result": [["Synthetic private report"]]}'),
				is_private=1,
				attached_to_doctype="Prepared Report",
				attached_to_name=prepared.name,
			)
		).insert(ignore_permissions=True)
		# Simulate a legacy file owned by the report requester; insert resets owner.
		file.db_set("owner", self.user, update_modified=False)
		self.assertEqual(file.owner, self.user)
		frappe.set_user(self.user)
		with self.assertRaises(frappe.PermissionError):
			client_get("Prepared Report", prepared.name)
		with self.assertRaises(frappe.PermissionError):
			frappe.get_doc("Prepared Report", prepared.name).get_prepared_data()
		with self.assertRaises(frappe.ValidationError):
			download_attachment(prepared.name)
		with self.assertRaises(frappe.PermissionError):
			enqueue_json_to_csv_conversion(prepared.name)
		self.assertIsNone(find_file_by_url(file.file_url, file.name))
		self.assertEqual(get_list("File", filters={"name": file.name}), [])
		self.assertEqual(get_list("Prepared Report", filters={"name": prepared.name}), [])
		files.zip_files([file.name])
		with zipfile.ZipFile(io.BytesIO(frappe.response.filecontent)) as archive:
			self.assertEqual(archive.namelist(), [])

	def test_report_guard_preserves_builder_nonhr_and_nonparity_behavior(self):
		frappe.set_user(self.user)
		builder = frappe._dict(
			name="Synthetic builder", report_type="Report Builder", ref_doctype="Job Applicant", module="HR"
		)
		core = frappe._dict(
			name="Synthetic core", report_type="Script Report", ref_doctype="User", module="Core"
		)
		self.assertTrue(reports.report_allowed(builder))
		self.assertFalse(reports.report_allowed(builder, include_builder=True))
		self.assertTrue(reports.report_allowed(core))
		self.assertFalse(reports.report_allowed(self.report))
		with patch.dict(frappe.conf, {"kandil_parity_enabled": 0}):
			self.assertTrue(reports.report_allowed(self.report))
		frappe.set_user("Administrator")
		self.assertTrue(reports.report_allowed(self.report))

	def test_language_is_self_service_but_session_and_identity_controls_are_not(self):
		frappe.set_user(self.user)
		user = frappe.get_doc("User", self.user)
		user.language = "ar"
		user.save()
		self.assertEqual(frappe.db.get_value("User", self.user, "language"), "ar")
		user = frappe.get_doc("User", self.user)
		user.simultaneous_sessions = (user.simultaneous_sessions or 1) + 1
		with self.assertRaises(frappe.PermissionError):
			user.save()
		user = frappe.get_doc("User", self.user)
		self.assertTrue(user.social_logins)
		user.social_logins[0].userid = uuid.uuid4().hex
		with self.assertRaises(frappe.PermissionError):
			user.save()
		frappe.set_user("Administrator")
		user = frappe.get_doc("User", self.user)
		user.simultaneous_sessions = (user.simultaneous_sessions or 1) + 1
		user.save()
		self.assertTrue(
			frappe.db.exists(
				"Kandil Security Event",
				{
					"target_user": self.user,
					"action": "Account policy changed",
					"changed_fields": "simultaneous_sessions",
				},
			)
		)
