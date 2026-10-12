"""Actual frozen Board-route local notifications; rollback-only native checks."""

import unittest
import uuid

import frappe

from kandil_hr.foundation import mail_capture, outbox
from kandil_hr.recruitment.test_authority_audit import TestAuthorityAudit


class TestBoardMailCapture(unittest.TestCase):
	def setUp(self):
		self.authority = TestAuthorityAudit()
		self.addCleanup(self.authority.doCleanups)
		self.authority.setUp()
		self.f = self.authority.f
		self.request = self.authority.reach_board(self.authority.request())
		self.vice = self.f.users["vice"]
		self.name = frappe.db.get_value(
			"Kandil Notification Outbox",
			{"reference_name": self.request.name, "recipient": self.vice, "status": "Pending"},
			"name",
		)
		self.assertTrue(self.name, "Real CEO completion must notify frozen Vice")
		self.assertFalse(any(step.principal == self.vice for step in self.request.approval_steps))

	def suppressed(self, name=None):
		name = name or self.name
		self.assertEqual(outbox.deliver(name), "Suppressed")
		self.assertEqual(outbox.deliver(name), "Suppressed")
		self.assertEqual(frappe.db.count(mail_capture.DOCTYPE, {"outbox": name}), 0)
		self.assertFalse(frappe.db.get_value("Kandil Notification Outbox", name, "notification_log"))

	def test_frozen_vice_gets_one_capture_and_one_local_log_on_replay(self):
		self.assertEqual(outbox.deliver(self.name), "Delivered locally")
		self.assertEqual(outbox.deliver(self.name), "Delivered locally")
		self.assertEqual(frappe.db.count(mail_capture.DOCTYPE, {"outbox": self.name}), 1)
		self.assertEqual(
			frappe.db.count("Notification Log", {"document_name": self.request.name, "for_user": self.vice}),
			1,
		)

	def test_unrelated_board_member_with_matching_scope_is_suppressed(self):
		user = self.f.users["outsider"]
		doc = frappe.get_doc("User", user)
		doc.set("roles", [dict(role="Kandil Board Approver")])
		doc.save(ignore_permissions=True)
		self.f.insert(
			"Kandil Access Grant",
			user=user,
			company=self.f.company,
			department=self.f.department,
			valid_from=frappe.utils.today(),
			can_manage_recruitment=1,
			reason="Synthetic unrelated Board member",
		)
		name = outbox.enqueue(
			uuid.uuid4().hex,
			user,
			"Synthetic unrelated Board notice",
			reference_doctype=self.request.doctype,
			reference_name=self.request.name,
		)
		self.suppressed(name)

	def test_vice_losing_board_role_is_suppressed(self):
		doc = frappe.get_doc("User", self.vice)
		doc.set("roles", [dict(role="Kandil Approver")])
		doc.save(ignore_permissions=True)
		self.suppressed()

	def test_vice_revoked_scope_is_suppressed(self):
		grant = frappe.get_doc("Kandil Access Grant", {"user": self.vice, "company": self.f.company})
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		self.suppressed()


def run():
	from kandil_hr.foundation.concurrency_runner import _guard
	from kandil_hr.foundation.tests_runner import RecordedResult

	_guard()
	suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestBoardMailCapture)
	assert suite.countTestCases() == 4
	result = unittest.TextTestRunner(verbosity=2, resultclass=RecordedResult).run(suite)
	summary = dict(
		result="PASS" if result.wasSuccessful() and not result.skipped else "FAIL",
		discovered=4,
		executed=result.testsRun,
		failures=len(result.failures),
		errors=len(result.errors),
		skips=len(result.skipped),
		tests=result.checks,
	)
	if not result.wasSuccessful() or result.skipped or result.testsRun != 4:
		error = AssertionError("Board local-mail checks failed")
		error.summary = summary
		raise error
	return summary
