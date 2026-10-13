"""Explicit ownership regression cases; shared fixture tests are not rediscovered."""

import json
import unittest
import uuid

import frappe

from kandil_hr.recruitment import ownership, vacancies
from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as


class TestOwnership(TestRecruitmentCommands):
	def fixture(self):
		name, opening, _ = self.vacancy_fixture()
		self.call(
			"hr",
			vacancies.assign_team,
			name,
			opening_name=opening,
			lead=self.users["hr"],
			members=[self.users["manager"]],
			reason="Synthetic ownership team",
		)
		self.call(
			"hr",
			vacancies.set_state,
			name,
			opening_name=opening,
			action="Open",
			reason="Open synthetic recruitment",
		)
		with acting_as(self.users["manager"]):
			app = frappe.get_doc(
				dict(
					doctype="Job Applicant",
					applicant_name=self.prefix,
					phone_number="01012345678",
					job_title=opening,
				)
			).insert()
		return name, opening, app

	def app_call(self, key, method, name, app, **values):
		values.setdefault("command_id", uuid.uuid4().hex)
		values.setdefault("expected_version", str(self.load(name).modified))
		values.setdefault("application_version", str(frappe.get_doc("Job Applicant", app.name).modified))
		values.setdefault("reason", "Synthetic explicit application handoff")
		with acting_as(self.users[key]):
			return method(app.name, **values)

	def test_owner_default_and_native_forgery_denied(self):
		_name, _opening, app = self.fixture()
		self.assertEqual(app.custom_kandil_responsible_user, self.users["manager"])
		self.assertEqual(len(json.loads(app.custom_kandil_ownership_history)), 1)
		with acting_as(self.users["manager"]):
			hints = ownership.actions(app.name)
		self.assertTrue(hints["can_manage"])
		self.assertEqual({x["user"] for x in hints["owners"]}, {self.users["manager"], self.users["hr"]})
		frappe.db.set_value("Kandil Access Grant", self.grants["manager"], "can_manage_recruitment", 0)
		with acting_as(self.users["hr"]):
			self.assertEqual([x["user"] for x in ownership.actions(app.name)["owners"]], [self.users["hr"]])
		frappe.db.set_value("Kandil Access Grant", self.grants["manager"], "can_manage_recruitment", 1)
		with self.rejected(frappe.PermissionError), acting_as(self.users["manager"]):
			app.custom_kandil_responsible_user = self.users["hr"]
			app.save()
		self.assertEqual(
			frappe.db.get_value("Job Applicant", app.name, "custom_kandil_responsible_user"),
			self.users["manager"],
		)

	def test_owner_handoff_replay_and_nonmember_denial(self):
		name, _opening, app = self.fixture()
		args = dict(
			owner=self.users["hr"],
			command_id=uuid.uuid4().hex,
			expected_version=str(self.load(name).modified),
			application_version=str(app.modified),
		)
		first = self.app_call("manager", ownership.assign_application, name, app, **args)
		self.assertEqual(first, self.app_call("manager", ownership.assign_application, name, app, **args))
		self.assertEqual(
			len(
				json.loads(frappe.db.get_value("Job Applicant", app.name, "custom_kandil_ownership_history"))
			),
			2,
		)
		with self.rejected(frappe.PermissionError):
			self.app_call("hr", ownership.assign_application, name, app, owner=self.users["requester"])

	def test_assignment_messages_are_bilingual_minimal_and_delivered_once(self):
		from kandil_hr.foundation import outbox
		name, opening, app = self.fixture()
		args = dict(owner=self.users['hr'], command_id=uuid.uuid4().hex,
			expected_version=str(self.load(name).modified), application_version=str(app.modified),
			reason='PRIVATE_REASON handoff')
		self.app_call('manager', ownership.assign_application, name, app, **args)
		rows = frappe.get_all('Kandil Notification Outbox', filters={
			'reference_doctype': 'Job Opening', 'reference_name': opening,
			'recipient': self.users['hr'],
		}, fields=['name', 'subject', 'body'])
		self.assertTrue(any(r.subject.startswith('Vacancy assigned /') for r in rows))
		self.assertTrue(any(r.subject.startswith('Application assignment updated /') for r in rows))
		for row in rows:
			self.assertRegex(row.subject, r'[\u0600-\u06ff]')
			self.assertRegex(row.body, r'[\u0600-\u06ff]')
			self.assertNotIn('PRIVATE_REASON', row.body)
			self.assertNotIn(app.phone_number, row.body)
			self.assertNotIn(app.name, row.body)
			self.assertEqual(outbox.deliver(row.name), 'Delivered locally')
			receipt = frappe.db.get_value('Kandil Notification Outbox', row.name, 'notification_log')
			self.assertEqual(outbox.deliver(row.name), 'Delivered locally')
			self.assertEqual(frappe.db.get_value('Kandil Notification Outbox', row.name, 'notification_log'), receipt)
		count = frappe.db.count('Kandil Notification Outbox', {'reference_name': opening})
		self.app_call('manager', ownership.assign_application, name, app, **args)
		self.assertEqual(frappe.db.count('Kandil Notification Outbox', {'reference_name': opening}), count)

	def test_readonly_scope_denies_owner_command(self):
		name, _opening, app = self.fixture()
		frappe.db.set_value("Kandil Access Grant", self.grants["manager"], "can_manage_recruitment", 0)
		with self.rejected(frappe.PermissionError):
			self.app_call("manager", ownership.assign_application, name, app, owner=self.users["hr"])

	def test_next_action_team_replacement_preserves_history(self):
		name, opening, app = self.fixture()
		self.app_call(
			"manager",
			ownership.set_next_action,
			name,
			app,
			task="Call candidate",
			due="2027-01-01",
			owner=self.users["manager"],
		)
		result = self.call(
			"hr",
			vacancies.assign_team,
			name,
			opening_name=opening,
			lead=self.users["hr"],
			members=[],
			reason="Explicit team replacement",
		)
		app.reload()
		self.assertEqual(app.custom_kandil_responsible_user, self.users["hr"])
		self.assertEqual(app.custom_kandil_next_action_owner, self.users["hr"])
		self.assertEqual(result["application_handoffs"][0]["name"], app.name)
		self.assertEqual(len(json.loads(app.custom_kandil_ownership_history)), 3)
		self.app_call("hr", ownership.set_next_action, name, app, task="", due="2027-01-01", owner="")
		app.reload()
		self.assertFalse(app.custom_kandil_next_action_owner)
		self.assertFalse(app.custom_kandil_next_action_due)

	def test_disable_cleanup_explicit_unassigned_and_idempotent(self):
		name, _opening, app = self.fixture()
		self.app_call(
			"manager",
			ownership.set_next_action,
			name,
			app,
			task="Call candidate",
			due="",
			owner=self.users["manager"],
		)
		frappe.db.set_value("User", self.users["manager"], "enabled", 0)
		counts = ownership.handoff_disabled_user(self.users["manager"], actor=self.users["hr"])
		self.assertEqual(counts, dict(openings=1, applications=1))
		app.reload()
		self.assertFalse(app.custom_kandil_responsible_user)
		self.assertFalse(app.custom_kandil_next_action_owner)
		self.assertEqual(json.loads(app.custom_kandil_ownership_history)[-1]["actor"], self.users["hr"])
		self.assertEqual(
			ownership.handoff_disabled_user(self.users["manager"]), dict(openings=0, applications=0)
		)
		with acting_as(self.users["hr"]):
			queue = ownership.application_queue(unassigned=1)
			row = next(row for row in queue if row["name"] == app.name)
			self.assertEqual(row["assignment_state"], "Unassigned")
			self.assertTrue(row["assignment_warning"])

	def test_disabled_lead_cleared_with_initiator_audit_and_no_guess(self):
		name, opening, app = self.fixture()
		frappe.db.set_value("User", self.users["hr"], "enabled", 0)
		ownership.handoff_disabled_user(self.users["hr"], actor=self.users["sector"])
		doc = frappe.get_doc("Job Opening", opening)
		self.assertFalse(doc.custom_kandil_lead)
		self.assertNotIn(self.users["hr"], [row.user for row in doc.custom_kandil_team])
		note = json.loads(self.load(name).decision_note)
		self.assertEqual(note["initiated_by"], self.users["sector"])
		app.reload()
		self.assertEqual(app.custom_kandil_responsible_user, self.users["manager"])

	def test_rolled_back_disable_does_not_clean_ownership(self):
		_name, _opening, app = self.fixture()
		point = "disable_probe"
		frappe.db.savepoint(point)
		frappe.db.set_value("User", self.users["manager"], "enabled", 0)
		frappe.db.rollback(save_point=point)
		self.assertEqual(
			ownership.handoff_disabled_user(self.users["manager"]), dict(openings=0, applications=0)
		)
		app.reload()
		self.assertEqual(app.custom_kandil_responsible_user, self.users["manager"])

	def test_queue_excludes_unapproved_parent_and_nonteam_candidate(self):
		name, opening, app = self.fixture()
		with acting_as(self.users["hr"]):
			self.assertIn(app.name, [row["name"] for row in ownership.application_queue()])
		with self.rejected(frappe.PermissionError), acting_as(self.users["requester"]):
			ownership.application_queue()
		frappe.db.set_value("Kandil Hiring Request", name, "status", "Pending")
		with acting_as(self.users["hr"]):
			self.assertNotIn(opening, [row["name"] for row in vacancies.queue()])
			self.assertNotIn(app.name, [row["name"] for row in ownership.application_queue()])

	def test_bulk_mixed_scope_is_atomic_and_success_itemized(self):
		name, opening, app = self.fixture()
		other, other_opening, _ = self.vacancy_fixture()
		department = self.insert(
			"Department", department_name=self.prefix + "-restricted", company=self.company
		).name
		frappe.db.set_value("Kandil Hiring Request", other, "department", department)
		items = [
			dict(name=n, opening_name=o, expected_version=str(self.load(n).modified))
			for n, o in ((name, opening), (other, other_opening))
		]
		before = self.counts(name)
		with self.rejected(frappe.PermissionError), acting_as(self.users["hr"]):
			vacancies.bulk_assign(
				items=items,
				lead=self.users["hr"],
				members=[],
				reason="Mixed scope must deny",
				command_id=uuid.uuid4().hex,
			)
		self.assertEqual(self.counts(name), before)
		self.assertEqual(
			frappe.db.get_value("Job Applicant", app.name, "custom_kandil_responsible_user"),
			self.users["manager"],
		)
		with acting_as(self.users["hr"]):
			result = vacancies.bulk_assign(
				items=items[:1],
				lead=self.users["hr"],
				members=[],
				reason="Authorized itemized handoff",
				command_id=uuid.uuid4().hex,
			)
		self.assertEqual(result[0]["application_handoffs"][0]["applications"][0]["name"], app.name)

	def test_queue_allowed_states_and_terminal_history_preserved(self):
		_name, opening, app = self.fixture()
		for state in (
			"Approved",
			"Open",
			"Partially Filled",
			"On Hold",
			"Frozen",
			"Filled",
			"Closed",
			"Cancelled",
		):
			frappe.db.set_value("Job Opening", opening, "custom_kandil_vacancy_state", state)
			with acting_as(self.users["hr"]):
				vacancy_ids = {row["name"] for row in vacancies.queue()}
				application_ids = {row["name"] for row in ownership.application_queue()}
			self.assertEqual(opening in vacancy_ids, state in ownership.ACTIVE, state)
			self.assertEqual(app.name in application_ids, state in ownership.ACTIVE, state)
		frappe.db.set_value("Job Opening", opening, "custom_kandil_vacancy_state", "Open")
		with acting_as(self.users["hr"]):
			app.reload()
			app.status = "Rejected"
			app.save()
		before = app.custom_kandil_ownership_history
		frappe.db.set_value("User", self.users["manager"], "enabled", 0)
		self.assertEqual(ownership.handoff_disabled_user(self.users["manager"])["applications"], 0)
		app.reload()
		self.assertEqual(app.custom_kandil_responsible_user, self.users["manager"])
		self.assertEqual(app.custom_kandil_ownership_history, before)


def run():
	if not frappe.conf.get("allow_tests") or "parity" not in str(frappe.local.site):
		raise RuntimeError("Requires synthetic parity test site")
	names = sorted(name for name in TestOwnership.__dict__ if name.startswith("test_"))
	assert len(names) == 11
	result = unittest.TextTestRunner(verbosity=2).run(
		unittest.TestSuite(TestOwnership(name) for name in names)
	)
	value = dict(
		discovered=len(names),
		executed=result.testsRun,
		failures=len(result.failures),
		errors=len(result.errors),
		skipped=len(result.skipped),
	)
	if not result.wasSuccessful() or result.skipped:
		raise RuntimeError(str(value))
	return value
