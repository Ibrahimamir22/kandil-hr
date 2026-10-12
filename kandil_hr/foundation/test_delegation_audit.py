"""Focused native delegation envelopes; synthetic rollback fixtures only."""

import json
import unittest
import uuid
from unittest.mock import patch

import frappe

from kandil_hr.foundation import command_audit as central
from kandil_hr.foundation import delegation, delegation_audit
from kandil_hr.foundation.test_delegation import TestDelegation
from kandil_hr.recruitment.test_commands import acting_as


class TestDelegationAuditNative(unittest.TestCase):
	def setUp(self):
		self.f = TestDelegation()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()

	def records(self, name):
		return frappe.get_all(
			central.DOCTYPE,
			filters={"domain": "delegation", "target_name": name},
			fields=["name", "operation", "command_origin", "envelope_json"],
			order_by="creation asc",
		)

	def test_native_create_records_explicit_absence_and_observed_delta(self):
		doc = self.f.grant()
		rows = self.records(doc.name)
		self.assertEqual(len(rows), 1)
		value = json.loads(rows[0].envelope_json)
		self.assertEqual((rows[0].operation, rows[0].command_origin), ("create", "server_invocation"))
		self.assertEqual(value["before"], {"doctype": doc.doctype, "name": doc.name, "record_exists": False})
		self.assertEqual(value["after"]["approval_status"], "Active")
		self.assertEqual(value["payload"]["native_change"]["company"]["after"], self.f.company)
		self.assertEqual(value["actor"], self.f.users["sector"])
		self.assertEqual(value["principal"], value["actor"])

	def test_ceo_decision_exact_arguments_one_envelope_on_replay(self):
		self.f.ceo()
		doc = self.f.grant(principal="ceo")
		args = dict(
			name=doc.name,
			decision="Approve",
			reason="  Exact reviewed CEO reason  ",
			expected_version=str(doc.modified),
			command_id=uuid.uuid4().hex,
		)
		with acting_as(self.f.users["ceo"]):
			delegation.decide(**args)
			delegation.decide(**args)
		rows = self.records(doc.name)
		self.assertEqual(len(rows), 2)
		value = json.loads(next(row.envelope_json for row in rows if row.operation == "decide"))
		self.assertEqual(value["payload"], args)
		self.assertEqual(value["command_origin"], "client_command")
		self.assertEqual(value["before"]["approval_status"], "Pending CEO")
		self.assertEqual(value["after"]["approved_by"], self.f.users["ceo"])
		self.assertEqual(value["after"]["decision_reason"], args["reason"].strip())
		self.assertEqual((value["actor"], value["principal"]), (self.f.users["ceo"], self.f.users["ceo"]))

	def test_reject_decision_is_audited_as_rejected_not_approval(self):
		self.f.ceo()
		doc = self.f.grant(principal="ceo")
		self.f.approval(doc, decision="Reject")
		value = json.loads(
			next(row.envelope_json for row in self.records(doc.name) if row.operation == "decide")
		)
		self.assertEqual(value["payload"]["decision"], "Reject")
		self.assertEqual(value["after"]["approval_status"], "Rejected")

	def test_revision_captures_both_versions_without_native_duplicates(self):
		self.f.ceo()
		doc = self.f.grant(principal="ceo")
		self.f.approval(doc)
		doc.reload()
		approved = doc.approved_by
		args = dict(
			name=doc.name,
			process_scope="ALL",
			from_date=str(doc.from_date),
			to_date=str(doc.to_date),
			reason="New explicit authority scope",
			expected_version=str(doc.modified),
			command_id=uuid.uuid4().hex,
		)
		with acting_as(self.f.users["sector"]):
			new = delegation.revise(**args)
			self.assertEqual(delegation.revise(**args)["name"], new["name"])
		rows = self.records(doc.name)
		self.assertEqual(len(rows), 3)
		self.assertEqual(self.records(new["name"]), [])
		value = json.loads(next(row.envelope_json for row in rows if row.operation == "revise"))
		self.assertEqual(value["payload"], args)
		self.assertEqual(value["before"]["revoked"], 0)
		self.assertEqual(value["after"]["revoked"], 1)
		self.assertEqual(value["after"]["approved_by"], approved)
		self.assertEqual(value["related_before"], [])
		self.assertEqual(value["related_after"][0]["approval_status"], "Pending CEO")
		self.assertEqual(value["related_after"][0]["supersedes"], doc.name)
		self.assertEqual(value["related_added_to_capture"], [[doc.doctype, new["name"]]])

	def test_native_revocation_delta_and_noop_save_preserve_prior_authority(self):
		from frappe.client import save

		self.f.ceo()
		doc = self.f.grant(principal="ceo")
		self.f.approval(doc)
		doc.reload()
		approved = (doc.approved_by, str(doc.approved_on), doc.decision_reason)
		payload = doc.as_dict()
		payload.update(revoked=1, revocation_reason="Authority period ended")
		with acting_as(self.f.users["sector"]):
			save(frappe.as_json(payload))
		doc.reload()
		rows = self.records(doc.name)
		self.assertEqual(len(rows), 3)
		value = json.loads(next(row.envelope_json for row in rows if row.operation == "revoke"))
		self.assertEqual(value["command_origin"], "server_invocation")
		self.assertEqual(value["payload"]["native_change"]["revoked"], {"before": 0, "after": 1})
		self.assertEqual(value["after"]["revocation_reason"], "Authority period ended")
		self.assertEqual(value["after"], delegation_audit.project(doc))
		for field in (
			"approved_by",
			"approved_on",
			"decision_reason",
			"decision_key",
			"from_date",
			"to_date",
		):
			self.assertNotIn(field, value["payload"]["native_change"])
		self.assertEqual((doc.approved_by, str(doc.approved_on), doc.decision_reason), approved)
		with acting_as(self.f.users["sector"]):
			doc.save()
		self.assertEqual(len(self.records(doc.name)), 3)

	def test_denied_native_change_does_not_create_success_envelope(self):
		doc = self.f.grant()
		before = len(self.records(doc.name))
		frappe.db.set_value("Kandil Access Grant", self.f.grants["sector"], "revoked", 1)
		with self.f.rejected(frappe.PermissionError), acting_as(self.f.users["sector"]):
			doc.revoked, doc.revocation_reason = 1, "Must not succeed"
			doc.save()
		self.assertEqual(len(self.records(doc.name)), before)
		self.assertFalse(frappe.db.get_value(doc.doctype, doc.name, "revoked"))

	def test_audit_failure_rolls_back_revision_and_new_version(self):
		doc = self.f.grant()
		args = dict(
			name=doc.name,
			process_scope="TEAM",
			from_date=str(doc.from_date),
			to_date=str(doc.to_date),
			reason="Atomic synthetic revision",
			expected_version=str(doc.modified),
			command_id=uuid.uuid4().hex,
		)
		with self.f.rejected(RuntimeError), acting_as(self.f.users["sector"]):
			with patch.object(
				central.KandilCommandAudit, "insert", side_effect=RuntimeError("Synthetic audit failure")
			):
				delegation.revise(**args)
		self.assertFalse(frappe.db.get_value(doc.doctype, doc.name, "revoked"))
		self.assertEqual(frappe.db.count(doc.doctype, {"supersedes": doc.name}), 0)
		self.assertEqual(len(self.records(doc.name)), 1)
		with acting_as(self.f.users["sector"]):
			new = delegation.revise(**args)
		self.assertTrue(new["name"])
		self.assertEqual(len(self.records(doc.name)), 2)


