"""Real synthetic payroll fixtures and native endpoint execution, rollback only.

This proves only implemented recruitment SLA/local-notification jobs. No overdue
employee-document job exists yet, so that future acceptance remains unproved.
Calls below enter native endpoint/controller dispatch, not an HTTP login session.
"""

import hashlib
import json
import unittest
from typing import ClassVar
from unittest.mock import patch

import frappe

from kandil_hr.foundation import outbox
from kandil_hr.recruitment.test_commands import acting_as

WAGE_TABLES = (
	"Salary Slip",
	"Salary Detail",
	"Payroll Entry",
	"Payroll Employee Detail",
	"Additional Salary",
	"Salary Structure Assignment",
	"Salary Withholding",
	"Salary Withholding Cycle",
	"Payment Entry",
	"Payment Entry Reference",
	"Payment Entry Deduction",
	"Journal Entry",
	"Journal Entry Account",
	"GL Entry",
	"Payment Ledger Entry",
)


def wage_snapshot():
	"""Whole-table fingerprints detect edits/deletes AND unintended new records."""
	return {
		doctype: {
			"count": len(rows := frappe.db.sql(f"select * from `tab{doctype}` order by name", as_dict=True)),
			"sha256": hashlib.sha256(json.dumps(rows, sort_keys=True, default=str).encode()).hexdigest(),
		}
		for doctype in WAGE_TABLES
	}


