"""Synthetic source fill-void proof; fixtures and all effects roll back per case."""

import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe

from kandil_hr.organization.api import reconcile
from kandil_hr.recruitment import joining_corrections as correction
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.test_joining import TestJoining


class TestJoiningCorrections(unittest.TestCase):
	def setUp(self):
		self.j = TestJoining()
		self.addCleanup(self.j.doCleanups)
		self.j.setUp()
		self.f, self.name = self.j.f, self.j.name
		self.offer = self.j.offer()
		self.joined = self.j.outcome(self.offer)

	def void(self, **kw):
		return self.f.call(
			"hr",
			correction.void_joining,
			self.name,
			offer_name=self.offer,
			reason="Incorrect synthetic joining entry",
			**kw,
		)

	def state(self):
		return {
			dt: frappe.get_doc(dt, name).as_json()
			for dt, name in (
				("Job Offer", self.offer),
				("Employee", self.joined["employee"]),
				("Employee Onboarding", self.joined["onboarding"]),
				("Kandil Position Assignment", self.joined["assignment"]),
				("Kandil Hiring Request", self.name),
			)
		}

	def test_partial_void_reconciles_and_keeps_original_facts(self):
		assignment = frappe.get_doc("Kandil Position Assignment", self.joined["assignment"])
		old_events = frappe.get_all(
			"Kandil Recruitment Event", filters={"request": self.name}, fields=["name", "snapshot", "note"]
		)
		self.void()
		self.f.ledger((0, 0), (2, 1), (0, 0))
		self.assertEqual(
			frappe.db.get_value("Job Opening", self.j.opening, "custom_kandil_vacancy_state"), "Open"
		)
		assignment.reload()
		self.assertEqual(assignment.is_voided, 1)
		self.assertEqual(assignment.employee, self.joined["employee"])
		self.assertEqual(assignment.allocation, "Primary")
		self.assertEqual(frappe.db.get_value("Employee", assignment.employee, "status"), "Inactive")
		self.assertEqual(frappe.db.get_value("Job Offer", self.offer, "custom_kandil_outcome"), "Joined")
		self.assertEqual(
			frappe.db.get_value("Job Offer", self.offer, "custom_kandil_voided_by"), self.f.users["hr"]
		)
		self.assertEqual(
			frappe.db.get_value(
				"Employee Onboarding",
				self.joined["onboarding"],
				["docstatus", "custom_kandil_joining_voided"],
			),
			(0, 1),
		)
		for event in old_events:
			self.assertEqual(
				frappe.db.get_value("Kandil Recruitment Event", event.name, ["snapshot", "note"]),
				(event.snapshot, event.note),
			)
		with acting_as(self.f.users["hr"]):
			self.assertTrue(
				all(
					r["difference"] == 0
					for r in reconcile(self.f.company)["rows"]
					if r["position"] in self.f.positions
				)
			)

	def test_complete_parent_reopens_and_replacement_fills(self):
		self.j.outcome(self.j.offer())
		self.j.outcome(self.j.offer(self.j.openings[1]))
		self.assertEqual(self.f.load(self.name).status, "Closed")
		self.void()
		self.assertEqual(self.f.load(self.name).status, "Approved")
		self.f.ledger((0, 0), (1, 0), (1, 1))
		self.assertEqual(
			frappe.db.get_value("Job Opening", self.j.opening, "custom_kandil_vacancy_state"),
			"Partially Filled",
		)
		self.j.outcome(self.j.offer())
		self.f.ledger((0, 0), (0, 0), (2, 1))
		self.assertEqual(self.f.load(self.name).status, "Closed")

	def test_receipt_replay_one_event_notice_and_changed_payload_denied(self):
		key, version = uuid.uuid4().hex, str(self.f.load(self.name).modified)
		first = self.void(command_id=key, expected_version=version)
		counts = self.f.counts(self.name)
		self.assertEqual(first, self.void(command_id=key, expected_version=version))
		self.assertEqual(counts, self.f.counts(self.name))
		with self.f.rejected(), acting_as(self.f.users["hr"]):
			correction.void_joining(self.name, self.offer, key, version, "Different reason")
		with self.f.rejected():
			self.void()
		with self.f.rejected():
			self.j.outcome(self.offer)
		self.f.ledger((0, 0), (2, 1), (0, 0))

	def test_authority_scope_reason_and_stale_version_deny_without_changes(self):
		before = self.state()
		for role in ("requester", "manager"):
			with self.f.rejected(frappe.PermissionError):
				self.f.call(
					role, correction.void_joining, self.name, offer_name=self.offer, reason="Rejected role"
				)
		with self.f.rejected(), acting_as(self.f.users["hr"]):
			correction.void_joining(
				self.name, self.offer, uuid.uuid4().hex, str(self.f.load(self.name).modified), " "
			)
		with self.f.rejected(frappe.TimestampMismatchError):
			self.void(expected_version="2000-01-01 00:00:00")
		self.assertEqual(before, self.state())

	def test_mid_transaction_failure_restores_all_records(self):
		before, counts = self.state(), self.f.counts(self.name)
		with (
			self.f.rejected(),
			patch.object(correction, "save", side_effect=frappe.ValidationError("Synthetic audit failure")),
		):
			self.void()
		self.assertEqual(before, self.state())
		self.assertEqual(counts, self.f.counts(self.name))
		self.f.ledger((0, 0), (1, 1), (1, 0))

	def test_downstream_checkin_prevents_void(self):
		with acting_as("Administrator"):
			frappe.get_doc(
				dict(
					doctype="Employee Checkin",
					employee=self.joined["employee"],
					time="2026-10-12 08:00:00",
					log_type="IN",
				)
			).insert(ignore_permissions=True)
		before = self.state()
		with self.f.rejected():
			self.void()
		self.assertEqual(before, self.state())

	def test_void_markers_and_retained_records_cannot_be_forged(self):
		for dt, name, field in (
			("Job Offer", self.offer, "custom_kandil_joining_voided"),
			("Employee", self.joined["employee"], "custom_kandil_joining_voided"),
			("Employee Onboarding", self.joined["onboarding"], "custom_kandil_joining_voided"),
			("Kandil Position Assignment", self.joined["assignment"], "is_voided"),
		):
			with (
				self.f.rejected((frappe.PermissionError, frappe.ValidationError)),
				acting_as(self.f.users["hr"]),
			):
				doc = frappe.get_doc(dt, name)
				doc.set(field, 1)
				doc.save(ignore_permissions=True)
		self.void()
		with self.f.rejected(), acting_as("Administrator"):
			doc = frappe.get_doc("Employee Onboarding", self.joined["onboarding"])
			doc.submit()
		with self.f.rejected(), acting_as(self.f.users["hr"]):
			doc = frappe.get_doc("Kandil Position Assignment", self.joined["assignment"])
			doc.is_voided = 0
			doc.save(ignore_permissions=True)

	def test_voided_employee_rejects_new_operational_records_and_handoff_delete(self):
		self.void()
		with self.f.rejected(), acting_as("Administrator"):
			frappe.get_doc(
				dict(
					doctype="Employee Checkin",
					employee=self.joined["employee"],
					time="2026-10-12 08:00:00",
					log_type="IN",
				)
			).insert(ignore_permissions=True)
		with self.f.rejected(), acting_as("Administrator"):
			frappe.delete_doc("Employee Onboarding", self.joined["onboarding"], ignore_permissions=True)
		self.assertTrue(frappe.db.exists("Employee Onboarding", self.joined["onboarding"]))
		self.f.ledger((0, 0), (2, 1), (0, 0))

	def test_held_vacancy_stays_held_after_void(self):
		self.f.call(
			"hr",
			self.j.vacancies.set_state,
			self.name,
			opening_name=self.j.opening,
			action="Hold",
			reason="Synthetic hold",
		)
		self.void()
		self.assertEqual(
			frappe.db.get_value("Job Opening", self.j.opening, "custom_kandil_vacancy_state"), "On Hold"
		)
		self.f.ledger((0, 0), (2, 1), (0, 0))

	def test_nested_hold_freeze_void_unfreeze_preserves_hold(self):
		for action in ("Hold", "Freeze"):
			self.f.call(
				"hr",
				self.j.vacancies.set_state,
				self.name,
				opening_name=self.j.opening,
				action=action,
				reason="Synthetic nested pause",
			)
		self.void()
		self.f.call(
			"hr",
			self.j.vacancies.set_state,
			self.name,
			opening_name=self.j.opening,
			action="Unfreeze",
			reason="Review freeze ended",
		)
		self.assertEqual(
			frappe.db.get_value("Job Opening", self.j.opening, "custom_kandil_vacancy_state"), "On Hold"
		)
		self.f.call(
			"hr",
			self.j.vacancies.set_state,
			self.name,
			opening_name=self.j.opening,
			action="Resume",
			reason="Review hold ended",
		)
		self.assertEqual(
			frappe.db.get_value("Job Opening", self.j.opening, "custom_kandil_vacancy_state"), "Open"
		)
		self.f.ledger((0, 0), (2, 1), (0, 0))

	def payroll_draft(self):
		# An incomplete payroll draft is still a downstream reference; never submit
		# or calculate payroll in this HR recruitment proof.
		return frappe.get_doc(
			dict(
				doctype="Payroll Entry",
				company=self.f.company,
				posting_date="2026-10-12",
				start_date="2026-10-01",
				end_date="2026-10-31",
				currency="EGP",
				exchange_rate=1,
				employees=[dict(employee=self.joined["employee"], employee_name="Synthetic hire")],
			)
		)

	def test_payroll_employee_child_prevents_void_and_post_void_selection(self):
		with acting_as("Administrator"):
			payroll = self.payroll_draft().insert(ignore_permissions=True, ignore_mandatory=True)
		with self.f.rejected():
			self.void()
		self.assertEqual(frappe.db.get_value("Employee", self.joined["employee"], "status"), "Active")
		with acting_as("Administrator"):
			payroll.set("employees", [])
			payroll.flags.ignore_mandatory = True
			payroll.save(ignore_permissions=True)
		self.void()
		with self.f.rejected(), acting_as("Administrator"):
			self.payroll_draft().insert(ignore_permissions=True, ignore_mandatory=True)
		self.assertEqual(frappe.db.count("Payroll Employee Detail", {"employee": self.joined["employee"]}), 0)


def run():
	if not frappe.conf.get("kandil_parity_enabled") or frappe.local.site != "kandil-parity.localhost":
		raise RuntimeError("Synthetic parity site required")
	suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestJoiningCorrections)
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2).run(suite)
	report = dict(
		suite="joining-corrections",
		tests=result.testsRun,
		failures=len(result.failures),
		errors=len(result.errors),
		successful=result.wasSuccessful(),
	)
	if not result.wasSuccessful():
		raise AssertionError(json.dumps(report))
	return report
