"""Synthetic native recipient/privacy tests; one case renders actual AR/EN PDFs."""

import hashlib
import json
import sys
import unittest
import uuid
from datetime import UTC, datetime
from email import policy
from email.parser import Parser
from pathlib import Path
from unittest.mock import patch

import frappe
from frappe.utils import today

from kandil_hr.foundation import outbox
from kandil_hr.organization import api
from kandil_hr.organization import document_delivery as delivery
from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as


class TestDocumentDelivery(unittest.TestCase):
	def setUp(self):
		self.f = TestRecruitmentCommands()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()
		for key in ("hr", "sector"):
			self.f.insert(
				"Kandil Access Grant",
				user=self.f.users[key],
				company=self.f.company,
				valid_from=today(),
				can_manage_recruitment=1,
				reason="Synthetic JD company authoring scope",
			)
		self.user("recipient")
		self.user("other")
		self.user("outsider", scope=False)
		self.user("candidate", scope=True, role="Kandil Requester")
		position = frappe.get_doc("Kandil Position", self.f.positions[0])
		with acting_as(self.f.users["hr"]):
			self.jd = self.f.insert(
				"Kandil JD Revision",
				company=self.f.company,
				department=self.f.department,
				branch=position.branch,
				position=position.name,
				valid_from=today(),
				purpose="Operate safely",
				purpose_ar="العمل بأمان",
				responsibility_rows=[
					dict(description="Quality", description_ar="الجودة"),
					dict(description="Safety", description_ar="السلامة"),
					dict(description="Reporting", description_ar="التقارير"),
				],
			)
		with acting_as(self.f.users["sector"]):
			api.approve_revision(self.jd.doctype, self.jd.name, str(self.jd.modified))
		self.jd.reload()
		self.no_mail = patch("frappe.sendmail", side_effect=AssertionError("No real email allowed"))
		self.no_mail.start()
		self.addCleanup(self.no_mail.stop)

	def user(self, key, scope=True, role="Kandil Recruiter"):
		user = self.f.prefix.lower() + "-" + key + "@example.invalid"
		self.f.users[key] = user
		self.f.insert(
			"User",
			email=user,
			first_name=key,
			enabled=1,
			send_welcome_email=0,
			user_type="System User",
			roles=[dict(role=role)],
		)
		if scope:
			self.f.grants[key] = self.f.insert(
				"Kandil Access Grant",
				user=user,
				company=self.f.company,
				department=self.f.department,
				valid_from=today(),
				can_manage_recruitment=1,
				reason="Synthetic document recipient",
			).name
		return user

	def capture(self, users=None, **values):
		args = dict(
			name=self.jd.name,
			recipients=users or [self.f.users["recipient"]],
			expected_version=str(self.jd.modified),
			command_id=uuid.uuid4().hex,
		)
		args.update(values)
		with acting_as(self.f.users["hr"]):
			return delivery.capture(**args)

	def counts(self):
		return tuple(
			frappe.db.count(dt)
			for dt in (delivery.DOCTYPE, "Kandil Notification Outbox", "Kandil Security Event", "Email Queue")
		)

	def test_actual_ar_en_mime_contains_pdf_and_local_receipt(self):
		for language in ("ar", "en"):
			result = self.capture(language=language, note="<script>not markup</script>")
			self.assertFalse(result["provider_sent"])
			doc = frappe.get_doc(delivery.DOCTYPE, result["captures"][0])
			mail = Parser(policy=policy.default).parsestr(delivery.mime_bytes(doc.mime_content).decode())
			self.assertEqual(str(mail["To"]), self.f.users["recipient"])
			self.assertIn("&lt;script&gt;", mail.get_body(preferencelist=("html",)).get_content())
			self.assertIn(
				"العمل بأمان" if language == "ar" else "Operate safely",
				mail.get_body(preferencelist=("html",)).get_content(),
			)
			attachments = list(mail.iter_attachments())
			self.assertEqual(len(attachments), 1)
			self.assertTrue(attachments[0].get_payload(decode=True).startswith(b"%PDF-"))
			self.assertEqual(doc.status, "Captured locally")
			notice = frappe.db.get_value("Kandil Notification Outbox", {"reference_name": doc.name}, "name")
			self.assertEqual(outbox.deliver(notice), "Delivered locally")
			with acting_as(self.f.users["recipient"]):
				delivery.download(doc.name)
				self.assertEqual(
					hashlib.sha256(frappe.local.response.filecontent).hexdigest(), doc.content_hash
				)

	def test_ten_distinct_users_pass_duplicates_dedupe_eleven_fail_atomically(self):
		ids = [self.user("batch" + str(i)) for i in range(11)]
		before = self.counts()
		with self.f.rejected(frappe.ValidationError):
			self.capture(ids)
		self.assertEqual(self.counts(), before)
		# Recipient-count boundary uses native records with a deliberately stubbed PDF;
		# the preceding AR/EN case independently exercises actual PDF generation.
		with patch("frappe.utils.pdf.get_pdf", return_value=b"%PDF-synthetic-boundary"):
			result = self.capture([*ids[:10], ids[0]])
		self.assertEqual(len(result["captures"]), 10)
		self.assertEqual(len(set(result["captures"])), 10)

	def test_external_candidate_disabled_missing_email_and_scope_denied_atomically(self):
		invalid = ["external-candidate@example.invalid", self.f.users["candidate"], self.f.users["outsider"]]
		self.f.insert("Job Applicant", applicant_name="Synthetic external candidate", email_id=invalid[0])
		for field, value in (
			("enabled", 0),
			("email", ""),
			("email", "one@example.invalid,two@example.invalid"),
		):
			point = "recipient_" + uuid.uuid4().hex
			frappe.db.savepoint(point)
			frappe.db.set_value("User", self.f.users["other"], field, value)
			before = self.counts()
			with self.f.rejected(frappe.PermissionError):
				self.capture([self.f.users["recipient"], self.f.users["other"]])
			self.assertEqual(self.counts(), before)
			frappe.db.rollback(save_point=point)
		for user in invalid:
			before = self.counts()
			with self.f.rejected(frappe.PermissionError):
				self.capture([self.f.users["recipient"], user])
			self.assertEqual(self.counts(), before)

	def test_capture_replay_exact_and_payload_collision_denied(self):
		key = uuid.uuid4().hex
		with patch("frappe.utils.pdf.get_pdf", return_value=b"%PDF-synthetic-replay"):
			result = self.capture(command_id=key)
		before = self.counts()
		with patch("frappe.utils.pdf.get_pdf", side_effect=AssertionError("Replay must not regenerate")):
			self.assertEqual(self.capture(command_id=key), result)
		self.assertEqual(self.counts(), before)
		with self.f.rejected(frappe.ValidationError):
			self.capture(command_id=key, note="Different command payload")
		self.assertEqual(self.counts(), before)

	def test_capture_privacy_native_list_download_and_immutability(self):
		with patch("frappe.utils.pdf.get_pdf", return_value=b"%PDF-synthetic-private"):
			name = self.capture()["captures"][0]
		doc = frappe.get_doc(delivery.DOCTYPE, name)
		for key in ("hr", "recipient"):
			with acting_as(self.f.users[key]):
				doc.check_permission("read")
				self.assertEqual(
					frappe.get_list(delivery.DOCTYPE, filters={"name": name}, pluck="name"), [name]
				)
		for key in ("other", "outsider", "candidate"):
			with acting_as(self.f.users[key]):
				with self.f.rejected(frappe.PermissionError):
					delivery.download(name)
				if key == "candidate":
					with self.assertRaises(frappe.PermissionError):
						frappe.get_list(delivery.DOCTYPE, filters={"name": name}, pluck="name")
				else:
					self.assertEqual(
						frappe.get_list(delivery.DOCTYPE, filters={"name": name}, pluck="name"), []
					)
		with acting_as(self.f.users["hr"]):
			with self.f.rejected(frappe.PermissionError):
				doc.note = "Forged"
				doc.save(ignore_permissions=True)
			with self.f.rejected(frappe.PermissionError):
				frappe.delete_doc(delivery.DOCTYPE, name, ignore_permissions=True)
			with self.f.rejected(frappe.PermissionError):
				doc.before_rename(name, name + "-forged")
			with self.f.rejected(frappe.ValidationError):
				frappe.db.set_value(delivery.DOCTYPE, name, "mime_content", "corrupt content")
				delivery.download(name)

	def test_revoked_or_disabled_recipient_suppresses_delivery_and_replay(self):
		for field in ("scope", "account"):
			command_id = uuid.uuid4().hex
			with patch("frappe.utils.pdf.get_pdf", return_value=b"%PDF-synthetic-revocation"):
				result = self.capture(command_id=command_id)
			name = result["captures"][0]
			notice = frappe.db.get_value("Kandil Notification Outbox", {"reference_name": name}, "name")
			point = "revoke_" + uuid.uuid4().hex
			frappe.db.savepoint(point)
			if field == "scope":
				frappe.db.set_value("Kandil Access Grant", self.f.grants["recipient"], "revoked", 1)
			else:
				frappe.db.set_value("User", self.f.users["recipient"], "enabled", 0)
			self.assertEqual(outbox.deliver(notice), "Suppressed")
			with self.f.rejected(frappe.PermissionError):
				self.capture(command_id=command_id)
			with acting_as(self.f.users["recipient"]), self.f.rejected(frappe.PermissionError):
				delivery.download(name)
			frappe.db.rollback(save_point=point)

	def test_draft_and_stale_version_sender_scope_and_generic_email_denied(self):
		from frappe.core.doctype.communication.email import make

		with acting_as(self.f.users["hr"]), self.f.rejected(frappe.PermissionError):
			make(
				doctype=self.jd.doctype,
				name=self.jd.name,
				recipients="external@example.invalid",
				content="Native bypass",
				send_email=True,
			)
		with self.f.rejected(frappe.ValidationError):
			self.capture(expected_version="2000-01-01 00:00:00")
		point = "draft_" + uuid.uuid4().hex
		frappe.db.savepoint(point)
		frappe.db.set_value(self.jd.doctype, self.jd.name, "status", "Draft")
		with self.f.rejected(frappe.ValidationError):
			self.capture()
		frappe.db.rollback(save_point=point)
		with acting_as(self.f.users["outsider"]), self.f.rejected(frappe.PermissionError):
			delivery.capture(
				self.jd.name, [self.f.users["recipient"]], str(self.jd.modified), uuid.uuid4().hex
			)

	def test_picker_only_eligible_and_no_private_global_directory(self):
		with acting_as(self.f.users["hr"]):
			users = {row["user"] for row in delivery.recipients(self.jd.name)}
		self.assertIn(self.f.users["recipient"], users)
		self.assertNotIn(self.f.users["outsider"], users)
		self.assertNotIn(self.f.users["candidate"], users)
		with acting_as(self.f.users["candidate"]), self.f.rejected(frappe.PermissionError):
			delivery.recipients(self.jd.name)

	def location_fixture(self):
		"""A readable anchor whose manager and second same-job location are in B."""
		a, b = [frappe.get_doc("Kandil Position", name) for name in self.f.positions]
		with api.transition():
			job = self.f.insert("Designation", designation_name=self.f.prefix + "-private-manager")
			parent = self.f.insert(
				"Kandil Position",
				company=self.f.company,
				department=self.f.department,
				branch=b.branch,
				designation=job.name,
				position_code=self.f.prefix + "-private-parent",
				title="PRIVATE B MANAGER",
				title_ar="مدير الموقع السري ب",
			)
		# Synthetic seed only; the tested operation is delivery, not structure approval.
		edge = frappe.db.get_value("Kandil Position Hierarchy", {"position": a.name}, "name")
		frappe.db.set_value("Kandil Position Hierarchy", edge, "parent_position", parent.name)
		return a, b, parent

	def restrict(self, key, branches):
		for name in frappe.get_all(
			"Kandil Access Grant",
			filters={"user": self.f.users[key], "company": self.f.company, "revoked": 0},
			pluck="name",
		):
			frappe.db.set_value("Kandil Access Grant", name, "revoked", 1)
		for branch in branches:
			self.f.insert(
				"Kandil Access Grant",
				user=self.f.users[key],
				company=self.f.company,
				department=self.f.department,
				branch=branch,
				valid_from=today(),
				can_manage_recruitment=1,
				reason="Synthetic explicit delivery branch scope",
			)

	def test_sender_recipient_intersection_omits_hidden_location_and_manager(self):
		a, b, _parent = self.location_fixture()
		self.restrict("hr", [a.branch])
		with patch("frappe.utils.pdf.get_pdf", return_value=b"%PDF-intersection"):
			name = self.capture(language="en")["captures"][0]
		doc = frappe.get_doc(delivery.DOCTYPE, name)
		mail = Parser(policy=policy.default).parsestr(delivery.mime_bytes(doc.mime_content).decode())
		html = mail.get_body(preferencelist=("html",)).get_content()
		self.assertIn(a.branch, html)
		self.assertNotIn(b.branch, html)
		self.assertNotIn("PRIVATE B MANAGER", html)
		self.assertNotIn("مدير الموقع السري ب", html)
		self.assertEqual(
			json.loads(doc.included_scopes_json),
			[dict(company=self.f.company, department=self.f.department, branch=a.branch)],
		)
		with acting_as(self.f.users["hr"]):
			delivery.download(name)
			self.assertEqual(frappe.local.response.filecontent, delivery.mime_bytes(doc.mime_content))

	def assert_hidden_capture(self, name, key):
		from frappe.client import get

		with acting_as(self.f.users[key]):
			with self.f.rejected(frappe.PermissionError):
				get(delivery.DOCTYPE, name)
			self.assertEqual(
				frappe.get_list(delivery.DOCTYPE, filters={"name": name}, fields=["name", "mime_content"]), []
			)
			with self.f.rejected(frappe.PermissionError):
				delivery.download(name)

	def test_partial_location_revocation_denies_native_payload_replay_and_dispatch(self):
		a, b, _parent = self.location_fixture()
		for key in ("hr", "recipient"):
			self.restrict(key, [a.branch, b.branch])
		command_id = uuid.uuid4().hex
		with patch("frappe.utils.pdf.get_pdf", return_value=b"%PDF-revocation"):
			name = self.capture(command_id=command_id, language="en")["captures"][0]
		doc = frappe.get_doc(delivery.DOCTYPE, name)
		self.assertEqual({s["branch"] for s in json.loads(doc.included_scopes_json)}, {a.branch, b.branch})
		mail = Parser(policy=policy.default).parsestr(delivery.mime_bytes(doc.mime_content).decode())
		self.assertIn("PRIVATE B MANAGER", mail.get_body(preferencelist=("html",)).get_content())
		notice = frappe.db.get_value("Kandil Notification Outbox", {"reference_name": name}, "name")
		for key in ("hr", "recipient"):
			point = "partial_" + uuid.uuid4().hex
			frappe.db.savepoint(point)
			self.restrict(key, [a.branch])
			self.assertTrue(
				delivery.has_scope(
					self.f.users[key], self.jd.company, self.jd.department, self.jd.branch, "read"
				)
			)
			self.assert_hidden_capture(name, key)
			with self.f.rejected(frappe.PermissionError):
				self.capture(command_id=command_id, language="en")
			if key == "recipient":
				self.assertEqual(outbox.deliver(notice), "Suppressed")
			frappe.db.rollback(save_point=point)

	def test_missing_or_malformed_scope_capture_fails_closed(self):
		with patch("frappe.utils.pdf.get_pdf", return_value=b"%PDF-invalid-scope"):
			name = self.capture()["captures"][0]
		notice = frappe.db.get_value("Kandil Notification Outbox", {"reference_name": name}, "name")
		for value in (None, "not-json", "[]", '[{"company":"wrong"}]'):
			point = "scope_shape_" + uuid.uuid4().hex
			frappe.db.savepoint(point)
			frappe.db.set_value(delivery.DOCTYPE, name, "included_scopes_json", value)
			self.assert_hidden_capture(name, "recipient")
			self.assert_hidden_capture(name, "hr")
			self.assertEqual(outbox.deliver(notice), "Suppressed")
			frappe.db.rollback(save_point=point)

	def test_print_revocation_retaining_read_denies_stored_pdf_and_outbox(self):
		with patch("frappe.utils.pdf.get_pdf", return_value=b"%PDF-print-boundary"):
			name = self.capture()["captures"][0]
		notice = frappe.db.get_value("Kandil Notification Outbox", {"reference_name": name}, "name")
		# Native role-permission rows are rolled back with the isolated fixture.
		permissions = frappe.get_all("Custom DocPerm", filters={"parent": self.jd.doctype}, fields=["name"])
		kind = "Custom DocPerm" if permissions else "DocPerm"
		for row in frappe.get_all(
			kind, filters={"parent": self.jd.doctype, "role": "Kandil Recruiter"}, pluck="name"
		):
			frappe.db.set_value(kind, row, "print", 0)
		frappe.clear_cache(doctype=self.jd.doctype)

		# unittest is LIFO: this callback drains the fixture's rollback first,
		# then evicts permission metadata. The earlier fixture callback is a no-op.
		def rollback_then_clear():
			try:
				self.f.doCleanups()
			finally:
				frappe.clear_cache(doctype=self.jd.doctype)

		self.addCleanup(rollback_then_clear)
		with acting_as(self.f.users["recipient"]):
			self.assertTrue(frappe.has_permission(self.jd.doctype, "read", doc=self.jd))
			self.assertFalse(frappe.has_permission(self.jd.doctype, "print", doc=self.jd))
		self.assert_hidden_capture(name, "recipient")
		self.assertEqual(outbox.deliver(notice), "Suppressed")

	def test_picker_filter_denials_do_not_emit_messages_and_restore_flag(self):
		old_messages = list(frappe.local.message_log)
		old_flag = frappe.flags.get("mute_messages")
		with acting_as(self.f.users["hr"]):
			users = {row["user"] for row in delivery.recipients(self.jd.name)}
		self.assertIn(self.f.users["recipient"], users)
		self.assertNotIn(self.f.users["candidate"], users)
		self.assertEqual(frappe.local.message_log, old_messages)
		self.assertEqual(frappe.flags.get("mute_messages"), old_flag)


def run():
	from kandil_hr.foundation.tests_runner import RecordedResult

	if (
		frappe.local.site != "kandil-parity.localhost"
		or not frappe.conf.get("allow_tests")
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
	):
		raise RuntimeError("Document tests require isolated parity CLI")
	paths = [Path(__file__), Path(delivery.__file__), Path(delivery.documents.__file__)]
	before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2, resultclass=RecordedResult).run(
		unittest.defaultTestLoader.loadTestsFromTestCase(TestDocumentDelivery)
	)
	after = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
	report = dict(
		suite="document-delivery",
		checked_at=datetime.now(UTC).isoformat(),
		site=frappe.local.site,
		total=result.testsRun,
		successful=result.wasSuccessful() and not result.skipped and result.testsRun == 13,
		checks=result.checks,
		source_hashes=after,
		source_unchanged=before == after,
		fixtures_rolled_back=True,
		limitations=[
			"Captured locally only; no email/provider transmission",
			"AR/EN actual PDF MIME tested; recipient boundary cases stub PDF generation",
			"Native JD read/print role and scope remain mandatory; no broad portal or finance permissions added",
		],
	)
	if not report["successful"]:
		print(json.dumps(report))
		raise AssertionError("Document delivery suite failed")
	return report
