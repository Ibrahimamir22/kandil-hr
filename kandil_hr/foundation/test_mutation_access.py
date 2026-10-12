"""Pure SQL-boundary checks complement the independent-connection native runner."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from kandil_hr.foundation import mutation_access as access


class Denied(Exception):
	pass


class TestMutationAccess(unittest.TestCase):
	def setUp(self):
		self.account_enabled = True
		self.roles = {"Kandil Recruiter"}
		self.grants = []
		self.queries = []

		def sql(query, values, as_dict=False):
			self.queries.append(query)
			if "tabUser" in query:
				return [SimpleNamespace(enabled=self.account_enabled)]
			if "tabHas Role" in query:
				return [(role,) for role in self.roles]
			if "tabKandil Access Grant" in query:
				return self.grants
			raise AssertionError("Unexpected SQL")

		def throw(message, error):
			raise error(message)

		self.addCleanup(patch.stopall)
		patch.object(
			access,
			"frappe",
			SimpleNamespace(
				session=SimpleNamespace(user="actor"),
				db=SimpleNamespace(sql=sql),
				throw=throw,
				PermissionError=Denied,
			),
		).start()
		patch.object(access, "enabled", return_value=True).start()
		patch.object(access, "_", side_effect=lambda value: value).start()
		patch.object(access, "today", return_value="2026-10-12").start()

	def grant(self, **values):
		defaults = dict(
			department=None,
			branch=None,
			valid_from="2026-01-01",
			valid_until=None,
			revoked=0,
			can_manage_recruitment=1,
			can_view_sensitive=0,
		)
		self.grants.append(SimpleNamespace(**(defaults | values)))

	def test_current_queries_are_locking_and_ordered(self):
		self.grant()
		self.assertEqual(
			access.assert_current_scope("company", required_roles=("Kandil Recruiter",)), self.roles
		)
		self.assertEqual(len(self.queries), 3)
		for query, table in zip(
			self.queries, ("tabUser", "tabHas Role", "tabKandil Access Grant"), strict=True
		):
			self.assertIn(table, query)
			self.assertIn("FOR UPDATE", query)

	def test_read_grant_cannot_manage_or_read_compensation(self):
		self.grant(can_manage_recruitment=0)
		access.assert_current_scope("company", capability="read")
		for capability in ("manage", "sensitive"):
			with self.assertRaises(Denied):
				access.assert_current_scope("company", capability=capability)

	def test_every_branch_and_department_must_match(self):
		self.grant(department="department", branch="A")
		access.assert_current_scope("company", "department", branches=["A"])
		for department, branches in (("department", ["A", "B"]), ("other", ["A"]), ("department", [])):
			with self.assertRaises(Denied):
				access.assert_current_scope("company", department, branches=branches)

	def test_revocation_expiry_and_future_grants_deny(self):
		self.grant(revoked=1)
		self.grant(valid_until="2026-10-11")
		self.grant(valid_from="2026-10-13")
		with self.assertRaises(Denied):
			access.assert_current_scope("company")

	def test_disabled_account_and_removed_role_deny(self):
		self.grant()
		self.roles = set()
		with self.assertRaises(Denied):
			access.assert_current_scope("company", required_roles=("Kandil Recruiter",))
		self.roles = {"Kandil Recruiter"}
		self.account_enabled = False
		with self.assertRaises(Denied):
			access.assert_current_scope("company", required_roles=("Kandil Recruiter",))
