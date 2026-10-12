"""Native PD-06 correction proof with real joining and ledger records."""

import json
import sys
import unittest
import uuid

import frappe
from frappe.utils import add_days, today

from kandil_hr.organization.api import transition as organization_transition
from kandil_hr.recruitment import api, corrections
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.test_joining import TestJoining


class TestApprovedCorrections(unittest.TestCase):
	def setUp(self):
		self.j = TestJoining()
		self.addCleanup(self.j.doCleanups)
		self.j.setUp()
		self.f = self.j.f
		self.name = self.j.name

	def correct(self, **values):
		return self.f.call(
			"hr", corrections.correct_approved, self.name, reason="Approved HR correction", **values
		)

	def increase_first_to_three(self):
		openings = [row.job_opening for row in self.f.load(self.name).lines]
		self.f.ledger((0, 0), (2, 1))
		amendment = self.f.call("requester", api.amend, self.name, reason="One additional approved seat")
		with acting_as(self.f.users["requester"]):
			doc = self.f.load(amendment["name"])
			doc.lines[0].requested_qty = 3
			doc.save()
		self.f.submit(doc.name)
		self.f.ledger((1, 0), (2, 1))
		self.f.decide(doc.name, "manager")
		self.f.ledger((1, 0), (2, 1))
		self.assertEqual(frappe.db.get_value("Job Opening", openings[0], "vacancies"), 2)
		self.f.decide(doc.name, "hr")
		self.f.ledger((0, 0), (3, 1))
		self.assertEqual(self.f.load(doc.name).status, "Applied")
		self.assertEqual([row.job_opening for row in self.f.load(self.name).lines], openings)
		self.assertEqual(frappe.db.get_value("Job Opening", openings[0], "vacancies"), 3)
		self.assertEqual(frappe.db.count("Job Opening", {"custom_kandil_request": self.name}), 2)

	def destination(self):
		with acting_as("Administrator"), organization_transition():
			branch = self.f.insert("Branch", branch=self.f.prefix + "-correction").name
			position = self.f.insert(
				"Kandil Position",
				company=self.f.company,
				department=self.f.department,
				branch=branch,
				designation=self.f.designation,
				position_code=self.f.prefix + "-correction",
				title="Synthetic destination",
				structural=5,
				status="Active",
			)
			return self.f.insert(
				"Kandil Capacity",
				company=self.f.company,
				department=self.f.department,
				branch=branch,
				designation=self.f.designation,
				position=position.name,
				structural=5,
			).name

	def test_exact_joined_floor_reduction_replay_and_history(self):
		self.increase_first_to_three()
		joined = [self.j.outcome(self.j.offer()) for _ in range(2)]
		doc = self.f.load(self.name)
		line = doc.lines[0]
		version = str(doc.modified)
		key = uuid.uuid4().hex
		prior_revisions = frappe.get_all(
			"Kandil Request Revision", filters={"request": self.name}, fields=["name", "snapshot_json"]
		)
		with acting_as(self.f.users["hr"]):
			result = corrections.correct_approved(
				self.name, key, version, "Reduce 3 to actual 2", quantities={line.name: 2}
			)
		counts = self.f.counts(self.name)
		with acting_as(self.f.users["hr"]):
			self.assertEqual(
				json.loads(api.dump(result)),
				corrections.correct_approved(
					self.name, key, version, "Reduce 3 to actual 2", quantities={line.name: 2}
				),
			)
		self.assertEqual(self.f.counts(self.name), counts)
		self.f.ledger((0, 0), (0, 1), (2, 0))
		self.assertEqual(self.f.load(self.name).lines[0].approved_qty, 2)
		with self.f.rejected():
			self.correct(quantities={line.name: 1})
		self.f.ledger((0, 0), (0, 1), (2, 0))
		for row in prior_revisions:
			self.assertEqual(
				frappe.db.get_value("Kandil Request Revision", row.name, "snapshot_json"), row.snapshot_json
			)
		for row in joined:
			self.assertTrue(frappe.db.exists("Kandil Position Assignment", row["assignment"]))

	def test_public_spec_date_type_correction_records_before_after_and_notice(self):
		with acting_as("Administrator"):
			type_name = self.f.insert("Employment Type", employee_type_name=self.f.prefix + "-type").name
		doc = self.f.load(self.name)
		counts = self.f.counts(self.name)
		values = dict(
			employment_type=type_name,
			required_by=add_days(today(), 20),
			qualifications="Qualification عربي",
			skills_required="Forklift",
			experience_required="Two years",
			working_conditions="Day shift",
			need_reason="Expansion",
			hr_priority="Critical",
		)
		self.correct(fields=values)
		current = self.f.load(self.name)
		for key, value in values.items():
			self.assertEqual(str(current.get(key)), str(value))
		self.assertEqual(current.revision, doc.revision + 1)
		audit = json.loads(current.decision_note)
		self.assertEqual(audit["after"]["skills_required"], "Forklift")
		self.assertEqual(audit["reason"], "Approved HR correction")
		self.assertEqual(
			self.f.counts(self.name)["Kandil Notification Outbox"], counts["Kandil Notification Outbox"] + 1
		)
		self.f.ledger((0, 0), (2, 1))

	def test_relocation_keeps_joiners_and_moves_only_open_remainder(self):
		joined = self.j.outcome(self.j.offer())
		doc = self.f.load(self.name)
		line = doc.lines[0]
		target = self.destination()
		self.correct(relocations={line.name: target})
		current = self.f.load(self.name)
		original = next(x for x in current.lines if x.name == line.name)
		moved = next(x for x in current.lines if x.capacity == target)
		self.assertEqual((original.approved_qty, original.joined_qty), (1, 1))
		self.assertEqual(moved.approved_qty, 1)
		self.assertEqual(
			frappe.db.get_value("Kandil Position Assignment", joined["assignment"], "position"),
			self.f.positions[0],
		)
		self.assertEqual(frappe.db.get_value("Kandil Capacity", target, ["open_slots", "occupied"]), (1, 0))
		self.f.ledger((0, 0), (0, 1), (1, 0))
		self.assertEqual(
			frappe.db.get_value("Job Opening", moved.job_opening, "custom_kandil_vacancy_state"), "Approved"
		)
		self.assertFalse(frappe.db.get_value("Job Opening", moved.job_opening, "custom_kandil_lead"))

	def test_role_reason_unknown_field_increase_and_stale_version_fail_without_effect(self):
		doc = self.f.load(self.name)
		line = doc.lines[0]
		counts = self.f.counts(self.name)
		with self.f.rejected(frappe.PermissionError):
			self.f.call(
				"requester",
				corrections.correct_approved,
				self.name,
				reason="Not HR",
				fields={"skills_required": "No"},
			)
		with self.f.rejected():
			self.f.call(
				"hr", corrections.correct_approved, self.name, reason="", fields={"skills_required": "No"}
			)
		with self.f.rejected():
			self.correct(fields={"company": "Other"})
		with self.f.rejected():
			self.correct(quantities={line.name: 3})
		with self.f.rejected():
			self.correct(quantities={line.name: 1.5})
		self.assertEqual(self.f.counts(self.name), counts)
		self.correct(fields={"skills_required": "One"})
		with self.f.rejected(frappe.TimestampMismatchError):
			self.f.call(
				"hr",
				corrections.correct_approved,
				self.name,
				expected_version=str(doc.modified),
				reason="Stale",
				fields={"skills_required": "Two"},
			)
		self.assertEqual(self.f.load(self.name).skills_required, "One")

	def test_unresolved_candidate_and_noted_scope_relocation_fail_atomically(self):
		doc = self.f.load(self.name)
		line = doc.lines[0]
		target = self.destination()
		self.j.offer()
		counts = self.f.counts(self.name)
		with self.f.rejected():
			self.correct(relocations={line.name: target})
		self.assertEqual(self.f.counts(self.name), counts)
		self.f.ledger((0, 0), (2, 1))
		# Other line has no candidates, but adding scope to a noted request must fail.
		with acting_as(self.f.users["hr"]):
			frappe.get_doc(
				dict(doctype="Kandil HR Note", request=self.name, note="Private original scope")
			).insert()
		with self.f.rejected(frappe.PermissionError):
			self.correct(relocations={doc.lines[1].name: target})
		self.assertEqual(self.f.counts(self.name), counts)
		self.f.ledger((0, 0), (2, 1))
		self.assertEqual(frappe.db.get_value("Kandil Capacity", target, "open_slots"), 0)

	def test_closed_seat_reduction_does_not_release_twice(self):
		doc = self.f.load(self.name)
		line = doc.lines[0]
		self.f.call(
			"hr",
			self.j.vacancies.set_state,
			self.name,
			opening_name=line.job_opening,
			action="Close",
			reason="Closed seats",
		)
		self.f.ledger((0, 0), (0, 1))
		self.correct(quantities={line.name: 0})
		self.f.ledger((0, 0), (0, 1))
		line = self.f.load(self.name).lines[0]
		self.assertEqual((line.approved_qty, line.closed_qty, line.joined_qty), (0, 0, 0))


def run():
	suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestApprovedCorrections)
	cases = [t.id() for t in suite]
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2).run(suite)
	value = dict(
		suite="approved-hr-corrections",
		tests_run=result.testsRun,
		successful=result.wasSuccessful() and not result.skipped,
		failures=len(result.failures),
		errors=len(result.errors),
		skipped=len(result.skipped),
		cases=cases,
		fixtures_rolled_back=True,
	)
	if not value["successful"]:
		print(json.dumps(value))
		raise AssertionError("Approved correction suite failed")
	return value