class TestPayrollBoundary(unittest.TestCase):
	observations: ClassVar[list] = []

	def setUp(self):
		from kandil_hr.recruitment.test_sla import TestApprovalSLA

		self.sla = TestApprovalSLA()
		self.addCleanup(self.sla.doCleanups)
		self.sla.setUp()
		self.f = self.sla.fixture
		self.build_payroll()

	def build_payroll(self):
		f = self.f
		company = frappe.get_doc("Company", f.company)
		currency = company.default_currency
		payable = frappe.db.get_value(
			"Account", {"company": f.company, "is_group": 0, "account_name": "Payroll Payable"}, "name"
		)
		self.assertTrue(payable, "Synthetic Company needs native payroll payable account")
		cash = frappe.db.get_value(
			"Account", {"company": f.company, "is_group": 0, "account_type": "Cash"}, "name"
		)
		self.assertTrue(cash, "Synthetic Company needs native cash account")
		cost_center = company.cost_center
		self.assertTrue(cost_center)
		holiday = f.insert(
			"Holiday List",
			holiday_list_name=f.prefix + " wage holiday",
			from_date="2026-01-01",
			to_date="2026-12-31",
		)
		self.employee = f.insert(
			"Employee",
			first_name=f.prefix + " Wage Fixture",
			gender="Male",
			date_of_birth="1990-01-01",
			date_of_joining="2026-01-01",
			company=f.company,
			department=f.department,
			status="Active",
			holiday_list=holiday.name,
			payroll_cost_center=cost_center,
		)
		f.insert(
			"Holiday List Assignment",
			holiday_list=holiday.name,
			applicable_for="Employee",
			assigned_to=self.employee.name,
			from_date="2026-01-01",
		).submit()
		earning = f.insert(
			"Salary Component",
			salary_component=f.prefix + " Basic",
			salary_component_abbr="E" + f.prefix[-8:],
			type="Earning",
			depends_on_payment_days=0,
			is_tax_applicable=0,
		)
		deduction = f.insert(
			"Salary Component",
			salary_component=f.prefix + " Deduction",
			salary_component_abbr="D" + f.prefix[-8:],
			type="Deduction",
			depends_on_payment_days=0,
		)
		structure = f.insert(
			"Salary Structure",
			name=f.prefix + " Wage Structure",
			company=f.company,
			currency=currency,
			payroll_frequency="Monthly",
			is_active="Yes",
			earnings=[dict(salary_component=earning.name, amount=10000)],
			deductions=[dict(salary_component=deduction.name, amount=100)],
		)
		structure.submit()
		self.structure = structure
		self.assignment = f.insert(
			"Salary Structure Assignment",
			employee=self.employee.name,
			company=f.company,
			salary_structure=structure.name,
			from_date="2026-01-01",
			currency=currency,
			base=10000,
			payroll_payable_account=payable,
			payroll_cost_centers=[dict(cost_center=cost_center, percentage=100)],
		)
		self.assignment.submit()
		self.additional = f.insert(
			"Additional Salary",
			employee=self.employee.name,
			company=f.company,
			salary_component=deduction.name,
			type="Deduction",
			amount=50,
			currency=currency,
			payroll_date="2026-10-12",
		)
		self.additional.submit()
		self.payroll = f.insert(
			"Payroll Entry",
			company=f.company,
			posting_date="2026-10-12",
			start_date="2026-10-01",
			end_date="2026-10-31",
			payroll_frequency="Monthly",
			currency=currency,
			exchange_rate=1,
			payroll_payable_account=payable,
			cost_center=cost_center,
			employees=[dict(employee=self.employee.name, employee_name=self.employee.employee_name)],
		)
		self.slip = f.insert(
			"Salary Slip",
			employee=self.employee.name,
			company=f.company,
			posting_date="2026-10-12",
			start_date="2026-10-01",
			end_date="2026-10-31",
			payroll_frequency="Monthly",
			currency=currency,
			exchange_rate=1,
			salary_structure=structure.name,
			payroll_entry=self.payroll.name,
		)
		self.payment = f.insert(
			"Payment Entry",
			payment_type="Pay",
			company=f.company,
			posting_date="2026-10-12",
			party_type="Employee",
			party=self.employee.name,
			paid_from=cash,
			paid_to=payable,
			paid_from_account_currency=currency,
			paid_to_account_currency=currency,
			paid_amount=9850,
			received_amount=9850,
			source_exchange_rate=1,
			target_exchange_rate=1,
			reference_no=f.prefix,
			reference_date="2026-10-12",
			cost_center=cost_center,
		)
		self.assertGreater(self.slip.gross_pay, 0)
		self.assertGreater(self.slip.total_deduction, 0)
		self.assertEqual(self.additional.type, "Deduction")
		self.assertEqual(self.additional.docstatus, 1)
		self.assertEqual(self.payment.docstatus, 0)
		self.documents = [self.slip, self.payroll, self.additional, self.assignment, self.payment]

	def test_implemented_overdue_sla_and_notification_jobs_have_zero_wage_effect(self):
		before = wage_snapshot()
		with patch.object(frappe, "enqueue", wraps=frappe.enqueue) as enqueue:
			for day in ("2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-20"):
				result = self.sla.process_on(day)
				self.assertTrue(result["outbox"])
				for name in result["outbox"]:
					self.assertIn(outbox.deliver(name), ("Delivered locally", "Suppressed"))
				self.assertEqual(before, wage_snapshot(), day)
			enqueue.assert_not_called()
		self.assertEqual(self.f.load(self.sla.request.name).status, "Pending")
		self.observations.append(
			dict(
				case="WAG-001-01",
				before=before,
				after=wage_snapshot(),
				queued_jobs=enqueue.call_count,
				payroll_fixtures=[dict(doctype=d.doctype, docstatus=d.docstatus) for d in self.documents],
				scope="Actual SLA process_request and outbox deliver, including expiry/replay; scheduler batch commit wrappers not called",
			)
		)

	def test_recruitment_roles_cannot_mutate_wages_via_native_client_endpoints(self):
		from frappe import client

		before = wage_snapshot()
		for role_user in self.f.users.values():
			with acting_as(role_user):
				for doc in self.documents:
					with self.subTest(user=role_user, doctype=doc.doctype):
						with self.assertRaises(frappe.PermissionError):
							client.set_value(doc.doctype, doc.name, "company", self.f.company)
						with self.assertRaises(frappe.PermissionError):
							client.save(doc.as_json())
						if doc.docstatus == 0:
							with self.assertRaises(frappe.PermissionError):
								client.submit(doc.as_json())
						else:
							with self.assertRaises(frappe.PermissionError):
								client.cancel(doc.doctype, doc.name)
						with self.assertRaises(frappe.PermissionError):
							client.delete(doc.doctype, doc.name)
				with self.assertRaises(frappe.PermissionError):
					client.insert(
						dict(
							doctype="Additional Salary",
							employee=self.employee.name,
							company=self.f.company,
							salary_component=self.additional.salary_component,
							type="Deduction",
							amount=999,
							payroll_date="2026-10-12",
						)
					)
		self.assertEqual(before, wage_snapshot())
		self.observations.append(
			dict(
				case=self._testMethodName,
				before=before,
				after=wage_snapshot(),
				roles=list(self.f.users),
				endpoint_denials=True,
			)
		)

	def test_recruitment_roles_cannot_call_native_payroll_controller_endpoints(self):
		from frappe.handler import run_doc_method

		before = wage_snapshot()
		methods = (
			"create_salary_slips",
			"submit_salary_slips",
			"make_bank_entry",
			"create_overtime_slips",
			"submit_overtime_slips",
		)
		for role_user in self.f.users.values():
			with acting_as(role_user):
				for method in methods:
					with (
						self.subTest(user=role_user, method=method),
						self.assertRaises(frappe.PermissionError),
					):
						run_doc_method(method, dt="Payroll Entry", dn=self.payroll.name)
				with self.assertRaises(frappe.PermissionError):
					run_doc_method(
						"assign_salary_structure",
						dt="Salary Structure",
						dn=self.structure.name,
						args={"employee": self.employee.name, "from_date": "2026-11-01", "base": 1},
					)
				for method in (
					"get_emp_and_working_day_details",
					"process_salary_based_on_working_days",
					"set_totals",
				):
					with (
						self.subTest(user=role_user, method=method),
						self.assertRaises(frappe.PermissionError),
					):
						run_doc_method(method, dt="Salary Slip", dn=self.slip.name)
		self.assertEqual(before, wage_snapshot())
		self.observations.append(
			dict(
				case=self._testMethodName,
				before=before,
				after=wage_snapshot(),
				roles=list(self.f.users),
				endpoint_denials=True,
			)
		)


def run():
	"""Internal parity CLI runner; explicit nonzero native discovery and rollback."""
	from kandil_hr.foundation.concurrency_runner import _guard
	from kandil_hr.foundation.tests_runner import RecordedResult

	_guard()
	TestPayrollBoundary.observations = []
	suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestPayrollBoundary)
	assert suite.countTestCases() == 3
	result = unittest.TextTestRunner(verbosity=2, resultclass=RecordedResult).run(suite)
	summary = dict(
		result="PASS" if result.wasSuccessful() and not result.skipped else "FAIL",
		discovered=3,
		total=result.testsRun,
		tests=result.checks,
		failures=len(result.failures),
		errors=len(result.errors),
		skipped=len(result.skipped),
		classification="3 native database/endpoint-execution checks; no HTTP session proof",
		observations=TestPayrollBoundary.observations,
		limitation="No overdue-document job exists yet; only implemented recruitment SLA and local notifications are exercised.",
	)
	if not result.wasSuccessful() or result.skipped or result.testsRun != 3:
		error = AssertionError("Payroll boundary checks failed")
		error.summary = summary
		raise error
	return summary
