"""Rollback-scoped membership, exact consent binding and private pool discovery."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch
import frappe
from frappe.client import get as client_get
from kandil_hr.candidates import talent_pool as api, identity, corrections
from kandil_hr.privacy import pool
from kandil_hr.privacy.test_pool import TestPool
from kandil_hr.recruitment.test_commands import acting_as

class TestTalentPool(unittest.TestCase):
    def setUp(self):
        self.p=TestPool();self.addCleanup(self.p.doCleanups);self.p.setUp()
        self.f=self.p.f;self.app=self.p.app;self.person=self.p.person;self.company=self.p.company
        self.base=self.p.c.n.c.a.f
    def ctx(self,role='hr',application=None):
        with acting_as(self.f.users[role]):return api.context(application or self.app)
    def args(self,**changes):
        c=self.ctx();a={k:c[k] for k in ('expected_event','expected_consent','application_version','person_version')}
        a.update(application=self.app,action='PUT',category='',tags=['Engineering'],note='Reviewed availability',reason='Synthetic HR reviewed pool membership',confirmed=True,command_id=uuid.uuid4().hex)
        a.update(changes);return a
    def save(self,args=None,role='hr'):
        with acting_as(self.f.users[role]):return api.record(**(args or self.args()))
    def grant(self):self.p.publish();return self.p.record()
    def listing(self,role='hr',**args):
        with acting_as(self.f.users[role]):return api.listing(**args)
    def history(self,**args):
        with acting_as(self.f.users['hr']):return api.history(self.app,**args)
    def test_consent_does_not_automatically_add_membership(self):
        self.assertEqual(self.ctx()['state'],'none')
        with self.assertRaises(frappe.PermissionError):self.save()
        self.grant();self.assertTrue(self.ctx()['can_put']);self.assertEqual(self.listing()['total'],0)
    def test_add_update_remove_preserve_application_person_capacity_and_consent(self):
        grant=self.grant();before=self.p.c.snapshot();consent=frappe.get_doc(pool.DT,grant['event']).as_dict()
        first=self.save();self.assertEqual(self.listing()['total'],1)
        second=self.save(self.args(tags=['Finance'],note='Reviewed changed availability'))
        third=self.save(self.args(action='REMOVE',tags=[],note=''))
        self.assertEqual([first['sequence'],second['sequence'],third['sequence']],[1,2,3])
        self.assertEqual(self.ctx()['state'],'removed');self.assertEqual(self.listing()['total'],0)
        self.assertEqual(before,self.p.c.snapshot());self.assertEqual(consent,frappe.get_doc(pool.DT,grant['event']).as_dict())
        self.assertEqual(frappe.get_doc(api.DT,third['event']).note,'Reviewed changed availability')
    def test_withdrawal_hides_results_and_facets_without_scheduler(self):
        self.grant();self.save();self.assertEqual(sum(r['count'] for r in self.listing()['categories']),1)
        self.p.record(self.p.args('WITHDRAW'))
        self.assertEqual(self.ctx()['state'],'consent_withdrawn');self.assertEqual(self.listing()['rows'],[]);self.assertEqual(self.listing()['categories'],[])
    def test_expiry_and_new_grant_never_silently_reactivate_old_entry(self):
        self.p.publish(months=1)
        with patch.object(pool,'today',return_value='2026-01-31'):self.p.record();self.save()
        with patch.object(pool,'today',return_value='2026-02-28'):self.assertEqual(self.listing()['total'],1)
        with patch.object(pool,'today',return_value='2026-03-01'):
            self.assertEqual(self.ctx()['state'],'consent_expired');self.assertEqual(self.listing()['total'],0)
            self.p.record();self.assertEqual(self.ctx()['state'],'consent_changed');self.assertEqual(self.listing()['total'],0)
            self.save();self.assertEqual(self.listing()['total'],1)
    def test_withdraw_then_regrant_requires_reviewed_membership_again(self):
        self.grant();self.save();self.p.record(self.p.args('WITHDRAW'));self.p.record()
        self.assertEqual(self.listing()['total'],0);self.save();self.assertEqual(self.listing()['total'],1)
    def test_exact_retry_after_removal_does_not_restore_membership(self):
        self.grant();args=self.args();first=self.save(args);self.save(self.args(action='REMOVE',tags=[],note=''))
        self.assertEqual(first,self.save(args));self.assertEqual(self.listing()['total'],0)
        with self.assertRaises(frappe.ValidationError):self.save(dict(args,note='Changed retry'))
        with self.assertRaises(frappe.TimestampMismatchError):self.save(dict(args,command_id=uuid.uuid4().hex))
    def test_stale_consent_application_person_and_entry_fail_closed(self):
        self.grant()
        for changes in [dict(expected_consent='stale'),dict(expected_event='stale'),dict(application_version='2000-01-01'),dict(person_version='2000-01-01')]:
            with self.assertRaises(frappe.TimestampMismatchError):self.save(self.args(**changes))
        self.assertEqual(self.listing()['total'],0)
    def test_confirmation_reason_category_and_tags_validation(self):
        self.grant()
        for changes in [dict(confirmed=False),dict(confirmed='true'),dict(reason='x'),dict(category='Unconfigured family'),dict(tags=['x,y']),dict(tags=['x']*11),dict(tags=[{}]),dict(tags=[''])]:
            with self.assertRaises(frappe.ValidationError):self.save(self.args(**changes))
        self.save(self.args(tags=[' Engineering ','engineering','Arabic']))
        self.assertEqual(self.ctx()['current']['tags'],['Engineering','Arabic'])
        with self.assertRaises(frappe.ValidationError):self.save(self.args(tags=['Engineering','Arabic']))
    def test_removal_after_withdrawal_preserves_evidence(self):
        self.grant();self.save();self.p.record(self.p.args('WITHDRAW'))
        self.assertTrue(self.ctx()['can_remove']);self.save(self.args(action='REMOVE',tags=[],note=''))
        self.assertEqual(self.ctx()['state'],'removed');self.assertEqual(self.p.context()['state'],'withdrawn')
    def test_search_uses_current_profile_literal_terms_and_consistent_pages(self):
        self.grant();self.save(self.args(tags=['مهندس'],note='Available weekends'))
        person=frappe.get_doc(identity.DT,self.person);profile=json.loads(person.profile_json)
        profile.update(full_name='مرشح حالي',specialization='Automation',governorate='Alexandria')
        with acting_as(self.f.users['manager']):
            corrections.correct(name=self.base.request,opening_name=self.base.opening,application=self.app,person=self.person,person_version=str(person.modified),profile=profile,reason='Synthetic profile correction',command_id=uuid.uuid4().hex,expected_version=str(self.f.load(self.base.request).modified))
        for term in ('مرشح حالي','Automation','Alexandria','مهندس','weekends'):
            result=self.listing(search_text=term,page_length=1);self.assertEqual(result['total'],1);self.assertEqual(result['rows'][0]['full_name'],'مرشح حالي')
            self.assertEqual(self.listing(search_text=term,start=1,page_length=1)['rows'],[])
        for term in ('%', '_',"' OR 1=1 --"):
            self.assertEqual(self.listing(search_text=term)['total'],0)
        self.assertEqual(self.listing(tag='مهندس')['total'],1);self.assertEqual(self.listing(category='Hidden family')['total'],0)
        row=self.listing()['rows'][0];self.assertFalse({'person','phone_number','email_id','profile_json','consent_event'}&set(row))
    def test_revocation_hides_discovery_and_replay(self):
        self.grant();args=self.args();self.save(args)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        self.assertEqual(self.listing()['total'],0);self.assertEqual(self.listing()['categories'],[])
        for fn in (lambda:self.save(args),self.ctx,self.history):
            with self.assertRaises(frappe.PermissionError):fn()
    def test_native_application_restriction_hides_rows_counts_and_history(self):
        self.grant();self.save();user=self.f.users['manager']
        frappe.get_doc(dict(doctype='User Permission',user=user,allow='Job Applicant',for_value=self.base.legacy.name,apply_to_all_doctypes=1)).insert(ignore_permissions=True);frappe.clear_cache(user=user)
        self.assertEqual(self.listing(role='manager')['total'],0);self.assertEqual(self.listing(role='manager')['categories'],[])
        with self.assertRaises(frappe.PermissionError):self.ctx(role='manager')
    def test_hidden_source_cannot_be_exposed_via_visible_same_person_application(self):
        self.grant();self.save();opening=self.base.second_opening();person=frappe.get_doc(identity.DT,self.person)
        second=self.base.create(opening_name=opening,person=self.person,person_version=str(person.modified),identity_reason='Synthetic same person review')
        user=self.f.users['manager'];frappe.get_doc(dict(doctype='User Permission',user=user,allow='Job Applicant',for_value=second['application'],apply_to_all_doctypes=1)).insert(ignore_permissions=True);frappe.clear_cache(user=user)
        self.assertEqual(self.listing(role='manager')['total'],0)
        with self.assertRaises(frappe.PermissionError):self.ctx(role='manager',application=second['application'])
    def test_history_is_paged_and_actor_identifiers_are_private(self):
        self.grant();self.save();self.save(self.args(note='Second review'))
        first=self.history(page_length=1);second=self.history(start=1,page_length=1)
        self.assertTrue(first['has_more']);self.assertFalse(second['has_more']);self.assertEqual(first['rows'][0]['sequence'],2)
        for hidden in (self.app,self.person,self.f.users['hr']):self.assertNotIn(hidden,json.dumps([first,second],default=str))
    def test_event_native_mutation_and_reads_are_denied(self):
        self.grant();e=self.save();doc=frappe.get_doc(api.DT,e['event'])
        with acting_as(self.f.users['manager']),self.assertRaises(frappe.PermissionError):client_get(api.DT,doc.name)
        with self.f.rejected(frappe.PermissionError):doc.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.copy_doc(doc).insert(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.delete_doc(api.DT,doc.name,ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.rename_doc(api.DT,doc.name,'Tampered',force=True)
    def test_event_failure_rolls_back_membership_and_activity(self):
        self.grant();args=self.args();count=frappe.db.count('Kandil Candidate Activity')
        with patch.object(api.KandilTalentPoolEvent,'after_insert',side_effect=RuntimeError('Synthetic failure'),create=True),self.assertRaises(RuntimeError):self.save(args)
        self.assertEqual(self.ctx()['state'],'none');self.assertEqual(frappe.db.count('Kandil Candidate Activity'),count);self.save(args)
    def test_job_family_suggestion_is_confirmed_and_searchable(self):
        self.grant();position=self.f.positions[0]
        frappe.db.set_value('Kandil Position',position,'job_family','Engineering')
        ctx=self.ctx();self.assertIn('Engineering',ctx['categories']);self.assertEqual(ctx['suggestion']['category'],'Engineering')
        self.save(self.args(category='Engineering'))
        result=self.listing(category='Engineering');self.assertEqual(result['total'],1);self.assertEqual(result['categories'][0]['category'],'Engineering')
        self.assertEqual(result['categories'][0]['count'],1)
    def test_person_native_restriction_hides_pool_even_when_application_is_visible(self):
        self.grant();self.save();other=self.base.create();user=self.f.users['manager']
        frappe.get_doc(dict(doctype='User Permission',user=user,allow=identity.DT,for_value=other['person'],apply_to_all_doctypes=1)).insert(ignore_permissions=True);frappe.clear_cache(user=user)
        self.assertEqual(self.listing(role='manager')['total'],0);self.assertEqual(self.listing(role='manager')['categories'],[])
    def test_same_person_has_one_current_membership_across_visible_applications(self):
        self.grant();self.save();opening=self.base.second_opening();person=frappe.get_doc(identity.DT,self.person)
        second=self.base.create(opening_name=opening,person=self.person,person_version=str(person.modified),identity_reason='Synthetic same person')
        ctx=self.ctx(application=second['application']);args=self.args(application=second['application'],note='Second source review')
        for key in ('expected_event','expected_consent','application_version','person_version'):args[key]=ctx[key]
        self.save(args);result=self.listing();self.assertEqual(result['total'],1);self.assertEqual(result['rows'][0]['application'],second['application']);self.assertEqual(len(self.history()['rows']),2)
    def test_guest_requester_disabled_mode_denied(self):
        for user in ('Guest',self.f.users['requester']):
            with acting_as(user),self.assertRaises(frappe.PermissionError):api.listing()
        with patch.dict(frappe.conf,{'kandil_candidate_identity_enabled':0}):
            self.assertFalse(self.ctx()['enabled'])
            with self.assertRaises(frappe.PermissionError):self.listing()

def run():
    r=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestTalentPool))
    result=dict(tests_run=r.testsRun,failures=len(r.failures),errors=len(r.errors),skipped=len(r.skipped),successful=r.wasSuccessful() and not r.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in r.failures+r.errors])
    print(json.dumps(result));return result
