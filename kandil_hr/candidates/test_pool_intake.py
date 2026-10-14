"""Synthetic rollback tests for pool reuse, provenance and visible latest application."""
import json,sys,unittest,uuid,inspect
from unittest.mock import patch
import frappe
from frappe.client import get as client_get
from kandil_hr.candidates import pool_intake as api,intake,identity,talent_pool,stages
from kandil_hr.candidates.test_talent_pool import TestTalentPool
from kandil_hr.privacy import pool,consent
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment import vacancies

class TestPoolIntake(unittest.TestCase):
    def setUp(self):
        self.t=TestTalentPool();self.addCleanup(self.t.doCleanups);self.t.setUp();self.t.grant();self.t.save()
        self.f=self.t.f;self.app=self.t.app;self.person=self.t.person;self.base=self.t.base;self.opening=self.base.second_opening()
    def preview(self,role='hr',opening=None):
        with acting_as(self.f.users[role]):return api.preview(self.app,opening or self.opening)
    def args(self,**changes):
        p=self.preview();a=dict(application=self.app,opening=self.opening,membership=p['membership'],consent_event=p['consent'],application_version=p['application_version'],person_version=p['person_version'],target_version=p['target_version'],opening_version=p['opening_version'],reason='Synthetic reviewed pool reuse',confirmed=True,command_id=uuid.uuid4().hex);a.update(changes);return a
    def create(self,args=None,role='hr'):
        with acting_as(self.f.users[role]):return api.create(**(args or self.args()))
    def history(self,role='hr'):
        with acting_as(self.f.users[role]):return api.history(self.app)
    def counts(self):return tuple(frappe.db.count(d) for d in ('Job Applicant',identity.DT,api.DT,'Kandil Candidate Activity','Kandil Command Receipt','Kandil Command Audit'))
    def test_create_preserves_source_identity_consent_and_capacity(self):
        original=frappe.get_doc('Job Applicant',self.app).as_dict();person=frappe.get_doc(identity.DT,self.person).as_dict();caps=[frappe.get_doc('Kandil Capacity',c).as_dict() for c in self.f.capacities]
        result=self.create();new=frappe.get_doc('Job Applicant',result['application']);event=frappe.get_doc(api.DT,result['event'])
        self.assertEqual(new.custom_kandil_person,self.person);self.assertEqual(new.job_title,self.opening);self.assertEqual(new.status,'Open');self.assertEqual(new.custom_kandil_source_channel,'TALENT_POOL')
        self.assertEqual(event.source_application,self.app);self.assertEqual(event.target_application,new.name);self.assertEqual(event.membership,self.t.ctx()['expected_event'])
        self.assertEqual(original,frappe.get_doc('Job Applicant',self.app).as_dict());self.assertEqual(person,frappe.get_doc(identity.DT,self.person).as_dict());self.assertEqual(caps,[frappe.get_doc('Kandil Capacity',c).as_dict() for c in self.f.capacities])
        self.assertIsNone(consent.acceptance(self.t.company,self.person));self.assertFalse(result['sent'])
        with patch.dict(frappe.conf,{'kandil_candidate_screening_enabled':1}),self.assertRaises(frappe.PermissionError):stages.require_consent(new,self.f.load(self.base.request))
    def test_exact_retry_after_withdrawal_returns_only_original_result(self):
        args=self.args();result=self.create(args);counts=self.counts();self.t.p.record(self.t.p.args('WITHDRAW'))
        self.assertEqual(self.create(args),result);self.assertEqual(self.counts(),counts)
        with self.assertRaises(frappe.PermissionError):self.create(dict(args,command_id=uuid.uuid4().hex))
        with self.assertRaises(frappe.ValidationError):self.create(dict(args,reason='Changed command'))
    def test_active_duplicate_blocked_without_exposing_other_application(self):
        result=self.create();before=self.counts()
        with self.assertRaises(frappe.ValidationError) as caught:self.create()
        self.assertNotIn(result['application'],str(caught.exception));self.assertEqual(before,self.counts())
        with self.assertRaises(frappe.ValidationError):self.preview(opening=self.base.opening)
    def test_stale_versions_membership_and_consent_rejected(self):
        for key in ('application_version','person_version','target_version','opening_version','membership','consent_event'):
            with self.assertRaises(frappe.TimestampMismatchError):self.create(self.args(**{key:'2000-01-01'}))
        self.assertEqual(frappe.db.count(api.DT,{'company':self.t.company}),0)
    def test_removed_expired_withdrawn_and_regranted_memberships_cannot_add(self):
        args=self.args();self.t.save(self.t.args(action='REMOVE',tags=[],note=''))
        with self.assertRaises(frappe.PermissionError):self.create(args)
        self.t.save();args=self.args();self.t.p.record(self.t.p.args('WITHDRAW'))
        with self.assertRaises(frappe.PermissionError):self.create(args)
        self.t.p.record()
        with self.assertRaises(frappe.PermissionError):self.preview()
        self.t.save();args=self.args()
        with patch.object(pool,'today',return_value='2099-01-01'),self.assertRaises(frappe.PermissionError):self.create(args)
    def test_paused_or_full_destination_rejected_at_write(self):
        args=self.args();self.f.call('hr',vacancies.set_state,self.base.request,opening_name=self.opening,action='Hold',reason='Synthetic hold')
        with self.assertRaises(frappe.TimestampMismatchError):self.create(args)
        with self.assertRaises(frappe.ValidationError):self.preview()
    def test_target_native_scope_and_revoked_source_block_replay(self):
        args=self.args();self.create(args);user=self.f.users['hr']
        frappe.get_doc(dict(doctype='User Permission',user=user,allow='Job Opening',for_value=self.base.opening,apply_to_all_doctypes=1)).insert(ignore_permissions=True);frappe.clear_cache(user=user)
        with self.assertRaises(frappe.PermissionError):self.create(args)
        with self.assertRaises(frappe.PermissionError):self.preview()
        with self.assertRaises(frappe.PermissionError):self.history()
    def test_unreadable_new_application_is_rolled_back(self):
        args=self.args();before=self.counts();user=self.f.users['hr']
        frappe.get_doc(dict(doctype='User Permission',user=user,allow='Job Applicant',for_value=self.app,apply_to_all_doctypes=1)).insert(ignore_permissions=True);frappe.clear_cache(user=user)
        with self.assertRaises(frappe.PermissionError):self.create(args)
        self.assertEqual(self.counts(),before)
    def test_application_user_permission_restricts_saved_receipt(self):
        args=self.args();self.create(args);user=self.f.users['hr']
        frappe.get_doc(dict(doctype='User Permission',user=user,allow='Job Applicant',for_value=self.app,apply_to_all_doctypes=1)).insert(ignore_permissions=True);frappe.clear_cache(user=user)
        with self.assertRaises(frappe.PermissionError):self.create(args)
    def test_result_must_match_reviewed_person_and_destination(self):
        result=self.create()
        with acting_as(self.f.users['hr']):
            request=frappe.get_doc('Kandil Hiring Request',self.base.request)
            wrong_opening=frappe.get_doc('Job Opening',self.base.opening)
            person=frappe.get_doc(identity.DT,self.person)
            with self.assertRaises(frappe.PermissionError):api.readable_result(result['application'],request,wrong_opening,person)
    def test_disabled_or_revoked_actor_cannot_replay(self):
        args=self.args();self.create(args);frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        with self.assertRaises(frappe.PermissionError):self.create(args)
        with self.assertRaises(frappe.PermissionError):self.history()
    def test_reserved_source_cannot_be_forged_through_generic_intake(self):
        for channel in ('TALENT_POOL','talent_pool'):
            with self.assertRaises(frappe.PermissionError):self.base.create(details=dict(self.base.data,source_channel=channel))
    def test_event_failure_rolls_back_application_activity_receipt_and_audit(self):
        args=self.args();before=self.counts()
        with patch.object(api.KandilPoolIntake,'after_insert',side_effect=RuntimeError('Synthetic failure'),create=True),self.assertRaises(RuntimeError):self.create(args)
        self.assertEqual(before,self.counts());self.create(args)
    def test_nested_intake_does_not_retry_without_rechecking_pool(self):
        args=self.args()
        # A real DB deadlock invalidates all transaction locks. The nested intake
        # must propagate it to the outer retry; test the unwrapped outer boundary.
        with acting_as(self.f.users['hr']),patch.object(intake,'_create_application',side_effect=frappe.QueryDeadlockError('Synthetic deadlock')) as inner,self.f.rejected(frappe.QueryDeadlockError):
            inspect.unwrap(api.create)(**args)
        self.assertEqual(inner.call_count,1)
    def test_explicit_review_and_reason_required(self):
        for changes in (dict(confirmed=False),dict(confirmed='true'),dict(reason='x')):
            with self.assertRaises(frappe.ValidationError):self.create(self.args(**changes))
    def test_event_native_mutations_and_reads_denied(self):
        result=self.create();doc=frappe.get_doc(api.DT,result['event'])
        with acting_as(self.f.users['manager']),self.assertRaises(frappe.PermissionError):client_get(api.DT,doc.name)
        with self.f.rejected(frappe.PermissionError):doc.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.copy_doc(doc).insert(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.delete_doc(api.DT,doc.name,ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.rename_doc(api.DT,doc.name,'Tamper',force=True)
    def test_latest_projection_uses_creation_and_current_native_scope(self):
        result=self.create();latest=self.t.listing()['rows'][0]['latest_application'];self.assertEqual(latest['application'],result['application']);self.assertEqual(latest['status'],'Open')
        user=self.f.users['manager'];frappe.get_doc(dict(doctype='User Permission',user=user,allow='Job Applicant',for_value=self.app,apply_to_all_doctypes=1)).insert(ignore_permissions=True);frappe.clear_cache(user=user)
        visible=self.t.listing(role='manager')['rows'][0];self.assertEqual(visible['latest_application']['application'],self.app);self.assertNotIn(result['application'],json.dumps(visible,default=str))
        self.assertEqual(self.history(role='manager')['rows'],[])
    def test_latest_projection_uses_closure_decision_without_hidden_counts(self):
        result=self.create()
        # Use the existing closure service with its configured reason catalogue.
        from kandil_hr.candidates import closure
        with acting_as(self.f.users['hr']):
            c=closure.context(result['application'])
            closure.close(name=c['request'],opening_name=c['opening'],application=result['application'],application_version=c['application_version'],expected_version=c['expected_version'],decision='Withdrawn',reason_code='OTHER',catalog_version=c['catalogs']['Withdrawn']['version'],internal_note='Synthetic withdrawal',candidate_message='',command_id=uuid.uuid4().hex)
        self.assertEqual(self.t.listing()['rows'][0]['latest_application']['status'],'Withdrawn')
        self.assertNotEqual(self.create()['application'],result['application'])
    def test_openings_are_paginated_and_do_not_cross_company_or_scope(self):
        with acting_as(self.f.users['manager']):
            a=api.openings(self.app,page_length=1);b=api.openings(self.app,start=1,page_length=1)
        self.assertGreaterEqual(a['total'],2);self.assertTrue(a['has_more']);self.assertNotEqual(a['rows'][0]['name'],b['rows'][0]['name'])
        self.assertTrue(all(r['company']==self.t.company for r in a['rows']+b['rows']))
        with acting_as(self.f.users['requester']),self.assertRaises(frappe.PermissionError):api.openings(self.app)

def run():
    r=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestPoolIntake))
    d=dict(tests_run=r.testsRun,failures=len(r.failures),errors=len(r.errors),skipped=len(r.skipped),successful=r.wasSuccessful() and not r.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in r.failures+r.errors]);print(json.dumps(d));return d
