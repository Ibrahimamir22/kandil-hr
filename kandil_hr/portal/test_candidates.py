"""Scoped candidate read model and basic profile validation on rolled-back cohorts."""
import json
import sys
import unittest

import frappe
from unittest.mock import patch
from kandil_hr.candidates.test_identity import TestCandidateIdentity
from kandil_hr.portal import candidates
from kandil_hr.recruitment.test_commands import acting_as


class TestCandidates(unittest.TestCase):
    def setUp(self):
        self.f=TestCandidateIdentity();self.addCleanup(self.f.doCleanups);self.f.setUp()
        self.created=self.f.create(profile={'city':'Cairo','experience_years':0})

    def call(self,method,role='manager',**kwargs):
        with acting_as(self.f.f.users[role]): return getattr(candidates,method)(**kwargs)

    def test_exact_count_paging_filters_and_literal_search(self):
        for n in range(3): self.f.create(details=dict(self.f.data,applicant_name='Person '+str(n)))
        first=self.call('listing',page_length=2);second=self.call('listing',start=2,page_length=2)
        self.assertEqual(first['total'],5);self.assertEqual(len(first['rows']),2)
        self.assertFalse({r.name for r in first['rows']} & {r.name for r in second['rows']})
        self.assertEqual(self.call('listing',search='Person')['total'],3)
        self.assertEqual(self.call('listing',search="%' OR 1=1 --")['total'],0)
        self.assertEqual(self.call('listing',status='Rejected')['total'],0)
        self.assertEqual(self.call('listing',opening='unavailable')['total'],0)

    def test_detail_separates_person_application_and_omits_private_fields(self):
        d=self.call('detail',name=self.created['application'])
        self.assertEqual(d['person']['profile']['city'],'Cairo')
        self.assertEqual(d['person']['profile']['experience_years'],0)
        self.assertIsNone(d['person']['profile']['notice_days'])
        self.assertEqual(d['application']['email_id'],self.f.data['email_id'])
        for key in ('notes','resume_attachment','salary','national_id','lower_range','upper_range'):
            self.assertNotIn(key,d['application']);self.assertNotIn(key,d['person']['profile'])
        listing=self.call('listing')
        for key in ('phone_number','email_id','notes','profile_json'): self.assertTrue(all(key not in r for r in listing['rows']))

    def test_same_person_history_shows_only_currently_readable_applications(self):
        opening=self.f.second_opening()
        other=self.f.create(opening_name=opening,person=self.created['person'],person_version=self.created['person_version'],identity_reason='Reviewed same person')
        self.assertEqual(self.call('listing',person=self.created['person'])['total'],2)
        from kandil_hr.recruitment import vacancies
        self.f.f.call('hr',vacancies.assign_team,self.f.request,opening_name=opening,lead=self.f.f.users['hr'],members=[],reason='Synthetic restricted application')
        result=self.call('listing',person=self.created['person'])
        self.assertEqual(result['total'],1);self.assertEqual(result['rows'][0].name,self.created['application'])
        with self.f.f.rejected(frappe.PermissionError): self.call('detail',name=other['application'])
        self.assertEqual(self.call('person',name=self.created['person'])['name'],self.created['person'])

    def test_revocation_and_guessed_ids_deny_without_read_side_effects(self):
        counts=self.f.counts()
        for method,arg in [('detail',self.created['application']),('person',self.created['person'])]:
            with self.f.f.rejected(frappe.PermissionError): self.call(method,role='requester',name=arg)
            with self.f.f.rejected(frappe.PermissionError): self.call(method,name='unknown-random-identity')
        frappe.db.set_value('Kandil Access Grant',self.f.f.grants['manager'],'revoked',1)
        self.assertEqual(self.call('listing')['total'],0)
        with self.f.f.rejected(frappe.PermissionError):self.call('detail',name=self.created['application'])
        self.assertEqual(counts,self.f.counts())

    def test_legacy_detail_and_feature_off_reads_remain_clear(self):
        d=self.call('detail',name=self.f.legacy.name);self.assertIsNone(d['person'])
        with patch.dict(frappe.conf,{'kandil_candidate_identity_enabled':0}):
            self.assertFalse(self.call('listing')['intake_enabled'])
            self.assertTrue(self.call('detail',name=self.created['application'])['person'])
            with self.f.f.rejected(frappe.PermissionError):self.call('openings')

    def test_profile_bounds_unknowns_and_no_sensitive_fields(self):
        for data in ({'experience_years':-1},{'experience_years':1.5},{'notice_days':True},
                     {'graduation_year':100},{'salary':5000},{'national_id':'123456'},
                     {'city':'x'*141},{'email_id':'forged@example.invalid'}):
            with self.f.f.rejected(): self.f.create(profile=data)
        original=self.call('person',name=self.created['person'])
        with self.f.f.rejected():
            self.f.create(person=self.created['person'],person_version=self.created['person_version'],identity_reason='Reviewed link',profile={'city':'Overwrite'})
        self.assertEqual(original,self.call('person',name=self.created['person']))

    def test_openings_search_scoped_and_bounded(self):
        result=self.call('openings',page_length=1)
        self.assertEqual(result['total'],1);self.assertEqual(result['rows'][0].name,self.f.opening)
        self.assertEqual(self.call('openings',search="' OR 1=1 --")['total'],0)
        with self.f.f.rejected(frappe.PermissionError):self.call('openings',role='requester')


def run():
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(TestCandidates)
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(suite)
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),
        skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,
        fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
