"""Synthetic native route, policy and headcount contract proof; no lifecycle amendments.

Fixtures are transaction-local. Ordinary users execute requests, decisions and print.
Source policy values absent from frozen snapshots remain an explicit acceptance gap.
"""

import json
import unittest
from datetime import datetime, time, timedelta
from unittest.mock import patch

import frappe
from frappe.utils import today

from kandil_hr.foundation.clock import CAIRO, test_clock, today_cairo
from kandil_hr.organization import occupancy
from kandil_hr.organization.api import transition as org_transition
from kandil_hr.pilot.api import transition
from kandil_hr.recruitment import api
from kandil_hr.recruitment import test_commands as fixtures


class TestRecruitmentContracts(unittest.TestCase):
	def setUp(self):
		self.f = fixtures.TestRecruitmentCommands()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()

	def configure(self, structural, occupied=0):
		with fixtures.acting_as("Administrator"), org_transition(), transition():
			position = frappe.get_doc("Kandil Position", self.f.positions[0])
			position.structural = structural
			position.save()
			cap = frappe.get_doc("Kandil Capacity", self.f.capacities[0])
			cap.structural = structural
			cap.save()
		for i in range(occupied):
			employee = self.f.insert(
				"Employee",
				first_name=f"{self.f.prefix}-occupied-{i}",
				gender="Male",
				date_of_birth="1990-01-01",
				date_of_joining=today(),
				company=self.f.company,
				department=self.f.department,
				status="Active",
			)
			self.f.insert(
				"Kandil Position Assignment",
				company=self.f.company,
				department=self.f.department,
				branch=cap.branch,
				position=cap.position,
				employee=employee.name,
				allocation="Primary",
				valid_from=today(),
			)
		return cap

	def edit(self, doc, **values):
		with fixtures.acting_as(self.f.users["requester"]):
			current = self.f.load(doc.name)
			current.update(values)
			current.save()
		return current

	def mode(self, value):
		with fixtures.acting_as("Administrator"):
			self.f.route.reload()
			self.f.route.headcount_mode = value
			self.f.route.save()

	def ceo(self, key="ceo"):
		user = self.f.insert(
			"User",
			email=f"{self.f.prefix.lower()}-{key}@example.invalid",
			first_name=key,
			enabled=1,
			send_welcome_email=0,
			user_type="System User",
			roles=[{"role": "Kandil CEO Approver"}],
		)
		self.f.users[key] = user.name
		self.f.insert(
			"Kandil Access Grant",
			user=user.name,
			company=self.f.company,
			department=self.f.department,
			valid_from=today(),
			can_manage_recruitment=1,
			reason="Synthetic dated CEO rule fixture",
		)
		settings = frappe.get_doc("Kandil Organization Settings", self.f.company)
		settings.ceo_approver = user.name
		settings.save(ignore_permissions=True)
		return user.name

	def test_hc_003_004_warn_shortage_requires_reason_and_independent_sector(self):
		cap = self.configure(3, occupied=2)
		with fixtures.acting_as(self.f.users["requester"]):
			self.assertEqual(occupancy.preview(cap.name)["available"], 1)
		req = self.f.request((3,))
		self.assertEqual(self.f.load(req.name).lines[0].requested_qty, 3)
		from kandil_hr.recruitment.preview import headcount

		before_preview = self.f.load(req.name).as_dict()
		with fixtures.acting_as(self.f.users["requester"]):
			preview = headcount(req.name)
		self.assertEqual(
			(
				preview["rows"][0]["requested"],
				preview["rows"][0]["available"],
				preview["rows"][0]["shortage"],
				preview["current_mode"],
			),
			(3, 1, 2, "Warn"),
		)
		self.assertEqual(self.f.load(req.name).as_dict(), before_preview)

		counts = self.f.counts(req.name)
		with self.f.rejected(frappe.ValidationError):
			self.f.submit(req.name)
		self.assertEqual(self.f.counts(req.name), counts)
		self.edit(req, exception_reason="Two additional seats require independent review")
		self.f.submit(req.name)
		pending = self.f.load(req.name)
		self.assertEqual(pending.needs_exception, 1)
		with fixtures.acting_as(self.f.users["requester"]):
			preview = headcount(req.name)
		self.assertEqual(
			(
				preview["rows"][0]["available"],
				preview["rows"][0]["shortage"],
				preview["rows"][0]["own_reserved"],
			),
			(1, 2, 3),
		)
		grant = frappe.get_doc("Kandil Access Grant", self.f.grants["requester"])
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		with fixtures.acting_as(self.f.users["requester"]), self.f.rejected(frappe.PermissionError):
			headcount(req.name)

		step = pending.approval_steps[0]
		self.assertEqual((step.authority, step.principal), ("Headcount Exception", self.f.users["sector"]))
		with self.f.rejected(frappe.PermissionError):
			self.f.decide(req.name, "hr")
		self.assertEqual(self.f.load(req.name).approval_steps[0].decision, "Pending")
		self.f.decide(req.name, "sector", comment="Independent sector approves two excess seats")
		step = self.f.load(req.name).approval_steps[0]
		seen = json.loads(step.reviewed_snapshot)
		basis = json.loads(seen["route_snapshot"])["headcount_basis"][cap.name]
		available = basis["structural"] - basis["occupied"] - basis["other_commitments"]
		self.assertEqual(
			(seen["lines"][0]["requested_qty"], available, basis["additional"] - available), (3, 1, 2)
		)
		self.assertEqual(seen["exception_reason"], "Two additional seats require independent review")
		self.assertEqual(
			(step.actor, step.principal, step.decision),
			(self.f.users["sector"], self.f.users["sector"], "Approved"),
		)

	def test_hc_005_01_real_assignments_openings_and_reservations(self):
		cap = self.configure(10, occupied=3)
		opened = self.f.request((2,))
		self.f.submit(opened.name)
		self.f.approve_all(opened.name)
		pending = self.f.request((1,))
		self.f.submit(pending.name)
		with fixtures.acting_as(self.f.users["requester"]):
			self.assertEqual(occupancy.preview(cap.name)["available"], 4)
		before = frappe.get_doc("Kandil Capacity", cap.name)
		self.assertEqual(
			(before.structural, before.occupied, before.open_slots, before.reserved), (10, 3, 2, 1)
		)
		additional = self.f.request((2,))
		self.f.submit(additional.name)
		after = frappe.get_doc("Kandil Capacity", cap.name)
		self.assertEqual((after.occupied, after.open_slots, after.reserved, after.available), (3, 2, 3, 2))
		self.assertEqual(self.f.load(opened.name).lines[0].approved_qty, 2)
		self.assertEqual(self.f.load(pending.name).lines[0].reserved_qty, 1)
		self.assertEqual(self.f.load(additional.name).lines[0].reserved_qty, 2)

	def test_hc_006_same_shortage_block_then_warn_and_frozen_authority(self):
		cap = self.configure(1)
		req = self.edit(self.f.request((3,)), exception_reason="Shortage comparison")
		self.mode("Block")
		counts = self.f.counts(req.name)
		with self.f.rejected(frappe.ValidationError):
			self.f.submit(req.name)
		self.assertEqual(self.f.counts(req.name), counts)
		self.assertEqual(frappe.db.get_value("Kandil Capacity", cap.name, "reserved"), 0)
		self.mode("Warn")
		self.f.submit(req.name)
		self.f.decide(req.name, "sector", comment="Approved under Warn")
		before = self.f.load(req.name)
		frozen = {
			key: before.approval_steps[0].get(key)
			for key in (
				"principal",
				"authority",
				"actor",
				"decision",
				"decided_at",
				"comment",
				"step_key",
				"reviewed_snapshot",
			)
		}
		route = before.route_snapshot
		self.assertEqual(json.loads(route)["policy"]["headcount_mode"], "Warn")
		self.mode("Block")
		self.f.decide(req.name, "manager")
		self.f.decide(req.name, "hr")
		after = self.f.load(req.name)
		self.assertEqual({key: after.approval_steps[0].get(key) for key in frozen}, frozen)
		self.assertEqual(after.route_snapshot, route)
		self.assertEqual(after.status, "Approved")
		future = self.edit(self.f.request((3,)), exception_reason="Future evaluation must Block")
		with self.f.rejected(frappe.ValidationError):
			self.f.submit(future.name)
		self.assertFalse(self.f.load(future.name).approval_steps)
		self.assertEqual(self.f.load(req.name).approval_steps[0].principal, self.f.users["sector"])

	def test_req_005_01_cairo_midnight_rule_boundary(self):
		ceo = self.ceo()
		tomorrow = today_cairo() + timedelta(days=1)
		self.f.insert(
			"Kandil Authority Rule",
			company=self.f.company,
			department=self.f.department,
			from_date=str(tomorrow),
			authority="CEO Approval",
			principal=ceo,
			reason="Future dated rule",
		)
		with patch.dict(frappe.flags, {"in_test": True}):
			with test_clock(datetime.combine(tomorrow, time.min, CAIRO) - timedelta(seconds=1)):
				first = self.f.request((1,))
				self.f.submit(first.name)
				self.assertNotIn(
					"CEO Approval", [s.authority for s in self.f.load(first.name).approval_steps]
				)
			with test_clock(datetime.combine(tomorrow, time.min, CAIRO)):
				second = self.f.request((1,))
				self.f.submit(second.name)
				steps = self.f.load(second.name).approval_steps
				self.assertEqual([s.principal for s in steps if s.authority == "CEO Approval"], [ceo])
		self.assertNotIn("CEO Approval", [s.authority for s in self.f.load(first.name).approval_steps])

	def test_req_005_02_hr_routing_reason_and_pending_principal_stability(self):
		ceo = self.ceo()
		req = self.f.request((1,))
		self.f.submit(req.name)
		with self.f.rejected(frappe.PermissionError):
			self.f.call("hr", api.send_to_ceo, req.name, reason="Wrong stage")
		self.f.decide(req.name, "manager")
		with self.f.rejected(frappe.ValidationError):
			self.f.call("hr", api.send_to_ceo, req.name, reason="")
		self.f.call("hr", api.send_to_ceo, req.name, reason="CEO budget decision required")
		self.assertTrue(
			frappe.db.exists("Kandil Request Revision", {"request": req.name, "action": "Routed to CEO"})
		)
		before = self.f.load(req.name)
		ceo_step = next(s for s in before.approval_steps if s.authority == "CEO Approval")
		self.assertEqual(ceo_step.principal, ceo)
		new_ceo = self.ceo("replacement_ceo")
		# Trusted fixture emulates a subsequently approved structural revision. The
		# separate organization suite proves that approval workflow itself.
		with org_transition():
			edge = frappe.get_doc("Kandil Position Hierarchy", {"position": self.f.positions[0]})
			edge.parent_position = None
			edge.save(ignore_permissions=True)

		self.f.decide(req.name, "hr")
		with self.f.rejected(frappe.PermissionError):
			self.f.decide(req.name, "replacement_ceo")
		self.assertEqual(
			next(s for s in self.f.load(req.name).approval_steps if s.decision == "Pending").principal, ceo
		)
		self.f.decide(req.name, "ceo")
		self.assertEqual(self.f.load(req.name).status, "Approved")
		future = self.f.request((1,))
		self.f.submit(future.name)
		self.assertEqual(self.f.load(future.name).approval_steps[0].authority, "HR Approval")
		self.f.call("hr", api.send_to_ceo, future.name, reason="New CEO for future request")
		self.assertEqual(self.f.load(future.name).approval_steps[-1].principal, new_ceo)

	def test_req_009_snapshot_preserves_exact_revision_quantity_authority(self):
		req = self.f.request((2, 1))
		self.f.submit(req.name)
		self.f.decide(req.name, "manager", comment="Reviewed original quantities")
		step = self.f.load(req.name).approval_steps[0]
		original = step.reviewed_snapshot
		payload = json.loads(original)
		self.assertEqual(payload["revision"], 1)
		self.assertEqual(json.loads(payload["route_snapshot"])["policy"]["headcount_mode"], "Warn")
		self.mode("Block")
		self.assertEqual([line["proposed_qty"] for line in payload["lines"]], [2, 1])
		self.assertEqual(payload["approval_steps"][0]["principal"], self.f.users["manager"])
		self.assertEqual(payload["approval_steps"][0]["authority"], "Department Approval")
		self.f.call(
			"hr",
			api.review,
			req.name,
			quantities={},
			priority="Critical",
			reason="Priority changed after manager decision",
		)
		self.assertEqual(self.f.load(req.name).approval_steps[0].reviewed_snapshot, original)
		self.assertEqual(json.loads(original)["hr_priority"], "Normal")

	def test_req_006_hr_stage_gates_and_reason_for_each_action(self):
		self.ceo()
		for decision in ("Approve", "Reject", "Return"):
			req = self.f.request((1,))
			self.f.submit(req.name)
			with self.f.rejected(frappe.PermissionError):
				self.f.decide(req.name, "hr", decision, comment="Premature")
			with self.f.rejected(frappe.PermissionError):
				self.f.call(
					"hr", api.review, req.name, quantities={}, priority="Important", reason="Premature"
				)
			self.f.decide(req.name, "manager")
			self.f.call(
				"hr",
				api.review,
				req.name,
				quantities={},
				priority="Important",
				reason="Authorized priority review",
			)
			if decision != "Approve":
				with self.f.rejected(frappe.ValidationError):
					self.f.decide(req.name, "hr", decision, comment="")
			self.f.decide(req.name, "hr", decision, comment="HR documented decision")
			self.assertEqual(
				self.f.load(req.name).status,
				{"Approve": "Approved", "Reject": "Rejected", "Return": "Returned"}[decision],
			)
			with self.f.rejected(frappe.PermissionError):
				self.f.call("hr", api.review, req.name, quantities={}, priority="Normal", reason="Too late")

	def test_req_002_01_native_form_roundtrip_and_print(self):
		from frappe.client import get
		from frappe.www.printview import get_html_and_style

		replacement = self.f.insert(
			"Employee",
			first_name=self.f.prefix + " replacement",
			gender="Male",
			date_of_birth="1990-01-01",
			date_of_joining=today(),
			company=self.f.company,
			department=self.f.department,
			status="Active",
		)
		req = self.f.request((2, 1))
		fields = dict(
			need_reason="Replacement",
			replacement_employee=replacement.name,
			employment_type="Contract fixed term",
			required_by="2026-12-17",
			qualifications="Mechanical diploma",
			skills_required="Precision welding",
			experience_required="Five years fabrication",
			working_conditions="Day shift workshop",
			exception_reason="Replacement and capacity continuity",
		)
		self.edit(req, **fields)
		with fixtures.acting_as(self.f.users["requester"]):
			loaded = get("Kandil Hiring Request", req.name)
			for key, value in fields.items():
				self.assertEqual(str(loaded[key]), value)
			self.assertEqual(loaded["requested_position"], self.f.positions[0])
			self.assertEqual([row["requested_qty"] for row in loaded["lines"]], [2, 1])
			self.assertEqual([row["capacity"] for row in loaded["lines"]], self.f.capacities)
			html = get_html_and_style("Kandil Hiring Request", req.name)["html"]
			for key in (
				"employment_type",
				"qualifications",
				"skills_required",
				"experience_required",
				"working_conditions",
				"exception_reason",
			):
				self.assertIn(fields[key], html)
			self.assertIn(replacement.name, html)
			self.assertIn(frappe.utils.formatdate(fields["required_by"]), html)
			from bs4 import BeautifulSoup

			soup = BeautifulSoup(html, "html.parser")
			self.assertIn(
				self.f.positions[0],
				soup.select_one('[data-fieldname="requested_position"] .value').get_text(),
			)
			for cap, qty in zip(self.f.capacities, (2, 1), strict=True):
				branch = frappe.db.get_value("Kandil Capacity", cap, "branch")
				rows = [row for row in soup.select("tr") if branch in row.get_text()]
				self.assertEqual(len(rows), 1)
				self.assertIn(str(qty), [cell.get_text(strip=True) for cell in rows[0].select("td")])

	def test_preview_incremental_demand_for_approved_and_amendment(self):
		from kandil_hr.recruitment.preview import headcount

		self.configure(3)
		parent = self.f.request((2,))
		self.f.submit(parent.name)
		self.f.approve_all(parent.name)
		with fixtures.acting_as(self.f.users["requester"]):
			preview = headcount(parent.name)["rows"][0]
		self.assertEqual(
			(preview["requested"], preview["incremental_demand"], preview["available"], preview["shortage"]),
			(2, 0, 1, 0),
		)
		amended = self.f.call("requester", api.amend, parent.name, reason="Additional seat preview")
		name = amended["name"]
		with fixtures.acting_as(self.f.users["requester"]):
			doc = self.f.load(name)
			doc.lines[0].requested_qty = 3
			doc.save()
			before = self.f.counts(name)
			preview = headcount(name)["rows"][0]
			self.assertEqual(
				(
					preview["requested"],
					preview["incremental_demand"],
					preview["available"],
					preview["shortage"],
				),
				(3, 1, 1, 0),
			)
			self.assertEqual(self.f.counts(name), before)
		self.f.submit(name)
		with fixtures.acting_as(self.f.users["requester"]):
			preview = headcount(name)["rows"][0]
		self.assertEqual(
			(
				preview["requested"],
				preview["incremental_demand"],
				preview["available"],
				preview["shortage"],
				preview["own_reserved"],
			),
			(3, 1, 1, 0, 1),
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
		raise RuntimeError("Contract checks require opted-in parity CLI")
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2, resultclass=RecordedResult).run(
		unittest.defaultTestLoader.loadTestsFromTestCase(TestRecruitmentContracts)
	)
	value = dict(
		suite="recruitment-contracts",
		total=result.testsRun,
		successful=result.wasSuccessful() and not result.skipped and result.testsRun == 9,
		failures=len(result.failures),
		errors=len(result.errors),
		skipped=len(result.skipped),
		checks=result.checks,
		fixtures_rolled_back=True,
	)
	print(json.dumps(value))
	if not value["successful"]:
		raise AssertionError("Contract checks failed or skipped")
	return value
