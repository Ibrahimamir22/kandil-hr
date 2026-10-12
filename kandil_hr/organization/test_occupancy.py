"""Cross-domain occupancy proof using real ordinary-user recruitment commands."""

import json
import unittest
from unittest.mock import patch

import frappe
from frappe.utils import add_days, today

from kandil_hr.organization import occupancy
from kandil_hr.organization.api import transition as org_transition
from kandil_hr.pilot.api import lock_capacities, transition
from kandil_hr.recruitment import api
from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as
from kandil_hr.recruitment.test_joining import TestJoining


class TestOccupancy(TestRecruitmentCommands):
	def configure(self, structural=3):
		with acting_as("Administrator"), org_transition(), transition():
			p = frappe.get_doc("Kandil Position", self.positions[0])
			p.structural = structural
			p.save()
			cap = frappe.get_doc("Kandil Capacity", self.capacities[0])
			cap.structural = structural
			cap.save()
		self.assignments = []
		for i in range(2):
			with acting_as("Administrator"):
				e = self.insert(
					"Employee",
					first_name=self.prefix + "-occupied-" + str(i),
					gender="Male",
					date_of_birth="1990-01-01",
					date_of_joining=today(),
					company=self.company,
					department=self.department,
					status="Active",
				)
				self.assignments.append(
					self.insert(
						"Kandil Position Assignment",
						company=self.company,
						department=self.department,
						branch=cap.branch,
						position=cap.position,
						employee=e.name,
						allocation="Primary",
						valid_from=today(),
					)
				)
		return cap

	def test_stale_zero_with_two_assignments_requires_shortage_two_exception(self):
		cap = self.configure()
		self.assertEqual(frappe.db.get_value("Kandil Capacity", cap.name, "occupied"), 0)
		with acting_as(self.users["requester"]):
			current = occupancy.preview(cap.name)
			self.assertEqual((current["occupied"], current["available"]), (2, 1))
			loaded = frappe.get_doc("Kandil Capacity", cap.name)
			loaded.run_method("onload")
			self.assertEqual(loaded.get_onload()["current_occupancy"]["available"], 1)
		request = self.request((3,))
		with self.assertRaises(frappe.ValidationError):
			self.submit(request.name)
		with acting_as(self.users["requester"]):
			request.reload()
			request.exception_reason = "Reviewed shortage of two seats"
			request.save()
		self.submit(request.name)
		request.reload()
		self.assertEqual(request.needs_exception, 1)
		self.assertIn("Headcount Exception", [s.authority for s in request.approval_steps])
		cap.reload()
		self.assertEqual((cap.occupied, cap.available, cap.occupancy_basis), (2, -2, "Dated Assignments"))

		self.decide(request.name, "sector")
		self.approve_all(request.name)
		self.assertEqual(self.load(request.name).status, "Approved")

	def test_exception_approval_cannot_cover_later_larger_shortage(self):
		cap = self.configure()
		request = self.request((3,))
		with acting_as(self.users["requester"]):
			request.exception_reason = "Original two-seat shortage"
			request.save()
		self.submit(request.name)
		self.decide(request.name, "sector")
		with acting_as("Administrator"):
			e = self.insert(
				"Employee",
				first_name=self.prefix + "-later",
				gender="Male",
				date_of_birth="1990-01-01",
				date_of_joining=today(),
				company=self.company,
				department=self.department,
				status="Active",
			)
			self.insert(
				"Kandil Position Assignment",
				company=self.company,
				department=self.department,
				branch=cap.branch,
				position=cap.position,
				employee=e.name,
				allocation="Primary",
				valid_from=today(),
			)
		with self.assertRaisesRegex(frappe.ValidationError, "fresh headcount review"):
			self.decide(request.name, "manager")

	def test_authorized_hr_reduction_offsets_later_occupancy_growth(self):
		cap = self.configure(structural=5)
		request = self.request((3,))
		self.submit(request.name)
		self.decide(request.name, "manager")
		line = self.load(request.name).lines[0]
		self.call(
			"hr",
			api.review,
			request.name,
			quantities={line.name: 2},
			priority="Normal",
			reason="Two seats are sufficient",
		)
		with acting_as("Administrator"):
			e = self.insert(
				"Employee",
				first_name=self.prefix + "-after-reduction",
				gender="Male",
				date_of_birth="1990-01-01",
				date_of_joining=today(),
				company=self.company,
				department=self.department,
				status="Active",
			)
			self.insert(
				"Kandil Position Assignment",
				company=self.company,
				department=self.department,
				branch=cap.branch,
				position=cap.position,
				employee=e.name,
				allocation="Primary",
				valid_from=today(),
			)
		self.decide(request.name, "hr")
		self.assertEqual(self.load(request.name).status, "Approved")
		cap.reload()
		self.assertEqual((cap.occupied, cap.open_slots, cap.available), (3, 2, 0))

	def test_block_mode_rejects_stale_zero_three_request(self):
		self.configure()
		with acting_as("Administrator"):
			route = frappe.get_doc("Kandil Recruitment Route", self.route.name)
			route.headcount_mode = "Block"
			route.save()
		request = self.request((3,))
		with acting_as(self.users["requester"]):
			request.exception_reason = "Known shortage"
			request.save()
		with self.assertRaisesRegex(frappe.ValidationError, "blocking"):
			self.submit(request.name)
		self.assertEqual(self.load(request.name).status, "Draft")
		self.assertEqual(frappe.db.get_value("Kandil Capacity", self.capacities[0], "reserved"), 0)

	def test_effective_end_refreshes_cache_availability_and_native_display(self):
		cap = self.configure()
		request = self.request((1,))
		self.submit(request.name)
		with acting_as("Administrator"):
			a = self.assignments[0]
			a.valid_until = today()
			a.save()
		with patch("kandil_hr.organization.occupancy.today_cairo", return_value=add_days(today(), 1)):
			with acting_as(self.users["requester"]):
				caps = lock_capacities(self.load(request.name))
				self.assertEqual((caps[cap.name].occupied, caps[cap.name].available), (1, 1))
				self.assertEqual(occupancy.preview(cap.name)["occupied"], 1)
		cap.reload()
		self.assertEqual((cap.occupied, cap.occupancy_as_of.isoformat()), (1, add_days(today(), 1)))
		self.assertEqual(frappe.db.count("Kandil Position Assignment", {"position": cap.position}), 2)

	def test_assignment_growth_requires_fresh_approval_review(self):
		cap = self.configure()
		request = self.request((1,))
		self.submit(request.name)
		with acting_as("Administrator"):
			e = self.insert(
				"Employee",
				first_name=self.prefix + "-third",
				gender="Male",
				date_of_birth="1990-01-01",
				date_of_joining=today(),
				company=self.company,
				department=self.department,
				status="Active",
			)
			self.insert(
				"Kandil Position Assignment",
				company=self.company,
				department=self.department,
				branch=cap.branch,
				position=cap.position,
				employee=e.name,
				allocation="Primary",
				valid_from=today(),
			)
		with self.assertRaisesRegex(frappe.ValidationError, "fresh headcount review"):
			self.decide(request.name, "manager")
		self.assertEqual(self.load(request.name).approval_steps[0].decision, "Pending")

	def test_unmatched_import_fails_closed_but_release_and_review_are_possible(self):
		cap = self.configure(structural=5)
		request = self.request((1,))
		self.submit(request.name)
		# Simulates a legacy imported baseline that includes one unmapped employee.
		frappe.db.set_value(
			"Kandil Capacity", cap.name, {"occupied": 3, "occupancy_basis": "Legacy Baseline"}
		)
		with self.assertRaisesRegex(frappe.ValidationError, "unmatched occupied baseline"):
			self.decide(request.name, "manager")
		self.call("requester", api.cancel_request, request.name, reason="Release pending reservation")
		self.assertEqual(frappe.db.get_value("Kandil Capacity", cap.name, "reserved"), 0)
		self.assertEqual(frappe.db.get_value("Kandil Capacity", cap.name, "occupied"), 3)
		with acting_as(self.users["sector"]):
			current = occupancy.preview(cap.name)
			self.assertEqual(
				(current["available"], current["assignment_available"], current["unresolved"]), (2, 3, True)
			)
			with self.assertRaises(frappe.TimestampMismatchError):
				occupancy.reconcile_baseline(
					cap.name, current["expected_version"], 99, 3, "Incorrect preview"
				)
			result = occupancy.reconcile_baseline(
				cap.name, current["expected_version"], 2, 3, "Synthetic HR reviewed unmatched baseline"
			)
			self.assertEqual(
				(result["occupied"], result["capacity_occupied"], result["basis"]),
				(2, 2, "Dated Assignments"),
			)
		with acting_as("Administrator"):
			event = frappe.get_doc(
				"Kandil Security Event", {"reference": cap.name, "action": "Occupied baseline reconciled"}
			)
			audit = json.loads(event.changed_fields)
			self.assertEqual(
				(audit["actor"], audit["before"], audit["after"], audit["as_of"]),
				(self.users["sector"], 3, 2, today()),
			)
			self.assertEqual(audit["reason"], "Synthetic HR reviewed unmatched baseline")
			event.changed_fields = "tampered"
			with self.assertRaises(frappe.PermissionError):
				event.save()
			with self.assertRaises(frappe.ValidationError):
				frappe.delete_doc("Kandil Security Event", event.name)
		with acting_as(self.users["requester"]):
			with self.assertRaises(frappe.PermissionError):
				occupancy.reconcile_baseline(
					cap.name, result["expected_version"], 2, 2, "Requester cannot reconcile"
				)


