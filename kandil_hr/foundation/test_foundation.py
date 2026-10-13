"""Database integration tests. Run only on an explicitly opted-in synthetic site.

Every test rolls back to its own savepoint and performs no external delivery.
These complement, rather than replace, the root HTTP/browser permission tests.
"""

import unittest
import uuid
from datetime import UTC, date, datetime, timezone
from unittest.mock import patch

import frappe
from frappe.utils import today

from kandil_hr.foundation import outbox, security


class TestFoundationDatabase(unittest.TestCase):
	def setUp(self):
		if (frappe.local.site != "kandil-parity.localhost" or getattr(frappe.local, "request", None)
				or not security.enabled() or not frappe.conf.get("allow_tests")):
			self.skipTest("Requires the opted-in synthetic parity CLI site")
		self.original_user = frappe.session.user
		frappe.set_user("Administrator")
		self.savepoint = "foundation_" + uuid.uuid4().hex
		frappe.db.savepoint(self.savepoint)
		self.addCleanup(self._restore)
		self.companies = frappe.get_all("Company", pluck="name", limit=2)
		if len(self.companies) < 2:
			self.skipTest("Seed two synthetic companies before foundation tests")
		self.user = "foundation-" + uuid.uuid4().hex[:12] + "@example.invalid"
		# Match the other CLI synthetic fixtures: do not consume the site's
		# signup throttle or enqueue deferred contacts for rolled-back users.
		original_enqueue = frappe.enqueue
		def enqueue(method, *args, **kwargs):
			if (method == "frappe.core.doctype.user.user.create_contact"
					and getattr(kwargs.get("user"), "name", None) == self.user):
				kwargs["now"] = True
			return original_enqueue(method, *args, **kwargs)
		self.enterContext(patch("frappe.enqueue", side_effect=enqueue))
		old_import = frappe.flags.get("in_import")
		try:
			frappe.flags.in_import = True
			frappe.get_doc(
				dict(
					doctype="User",
					email=self.user,
					first_name="Foundation Synthetic",
					enabled=1,
					send_welcome_email=0,
					user_type="System User",
					roles=[dict(role="Kandil Recruiter")],
				)
			).insert(ignore_permissions=True)
		finally:
			frappe.flags.in_import = old_import


	def _restore(self):
		if hasattr(self, "savepoint"):
			frappe.db.rollback(save_point=self.savepoint)
			frappe.set_user(self.original_user)

	def grant(self, **overrides):
		data = dict(
			doctype="Kandil Access Grant",
			user=self.user,
			company=self.companies[0],
			valid_from=today(),
			reason="Synthetic isolated foundation test",
			can_manage_recruitment=1,
		)
		data.update(overrides)
		return frappe.get_doc(data).insert(ignore_permissions=True)

	def test_scope_company_isolation_revocation_and_audit(self):
		grant = self.grant()
		self.assertTrue(security.has_scope(self.user, self.companies[0], capability="manage"))
		self.assertFalse(security.has_scope(self.user, self.companies[1], capability="read"))
		self.assertFalse(security.has_scope(self.user, self.companies[0], capability="sensitive"))
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		self.assertFalse(security.has_scope(self.user, self.companies[0]))
		self.assertTrue(
			frappe.db.exists(
				"Kandil Security Event", {"reference": grant.name, "action": "Access grant revoked"}
			)
		)
		grant.revoked = 0
		with self.assertRaises(frappe.ValidationError):
			grant.save(ignore_permissions=True)

	def test_outbox_replay_has_one_receipt_and_never_emails(self):
		key = uuid.uuid4().hex
		name = outbox.enqueue(
			key, self.user, "Synthetic local notification", "Synthetic message <script>private</script>"
		)
		self.assertEqual(
			name,
			outbox.enqueue(
				key, self.user, "Synthetic local notification", "Synthetic message <script>private</script>"
			),
		)
		with patch("frappe.desk.doctype.notification_log.notification_log.send_notification_email") as send:
			self.assertEqual(outbox.deliver(name), "Delivered locally")
			receipt = frappe.db.get_value("Kandil Notification Outbox", name, "notification_log")
			self.assertEqual(outbox.deliver(name), "Delivered locally")
			self.assertEqual(
				receipt, frappe.db.get_value("Kandil Notification Outbox", name, "notification_log")
			)
			send.assert_not_called()
		content = frappe.db.get_value("Notification Log", receipt, "email_content")
		self.assertIn("Synthetic message", content)
		self.assertNotIn("<script>", content)
		with self.assertRaises(frappe.ValidationError):
			outbox.enqueue(key, self.user, "Different content")

	def test_outbox_failure_rolls_back_receipt_for_safe_retry(self):
		name = outbox.enqueue(uuid.uuid4().hex, self.user, "Synthetic transactional failure")
		before = frappe.db.count("Notification Log", {"for_user": self.user})
		frappe.db.savepoint("before_foundation_delivery")
		from kandil_hr.foundation.models import KandilNotificationOutbox

		with patch.object(
			KandilNotificationOutbox, "save", side_effect=RuntimeError("Injected transaction failure")
		):
			with self.assertRaises(RuntimeError):
				outbox.deliver(name)
		frappe.db.rollback(save_point="before_foundation_delivery")
		self.assertEqual(frappe.db.count("Notification Log", {"for_user": self.user}), before)
		self.assertEqual(outbox.deliver(name), "Delivered locally")
		self.assertEqual(frappe.db.count("Notification Log", {"for_user": self.user}), before + 1)

	def test_disabled_recipient_is_suppressed(self):
		name = outbox.enqueue(uuid.uuid4().hex, self.user, "Disabled synthetic user")
		user = frappe.get_doc("User", self.user)
		user.enabled = 0
		user.save(ignore_permissions=True)
		self.assertEqual(outbox.deliver(name), "Suppressed")
		self.assertFalse(frappe.db.get_value("Kandil Notification Outbox", name, "notification_log"))

	def test_already_disabled_recipient_does_not_abort_business_transaction(self):
		user = frappe.get_doc("User", self.user)
		user.enabled = 0
		user.save(ignore_permissions=True)
		before = frappe.db.count("Notification Log", {"for_user": self.user})
		name = outbox.enqueue(uuid.uuid4().hex, self.user, "Request cancelled after requester departure")
		row = frappe.get_doc("Kandil Notification Outbox", name)
		self.assertEqual(row.status, "Suppressed")
		self.assertEqual(row.last_error, "Recipient disabled at enqueue")
		self.assertFalse(row.notification_log)
		self.assertEqual(outbox.deliver(name), "Suppressed")
		self.assertEqual(frappe.db.count("Notification Log", {"for_user": self.user}), before)

	def test_company_calendar_uses_configured_weekends_holidays_and_controlled_date(self):
		from kandil_hr.foundation.business_calendar import company_deadline, company_working_days
		from kandil_hr.foundation.clock import test_clock

		holiday = frappe.get_doc(
			dict(
				doctype="Holiday List",
				holiday_list_name="Foundation " + uuid.uuid4().hex,
				from_date="2026-01-01",
				to_date="2026-12-31",
				holidays=[dict(holiday_date="2026-10-11", description="Synthetic company holiday")],
			)
		).insert(ignore_permissions=True)
		calendar = frappe.get_doc(
			dict(
				doctype="Kandil Business Calendar",
				calendar_title="Synthetic calendar",
				company=self.companies[0],
				weekend_days="4,5",
				holiday_list=holiday.name,
				timezone="Africa/Cairo",
			)
		).insert(ignore_permissions=True)
		old_in_test = frappe.flags.get("in_test")
		frappe.flags.in_test = True
		try:
			with test_clock(datetime(2026, 10, 8, 10, tzinfo=UTC)):
				self.assertEqual(
					company_deadline(self.companies[0], None, 2, calendar.name), date(2026, 10, 13)
				)
			with test_clock(datetime(2026, 10, 12, 22, tzinfo=UTC)):
				self.assertEqual(
					company_working_days(self.companies[0], "2026-10-08", calendar_name=calendar.name), 2
				)
		finally:
			frappe.flags.in_test = old_in_test
		with self.assertRaises(frappe.ValidationError):
			company_deadline(self.companies[1], "2026-10-08", 2, calendar.name)
		with self.assertRaises(frappe.ValidationError):
			company_deadline(self.companies[0], "2026-12-31", 1, calendar.name)

	def test_company_calendar_rejects_ambiguous_default_selection(self):
		from kandil_hr.foundation.business_calendar import company_calendar

		for index in range(2):
			frappe.get_doc(
				dict(
					doctype="Kandil Business Calendar",
					calendar_title="Synthetic ambiguous " + str(index),
					company=self.companies[0],
					weekend_days="5,6",
					timezone="Africa/Cairo",
				)
			).insert(ignore_permissions=True)
		with self.assertRaises(frappe.ValidationError):
			company_calendar(self.companies[0])

	def test_business_user_cannot_change_access_grants(self):
		grant = self.grant()
		frappe.set_user(self.user)
		grant.revoked = 1
		with self.assertRaises(frappe.PermissionError):
			grant.save(ignore_permissions=True)

	def test_read_grant_cannot_manage_and_expiry_is_immediate(self):
		grant = self.grant(can_manage_recruitment=0)
		self.assertTrue(security.has_scope(self.user, self.companies[0]))
		with self.assertRaises(frappe.PermissionError):
			security.assert_scope(self.companies[0], user=self.user)
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		self.grant(valid_from="2000-01-01", valid_until="2000-01-02")
		self.assertFalse(security.has_scope(self.user, self.companies[0]))

	def make_capacity(self, company, branch):
		suffix = uuid.uuid4().hex[:10]
		department = frappe.get_doc(
			dict(doctype="Department", department_name="Foundation " + suffix, company=company)
		).insert(ignore_permissions=True)
		designation = frappe.get_doc(
			dict(doctype="Designation", designation_name="Foundation " + suffix)
		).insert(ignore_permissions=True)
		from kandil_hr.organization.api import transition

		with transition():
			position = frappe.get_doc(
				dict(
					doctype="Kandil Position",
					company=company,
					department=department.name,
					branch=branch,
					designation=designation.name,
					title="Foundation test position",
					structural=2,
					status="Active",
				)
			).insert(ignore_permissions=True)
		return frappe.get_doc(
			dict(
				doctype="Kandil Capacity",
				company=company,
				department=department.name,
				designation=designation.name,
				branch=branch,
				position=position.name,
				structural=2,
				occupied=0,
			)
		).insert(ignore_permissions=True)

	def test_native_list_detail_and_revocation_agree(self):
		branch = frappe.get_doc(dict(doctype="Branch", branch="Foundation " + uuid.uuid4().hex[:10])).insert(
			ignore_permissions=True
		)
		allowed = self.make_capacity(self.companies[0], branch.name)
		denied = self.make_capacity(self.companies[1], branch.name)
		grant = self.grant(can_manage_recruitment=0)
		frappe.set_user(self.user)
		allowed = frappe.get_doc("Kandil Capacity", allowed.name)
		denied = frappe.get_doc("Kandil Capacity", denied.name)
		visible = frappe.get_list(
			"Kandil Capacity", filters={"name": ["in", [allowed.name, denied.name]]}, pluck="name"
		)
		self.assertEqual(visible, [allowed.name])
		self.assertTrue(allowed.has_permission("read"))
		self.assertFalse(denied.has_permission("read"))
		self.assertFalse(allowed.has_permission("write"))
		frappe.set_user("Administrator")
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		frappe.set_user(self.user)
		self.assertFalse(allowed.has_permission("read"))
		self.assertEqual(frappe.get_list("Kandil Capacity", filters={"name": allowed.name}, pluck="name"), [])

	def test_revoked_reference_suppresses_local_notification(self):
		branch = frappe.get_doc(dict(doctype="Branch", branch="Foundation " + uuid.uuid4().hex[:10])).insert(
			ignore_permissions=True
		)
		capacity = self.make_capacity(self.companies[0], branch.name)
		grant = self.grant()
		name = outbox.enqueue(
			uuid.uuid4().hex,
			self.user,
			"Private scoped action",
			reference_doctype="Kandil Capacity",
			reference_name=capacity.name,
		)
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		self.assertEqual(outbox.deliver(name), "Suppressed")
		self.assertFalse(frappe.db.get_value("Kandil Notification Outbox", name, "notification_log"))

	def test_disabled_user_grant_can_still_be_revoked(self):
		grant = self.grant()
		user = frappe.get_doc("User", self.user)
		user.enabled = 0
		user.save(ignore_permissions=True)
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		self.assertTrue(frappe.db.get_value("Kandil Access Grant", grant.name, "revoked"))

	def test_privilege_escalation_is_blocked_even_if_native_permission_is_bypassed(self):
		user = frappe.get_doc("User", self.user)
		frappe.set_user(self.user)
		user.append("roles", {"role": "System Manager"})
		with self.assertRaises(frappe.PermissionError):
			user.save(ignore_permissions=True)

	def test_failed_outbox_requires_audited_operator_retry(self):
		name = outbox.enqueue(uuid.uuid4().hex, self.user, "Manual retry fixture")
		for attempt in range(1, 6):
			self.assertEqual(
				outbox._record_failure(name, "InjectedFailure"), "Failed" if attempt == 5 else "Retry"
			)
			self.assertEqual(frappe.db.get_value("Kandil Notification Outbox", name, "attempts"), attempt)
		self.assertEqual(outbox.deliver(name), "Failed")
		frappe.set_user(self.user)
		with self.assertRaises(frappe.PermissionError):
			outbox.retry_failed(name, "Synthetic retry")
		frappe.set_user("Administrator")
		self.assertEqual(outbox.retry_failed(name, "Synthetic recovery after diagnosis")["status"], "Pending")
		self.assertEqual(frappe.db.get_value("Kandil Notification Outbox", name, "manual_retries"), 1)
		self.assertTrue(
			frappe.db.exists(
				"Kandil Security Event", {"reference": name, "action": "Local notification retry requested"}
			)
		)
		self.assertEqual(outbox.deliver(name), "Delivered locally")

	def test_security_events_cannot_be_edited_or_forged_through_native_documents(self):
		grant = self.grant()
		event_name = frappe.db.get_value("Kandil Security Event", {"reference": grant.name}, "name")
		event = frappe.get_doc("Kandil Security Event", event_name)
		event.action = "Forged replacement"
		with self.assertRaises(frappe.PermissionError):
			event.save(ignore_permissions=True)
		with self.assertRaises(frappe.PermissionError):
			frappe.get_doc(
				dict(
					doctype="Kandil Security Event",
					action="Forged insert",
					actor="Administrator",
					target_user=self.user,
				)
			).insert(ignore_permissions=True)
