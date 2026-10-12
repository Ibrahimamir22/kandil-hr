"""Native synthetic mail-sink proof, rollback only; no external transport."""

import base64
import unittest
import uuid
from email import policy
from email.parser import BytesParser
from html import escape
from pathlib import Path
from unittest.mock import patch

import frappe

from kandil_hr.foundation import mail_capture as sink
from kandil_hr.foundation import outbox
from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as


class TestMailCapture(unittest.TestCase):
	def setUp(self):
		self.f = TestRecruitmentCommands()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()
		self.request = self.f.request((1,))
		self.user = self.f.users["requester"]
		self.key = uuid.uuid4().hex
		self.outbox = outbox.enqueue(
			self.key,
			self.user,
			"Synthetic request — قنديل",
			"Approved notification <safe>\nطلب تجريبي",
			sink.REQUEST,
			self.request.name,
		)

	def deliver(self):
		self.assertEqual(outbox.deliver(self.outbox), "Delivered locally")
		return frappe.get_doc(sink.DOCTYPE, {"outbox": self.outbox})

	def test_actual_mime_matches_approved_notification_no_external_delivery(self):
		with (
			patch("frappe.sendmail") as send,
			patch(
				"frappe.desk.doctype.notification_log.notification_log.send_notification_email"
			) as notification_send,
		):
			doc = self.deliver()
			send.assert_not_called()
			notification_send.assert_not_called()
		message = BytesParser(policy=policy.default).parsebytes(sink.content(doc))
		self.assertEqual(str(message["To"]), self.user)
		self.assertEqual(str(message["Subject"]), "Synthetic request — قنديل")
		self.assertIn("no provider transmission", message["X-Kandil-Delivery"])
		self.assertEqual(doc.status, "Captured locally")
		stored = frappe.db.get_value("Kandil Notification Outbox", self.outbox, "body") or ""
		plain = message.get_body(preferencelist=("plain",)).get_content().replace("\r\n", "\n")
		self.assertEqual(plain, stored.replace("\r\n", "\n").rstrip("\n") + "\n")
		html = message.get_body(preferencelist=("html",)).get_content().replace("\r\n", "\n")
		self.assertEqual(html, "<p>" + escape(stored).replace("\n", "<br>") + "</p>\n")

	def test_retry_one_capture_and_one_notification_log(self):
		doc = self.deliver()
		receipt = frappe.db.get_value("Kandil Notification Outbox", self.outbox, "notification_log")
		self.assertEqual(self.deliver().name, doc.name)
		self.assertEqual(frappe.db.count(sink.DOCTYPE, {"outbox": self.outbox}), 1)
		self.assertEqual(
			frappe.db.count("Notification Log", {"document_name": self.request.name, "for_user": self.user}),
			1,
		)
		self.assertEqual(
			frappe.db.get_value("Kandil Notification Outbox", self.outbox, "notification_log"), receipt
		)

	def test_capture_failure_rolls_back_then_retry_succeeds(self):
		point = "sink_failure_" + uuid.uuid4().hex
		frappe.db.savepoint(point)
		try:
			with patch.object(
				sink.KandilMailCapture, "insert", side_effect=RuntimeError("Synthetic capture failure")
			):
				with self.assertRaises(RuntimeError):
					outbox.deliver(self.outbox)
		finally:
			frappe.db.rollback(save_point=point)
		self.assertEqual(frappe.db.get_value("Kandil Notification Outbox", self.outbox, "status"), "Pending")
		self.assertEqual(frappe.db.count(sink.DOCTYPE, {"outbox": self.outbox}), 0)
		self.assertEqual(frappe.db.count("Notification Log", {"document_name": self.request.name}), 0)
		self.deliver()

	def test_later_notification_failure_rolls_back_capture(self):
		from frappe.desk.doctype.notification_log.notification_log import NotificationLog

		point = "sink_later_" + uuid.uuid4().hex
		frappe.db.savepoint(point)
		try:
			with patch.object(
				NotificationLog, "insert", side_effect=RuntimeError("Synthetic notification failure")
			):
				with self.assertRaises(RuntimeError):
					outbox.deliver(self.outbox)
		finally:
			frappe.db.rollback(save_point=point)
		self.assertEqual(frappe.db.count(sink.DOCTYPE, {"outbox": self.outbox}), 0)
		self.assertEqual(frappe.db.get_value("Kandil Notification Outbox", self.outbox, "status"), "Pending")

	def test_disabled_recipient_suppressed_without_capture(self):
		frappe.db.set_value("User", self.user, "enabled", 0)
		self.assertEqual(outbox.deliver(self.outbox), "Suppressed")
		self.assertEqual(frappe.db.count(sink.DOCTYPE, {"outbox": self.outbox}), 0)

	def test_revoked_request_scope_suppressed_without_capture(self):
		frappe.db.set_value("Kandil Access Grant", self.f.grants["requester"], "revoked", 1)
		self.assertEqual(outbox.deliver(self.outbox), "Suppressed")
		self.assertEqual(frappe.db.count(sink.DOCTYPE, {"outbox": self.outbox}), 0)

	def test_recipient_native_get_list_download_and_revocation(self):
		from frappe.client import get, get_list

		doc = self.deliver()
		with acting_as(self.user):
			self.assertEqual(get(sink.DOCTYPE, doc.name)["name"], doc.name)
			self.assertEqual(
				[r["name"] for r in get_list(sink.DOCTYPE, filters={"name": doc.name})], [doc.name]
			)
			sink.download(doc.name)
			self.assertEqual(frappe.response.filecontent, sink.content(doc))
		frappe.db.set_value("Kandil Access Grant", self.f.grants["requester"], "revoked", 1)
		with acting_as(self.user):
			with self.assertRaises(frappe.PermissionError):
				get(sink.DOCTYPE, doc.name)
			self.assertEqual(get_list(sink.DOCTYPE, filters={"name": doc.name}), [])
			with self.assertRaises(frappe.PermissionError):
				sink.download(doc.name)

	def test_other_scoped_hr_cannot_read_recipient_mail(self):
		from frappe.client import get, get_list

		doc = self.deliver()
		with acting_as(self.f.users["hr"]):
			with self.assertRaises(frappe.PermissionError):
				get(sink.DOCTYPE, doc.name)
			self.assertEqual(get_list(sink.DOCTYPE, filters={"name": doc.name}), [])
			with self.assertRaises(frappe.PermissionError):
				sink.download(doc.name)

	def test_native_forgery_mutation_delete_and_rename_denied(self):
		doc = self.deliver()
		with self.assertRaises(frappe.PermissionError):
			frappe.copy_doc(doc).insert(ignore_permissions=True)
		doc.subject = "Forged"
		with self.assertRaises(frappe.PermissionError):
			doc.save(ignore_permissions=True)
		with self.assertRaises(frappe.PermissionError):
			frappe.delete_doc(sink.DOCTYPE, doc.name, ignore_permissions=True)
		with self.assertRaises(frappe.PermissionError):
			doc.before_rename(doc.name, "forged")

	def test_stale_share_no_download_bypass_and_purge_native_denial(self):
		from frappe.client import get

		from kandil_hr.foundation.files import purge_protected_shares

		doc = self.deliver()
		share = frappe.get_doc(
			dict(
				doctype="DocShare",
				name=uuid.uuid4().hex,
				share_doctype=sink.DOCTYPE,
				share_name=doc.name,
				user=self.f.users["hr"],
				read=1,
			)
		)
		share.db_insert()
		with acting_as(self.f.users["hr"]):
			with self.assertRaises(frappe.PermissionError):
				sink.download(doc.name)
		self.assertGreaterEqual(purge_protected_shares(), 1)
		with acting_as(self.f.users["hr"]):
			with self.assertRaises(frappe.PermissionError):
				get(sink.DOCTYPE, doc.name)
			with self.f.rejected(frappe.PermissionError):
				frappe.share.add(sink.DOCTYPE, doc.name, self.f.users["hr"], read=1)

	def test_attached_file_owner_cannot_bypass_parent(self):
		from frappe.handler import download_file

		doc = self.deliver()
		prefix = "synthetic-mail-capture-" + uuid.uuid4().hex
		file = frappe.get_doc(
			dict(
				doctype="File",
				file_name=prefix + ".txt",
				content=prefix,
				is_private=1,
				attached_to_doctype=sink.DOCTYPE,
				attached_to_name=doc.name,
			)
		).insert(ignore_permissions=True)
		path = Path(file.get_full_path()).resolve()
		self.assertEqual(path.parent, Path(frappe.get_site_path("private", "files")).resolve())
		self.assertTrue(path.name.startswith(prefix))
		self.addCleanup(path.unlink, missing_ok=True)
		file.db_set("owner", self.f.users["hr"], update_modified=False)
		with acting_as(self.f.users["hr"]):
			self.assertFalse(frappe.get_doc("File", file.name).is_downloadable())
			with self.assertRaises(frappe.PermissionError):
				download_file(file.file_url)

	def test_native_export_and_query_report_deny_payload(self):
		from frappe.core.doctype.data_export.exporter import export_data
		from frappe.desk import query_report

		doc = self.deliver()
		report = frappe.get_doc(
			dict(
				doctype="Report",
				report_name="Synthetic capture " + uuid.uuid4().hex,
				ref_doctype=sink.DOCTYPE,
				report_type="Query Report",
				is_standard="No",
				module="Kandil HR",
				query="SELECT name,mime_content FROM `tabKandil Mail Capture`",
				roles=[dict(role="Kandil Recruiter")],
			)
		).insert(ignore_permissions=True)
		with acting_as(self.f.users["hr"]):
			with self.assertRaises(frappe.PermissionError):
				export_data(
					doctype=sink.DOCTYPE,
					with_data=True,
					select_columns={sink.DOCTYPE: ["name", "mime_content"]},
					filters={"name": doc.name},
				)
			with self.assertRaises(frappe.PermissionError):
				query_report.run(report.name, filters={})

	def test_context_required_nonrequest_skipped_and_hash_checked(self):
		doc = frappe.get_doc("Kandil Notification Outbox", self.outbox)
		with self.assertRaises(frappe.PermissionError):
			sink.capture_delivery(doc)
		doc.reference_doctype = "Kandil Position"
		with sink.delivery_effect():
			self.assertIsNone(sink.capture_delivery(doc))
		capture = self.deliver()
		capture.mime_content = base64.b64encode(b"changed").decode()
		with self.assertRaises(frappe.ValidationError):
			sink.content(capture)


def run():
	if (
		frappe.local.site != "kandil-parity.localhost"
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
		or not frappe.conf.get("allow_tests")
		or not sink.active()
	):
		raise RuntimeError("Mail capture checks require isolated opted-in parity Administrator CLI")
	names = sorted(name for name in TestMailCapture.__dict__ if name.startswith("test_"))
	if len(names) != 13:
		raise RuntimeError("Unexpected mail capture discovery count")
	result = unittest.TextTestRunner(verbosity=2).run(
		unittest.TestSuite(TestMailCapture(name) for name in names)
	)
	value = dict(
		result="PASS" if result.wasSuccessful() and not result.skipped and result.testsRun == 13 else "FAIL",
		discovered=13,
		executed=result.testsRun,
		native=13,
		pure=0,
		failures=len(result.failures),
		errors=len(result.errors),
		skips=len(result.skipped),
	)
	if value["result"] != "PASS":
		error = AssertionError("Mail capture native checks failed")
		error.summary = value
		raise error
	return value
