"""Synthetic parity joining regressions; every case rolls its fixtures back."""

import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.utils import add_days, today

from kandil_hr.pilot.api import record_outcome
from kandil_hr.recruitment import test_commands as fixtures


class TestJoining(unittest.TestCase):
	def setUp(self):
		self.f = fixtures.TestRecruitmentCommands()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()
		self.name, self.opening, self.vacancies = self.f.vacancy_fixture()
		self.openings = [r.job_opening for r in self.f.load(self.name).lines]
		self.task_counts = {dt: frappe.db.count(dt) for dt in ("Project", "Task")}
		for opening in self.openings:
			self.f.call(
				"hr",
				self.vacancies.assign_team,
				self.name,
				opening_name=opening,
				lead=self.f.users["hr"],
				members=[],
				reason="Synthetic joining team",
			)
			self.f.call(
				"hr",
				self.vacancies.set_state,
				self.name,
				opening_name=opening,
				action="Open",
				reason="Synthetic joining intake",
			)

	def offer(self, opening=None):
		with fixtures.acting_as(self.f.users["hr"]):
			applicant = frappe.get_doc(
				dict(
					doctype="Job Applicant",
					applicant_name="Synthetic joining candidate",
					email_id=uuid.uuid4().hex + "@example.invalid",
					job_title=opening or self.opening,
				)
			).insert()
			offer = frappe.get_doc(
				dict(
					doctype="Job Offer",
					job_applicant=applicant.name,
					offer_date=today(),
					designation=self.f.designation,
					company=self.f.company,
					status="Accepted",
				)
			).insert()
			offer.submit()
		return offer.name

	def outcome(self, offer, outcome="Joined", **values):
		if outcome == "Joined":
			values = dict(joining_date=today(), date_of_birth="1995-01-01", gender="Male", **values)
		with fixtures.acting_as(self.f.users["hr"]):
			return record_outcome(offer, outcome, **values)

	def assert_no_join(self, offer):
		self.assertEqual(frappe.db.count("Employee", {"custom_kandil_offer": offer}), 0)
		self.assertEqual(frappe.db.count("Employee Onboarding", {"job_offer": offer}), 0)
		self.assertEqual(frappe.db.get_value("Job Offer", offer, "custom_kandil_outcome"), "Pending")

	def test_partial_full_and_parent_completion_reconcile(self):
		offers = [self.offer(), self.offer(), self.offer(self.openings[1])]
		self.f.ledger((0, 0), (2, 1))
		for offer in offers:
			self.assert_no_join(offer)
		first = self.outcome(offers[0])
		self.assertTrue(first["assignment"])
		self.assertEqual(first["onboarding_status"], "Draft")
		self.assertEqual(frappe.db.get_value("Employee Onboarding", first["onboarding"], "docstatus"), 0)
		self.assertEqual({dt: frappe.db.count(dt) for dt in ("Project", "Task")}, self.task_counts)
		self.f.ledger((0, 0), (1, 1), (1, 0))
		self.assertEqual(
			frappe.db.get_value("Job Opening", self.opening, "custom_kandil_vacancy_state"),
			"Partially Filled",
		)
		self.outcome(offers[1])
		self.assertEqual(
			frappe.db.get_value("Job Opening", self.opening, ["custom_kandil_vacancy_state", "status"]),
			("Filled", "Closed"),
		)
		self.assertEqual(self.f.load(self.name).status, "Approved")
		self.outcome(offers[2])
		self.f.ledger((0, 0), (0, 0), (2, 1))
		self.assertEqual(self.f.load(self.name).status, "Closed")
		from kandil_hr.organization.api import reconcile

		rows = [r for r in reconcile(self.f.company)["rows"] if r["position"] in self.f.positions]
		self.assertEqual(len(rows), 2)
		self.assertTrue(all(r["difference"] == 0 and not r["over_allocated"] for r in rows))

	def test_filled_and_closed_locations_complete_parent(self):
		offers = [self.offer(), self.offer()]
		self.f.call(
			"hr",
			self.vacancies.set_state,
			self.name,
			opening_name=self.openings[1],
			action="Close",
			reason="Synthetic remainder no longer needed",
		)
		self.outcome(offers[0])
		self.assertEqual(self.f.load(self.name).status, "Approved")
		self.outcome(offers[1])
		self.assertEqual(self.f.load(self.name).status, "Closed")
		self.assertEqual(
			frappe.db.get_value("Job Opening", self.openings[1], "custom_kandil_vacancy_state"), "Closed"
		)
		self.f.ledger((0, 0), (0, 0), (2, 0))

	def test_terminal_replay_has_identical_links_and_no_duplicate_effect(self):
		offers = [self.offer(), self.offer(), self.offer(self.openings[1])]
		results = [self.outcome(offer) for offer in offers]
		counts = self.f.counts(self.name)
		for offer, result in zip(offers, results, strict=True):
			self.assertEqual(self.outcome(offer), result)
			self.assertEqual(frappe.db.count("Employee", {"custom_kandil_offer": offer}), 1)
			self.assertEqual(
				frappe.db.count("Kandil Position Assignment", {"employee": result["employee"]}), 1
			)
			self.assertEqual(frappe.db.count("Employee Onboarding", {"job_offer": offer}), 1)
		self.assertEqual(self.f.counts(self.name), counts)
		self.f.ledger((0, 0), (0, 0), (2, 1))

	def test_changed_replay_payload_denied(self):
		offer = self.offer()
		result = self.outcome(offer)
		for values in [
			dict(joining_date=add_days(today(), -1)),
			dict(date_of_birth="1994-01-01"),
			dict(reason="Changed reason"),
		]:
			with self.f.rejected(), fixtures.acting_as(self.f.users["hr"]):
				record_outcome(offer, "Joined", **values)
		self.assertEqual(self.outcome(offer), result)

	def test_overfill_denied_and_no_employee_created(self):
		offers = [self.offer() for _ in range(3)]
		self.outcome(offers[0])
		self.outcome(offers[1])
		with self.f.rejected():
			self.outcome(offers[2])
		self.assert_no_join(offers[2])
		self.f.ledger((0, 0), (0, 1), (2, 0))

	def test_hold_and_freeze_block_joining_without_ledger_changes(self):
		offer = self.offer()
		for action in ("Hold", "Freeze"):
			self.f.call(
				"hr",
				self.vacancies.set_state,
				self.name,
				opening_name=self.opening,
				action=action,
				reason="Synthetic pause",
			)
			with self.f.rejected():
				self.outcome(offer)
			self.assert_no_join(offer)
			self.f.ledger((0, 0), (2, 1))

	def test_no_show_and_withdrawal_preserve_vacancies(self):
		for outcome in ("No Show", "Withdrawn"):
			offer = self.offer()
			with self.f.rejected():
				self.outcome(offer, outcome)
			result = self.outcome(offer, outcome, reason="Synthetic documented reason")
			self.assertEqual(
				result,
				dict(
					outcome=outcome, employee=None, onboarding=None, assignment=None, onboarding_status=None
				),
			)
			self.assertEqual(self.outcome(offer, outcome, reason="Synthetic documented reason"), result)
			with self.f.rejected():
				self.outcome(offer, outcome, reason="Changed")
			self.assertEqual(frappe.db.count("Employee", {"custom_kandil_offer": offer}), 0)
		self.f.ledger((0, 0), (2, 1))

	def test_failed_onboarding_request_rolls_back_all_joining_effects(self):
		offer = self.offer()
		from hrms.hr.doctype.employee_onboarding.employee_onboarding import EmployeeOnboarding

		with (
			self.f.rejected(RuntimeError),
			patch.object(
				EmployeeOnboarding,
				"before_insert",
				create=True,
				side_effect=RuntimeError("Synthetic onboarding failure"),
			),
		):
			self.outcome(offer)
		self.assert_no_join(offer)
		self.assertEqual(frappe.db.count("Kandil Position Assignment", {"position": self.f.positions[0]}), 0)
		self.f.ledger((0, 0), (2, 1))
		self.assertEqual(
			frappe.db.get_value("Job Opening", self.opening, "custom_kandil_vacancy_state"), "Open"
		)
		self.assertEqual(self.outcome(offer)["outcome"], "Joined")

	def test_revoked_management_grant_blocks_joining(self):
		offer = self.offer()
		grant = frappe.get_doc("Kandil Access Grant", self.f.grants["hr"])
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		with self.f.rejected(frappe.PermissionError):
			self.outcome(offer)
		self.assert_no_join(offer)
		self.f.ledger((0, 0), (2, 1))

	def test_replay_retains_original_assignment_after_later_assignment(self):
		offer = self.offer()
		result = self.outcome(offer)
		assignment = frappe.get_doc("Kandil Position Assignment", result["assignment"])
		assignment.valid_until = today()
		assignment.save(ignore_permissions=True)
		later = self.f.insert(
			"Kandil Position Assignment",
			company=self.f.company,
			department=self.f.department,
			branch=assignment.branch,
			position=assignment.position,
			employee=result["employee"],
			allocation="Primary",
			valid_from=add_days(today(), 1),
		)
		self.assertNotEqual(later.name, result["assignment"])
		self.assertEqual(self.outcome(offer), result)

	def test_joining_assignment_reference_cannot_be_forged(self):
		offer = self.offer()
		result = self.outcome(offer)
		for field, value in (
			("custom_kandil_assignment", None),
			("custom_kandil_outcome", "Withdrawn"),
			("custom_kandil_outcome_reason", "Forged"),
			("status", "Rejected"),
		):
			with self.f.rejected(frappe.PermissionError), fixtures.acting_as(self.f.users["hr"]):
				doc = frappe.get_doc("Job Offer", offer)
				doc.set(field, value)
				doc.save(ignore_permissions=True)
		self.assertEqual(self.outcome(offer), result)


def run():
	import sys

	if (
		frappe.local.site != "kandil-parity.localhost"
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
		or not all(
			frappe.conf.get(k)
			for k in (
				"allow_tests",
				"kandil_pilot_enabled",
				"kandil_parity_enabled",
				"kandil_foundation_enabled",
			)
		)
	):
		raise RuntimeError("Joining checks require the opted-in isolated parity CLI site")
	from kandil_hr.foundation.tests_runner import RecordedResult

	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2, resultclass=RecordedResult).run(
		unittest.defaultTestLoader.loadTestsFromTestCase(TestJoining)
	)
	if not result.wasSuccessful() or result.skipped or result.testsRun != 11:
		raise AssertionError("Joining suite failed or skipped")
	return dict(
		suite="recruitment-joining",
		tests_run=result.testsRun,
		successful=True,
		checks=result.checks,
		fixtures_rolled_back=True,
	)
