"""Native controlled-date SLA tests; synthetic parity site, rollback per case."""

import unittest
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

import frappe

from kandil_hr.foundation import outbox
from kandil_hr.foundation.business_calendar import company_calendar
from kandil_hr.foundation.clock import test_clock
from kandil_hr.recruitment import sla


class TestApprovalSLA(unittest.TestCase):
	def setUp(self):
		# Composition reuses real recruitment fixtures without inheriting/discovering
		# every recruitment command test a second time in this module.
		from kandil_hr.recruitment.test_commands import TestRecruitmentCommands

		self.fixture = TestRecruitmentCommands()
		self.addCleanup(self.fixture.doCleanups)
		self.fixture.setUp()
		self.flags = patch.dict(frappe.flags, {"in_test": True})
		self.flags.start()
		self.addCleanup(self.flags.stop)
		self.request = self.fixture.request()
		self.fixture.submit(self.request.name)
		self.calendar = self.fixture.insert(
			"Kandil Business Calendar",
			company=self.fixture.company,
			calendar_title="Synthetic SLA calendar",
			weekend_days="4,5",
			timezone="Africa/Cairo",
		)
		# Existing site calendars remain untouched; select this test's real record.
		self.calendar_patch = patch.object(
			sla, "company_calendar", side_effect=lambda company: company_calendar(company, self.calendar.name)
		)
		self.calendar_patch.start()
		self.addCleanup(self.calendar_patch.stop)
		self.set_waiting_start()

	def set_waiting_start(self):
		doc = self.fixture.load(self.request.name)
		step = next(row for row in doc.approval_steps if row.decision == "Pending")
		instant = datetime(2026, 10, 8, 12, tzinfo=ZoneInfo("Africa/Cairo"))
		stored = instant.replace(tzinfo=None)
		frappe.db.set_value("Kandil Approval Step", step.name, "waiting_since", stored, update_modified=False)
		return step.step_key

	def process_on(self, day):
		with test_clock(datetime.fromisoformat(day + "T12:00:00").replace(tzinfo=ZoneInfo("Africa/Cairo"))):
			return sla.process_request(self.request.name)

	def test_milestones_replay_and_expiry_preserves_pending_reservations(self):
		before = self.fixture.load(self.request.name)
		reserved = [row.reserved_qty for row in before.lines]
		for day, stage, recipients in (
			("2026-10-12", "reminder", 1),
			("2026-10-13", "escalation", 2),
			("2026-10-14", "warning", 2),
			("2026-10-15", "expiry", 4),
		):
			result = self.process_on(day)
			self.assertEqual(result["status"], stage)
			self.assertEqual(len(result["outbox"]), recipients)
			self.assertEqual(result["outbox"], self.process_on(day)["outbox"])
		after = self.fixture.load(self.request.name)
		self.assertEqual(after.status, "Pending")
		self.assertEqual([row.reserved_qty for row in after.lines], reserved)
		self.assertEqual(str(after.modified), str(before.modified))

	def test_weekend_and_company_holiday_pause_notices(self):
		for day in ("2026-10-09", "2026-10-16", "2026-10-17"):
			self.assertEqual(self.process_on(day)["status"], "Not due")
		holiday = self.fixture.insert(
			"Holiday List",
			holiday_list_name=self.fixture.prefix + " SLA holiday",
			from_date="2026-01-01",
			to_date="2026-12-31",
			holidays=[dict(holiday_date="2026-10-12", description="Synthetic holiday")],
		)
		self.calendar.holiday_list = holiday.name
		self.calendar.save(ignore_permissions=True)
		self.assertEqual(self.process_on("2026-10-12")["status"], "Not due")
		self.assertEqual(self.process_on("2026-10-13")["status"], "reminder")

	def test_delayed_scheduler_catches_up_only_highest_milestone(self):
		result = self.process_on("2026-10-20")
		self.assertEqual(result["status"], "expiry")
		self.assertEqual(len(result["outbox"]), 4)
		self.assertEqual(result["outbox"], self.process_on("2026-10-21")["outbox"])

	def test_frozen_step_changes_and_completed_request_is_ignored(self):
		first = self.process_on("2026-10-12")
		self.fixture.decide(self.request.name, "manager")
		second_key = self.set_waiting_start()
		second = self.process_on("2026-10-12")
		self.assertEqual(second["step"], second_key)
		self.assertNotEqual(first["step"], second["step"])
		self.assertTrue(set(first["outbox"]).isdisjoint(second["outbox"]))
		self.fixture.decide(self.request.name, "hr")
		self.assertEqual(self.process_on("2026-10-15")["status"], "Inactive")

	def test_notification_insert_failure_can_rollback_every_recipient(self):
		before = frappe.db.count("Kandil Notification Outbox", {"reference_name": self.request.name})
		frappe.db.savepoint("before_sla_enqueue")
		calls = []

		def fail_second(*args, **kwargs):
			if calls:
				raise RuntimeError("Synthetic enqueue failure")
			calls.append(True)
			return outbox.enqueue(*args, **kwargs)

		with patch.object(sla, "enqueue", side_effect=fail_second):
			with self.assertRaises(RuntimeError):
				self.process_on("2026-10-14")
		frappe.db.rollback(save_point="before_sla_enqueue")
		self.assertEqual(
			frappe.db.count("Kandil Notification Outbox", {"reference_name": self.request.name}), before
		)
		self.assertEqual(len(self.process_on("2026-10-14")["outbox"]), 2)

	def test_revoked_recipient_scope_is_suppressed_at_delivery(self):
		result = self.process_on("2026-10-12")
		grant = frappe.get_doc("Kandil Access Grant", self.fixture.grants["manager"])
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		self.assertEqual(outbox.deliver(result["outbox"][0]), "Suppressed")
		self.assertFalse(
			frappe.db.get_value("Kandil Notification Outbox", result["outbox"][0], "notification_log")
		)

	def test_internal_scheduler_guard_rejects_business_user_and_http(self):
		frappe.set_user(self.fixture.users["hr"])
		with self.assertRaises(frappe.PermissionError):
			sla.process_pending()
		frappe.set_user("Administrator")
		with patch.object(frappe.local, "request", object(), create=True):
			with self.assertRaises(frappe.PermissionError):
				sla.process_request(self.request.name)

	def test_scheduler_continues_after_bad_calendar_and_records_local_error(self):
		# Mock only scheduler transaction boundaries: the enclosing native fixture
		# must still roll back. Individual business transactions are tested above.
		get_all = frappe.get_all

		def pending_only(doctype, *args, **kwargs):
			return (
				["SYNTHETIC-BAD", "SYNTHETIC-GOOD"]
				if doctype == "Kandil Hiring Request"
				else get_all(doctype, *args, **kwargs)
			)

		with (
			patch.object(frappe, "get_all", side_effect=pending_only),
			patch.object(
				sla,
				"process_request",
				side_effect=[ValueError("Synthetic calendar error"), {"status": "Not due"}],
			),
			patch.object(frappe.db, "commit") as commit,
			patch.object(frappe.db, "rollback") as rollback,
		):
			self.assertEqual(sla.process_pending(), {"processed": 1, "failed": 1, "disabled": False})
			self.assertEqual(commit.call_count, 2)
			rollback.assert_called_once()
		self.assertTrue(
			frappe.db.exists(
				"Error Log",
				{"method": "Approval SLA request failed", "error": ["like", "SYNTHETIC-BAD: ValueError;%"]},
			)
		)

	def test_parity_opt_out_performs_no_sla_processing(self):
		with patch.dict(frappe.conf, {"kandil_parity_enabled": 0}):
			self.assertEqual(sla.process_pending(), {"processed": 0, "failed": 0, "disabled": True})
			self.assertEqual(sla.process_request(self.request.name)["status"], "Disabled")


def run():
	"""Explicit native suite entry point for the serial checkpoint runner."""
	import json
	import sys

	suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestApprovalSLA)
	cases = [test.id() for test in suite]
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2).run(suite)
	summary = dict(
		suite="recruitment-sla",
		tests_run=result.testsRun,
		failures=len(result.failures),
		errors=len(result.errors),
		skipped=len(result.skipped),
		successful=result.wasSuccessful() and not result.skipped and result.testsRun == len(cases) > 0,
		fixtures_rolled_back=True,
		cases=cases,
	)
	if not summary["successful"]:
		print(json.dumps(summary))
		raise AssertionError("SLA suite failed or skipped")
	return summary
