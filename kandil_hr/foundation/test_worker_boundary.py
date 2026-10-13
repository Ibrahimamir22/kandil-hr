"""Internal worker transaction entry points reject business/HTTP callers."""
import unittest
from unittest.mock import patch

import frappe

from kandil_hr.foundation import outbox


class TestWorkerBoundary(unittest.TestCase):
    def setUp(self):
        self.user = frappe.session.user
        self.addCleanup(frappe.set_user, self.user)

    def test_guest_cannot_trigger_batch_or_targeted_commit(self):
        frappe.set_user('Guest')
        with patch.object(frappe.db, 'commit') as commit, patch.object(outbox, 'deliver') as deliver:
            for action in (outbox.process_pending, lambda: outbox.process_one('SYNTHETIC-NOT-READ')):
                with self.assertRaises(frappe.PermissionError):
                    action()
            commit.assert_not_called()
            deliver.assert_not_called()

    def test_http_administrator_cannot_trigger_worker_transaction(self):
        frappe.set_user('Administrator')
        with patch.object(frappe.local, 'request', object(), create=True), patch.object(frappe.db, 'commit') as commit:
            for action in (outbox.process_pending, lambda: outbox.process_one('SYNTHETIC-NOT-READ')):
                with self.assertRaises(frappe.PermissionError):
                    action()
            commit.assert_not_called()

    def test_disabled_feature_does_not_scan_or_deliver(self):
        frappe.set_user('Administrator')
        with patch.object(outbox, 'enabled', return_value=False), patch.object(frappe, 'get_all') as scan:
            self.assertIsNone(outbox.process_pending())
            scan.assert_not_called()


def run():
    from kandil_hr.foundation.concurrency_runner import _guard
    from kandil_hr.foundation.tests_runner import RecordedResult
    _guard()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestWorkerBoundary)
    result = unittest.TextTestRunner(verbosity=2, resultclass=RecordedResult).run(suite)
    summary = dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',
        total=result.testsRun, tests=result.checks, failures=len(result.failures),
        errors=len(result.errors), skipped=len(result.skipped))
    if summary['result'] != 'PASS' or result.testsRun != 3:
        raise AssertionError('Worker boundary tests failed or skipped')
    return summary
