import unittest
from unittest.mock import patch

import frappe

from kandil_hr.foundation import security


class TestAccessScope(unittest.TestCase):
	def setUp(self):
		self.enabled = patch.object(security, "enabled", return_value=True)
		self.enabled.start()
		self.addCleanup(self.enabled.stop)
		self.user_enabled = patch.object(frappe.db, "get_value", return_value=1)
		self.user_enabled.start()
		self.addCleanup(self.user_enabled.stop)
		self.today = patch.object(security, "today", return_value="2026-10-12")
		self.today.start()
		self.addCleanup(self.today.stop)

	def grant(self, **values):
		return frappe._dict(
			dict(
				department="Department A",
				branch="Branch A",
				valid_until=None,
				can_manage_recruitment=0,
				can_view_sensitive=0,
				**values,
			)
		)

	def test_branch_grant_does_not_imply_company_wide_access(self):
		with patch.object(frappe, "get_all", return_value=[self.grant()]):
			self.assertTrue(security.has_scope("user", "Company A", "Department A", "Branch A"))
			self.assertFalse(security.has_scope("user", "Company A", "Department A", "Branch B"))
			self.assertFalse(security.has_scope("user", "Company A", "Department A"))
			self.assertFalse(security.has_scope("user", "Company A", "Department B", "Branch A"))

	def test_expired_grant_and_disabled_account_fail(self):
		grant = self.grant()
		grant.valid_until = "2026-10-11"
		with patch.object(frappe, "get_all", return_value=[grant]):
			self.assertFalse(security.has_scope("user", "Company A", "Department A", "Branch A"))
		with patch.object(frappe.db, "get_value", return_value=0):
			self.assertFalse(security.has_scope("user", "Company A", "Department A", "Branch A"))

	def test_read_scope_does_not_grant_management_or_compensation(self):
		with patch.object(frappe, "get_all", return_value=[self.grant()]):
			for capability in ("manage", "sensitive", "arbitrary"):
				self.assertFalse(
					security.has_scope("user", "Company A", "Department A", "Branch A", capability)
				)

	def test_all_request_locations_must_be_permitted(self):
		doc = frappe._dict(
			company="Company A",
			department="Department A",
			lines=[frappe._dict(capacity="A"), frappe._dict(capacity="B")],
		)
		with (
			patch.object(frappe.db, "get_value", side_effect=["A", "B"]),
			patch.object(security, "has_scope", side_effect=[True, False]),
		):
			self.assertFalse(security.request_scope(doc, "user"))

	def test_scope_hook_adds_a_restriction_to_native_permissions(self):
		doc = frappe._dict(company="Company A", department="Department A", branch="Branch A")
		with patch.object(security, "has_scope", return_value=True):
			self.assertIs(security.scoped_permission(doc, "user", "write"), True)
		with patch.object(security, "has_scope", return_value=False):
			self.assertIs(security.scoped_permission(doc, "user", "write"), False)

	def test_sensitive_read_capability_cannot_authorize_writing_an_offer(self):
		doc = frappe._dict(
			doctype="Job Offer", company="Company A", department="Department A", branch="Branch A"
		)
		with (
			patch.object(security, "linked_request", return_value=None),
			patch.object(security, "has_scope", side_effect=[True, False]) as check,
		):
			self.assertIs(security.hr_permission(doc, "user", "write"), False)
			self.assertEqual(check.call_args_list[0].args[-1], "sensitive")
			self.assertEqual(check.call_args_list[1].args[-1], "manage")

	def test_disabled_employee_query_does_not_allow_self_record(self):
		with patch.object(frappe.db, "get_value", return_value=0):
			self.assertEqual(security.hr_query("Employee", "disabled-user"), "1=0")

	def test_private_hr_file_cannot_be_detached_to_escape_scope(self):
		from unittest.mock import Mock

		doc = Mock()
		doc.get_doc_before_save.return_value = frappe._dict(
			attached_to_doctype="Kandil Hiring Request", attached_to_name="REQ"
		)
		doc.attached_to_doctype, doc.attached_to_name, doc.is_private = None, None, 1
		with self.assertRaises(frappe.ValidationError):
			security.validate_private_file(doc)
