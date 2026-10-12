"""Native reference adapters and referenced receipt rollback, synthetic only."""

import unittest
import uuid

import frappe
from frappe.utils import today

from kandil_hr.foundation import outbox


class TestOutboxCurrentAccess(unittest.TestCase):
	def setUp(self):
		from kandil_hr.recruitment.test_commands import TestRecruitmentCommands

		self.f = TestRecruitmentCommands()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()
		self.request, self.opening, _ = self.f.vacancy_fixture()
		self.user = self.f.users["hr"]

	def enqueue(self, doctype, name):
		return outbox.enqueue(
			uuid.uuid4().hex,
			self.user,
			"Synthetic scoped delivery",
			reference_doctype=doctype,
			reference_name=name,
		)

	def test_all_production_reference_types_deliver_with_current_access(self):
		grant = self.f.insert(
			"Kandil Access Grant",
			user=self.user,
			company=self.f.company,
			valid_from=today(),
			can_manage_recruitment=0,
			reason="Synthetic read-only company-wide notification",
		)
		self.assertEqual(grant.can_manage_recruitment, 0)
		structure = self.f.insert(
			"Kandil Structure Change",
			company=self.f.company,
			effective_on=today(),
			reason="Synthetic unapplied notification",
			changes_json='[{"action":"Create","position_code":"SYNTHETIC-UNAPPLIED","title":"Synthetic"}]',
		)
		for doctype, name in (
			("Kandil Hiring Request", self.request),
			("Job Opening", self.opening),
			("Kandil Structure Change", structure.name),
		):
			with self.subTest(doctype=doctype):
				key = self.enqueue(doctype, name)
				self.assertEqual(outbox.deliver(key), "Delivered locally")
				self.assertTrue(frappe.db.get_value("Kandil Notification Outbox", key, "notification_log"))

	def test_referenced_delivery_rollback_then_retry_has_one_receipt(self):
		key = self.enqueue("Kandil Hiring Request", self.request)
		before = frappe.db.count("Notification Log", {"for_user": self.user})
		frappe.db.savepoint("before_scoped_delivery")
		self.assertEqual(outbox.deliver(key), "Delivered locally")
		frappe.db.rollback(save_point="before_scoped_delivery")
		self.assertEqual(frappe.db.count("Notification Log", {"for_user": self.user}), before)
		self.assertEqual(outbox.deliver(key), "Delivered locally")
		self.assertEqual(outbox.deliver(key), "Delivered locally")
		self.assertEqual(frappe.db.count("Notification Log", {"for_user": self.user}), before + 1)
		self.assertEqual(frappe.db.get_value("Kandil Notification Outbox", key, "attempts"), 1)

	def test_unreviewed_target_is_visible_failure_without_receipt_or_suppression(self):
		key = self.enqueue("Department", self.f.department)
		with self.assertRaisesRegex(ValueError, "reviewed current-access adapter"):
			outbox.deliver(key)
		row = frappe.get_doc("Kandil Notification Outbox", key)
		self.assertEqual(row.status, "Pending")
		self.assertFalse(row.notification_log)


def run():
	from kandil_hr.foundation.concurrency_runner import _guard
	from kandil_hr.foundation.tests_runner import RecordedResult

	_guard()
	suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestOutboxCurrentAccess)
	assert suite.countTestCases() == 3
	result = unittest.TextTestRunner(verbosity=2, resultclass=RecordedResult).run(suite)
	summary = dict(
		result="PASS" if result.wasSuccessful() and not result.skipped else "FAIL",
		total=result.testsRun,
		tests=result.checks,
		failures=len(result.failures),
		errors=len(result.errors),
		skipped=len(result.skipped),
	)
	if not result.wasSuccessful() or result.skipped or result.testsRun != 3:
		error = AssertionError("Current notification reference checks failed")
		error.summary = summary
		raise error
	return summary
