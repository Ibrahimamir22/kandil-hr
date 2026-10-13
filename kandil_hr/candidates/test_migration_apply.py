"""Reviewed migration is atomic, replayable, scope-bound and reconciled."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch
import frappe
from kandil_hr.candidates import migration,identity
from kandil_hr.candidates.test_identity import TestCandidateIdentity
from kandil_hr.recruitment.test_commands import acting_as


class TestMigrationApply(unittest.TestCase):
    def setUp(self):
        self.f=TestCandidateIdentity();self.addCleanup(self.f.doCleanups);self.f.setUp()
        with acting_as(self.f.f.users['hr']):self.preview=migration.preview(self.f.legacy.name)
        p=self.preview
        self.args=dict(name=p['request'],opening_name=p['opening'],application=p['application'],
            application_version=p['application_version'],expected_version=p['request_version'],
            preview_hash=p['preview_hash'],reason='Reviewed synthetic legacy identity',command_id=uuid.uuid4().hex)

    def apply(self,role='hr',**changes):
        with acting_as(self.f.f.users[role]):return migration.apply_review(**dict(self.args,**changes))

    def test_apply_reconciles_and_replay_has_exactly_one_effect(self):
        counts=self.f.counts();result=self.apply();after=self.f.counts()
        self.assertEqual(after,tuple(v+n for v,n in zip(counts,(1,0,1,1))))
        self.assertEqual(result,self.apply());self.assertEqual(after,self.f.counts())
        self.assertTrue(result['reconciliation']['preserved'])
        self.assertEqual(result['reconciliation']['before_hash'],result['reconciliation']['after_hash'])
        current=frappe.get_doc('Job Applicant',self.f.legacy.name)
        for field in ['name','applicant_name','email_id','phone_number','job_title','status','custom_kandil_application_key','custom_kandil_source_channel','custom_kandil_source_detail']:
            self.assertEqual(current.get(field),self.f.legacy.get(field))
        self.assertEqual(current.custom_kandil_person,result['person'])
        self.assertEqual(frappe.db.get_value(identity.DT,result['person'],'identity_state'),'Unreviewed')
        with acting_as(self.f.f.users['hr']):
            self.assertEqual(migration.listing()['total'],0)
            p=migration.preview(self.f.legacy.name)
            self.assertFalse(p['mutation_enabled']);self.assertIn('already_linked',p['issues'])

    def test_changed_preview_or_versions_cannot_write(self):
        for changes in [dict(preview_hash='0'*64),dict(application_version='2000-01-01'),dict(expected_version='2000-01-01')]:
            counts=self.f.counts()
            with self.f.f.rejected(frappe.TimestampMismatchError):self.apply(**changes)
            self.assertEqual(counts,self.f.counts())
        frappe.db.set_value('Job Applicant',self.f.legacy.name,'phone_number','01099990000',update_modified=False)
        with self.f.f.rejected(frappe.TimestampMismatchError):self.apply()
        self.assertFalse(frappe.db.get_value('Job Applicant',self.f.legacy.name,'custom_kandil_person'))

    def test_invalid_profile_or_missing_review_does_not_write(self):
        counts=self.f.counts()
        for changes in [dict(reason=''),dict(preview_hash='bad')]:
            with self.f.f.rejected():self.apply(**changes)
        with self.f.f.rejected(frappe.PermissionError):self.apply(application='bad-reference')
        self.assertEqual(counts,self.f.counts())
        frappe.db.set_value('Job Applicant',self.f.legacy.name,{'email_id':'','phone_number':''})
        with acting_as(self.f.f.users['hr']):p=migration.preview(self.f.legacy.name)
        self.assertFalse(p['mutation_enabled'])
        with self.f.f.rejected():self.apply(application_version=p['application_version'],preview_hash=p['preview_hash'])
        self.assertEqual(counts,self.f.counts())

    def test_receipt_cannot_be_reused_for_changed_reason_or_preview(self):
        self.apply();counts=self.f.counts()
        for changes in [dict(reason='Changed reason'),dict(preview_hash='a'*64),dict(command_id=uuid.uuid4().hex)]:
            with self.f.f.rejected():self.apply(**changes)
        self.assertEqual(counts,self.f.counts())

    def test_current_hr_and_scope_are_required_even_for_replay(self):
        for role in ('manager','requester'):
            with self.f.f.rejected(frappe.PermissionError):self.apply(role=role)
        self.apply();counts=self.f.counts()
        frappe.db.set_value('Kandil Access Grant',self.f.f.grants['hr'],'revoked',1)
        with self.f.f.rejected(frappe.PermissionError):self.apply()
        self.assertEqual(counts,self.f.counts())

    def test_replaced_hr_cannot_replay(self):
        self.apply();counts=self.f.counts()
        frappe.db.set_value('Kandil Organization Settings',self.f.f.company,'hr_approver',self.f.f.users['manager'])
        with self.f.f.rejected(frappe.PermissionError):self.apply()
        self.assertEqual(counts,self.f.counts())

    def test_native_application_permission_and_disabled_mode_block_apply(self):
        with patch.dict(frappe.conf,{'kandil_candidate_identity_enabled':0}),self.f.f.rejected(frappe.PermissionError):self.apply()
        created=self.f.create();user=self.f.f.users['hr']
        frappe.get_doc(dict(doctype='User Permission',user=user,allow='Job Applicant',for_value=created['application'],apply_to_all_doctypes=1)).insert(ignore_permissions=True)
        frappe.clear_cache(user=user);counts=self.f.counts()
        with self.f.f.rejected(frappe.PermissionError):self.apply()
        self.assertEqual(counts,self.f.counts())

    def test_audit_or_reconciliation_failure_rolls_back_link_and_identity(self):
        counts=self.f.counts()
        with patch('kandil_hr.foundation.command_audit.record_command',side_effect=RuntimeError('Synthetic failure')):
            with self.f.f.rejected(RuntimeError):self.apply()
        self.assertEqual(counts,self.f.counts())
        with patch('kandil_hr.candidates.migration.preserved_hash',side_effect=['before','after']):
            with self.f.f.rejected():self.apply()
        self.assertEqual(counts,self.f.counts())
        self.assertFalse(frappe.db.get_value('Job Applicant',self.f.legacy.name,'custom_kandil_person'))

    def test_audit_contains_review_and_reconciliation_without_contacts(self):
        result=self.apply()
        rows=frappe.get_all('Kandil Command Audit',filters={'operation':'candidate_identity_migrate','target_name':self.f.request},fields=['*'])
        self.assertEqual(len(rows),1);raw=frappe.as_json(rows[0])
        for item in [self.args['preview_hash'],self.args['reason'],result['person']]:self.assertIn(item,raw)
        for field in ['email_id','phone_number']:
            if self.f.legacy.get(field):self.assertNotIn(self.f.legacy.get(field),raw)


def run():
    r=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestMigrationApply))
    result=dict(tests_run=r.testsRun,failures=len(r.failures),errors=len(r.errors),skipped=len(r.skipped),successful=r.wasSuccessful() and not r.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in r.failures+r.errors])
    print(json.dumps(result));return result
