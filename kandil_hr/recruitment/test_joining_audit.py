"""Original joining/outcome audit proof; synthetic, private and rollback-only."""

import hashlib
import json
import sys
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import frappe
from frappe.utils import add_days, today

from kandil_hr.foundation import command_audit
from kandil_hr.pilot import api as pilot
from kandil_hr.recruitment import joining, joining_audit
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.test_joining import TestJoining


class TestJoiningAudit(unittest.TestCase):
	def setUp(self):
		self.j = TestJoining()
		self.addCleanup(self.j.doCleanups)
		self.j.setUp()
		self.f = self.j.f

	def envelope(self, offer):
		matches = []
		for row in frappe.get_all(
			command_audit.DOCTYPE,
			filters={"target_name": self.j.name, "operation": "record_outcome"},
			fields=["name", "command_origin", "envelope_json"],
		):
			value = json.loads(row.envelope_json)
			if value["payload"]["offer_name"] == offer:
				matches.append((row, value))
		self.assertEqual(len(matches), 1)
		row, value = matches[0]
		self.assertEqual(row.command_origin, "server_invocation")
		self.assertEqual(value["command_origin"], "server_invocation")
		self.assertEqual(value["actor"], self.f.users["hr"])
		self.assertEqual(value["principal"], value["actor"])
		self.assertIsNone(value["step_key"])
		self.assertEqual(value["authority"], {})
		for item in value["related_before"] + value["related_after"]:
			if item.get("company"):
				self.assertEqual(item["company"], self.f.company)
		return row.name, value

	def find(self, value, side, doctype, name=None):
		return next(
			row for row in value[side] if row["doctype"] == doctype and (name is None or row["name"] == name)
		)

	def counts(self):
		return {
			dt: frappe.db.count(dt)
			for dt in (
				"Employee",
				"Kandil Position Assignment",
				"Employee Onboarding",
				"Kandil Recruitment Event",
				"Kandil Request Revision",
				"Kandil Notification Outbox",
				"Kandil Command Receipt",
				command_audit.DOCTYPE,
				"Project",
				"Task",
			)
		}

	def test_partial_and_final_joining_full_created_effects_exact_payload(self):
		offers = [self.j.offer(), self.j.offer(), self.j.offer(self.j.openings[1])]
		for index, offer in enumerate(offers):
			version = str(frappe.db.get_value("Job Offer", offer, "modified"))
			result = self.j.outcome(offer, reason="Documented joining عربي")
			_, value = self.envelope(offer)
			self.assertEqual(value["reviewed_version"], version)
			self.assertEqual(
				value["payload"],
				dict(
					offer_name=offer,
					outcome="Joined",
					reason="Documented joining عربي",
					joining_date=today(),
					date_of_birth="1995-01-01",
					gender="Male",
				),
			)
			self.assertEqual(value["result"], result)
			self.assertEqual(value["before"]["status"], "Approved")
			self.assertEqual(value["after"]["status"], "Closed" if index == 2 else "Approved")
			for doctype, key in (
				("Employee", "employee"),
				("Kandil Position Assignment", "assignment"),
				("Employee Onboarding", "onboarding"),
			):
				self.assertIn([doctype, result[key]], value["related_added_to_capture"])
				self.assertFalse(any(r["name"] == result[key] for r in value["related_before"]))
			employee = self.find(value, "related_after", "Employee")
			self.assertEqual(employee["date_of_birth"], "1995-01-01")
			self.assertEqual(employee["gender"], "Male")
			self.assertEqual(employee["custom_kandil_offer"], offer)
			self.assertEqual(employee, joining_audit.project(frappe.get_doc("Employee", result["employee"])))
			onboarding = self.find(value, "related_after", "Employee Onboarding")
			self.assertEqual(onboarding["docstatus"], 0)
			self.assertEqual(onboarding["activities"][0]["user"], self.f.users["hr"])
			self.assertFalse(onboarding["activities"][0]["task"])
			self.assertEqual(
				onboarding, joining_audit.project(frappe.get_doc("Employee Onboarding", result["onboarding"]))
			)
			old = self.find(value, "related_before", "Job Opening")
			new = self.find(value, "related_after", "Job Opening")
			self.assertEqual(old["custom_kandil_vacancy_state"], "Partially Filled" if index == 1 else "Open")
			self.assertEqual(
				new["custom_kandil_vacancy_state"], "Partially Filled" if index == 0 else "Filled"
			)
		self.f.ledger((0, 0), (0, 0), (2, 1))
		self.assertEqual({dt: frappe.db.count(dt) for dt in ("Project", "Task")}, self.j.task_counts)

	def test_no_show_and_withdrawn_record_reason_without_consuming_seat(self):
		for outcome in ("No Show", "Withdrawn"):
			offer = self.j.offer()
			result = self.j.outcome(offer, outcome, reason="Documented candidate outcome")
			_, value = self.envelope(offer)
			self.assertEqual(
				value["payload"],
				dict(
					offer_name=offer,
					outcome=outcome,
					reason="Documented candidate outcome",
					joining_date=None,
					date_of_birth=None,
					gender=None,
				),
			)
			self.assertIsNone(result["employee"])
			self.assertEqual(value["related_added_to_capture"], [])
			for kind in ("Kandil Capacity", "Job Opening"):
				old = [x for x in value["related_before"] if x["doctype"] == kind]
				new = [x for x in value["related_after"] if x["doctype"] == kind]
				self.assertEqual(old, new)
			self.assertEqual(
				self.find(value, "related_before", "Job Offer")["custom_kandil_outcome"], "Pending"
			)
			self.assertEqual(self.find(value, "related_after", "Job Offer")["custom_kandil_outcome"], outcome)
		self.f.ledger((0, 0), (2, 1))

	def test_replay_is_one_original_actor_audit_omitted_details_preserved(self):
		self.f.call(
			"hr",
			self.j.vacancies.assign_team,
			self.j.name,
			opening_name=self.j.opening,
			lead=self.f.users["hr"],
			members=[self.f.users["manager"]],
			reason="Authorize a second recruiter for replay proof",
		)
		offer = self.j.offer()
		result = self.j.outcome(offer)
		audit, value = self.envelope(offer)
		counts = self.counts()
		self.assertEqual(self.j.outcome(offer), result)
		# Existing contract allows another currently authorized recruiter to
		# retrieve the original result, including omitted optional replay data.
		with acting_as(self.f.users["manager"]):
			self.assertEqual(pilot.record_outcome(offer, "Joined"), result)
		for values in ({"reason": "changed"}, {"date_of_birth": "1994-01-01"}, {"gender": "Female"}):
			with self.f.rejected(), acting_as(self.f.users["hr"]):
				pilot.record_outcome(offer, "Joined", **values)
		self.assertEqual(self.counts(), counts)
		self.assertEqual(self.envelope(offer), (audit, value))

	def test_audit_failure_rolls_back_every_outcome_effect_and_retry_succeeds(self):
		for outcome in ("Joined", "No Show", "Withdrawn"):
			offer = self.j.offer()
			counts = self.counts()
			before = command_audit.project_request(self.f.load(self.j.name))
			ledgers = [frappe.get_doc("Kandil Capacity", name).as_dict() for name in self.f.capacities]
			with (
				self.f.rejected(RuntimeError),
				patch.object(
					command_audit,
					"record_command",
					side_effect=RuntimeError("Synthetic outcome audit failure"),
				),
			):
				self.j.outcome(offer, outcome, reason="Rollback fixture")
			self.assertEqual(self.counts(), counts)
			self.assertEqual(command_audit.project_request(self.f.load(self.j.name)), before)
			self.assertEqual(
				[frappe.get_doc("Kandil Capacity", name).as_dict() for name in self.f.capacities], ledgers
			)
			self.j.assert_no_join(offer)
			self.j.outcome(offer, outcome, reason="Rollback fixture")
			self.envelope(offer)

	def test_before_ledger_is_recorded_value_before_dated_refresh(self):
		employee = self.f.insert(
			"Employee",
			first_name=self.f.prefix + " Existing",
			company=self.f.company,
			department=self.f.department,
			date_of_birth="1990-01-01",
			date_of_joining=today(),
			gender="Male",
			status="Active",
		)
		position = frappe.get_doc("Kandil Position", self.f.positions[0])
		assignment = self.f.insert(
			"Kandil Position Assignment",
			company=self.f.company,
			department=self.f.department,
			branch=position.branch,
			position=position.name,
			employee=employee.name,
			allocation="Primary",
			valid_from=today(),
		)
		self.assertEqual(frappe.db.get_value("Kandil Capacity", self.f.capacities[0], "occupied"), 0)
		offer = self.j.offer()
		self.j.outcome(offer)
		_, value = self.envelope(offer)
		old = self.find(value, "related_before", "Kandil Capacity", self.f.capacities[0])
		new = self.find(value, "related_after", "Kandil Capacity", self.f.capacities[0])
		self.assertEqual((old["occupied"], new["occupied"]), (0, 2))
		self.assertEqual((old["open_slots"], new["open_slots"]), (2, 1))
		self.assertEqual(
			self.find(value, "related_before", "Kandil Position Assignment", assignment.name),
			self.find(value, "related_after", "Kandil Position Assignment", assignment.name),
		)

	def test_private_envelope_and_current_management_denial(self):
		offer = self.j.offer()
		self.j.outcome(offer)
		audit, _ = self.envelope(offer)
		for key in ("hr", "manager", "requester", "sector"):
			with acting_as(self.f.users[key]):
				with self.assertRaises(frappe.PermissionError):
					frappe.get_doc(command_audit.DOCTYPE, audit).check_permission("read")
				try:
					records = frappe.get_list(command_audit.DOCTYPE, filters={"name": audit})
				except frappe.PermissionError:
					records = []
				self.assertEqual(records, [])
		offer2 = self.j.offer()
		counts = self.counts()
		grant = frappe.get_doc("Kandil Access Grant", self.f.grants["hr"])
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		with self.f.rejected(frappe.PermissionError):
			self.j.outcome(offer2)
		self.assertEqual(self.counts(), counts)
		self.j.assert_no_join(offer2)

	def test_later_replay_does_not_refresh_stale_ledger_or_add_audit(self):
		offer = self.j.offer()
		with acting_as(self.f.users["hr"]):
			result = pilot.record_outcome(
				offer, "Joined", joining_date=add_days(today(), -3), date_of_birth="1995-01-01", gender="Male"
			)
		assignment = frappe.get_doc("Kandil Position Assignment", result["assignment"])
		assignment.valid_until = today()
		assignment.save(ignore_permissions=True)
		# Close through the valid native boundary today. Advance only the
		# occupancy business clock tomorrow; do not bypass backdating guards.
		frappe.db.set_value(
			"Kandil Capacity",
			self.f.capacities[0],
			"occupancy_as_of",
			add_days(today(), -1),
			update_modified=False,
		)
		before = [frappe.get_doc("Kandil Capacity", name).as_dict() for name in self.f.capacities]
		counts = self.counts()
		from kandil_hr.organization import occupancy

		with patch.object(occupancy, "today_cairo", return_value=add_days(today(), 1)):
			self.assertEqual(
				occupancy.values(frappe.get_doc("Kandil Capacity", self.f.capacities[0]))["occupied"], 0
			)
			with acting_as(self.f.users["hr"]):
				self.assertEqual(pilot.record_outcome(offer, "Joined"), result)
		self.assertEqual(
			[frappe.get_doc("Kandil Capacity", name).as_dict() for name in self.f.capacities], before
		)
		self.assertEqual(self.counts(), counts)
		self.envelope(offer)

	def test_inactive_adapter_has_no_reads_writes_or_projection(self):
		with (
			patch.dict(frappe.conf, {"kandil_parity_enabled": 0}),
			patch.object(frappe, "get_doc", side_effect=AssertionError("No read outside parity")),
			patch.object(
				command_audit, "record_command", side_effect=AssertionError("No audit outside parity")
			),
		):
			self.assertIsNone(joining_audit.start(None))
			self.assertIsNone(joining_audit.attach(None, None, None, None, None, None))
			self.assertIsNone(joining_audit.finish(None, None, None, None))


