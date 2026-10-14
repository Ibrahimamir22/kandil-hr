"""Native synthetic referral intake and evidence boundaries; all rolled back."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.client import get as client_get
from kandil_hr.sourcing import referrals as api, sources
from kandil_hr.sourcing.test_sources import TestSources
from kandil_hr.candidates import intake, recovery
from kandil_hr.recruitment.test_commands import acting_as


class TestReferrals(unittest.TestCase):
    def setUp(self):
        self.s = TestSources()
        self.addCleanup(self.s.doCleanups)
        self.s.setUp()
        self.f, self.company = self.s.f, self.s.company

    def employee(self, label='Synthetic Referrer', **values):
        d = dict(doctype='Employee', first_name=label, company=self.company, gender='Male',
                 date_of_birth='1990-01-01', date_of_joining='2020-01-01', status='Active')
        d.update(values)
        with acting_as('Administrator'):
            return frappe.get_doc(d).insert(ignore_permissions=True)

    def referral(self, employee=None, **changes):
        value = dict(employee=employee.name if employee else '', employee_version=str(employee.modified) if employee else '',
                     employee_name='Unverified named referrer', relationship='Former colleague', policy_version=api.policy()['version'])
        value.update(changes)
        return value

    def args(self, employee=None, source='REFERRAL', **changes):
        args = self.s.intake_args(source)
        if employee is None:
            name = frappe.db.get_value('Employee', {'company': self.company, 'status': 'Active'}, 'name')
            employee = frappe.get_doc('Employee', name) if name else None
        args['referral'] = self.referral(employee)
        args.update(changes)
        return args

    def create(self, args=None):
        return self.s.create(args or self.args())

    def snapshot(self, result):
        with acting_as(self.f.users['manager']):
            return api.application(result['application'])['submission']

    def test_empty_register_fallback_is_explicit_not_an_employee_link(self):
        # Exact isolated cohort only; enclosing fixture rolls back all rows.
        frappe.db.delete('Employee', {'company': self.company})
        r = self.create()
        snapshot = self.snapshot(r)
        self.assertEqual(snapshot['identity_basis'], 'empty_register_name_only')
        self.assertEqual(snapshot['employee'], '')
        self.assertEqual(snapshot['bonus_status'], 'PENDING')
        self.assertEqual(snapshot['policy']['prior_days'], 180)

    def test_employee_picker_is_minimal_company_scoped_and_literal(self):
        emp = self.employee()
        self.employee('Inactive Referrer', status='Inactive')
        with acting_as(self.f.users['manager']):
            self.assertEqual(api.employees(self.company, 'S')['rows'], [])
            rows = api.employees(self.company, 'Synthetic')['rows']
            self.assertEqual(len(rows), 1)
            self.assertEqual(set(rows[0]), {'name', 'label', 'job', 'version'})
            self.assertEqual(rows[0]['name'], emp.name)
            self.assertEqual(api.employees(self.company, '%%')['rows'], [])
            self.assertEqual(api.employees(self.company, 'Inactive')['rows'], [])
            with self.assertRaises(frappe.PermissionError): api.employees('Outside company', 'Synthetic')

    def test_register_prevents_name_only_fallback_even_when_inactive(self):
        self.employee(status='Inactive')
        args = self.args(); args['referral'] = self.referral()
        with self.assertRaises(frappe.PermissionError): self.create(args)

    def test_employee_snapshot_uses_server_name_and_preserves_it_after_rename(self):
        emp = self.employee()
        args = self.args(emp)
        result = self.create(args)
        before = self.snapshot(result)
        self.assertEqual(before['employee_name'], emp.employee_name)
        self.assertEqual(before['kind'], 'PRIMARY')
        frappe.db.set_value('Employee', emp.name, 'employee_name', 'Changed employee name')
        self.assertEqual(self.create(args), result)
        self.assertEqual(self.snapshot(result), before)

    def test_stale_inactive_foreign_employee_and_missing_referrer_rejected(self):
        emp = self.employee()
        args = self.args(emp)
        args['referral']['employee_version'] = '1900-01-01'
        with self.assertRaises(frappe.TimestampMismatchError): self.create(args)
        args = self.args(emp)
        args['referral']['employee'] = 'NOT-THIS-COMPANY'
        with self.assertRaises(frappe.PermissionError): self.create(args)
        frappe.db.set_value('Employee', emp.name, 'status', 'Inactive')
        with self.assertRaises(frappe.PermissionError): self.create(self.args(emp))
        args.pop('referral')
        with self.assertRaises(frappe.PermissionError): self.create(args)

    def test_policy_version_relationship_and_invalid_policy_fail_closed(self):
        args = self.args()
        with patch.dict(frappe.conf, {'kandil_referral_relationship_required': True}):
            with self.assertRaises(frappe.TimestampMismatchError): self.create(args)
            args = self.args(); args['referral']['relationship'] = ''
            with self.assertRaises(frappe.ValidationError): self.create(args)
        with patch.dict(frappe.conf, {'kandil_referral_prior_days': -1}):
            with self.assertRaises(frappe.ValidationError): api.policy()

    def test_non_referral_source_records_influencing_review(self):
        result = self.create(self.args(source='EMAIL'))
        d = self.snapshot(result)
        self.assertEqual((d['kind'], d['bonus_status'], d['eligibility_reason']), ('INFLUENCING', 'REVIEW', 'influencing_source'))

    def test_recent_application_needs_review_without_exposing_other_application(self):
        first = self.s.create()
        other = self.s.i.second_opening()
        args = self.args(opening_name=other, person=first['person'], person_version=first['person_version'], identity_reason='Explicitly reviewed same person')
        result = self.create(args)
        d = self.snapshot(result)
        self.assertEqual(d['bonus_status'], 'REVIEW')
        self.assertEqual(d['eligibility_reason'], 'recent_application')
        self.assertNotIn(first['application'], json.dumps(d))

    def test_outside_prior_window_is_pending(self):
        first = self.s.create()
        frappe.db.set_value('Job Applicant', first['application'], 'creation', '2000-01-01', update_modified=False)
        other = self.s.i.second_opening()
        result = self.create(self.args(opening_name=other, person=first['person'], person_version=first['person_version'], identity_reason='Explicit same person'))
        self.assertEqual(self.snapshot(result)['bonus_status'], 'PENDING')

    def test_first_referrer_same_person_vacancy_not_overwritten(self):
        emp1, emp2 = self.employee('First employee'), self.employee('Second employee')
        first = self.create(self.args(emp1))
        # Another application is allowed only after the existing one closes.
        frappe.db.set_value('Job Applicant', first['application'], 'status', 'Rejected')
        args = self.args(emp2, person=first['person'], person_version=first['person_version'], identity_reason='Reviewed same person')
        with self.assertRaises(frappe.PermissionError): self.create(args)
        self.assertEqual(frappe.db.count(api.DT, {'person': first['person']}), 1)
        args['referral'] = self.referral(emp1)
        result = self.create(args)
        self.assertEqual(self.snapshot(result)['employee'], emp1.name)

    def test_self_referral_denied_and_internal_candidate_ineligible(self):
        first = self.s.create()
        internal = self.employee('Internal candidate')
        # Seed the established link, not a live joining conversion (S8).
        frappe.db.set_value('Employee', internal.name, 'job_applicant', first['application'])
        internal.reload()
        another = self.employee('Another referrer')
        other = self.s.i.second_opening()
        args = self.args(internal, opening_name=other, person=first['person'], person_version=first['person_version'], identity_reason='Reviewed employee identity')
        with self.assertRaises(frappe.PermissionError): self.create(args)
        args['referral'] = self.referral(another)
        self.assertEqual(self.snapshot(self.create(args))['bonus_status'], 'NOT_ELIGIBLE')

    def test_native_evidence_denied_and_recovery_retains_exact_referrer(self):
        args = self.args()
        with acting_as(self.f.users['manager']):
            entry = recovery.prepare('intake', args)
            result = recovery.execute(entry['name'])
            self.assertEqual(result, recovery.execute(entry['name']))
        name = frappe.db.get_value(api.DT, {'application': result['result']['application']}, 'name')
        doc = frappe.get_doc(api.DT, name)
        with acting_as(self.f.users['manager']), self.assertRaises(frappe.PermissionError): client_get(api.DT, name)
        with self.f.rejected(frappe.PermissionError): doc.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError): frappe.copy_doc(doc).insert(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError): frappe.delete_doc(api.DT, name, ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError): frappe.rename_doc(api.DT, name, 'Tamper', force=True)

    def test_late_failure_rolls_back_all_intake_effects(self):
        before = self.s.i.counts()
        count = frappe.db.count(api.DT)
        with patch.object(api.KandilReferralSubmission, 'after_insert', side_effect=RuntimeError('Synthetic late error'), create=True), self.assertRaises(RuntimeError): self.create()
        self.assertEqual(self.s.i.counts(), before)
        self.assertEqual(frappe.db.count(api.DT), count)

    def test_revocation_denies_saved_receipt_and_employee_lookup(self):
        args = self.args(); self.create(args)
        frappe.db.set_value('Kandil Access Grant', self.f.grants['manager'], 'revoked', 1)
        with self.assertRaises(frappe.PermissionError): self.create(args)
        with acting_as(self.f.users['manager']), self.assertRaises(frappe.PermissionError): api.employees(self.company, 'Synthetic')


def run():
    result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestReferrals))
    data = dict(tests_run=result.testsRun, failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped), successful=result.wasSuccessful() and not result.skipped, fixtures_rolled_back=True, failed_tests=[t.id() for t, _ in result.failures+result.errors])
    print(json.dumps(data))
    return data
