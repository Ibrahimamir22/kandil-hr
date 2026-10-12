"""Disabled-account audit exactness, privacy and rollback; native synthetic only."""

import hashlib
import json
import unittest
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

import frappe
from frappe import client

from kandil_hr.recruitment import ownership
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.test_ownership import TestOwnership


class TestHandoffAudit(unittest.TestCase):
	def setUp(self):
		self.f = TestOwnership()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()
		self.request, self.opening, self.app = self.f.fixture()
		self.secret_task = "Synthetic private candidate task " + self.f.prefix
		self.f.app_call(
			"manager",
			ownership.set_next_action,
			self.request,
			self.app,
			task=self.secret_task,
			due="2027-01-01",
			owner=self.f.users["manager"],
		)
		self.app.reload()
		self.before_app = json.loads(frappe.as_json(ownership.values(self.app)))
		frappe.db.set_value("User", self.f.users["manager"], "enabled", 0)
		self.before = self.snapshot()

	def snapshot(self):
		return {
			"security_events": frappe.get_all(
				"Kandil Security Event",
				filters={
					"action": ["in", ["Recruitment ownership cleanup", "Recruitment application cleanup"]],
					"target_user": self.f.users["manager"],
				},
				pluck="name",
				order_by="name",
			),
			"request": frappe.as_json(self.f.load(self.request).as_dict()),
			"opening": frappe.as_json(frappe.get_doc("Job Opening", self.opening).as_dict()),
			"app": frappe.as_json(frappe.get_doc("Job Applicant", self.app.name).as_dict()),
			"capacity": [
				frappe.as_json(frappe.get_doc("Kandil Capacity", name).as_dict())
				for name in self.f.capacities
			],
			"events": frappe.get_all(
				"Kandil Recruitment Event", filters={"request": self.request}, pluck="name", order_by="name"
			),
			"revisions": frappe.get_all(
				"Kandil Request Revision", filters={"request": self.request}, pluck="name", order_by="name"
			),
			"outboxes": frappe.get_all(
				"Kandil Notification Outbox",
				filters={"reference_name": self.request},
				pluck="name",
				order_by="name",
			),
		}

	def cleanup(self, actor=None):
		if actor is None:
			result = ownership.handoff_disabled_user(self.f.users["manager"])
		else:
			result = ownership.handoff_disabled_user(self.f.users["manager"], actor=actor)
		self.assertEqual(result, {"openings": 1, "applications": 1})
		self.app.reload()
		return json.loads(self.f.load(self.request).decision_note), json.loads(
			self.app.custom_kandil_ownership_history
		)[-1]

	def test_actor_principal_exact_invocation_opening_and_private_application_states(self):
		account_version = str(frappe.db.get_value("User", self.f.users["manager"], "modified"))
		opening_version = str(frappe.db.get_value("Job Opening", self.opening, "modified"))
		note, history = self.cleanup(self.f.users["hr"])
		invocation = note["invocation"]
		self.assertEqual(invocation, history["invocation"])
		private = frappe.get_doc(
			"Kandil Security Event",
			{"reference": invocation["invocation_id"], "action": "Recruitment ownership cleanup"},
		)
		payload = json.loads(private.changed_fields)
		self.assertEqual(payload["invocation"], invocation)
		self.assertEqual(payload["before"], note["before"])
		self.assertEqual(payload["after"], note["after"])
		self.assertEqual(payload["application_count"], 1)
		self.assertNotIn("applications", payload)
		application = self.application_event(invocation["invocation_id"], self.app.name)
		self.assertEqual(
			json.loads(application.changed_fields)["application"],
			{"name": self.app.name, "before": history["before"], "after": history["after"]},
		)
		self.assertTrue(private.creation)
		self.assertEqual(invocation["actor"], self.f.users["hr"])
		self.assertEqual(invocation["principal"], self.f.users["hr"])
		self.assertEqual(invocation["executor"], "Administrator")
		self.assertEqual(invocation["command"], "kandil_hr.recruitment.ownership.handoff_disabled_user")
		self.assertEqual(invocation["origin"], "system_invocation")
		self.assertEqual(
			invocation["payload"],
			{"user": self.f.users["manager"], "actor": self.f.users["hr"], "reason": note["reason"]},
		)
		self.assertEqual(
			invocation["invocation_id"],
			hashlib.sha256(
				frappe.as_json(
					[self.f.users["manager"], account_version, self.opening, opening_version]
				).encode()
			).hexdigest(),
		)
		stamp = datetime.fromisoformat(invocation["at"])
		self.assertEqual(stamp.utcoffset(), stamp.astimezone(ZoneInfo("Africa/Cairo")).utcoffset())
		self.assertIn(self.f.users["manager"], {row["user"] for row in note["before"]["custom_kandil_team"]})
		self.assertNotIn(
			self.f.users["manager"], {row["user"] for row in note["after"]["custom_kandil_team"]}
		)
		self.assertEqual(history["before"], self.before_app)
		self.assertFalse(history["after"]["custom_kandil_responsible_user"])
		self.assertFalse(history["after"]["custom_kandil_next_action_owner"])
		self.assertEqual(history["after"]["custom_kandil_next_action"], self.secret_task)
		self.assertNotIn(self.secret_task, frappe.as_json(note))
		with acting_as(self.f.users["requester"]):
			self.assertNotIn(
				self.secret_task, frappe.as_json(client.get("Kandil Hiring Request", self.request))
			)
		self.assertEqual(self.before["capacity"], self.snapshot()["capacity"])
		after = self.snapshot()
		self.assertEqual(
			ownership.handoff_disabled_user(self.f.users["manager"], actor=self.f.users["hr"]),
			{"openings": 0, "applications": 0},
		)
		self.assertEqual(after, self.snapshot())

	def test_unknown_scheduler_is_not_relabelled_as_known_human(self):
		note, history = self.cleanup()
		unknown = "Internal scheduler (original actor unavailable)"
		self.assertEqual(note["invocation"]["actor"], unknown)
		self.assertEqual(note["invocation"]["principal"], unknown)
		self.assertEqual(history["actor"], unknown)
		self.assertEqual(history["invocation"]["executor"], "Administrator")

	def test_native_history_and_request_event_tampering_denied(self):
		self.cleanup(self.f.users["hr"])
		after = self.snapshot()
		payload = self.app.as_dict()
		payload["custom_kandil_ownership_history"] = "[]"
		with acting_as(self.f.users["hr"]), self.assertRaises(frappe.PermissionError):
			client.save(frappe.as_json(payload))
		with acting_as(self.f.users["hr"]), self.assertRaises(frappe.PermissionError):
			client.delete("Job Applicant", self.app.name)
		new_event = next(name for name in after["events"] if name not in self.before["events"])
		event = frappe.get_doc("Kandil Recruitment Event", new_event)
		data = event.as_dict()
		data["note"] = "Forged cleanup"
		with self.assertRaises(frappe.PermissionError):
			client.save(frappe.as_json(data))
		with self.assertRaises(frappe.PermissionError):
			client.delete(event.doctype, event.name)
		for private_name in after["security_events"]:
			private = frappe.get_doc("Kandil Security Event", private_name)
			for actor in ("hr", "requester"):
				with acting_as(self.f.users[actor]):
					with self.assertRaises(frappe.PermissionError):
						client.get(private.doctype, private.name)
					with self.assertRaises(frappe.PermissionError):
						client.get_list(private.doctype, filters={"name": private.name})
			private.changed_fields = "Forged private handoff"
			with self.assertRaises(frappe.PermissionError):
				client.save(private.as_json())
			with self.assertRaisesRegex(frappe.ValidationError, "Security events cannot be deleted"):
				client.delete(private.doctype, private.name)
		self.assertEqual(after, self.snapshot())

	def application_event(self, invocation_id, application):
		key = hashlib.sha256((invocation_id + "\0" + application).encode()).hexdigest()
		return frappe.get_doc(
			"Kandil Security Event", {"reference": key, "action": "Recruitment application cleanup"}
		)

	def test_private_audit_survives_native_applicant_deletion(self):
		note, _history = self.cleanup(self.f.users["hr"])
		private = self.application_event(note["invocation"]["invocation_id"], self.app.name)
		original = private.changed_fields
		client.delete("Job Applicant", self.app.name)
		self.assertFalse(frappe.db.exists("Job Applicant", self.app.name))
		self.assertEqual(frappe.get_doc("Kandil Security Event", private.name).changed_fields, original)
		self.assertEqual(json.loads(original)["application"]["name"], self.app.name)

	def test_audit_failure_restores_all_effects_and_preserves_outer_callbacks(self):
		def outer():
			return None

		frappe.db.after_commit.add(outer)
		before_callbacks = len(frappe.db.after_commit)

		from kandil_hr.foundation.models import record_security_event

		def fail(action, *args, **kwargs):
			if action == "Recruitment application cleanup":
				frappe.db.after_commit.add(lambda: None)
				raise RuntimeError("Synthetic handoff audit failure")
			return record_security_event(action, *args, **kwargs)

		with patch("kandil_hr.foundation.models.record_security_event", side_effect=fail):
			with self.assertRaisesRegex(RuntimeError, "Synthetic handoff audit failure"):
				ownership.handoff_disabled_user(self.f.users["manager"], actor=self.f.users["hr"])
		# No test-level SQL rollback before these assertions: helper must restore itself.
		self.assertEqual(self.before, self.snapshot())
		self.assertEqual(len(frappe.db.after_commit), before_callbacks)
		self.cleanup(self.f.users["hr"])

	def test_arabic_aggregate_over_text_limit_keeps_complete_per_application_audit(self):
		# The account was disabled in setUp. Re-enable only this synthetic user
		# to create legitimate applications/tasks, then disable it for the proof.
		frappe.db.set_value("User", self.f.users["manager"], "enabled", 1)
		apps = [self.app]
		for index in range(19):
			with acting_as(self.f.users["manager"]):
				apps.append(
					frappe.get_doc(
						dict(
							doctype="Job Applicant",
							applicant_name=self.f.prefix + str(index),
							phone_number=f"0101400{index:04}",
							job_title=self.opening,
						)
					).insert()
				)
		task = ("متابعة خاصة لمرشح قنديل " * 40).strip()
		self.assertLessEqual(len(task), 1000)
		before = {}
		for app in apps:
			self.f.app_call(
				"manager",
				ownership.set_next_action,
				self.request,
				app,
				task=task,
				due="2027-01-01",
				owner=self.f.users["manager"],
			)
			app.reload()
			before[app.name] = json.loads(frappe.as_json(ownership.values(app)))
		frappe.db.set_value("User", self.f.users["manager"], "enabled", 0)
		result = ownership.handoff_disabled_user(self.f.users["manager"], actor=self.f.users["hr"])
		self.assertEqual(result, {"openings": 1, "applications": len(apps)})
		invocation_id = json.loads(self.f.load(self.request).decision_note)["invocation"]["invocation_id"]
		aggregate = []
		for app in apps:
			event = self.application_event(invocation_id, app.name)
			self.assertLess(len(event.changed_fields.encode("utf-8")), 65535)
			change = json.loads(event.changed_fields)["application"]
			self.assertEqual(change["before"], before[app.name])
			self.assertEqual(change["after"]["custom_kandil_next_action"], task)
			self.assertFalse(change["after"]["custom_kandil_next_action_owner"])
			self.assertFalse(change["after"]["custom_kandil_responsible_user"])
			aggregate.append(change)
		self.assertGreater(len(frappe.as_json({"applications": aggregate}).encode("utf-8")), 65535)
		opening_event = frappe.get_doc(
			"Kandil Security Event", {"reference": invocation_id, "action": "Recruitment ownership cleanup"}
		)
		self.assertEqual(json.loads(opening_event.changed_fields)["application_count"], len(apps))
		self.assertNotIn(task, opening_event.changed_fields)
		self.assertNotIn(task, self.f.load(self.request).decision_note)
		audit_names = self.snapshot()["security_events"]
		self.assertEqual(len(audit_names), len(apps) + 1)
		self.assertEqual(
			ownership.handoff_disabled_user(self.f.users["manager"]), {"openings": 0, "applications": 0}
		)
		self.assertEqual(audit_names, self.snapshot()["security_events"])

	def test_near_text_limit_legacy_reason_preserves_oversized_private_audit(self):
		self.assertEqual(
			frappe.get_meta("Kandil Security Event").get_field("changed_fields").fieldtype, "Long Text"
		)
		# Explicit legacy-data fixture: older team commands did not cap reason
		# length. The source Small Text must itself fit TEXT; its complete audit
		# projection (identity, before/after, invocation) is legitimately larger.
		reason = "سبب" * 10800
		self.assertLess(len(reason.encode("utf-8")), 65535)
		frappe.db.set_value(
			"Job Applicant", self.app.name, "custom_kandil_ownership_reason", reason, update_modified=False
		)
		note, history = self.cleanup(self.f.users["hr"])
		private = self.application_event(note["invocation"]["invocation_id"], self.app.name)
		self.assertGreater(len(private.changed_fields.encode("utf-8")), 65535)
		payload = json.loads(private.changed_fields)
		self.assertEqual(payload["application"]["before"]["custom_kandil_ownership_reason"], reason)
		self.assertEqual(history["before"]["custom_kandil_ownership_reason"], reason)
		self.assertEqual(payload["application"]["after"], history["after"])
		self.assertNotIn(reason, self.f.load(self.request).decision_note)
		audit_names = self.snapshot()["security_events"]
		self.assertEqual(
			ownership.handoff_disabled_user(self.f.users["manager"]), {"openings": 0, "applications": 0}
		)
		self.assertEqual(audit_names, self.snapshot()["security_events"])


def run():
	from kandil_hr.foundation.concurrency_runner import _guard
	from kandil_hr.foundation.tests_runner import RecordedResult

	_guard()
	suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestHandoffAudit)
	assert suite.countTestCases() == 7
	result = unittest.TextTestRunner(verbosity=2, resultclass=RecordedResult).run(suite)
	summary = dict(
		result="PASS" if result.wasSuccessful() and not result.skipped else "FAIL",
		discovered=7,
		executed=result.testsRun,
		failures=len(result.failures),
		errors=len(result.errors),
		skips=len(result.skipped),
		tests=result.checks,
		limits="Native rollback-only proof, no external transport or HTTP authentication",
	)
	if not result.wasSuccessful() or result.skipped or result.testsRun != 7:
		error = AssertionError("Disabled-account audit checks failed")
		error.summary = summary
		raise error
	return summary
