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
			sla, "company_calendar", side_effect=lambda company, **kwargs: company_calendar(company, self.calendar.name, **kwargs)
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
		with test_clock(datetime.fromisoformat(day + "T12:00:00").replace(tzinfo=ZoneInfo("Africa/Cairo"))), patch.object(outbox, "now_datetime", return_value=datetime.fromisoformat(day + "T12:00:00")):
			return sla.process_request(self.request.name)

	def deliver_on(self, name, day="2026-10-12"):
		with test_clock(datetime.fromisoformat(day + "T12:00:00").replace(tzinfo=ZoneInfo("Africa/Cairo"))), patch.object(outbox, "now_datetime", return_value=datetime.fromisoformat(day + "T12:00:00")):
			return outbox.deliver(name)

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

	def assert_suppressed(self, names):
		for name in names:
			self.assertEqual(self.deliver_on(name, "2026-10-20"), "Suppressed")
			self.assertFalse(frappe.db.get_value("Kandil Notification Outbox", name, "notification_log"))
			self.assertFalse(frappe.db.exists("Kandil Mail Capture", {"outbox": name}))

	def test_advanced_step_suppresses_queued_reminder_without_revoking_read_access(self):
		queued = self.process_on("2026-10-12")["outbox"]
		self.fixture.decide(self.request.name, "manager")
		request = self.fixture.load(self.request.name)
		self.assertTrue(frappe.has_permission(request.doctype, "read", doc=request, user=self.fixture.users["manager"]))
		self.assert_suppressed(queued)

	def test_completed_request_suppresses_all_queued_milestones(self):
		queued = self.process_on("2026-10-15")["outbox"]
		self.fixture.approve_all(self.request.name)
		self.assert_suppressed(queued)
		self.fixture.ledger((0, 0), (2, 1))

	def test_waiting_restart_and_revision_change_invalidate_notice(self):
		queued = self.process_on("2026-10-12")["outbox"]
		doc = self.fixture.load(self.request.name)
		step = next(row for row in doc.approval_steps if row.decision == "Pending")
		frappe.db.set_value("Kandil Approval Step", step.name, "waiting_since", "2026-10-09 12:00:00", update_modified=False)
		self.assert_suppressed(queued)
		self.set_waiting_start()
		queued = self.process_on("2026-10-14")["outbox"]
		frappe.db.set_value(doc.doctype, doc.name, "revision", doc.revision + 1, update_modified=False)
		self.assert_suppressed(queued)

	def test_current_step_delivers_once_and_history_survives_completion(self):
		name = self.process_on("2026-10-12")["outbox"][0]
		self.assertEqual(self.deliver_on(name), "Delivered locally")
		receipt = frappe.db.get_value("Kandil Notification Outbox", name, "notification_log")
		self.fixture.approve_all(self.request.name)
		self.assertEqual(self.deliver_on(name), "Delivered locally")
		self.assertEqual(frappe.db.get_value("Kandil Notification Outbox", name, "notification_log"), receipt)

	def test_unverifiable_legacy_reminder_suppressed_but_ordinary_update_retained(self):
		import uuid
		legacy = outbox.enqueue(uuid.uuid4().hex, self.fixture.users["manager"], "Approval reminder",
			"Old queued reminder", "Kandil Hiring Request", self.request.name)
		ordinary = outbox.enqueue(uuid.uuid4().hex, self.fixture.users["requester"], "Recruitment request updated",
			"Historical update", "Kandil Hiring Request", self.request.name)
		self.assert_suppressed([legacy])
		self.assertEqual(outbox.deliver(ordinary), "Delivered locally")
		fresh = self.process_on("2026-10-12")["outbox"][0]
		self.assertNotEqual(fresh, legacy)
		self.assertEqual(self.deliver_on(fresh), "Delivered locally")

	def test_context_is_hashed_and_malformed_delivery_fails_without_receipt(self):
		import json
		name = self.process_on("2026-10-12")["outbox"][0]
		row = frappe.get_doc("Kandil Notification Outbox", name)
		context = json.loads(row.delivery_context)
		self.assertEqual(context["step_key"], self.fixture.load(self.request.name).approval_steps[0].step_key)
		key = sla.notice_key(self.request.name, context, row.recipient)
		with self.fixture.rejected():
			outbox.enqueue(key, row.recipient, row.subject, row.body, row.reference_doctype, row.reference_name,
				delivery_context=context | {"stage": "warning"})
		frappe.db.set_value(row.doctype, row.name, "delivery_context", '{"kind":"unknown"}', update_modified=False)
		with self.assertRaises(ValueError):
			outbox.deliver(name)
		self.assertFalse(frappe.db.get_value(row.doctype, name, "notification_log"))

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


	def add_holiday(self, day):
		holiday = self.fixture.insert("Holiday List", holiday_list_name=self.fixture.prefix + " Deferred holiday",
			from_date="2026-01-01", to_date="2026-12-31",
			holidays=[dict(holiday_date=day, description="Private calendar description")])
		self.calendar.holiday_list = holiday.name
		self.calendar.save(ignore_permissions=True)

	def test_later_milestone_suppresses_old_reminder(self):
		name = self.process_on("2026-10-12")["outbox"][0]
		self.assertEqual(self.deliver_on(name, "2026-10-13"), "Suppressed")
		self.assertIn("later business-day", frappe.db.get_value("Kandil Notification Outbox", name, "last_error"))
		self.assertFalse(frappe.db.exists("Kandil Mail Capture", {"outbox": name}))
		for current in self.process_on("2026-10-13")["outbox"]:
			self.assertEqual(self.deliver_on(current, "2026-10-13"), "Delivered locally")

	def test_expiry_waits_through_weekend_without_attempts_or_effects(self):
		name = self.process_on("2026-10-15")["outbox"][0]
		for day in ("2026-10-16", "2026-10-17"):
			self.assertEqual(self.deliver_on(name, day), "Pending")
			row = frappe.get_doc("Kandil Notification Outbox", name)
			self.assertEqual(row.attempts, 0)
			self.assertFalse(row.notification_log)
			self.assertFalse(frappe.db.exists("Kandil Mail Capture", {"outbox": name}))
		self.assertEqual(self.deliver_on(name, "2026-10-18"), "Delivered locally")
		self.assertEqual(self.fixture.load(self.request.name).status, "Pending")
		self.fixture.ledger((2, 1), (0, 0))

	def test_holiday_correction_wakes_same_key_without_duplicate(self):
		name = self.process_on("2026-10-12")["outbox"][0]
		self.add_holiday("2026-10-12")
		self.assertEqual(self.deliver_on(name), "Pending")
		row = frappe.get_doc("Kandil Notification Outbox", name)
		self.assertEqual(row.attempts, 0)
		self.assertEqual(row.last_error, outbox.CALENDAR_DEFERRED)
		self.assertGreater(row.next_attempt, datetime(2026, 10, 12, 12))
		self.calendar.holiday_list = None
		self.calendar.save(ignore_permissions=True)
		self.assertEqual(self.process_on("2026-10-12")["outbox"], [name])
		self.assertEqual(self.deliver_on(name), "Delivered locally")
		self.assertEqual(frappe.db.count("Kandil Mail Capture", {"outbox": name}), 1)

	def test_calendar_recheck_does_not_erase_technical_failure_backoff(self):
		name = self.process_on("2026-10-12")["outbox"][0]
		with patch.object(outbox, "now_datetime", return_value=datetime(2026, 10, 12, 12)):
			outbox._record_failure(name, "SyntheticFailure")
		before = frappe.get_doc("Kandil Notification Outbox", name)
		self.process_on("2026-10-12")
		after = frappe.get_doc("Kandil Notification Outbox", name)
		self.assertEqual((after.status, after.attempts, after.next_attempt, after.last_error),
			(before.status, before.attempts, before.next_attempt, before.last_error))

	def test_calendar_error_fails_closed_but_revoked_recipient_is_suppressed(self):
		name = self.process_on("2026-10-12")["outbox"][0]
		with patch.object(sla, "company_calendar", side_effect=frappe.ValidationError("Private config")):
			with self.assertRaises(frappe.ValidationError):
				self.deliver_on(name)
			self.assertFalse(frappe.db.exists("Kandil Mail Capture", {"outbox": name}))
			grant = frappe.get_doc("Kandil Access Grant", self.fixture.grants["manager"])
			grant.revoked = 1
			grant.save(ignore_permissions=True)
			self.assertEqual(self.deliver_on(name), "Suppressed")

	def test_delivered_replay_does_not_depend_on_later_calendar(self):
		name = self.process_on("2026-10-12")["outbox"][0]
		self.assertEqual(self.deliver_on(name), "Delivered locally")
		with patch.object(sla, "company_calendar", side_effect=AssertionError("Must not read")):
			self.assertEqual(self.deliver_on(name, "2026-10-20"), "Delivered locally")

	def test_projection_excludes_holidays_and_private_configuration(self):
		import json
		self.add_holiday("2026-10-13")
		with test_clock(datetime(2026, 10, 12, 12, tzinfo=ZoneInfo("Africa/Cairo"))):
			result = sla.deadline_projection(self.fixture.load(self.request.name))
		self.assertEqual(result["state"], "active")
		self.assertEqual([m["date"] for m in result["milestones"]], ["2026-10-12", "2026-10-14", "2026-10-15", "2026-10-18"])
		self.assertEqual(result["current_stage"], "reminder")
		self.assertFalse(result["automatic_rejection"])
		self.assertNotIn(self.calendar.name, json.dumps(result))
		self.assertNotIn("Private calendar", json.dumps(result))

	def test_unavailable_projection_is_generic_and_completed_is_inactive(self):
		with patch.object(sla, "company_calendar", side_effect=frappe.ValidationError("Private config")):
			result = sla.deadline_projection(self.fixture.load(self.request.name))
			self.assertEqual(result["state"], "unavailable")
			self.assertNotIn("Private", str(result))
		self.fixture.approve_all(self.request.name)
		self.assertEqual(sla.deadline_projection(self.fixture.load(self.request.name))["state"], "inactive")

	def test_deferral_converts_cairo_midnight_to_site_timezone(self):
		name = self.process_on("2026-10-15")["outbox"][0]
		with test_clock(datetime(2026, 10, 16, 12, tzinfo=ZoneInfo("Africa/Cairo"))), patch.object(sla, "get_system_timezone", return_value="UTC"):
			plan = sla.timing_plan(self.fixture.load(self.request.name), frappe.get_doc("Kandil Notification Outbox", name))
		self.assertEqual(plan["defer_until"], datetime(2026, 10, 17, 21))


	def test_deadline_endpoint_authorized_read_has_no_business_side_effect(self):
		from kandil_hr.portal.approval_deadlines import get
		from kandil_hr.recruitment.test_commands import acting_as
		before = self.fixture.counts(self.request.name)
		with acting_as(self.fixture.users["requester"]):
			result = get(self.request.name)
		self.assertEqual(result["state"], "active")
		self.assertEqual(before, self.fixture.counts(self.request.name))
		self.assertEqual(set(result), {"state", "timezone", "as_of", "automatic_rejection", "policy_status",
			"waiting_from", "working_days", "weekends", "working_today", "current_stage", "milestones"})

	def test_deadline_endpoint_revoked_scope_denies_before_calendar_read(self):
		from kandil_hr.portal.approval_deadlines import get
		from kandil_hr.recruitment.test_commands import acting_as
		grant = frappe.get_doc("Kandil Access Grant", self.fixture.grants["requester"])
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		with acting_as(self.fixture.users["requester"]), patch.object(sla, "company_calendar", side_effect=AssertionError("Unauthorized calendar read")):
			with self.assertRaises(frappe.PermissionError):
				get(self.request.name)

	def test_deadline_endpoint_guest_denied(self):
		from kandil_hr.portal.approval_deadlines import get
		from kandil_hr.recruitment.test_commands import acting_as
		with acting_as("Guest"):
			with self.assertRaises(frappe.PermissionError):
				get(self.request.name)

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
