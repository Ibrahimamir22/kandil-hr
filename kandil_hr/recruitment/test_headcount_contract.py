"""Bounded shortage and Return/revise reservation proof; not atomic pending editing."""

import json
import unittest
import uuid

import frappe

from kandil_hr.recruitment import api
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.test_contracts import TestRecruitmentContracts


class TestHeadcountContract(unittest.TestCase):
	def setUp(self):
		self.fixture = TestRecruitmentContracts()
		self.addCleanup(self.fixture.doCleanups)
		self.fixture.setUp()
		self.f = self.fixture.f

	def denial(self, name, message):
		before = self.f.load(name).as_dict()
		counts = self.f.counts(name)
		caps = [frappe.get_doc("Kandil Capacity", x).as_dict() for x in self.f.capacities]
		result = self.f.submit(name)
		self.assertEqual(result["outcome"], "denied")
		self.assertIn(message, result["message"])
		self.assertTrue(frappe.db.exists("Kandil Security Event", result["event"]))
		self.assertEqual(before, self.f.load(name).as_dict())
		self.assertEqual(counts, self.f.counts(name))
		self.assertEqual(caps, [frappe.get_doc("Kandil Capacity", x).as_dict() for x in self.f.capacities])

	def test_block_precedes_blank_short_or_valid_reason_and_leaves_no_effect(self):
		self.fixture.configure(1)
		self.fixture.mode("Block")
		for reason in ("", "short", "Ten letters justify shortage"):
			with self.subTest(reason_length=len(reason)):
				req = self.fixture.edit(self.f.request((3,)), exception_reason=reason)
				self.denial(req.name, "Headcount blocking is enabled")
				self.assertEqual(self.f.load(req.name).status, "Draft")
				self.assertEqual(self.f.load(req.name).approval_steps, [])

	def test_warn_rejects_trimmed_lengths_below_ten(self):
		self.fixture.configure(1)
		self.fixture.mode("Warn")
		for reason in ("", "   ", "123456789", " 123456789 "):
			with self.subTest(trimmed_length=len(reason.strip())):
				req = self.fixture.edit(self.f.request((3,)), exception_reason=reason)
				self.denial(req.name, "at least 10 characters")

	def test_warn_ten_characters_snapshot_and_independent_exception_authority(self):
		cap = self.fixture.configure(1)
		self.fixture.mode("Warn")
		req = self.fixture.edit(self.f.request((3,)), exception_reason="1234567890")
		self.f.submit(req.name)
		pending = self.f.load(req.name)
		route = json.loads(pending.route_snapshot)
		self.assertEqual(route["policy"]["headcount_mode"], "Warn")
		basis = route["headcount_basis"][cap.name]
		available = basis["structural"] - basis["occupied"] - basis["other_commitments"]
		self.assertEqual(
			(pending.lines[0].requested_qty, available, basis["additional"] - available), (3, 1, 2)
		)
		frozen = json.loads(pending.submitted_snapshot)
		self.assertEqual(frozen["exception_reason"], "1234567890")
		self.assertEqual(
			(pending.approval_steps[0].authority, pending.approval_steps[0].principal),
			("Headcount Exception", self.f.users["sector"]),
		)
		before = self.f.counts(req.name)
		with self.f.rejected(frappe.PermissionError):
			self.f.decide(req.name, "hr")
		self.assertEqual(before, self.f.counts(req.name))
		self.assertEqual(self.f.load(req.name).approval_steps[0].decision, "Pending")
		self.f.decide(req.name, "sector", comment="Independent ten-character justification review")
		decided = self.f.load(req.name).approval_steps[0]
		reviewed = json.loads(decided.reviewed_snapshot)
		self.assertEqual(reviewed["exception_reason"], "1234567890")
		self.assertEqual(
			(decided.actor, decided.principal, decided.decision),
			(self.f.users["sector"], self.f.users["sector"], "Approved"),
		)
		self.f.ledger((3, 0), (0, 0))

	def test_pending_two_return_revise_three_is_release_then_reserve_not_atomic_edit(self):
		other = self.f.request((1,))
		self.f.submit(other.name)
		other_before = self.f.load(other.name).as_dict()
		other_counts = self.f.counts(other.name)
		req = self.f.request((2,))
		self.f.submit(req.name)
		pending = self.f.load(req.name)
		old_step = pending.approval_steps[0].step_key
		original_snapshot = pending.submitted_snapshot
		old_revisions = frappe.get_all(
			"Kandil Request Revision",
			filters={"request": req.name},
			fields=["name", "snapshot_json"],
			order_by="name",
		)
		reservations = [pending.lines[0].reserved_qty]
		self.f.ledger((3, 0), (0, 0))
		from kandil_hr.recruitment.preview import headcount

		with acting_as(self.f.users["requester"]):
			row = headcount(req.name)["rows"][0]
		self.assertEqual((row["own_reserved"], row["available"]), (2, 4))
		self.f.decide(req.name, "manager", decision="Return", comment="Return for explicit quantity revision")
		returned = self.f.load(req.name)
		reservations.append(returned.lines[0].reserved_qty)
		self.assertEqual(returned.status, "Returned")
		self.f.ledger((1, 0), (0, 0))
		self.f.call("requester", api.revise, req.name, reason="Increase returned request from two to three")
		with acting_as(self.f.users["requester"]):
			draft = self.f.load(req.name)
			draft.lines[0].requested_qty = 3
			draft.save()
		version = str(self.f.load(req.name).modified)
		command = uuid.uuid4().hex
		first = self.f.submit(req.name, command_id=command, expected_version=version)
		after = self.f.load(req.name)
		reservations.append(after.lines[0].reserved_qty)
		self.assertEqual(reservations, [2, 0, 3])
		self.f.ledger((4, 0), (0, 0))
		self.assertNotEqual(after.approval_steps[0].step_key, old_step)
		self.assertNotEqual(after.submitted_snapshot, original_snapshot)
		counts = self.f.counts(req.name)
		replay = self.f.submit(req.name, command_id=command, expected_version=version)
		self.assertEqual(json.loads(api.dump(first)), json.loads(api.dump(replay)))
		self.assertEqual(counts, self.f.counts(req.name))
		self.f.ledger((4, 0), (0, 0))
		with self.f.rejected(frappe.ValidationError):
			self.f.call("manager", api.decide, req.name, decision="Approve", step_id=old_step)
		self.f.ledger((4, 0), (0, 0))
		self.assertEqual(other_before, self.f.load(other.name).as_dict())
		self.assertEqual(other_counts, self.f.counts(other.name))
		for old_revision in old_revisions:
			self.assertEqual(
				frappe.db.get_value("Kandil Request Revision", old_revision.name, "snapshot_json"),
				old_revision.snapshot_json,
			)


def run():
	import sys

	from kandil_hr.foundation.tests_runner import RecordedResult

	if (
		frappe.local.site != "kandil-parity.localhost"
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
		or not all(
			frappe.conf.get(k)
			for k in (
				"allow_tests",
				"kandil_pilot_enabled",
				"kandil_foundation_enabled",
				"kandil_parity_enabled",
			)
		)
	):
		raise RuntimeError("Headcount contract checks require opted-in parity CLI")
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2, resultclass=RecordedResult).run(
		unittest.defaultTestLoader.loadTestsFromTestCase(TestHeadcountContract)
	)
	value = dict(
		suite="headcount-reference-contract",
		total=result.testsRun,
		successful=result.wasSuccessful() and not result.skipped and result.testsRun == 4,
		failures=len(result.failures),
		errors=len(result.errors),
		skipped=len(result.skipped),
		checks=result.checks,
		fixtures_rolled_back=True,
		limits=[
			"Pending2→Return→revise3→resubmit is not atomic Pending edit.",
			"Business effects roll back; a private denial audit is retained by the command boundary.",
		],
	)
	print(json.dumps(value))
	if not value["successful"]:
		raise AssertionError("Headcount contract tests failed or skipped")
	return value
