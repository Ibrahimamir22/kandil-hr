"""Source-directed Board, personal-interest and ordinary audit acceptance.

Synthetic rollback-only checks. No claim of production HR sign-off, authentication
parity or external-anchor tamper evidence is made by these cases.
"""

import hashlib
import json
import unittest
import uuid
from datetime import UTC, datetime
from pathlib import Path

import frappe
from frappe.utils import now_datetime, today

from kandil_hr.organization.api import transition as org_transition
from kandil_hr.recruitment import api, authority
from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as


class TestAuthorityAudit(unittest.TestCase):
	def setUp(self):
		self.f = TestRecruitmentCommands()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()
		for key, role in (
			("ceo", "Kandil CEO Approver"),
			("chair", "Kandil Board Approver"),
			("vice", "Kandil Board Approver"),
			("outsider", "Kandil Requester"),
			("sysmanager", "System Manager"),
			("delegate", "Kandil Approver"),
		):
			name = self.f.prefix.lower() + "-" + key + "@example.invalid"
			self.f.users[key] = name
			self.f.insert(
				"User",
				email=name,
				first_name=key,
				enabled=1,
				send_welcome_email=0,
				user_type="System User",
				roles=[dict(role=role)],
			)
			if key != "outsider":
				self.f.insert(
					"Kandil Access Grant",
					user=name,
					company=self.f.company,
					department=self.f.department,
					valid_from=today(),
					can_manage_recruitment=1,
					can_view_sensitive=1,
					reason="Synthetic authority acceptance",
				)
		settings = frappe.get_doc("Kandil Organization Settings", self.f.company)
		settings.ceo_approver = self.f.users["ceo"]
		settings.board_approver = self.f.users["chair"]
		settings.board_vice_approver = self.f.users["vice"]
		settings.save()
		self.f.route.ceo_approver = self.f.users["ceo"]
		self.f.route.board_approver = self.f.users["chair"]
		self.f.route.board_after_ceo = 1
		self.f.route.ceo_for_critical = 1
		self.f.route.save()

	def request(self, board=True):
		doc = self.f.request((1, 1))
		if board:
			with acting_as(self.f.users["requester"]):
				doc.requested_priority = "Critical"
				doc.save()
		return doc

	def reach_board(self, doc):
		self.f.submit(doc.name)
		for actor in ("manager", "hr", "ceo"):
			self.f.decide(doc.name, actor)
		return self.f.load(doc.name)

	def proof(self, doc):
		with acting_as(self.f.users["sector"]):
			file = frappe.get_doc(
				dict(
					doctype="File",
					file_name=uuid.uuid4().hex + ".txt",
					is_private=1,
					attached_to_doctype=doc.doctype,
					attached_to_name=doc.name,
					content=(
						"Synthetic Board decision proof; no real personal data. " + uuid.uuid4().hex
					).encode(),
				)
			).insert()
		path = Path(file.get_full_path())
		self.addCleanup(lambda: path.unlink(missing_ok=True))
		return file

	def test_acc00302_interested_delegated_actor_cannot_approve_independent_principal(self):
		from kandil_hr.foundation.clock import today_cairo
		from kandil_hr.foundation.delegation import find_delegation

		with acting_as(self.f.users["sector"]):
			grant = frappe.get_doc(
				dict(
					doctype="Kandil Delegation",
					company=self.f.company,
					department=self.f.department,
					from_user=self.f.users["manager"],
					to_user=self.f.users["delegate"],
					from_date=today_cairo(),
					to_date=today_cairo(),
					process_scope="APPROVALS",
					reason="Synthetic independent principal delegates approval",
				)
			).insert()
		self.assertEqual(grant.approval_status, "Active")
		doc = self.request(board=False)
		with acting_as(self.f.users["requester"]):
			doc.beneficiary_user = self.f.users["delegate"]
			doc.save()
		self.f.submit(doc.name)
		doc = self.f.load(doc.name)
		self.assertEqual(doc.approval_steps[0].principal, self.f.users["manager"])
		self.assertIn(self.f.users["delegate"], json.loads(doc.route_snapshot)["interest_snapshot"]["users"])
		with acting_as(self.f.users["delegate"]):
			doc.check_permission("read")
			self.assertEqual(find_delegation(doc, self.f.users["manager"]), grant.name)
		before, counts = doc.as_dict(), self.f.counts(doc.name)
		self.f.ledger((1, 1), (0, 0))
		with self.f.rejected(frappe.PermissionError):
			self.f.decide(doc.name, "delegate")
		self.assertEqual(self.f.load(doc.name).as_dict(), before)
		self.assertEqual(self.f.counts(doc.name), counts)
		self.f.ledger((1, 1), (0, 0))

	def test_brd00101_ceo_precedes_chair_and_replay_is_exact(self):
		doc = self.request()
		self.f.submit(doc.name)
		steps = self.f.load(doc.name).approval_steps
		self.assertEqual(
			[s.authority for s in steps],
			["Department Approval", "HR Approval", "CEO Approval", "Board Approval"],
		)
		with self.f.rejected():
			self.f.call("chair", api.decide, doc.name, decision="Approve", step_id=steps[-1].step_key)
		for actor in ("manager", "hr", "ceo"):
			self.f.decide(doc.name, actor)
		version = str(self.f.load(doc.name).modified)
		command = uuid.uuid4().hex
		first = self.f.decide(doc.name, "chair", command_id=command, expected_version=version)
		counts = self.f.counts(doc.name)
		self.assertEqual(
			json.loads(api.dump(first)),
			self.f.call(
				"chair",
				api.decide,
				doc.name,
				decision="Approve",
				step_id=steps[-1].step_key,
				command_id=command,
				expected_version=version,
			),
		)
		self.assertEqual(counts, self.f.counts(doc.name))
		last = self.f.load(doc.name).approval_steps[-1]
		self.assertEqual((last.actor, last.board_member), (self.f.users["chair"], self.f.users["chair"]))

	def test_brd00101_dated_board_rule_always_adds_ceo_first(self):
		self.f.route.board_after_ceo = 0
		self.f.route.ceo_for_critical = 0
		self.f.route.save()
		self.f.insert(
			"Kandil Authority Rule",
			company=self.f.company,
			department=self.f.department,
			from_date=today(),
			authority="Board Approval",
			principal=self.f.users["chair"],
			enabled=1,
			reason="Synthetic dated Board requirement",
		)
		doc = self.request(board=False)
		self.f.submit(doc.name)
		chain = [s.authority for s in self.f.load(doc.name).approval_steps]
		self.assertIn("CEO Approval", chain)
		self.assertLess(chain.index("CEO Approval"), chain.index("Board Approval"))

	def test_brd00101_vice_frozen_scope_and_deciding_member(self):
		doc = self.reach_board(self.request())
		self.assertEqual(doc.approval_steps[-1].board_vice, self.f.users["vice"])
		from kandil_hr.pilot.navigation import request_actions

		self.assertTrue(
			frappe.db.exists(
				"Kandil Notification Outbox", {"reference_name": doc.name, "recipient": self.f.users["vice"]}
			)
		)
		with acting_as(self.f.users["vice"]):
			from kandil_hr.recruitment.preview import headcount

			actions = request_actions(doc.name)
			self.assertTrue(actions["decide"])
			self.assertFalse(actions["headcount_preview"])
			with self.f.rejected(frappe.PermissionError):
				headcount(doc.name)
			doc.check_permission("read")
			self.assertEqual(
				frappe.get_list(doc.doctype, filters={"name": doc.name}, pluck="name"), [doc.name]
			)
		self.f.decide(doc.name, "vice")
		step = self.f.load(doc.name).approval_steps[-1]
		self.assertEqual(step.principal, self.f.users["chair"])
		self.assertEqual((step.actor, step.board_member), (self.f.users["vice"], self.f.users["vice"]))
		event = frappe.get_last_doc(
			"Kandil Recruitment Event", filters={"request": doc.name, "action": "Approve"}
		)
		self.assertEqual(event.principal, self.f.users["vice"])
		value = json.loads(
			frappe.get_last_doc(
				"Kandil Command Audit", filters={"target_name": doc.name, "operation": "decide"}
			).envelope_json
		)
		self.assertEqual(
			(value["actor"], value["principal"], value["authority_mode"]),
			(self.f.users["vice"], self.f.users["vice"], "direct"),
		)
		self.assertEqual(value["authority"]["frozen_principal"], self.f.users["chair"])
		self.assertEqual(value["authority"]["board_member"], self.f.users["vice"])

	def test_brd00102_sector_recording_needs_method_note_private_proof(self):
		doc = self.reach_board(self.request())
		from kandil_hr.pilot.navigation import request_actions

		with acting_as(self.f.users["sector"]):
			self.assertTrue(request_actions(doc.name)["board_record"])
		args = dict(
			board_member=self.f.users["vice"],
			on_behalf_method="WHATSAPP",
			on_behalf_note="Synthetic Vice approved today",
		)
		with self.f.rejected((frappe.ValidationError, frappe.PermissionError)):
			self.f.decide(doc.name, "sector", **args)
		file = self.proof(doc)
		public = self.proof(doc)
		# Explicit bad legacy fixture: native writes prohibit public HR attachments.
		frappe.db.set_value("File", public.name, "is_private", 0)
		unrelated = self.proof(self.request(board=False))
		with acting_as(self.f.users["sector"]):
			picker = {row["name"] for row in request_actions(doc.name)["board_files"]}
			self.assertIn(file.name, picker)
			self.assertNotIn(public.name, picker)
			self.assertNotIn(unrelated.name, picker)
			self.assertEqual(picker, {file.name})
		with acting_as(self.f.users["requester"]):
			self.assertEqual(request_actions(doc.name)["board_files"], [])
		with self.f.rejected((frappe.ValidationError, frappe.PermissionError)):
			frappe.db.set_value("File", file.name, "is_private", 0)
			self.f.decide(doc.name, "sector", board_evidence=file.name, **args)
		for changed in ({"on_behalf_method": "UNKNOWN"}, {"on_behalf_note": ""}):
			with self.f.rejected((frappe.ValidationError, frappe.PermissionError)):
				self.f.decide(doc.name, "sector", board_evidence=file.name, **{**args, **changed})
		with self.f.rejected(frappe.PermissionError):
			self.f.decide(doc.name, "hr", board_evidence=file.name, **args)
		with acting_as(self.f.users["outsider"]):
			with self.assertRaises(frappe.PermissionError):
				frappe.get_doc("File", file.name).check_permission("read")
		self.f.decide(doc.name, "sector", board_evidence=file.name, **args)
		step = self.f.load(doc.name).approval_steps[-1]
		self.assertEqual(
			(step.actor, step.board_member, step.board_evidence),
			(self.f.users["sector"], self.f.users["vice"], file.name),
		)
		self.assertEqual(
			(step.on_behalf_method, step.on_behalf_note), (args["on_behalf_method"], args["on_behalf_note"])
		)
		value = json.loads(
			frappe.get_last_doc(
				"Kandil Command Audit", filters={"target_name": doc.name, "operation": "decide"}
			).envelope_json
		)
		self.assertEqual(
			(value["actor"], value["principal"], value["authority_mode"]),
			(self.f.users["sector"], self.f.users["vice"], "on_behalf"),
		)
		self.assertEqual(value["authority"]["frozen_principal"], self.f.users["chair"])
		self.assertEqual(value["authority"]["board_evidence"], file.name)
		self.assertEqual(value["payload"]["on_behalf_note"], args["on_behalf_note"])

	def test_req00402_hr_own_position_requires_independent_ceo(self):
		emp = self.f.insert(
			"Employee",
			company=self.f.company,
			department=self.f.department,
			first_name="Synthetic HR own seat",
			gender="Male",
			date_of_birth="1990-01-01",
			date_of_joining=today(),
			user_id=self.f.users["hr"],
			status="Active",
		)
		p = frappe.get_doc("Kandil Position", self.f.positions[0])
		self.f.insert(
			"Kandil Position Assignment",
			company=self.f.company,
			department=self.f.department,
			branch=p.branch,
			position=p.name,
			employee=emp.name,
			user=None,
			allocation="Primary",
			valid_from=today(),
		)
		doc = self.request(board=False)
		self.f.submit(doc.name)
		doc = self.f.load(doc.name)
		self.assertNotIn(self.f.users["hr"], [s.principal for s in doc.approval_steps])
		self.assertIn("CEO Approval", [s.authority for s in doc.approval_steps])
		self.assertIn(self.f.users["hr"], json.loads(doc.route_snapshot)["interest_snapshot"]["users"])
		with self.f.rejected(frappe.PermissionError):
			self.f.decide(doc.name, "hr")

	def test_hc00402_personal_sector_shortage_requires_independent_ceo(self):
		emp = self.f.insert(
			"Employee",
			company=self.f.company,
			department=self.f.department,
			first_name="Synthetic Sector own seat",
			gender="Male",
			date_of_birth="1990-01-01",
			date_of_joining=today(),
			user_id=self.f.users["sector"],
			status="Active",
		)
		position = frappe.get_doc("Kandil Position", self.f.positions[0])
		self.f.insert(
			"Kandil Position Assignment",
			company=self.f.company,
			department=self.f.department,
			branch=position.branch,
			position=position.name,
			employee=emp.name,
			user=self.f.users["sector"],
			allocation="Primary",
			valid_from=today(),
		)
		doc = self.f.request((6, 1))
		with acting_as(self.f.users["requester"]):
			doc.exception_reason = "Synthetic justified shortage requiring independent CEO review"
			doc.save()
		self.f.submit(doc.name)
		doc = self.f.load(doc.name)
		self.assertEqual(doc.needs_exception, 1)
		self.assertNotIn(self.f.users["sector"], [s.principal for s in doc.approval_steps])
		self.assertEqual(
			[s.authority for s in doc.approval_steps],
			["Department Approval", "HR Approval", "CEO Approval", "Board Approval"],
		)
		self.f.ledger((6, 1), (0, 0), (1, 0))
		with self.f.rejected(frappe.PermissionError):
			self.f.decide(doc.name, "sector")
		for actor in ("manager", "hr", "ceo", "chair"):
			self.f.decide(doc.name, actor)
		self.assertEqual(self.f.load(doc.name).status, "Approved")
		self.f.ledger((0, 0), (6, 1), (1, 0))
		self.assertEqual(frappe.get_doc("Kandil Capacity", self.f.capacities[0]).available, -2)

	def test_req00402_creator_and_beneficiary_are_independent_and_frozen(self):
		doc = self.request(board=False)
		with acting_as(self.f.users["requester"]):
			doc.beneficiary_user = self.f.users["manager"]
			doc.save()
		self.f.submit(doc.name)
		doc = self.f.load(doc.name)
		self.assertNotIn(self.f.users["manager"], [s.principal for s in doc.approval_steps])
		frozen = json.loads(doc.route_snapshot)["interest_snapshot"]["users"]
		self.assertIn(self.f.users["manager"], frozen)
		# Explicit creator identity is distinct from requester in the helper contract.
		copy = frappe.copy_doc(doc)
		copy.owner = self.f.users["sector"]
		self.assertIn(self.f.users["sector"], authority.interested_users(copy))
		with self.f.rejected(frappe.PermissionError), acting_as(self.f.users["requester"]):
			doc.beneficiary_user = None
			doc.save()

	def test_req00402_distinct_creator_cannot_become_approval_authority(self):
		# Trusted imported-history fixture only: ordinary insert correctly forces
		# creator=requester, so seed the historical distinct creator at DB level.
		# This does not add or claim a public create-on-behalf endpoint.
		doc = self.request(board=False)
		frappe.db.set_value(doc.doctype, doc.name, "owner", self.f.users["manager"], update_modified=False)
		doc.reload()
		self.assertEqual(doc.owner, self.f.users["manager"])
		self.assertEqual(doc.requested_by, self.f.users["requester"])
		self.f.submit(doc.name)
		doc = self.f.load(doc.name)
		self.assertNotIn(self.f.users["manager"], [s.principal for s in doc.approval_steps])
		self.assertIn(self.f.users["manager"], json.loads(doc.route_snapshot)["interest_snapshot"]["users"])
		with self.f.rejected(frappe.PermissionError):
			self.f.decide(doc.name, "manager")

	def test_req00401_vacant_head_is_recorded_and_hr_notified_once(self):
		assignment = frappe.get_doc("Kandil Position Assignment", {"user": self.f.users["manager"]})
		with org_transition():
			assignment.is_voided = 1
			assignment.void_reason = "Synthetic vacant head"
			assignment.voided_by = frappe.session.user
			assignment.voided_on = now_datetime()
			assignment.save()
		doc = self.request(board=False)
		key = uuid.uuid4().hex
		version = str(doc.modified)
		self.f.submit(doc.name, command_id=key, expected_version=version)
		current = self.f.load(doc.name)
		snapshot = json.loads(current.route_snapshot)
		self.assertTrue(snapshot["resolved"]["skipped"])
		self.assertEqual([s.authority for s in current.approval_steps], ["HR Approval"])
		notices = frappe.get_all(
			"Kandil Notification Outbox",
			filters={
				"reference_name": doc.name,
				"recipient": self.f.users["hr"],
				"subject": "Vacant approval position",
			},
			fields=["name", "body"],
		)
		self.assertEqual(len(notices), 1)
		self.assertIn(assignment.position, notices[0].body)
		self.f.submit(doc.name, command_id=key, expected_version=version)
		self.assertEqual(
			frappe.db.count(
				"Kandil Notification Outbox",
				{"reference_name": doc.name, "subject": "Vacant approval position"},
			),
			1,
		)

	def test_aud00101_actor_principal_revisions_receipt_and_ordinary_immutability(self):
		from frappe.client import delete, save

		doc = self.request(board=False)
		self.f.submit(doc.name)
		before = self.f.load(doc.name).as_dict()
		key = uuid.uuid4().hex
		self.f.decide(doc.name, "manager", command_id=key)
		after = self.f.load(doc.name)
		step = after.approval_steps[0]
		self.assertEqual((step.actor, step.principal), (self.f.users["manager"], self.f.users["manager"]))
		self.assertTrue(step.decided_at)
		self.assertEqual(before["approval_steps"][0]["decision"], "Pending")
		self.assertEqual(step.decision, "Approved")
		receipt = hashlib.sha256(f"{self.f.users['manager']}|{doc.name}|{key}".encode()).hexdigest()
		self.assertTrue(frappe.db.exists("Kandil Command Receipt", receipt))
		previous = frappe.get_last_doc(
			"Kandil Request Revision", filters={"request": doc.name, "action": "Submitted"}
		)
		revision = frappe.get_last_doc(
			"Kandil Request Revision", filters={"request": doc.name, "action": "Approve"}
		)
		self.assertEqual(json.loads(previous.snapshot_json)["approval_steps"][0]["decision"], "Pending")
		self.assertEqual(json.loads(revision.snapshot_json)["approval_steps"][0]["decision"], "Approved")
		self.assertEqual(revision.actor, self.f.users["manager"])
		event = frappe.get_last_doc(
			"Kandil Recruitment Event", filters={"request": doc.name, "action": "Approve"}
		)
		self.assertEqual(event.actor, self.f.users["manager"])
		self.assertEqual(event.principal, step.principal)
		for dt, name in (
			("Kandil Command Receipt", receipt),
			("Kandil Recruitment Event", event.name),
			("Kandil Request Revision", revision.name),
		):
			with acting_as(self.f.users["manager"]):
				with self.f.rejected(frappe.PermissionError):
					save(frappe.get_doc(dt, name).as_dict())
				with self.f.rejected(frappe.PermissionError):
					delete(dt, name)

	def test_aud00202_system_manager_ordinary_save_cannot_fabricate_decision(self):
		from frappe.client import save

		doc = self.request(board=False)
		self.f.submit(doc.name)
		before = self.f.load(doc.name).as_dict()
		counts = self.f.counts(doc.name)
		for actor in (self.f.users["sysmanager"], "Administrator"):
			with acting_as(actor), self.f.rejected(frappe.PermissionError):
				forged = self.f.load(doc.name)
				forged.status = "Approved"
				forged.approval_steps[0].decision = "Approved"
				save(forged.as_dict())
		self.assertEqual(self.f.load(doc.name).as_dict(), before)
		self.assertEqual(self.f.counts(doc.name), counts)


