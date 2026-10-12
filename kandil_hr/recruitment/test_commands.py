"""Native ORM command tests on an isolated, explicitly opted-in synthetic site.

No network, external providers, commits, migrations or production data. Each case
creates its own role accounts, scoped grants, hierarchy and two capacity ledgers,
then rolls back. Structural fixture setup uses the internal organization context;
the REQUEST actions under test run as real ordinary users with native permissions.

bench --site kandil-parity.localhost execute kandil_hr.recruitment.test_commands.run

The site needs allow_tests=1, installed/migrated HRMS + kandil_hr, all Kandil roles,
and an existing synthetic Company whose name contains TEST. HTTP authentication,
concurrency between DB connections and browser rendering need separate suites.
"""

import json
import unittest
import uuid
from contextlib import contextmanager
from datetime import UTC
from unittest.mock import patch

import frappe
from frappe.utils import today

from kandil_hr.organization.api import transition as organization_transition
from kandil_hr.recruitment import api


@contextmanager
def acting_as(user):
	before = frappe.session.user
	frappe.set_user(user)
	try:
		yield
	finally:
		frappe.set_user(before)


class TestRecruitmentCommands(unittest.TestCase):
	def setUp(self):
		if not frappe.conf.get("allow_tests") or "parity" not in str(frappe.local.site):
			self.skipTest("Requires explicitly opted-in isolated parity site")
		self.original_user = frappe.session.user
		self.flags_patch = patch.dict(
			frappe.conf,
			{
				"kandil_pilot_enabled": 1,
				"kandil_foundation_enabled": 1,
				"kandil_parity_enabled": 1,
				"mute_emails": 1,
			},
		)
		self.flags_patch.start()
		self.addCleanup(self.flags_patch.stop)
		self.addCleanup(frappe.set_user, self.original_user)
		frappe.set_user("Administrator")
		self.point = "recruitment_" + uuid.uuid4().hex
		# Frappe savepoint rollback only restores SQL; prevent User/contact and
		# other after-commit callbacks for rolled-back fixture rows from leaking
		# into bench.execute's final commit. Preserve pre-existing callbacks.
		self.after_commit_count = len(frappe.db.after_commit)
		frappe.db.savepoint(self.point)
		self.addCleanup(self.rollback)
		self.company = frappe.db.exists("Company", "Kandil PARITY TEST A")
		if not self.company:
			self.skipTest("Seed a synthetic TEST company on the isolated parity site")
		self.prefix = "REC-" + uuid.uuid4().hex[:10]
		self.department = self.insert("Department", department_name=self.prefix, company=self.company).name
		self.designation = self.insert("Designation", designation_name=self.prefix).name
		self.users, self.grants = {}, {}
		for key, roles in {
			"requester": ["Kandil Requester"],
			# Give manager both native roles so the consecutive-same-person test
			# can use Department + HR authority without changing account roles.
			"manager": ["Kandil Approver", "Kandil Recruiter"],
			"hr": ["Kandil Recruiter"],
			"sector": ["Kandil Sector Approver", "Kandil Approver"],
		}.items():
			email = f"{self.prefix.lower()}-{key}@example.invalid"
			self.insert(
				"User",
				email=email,
				first_name=f"{self.prefix} {key}",
				enabled=1,
				send_welcome_email=0,
				user_type="System User",
				roles=[{"role": r} for r in roles],
			)
			self.users[key] = email
			self.grants[key] = self.insert(
				"Kandil Access Grant",
				user=email,
				company=self.company,
				department=self.department,
				valid_from=today(),
				reason="Synthetic command regression fixture",
				can_manage_recruitment=1,
				can_view_sensitive=1,
			).name
		manager_employee = self.insert(
			"Employee",
			first_name=self.prefix,
			gender="Male",
			date_of_birth="1990-01-01",
			date_of_joining=today(),
			company=self.company,
			department=self.department,
			designation=self.designation,
			status="Active",
			user_id=self.users["manager"],
		)
		# Company-wide settings are restored by the per-test transaction rollback.
		if frappe.db.exists("Kandil Organization Settings", self.company):
			settings = frappe.get_doc("Kandil Organization Settings", self.company)
			settings.hr_approver = self.users["hr"]
			settings.sector_approver = self.users["sector"]
			settings.save(ignore_permissions=True)
		else:
			settings = self.insert(
				"Kandil Organization Settings",
				company=self.company,
				hr_approver=self.users["hr"],
				sector_approver=self.users["sector"],
			)
		self.route = self.insert(
			"Kandil Recruitment Route",
			company=self.company,
			department=self.department,
			manager_approver=self.users["manager"],
			hr_approver=self.users["hr"],
			exception_approver=self.users["sector"],
			enabled=1,
			headcount_mode="Warn",
		)
		self.positions, self.capacities = [], []
		with organization_transition():
			manager_position = self.insert(
				"Kandil Position",
				company=self.company,
				department=self.department,
				designation=self.designation,
				position_code=self.prefix + "-manager",
				title="Synthetic department head",
			)
			self.insert(
				"Kandil Position Hierarchy",
				company=self.company,
				department=self.department,
				position=manager_position.name,
				valid_from=today(),
				authority="Department Approval",
			)
			for key in ("A", "B"):
				branch = self.insert("Branch", branch=self.prefix + "-" + key).name
				position = self.insert(
					"Kandil Position",
					company=self.company,
					department=self.department,
					designation=self.designation,
					branch=branch,
					position_code=self.prefix + "-" + key,
					title="Synthetic operator " + key,
					structural=5,
				)
				self.positions.append(position.name)
				self.insert(
					"Kandil Position Hierarchy",
					company=self.company,
					department=self.department,
					branch=branch,
					position=position.name,
					parent_position=manager_position.name,
					authority="Department Approval",
					valid_from=today(),
				)
				capacity = self.insert(
					"Kandil Capacity",
					company=self.company,
					department=self.department,
					branch=branch,
					designation=self.designation,
					position=position.name,
					structural=5,
					occupied=0,
				)
				self.capacities.append(capacity.name)
		self.insert(
			"Kandil Position Assignment",
			company=self.company,
			department=self.department,
			position=manager_position.name,
			employee=manager_employee.name,
			user=self.users["manager"],
			valid_from=today(),
			allocation="Primary",
		)

	def rollback(self):
		frappe.db.rollback(save_point=self.point)
		frappe.db.after_commit.truncate(self.after_commit_count)
		frappe.local.document_cache = {}

	@staticmethod
	def insert(doctype, **values):
		if doctype == "User":
			# Rolled-back synthetic accounts must not consume the live signup throttle.
			previous = frappe.flags.get("in_import")
			try:
				frappe.flags.in_import = True
				return frappe.get_doc(dict(doctype=doctype, **values)).insert(ignore_permissions=True)
			finally:
				frappe.flags.in_import = previous
		if doctype == "Kandil Position Assignment":
			from kandil_hr.organization.api import transition
			with transition():
				return frappe.get_doc(dict(doctype=doctype, **values)).insert(ignore_permissions=True)
		return frappe.get_doc(dict(doctype=doctype, **values)).insert(ignore_permissions=True)

	def request(self, quantities=(2, 1)):
		with acting_as(self.users["requester"]):
			return frappe.get_doc(
				dict(
					doctype="Kandil Hiring Request",
					company=self.company,
					department=self.department,
					title=self.prefix + " synthetic request",
					requested_position=self.positions[0],
					revision=1,
					need_reason="Expansion",
					requested_priority="Normal",
					lines=[
						dict(capacity=cap, requested_qty=qty)
						for cap, qty in zip(self.capacities, quantities, strict=False)
					],
				)
			).insert()

	def load(self, name):
		return frappe.get_doc("Kandil Hiring Request", name)

	def call(self, key, method, name, **values):
		doc = self.load(name)
		values.setdefault("command_id", uuid.uuid4().hex)
		values.setdefault("expected_version", str(doc.modified))
		with acting_as(self.users[key]):
			return method(name=name, **values)

	def submit(self, name, **values):
		return self.call("requester", api.submit_request, name, **values)

	def decide(self, name, key, decision="Approve", **values):
		step = next(s for s in self.load(name).approval_steps if s.decision == "Pending")
		values.setdefault("step_id", step.step_key)
		return self.call(key, api.decide, name, decision=decision, **values)

	def approve_all(self, name):
		self.decide(name, "manager")
		return self.decide(name, "hr")

	def ledger(self, reserved, opened, occupied=(0, 0)):
		for cap_name, r, o, filled in zip(self.capacities, reserved, opened, occupied, strict=True):
			cap = frappe.get_doc("Kandil Capacity", cap_name)
			self.assertEqual(
				(cap.reserved, cap.open_slots, cap.occupied, cap.available),
				(r, o, filled, cap.structural - r - o - filled),
			)

	def counts(self, name):
		return {
			dt: frappe.db.count(dt, filters)
			for dt, filters in [
				("Kandil Command Receipt", {"request": name}),
				("Kandil Request Revision", {"request": name}),
				("Kandil Recruitment Event", {"request": name}),
				("Kandil Notification Outbox", {"reference_name": name}),
				("Job Opening", {"custom_kandil_request": name}),
			]
		}

	@contextmanager
	def rejected(self, exception=frappe.ValidationError):
		# Emulate the request rollback Frappe performs after a failed command,
		# while keeping fixtures and earlier successful commands in this case.
		point = "denied_" + uuid.uuid4().hex
		frappe.db.savepoint(point)
		try:
			with self.assertRaises(exception):
				yield
		finally:
			frappe.db.rollback(save_point=point)
			frappe.local.document_cache = {}

	def test_submit_replay_does_not_duplicate_effects(self):
		req = self.request()
		command_id, version = uuid.uuid4().hex, str(req.modified)
		first = self.submit(req.name, command_id=command_id, expected_version=version)
		counts = self.counts(req.name)
		second = self.submit(req.name, command_id=command_id, expected_version=version)
		self.assertEqual(json.loads(api.dump(first)), json.loads(api.dump(second)))
		self.assertEqual(self.counts(req.name), counts)
		self.assertEqual(counts["Kandil Command Receipt"], 1)
		self.ledger((2, 1), (0, 0))

	def test_replay_cannot_advance_consecutive_steps_for_same_principal(self):
		with acting_as("Administrator"):
			settings = frappe.get_doc("Kandil Organization Settings", self.company)
			settings.hr_approver = self.users["manager"]
			settings.save(ignore_permissions=True)
			route = frappe.get_doc("Kandil Recruitment Route", self.route.name)
			route.hr_approver = self.users["manager"]
			route.save(ignore_permissions=True)
		req = self.request()
		self.submit(req.name)
		doc = self.load(req.name)
		self.assertEqual([s.principal for s in doc.approval_steps], [self.users["manager"]] * 2)
		args = dict(
			command_id=uuid.uuid4().hex,
			expected_version=str(doc.modified),
			step_id=doc.approval_steps[0].step_key,
		)
		first = self.decide(req.name, "manager", **args)
		counts = self.counts(req.name)
		second = self.decide(req.name, "manager", **args)
		self.assertEqual(json.loads(api.dump(first)), json.loads(api.dump(second)))
		self.assertEqual([s.decision for s in self.load(req.name).approval_steps], ["Approved", "Pending"])
		self.assertEqual(self.counts(req.name), counts)
		self.ledger((2, 1), (0, 0))

	def test_command_collision_stale_version_and_wrong_step_fail_without_effects(self):
		req = self.request()
		self.submit(req.name)
		doc = self.load(req.name)
		old_version = str(doc.modified)
		args = dict(
			command_id=uuid.uuid4().hex, expected_version=old_version, step_id=doc.approval_steps[0].step_key
		)
		self.decide(req.name, "manager", **args)
		counts = self.counts(req.name)
		with self.rejected():
			self.decide(req.name, "manager", decision="Reject", comment="Changed payload", **args)
		with self.rejected(frappe.TimestampMismatchError):
			self.decide(req.name, "hr", expected_version=old_version)
		with self.rejected():
			self.decide(req.name, "hr", step_id=args["step_id"])
		self.assertEqual(self.counts(req.name), counts)
		self.assertEqual(self.load(req.name).status, "Pending")
		self.ledger((2, 1), (0, 0))

	def test_two_locations_reserve_approve_and_cancel_exact_balances(self):
		req = self.request((3, 2))
		self.submit(req.name)
		self.ledger((3, 2), (0, 0))
		self.approve_all(req.name)
		self.ledger((0, 0), (3, 2))
		doc = self.load(req.name)
		self.assertEqual(doc.status, "Approved")
		self.assertEqual(len({s.job_opening for s in doc.lines}), 2)
		for line in doc.lines:
			self.assertEqual(
				frappe.db.get_value("Job Opening", line.job_opening, "vacancies"), line.approved_qty
			)
		self.call("requester", api.cancel_request, req.name, reason="Synthetic cancellation")
		self.ledger((0, 0), (0, 0))
		for line in self.load(req.name).lines:
			self.assertEqual(frappe.db.get_value("Job Opening", line.job_opening, "status"), "Closed")

	def test_return_revision_preserves_history_and_releases_old_reservation(self):
		req = self.request()
		self.submit(req.name)
		step_id = self.load(req.name).approval_steps[0].step_key
		self.decide(req.name, "manager", decision="Return", comment="Clarify requested quantities")
		self.ledger((0, 0), (0, 0))
		revision_rows = frappe.get_all(
			"Kandil Request Revision", filters={"request": req.name}, fields=["name", "snapshot_json"]
		)
		self.call("requester", api.revise, req.name, reason="Clarified synthetic request")
		with acting_as(self.users["requester"]):
			doc = self.load(req.name)
			self.assertEqual(doc.revision, 2)
			doc.lines[0].requested_qty = 1
			doc.save()
		self.submit(req.name)
		self.assertNotEqual(self.load(req.name).approval_steps[0].step_key, step_id)
		self.ledger((1, 1), (0, 0))
		for row in revision_rows:
			self.assertEqual(
				frappe.db.get_value("Kandil Request Revision", row.name, "snapshot_json"), row.snapshot_json
			)
		with self.rejected():
			self.decide(req.name, "manager", step_id=step_id)

	def test_hr_reduction_releases_only_delta_and_preserves_requested_quantities(self):
		req = self.request((3, 2))
		self.submit(req.name)
		self.decide(req.name, "manager")
		doc = self.load(req.name)
		quantities = {line.name: 1 for line in doc.lines}
		self.call(
			"hr",
			api.review,
			req.name,
			quantities=quantities,
			priority="Important",
			reason="Approved smaller need",
		)
		self.ledger((1, 1), (0, 0))
		self.decide(req.name, "hr")
		self.ledger((0, 0), (1, 1))
		doc = self.load(req.name)
		self.assertEqual([s.requested_qty for s in doc.lines], [3, 2])
		self.assertEqual([s.approved_qty for s in doc.lines], [1, 1])

	def test_amendment_increase_tops_up_existing_openings_once(self):
		req = self.request((1, 1))
		self.submit(req.name)
		self.approve_all(req.name)
		openings = [s.job_opening for s in self.load(req.name).lines]
		result = self.call("requester", api.amend, req.name, reason="Additional approved need")
		amendment = result["name"]
		with acting_as(self.users["requester"]):
			doc = self.load(amendment)
			doc.lines[0].requested_qty = 3
			doc.save()
		self.submit(amendment)
		self.ledger((2, 0), (1, 1))
		with self.rejected():
			self.call("requester", api.cancel_request, req.name, reason="Unresolved amendment")
		self.approve_all(amendment)
		self.ledger((0, 0), (3, 1))
		self.assertEqual(self.load(amendment).status, "Applied")
		self.assertEqual([s.job_opening for s in self.load(req.name).lines], openings)
		self.assertEqual(frappe.db.count("Job Opening", {"custom_kandil_request": req.name}), 2)

	def test_pending_cancellation_replay_releases_reservations_once(self):
		req = self.request((2, 2))
		self.submit(req.name)
		args = dict(
			command_id=uuid.uuid4().hex,
			expected_version=str(self.load(req.name).modified),
			reason="No longer needed",
		)
		first = self.call("requester", api.cancel_request, req.name, **args)
		counts = self.counts(req.name)
		second = self.call("requester", api.cancel_request, req.name, **args)
		self.assertEqual(json.loads(api.dump(first)), json.loads(api.dump(second)))
		self.assertEqual(self.counts(req.name), counts)
		self.ledger((0, 0), (0, 0))

	def test_read_only_or_revoked_grant_cannot_mutate_or_replay(self):
		req = self.request()
		args = dict(command_id=uuid.uuid4().hex, expected_version=str(req.modified))
		self.submit(req.name, **args)
		counts = self.counts(req.name)
		with acting_as("Administrator"):
			grant = frappe.get_doc("Kandil Access Grant", self.grants["requester"])
			grant.revoked = 1
			grant.save(ignore_permissions=True)
			self.insert(
				"Kandil Access Grant",
				user=self.users["requester"],
				company=self.company,
				department=self.department,
				valid_from=today(),
				reason="Synthetic read-only grant",
				can_manage_recruitment=0,
				can_view_sensitive=0,
			)
		with self.rejected(frappe.PermissionError):
			self.call("requester", api.cancel_request, req.name, reason="Read is not write authority")
		with self.rejected(frappe.PermissionError):
			self.submit(req.name, **args)
		self.assertEqual(self.counts(req.name), counts)
		self.ledger((2, 1), (0, 0))

	def vacancy_fixture(self):
		from kandil_hr.recruitment import vacancies

		req = self.request((2, 1))
		self.submit(req.name)
		self.approve_all(req.name)
		opening = self.load(req.name).lines[0].job_opening
		self.assertEqual(
			frappe.db.get_value("Job Opening", opening, "custom_kandil_vacancy_state"), "Approved"
		)
		return req.name, opening, vacancies

	def test_vacancy_team_is_deduplicated_scoped_and_command_replay_safe(self):
		name, opening, vacancies = self.vacancy_fixture()
		args = dict(
			opening_name=opening,
			lead=self.users["hr"],
			members=[self.users["hr"], self.users["manager"], self.users["manager"]],
			reason="Synthetic recruiter team",
			command_id=uuid.uuid4().hex,
			expected_version=str(self.load(name).modified),
		)
		first = self.call("hr", vacancies.assign_team, name, **args)
		counts = self.counts(name)
		second = self.call("hr", vacancies.assign_team, name, **args)
		self.assertEqual(json.loads(api.dump(first)), json.loads(api.dump(second)))
		self.assertEqual(self.counts(name), counts)
		doc = frappe.get_doc("Job Opening", opening)
		self.assertEqual(doc.custom_kandil_lead, self.users["hr"])
		self.assertEqual([m.user for m in doc.custom_kandil_team], [self.users["hr"], self.users["manager"]])
		with self.rejected(frappe.PermissionError):
			self.call(
				"hr",
				vacancies.assign_team,
				name,
				opening_name=opening,
				lead=self.users["requester"],
				members=[],
				reason="Unqualified non-recruiter",
			)
		with self.rejected(frappe.PermissionError):
			self.call(
				"requester",
				vacancies.assign_team,
				name,
				opening_name=opening,
				lead=self.users["hr"],
				members=[],
				reason="Requester is not a recruiter",
			)

	def test_vacancy_pause_freeze_resume_preserves_capacity(self):
		name, opening, vacancies = self.vacancy_fixture()
		with self.rejected():
			self.call(
				"hr", vacancies.set_state, name, opening_name=opening, action="Open", reason="Missing lead"
			)
		self.call(
			"hr",
			vacancies.assign_team,
			name,
			opening_name=opening,
			lead=self.users["hr"],
			members=[],
			reason="Assign lead",
		)
		for action, expected in [
			("Open", "Open"),
			("Hold", "On Hold"),
			("Freeze", "Frozen"),
			("Unfreeze", "On Hold"),
			("Resume", "Open"),
		]:
			self.call(
				"hr",
				vacancies.set_state,
				name,
				opening_name=opening,
				action=action,
				reason="Synthetic " + action,
			)
			self.assertEqual(
				frappe.db.get_value("Job Opening", opening, "custom_kandil_vacancy_state"), expected
			)
			self.ledger((0, 0), (2, 1))

	def test_closing_one_vacancy_then_parent_cancel_releases_each_slot_once(self):
		name, opening, vacancies = self.vacancy_fixture()
		args = dict(
			opening_name=opening,
			action="Close",
			reason="Close synthetic vacancy",
			command_id=uuid.uuid4().hex,
			expected_version=str(self.load(name).modified),
		)
		self.call("hr", vacancies.set_state, name, **args)
		self.call("hr", vacancies.set_state, name, **args)
		self.ledger((0, 0), (0, 1))
		self.assertEqual(self.load(name).lines[0].closed_qty, 2)
		self.call("requester", api.cancel_request, name, reason="Cancel remaining need")
		self.ledger((0, 0), (0, 0))
		self.assertEqual(self.load(name).status, "Cancelled")

	def test_all_closed_vacancies_close_parent_and_unresolved_candidate_blocks(self):
		name, opening, vacancies = self.vacancy_fixture()
		self.call(
			"hr",
			vacancies.assign_team,
			name,
			opening_name=opening,
			lead=self.users["hr"],
			members=[],
			reason="Assign lead",
		)
		self.call(
			"hr", vacancies.set_state, name, opening_name=opening, action="Open", reason="Start recruiting"
		)
		with acting_as(self.users["hr"]):
			candidate = frappe.get_doc(
				dict(
					doctype="Job Applicant",
					applicant_name=self.prefix + " Candidate",
					job_title=opening,
					email_id=self.prefix.lower() + "-candidate@example.invalid",
					status="Open",
				)
			).insert()
		with self.rejected():
			self.call(
				"hr",
				vacancies.set_state,
				name,
				opening_name=opening,
				action="Close",
				reason="Needs candidate disposition",
			)
		self.ledger((0, 0), (2, 1))
		with acting_as(self.users["hr"]):
			candidate.reload()
			candidate.status = "Rejected"
			candidate.save()
		for line in self.load(name).lines:
			self.call(
				"hr",
				vacancies.set_state,
				name,
				opening_name=line.job_opening,
				action="Close",
				reason="All candidates resolved",
			)
		self.ledger((0, 0), (0, 0))
		self.assertEqual(self.load(name).status, "Closed")

	def test_quantity_amendment_preserves_hold_and_freeze_state(self):
		name, opening, vacancies = self.vacancy_fixture()
		self.call(
			"hr",
			vacancies.assign_team,
			name,
			opening_name=opening,
			lead=self.users["hr"],
			members=[],
			reason="Assign lead",
		)
		self.call(
			"hr", vacancies.set_state, name, opening_name=opening, action="Open", reason="Start recruiting"
		)
		for action, state, new_qty in [("Hold", "On Hold", 3), ("Freeze", "Frozen", 4)]:
			self.call(
				"hr",
				vacancies.set_state,
				name,
				opening_name=opening,
				action=action,
				reason="Pause while reviewing",
			)
			result = self.call("requester", api.amend, name, reason="Amend capacity while paused")
			with acting_as(self.users["requester"]):
				amendment = self.load(result["name"])
				amendment.lines[0].requested_qty = new_qty
				amendment.save()
			self.submit(amendment.name)
			self.approve_all(amendment.name)
			updated = frappe.get_doc("Job Opening", opening)
			self.assertEqual(updated.custom_kandil_vacancy_state, state)
			self.assertEqual(updated.status, "Closed")
			self.ledger((0, 0), (new_qty, 1))
		self.call(
			"hr", vacancies.set_state, name, opening_name=opening, action="Unfreeze", reason="Remove freeze"
		)
		self.assertEqual(
			frappe.db.get_value("Job Opening", opening, "custom_kandil_vacancy_state"), "On Hold"
		)

	def test_priority_pin_and_unassigned_queue_observe_live_vacancy_state(self):
		from frappe.utils import add_days

		name, opening, vacancies = self.vacancy_fixture()
		with acting_as(self.users["hr"]):
			self.assertIn(opening, [r["name"] for r in vacancies.queue(unassigned=1)])
		self.call(
			"hr",
			vacancies.assign_team,
			name,
			opening_name=opening,
			lead=self.users["hr"],
			members=[],
			reason="Assign lead",
		)
		with acting_as(self.users["hr"]):
			self.assertNotIn(opening, [r["name"] for r in vacancies.queue(unassigned=1)])
		with self.rejected():
			self.call(
				"hr",
				vacancies.pin,
				name,
				opening_name=opening,
				pin_until=add_days(today(), -1),
				reason="Expired pin",
			)
		self.call(
			"hr", vacancies.pin, name, opening_name=opening, pin_until=today(), reason="Urgent synthetic need"
		)
		self.assertEqual(frappe.db.get_value("Job Opening", opening, "custom_kandil_priority_score"), 120)
		self.call(
			"hr", vacancies.set_state, name, opening_name=opening, action="Freeze", reason="Pause urgency"
		)
		with acting_as(self.users["hr"]):
			row = next(r for r in vacancies.queue() if r["name"] == opening)
			self.assertEqual(row["priority"]["score"], 0)

	def test_linked_opening_rejects_direct_mutation_even_with_ignore_permissions(self):
		_name, opening, _vacancies = self.vacancy_fixture()
		with self.rejected(frappe.PermissionError):
			with acting_as(self.users["hr"]):
				record = frappe.get_doc("Job Opening", opening)
				record.vacancies = 50
				record.save(ignore_permissions=True)
		self.assertEqual(frappe.db.get_value("Job Opening", opening, "vacancies"), 2)
		self.ledger((0, 0), (2, 1))

	def test_other_recruiter_cannot_take_over_draft_requester(self):
		from frappe.client import save

		req = self.request()
		payload = self.load(req.name).as_dict()
		payload["requested_by"] = self.users["hr"]
		payload["title"] = "Attempted attribution takeover"
		with self.rejected(frappe.PermissionError), acting_as(self.users["hr"]):
			save(json.dumps(payload, default=str))
		self.assertEqual(self.load(req.name).requested_by, self.users["requester"])

	def test_child_save_cannot_forge_approval_or_capacity_outcomes(self):
		from frappe.client import save

		req = self.request()
		self.submit(req.name)
		for child, field, value in [
			(self.load(req.name).approval_steps[0], "decision", "Approved"),
			(self.load(req.name).lines[0], "reserved_qty", 50),
		]:
			original = child.get(field)
			payload = child.as_dict()
			payload[field] = value
			with self.rejected(frappe.PermissionError), acting_as(self.users["hr"]):
				save(json.dumps(payload, default=str))
			self.assertEqual(frappe.db.get_value(child.doctype, child.name, field), original)
		self.ledger((2, 1), (0, 0))

	def test_bulk_team_same_request_locations_replay_once(self):
		name, _, vacancies = self.vacancy_fixture()
		doc = self.load(name)
		args = dict(
			items=[
				dict(name=name, opening_name=line.job_opening, expected_version=str(doc.modified))
				for line in doc.lines
			],
			lead=self.users["hr"],
			members=[self.users["manager"]],
			reason="Synthetic bulk team",
			command_id=uuid.uuid4().hex,
		)
		before = self.counts(name)
		with acting_as(self.users["hr"]):
			first = vacancies.bulk_assign(**args)
			counts = self.counts(name)
			replay = vacancies.bulk_assign(**args)
		self.assertEqual(json.loads(api.dump(first)), json.loads(api.dump(replay)))
		self.assertEqual(self.counts(name), counts)
		self.assertEqual(counts["Kandil Command Receipt"], before["Kandil Command Receipt"] + 1)
		for line in doc.lines:
			opening = frappe.get_doc("Job Opening", line.job_opening)
			self.assertEqual(opening.custom_kandil_lead, self.users["hr"])
			self.assertEqual(
				[m.user for m in opening.custom_kandil_team], [self.users["hr"], self.users["manager"]]
			)
		self.ledger((0, 0), (2, 1))

	def test_bulk_team_second_parent_stale_rolls_back_first_parent(self):
		from kandil_hr.recruitment import vacancies

		names = []
		for _ in range(2):
			req = self.request((1, 1))
			self.submit(req.name)
			self.approve_all(req.name)
			names.append(req.name)
		names.sort()  # bulk locks and processes parents in this order
		items = [
			dict(
				name=name,
				opening_name=self.load(name).lines[0].job_opening,
				expected_version=str(self.load(name).modified),
			)
			for name in names
		]
		items[1]["expected_version"] = "1900-01-01 00:00:00"
		before = {name: self.counts(name) for name in names}
		versions = {name: str(self.load(name).modified) for name in names}
		# Deliberately do NOT wrap rejected(): the bulk API must roll itself back.
		with acting_as(self.users["hr"]), self.assertRaises(frappe.ValidationError):
			vacancies.bulk_assign(
				items=items,
				lead=self.users["hr"],
				members=[self.users["manager"]],
				reason="Synthetic stale bulk",
				command_id=uuid.uuid4().hex,
			)
		for item in items:
			self.assertEqual(self.counts(item["name"]), before[item["name"]])
			self.assertEqual(str(self.load(item["name"]).modified), versions[item["name"]])
			opening = frappe.get_doc("Job Opening", item["opening_name"])
			self.assertFalse(opening.custom_kandil_lead)
			self.assertEqual(len(opening.custom_kandil_team), 0)
		self.ledger((0, 0), (2, 2))

	def test_requester_json_draft_edit_preserves_datetime_authorship(self):
		from frappe.client import save

		req = self.request()
		original = self.load(req.name)
		payload = original.as_dict()
		payload["title"] = self.prefix + " revised by requester"
		with acting_as(self.users["requester"]):
			result = save(json.dumps(payload, default=str))
		self.assertEqual(result["title"], payload["title"])
		saved = self.load(req.name)
		self.assertEqual(
			(saved.owner, saved.requested_by, saved.creation),
			(original.owner, original.requested_by, original.creation),
		)
		self.assertEqual(self.counts(req.name)["Kandil Command Receipt"], 0)

	def test_child_guard_does_not_change_nonparity_behavior(self):
		from frappe.client import save

		req = self.request()
		payload = self.load(req.name).lines[0].as_dict()
		# Only disable the parity flag in this isolated transaction; no other site touched.
		with patch.dict(frappe.conf, {"kandil_parity_enabled": 0}), acting_as(self.users["requester"]):
			result = save(json.dumps(payload, default=str))
		self.assertEqual(result["requested_qty"], 2)
		self.ledger((0, 0), (0, 0))

	def test_bulk_team_closed_second_vacancy_rolls_back_first_parent(self):
		from kandil_hr.recruitment import vacancies

		names = []
		for _ in range(2):
			req = self.request((1, 1))
			self.submit(req.name)
			self.approve_all(req.name)
			names.append(req.name)
		names.sort()
		closed = self.load(names[1]).lines[0].job_opening
		self.call(
			"hr",
			vacancies.set_state,
			names[1],
			opening_name=closed,
			action="Close",
			reason="Synthetic closed vacancy",
		)
		items = [
			dict(
				name=name,
				opening_name=self.load(name).lines[0].job_opening,
				expected_version=str(self.load(name).modified),
			)
			for name in names
		]
		before = {name: self.counts(name) for name in names}
		with acting_as(self.users["hr"]), self.assertRaises(frappe.ValidationError):
			vacancies.bulk_assign(
				items=items,
				lead=self.users["hr"],
				members=[],
				reason="Synthetic closed bulk",
				command_id=uuid.uuid4().hex,
			)
		for item in items:
			self.assertEqual(self.counts(item["name"]), before[item["name"]])
			opening = frappe.get_doc("Job Opening", item["opening_name"])
			self.assertFalse(opening.custom_kandil_lead)
			self.assertFalse(opening.custom_kandil_team)
		self.ledger((0, 0), (1, 2))

	def test_parent_cancel_cannot_bypass_candidate_disposition_guard(self):
		name, opening, vacancies = self.vacancy_fixture()
		self.call(
			"hr",
			vacancies.assign_team,
			name,
			opening_name=opening,
			lead=self.users["hr"],
			members=[],
			reason="Synthetic lead",
		)
		self.call(
			"hr",
			vacancies.set_state,
			name,
			opening_name=opening,
			action="Open",
			reason="Synthetic candidate intake",
		)
		with acting_as(self.users["hr"]):
			candidate = frappe.get_doc(
				dict(
					doctype="Job Applicant",
					applicant_name=self.prefix + " Candidate",
					job_title=opening,
					email_id=self.prefix.lower() + "-cancel@example.invalid",
					status="Open",
				)
			).insert()
		before = self.counts(name)
		with self.rejected():
			self.call("hr", api.cancel_request, name, reason="Attempt parent cancellation bypass")
		self.assertEqual(self.counts(name), before)
		self.assertEqual(self.load(name).status, "Approved")
		self.assertEqual(frappe.db.get_value("Job Applicant", candidate.name, "status"), "Open")
		self.ledger((0, 0), (2, 1))

	def test_revoked_hr_role_cannot_review_pending_quantities(self):
		req = self.request()
		self.submit(req.name)
		self.decide(req.name, "manager")
		with acting_as("Administrator"):
			account = frappe.get_doc("User", self.users["hr"])
			account.set("roles", [{"role": "Kandil Approver"}])
			account.save(ignore_permissions=True)
			frappe.clear_cache(user=self.users["hr"])
		before = self.counts(req.name)
		with self.rejected(frappe.PermissionError):
			self.call(
				"hr",
				api.review,
				req.name,
				quantities={self.load(req.name).lines[0].name: 1},
				priority="Normal",
				reason="Revoked HR role",
			)
		self.assertEqual(self.counts(req.name), before)
		self.ledger((2, 1), (0, 0))

	def test_sector_cannot_self_grant_ceo_delegation(self):
		with acting_as("Administrator"):
			ceo = self.insert(
				"User",
				email=self.prefix.lower() + "-ceo@example.invalid",
				first_name="Synthetic CEO",
				enabled=1,
				send_welcome_email=0,
				user_type="System User",
				roles=[{"role": "Kandil CEO Approver"}],
			).name
		with self.rejected((frappe.PermissionError, frappe.ValidationError)), acting_as(self.users["sector"]):
			frappe.get_doc(
				dict(
					doctype="Kandil Delegation",
					company=self.company,
					department=self.department,
					from_user=ceo,
					to_user=self.users["sector"],
					from_date=today(),
					to_date=today(),
					reason="Attempt unapproved CEO delegation",
				)
			).insert()


