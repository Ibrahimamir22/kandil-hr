"""Native permissions proof, not a P8 probation workflow or HTTP-session test.

An APPROVALS-only delegate may decide their delegated request but cannot use
native Employee confirmation or Employee Transfer writes. Synthetic fixtures
roll back; no grants are widened to make the denials pass. Run only under an
exclusive parity test lease using this module's internal run entry point.
"""

import json
import unittest

import frappe
from frappe import client
from frappe.utils import add_days

from kandil_hr.foundation import delegation
from kandil_hr.foundation.clock import today_cairo
from kandil_hr.foundation.test_delegation import TestDelegation
from kandil_hr.recruitment.test_commands import acting_as


class TestDelegateNativeIsolation(unittest.TestCase):
	def setUp(self):
		self.f = TestDelegation()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()
		f = self.f
		f.actor("delegate", ["Kandil Approver"])
		self.employee = f.insert(
			"Employee",
			first_name=f.prefix + " Confirmation Fixture",
			gender="Male",
			date_of_birth="1990-01-01",
			date_of_joining=today_cairo(),
			company=f.company,
			department=f.department,
			designation=f.designation,
			status="Active",
		)
		self.destination = f.insert("Designation", designation_name=f.prefix + " Transfer Destination")
		self.transfer_values = dict(
			doctype="Employee Transfer",
			employee=self.employee.name,
			company=f.company,
			department=f.department,
			transfer_date=today_cairo(),
			transfer_details=[
				dict(
					property="Designation",
					fieldname="designation",
					current=f.designation,
					new=self.destination.name,
				)
			],
		)
		self.transfer = frappe.get_doc(self.transfer_values).insert(ignore_permissions=True)
		self.original_access = self.access_snapshot()
		self.grant = f.grant("APPROVALS")
		self.assertEqual(self.original_access, self.access_snapshot())
		self.request = f.request((1,))
		f.submit(self.request.name)
		self.original_employee = self.record("Employee", self.employee.name)
		self.original_transfer = self.record("Employee Transfer", self.transfer.name)
		self.original_transfers = frappe.get_all(
			"Employee Transfer", filters={"employee": self.employee.name}, pluck="name", order_by="name"
		)

	@staticmethod
	def record(doctype, name):
		return frappe.as_json(frappe.get_doc(doctype, name).as_dict())

	def access_snapshot(self):
		user = self.f.users["delegate"]
		return frappe.as_json(
			{
				"roles": frappe.get_all(
					"Has Role", filters={"parent": user, "parenttype": "User"}, fields=["*"], order_by="name"
				),
				"grants": frappe.get_all(
					"Kandil Access Grant", filters={"user": user}, fields=["*"], order_by="name"
				),
				"native_user_permissions": frappe.get_all(
					"User Permission", filters={"user": user}, fields=["*"], order_by="name"
				),
			}
		)

	def unchanged(self):
		self.assertEqual(self.original_access, self.access_snapshot())
		self.assertEqual(self.original_employee, self.record("Employee", self.employee.name))
		self.assertEqual(self.original_transfer, self.record("Employee Transfer", self.transfer.name))
		self.assertEqual(
			self.original_transfers,
			frappe.get_all(
				"Employee Transfer", filters={"employee": self.employee.name}, pluck="name", order_by="name"
			),
		)

	def allowed_request_approval(self):
		f = self.f
		doc = f.load(self.request.name)
		self.assertIsNone(
			delegation.find_delegation(doc, f.users["manager"], f.users["delegate"], process="TEAM")
		)
		self.assertEqual(
			delegation.find_delegation(doc, f.users["manager"], f.users["delegate"]), self.grant.name
		)
		f.decide(doc.name, "delegate")
		step = f.load(doc.name).approval_steps[0]
		self.assertEqual(
			(step.decision, step.actor, step.principal), ("Approved", f.users["delegate"], f.users["manager"])
		)
		self.unchanged()

	def test_approvals_delegate_cannot_change_native_confirmation(self):
		payload = json.loads(self.original_employee)
		payload["final_confirmation_date"] = str(add_days(today_cairo(), 30))
		for operation in (
			lambda: client.save(frappe.as_json(payload)),
			lambda: client.set_value(
				"Employee", self.employee.name, "final_confirmation_date", payload["final_confirmation_date"]
			),
		):
			# Do not roll back each attempted write before checking: that could mask
			# side effects occurring before a late PermissionError.
			with acting_as(self.f.users["delegate"]), self.assertRaises(frappe.PermissionError):
				operation()
			self.unchanged()
		self.allowed_request_approval()

	def test_approvals_delegate_cannot_create_update_submit_or_delete_transfer(self):
		payload = json.loads(self.original_transfer)
		payload["transfer_date"] = str(add_days(today_cairo(), -1))
		for operation in (
			lambda: client.insert(frappe.as_json(self.transfer_values)),
			lambda: client.save(frappe.as_json(payload)),
			lambda: client.set_value(
				"Employee Transfer", self.transfer.name, "transfer_date", payload["transfer_date"]
			),
			lambda: client.submit(self.original_transfer),
			lambda: client.delete("Employee Transfer", self.transfer.name),
		):
			with acting_as(self.f.users["delegate"]), self.assertRaises(frappe.PermissionError):
				operation()
			self.unchanged()
		self.allowed_request_approval()


def run():
	"""Internal rollback-only runner; requires the exact opted-in parity CLI site."""
	from kandil_hr.foundation.concurrency_runner import _guard
	from kandil_hr.foundation.tests_runner import RecordedResult

	_guard()
	suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestDelegateNativeIsolation)
	assert suite.countTestCases() == 2
	result = unittest.TextTestRunner(verbosity=2, resultclass=RecordedResult).run(suite)
	summary = dict(
		result="PASS" if result.wasSuccessful() and not result.skipped else "FAIL",
		discovered=2,
		executed=result.testsRun,
		failures=len(result.failures),
		errors=len(result.errors),
		skips=len(result.skipped),
		tests=result.checks,
		classification="2 native ORM/client endpoint checks; synthetic fixtures rolled back",
		limitation="No HTTP session proof or P8 probation lifecycle; confirmation fields are native Employee data only. No baseline promotion.",
	)
	if not result.wasSuccessful() or result.skipped or result.testsRun != 2:
		error = AssertionError("Native delegate isolation checks failed")
		error.summary = summary
		raise error
	return summary
