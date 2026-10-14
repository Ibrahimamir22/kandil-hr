"""Referral replacement, history and HR bonus authority on rolled-back cohorts."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.client import get as client_get
from kandil_hr.sourcing import referral_changes as api, referrals
from kandil_hr.sourcing.test_referrals import TestReferrals
from kandil_hr.candidates import recovery, activities, closure
from kandil_hr.catalogs import api as catalog
from kandil_hr.recruitment.test_commands import acting_as


class TestReferralChanges(unittest.TestCase):
    def setUp(self):
        self.r = TestReferrals(); self.addCleanup(self.r.doCleanups); self.r.setUp()
        self.f, self.s, self.company = self.r.f, self.r.s, self.r.company
        self.first = self.r.employee('Original referrer')
        self.second = self.r.employee('Replacement referrer')
        self.created = self.r.create(self.r.args(self.first, source='EMAIL'))
        self.name = self.created['application']

    def context(self, role='manager', **kwargs):
        with acting_as(self.f.users[role]): return api.context(self.name, **kwargs)

    def args(self, **changes):
        c = self.context()
        a = dict(name=c['request'], opening_name=c['opening'], application=self.name,
                 application_version=c['application_version'], expected_version=c['expected_version'],
                 referral_version=c['current']['version'], action='SET', reason='Reviewed referral correction',
                 referral=self.r.referral(self.second), command_id=uuid.uuid4().hex)
        a.update(changes)
        if a['action'] != 'SET': a.pop('referral', None)
        return a

    def call(self, args=None, role='manager', **kwargs):
        a = args or self.args(**kwargs)
        with acting_as(self.f.users[role]): return api.change(**a)

    def counts(self):
        return tuple(frappe.db.count(dt) for dt in (api.DT, activities.DT, 'Kandil Command Receipt', 'Kandil Command Audit'))

    def close(self):
        c = self.context(); cfg = catalog.state(self.company, closure.PROCESSES['Rejected'])
        with acting_as(self.f.users['manager']):
            return closure.close(c['request'], c['opening'], self.name, c['application_version'], 'Rejected', 'OTHER', cfg['version'], 'Synthetic closure', '', uuid.uuid4().hex, c['expected_version'])

    def test_replace_preserves_original_and_hash_chain(self):
        original = self.r.snapshot(self.created)
        a = self.args(); result = self.call(a); count = self.counts()
        self.assertEqual(result, self.call(a)); self.assertEqual(count, self.counts())
        c = self.context(); self.assertEqual(c['current']['value']['employee'], self.second.name)
        self.assertEqual(original, self.r.snapshot(self.created))
        row = frappe.get_doc(api.DT, result['revision'])
        self.assertEqual(row.previous_revision, a['referral_version'])
        self.assertEqual(json.loads(row.before_json), {k: v for k, v in original.items() if k != 'recorded_at'})
        self.call(action='BONUS', bonus_status='ELIGIBLE', role='hr')
        row2 = frappe.get_doc(api.DT, self.context()['current']['version'])
        self.assertEqual(row2.before_hash, row.content_hash)

    def test_stale_and_changed_retry_do_not_add_effects(self):
        a = self.args(); self.call(a); count = self.counts()
        with self.assertRaises(frappe.ValidationError): self.call(dict(a, reason='Changed command content'))
        with self.assertRaises(frappe.TimestampMismatchError): self.call(dict(a, command_id=uuid.uuid4().hex))
        with self.assertRaises(frappe.TimestampMismatchError): self.call(application_version='1900-01-01')
        self.assertEqual(count, self.counts())

    def test_void_influencing_then_restore_with_complete_history(self):
        self.call(action='VOID'); self.assertIsNone(self.context()['current']['value'])
        self.call(); self.assertEqual(self.context()['current']['value']['employee'], self.second.name)
        self.assertEqual(len(self.context()['history']['rows']), 2)

    def test_primary_referral_cannot_be_voided(self):
        created = self.r.create(self.r.args(self.first)); self.name = created['application']
        with self.assertRaises(frappe.PermissionError): self.call(action='VOID')
        self.call(); self.assertEqual(self.context()['current']['value']['kind'], 'PRIMARY')

    def test_empty_referral_can_be_added_but_not_decided(self):
        self.name = self.s.create()['application']
        with self.assertRaises(frappe.ValidationError): self.call(action='BONUS', bonus_status='PAID', role='hr')
        self.call(); self.assertEqual(self.context()['current']['value']['kind'], 'INFLUENCING')

    def test_bonus_is_hr_only_human_report_with_history(self):
        a = self.args(action='BONUS', bonus_status='PAID', reason='Reported bank reference SYNTHETIC')
        with self.assertRaises(frappe.PermissionError): self.call(a)
        self.call(a, role='hr'); value = self.context()['current']['value']
        self.assertEqual(value['bonus_status'], 'PAID'); self.assertFalse(value['payment_verified'])
        self.assertNotIn('bonus_actor', value)
        self.call(); c = self.context()
        self.assertEqual(c['current']['value']['bonus_status'], 'REVIEW')
        self.assertEqual(c['history']['rows'][0]['before']['bonus_status'], 'PAID')
        events = frappe.get_all(activities.DT, filters={'application': self.name}, fields=['*'])
        audits = frappe.get_all('Kandil Command Audit', filters={'operation': 'candidate_referral_bonus'}, fields=['*'])
        self.assertNotIn('Reported bank reference SYNTHETIC', json.dumps(events+audits, default=str))

    def test_closure_blocks_attribution_but_allows_hr_bonus(self):
        a = self.args(); self.call(a); self.close()
        self.assertTrue(self.context()['locked']); self.assertEqual(self.call(a)['application'], self.name)
        for action in ('SET', 'VOID'):
            with self.assertRaises(frappe.PermissionError): self.call(action=action)
        self.call(action='BONUS', bonus_status='ELIGIBLE', role='hr')

    def test_prior_closure_remains_locked_after_reopened_status(self):
        self.close()
        # Emulate status projection only; the independent closure evidence must win.
        frappe.db.set_value('Job Applicant', self.name, 'status', 'Screening')
        self.assertTrue(self.context()['locked'])
        with self.assertRaises(frappe.PermissionError): self.call()

    def test_first_claim_uses_current_replacement_and_void(self):
        self.call()
        self.assertEqual(api.claims(self.company, self.s.i.opening, self.created['person']), [self.second.name])
        frappe.db.set_value('Job Applicant', self.name, 'status', 'Rejected')
        a = self.r.args(self.first, person=self.created['person'], person_version=self.created['person_version'], identity_reason='Reviewed identity')
        with self.assertRaises(frappe.PermissionError): self.r.create(a)
        a['referral'] = self.r.referral(self.second)
        self.r.create(a)

    def test_void_removes_claim_without_erasing_original(self):
        self.call(action='VOID')
        self.assertEqual(api.claims(self.company, self.s.i.opening, self.created['person']), [])
        self.assertEqual(self.r.snapshot(self.created)['employee'], self.first.name)

    def test_current_employee_policy_still_enforced(self):
        a = self.args(); a['referral']['employee_version'] = 'stale'
        with self.assertRaises(frappe.TimestampMismatchError): self.call(a)
        frappe.db.set_value('Employee', self.second.name, 'status', 'Inactive')
        with self.assertRaises(frappe.PermissionError): self.call()

    def test_native_history_mutation_and_read_denied(self):
        result = self.call(); doc = frappe.get_doc(api.DT, result['revision'])
        with acting_as(self.f.users['manager']), self.assertRaises(frappe.PermissionError): client_get(api.DT, doc.name)
        with self.f.rejected(frappe.PermissionError): doc.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError): frappe.copy_doc(doc).insert(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError): frappe.delete_doc(api.DT, doc.name, ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError): frappe.rename_doc(api.DT, doc.name, 'Tamper', force=True)

    def test_late_audit_failure_rolls_back_every_effect(self):
        before = self.counts(); state = self.context()['current']
        with patch('kandil_hr.foundation.command_audit.record_command', side_effect=RuntimeError('Synthetic audit failure')), self.assertRaises(RuntimeError): self.call()
        self.assertEqual(before, self.counts()); self.assertEqual(state, self.context()['current'])

    def test_encrypted_recovery_exact_replay_and_hr_revocation(self):
        a = self.args(action='BONUS', bonus_status='ELIGIBLE')
        with acting_as(self.f.users['hr']):
            e = recovery.prepare('referral', a)
            self.assertEqual(recovery.inspect(e['name'])['arguments']['bonus_status'], 'ELIGIBLE')
            result = recovery.execute(e['name']); self.assertEqual(result, recovery.execute(e['name']))
        frappe.db.set_value('Kandil Access Grant', self.f.grants['hr'], 'revoked', 1)
        with self.assertRaises(frappe.PermissionError): self.call(a, role='hr')
        with acting_as(self.f.users['hr']), self.assertRaises(frappe.PermissionError): recovery.execute(e['name'])

    def test_listing_latest_filter_paging_and_scope(self):
        self.call(action='BONUS', bonus_status='PAID', role='hr')
        second = self.r.create(self.r.args(self.first, source='EMAIL'))
        with acting_as(self.f.users['manager']):
            allrows = api.listing(page_length=1); paid = api.listing(status='PAID'); nextpage = api.listing(start=1, page_length=1)
        self.assertEqual(allrows['total'], 2); self.assertTrue(allrows['has_more'])
        self.assertEqual(paid['total'], 1); self.assertEqual(paid['rows'][0]['name'], self.name)
        self.assertNotEqual(allrows['rows'][0]['name'], nextpage['rows'][0]['name'])
        self.assertNotIn('bonus_note', json.dumps(paid))
        self.name = second['application']; self.call(action='VOID')
        with acting_as(self.f.users['manager']): self.assertEqual(api.listing()['total'], 1)
        frappe.db.set_value('Kandil Access Grant', self.f.grants['manager'], 'revoked', 1)
        with acting_as(self.f.users['manager']):
            try: page = api.listing()
            except frappe.PermissionError: pass
            else: self.assertEqual(page['total'], 0)

    def test_history_pagination_and_noop_validation(self):
        self.call(); self.call(action='BONUS', bonus_status='ELIGIBLE', role='hr')
        with self.assertRaises(frappe.ValidationError): self.call(action='BONUS', bonus_status='ELIGIBLE', role='hr')
        self.call(action='BONUS', bonus_status='PAID', role='hr')
        a = self.context(page_length=2); b = self.context(start=2, page_length=2)
        self.assertTrue(a['history']['has_more']); self.assertEqual(len(b['history']['rows']), 1)
        self.assertTrue(all(r['actor'] for r in a['history']['rows']))


def run():
    r = unittest.TextTestRunner(stream=sys.stderr, verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestReferralChanges))
    data = dict(tests_run=r.testsRun, failures=len(r.failures), errors=len(r.errors), skipped=len(r.skipped), successful=r.wasSuccessful() and not r.skipped, fixtures_rolled_back=True, failed_tests=[t.id() for t, _ in r.failures+r.errors])
    print(json.dumps(data)); return data
