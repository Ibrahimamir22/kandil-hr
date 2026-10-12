"""Personal-session portal API checks; synthetic fixtures and SQL rollback only.

These checks call native server methods as ordinary users. They do not prove HTTP
session/CSRF behavior or browser rendering; those require the separate portal lane.
"""

import copy
import json
import unittest
import uuid
from unittest.mock import patch

import frappe

from kandil_hr.portal import api
from kandil_hr.recruitment import test_commands as fixtures


class TestPortalAPI(unittest.TestCase):
	def setUp(self):
		self.f = fixtures.TestRecruitmentCommands()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()

	def payload(self):
		return dict(
			company=self.f.company,
			department=self.f.department,
			title=self.f.prefix + " portal request",
			requested_position=self.f.positions[0],
			need_reason="Expansion",
			requested_priority="Normal",
			lines=[dict(capacity=self.f.capacities[0], requested_qty=2)],
		)

	def save(self, payload=None, key="requester", **values):
		values.setdefault("command_id", uuid.uuid4().hex)
		with fixtures.acting_as(self.f.users[key]):
			return api.save_draft(payload=self.payload() if payload is None else payload, **values)

	def replace_requester_grant(self, **changes):
		old = frappe.get_doc("Kandil Access Grant", self.f.grants["requester"])
		old.revoked = 1
		old.save(ignore_permissions=True)
		values = dict(
			user=old.user, company=old.company, department=old.department,
			valid_from=old.valid_from, reason="Synthetic portal scope replacement",
			can_manage_recruitment=1, can_view_sensitive=1,
		)
		values.update(changes)
		self.f.grants["requester"] = self.f.insert("Kandil Access Grant", **values).name

	def test_create_and_exact_replay_have_one_document_and_effect(self):
		command = uuid.uuid4().hex
		first = self.save(command_id=command)
		before = self.f.load(first["name"]).as_dict()
		counts = self.f.counts(first["name"])
		replay = self.save(command_id=command)
		self.assertEqual(frappe.as_json(first), frappe.as_json(replay))
		self.assertEqual(self.f.load(first["name"]).as_dict(), before)
		self.assertEqual(self.f.counts(first["name"]), counts)
		self.assertEqual(frappe.db.count("Kandil Hiring Request", {"department": self.f.department}), 1)
		self.assertEqual(before.requested_by, self.f.users["requester"])
		self.assertEqual(before.status, "Draft")
		self.f.ledger((0, 0), (0, 0))

	def test_same_command_changed_payload_is_rejected_without_mutation(self):
		command = uuid.uuid4().hex
		first = self.save(command_id=command)
		before = self.f.load(first["name"]).as_dict()
		counts = self.f.counts(first["name"])
		payload = self.payload()
		payload["title"] += " changed"
		with self.f.rejected():
			self.save(payload, command_id=command)
		self.assertEqual(self.f.load(first["name"]).as_dict(), before)
		self.assertEqual(self.f.counts(first["name"]), counts)

	def test_protected_request_and_line_fields_are_rejected(self):
		for field, value in (("requested_by", self.f.users["hr"]), ("status", "Approved"), ("revision", 9)):
			with self.subTest(field=field), self.f.rejected():
				self.save(self.payload() | {field: value})
		for field in ("approved_qty", "reserved_qty", "joined_qty", "job_opening"):
			payload = self.payload()
			payload["lines"][0][field] = 1
			with self.subTest(line_field=field), self.f.rejected():
				self.save(payload)
		self.assertEqual(frappe.db.count("Kandil Hiring Request", {"department": self.f.department}), 0)
		self.f.ledger((0, 0), (0, 0))

	def test_edit_preserves_line_identity_and_stale_save_is_rejected(self):
		first = self.save()
		payload = self.payload()
		payload["title"] += " updated"
		payload["lines"][0]["requested_qty"] = 3
		updated = self.save(payload, name=first["name"], expected_version=first["modified"])
		self.assertEqual(updated["quantity"], 3)
		self.assertEqual(updated["lines"][0]["name"], first["lines"][0]["name"])
		before = self.f.load(first["name"]).as_dict()
		with self.f.rejected(frappe.TimestampMismatchError):
			self.save(self.payload(), name=first["name"], expected_version=first["modified"])
		self.assertEqual(self.f.load(first["name"]).as_dict(), before)
		self.f.ledger((0, 0), (0, 0))

	def test_scoped_manager_cannot_edit_requesters_draft(self):
		first = self.save()
		before = self.f.load(first["name"]).as_dict()
		with self.f.rejected(frappe.PermissionError):
			self.save(key="manager", name=first["name"], expected_version=first["modified"])
		self.assertEqual(self.f.load(first["name"]).as_dict(), before)

	def test_branch_choices_and_write_scope_match(self):
		self.replace_requester_grant(
			branch=frappe.db.get_value("Kandil Capacity", self.f.capacities[0], "branch")
		)
		with fixtures.acting_as(self.f.users["requester"]):
			choices = api.choices()
		self.assertEqual({row["id"] for row in choices["capacities"]}, {self.f.capacities[0]})
		self.assertEqual({row["id"] for row in choices["positions"]}, {self.f.positions[0]})
		payload = self.payload()
		payload["lines"][0]["capacity"] = self.f.capacities[1]
		with self.f.rejected(frappe.PermissionError):
			self.save(payload)
		self.assertEqual(frappe.db.count("Kandil Hiring Request", {"department": self.f.department}), 0)

	def test_revoked_grant_removes_choices_read_and_replay(self):
		command = uuid.uuid4().hex
		first = self.save(command_id=command)
		grant = frappe.get_doc("Kandil Access Grant", self.f.grants["requester"])
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		with fixtures.acting_as(self.f.users["requester"]):
			choices = api.choices()
			self.assertEqual(choices["positions"], [])
			self.assertEqual(choices["capacities"], [])
			with self.f.rejected(frappe.PermissionError):
				api.detail(first["name"])
		with self.f.rejected(frappe.PermissionError):
			self.save(command_id=command)

	def test_read_only_grant_can_read_but_not_create_or_edit(self):
		first = self.save()
		self.replace_requester_grant(can_manage_recruitment=0)
		with fixtures.acting_as(self.f.users["requester"]):
			detail = api.detail(first["name"])
			self.assertEqual(detail["request"]["name"], first["name"])
			self.assertFalse(detail["actions"]["edit"])
			# CLI has no HTTP session_obj; real session/CSRF is tested in test_http.py.
			with patch("frappe.sessions.get_csrf_token", return_value="cli-not-a-session-token"):
				self.assertFalse(api.bootstrap()["can_create"])
			self.assertEqual(api.choices()["capacities"], [])
		with self.f.rejected(frappe.PermissionError):
			self.save()
		with self.f.rejected(frappe.PermissionError):
			self.save(name=first["name"], expected_version=first["modified"])

	def test_overview_detail_are_scoped_and_project_only_public_fields(self):
		first = self.save()
		with fixtures.acting_as(self.f.users["requester"]):
			result = api.overview()
			detail = api.detail(first["name"])
		self.assertEqual({row["name"] for row in result["requests"]}, {first["name"]})
		self.assertEqual(result["counts"]["requests"], 1)
		self.assertEqual(result["count_scope"], "page")
		self.assertEqual(result["approvals"], [])
		self.assertTrue(detail["actions"]["edit"])
		self.assertLessEqual(set(detail["request"]), set(api.REQUEST_FIELDS) | {"quantity", "lines", "approval_steps"})
		self.assertNotIn("snapshot_json", json.dumps(detail, default=str))
		grant = frappe.get_doc("Kandil Access Grant", self.f.grants["hr"])
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		with fixtures.acting_as(self.f.users["hr"]):
			self.assertEqual(api.overview()["requests"], [])
			with self.f.rejected(frappe.PermissionError):
				api.detail(first["name"])

	def test_approval_uses_existing_commands_and_pending_draft_edit_fails(self):
		first = self.save()
		self.f.submit(first["name"])
		with fixtures.acting_as(self.f.users["manager"]):
			view = api.detail(first["name"])
			self.assertTrue(view["actions"]["decide"])
			self.assertIn(first["name"], {row["name"] for row in api.overview()["approvals"]})
		before = self.f.load(first["name"]).as_dict()
		with self.f.rejected():
			self.save(copy.deepcopy(self.payload()), name=first["name"], expected_version=str(before.modified))
		self.assertEqual(self.f.load(first["name"]).as_dict(), before)
		self.f.approve_all(first["name"])
		with fixtures.acting_as(self.f.users["requester"]):
			view = api.detail(first["name"])
		self.assertFalse(view["actions"]["edit"])
		self.assertFalse(view["actions"]["decide"])
		self.assertTrue(self.f.load(first["name"]).lines[0].job_opening)


	def test_pending_quantity_capability_is_requester_only_and_projects_current_quantities(self):
		request = self.save()
		self.f.submit(request["name"])
		with fixtures.acting_as(self.f.users["requester"]):
			view = api.detail(request["name"])
		self.assertTrue(view["actions"]["revise_pending_quantities"])
		self.assertEqual(view["request"]["lines"][0]["proposed_qty"], 2)
		with fixtures.acting_as(self.f.users["hr"]):
			self.assertFalse(api.detail(request["name"])["actions"]["revise_pending_quantities"])
		self.f.approve_all(request["name"])
		with fixtures.acting_as(self.f.users["requester"]):
			self.assertFalse(api.detail(request["name"])["actions"]["revise_pending_quantities"])


def run():
	import sys

	from kandil_hr.foundation.tests_runner import RecordedResult

	if (
		frappe.local.site != "kandil-parity.localhost"
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
		or not all(frappe.conf.get(key) for key in (
			"allow_tests", "kandil_pilot_enabled", "kandil_foundation_enabled", "kandil_parity_enabled",
		))
	):
		raise RuntimeError("Portal checks require the opted-in Administrator parity CLI")
	suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestPortalAPI)
	if suite.countTestCases() != 11:
		raise AssertionError("Expected eleven explicit portal checks")
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2, resultclass=RecordedResult).run(suite)
	summary = dict(
		suite="portal-api", total=result.testsRun, native_db=11, pure=0,
		successful=result.wasSuccessful() and not result.skipped and result.testsRun == 11,
		failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped),
		checks=result.checks, fixtures_rolled_back=True,
	)
	print(json.dumps(summary))
	if not summary["successful"]:
		raise AssertionError("Portal checks failed or skipped")
	return summary