def run():
	"""Explicit native runner because Frappe v16 excludes plain unittest classes."""
	import hashlib
	import sys
	from datetime import datetime, timezone
	from pathlib import Path

	source = Path(__file__).resolve().parents[1]

	def fingerprint():
		digest = hashlib.sha256()
		for path in sorted(list(source.rglob("*.py")) + list(source.rglob("*.json"))):
			digest.update(str(path.relative_to(source)).encode())
			digest.update(path.read_bytes())
		return digest.hexdigest()

	before_hash = fingerprint()
	suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestRecruitmentCommands)
	cases = [test.id() for test in suite]
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2).run(suite)
	after_hash = fingerprint()
	summary = {
		"suite": "recruitment-native",
		"tests_run": result.testsRun,
		"failures": len(result.failures),
		"errors": len(result.errors),
		"skipped": len(result.skipped),
		"successful": result.wasSuccessful() and not result.skipped,
		"site": frappe.local.site,
		"fixtures_rolled_back": True,
		"failed_tests": [test.id() for test, _ in result.failures + result.errors],
		"checked_at": datetime.now(UTC).isoformat(),
		"source_fingerprint_before": before_hash,
		"source_fingerprint_after": after_hash,
		"source_unchanged_during_run": before_hash == after_hash,
	}
	failed = set(summary["failed_tests"])
	skipped = {test.id() for test, _ in result.skipped}
	summary["checks"] = [
		{"test": name, "status": "FAIL" if name in failed else "SKIP" if name in skipped else "PASS"}
		for name in cases
	]
	if not summary["successful"]:
		print(json.dumps(summary))
		raise AssertionError("Recruitment native suite failed or skipped; see per-case evidence")
	return summary
