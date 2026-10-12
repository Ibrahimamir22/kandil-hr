"""Actual command integration proof, separate from helper/controller checks."""

import json
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.utils import today

from kandil_hr.foundation import command_audit
from kandil_hr.recruitment import api
from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as


class TestCommandAudit(unittest.TestCase):
	def fixture(self, case=TestRecruitmentCommands):
		fixture = case()
		self.addCleanup(fixture.doCleanups)
		fixture.setUp()
		return fixture

	def envelope(self, name, operation):
		rows = frappe.get_all(
			command_audit.DOCTYPE,
			filters={"target_name": name, "operation": operation},
			fields=["envelope_json"],
			order_by="creation desc",
		)
		self.assertTrue(rows)
		return json.loads(rows[0].envelope_json)

	def test_submit_decision_created_opening_exact_payload_and_replay(self):
		f = self.fixture()
		req = f.request((2,))
		f.submit(req.name)
		submitted = self.envelope(req.name, "submit")
		self.assertEqual((submitted["before"]["status"], submitted["after"]["status"]), ("Draft", "Pending"))
		self.assertEqual(submitted["related_before"][0]["reserved"], 0)
		self.assertEqual(submitted["related_after"][0]["reserved"], 2)
		step = f.load(req.name).approval_steps[0]
		args = dict(
			command_id=uuid.uuid4().hex,
			expected_version=str(f.load(req.name).modified),
			step_id=step.step_key,
			comment="Explicit manager review عربي <script>audit literal</script>",
		)
		first = f.decide(req.name, "manager", **args)
		value = self.envelope(req.name, "decide")
		self.assertEqual(value["payload"]["comment"], args["comment"])
		self.assertEqual(
			(value["actor"], value["principal"], value["step_key"]),
			(f.users["manager"], f.users["manager"], step.step_key),
		)
		self.assertEqual(value["before"]["approval_steps"][0]["decision"], "Pending")
		self.assertEqual(value["after"]["approval_steps"][0]["decision"], "Approved")
		counts = frappe.db.count(command_audit.DOCTYPE, {"target_name": req.name})
		self.assertEqual(
			json.loads(api.dump(first)), json.loads(api.dump(f.decide(req.name, "manager", **args)))
		)
		self.assertEqual(frappe.db.count(command_audit.DOCTYPE, {"target_name": req.name}), counts)
		f.decide(req.name, "hr")
		final = self.envelope(req.name, "decide")
		self.assertEqual(len([x for x in final["related_added_to_capture"] if x[0] == "Job Opening"]), 1)
		self.assertEqual(final["after"]["status"], "Approved")

	def test_actual_command_failure_rolls_back_effect_receipt_audit_and_retry(self):
		f = self.fixture()
		req = f.request((1,))
		before, counts = json.loads(api.dump(f.load(req.name).as_dict())), f.counts(req.name)
		with (
			f.rejected(RuntimeError),
			patch.object(
				command_audit, "record_command", side_effect=RuntimeError("Synthetic audit insertion failure")
			),
		):
			f.submit(req.name)
		self.assertEqual(json.loads(api.dump(f.load(req.name).as_dict())), before)
		self.assertEqual(f.counts(req.name), counts)
		self.assertEqual(frappe.db.count(command_audit.DOCTYPE, {"target_name": req.name}), 0)
		f.ledger((0, 0), (0, 0))
		f.submit(req.name)
		self.assertEqual(frappe.db.count(command_audit.DOCTYPE, {"target_name": req.name}), 1)

	def test_delegated_hr_review_preserves_principal_without_advancing_step(self):
		f = self.fixture()
		req = f.request((2,))
		f.submit(req.name)
		f.decide(req.name, "manager")
		f.insert(
			"Kandil Delegation",
			company=f.company,
			department=f.department,
			from_user=f.users["hr"],
			to_user=f.users["manager"],
			from_date=today(),
			to_date=today(),
			process_scope="APPROVALS",
			reason="Synthetic delegated HR review",
		)
		step = f.load(req.name).approval_steps[1]
		f.call(
			"manager",
			api.review,
			req.name,
			quantities={f.load(req.name).lines[0].name: 1},
			priority="Normal",
			reason="Reduce reviewed request",
		)
		value = self.envelope(req.name, "review")
		self.assertEqual(
			(value["actor"], value["principal"], value["step_key"], value["authority_mode"]),
			(f.users["manager"], f.users["hr"], step.step_key, "on_behalf"),
		)
		self.assertEqual(value["after"]["approval_steps"][1]["decision"], "Pending")

	def test_amendment_creation_captures_new_request_without_fabricated_before(self):
		f = self.fixture()
		name, _opening, _ = f.vacancy_fixture()
		result = f.call("requester", api.amend, name, reason="Add another seat for review")
		value = self.envelope(name, "amend")
		self.assertIn(["Kandil Hiring Request", result["name"]], value["related_added_to_capture"])
		self.assertFalse(any(x["name"] == result["name"] for x in value["related_before"]))
		self.assertEqual(
			next(x for x in value["related_after"] if x["name"] == result["name"])["amends"], name
		)

	def test_relocation_captures_both_released_and_added_capacity(self):
		from kandil_hr.recruitment.test_corrections import TestApprovedCorrections

		c = self.fixture(TestApprovedCorrections)
		old = c.f.load(c.name).lines[0]
		destination = c.destination()
		c.correct(relocations={old.name: destination})
		value = self.envelope(c.name, "hr_correction")
		before = {x["name"]: x for x in value["related_before"] if x["doctype"] == "Kandil Capacity"}
		after = {x["name"]: x for x in value["related_after"] if x["doctype"] == "Kandil Capacity"}
		self.assertEqual((before[old.capacity]["open_slots"], after[old.capacity]["open_slots"]), (2, 0))
		self.assertEqual((before[destination]["open_slots"], after[destination]["open_slots"]), (0, 2))
		self.assertEqual(after[old.capacity]["occupied"], before[old.capacity]["occupied"])
		self.assertNotIn(["Kandil Capacity", old.capacity], value["related_removed_from_capture"])

	def test_team_handoff_captures_applicant_owner_and_task(self):
		from kandil_hr.recruitment import ownership, vacancies
		from kandil_hr.recruitment.test_ownership import TestOwnership

		f = self.fixture(TestOwnership)
		name, opening, app = f.fixture()
		f.app_call(
			"manager",
			ownership.set_next_action,
			name,
			app,
			task="Call candidate",
			due=None,
			owner=f.users["manager"],
		)
		f.call(
			"hr",
			vacancies.assign_team,
			name,
			opening_name=opening,
			lead=f.users["hr"],
			members=[],
			reason="Replace assigned team",
		)
		value = self.envelope(name, "vacancy_team")
		before = next(x for x in value["related_before"] if x["name"] == app.name)
		after = next(x for x in value["related_after"] if x["name"] == app.name)
		self.assertEqual(before["custom_kandil_responsible_user"], f.users["manager"])
		self.assertEqual(after["custom_kandil_responsible_user"], f.users["hr"])
		self.assertEqual(after["custom_kandil_next_action_owner"], f.users["hr"])
		self.assertEqual(after["custom_kandil_next_action"], "Call candidate")

	def test_void_joining_captures_employee_offer_assignment_and_onboarding(self):
		from kandil_hr.recruitment.test_joining_corrections import TestJoiningCorrections

		j = self.fixture(TestJoiningCorrections)
		j.void()
		value = self.envelope(j.name, "void_joining")
		before = {(x["doctype"], x["name"]): x for x in value["related_before"]}
		after = {(x["doctype"], x["name"]): x for x in value["related_after"]}
		key = ("Employee", j.joined["employee"])
		self.assertEqual((before[key]["status"], after[key]["status"]), ("Active", "Inactive"))
		self.assertEqual(after[("Job Offer", j.offer)]["custom_kandil_joining_voided"], 1)
		self.assertEqual(after[("Kandil Position Assignment", j.joined["assignment"])]["is_voided"], 1)
		self.assertEqual(
			after[("Employee Onboarding", j.joined["onboarding"])]["custom_kandil_joining_voided"], 1
		)

	def test_fixture_rollback_removes_only_its_after_commit_callbacks(self):
		manager = frappe.db.after_commit
		original = len(manager)
		manager.add(lambda: None)
		try:
			f = self.fixture()
			self.assertGreater(len(manager), original + 1)
			f.doCleanups()
			self.assertEqual(len(manager), original + 1)
		finally:
			manager.truncate(original)


def run():
	if (
		frappe.local.site != "kandil-parity.localhost"
		or frappe.session.user != "Administrator"
		or not frappe.conf.get("allow_tests")
		or getattr(frappe.local, "request", None)
	):
		raise RuntimeError("Audit integration tests require isolated parity Administrator CLI")
	result = unittest.TextTestRunner(verbosity=2).run(
		unittest.defaultTestLoader.loadTestsFromTestCase(TestCommandAudit)
	)
	value = dict(
		total=result.testsRun,
		successful=result.wasSuccessful() and not result.skipped and result.testsRun == 8,
		failures=len(result.failures),
		errors=len(result.errors),
		skipped=len(result.skipped),
		classification="7 native command integration tests plus 1 fixture callback isolation test",
	)
	if not value["successful"]:
		raise AssertionError("Recruitment audit integration failed")
	return value
