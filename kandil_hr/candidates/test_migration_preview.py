"""Legacy review is scoped to configured HR and has no write side effects."""
import json
import sys
import unittest
from unittest.mock import patch

import frappe
from kandil_hr.candidates.test_identity import TestCandidateIdentity
from kandil_hr.candidates import migration
from kandil_hr.recruitment.test_commands import acting_as


class TestMigrationPreview(unittest.TestCase):
    def setUp(self):
        self.f=TestCandidateIdentity();self.addCleanup(self.f.doCleanups);self.f.setUp()

    def call(self,method='preview',role='hr',**args):
        if method=='preview':args.setdefault('name',self.f.legacy.name)
        with acting_as(self.f.f.users[role]):return getattr(migration,method)(**args)

    def test_mode_off_preview_is_read_only_and_preserves_legacy_fields(self):
        before=frappe.get_doc('Job Applicant',self.f.legacy.name).as_dict();counts=self.f.counts()
        with patch.dict(frappe.conf,{'kandil_candidate_identity_enabled':0}):
            p=self.call();again=self.call()
            self.assertFalse(p['intake_mode_enabled']);self.assertFalse(p['mutation_enabled'])
            self.assertEqual(p['preview_hash'],again['preview_hash'])
        self.assertEqual(p['proposed_profile']['full_name'],before['applicant_name'])
        self.assertEqual(p['issues'],[]);self.assertTrue(all(p['preserved'].values()))
        self.assertEqual(self.f.counts(),counts)
        self.assertEqual(frappe.get_doc('Job Applicant',self.f.legacy.name).as_dict(),before)

    def test_only_configured_hr_can_review_and_guessing_is_denied(self):
        for role in ('manager','requester'):
            with self.f.f.rejected(frappe.PermissionError):self.call(role=role)
            with self.f.f.rejected(frappe.PermissionError):self.call('listing',role=role)
        with self.f.f.rejected(frappe.PermissionError):self.call(name='unavailable-reference')
        frappe.db.set_value('Kandil Access Grant',self.f.f.grants['hr'],'revoked',1)
        self.assertEqual(self.call('listing')['total'],0)
        with self.f.f.rejected(frappe.PermissionError):self.call()

    def test_pagination_excludes_linked_and_keeps_exact_scope(self):
        with patch.dict(frappe.conf,{'kandil_candidate_identity_enabled':0}),acting_as(self.f.f.users['hr']):
            for n in range(3):
                frappe.get_doc(dict(doctype='Job Applicant',applicant_name='Migration extra '+str(n),phone_number='0109999000'+str(n),job_title=self.f.opening)).insert()
        self.f.create()
        first=self.call('listing',page_length=2);last=self.call('listing',start=2,page_length=2)
        self.assertEqual(first['total'],4);self.assertEqual(len(first['rows']),2);self.assertEqual(len(last['rows']),2)
        self.assertFalse({r.name for r in first['rows']}&{r.name for r in last['rows']})
        self.assertEqual(self.call('listing',search='Migration extra')['total'],3)
        self.assertEqual(self.call('listing',search="%' OR 1=1 --")['total'],0)

    def test_incomplete_and_already_linked_are_review_issues_not_writes(self):
        created=self.f.create()
        self.assertIn('already_linked',self.call(name=created['application'])['issues'])
        frappe.db.set_value('Job Applicant',self.f.legacy.name,{'email_id':'','phone_number':''})
        counts=self.f.counts();self.assertIn('incomplete_contact',self.call()['issues']);self.assertEqual(counts,self.f.counts())
        frappe.db.set_value('Job Applicant',self.f.legacy.name,'email_id','invalid email')
        self.assertIn('invalid_profile',self.call()['issues']);self.assertEqual(counts,self.f.counts())

    def test_changed_record_changes_preview_fingerprint(self):
        original=self.call()['preview_hash']
        frappe.db.set_value('Job Applicant',self.f.legacy.name,'applicant_name','Corrected legacy name')
        self.assertNotEqual(self.call()['preview_hash'],original)

    def test_native_permission_filters_preview_and_related_projection(self):
        with acting_as(self.f.f.users['hr']):
            offer=frappe.get_doc(dict(doctype='Job Offer',job_applicant=self.f.legacy.name,applicant_name=self.f.legacy.applicant_name,
                offer_date=frappe.utils.today(),designation=self.f.f.designation,company=self.f.f.company,status='Awaiting Response')).insert()
        p=self.call();self.assertFalse({'salary','lower_range','upper_range','resume_attachment'}&set(p))
        self.assertIn(offer.name,p['references']['Job Offer']['rows'])
        for item in p['references'].values():self.assertEqual(set(item),{'available','rows','has_more'})
        with patch('frappe.has_permission',side_effect=lambda kind,*a,**kw:False if kind=='Job Offer' else True):
            self.assertEqual(migration.references('Job Offer',self.f.legacy.name),dict(available=False,rows=[],has_more=False))
        created=self.f.create();user=self.f.f.users['hr']
        frappe.get_doc(dict(doctype='User Permission',user=user,allow='Job Applicant',for_value=created['application'],apply_to_all_doctypes=1)).insert(ignore_permissions=True)
        frappe.clear_cache(user=user)
        self.assertEqual(self.call('listing')['total'],0)
        with self.f.f.rejected(frappe.PermissionError):self.call()


def run():
    r=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestMigrationPreview))
    result=dict(tests_run=r.testsRun,failures=len(r.failures),errors=len(r.errors),skipped=len(r.skipped),successful=r.wasSuccessful() and not r.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in r.failures+r.errors])
    print(json.dumps(result));return result