def run():
	from kandil_hr.foundation.tests_runner import RecordedResult

	if (
		frappe.local.site != "kandil-parity.localhost"
		or not frappe.conf.get("allow_tests")
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
	):
		raise RuntimeError("Joining audit tests require isolated parity CLI")
	paths = [
		Path(__file__),
		Path(joining.__file__),
		Path(joining_audit.__file__),
		Path(command_audit.__file__),
	]

	def hashes():
		return {
			str(p.relative_to(Path(__file__).parents[2])): hashlib.sha256(p.read_bytes()).hexdigest()
			for p in paths
		}

	before = hashes()
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2, resultclass=RecordedResult).run(
		unittest.defaultTestLoader.loadTestsFromTestCase(TestJoiningAudit)
	)
	after = hashes()
	report = dict(
		suite="joining-outcome-command-audit",
		checked_at=datetime.now(UTC).isoformat(),
		site=frappe.local.site,
		total=result.testsRun,
		successful=result.wasSuccessful() and not result.skipped and result.testsRun == 8,
		checks=result.checks,
		source_hashes=after,
		source_unchanged=before == after,
		fixtures_rolled_back=True,
		limitations=[
			"Server-observed Offer version is not a client-reviewed version.",
			"Local transaction audit only; no external anchoring or provider side effects.",
		],
	)
	if not report["successful"]:
		print(json.dumps(report))
		raise AssertionError("Joining audit suite failed")
	return report
