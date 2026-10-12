"""Atomic Pending reservation revision; ordinary-user native rollback fixtures."""

import json
import unittest
import uuid
from unittest.mock import patch

import frappe

from kandil_hr.recruitment import api, preview
from kandil_hr.recruitment.pending_revision import revise_pending_quantities
from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as


class TestPendingRevision(unittest.TestCase):
	def setUp(self):
		self.f = TestRecruitmentCommands()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()

	def pending(self, quantities=(2,)):
		name = self.f.request(quantities).name
		self.f.submit(name)
		return name

	def mapping(self, name, quantities):
		return {line.name: qty for line, qty in zip(self.f.load(name).lines, quantities, strict=True)}

	def revise(self, name, quantities, actor="requester", **values):
		return self.f.call(
			actor,
			revise_pending_quantities,
			name,
			quantities=self.mapping(name, quantities),
			reason="Synthetic pending quantity revision",
			**values,
		)

	def state(self, name):
		return dict(
			request=frappe.as_json(self.f.load(name).as_dict()),
			caps=[
				frappe.as_json(frappe.get_doc("Kandil Capacity", cap).as_dict()) for cap in self.f.capacities
			],
			counts={
				**self.f.counts(name),
				"audit": frappe.db.count("Kandil Command Audit", {"target_name": name}),
			},
		)

	def seed_capacity(self, index, count):
		# Initial synthetic structural fixture, before any reservation; not a
		# runtime structural-policy bypass or public capacity editing contract.
		frappe.db.set_value("Kandil Position", self.f.positions[index], "structural", count)
		frappe.db.set_value(
			"Kandil Capacity", self.f.capacities[index], {"structural": count, "available": count}
		)

	def test_exact_own_two_to_three_adds_delta_one_never_charges_old_two_twice(self):
		"""Amending own reservation of2 to3 adds delta1; never charges old2 twice."""
		self.seed_capacity(0, 3)
		name = self.pending()
		before = frappe.get_doc("Kandil Capacity", self.f.capacities[0])
		self.assertEqual((before.reserved, before.available), (2, 1))
		self.revise(name, (3,))
		cap = frappe.get_doc(before.doctype, before.name)
		self.assertEqual((cap.reserved, cap.available, cap.occupied, cap.open_slots), (3, 0, 0, 0))
		doc = self.f.load(name)
		self.assertEqual(doc.status, "Pending")
		self.assertEqual(doc.revision, 2)
		self.assertFalse(doc.needs_exception)
		basis = json.loads(doc.route_snapshot)["headcount_basis"][cap.name]
		self.assertEqual(
			(basis["other_commitments"], basis["additional"], basis["unmatched_commitments"]), (0, 3, 0)
		)
		with acting_as(self.f.users["requester"]):
			row = preview.headcount(name)["rows"][0]
		self.assertEqual(
			(row["requested"], row["own_reserved"], row["available"], row["shortage"]), (3, 3, 3, 0)
		)
		self.f.approve_all(name)
		cap.reload()
		self.assertEqual((cap.reserved, cap.open_slots, cap.available), (0, 3, 0))

	def test_multiline_other_reservations_remain_charged_and_other_request_unchanged(self):
		other = self.pending((2, 1))
		name = self.pending((2, 1))
		other_before = frappe.as_json(self.f.load(other).as_dict())
		self.revise(name, (3, 2))
		self.assertEqual(frappe.as_json(self.f.load(other).as_dict()), other_before)
		self.f.ledger((5, 3), (0, 0))
		basis = json.loads(self.f.load(name).route_snapshot)["headcount_basis"]
		self.assertEqual(basis[self.f.capacities[0]]["other_commitments"], 2)
		self.assertEqual(basis[self.f.capacities[1]]["other_commitments"], 1)
		self.f.approve_all(name)
		self.f.ledger((2, 1), (3, 2))

	def test_second_location_shortage_keeps_every_location_and_old_notifications_unchanged(self):
		route = frappe.get_doc("Kandil Recruitment Route", self.f.route.name)
		route.headcount_mode = "Block"
		route.save(ignore_permissions=True)
		self.seed_capacity(0, 5)
		self.seed_capacity(1, 2)
		name = self.pending((2, 1))
		before = self.state(name)
		# First line fits, second line does not. No partial delta, revision,
		# approval reset or old-notification suppression may survive the denial.
		outcome = self.revise(name, (3, 3))
		self.assertEqual(outcome["code"], "HEADCOUNT_BLOCKED")
		self.assertEqual(self.state(name), before)
		self.f.ledger((2, 1), (0, 0))
		self.revise(name, (3, 2))
		self.f.ledger((3, 2), (0, 0))


	def test_signed_reduction_releases_only_own_delta(self):
		other = self.pending((1,))
		name = self.pending((3,))
		original_other = frappe.as_json(self.f.load(other).as_dict())
		self.revise(name, (2,))
		self.assertEqual(frappe.get_doc("Kandil Capacity", self.f.capacities[0]).reserved, 3)
		self.assertEqual(frappe.as_json(self.f.load(other).as_dict()), original_other)

	def test_completed_manager_approval_preserved_and_all_new_keys_restart(self):
		name = self.pending()
		self.f.decide(name, "manager", comment="Original reviewed quantity")
		old = self.f.load(name)
		old_steps = [row.as_dict() for row in old.approval_steps]
		old_keys = {row.step_key for row in old.approval_steps}
		old_revisions = {
			row.name: row.snapshot_json
			for row in frappe.get_all(
				"Kandil Request Revision", filters={"request": name}, fields=["name", "snapshot_json"]
			)
		}
		self.revise(name, (3,))
		doc = self.f.load(name)
		self.assertTrue(
			all(
				row.decision == "Pending" and not row.actor and not row.decided_at
				for row in doc.approval_steps
			)
		)
		self.assertTrue(old_keys.isdisjoint({row.step_key for row in doc.approval_steps}))
		self.assertTrue(doc.approval_steps[0].waiting_since)
		self.assertTrue(all(not row.waiting_since for row in doc.approval_steps[1:]))
		for key, value in old_revisions.items():
			self.assertEqual(frappe.db.get_value("Kandil Request Revision", key, "snapshot_json"), value)
		source = frappe.get_doc(
			"Kandil Request Revision", {"request": name, "action": "Pending quantity revision source"}
		)
		frozen = json.loads(source.snapshot_json)
		self.assertEqual(frozen["revision"], 1)
		self.assertEqual(frozen["approval_steps"][0]["actor"], old_steps[0]["actor"])
		self.assertEqual(frozen["approval_steps"][0]["decision"], "Approved")
		before = self.state(name)
		with self.assertRaises(frappe.ValidationError):
			self.f.call("hr", api.decide, name, decision="Approve", step_id=old.approval_steps[-1].step_key)
		self.assertEqual(self.state(name), before)
		self.f.approve_all(name)
		self.assertEqual(self.f.load(name).status, "Approved")

	def test_replay_conflicting_payload_stale_version_and_wrong_actor(self):
		name = self.pending()
		version = str(self.f.load(name).modified)
		key = uuid.uuid4().hex
		first = self.revise(name, (3,), command_id=key, expected_version=version)
		after = self.state(name)
		replay = self.revise(name, (3,), command_id=key, expected_version=version)
		# Receipts store JSON; first native results may still contain datetime values.
		# Compare the complete serialized response, as ordinary HTTP callers receive it.
		self.assertEqual(json.loads(api.dump(replay)), json.loads(api.dump(first)))
		self.assertEqual(self.state(name), after)
		for actor, qty, command, reviewed, exception in (
			("requester", 4, key, version, frappe.ValidationError),
			("requester", 4, uuid.uuid4().hex, version, frappe.TimestampMismatchError),
			("hr", 4, uuid.uuid4().hex, str(self.f.load(name).modified), frappe.PermissionError),
		):
			with self.assertRaises(exception):
				self.revise(name, (qty,), actor=actor, command_id=command, expected_version=reviewed)
			self.assertEqual(self.state(name), after)

	def test_exact_complete_positive_maps_reject_missing_unknown_duplicate_fractional_and_boolean(self):
		name = self.pending((2, 1))
		mapping = self.mapping(name, (3, 2))
		keys = list(mapping)
		invalid = [
			{},
			{keys[0]: 3},
			{**mapping, "foreign-line": 1},
			[3, 2],
			'{"' + keys[0] + '":3,"' + keys[0] + '":4,"' + keys[1] + '":2}',
			*[{**mapping, keys[0]: value} for value in (0, -1, 1.5, True, None, "invalid")],
		]
		before = self.state(name)
		for value in invalid:
			with self.subTest(value=value), self.assertRaises(frappe.ValidationError):
				self.f.call(
					"requester",
					revise_pending_quantities,
					name,
					quantities=value,
					reason="Synthetic invalid map",
				)
			self.assertEqual(self.state(name), before)

	def test_noop_keeps_approval_and_revision_and_only_records_command_receipt_audit(self):
		name = self.pending()
		self.f.decide(name, "manager")
		before = self.state(name)
		result = self.revise(name, (2,))
		after = self.state(name)
		self.assertTrue(result["pending_revision_unchanged"])
		self.assertEqual(after["request"], before["request"])
		self.assertEqual(after["caps"], before["caps"])
		for key in before["counts"]:
			self.assertEqual(
				after["counts"][key] - before["counts"][key],
				1 if key in ("audit", "Kandil Command Receipt") else 0,
			)

	def test_warn_shortage_resolves_independent_exception_from_self_excluded_basis(self):
		self.seed_capacity(0, 3)
		name = self.pending()
		self.revise(name, (4,), exception_reason="Documented four-seat shortage")
		doc = self.f.load(name)
		self.assertTrue(doc.needs_exception)
		self.assertEqual(
			(doc.approval_steps[0].authority, doc.approval_steps[0].principal),
			("Headcount Exception", self.f.users["sector"]),
		)
		basis = json.loads(doc.route_snapshot)["headcount_basis"][self.f.capacities[0]]
		self.assertEqual((basis["other_commitments"], basis["additional"]), (0, 4))
		self.f.decide(name, "sector")
		self.f.approve_all(name)
		self.assertEqual(frappe.get_doc("Kandil Capacity", self.f.capacities[0]).open_slots, 4)

	def test_audit_failure_rolls_back_ledger_revision_steps_notifications_and_receipt(self):
		name = self.pending()
		before = self.state(name)
		callbacks = {
			key: len(getattr(frappe.db, key))
			for key in ("after_commit", "before_commit", "after_rollback", "before_rollback")
		}
		with patch(
			"kandil_hr.foundation.command_audit.record_command",
			side_effect=RuntimeError("Synthetic audit failure"),
		):
			with self.assertRaisesRegex(RuntimeError, "Synthetic audit failure"):
				self.revise(name, (3,))
		# No test-level rollback: the command itself must restore every effect.
		self.assertEqual(self.state(name), before)
		self.assertEqual({key: len(getattr(frappe.db, key)) for key in callbacks}, callbacks)
		self.revise(name, (3,))

	def test_revision_suppresses_old_queued_notices_and_preserves_delivered_history(self):
		from kandil_hr.foundation import outbox
		name = self.pending()
		other = self.pending((1,))
		def notice(key, reference=name):
			return outbox.enqueue(uuid.uuid4().hex, self.f.users["manager"], key,
				reference_doctype="Kandil Hiring Request", reference_name=reference)
		queued = notice("Approval reminder")
		retry = notice("Approval expiry warning")
		failed = notice("Approval escalation")
		# Exercise the existing worker failure path, without external delivery.
		outbox._record_failure(retry, "SyntheticFailure")
		for _ in range(5): outbox._record_failure(failed, "SyntheticFailure")
		delivered = notice("Previously delivered approval reminder")
		self.assertEqual(outbox.deliver(delivered), "Delivered locally")
		history = frappe.as_json(frappe.get_doc("Kandil Notification Outbox", delivered).as_dict())
		unrelated = notice("Another request", other)
		old = {row.name for row in frappe.get_all("Kandil Notification Outbox", filters={"reference_name": name})}
		self.revise(name, (3,))
		for key in old - {delivered}:
			row = frappe.get_doc("Kandil Notification Outbox", key)
			self.assertEqual(row.status, "Suppressed")
			self.assertEqual(row.last_error, "Superseded by pending quantity revision")
			self.assertFalse(row.next_attempt)
			self.assertFalse(row.notification_log)
			self.assertEqual(outbox.deliver(key), "Suppressed")
		self.assertEqual(frappe.as_json(frappe.get_doc("Kandil Notification Outbox", delivered).as_dict()), history)
		self.assertEqual(frappe.get_doc("Kandil Notification Outbox", unrelated).status, "Pending")
		new = frappe.get_all("Kandil Notification Outbox", filters={"reference_name": name, "name": ["not in", list(old)]}, fields=["name", "status"])
		self.assertEqual(len(new), 2)
		for row in new: self.assertEqual(outbox.deliver(row.name), "Delivered locally")
		with self.assertRaises(frappe.ValidationError): outbox.retry_failed(failed, "Must not resurrect obsolete reminder")


	def test_revoked_requester_scope_denies_without_business_changes(self):
		name = self.pending()
		grant = frappe.get_doc("Kandil Access Grant", self.f.grants["requester"])
		grant.revoked = 1
		grant.save(ignore_permissions=True)
		before = self.state(name)
		with self.assertRaises(frappe.PermissionError):
			self.revise(name, (3,))
		self.assertEqual(self.state(name), before)


	def test_block_denial_retains_evaluation_and_replays_without_business_changes(self):
		route = frappe.get_doc("Kandil Recruitment Route", self.f.route.name)
		route.headcount_mode = "Block"
		route.save(ignore_permissions=True)
		self.seed_capacity(0, 3)
		name = self.pending()
		before = self.state(name)
		key, version = uuid.uuid4().hex, str(self.f.load(name).modified)
		result = self.revise(name, (5,), command_id=key, expected_version=version)
		self.assertEqual((result["outcome"], result["code"]), ("denied", "HEADCOUNT_BLOCKED"))
		self.assertEqual(self.state(name), before)
		event = frappe.get_doc("Kandil Security Event", result["event"])
		value = json.loads(event.changed_fields)
		line = value["evaluation"]["lines"][0]
		self.assertEqual(
			[line[k] for k in ("requested_qty", "own_reserved_qty", "available", "effective_available", "excess")],
			[5, 2, 1, 3, 2],
		)
		self.assertEqual(value["business_before_hash"], value["business_after_hash"])
		self.assertEqual(value["actor"], self.f.users["requester"])
		self.assertEqual(self.revise(name, (5,), command_id=key, expected_version=version), result)
		self.assertEqual(frappe.db.count("Kandil Security Event", {"reference": event.reference}), 1)
		self.assertEqual(self.state(name), before)

	def test_warn_short_reason_denial_retains_exact_evaluation_then_valid_reason_succeeds(self):
		self.seed_capacity(0, 3)
		name = self.pending()
		before = self.state(name)
		result = self.revise(name, (4,), exception_reason="123456789")
		self.assertEqual(result["code"], "HEADCOUNT_REASON_REQUIRED")
		value = json.loads(frappe.get_doc("Kandil Security Event", result["event"]).changed_fields)
		self.assertEqual(value["evaluation"]["exception_reason"], "123456789")
		self.assertEqual(value["evaluation"]["policy"]["mode"], "Warn")
		self.assertEqual(self.state(name), before)
		self.revise(name, (4,), exception_reason="1234567890")
		self.assertTrue(self.f.load(name).needs_exception)
		self.assertEqual(frappe.get_doc("Kandil Capacity", self.f.capacities[0]).reserved, 4)


	def test_denial_storage_failure_restores_business_state_and_callbacks(self):
		route = frappe.get_doc("Kandil Recruitment Route", self.f.route.name)
		route.headcount_mode = "Block"
		route.save(ignore_permissions=True)
		self.seed_capacity(0, 3)
		name = self.pending()
		before = self.state(name)
		callbacks = {key: len(getattr(frappe.db, key)) for key in ("before_commit", "after_commit", "before_rollback", "after_rollback")}
		with patch("kandil_hr.foundation.models.record_security_event", side_effect=RuntimeError("Synthetic denial storage failure")):
			with self.assertRaisesRegex(RuntimeError, "Synthetic denial storage failure"):
				self.revise(name, (4,))
		self.assertEqual(self.state(name), before)
		self.assertEqual({key: len(getattr(frappe.db, key)) for key in callbacks}, callbacks)
		self.assertEqual(self.revise(name, (4,))["outcome"], "denied")


def run():
	from kandil_hr.foundation.concurrency_runner import _guard
	from kandil_hr.foundation.tests_runner import RecordedResult

	_guard()
	suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestPendingRevision)
	assert suite.countTestCases() == 15
	result = unittest.TextTestRunner(verbosity=2, resultclass=RecordedResult).run(suite)
	summary = dict(
		result="PASS" if result.wasSuccessful() and not result.skipped else "FAIL",
		discovered=15,
		executed=result.testsRun,
		failures=len(result.failures),
		errors=len(result.errors),
		skips=len(result.skipped),
		tests=result.checks,
		limits="Native synthetic rollback tests; independent connection races and EN/AR HTTP/UI require separate proof",
	)
	if not result.wasSuccessful() or result.skipped or result.testsRun != 15:
		error = AssertionError("Pending quantity revision checks failed")
		error.summary = summary
		raise error
	return summary
