"""Exact policy-independent P3 acceptance gaps; synthetic and rollback-only."""

import json
import unittest
import uuid
from collections import Counter
from datetime import date

import frappe
from frappe.utils import add_days, date_diff, today

from kandil_hr.recruitment import test_commands as fixtures
from kandil_hr.recruitment.priority import score


class TestRecruitmentAcceptance(unittest.TestCase):
	def setUp(self):
		self.f = fixtures.TestRecruitmentCommands()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()

	def test_hc_003_02_invalid_quantities_never_change_ledger(self):
		# Native JSON document path must reject fractions before Int serialization.
		from frappe.client import save

		req = self.f.request()
		for qty in (0, -1, 1.5):
			with self.subTest(quantity=qty):
				before = self.f.load(req.name).as_dict()
				counts = self.f.counts(req.name)
				payload = self.f.load(req.name).as_dict()
				payload["lines"][0]["requested_qty"] = qty
				with self.f.rejected(), fixtures.acting_as(self.f.users["requester"]):
					save(json.dumps(payload, default=str))
				self.assertEqual(self.f.load(req.name).as_dict(), before)
				self.assertEqual(self.f.counts(req.name), counts)
				self.f.ledger((0, 0), (0, 0))

	def test_req_003_02_duplicate_location_rejected_before_reservation(self):
		req = self.f.request()
		before = self.f.load(req.name).as_dict()
		counts = self.f.counts(req.name)
		with self.f.rejected(), fixtures.acting_as(self.f.users["requester"]):
			doc = self.f.load(req.name)
			doc.append("lines", dict(capacity=self.f.capacities[0], requested_qty=1))
			doc.save()
		self.assertEqual(self.f.load(req.name).as_dict(), before)
		self.assertEqual(self.f.counts(req.name), counts)
		self.f.ledger((0, 0), (0, 0))

	def test_org_005_01_inclusive_ninety_days_and_self_delegation(self):
		def create(days, target):
			with fixtures.acting_as(self.f.users["sector"]):
				return frappe.get_doc(
					dict(
						doctype="Kandil Delegation",
						company=self.f.company,
						department=self.f.department,
						from_user=self.f.users["sector"],
						to_user=target,
						from_date=today(),
						to_date=add_days(today(), days - 1),
						reason="Synthetic bounded delegation",
					)
				).insert()

		valid = create(90, self.f.users["manager"])
		saved = frappe.get_doc("Kandil Delegation", valid.name)
		self.assertEqual(date_diff(saved.to_date, saved.from_date) + 1, 90)
		self.assertEqual(saved.revoked, 0)
		count = frappe.db.count("Kandil Delegation", {"department": self.f.department})
		with self.f.rejected():
			create(91, self.f.users["manager"])
		with self.f.rejected():
			create(90, self.f.users["sector"])
		self.assertEqual(frappe.db.count("Kandil Delegation", {"department": self.f.department}), count)

	def test_pri_001_02_pin_authority_reason_and_original_score_history(self):
		name, opening, vacancies = self.f.vacancy_fixture()
		with fixtures.acting_as(self.f.users["hr"]):
			prior_rank = next(r["priority"] for r in vacancies.queue() if r["name"] == opening)
		self.assertEqual(prior_rank["score"], 20)
		before = frappe.get_doc("Job Opening", opening).as_dict()
		counts = self.f.counts(name)
		with self.f.rejected(frappe.PermissionError):
			self.f.call(
				"requester",
				vacancies.pin,
				name,
				opening_name=opening,
				pin_until=today(),
				reason="Unauthorized pin",
			)
		with self.f.rejected():
			self.f.call("hr", vacancies.pin, name, opening_name=opening, pin_until=today(), reason="")
		self.assertEqual(frappe.get_doc("Job Opening", opening).as_dict(), before)
		self.assertEqual(self.f.counts(name), counts)
		self.f.call(
			"hr",
			vacancies.pin,
			name,
			opening_name=opening,
			pin_until=today(),
			reason="Documented synthetic urgency",
		)
		doc = self.f.load(name)
		self.assertEqual(doc.requested_priority, "Normal")
		self.assertEqual(frappe.db.get_value("Job Opening", opening, "custom_kandil_priority_score"), 120)
		revision = frappe.get_all(
			"Kandil Request Revision",
			filters={"request": name, "action": "Vacancy priority changed"},
			fields=["name", "snapshot_json"],
			order_by="creation desc",
			limit=1,
		)[0]
		payload = json.loads(revision.snapshot_json)
		self.assertEqual(payload["requested_priority"], "Normal")
		note = json.loads(payload["decision_note"])
		self.assertEqual(note["reason"], "Documented synthetic urgency")
		self.assertEqual(note["before"]["custom_kandil_priority_score"], prior_rank["score"])
		self.assertEqual(note["after"]["custom_kandil_priority_score"], 120)
		self.f.call(
			"hr", vacancies.pin, name, opening_name=opening, pin_until=None, reason="Remove synthetic urgency"
		)
		self.assertEqual(
			frappe.db.get_value("Kandil Request Revision", revision.name, "snapshot_json"),
			revision.snapshot_json,
		)
		self.assertEqual(self.f.load(name).requested_priority, "Normal")

	def test_req_008_01_returned_revision_remains_readable_and_immutable(self):
		from frappe.client import delete, get, save

		from kandil_hr.recruitment import api

		req = self.f.request()
		self.f.submit(req.name)
		original_steps = [step.step_key for step in self.f.load(req.name).approval_steps]
		self.f.decide(req.name, "manager", decision="Return", comment="Clarify second location")
		original_rows = frappe.get_all(
			"Kandil Request Revision", filters={"request": req.name}, fields=["name", "snapshot_json"]
		)
		self.assertEqual(len(original_rows), 2)
		returned = next(
			json.loads(row.snapshot_json)
			for row in original_rows
			if json.loads(row.snapshot_json)["status"] == "Returned"
		)
		self.assertEqual(returned["approval_steps"][0]["comment"], "Clarify second location")
		self.assertEqual(returned["approval_steps"][0]["decision"], "Returned")
		self.f.call("requester", api.revise, req.name, reason="Clarified second location")
		with fixtures.acting_as(self.f.users["requester"]):
			doc = self.f.load(req.name)
			doc.lines[1].requested_qty = 2
			doc.save()
		self.f.submit(req.name)
		current = self.f.load(req.name)
		self.assertEqual(current.revision, 2)
		self.assertEqual([row.requested_qty for row in current.lines], [2, 2])
		self.assertFalse(set(original_steps) & {step.step_key for step in current.approval_steps})
		for role in ("requester", "manager", "hr"):
			with fixtures.acting_as(self.f.users[role]):
				for row in original_rows:
					readable = get("Kandil Request Revision", row.name)
					self.assertEqual(readable["snapshot_json"], row.snapshot_json)
					payload = json.loads(readable["snapshot_json"])
					self.assertEqual(payload["revision"], 1)
					self.assertEqual([step["step_key"] for step in payload["approval_steps"]], original_steps)
		# Native endpoint writes are denied even to Administrator; business history
		# is immutable independently of ordinary role permission configuration.
		for actor in (self.f.users["requester"], "Administrator"):
			with fixtures.acting_as(actor):
				row = frappe.get_doc("Kandil Request Revision", original_rows[0].name).as_dict()
				row["snapshot_json"] = "{}"
				with self.f.rejected(frappe.PermissionError):
					save(json.dumps(row, default=str))
				with self.f.rejected(frappe.PermissionError):
					delete("Kandil Request Revision", original_rows[0].name)
		for row in original_rows:
			self.assertEqual(
				frappe.db.get_value("Kandil Request Revision", row.name, "snapshot_json"), row.snapshot_json
			)

	def test_req_007_01_every_requester_notice_once_including_replay(self):
		from kandil_hr.recruitment import api

		def verify(name, actor, method, recipients, **values):
			before = set(
				frappe.get_all("Kandil Notification Outbox", filters={"reference_name": name}, pluck="name")
			)
			values.update(command_id=uuid.uuid4().hex, expected_version=str(self.f.load(name).modified))
			result = self.f.call(actor, method, name, **values)
			after = frappe.get_all(
				"Kandil Notification Outbox",
				filters={"reference_name": name},
				fields=["name", "recipient", "reference_doctype", "reference_name"],
			)
			new = [row for row in after if row.name not in before]
			self.assertEqual(
				Counter(row.recipient for row in new), Counter(self.f.users[key] for key in recipients)
			)
			self.assertTrue(
				all(
					row.reference_doctype == "Kandil Hiring Request" and row.reference_name == name
					for row in new
				)
			)
			counts = self.f.counts(name)
			replay = self.f.call(actor, method, name, **values)
			self.assertEqual(api.dump(replay), api.dump(result))
			self.assertEqual(self.f.counts(name), counts)

		def decide(name, actor, decision="Approve"):
			step = next(step for step in self.f.load(name).approval_steps if step.decision == "Pending")
			recipients = (
				["requester", "hr"] if actor == "manager" and decision == "Approve" else ["requester"]
			)
			verify(
				name,
				actor,
				api.decide,
				recipients,
				decision=decision,
				step_id=step.step_key,
				comment="Synthetic notice proof",
			)

		req = self.f.request()
		verify(req.name, "requester", api.submit_request, ["requester", "manager"])
		decide(req.name, "manager")
		verify(
			req.name,
			"hr",
			api.review,
			["requester", "hr"],
			quantities={},
			priority="Important",
			reason="Synthetic HR edit",
		)
		decide(req.name, "hr")
		verify(req.name, "requester", api.cancel_request, ["requester"], reason="Synthetic cancellation")
		# Cover each non-approval decision at both ordinary approval authorities.
		for actor in ("manager", "hr"):
			for decision in ("Reject", "Return"):
				other = self.f.request()
				verify(other.name, "requester", api.submit_request, ["requester", "manager"])
				if actor == "hr":
					decide(other.name, "manager")
				decide(other.name, actor, decision)
		self.f.ledger((0, 0), (0, 0))