def run():
	import sys

	from kandil_hr.foundation.tests_runner import RecordedResult

	if (
		frappe.local.site != "kandil-parity.localhost"
		or not frappe.conf.get("allow_tests")
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
	):
		raise RuntimeError("Authority checks require isolated parity CLI")
	app = Path(__file__).resolve().parents[1]
	files = [
		app / relative
		for relative in (
			"recruitment/test_authority_audit.py",
			"recruitment/authority.py",
			"recruitment/api.py",
			"recruitment/privacy.py",
			"pilot/permissions.py",
			"pilot/navigation.py",
			"foundation/delegation.py",
		)
	]
	before = {str(p.relative_to(app)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
	suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestAuthorityAudit)
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2, resultclass=RecordedResult).run(suite)
	after = {str(p.relative_to(app)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
	summary = dict(
		suite="authority-audit",
		checked_at=datetime.now(UTC).isoformat(),
		site=frappe.local.site,
		total=result.testsRun,
		successful=result.wasSuccessful() and not result.skipped and result.testsRun == 12,
		checks=result.checks,
		fixtures_rolled_back=True,
		source_hashes=after,
		source_unchanged=before == after,
		limitations=[
			"Source-directed policy; HR deployment sign-off pending",
			"AUD001 exact readable command envelope and external seal are separate; this proves receipt binding and ordinary API immutability",
			"AUD002 Administrator operational-access logging/review remains separate from direct-save denial",
			"UI and actual HTTP proof-file download need separate browser checks",
		],
	)
	if not summary["successful"]:
		print(json.dumps(summary))
		raise AssertionError("Authority audit checks failed")
	return summary
