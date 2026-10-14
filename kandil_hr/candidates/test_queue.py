"""Rollback-scoped queue totals, ownership, native permissions and Cairo dates."""
import json
import sys
import unittest
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import frappe

from kandil_hr.candidates import queue, corrections
from kandil_hr.candidates.test_identity import TestCandidateIdentity
from kandil_hr.foundation.clock import test_clock
from kandil_hr.portal import candidates
from kandil_hr.recruitment import ownership, vacancies
from kandil_hr.recruitment.test_commands import acting_as


class TestCandidateQueue(unittest.TestCase):
    def setUp(self):
        self.f = TestCandidateIdentity(); self.addCleanup(self.f.doCleanups); self.f.setUp()
        self.app = self.f.create()['application']
        self.day = patch('kandil_hr.candidates.queue.today_cairo', return_value=datetime(2026,10,14).date())
        self.day.start(); self.addCleanup(self.day.stop)

    def listing(self, role='manager', **kwargs):
        with acting_as(self.f.f.users[role]): return queue.listing(**kwargs)

    def schedule(self, name=None, owner='manager', due='2026-10-14'):
        name = name or self.app
        with acting_as(self.f.f.users['hr']):
            return ownership.set_next_action(name, 'Call after shift / اتصال بعد الوردية', due,
                self.f.f.users[owner], 'Synthetic reviewed follow-up', uuid.uuid4().hex,
                str(self.f.f.load(self.f.request).modified), str(frappe.get_doc('Job Applicant',name).modified))

    def test_exact_buckets_stable_pagination_and_summary_independent_of_selected_bucket(self):
        self.schedule(due='2026-10-13')
        today=self.f.create()['application']; future=self.f.create()['application']
        self.schedule(today);self.schedule(future,due='2026-10-15')
        p=self.listing(page_length=2)
        self.assertEqual(p['counts'],dict(all=4,overdue=1,today=1,upcoming=1,unplanned=1))
        self.assertEqual([r.name for r in p['rows']],[self.app,today])
        second=self.listing(start=2,page_length=2)
        self.assertEqual([r.name for r in second['rows']],[future,self.f.legacy.name])
        self.assertFalse(second['has_more']); self.assertEqual(self.listing(start=99)['rows'],[])
        for bucket,total in p['counts'].items():
            result=self.listing(bucket=bucket)
            self.assertEqual(result['total'],total);self.assertEqual(result['counts'],p['counts'])
        self.assertEqual(self.listing(page_length=1000)['page_length'],100)

    def test_task_owner_controls_my_dated_work_independently_of_application_owner(self):
        self.schedule(owner='hr')
        self.assertEqual(self.listing(bucket='today')['total'],0)
        self.assertEqual(self.listing('hr',bucket='today')['total'],1)
        self.assertEqual(self.listing(mode='scope',bucket='today')['total'],1)
        with acting_as(self.f.f.users['hr']):
            ownership.assign_application(self.app,self.f.f.users['hr'],'Reviewed owner handoff',uuid.uuid4().hex,
                str(self.f.f.load(self.f.request).modified),str(frappe.get_doc('Job Applicant',self.app).modified))
        self.assertEqual(self.listing('hr',bucket='today')['total'],1)

    def test_legacy_missing_task_owner_falls_back_to_owner_then_lead_without_writes(self):
        self.schedule()
        frappe.db.set_value('Job Applicant',self.app,'custom_kandil_next_action_owner',None)
        self.assertEqual(self.listing(bucket='today')['total'],1)
        frappe.db.set_value('Job Applicant',self.app,'custom_kandil_responsible_user',None)
        before=frappe.get_doc('Job Applicant',self.app).as_dict()
        self.assertEqual(self.listing(bucket='today')['total'],0)
        self.assertEqual(self.listing('hr',bucket='today')['total'],1)
        self.assertEqual(before,frappe.get_doc('Job Applicant',self.app).as_dict())

    def test_unassigned_fresh_is_discoverable_to_current_team_but_owned_fresh_is_personal(self):
        self.assertEqual(self.listing(bucket='unplanned')['total'],2)
        self.assertEqual(self.listing('hr',bucket='unplanned')['total'],0)
        frappe.db.set_value('Job Applicant',self.app,'custom_kandil_responsible_user',None)
        self.assertEqual(self.listing('hr',bucket='unplanned')['total'],1)
        with acting_as(self.f.f.users['hr']):
            app=frappe.get_doc('Job Applicant',self.app);app.status='Replied';app.save()
        self.assertEqual(self.listing('hr',bucket='unplanned')['total'],0)

    def test_rejected_and_completed_offers_are_excluded_but_accepted_pending_and_hold_remain(self):
        self.schedule()
        for state in ('Accepted','Hold'):
            frappe.db.set_value('Job Applicant',self.app,'status',state)
            self.assertEqual(self.listing(bucket='today')['total'],1)
        with acting_as(self.f.f.users['hr']):
            offer=frappe.get_doc(dict(doctype='Job Offer',job_applicant=self.app,
                applicant_name='Synthetic queue',offer_date='2026-10-14',designation=self.f.f.designation,
                company=self.f.f.company,status='Awaiting Response')).insert()
        for outcome in ('Joined','No Show','Withdrawn'):
            frappe.db.set_value('Job Offer',offer.name,'custom_kandil_outcome',outcome)
            self.assertEqual(self.listing(bucket='today')['total'],0)
        frappe.db.set_value('Job Offer',offer.name,'custom_kandil_outcome','')
        self.assertEqual(self.listing(bucket='today')['total'],1)
        frappe.db.set_value('Job Offer',offer.name,dict(custom_kandil_outcome='Joined',docstatus=2))
        self.assertEqual(self.listing(bucket='today')['total'],1)
        frappe.db.set_value('Job Applicant',self.app,'status','Rejected')
        self.assertEqual(self.listing(bucket='today')['total'],0)

    def test_paused_vacancy_retains_actions_closed_excludes_fresh_but_not_existing_due_work(self):
        self.schedule()
        for state in ('On Hold','Frozen'):
            frappe.db.set_value('Job Opening',self.f.opening,'custom_kandil_vacancy_state',state)
            self.assertEqual(self.listing()['total'],2)
        frappe.db.set_value('Job Opening',self.f.opening,'custom_kandil_vacancy_state','Closed')
        self.assertEqual(self.listing()['total'],1)

    def test_native_applicant_permission_filters_counts_before_pagination(self):
        self.schedule()
        user=self.f.f.users['manager']
        frappe.get_doc(dict(doctype='User Permission',user=user,allow='Job Applicant',
            for_value=self.f.legacy.name,apply_to_all_doctypes=1)).insert(ignore_permissions=True)
        frappe.clear_cache(user=user)
        result=self.listing(mode='scope')
        self.assertEqual(result['counts']['today'],0);self.assertEqual(result['total'],1)
        self.assertEqual(result['rows'][0].name,self.f.legacy.name)

    def test_team_revocation_hides_rows_counts_and_search(self):
        self.schedule()
        self.f.f.call('hr',vacancies.assign_team,self.f.request,opening_name=self.f.opening,
                      lead=self.f.f.users['hr'],members=[],reason='Revoke synthetic queue access')
        for mode in ('mine','scope'):
            result=self.listing(mode=mode,search=self.app)
            self.assertEqual(result['total'],0);self.assertFalse(result['rows'])
            self.assertEqual(sum(result['counts'].values()),0)

    def test_role_denial_and_invalid_filters(self):
        with self.f.f.rejected(frappe.PermissionError): self.listing('requester')
        for args in ({'bucket':'unknown'},{'mode':'administrator'},{'search':'x'*141}):
            with self.f.f.rejected(): self.listing(**args)
        for term in ('%', '_', "' OR 1=1 --"):
            self.assertEqual(self.listing(search=term)['total'],0)

    def test_corrected_person_name_search_and_minimal_projection(self):
        with acting_as(self.f.f.users['manager']):
            app=candidates.detail(self.app);person=app['person']
            corrections.correct(name=self.f.request,opening_name=self.f.opening,application=self.app,
                person=person['name'],person_version=person['modified'],profile=dict(person['profile'],full_name='Updated Queue Person'),
                reason='Reviewed name',command_id=uuid.uuid4().hex,expected_version=str(self.f.f.load(self.f.request).modified))
        result=self.listing(search='Updated Queue Person')
        self.assertEqual(result['total'],1);row=result['rows'][0]
        self.assertEqual(row.person_name,'Updated Queue Person')
        for key in ('phone_number','email_id','profile_json','person','owner','next_owner','notes','history','salary'):
            self.assertNotIn(key,row)

    def test_counts_use_cairo_midnight_not_utc_or_client_date(self):
        self.day.stop()
        self.schedule(due='2026-10-14')
        with patch.dict(frappe.flags,{'in_test':True}):
            with test_clock(datetime(2026,10,13,20,59,tzinfo=timezone.utc)):
                self.assertEqual(self.listing()['as_of'],'2026-10-13');self.assertEqual(self.listing()['counts']['upcoming'],1)
            with test_clock(datetime(2026,10,13,21,1,tzinfo=timezone.utc)):
                self.assertEqual(self.listing()['as_of'],'2026-10-14');self.assertEqual(self.listing()['counts']['today'],1)


def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestCandidateQueue))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
