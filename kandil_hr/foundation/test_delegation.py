"""Explicit scoped delegation cases using ordinary synthetic authority users."""

import unittest
import uuid

import frappe
from frappe.utils import add_days

from kandil_hr.foundation import delegation
from kandil_hr.foundation.clock import today_cairo
from kandil_hr.recruitment import api
from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as


class TestDelegation(TestRecruitmentCommands):
	def actor(self, key, roles):
		user = self.prefix.lower() + "-" + key + "@example.invalid"
		self.insert(
			"User",
			email=user,
			first_name=key,
			enabled=1,
			send_welcome_email=0,
			user_type="System User",
			roles=[dict(role=role) for role in roles],
		)
		self.users[key] = user
		self.grants[key] = self.insert(
			"Kandil Access Grant",
			user=user,
			company=self.company,
			department=self.department,
			valid_from=today_cairo(),
			can_manage_recruitment=1,
			reason="Synthetic delegation authority",
		).name
		return user

	def grant(self, process="APPROVALS", principal="manager", **values):
		if "delegate" not in self.users:
			self.actor("delegate", ["Kandil Approver"])
		data = dict(
			doctype="Kandil Delegation",
			company=self.company,
			department=self.department,
			from_user=self.users[principal],
			to_user=self.users["delegate"],
			from_date=today_cairo(),
			to_date=add_days(today_cairo(), 10),
			reason="Synthetic explicit delegation",
			process_scope=process,
		)
		data.update(values)
		with acting_as(self.users["sector"]):
			return frappe.get_doc(data).insert()

	def ceo(self):
		user = self.actor("ceo", ["Kandil CEO Approver"])
		settings = frappe.get_doc("Kandil Organization Settings", self.company)
		settings.ceo_approver = user
		settings.save(ignore_permissions=True)
		return user

	def approval(self, doc, actor="ceo", decision="Approve", **values):
		args = dict(
			name=doc.name,
			decision=decision,
			reason="Recorded CEO authority decision",
			expected_version=str(doc.modified),
			command_id=uuid.uuid4().hex,
		)
		args.update(values)
		with acting_as(self.users[actor]):
			return delegation.decide(**args)

	def test_process_isolation_revocation_preserves_prior_decision(self):
		grant = self.grant("TEAM")
		req = self.request((1,))
		self.submit(req.name)
		with self.rejected(frappe.PermissionError):
			self.decide(req.name, "delegate")
		self.assertIsNone(
			delegation.find_delegation(self.load(req.name), self.users["manager"], self.users["delegate"])
		)
		self.assertEqual(
			delegation.find_delegation(
				self.load(req.name), self.users["manager"], self.users["delegate"], process="TEAM"
			),
			grant.name,
		)
		with acting_as(self.users["sector"]):
			grant.revoked = 1
			grant.revocation_reason = "Synthetic explicit stop reason"
			grant.save()
		grant = self.grant("APPROVALS")
		self.assertIsNone(
			delegation.find_delegation(
				self.load(req.name), self.users["manager"], self.users["delegate"], process="TEAM"
			)
		)
		with acting_as(self.users["delegate"]):
			self.assertFalse(frappe.has_permission("Employee Transfer", "create"))
		self.decide(req.name, "delegate")
		old = self.load(req.name).approval_steps[0].as_dict()
		other = self.request((1,))
		self.submit(other.name)
		with acting_as(self.users["sector"]):
			grant.revoked = 1
			grant.revocation_reason = "Synthetic explicit stop reason"
			grant.save()
		with self.rejected(frappe.PermissionError):
			self.decide(other.name, "delegate")
		self.assertEqual(self.load(req.name).approval_steps[0].as_dict(), old)

	def test_disabled_principal_and_revoked_delegate_scope_deny_next_decision(self):
		self.grant()
		req = self.request((1,))
		self.submit(req.name)
		frappe.db.set_value("User", self.users["manager"], "enabled", 0)
		with self.rejected(frappe.PermissionError):
			self.decide(req.name, "delegate")
		frappe.db.set_value("User", self.users["manager"], "enabled", 1)
		frappe.db.set_value("Kandil Access Grant", self.grants["delegate"], "revoked", 1)
		with self.rejected(frappe.PermissionError):
			self.decide(req.name, "delegate")
		self.assertEqual(self.load(req.name).approval_steps[0].decision, "Pending")

	def test_ceo_pending_then_explicit_approval_allows_delegated_request_decision(self):
		self.ceo()
		grant = self.grant(principal="ceo")
		self.assertEqual(grant.approval_status, "Pending CEO")
		req = self.request((1,))
		self.submit(req.name)
		self.decide(req.name, "manager")
		self.call("hr", api.send_to_ceo, req.name, reason="Explicit CEO budget review")
		self.decide(req.name, "hr")
		with self.rejected(frappe.PermissionError):
			self.decide(req.name, "delegate")
		with self.rejected(frappe.PermissionError):
			self.approval(grant, actor="sector")
		self.approval(grant)
		grant.reload()
		self.assertEqual(grant.approved_by, self.users["ceo"])
		self.decide(req.name, "delegate")
		step = self.load(req.name).approval_steps[-1]
		self.assertEqual(
			(step.principal, step.actor, step.decision),
			(self.users["ceo"], self.users["delegate"], "Approved"),
		)

	def test_ceo_scope_revision_is_new_pending_version_and_preserves_original_approval(self):
		self.ceo()
		grant = self.grant(principal="ceo")
		self.approval(grant)
		grant.reload()
		original = (grant.process_scope, grant.approved_by, str(grant.approved_on), grant.decision_key)
		args = dict(
			name=grant.name,
			process_scope="ALL",
			from_date=str(grant.from_date),
			to_date=str(grant.to_date),
			reason="Explicit broader process version",
			expected_version=str(grant.modified),
			command_id=uuid.uuid4().hex,
		)
		with acting_as(self.users["sector"]):
			new = delegation.revise(**args)
			replay = delegation.revise(**args)
		self.assertEqual(new["name"], replay["name"])
		self.assertNotEqual(new["name"], grant.name)
		self.assertEqual(
			(new["supersedes"], new["delegation_version"], new["approval_status"]),
			(grant.name, 2, "Pending CEO"),
		)
		grant.reload()
		self.assertEqual(grant.revoked, 1)
		self.assertEqual(grant.revocation_reason, new["reason"])
		self.assertEqual(
			(grant.process_scope, grant.approved_by, str(grant.approved_on), grant.decision_key), original
		)
		newdoc = frappe.get_doc("Kandil Delegation", new["name"])
		self.approval(newdoc)
		req = self.request((1,))
		for process in ("APPROVALS", "TEAM"):
			self.assertEqual(
				delegation.find_delegation(req, self.users["ceo"], self.users["delegate"], process=process),
				new["name"],
			)

	def test_native_metadata_scope_forgery_and_unapproved_promotion_denied(self):
		grant = self.grant()
		with self.rejected(frappe.PermissionError), acting_as(self.users["sector"]):
			grant.approved_by = self.users["sector"]
			grant.save()
		grant.reload()
		with self.rejected(frappe.ValidationError), acting_as(self.users["sector"]):
			grant.process_scope = "ALL"
			grant.save()
		# A formerly ordinary principal cannot carry an unapproved grant into CEO authority.
		frappe.get_doc("User", self.users["manager"]).add_roles("Kandil CEO Approver")
		settings = frappe.get_doc("Kandil Organization Settings", self.company)
		settings.ceo_approver = self.users["manager"]
		settings.save(ignore_permissions=True)
		req = self.request((1,))
		self.assertIsNone(delegation.find_delegation(req, self.users["manager"], self.users["delegate"]))

	def test_ceo_rejection_pending_revocation_and_disabled_ceo_are_inactive(self):
		self.ceo()
		grant = self.grant(principal="ceo")
		self.approval(grant, decision="Reject")
		grant.reload()
		self.assertEqual(grant.approval_status, "Rejected")
		pending = self.grant(principal="ceo")
		with acting_as(self.users["sector"]):
			pending.revoked = 1
			pending.revocation_reason = "Synthetic explicit stop reason"
			pending.save()
		with self.rejected(frappe.ValidationError):
			self.approval(pending)
		third = self.grant(principal="ceo")
		frappe.db.set_value("User", self.users["ceo"], "enabled", 0)
		with self.rejected(frappe.PermissionError):
			self.approval(third)
		third.reload()
		self.assertEqual(third.approval_status, "Pending CEO")
		frappe.db.set_value("User", self.users["ceo"], "enabled", 1)
		self.approval(third)
		third.reload()
		approved = (third.approved_by, str(third.approved_on), third.decision_reason)
		payload = third.as_dict()
		payload.update(revoked=1, revocation_reason="CEO delegated period has ended")
		from frappe.client import save

		with acting_as(self.users["sector"]):
			save(frappe.as_json(payload))
		third.reload()
		self.assertEqual((third.approved_by, str(third.approved_on), third.decision_reason), approved)
		self.assertEqual((third.revoked, third.approval_status), (1, "Revoked"))

	def test_native_revoke_requires_current_actor_scope_but_allows_disabled_principal(self):
		grant = self.grant()
		frappe.db.set_value("Kandil Access Grant", self.grants["sector"], "revoked", 1)
		with self.rejected(frappe.PermissionError), acting_as(self.users["sector"]):
			grant.revoked = 1
			grant.revocation_reason = "Synthetic explicit stop reason"
			grant.save()
		grant.reload()
		self.assertFalse(grant.revoked)
		frappe.db.set_value("Kandil Access Grant", self.grants["sector"], "revoked", 0)
		frappe.db.set_value("User", self.users["manager"], "enabled", 0)
		with acting_as(self.users["sector"]):
			grant.revoked = 1
			grant.revocation_reason = "Synthetic explicit stop reason"
			grant.save()
		grant.reload()
		self.assertEqual((grant.revoked, grant.approval_status), (1, "Revoked"))

	def test_legacy_missing_fields_remain_inactive_and_can_be_revoked_or_versioned(self):
		def legacy(doc):
			frappe.db.set_value(
				"Kandil Delegation",
				doc.name,
				dict(process_scope=None, approval_status=None, delegation_version=0),
			)
			return frappe.get_doc("Kandil Delegation", doc.name)

		old = legacy(self.grant())
		req = self.request((1,))
		self.assertIsNone(delegation.find_delegation(req, self.users["manager"], self.users["delegate"]))
		with acting_as(self.users["sector"]):
			old.revoked = 1
			old.revocation_reason = "Synthetic explicit stop reason"
			old.save()
		self.assertEqual((old.revoked, old.delegation_version), (1, 1))
		another = legacy(self.grant())
		with acting_as(self.users["sector"]):
			new = delegation.revise(
				name=another.name,
				process_scope="TEAM",
				from_date=str(another.from_date),
				to_date=str(another.to_date),
				reason="Explicit review of legacy unit work",
				expected_version=str(another.modified),
				command_id=uuid.uuid4().hex,
			)
		self.assertEqual((new["delegation_version"], new["approval_status"]), (2, "Active"))
		self.ceo()
		ceo_old = legacy(self.grant(principal="ceo"))
		self.assertIsNone(delegation.find_delegation(req, self.users["ceo"], self.users["delegate"]))
		with self.rejected(frappe.TimestampMismatchError):
			self.approval(ceo_old)

	def test_native_revocation_requires_fresh_reason_and_keeps_original_immutable(self):
		from frappe.client import save

		grant = self.grant()
		original = grant.reason
		before = frappe.db.count("Kandil Security Event", {"reference": grant.name})
		for reason in (None, "", "  ", "ab", "x" * 2001):
			payload = grant.as_dict()
			payload.update(revoked=1, revocation_reason=reason)
			with self.rejected(frappe.ValidationError), acting_as(self.users["sector"]):
				save(frappe.as_json(payload))
			self.assertFalse(frappe.get_doc("Kandil Delegation", grant.name).revoked)
		self.assertEqual(frappe.db.count("Kandil Security Event", {"reference": grant.name}), before)
		payload = grant.as_dict()
		payload.update(revoked=1, revocation_reason="  Return from leave  ")
		with acting_as(self.users["sector"]):
			save(frappe.as_json(payload))
		grant.reload()
		self.assertEqual((grant.reason, grant.revocation_reason), (original, "Return from leave"))
		self.assertEqual((grant.revoked, grant.approval_status), (1, "Revoked"))
		self.assertEqual(frappe.db.count("Kandil Security Event", {"reference": grant.name}), before + 1)
		for field, value in (
			("revocation_reason", ""),
			("revocation_reason", "Replacement"),
			("reason", "Rewritten"),
		):
			payload = grant.as_dict()
			payload[field] = value
			with self.rejected(frappe.ValidationError), acting_as(self.users["sector"]):
				save(frappe.as_json(payload))
		grant.reload()
		self.assertEqual((grant.reason, grant.revocation_reason), (original, "Return from leave"))

	def test_revocation_reason_cannot_be_preloaded_on_active_delegation(self):
		# Keep the user outside the rejected insertion's savepoint.
		self.actor("delegate", ["Kandil Approver"])
		with self.rejected(frappe.ValidationError):
			self.grant(revocation_reason="Preloaded old justification")
		grant = self.grant()
		with self.rejected(frappe.ValidationError), acting_as(self.users["sector"]):
			grant.revocation_reason = "Preloaded old justification"
			grant.save()


def run():
	if (
		frappe.local.site != "kandil-parity.localhost"
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
		or not all(
			frappe.conf.get(flag)
			for flag in (
				"allow_tests",
				"kandil_pilot_enabled",
				"kandil_foundation_enabled",
				"kandil_parity_enabled",
			)
		)
	):
		raise RuntimeError("Requires isolated synthetic parity Administrator test context")
	names = sorted(name for name in TestDelegation.__dict__ if name.startswith("test_"))
	assert len(names) == 10
	result = unittest.TextTestRunner(verbosity=2).run(
		unittest.TestSuite(TestDelegation(name) for name in names)
	)
	value = dict(
		discovered=len(names),
		executed=result.testsRun,
		failures=len(result.failures),
		errors=len(result.errors),
		skips=len(result.skipped),
	)
	if not result.wasSuccessful() or result.skipped:
		raise RuntimeError(str(value))
	return value
