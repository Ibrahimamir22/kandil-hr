"""Exact source VAC-002 completion notice and per-location terminal variants."""

import sys
import unittest
import uuid

import frappe

from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.test_joining import TestJoining


class TestCompletion(unittest.TestCase):
	def setUp(self):
		self.j = TestJoining()
		self.addCleanup(self.j.doCleanups)
		self.j.setUp()
		self.f = self.j.f

	def notices(self):
		return frappe.get_all(
			"Kandil Notification Outbox",
			filters={
				"reference_doctype": "Kandil Hiring Request",
				"reference_name": self.j.name,
				"subject": "Recruitment request completed",
			},
			fields=["name", "recipient", "body"],
		)

	def assert_completed(self):
		self.assertEqual(self.f.load(self.j.name).status, "Closed")
		notices = self.notices()
		self.assertEqual(len(notices), 1)
		self.assertEqual(notices[0].recipient, self.f.users["requester"])
		self.assertIn("All request vacancies are filled, closed or cancelled.", notices[0].body)
		events = frappe.get_all(
			"Kandil Recruitment Event",
			filters={"request": self.j.name},
			fields=["snapshot"],
			order_by="creation desc",
			limit=1,
		)
		self.assertEqual(frappe.parse_json(events[0].snapshot)["status"], "Closed")

	def test_partial_then_full_once_and_replay(self):
		offers = [self.j.offer(), self.j.offer(), self.j.offer(self.j.openings[1])]
		for offer in offers[:2]:
			self.j.outcome(offer)
			self.assertEqual(self.notices(), [])
		self.j.outcome(offers[2])
		self.assert_completed()
		before = self.f.counts(self.j.name)
		for offer in offers:
			self.j.outcome(offer)
		self.assertEqual(before, self.f.counts(self.j.name))
		self.assert_completed()
		self.f.ledger((0, 0), (0, 0), (2, 1))

	def test_filled_then_cancelled_location_once_and_replay(self):
		for _ in range(2):
			self.j.outcome(self.j.offer())
		self.assertEqual(self.notices(), [])
		doc = self.f.load(self.j.name)
		kw = dict(
			name=self.j.name,
			opening_name=self.j.openings[1],
			action="Cancel",
			reason="Synthetic cancelled remainder",
			command_id=uuid.uuid4().hex,
			expected_version=str(doc.modified),
		)
		with acting_as(self.f.users["hr"]):
			first = self.j.vacancies.set_state(**kw)
			self.assert_completed()
			before = self.f.counts(self.j.name)
			self.assertEqual(
				frappe.parse_json(frappe.as_json(first)),
				frappe.parse_json(frappe.as_json(self.j.vacancies.set_state(**kw))),
			)
		self.assertEqual(before, self.f.counts(self.j.name))
		self.assertEqual(
			frappe.db.get_value("Job Opening", self.j.openings[1], "custom_kandil_vacancy_state"), "Cancelled"
		)
		self.f.ledger((0, 0), (0, 0), (2, 0))

	def test_closed_and_cancelled_locations_once(self):
		for index, action in enumerate(("Close", "Cancel")):
			self.f.call(
				"hr",
				self.j.vacancies.set_state,
				self.j.name,
				opening_name=self.j.openings[index],
				action=action,
				reason="Synthetic unfilled location closed",
			)
			if index == 0:
				self.assertEqual(self.notices(), [])
		self.assert_completed()
		self.f.ledger((0, 0), (0, 0), (0, 0))


def run():
	if (
		frappe.local.site != "kandil-parity.localhost"
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
		or not frappe.conf.get("allow_tests")
	):
		raise RuntimeError("Completion checks require isolated synthetic CLI site")
	from kandil_hr.foundation.tests_runner import RecordedResult

	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2, resultclass=RecordedResult).run(
		unittest.defaultTestLoader.loadTestsFromTestCase(TestCompletion)
	)
	if not result.wasSuccessful() or result.skipped or result.testsRun != 3:
		raise AssertionError("Completion cases failed or skipped")
	return dict(
		suite="vacancy-completion",
		tests_run=result.testsRun,
		successful=True,
		checks=result.checks,
		fixtures_rolled_back=True,
	)