class TestOccupancyJoining(TestJoining):
	def test_other_open_seat_join_preserves_earlier_reservation(self):
		request = self.f.request((3,))
		self.f.submit(request.name)
		self.outcome(self.offer())
		self.f.approve_all(request.name)
		cap = frappe.get_doc("Kandil Capacity", self.f.capacities[0])
		self.assertEqual((cap.occupied, cap.open_slots, cap.available), (1, 4, 0))

	def test_later_exception_topup_does_not_refill_original_joined_cohort(self):
		request = self.f.request((3,))
		self.f.submit(request.name)
		basis = json.loads(self.f.load(request.name).route_snapshot)["headcount_basis"][self.f.capacities[0]]
		# Original open cohort is two; add one by a fully approved exception amendment.
		result = self.f.call("requester", api.amend, self.name, reason="Later extra seat")
		with acting_as(self.f.users["requester"]):
			amendment = self.f.load(result["name"])
			amendment.lines[0].requested_qty = 3
			amendment.exception_reason = "Independent later shortage"
			amendment.save()
		self.f.submit(amendment.name)
		self.f.decide(amendment.name, "sector")
		self.f.approve_all(amendment.name)
		self.outcome(self.offer())
		self.outcome(self.offer())
		self.assertEqual(occupancy.surviving_commitments(self.f.capacities[0], basis), 0)
		# One top-up vacancy remains; it cannot consume the earlier reservation again.
		self.f.approve_all(request.name)
		cap = frappe.get_doc("Kandil Capacity", self.f.capacities[0])
		self.assertEqual((cap.occupied, cap.open_slots, cap.available), (2, 4, -1))


def run():
	import sys

	from kandil_hr.foundation.tests_runner import RecordedResult

	if frappe.local.site != "kandil-parity.localhost" or not frappe.conf.get("allow_tests"):
		raise RuntimeError("Synthetic parity test site required")
	tests = [
		cls(name)
		for cls in (TestOccupancy, TestOccupancyJoining)
		for name in cls.__dict__
		if name.startswith("test_")
	]
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2, resultclass=RecordedResult).run(
		unittest.TestSuite(tests)
	)
	if not result.wasSuccessful() or result.skipped:
		raise AssertionError("Authoritative occupancy integration failed")
	return dict(
		suite="organization-authoritative-occupancy",
		tests_run=result.testsRun,
		successful=True,
		checks=result.checks,
		fixtures_rolled_back=True,
	)