class TestDelegationAuditInactive(unittest.TestCase):
	def test_adapter_is_noop_outside_active_parity(self):
		with (
			patch.object(central, "active", return_value=False),
			patch.object(central, "record_command") as record,
		):
			self.assertIsNone(delegation_audit.native(None))
			self.assertIsNone(delegation_audit.record("create", None, None, None, None, None, None))
			record.assert_not_called()


def run():
	if (
		frappe.local.site != "kandil-parity.localhost"
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
		or not frappe.conf.get("allow_tests")
		or not central.active()
	):
		raise RuntimeError("Delegation audit tests require isolated opted-in parity Administrator CLI")
	suite = unittest.TestSuite()
	for case, expected in ((TestDelegationAuditNative, 7), (TestDelegationAuditInactive, 1)):
		names = sorted(name for name in case.__dict__ if name.startswith("test_"))
		if len(names) != expected:
			raise RuntimeError("Unexpected delegation audit discovery count")
		suite.addTests(case(name) for name in names)
	result = unittest.TextTestRunner(verbosity=2).run(suite)
	value = dict(
		result="PASS" if result.wasSuccessful() and not result.skipped and result.testsRun == 8 else "FAIL",
		discovered=8,
		executed=result.testsRun,
		native=7,
		pure=1,
		failures=len(result.failures),
		errors=len(result.errors),
		skips=len(result.skipped),
	)
	if value["result"] != "PASS":
		error = AssertionError("Delegation audit checks failed")
		error.summary = value
		raise error
	return value
