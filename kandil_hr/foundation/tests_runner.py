"""Explicit synthetic-site suite: bench --site kandil-parity.localhost execute
kandil_hr.foundation.tests_runner.run

The caller owns transaction rollback/disconnect. No implicit discovery of
imported fixture TestCase classes, no zero-test success, and no skipped acceptance.
"""

import importlib
import unittest

import frappe

CASES = (
	("test_calendar", "TestBusinessCalendar", 9),
	("test_clock", "TestCairoClock", 5),
	("test_security", "TestAccessScope", 8),
	("test_mutation_access", "TestMutationAccess", 5),
	("test_foundation", "TestFoundationDatabase", 15),
	("test_boundaries", "TestNativeBoundaries", 6),
	("test_reports_accounts", "TestReportsAndAccounts", 4),
)


class RecordedResult(unittest.TextTestResult):
	def __init__(self, *args, **kwargs):
		super().__init__(*args, **kwargs)
		self.checks = []

	def addSuccess(self, test):
		super().addSuccess(test)
		self.checks.append({"test": test.id(), "status": "PASS"})

	def addFailure(self, test, err):
		super().addFailure(test, err)
		self.checks.append({"test": test.id(), "status": "FAIL", "error_type": err[0].__name__})

	def addError(self, test, err):
		super().addError(test, err)
		self.checks.append({"test": test.id(), "status": "ERROR", "error_type": err[0].__name__})

	def addSkip(self, test, reason):
		super().addSkip(test, reason)
		self.checks.append({"test": test.id(), "status": "SKIP"})


def run():
	"""Internal CLI-only entry; returns counts or raises with the failed result."""
	if (
		frappe.local.site != "kandil-parity.localhost"
		or not all(
			frappe.conf.get(key)
			for key in (
				"allow_tests",
				"kandil_pilot_enabled",
				"kandil_foundation_enabled",
				"kandil_parity_enabled",
			)
		)
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
	):
		raise RuntimeError("Foundation checks require the opted-in isolated parity CLI site")
	suite = unittest.TestSuite()
	counts = {}
	for module_name, class_name, expected in CASES:
		module = importlib.import_module("kandil_hr.foundation." + module_name)
		case = getattr(module, class_name)
		if case.__module__ != module.__name__:
			raise RuntimeError("Imported fixture classes cannot count as discovered checks")
		group = unittest.defaultTestLoader.loadTestsFromTestCase(case)
		counts[module_name] = group.countTestCases()
		if counts[module_name] != expected:
			raise RuntimeError(
				f"Unexpected check count for {module_name}: {counts[module_name]} != {expected}"
			)
		suite.addTests(group)
	expected_total = sum(count for _, _, count in CASES)
	old_in_test = frappe.flags.get("in_test")
	frappe.flags.in_test = True
	try:
		result = unittest.TextTestRunner(verbosity=2, resultclass=RecordedResult).run(suite)
	finally:
		frappe.flags.in_test = old_in_test
	passed = result.wasSuccessful() and not result.skipped and result.testsRun == expected_total > 0
	summary = dict(
		result="PASS" if passed else "FAIL",
		discovered=sum(counts.values()),
		total=result.testsRun,
		groups=counts,
		failures=len(result.failures),
		errors=len(result.errors),
		skipped=len(result.skipped),
		tests=result.checks,
	)
	if not passed:
		error = AssertionError(
			"Foundation checks failed, skipped, or did not execute the declared nonzero suite"
		)
		error.summary = summary
		raise error
	return summary