class TestPriorityAcceptance(unittest.TestCase):
	def test_pri_001_01_full_weight_fixture_is_deterministic(self):
		# Critical60 + age61days40 + overdue1day30 + inclusive pin100 =230.
		expected = dict(
			score=230,
			age_days=61,
			due_days=-1,
			parts=[
				{"reason": "classification", "points": 60},
				{"reason": "age", "points": 40},
				{"reason": "due date", "points": 30},
				{"reason": "temporary pin", "points": 100},
			],
		)
		for _ in range(10):
			self.assertEqual(
				score(
					"Critical", date(2026, 8, 12), date(2026, 10, 11), date(2026, 10, 12), date(2026, 10, 12)
				),
				expected,
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
		raise RuntimeError("Acceptance checks require the opted-in parity CLI site")
	suite = unittest.TestSuite(
		unittest.defaultTestLoader.loadTestsFromTestCase(case)
		for case in (TestRecruitmentAcceptance, TestPriorityAcceptance)
	)
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2, resultclass=RecordedResult).run(suite)
	summary = dict(
		suite="recruitment-acceptance",
		total=result.testsRun,
		native_db=6,
		pure=1,
		successful=result.wasSuccessful() and not result.skipped and result.testsRun == 7,
		failures=len(result.failures),
		errors=len(result.errors),
		skipped=len(result.skipped),
		checks=result.checks,
		fixtures_rolled_back=True,
	)
	print(json.dumps(summary))
	if not summary["successful"]:
		raise AssertionError("Recruitment acceptance checks failed or skipped")
	return summary
