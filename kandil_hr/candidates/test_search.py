"""Corrected-master search retains snapshots without bypassing native scope."""
import json
import sys
import unittest

import frappe
from kandil_hr.candidates.test_corrections import TestCorrections
from kandil_hr.candidates import intake
from kandil_hr.portal import candidates
from kandil_hr.recruitment.test_commands import acting_as


class TestSearch(unittest.TestCase):
    def setUp(self):
        self.f=TestCorrections();self.addCleanup(self.f.doCleanups);self.f.setUp()
        self.new=dict(self.f.profile,full_name='Corrected candidate name',email_id='new-contact@example.invalid',phone_number='012 3333 4444')
        self.f.correct(profile=self.new)

    def list(self,**args):
        with acting_as(self.f.f.f.users['manager']):return candidates.listing(**args)

    def duplicates(self,**args):
        with acting_as(self.f.f.f.users['manager']):return intake.duplicate_review(self.f.f.f.company,**args)

    def test_corrected_and_snapshot_search_find_same_application(self):
        for term in (self.new['full_name'],self.new['email_id'],self.new['phone_number'],self.f.profile['full_name'],self.f.profile['email_id']):
            rows=self.list(search=term)['rows'];self.assertEqual(len(rows),1)
            self.assertEqual(rows[0].name,self.f.created['application'])
            self.assertEqual(rows[0].person_name,self.new['full_name'])
            self.assertEqual(rows[0].applicant_name,self.f.profile['full_name'])
            self.assertFalse({'email_id','phone_number','profile_json'}&set(rows[0]))

    def test_corrected_matches_normalize_case_space_phone_without_merge(self):
        for args in (dict(email_id=' NEW-CONTACT@EXAMPLE.INVALID '),dict(phone_number='01233334444'),dict(applicant_name='CORRECTED CANDIDATE NAME')):
            result=self.duplicates(**args);self.assertEqual(len(result['rows']),1)
            self.assertEqual(result['rows'][0].person,self.f.created['person'])
            self.assertEqual(result['rows'][0].person_name,self.new['full_name'])
        self.assertEqual(self.duplicates(email_id=self.f.profile['email_id'])['rows'][0].person,self.f.created['person'])

    def test_revocation_hides_current_and_historical_contact_search(self):
        frappe.db.set_value('Kandil Access Grant',self.f.f.f.grants['manager'],'revoked',1)
        for contact in (self.new['email_id'],self.f.profile['email_id']):
            self.assertEqual(self.list(search=contact)['total'],0)
            self.assertEqual(self.duplicates(email_id=contact)['rows'],[])

    def test_native_application_user_permission_cannot_be_bypassed_through_profile(self):
        user=self.f.f.f.users['manager']
        frappe.get_doc(dict(doctype='User Permission',user=user,allow='Job Applicant',for_value=self.f.f.legacy.name,apply_to_all_doctypes=1)).insert(ignore_permissions=True)
        frappe.clear_cache(user=user)
        self.assertEqual(self.list(search=self.new['email_id'])['total'],0)
        self.assertEqual(self.duplicates(email_id=self.new['email_id'])['rows'],[])

    def test_literal_search_and_counts_do_not_expand_matching_rows(self):
        for term in ("%' OR 1=1 --",'%','_'):
            self.assertEqual(self.list(search=term)['total'],0)
        self.assertEqual(self.list(search=self.new['email_id'],page_length=1)['total'],1)
        self.assertEqual(self.list(search=self.new['email_id'],start=1,page_length=1)['rows'],[])


def run():
    r=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestSearch))
    result=dict(tests_run=r.testsRun,failures=len(r.failures),errors=len(r.errors),skipped=len(r.skipped),successful=r.wasSuccessful() and not r.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in r.failures+r.errors])
    print(json.dumps(result));return result
