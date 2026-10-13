"""Durable candidate envelope contracts with ordinary synthetic role accounts."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch
import frappe
from frappe.client import get as client_get
from kandil_hr.candidates import recovery,identity,migration
from kandil_hr.candidates.test_identity import TestCandidateIdentity
from kandil_hr.recruitment.test_commands import acting_as


class TestRecovery(unittest.TestCase):
    def setUp(self):
        self.f=TestCandidateIdentity();self.addCleanup(self.f.doCleanups);self.f.setUp()
        self.args=dict(name=self.f.request,opening_name=self.f.opening,details=self.f.data,
            command_id=uuid.uuid4().hex,expected_version=str(self.f.f.load(self.f.request).modified))

    def call(self,method,role='manager',**args):
        with acting_as(self.f.f.users[role]):return getattr(recovery,method)(**args)

    def prepare(self,**args):return self.call('prepare',operation='intake',arguments=dict(self.args,**args))

    def test_prepare_encrypts_and_does_not_execute(self):
        counts=self.f.counts();d=self.prepare();stored=frappe.get_doc(recovery.DT,d['name'])
        self.assertEqual(counts,self.f.counts());self.assertEqual(stored.status,'Pending')
        self.assertNotIn(self.f.data['email_id'],stored.payload_cipher)
        self.assertNotIn(self.f.data['phone_number'],stored.payload_cipher)
        self.assertEqual(self.call('inspect',name=d['name'])['arguments'],self.args)
        self.assertEqual(set(d),{'name','operation','status','created'})

    def test_prepare_retry_and_payload_conflict(self):
        d=self.prepare();self.assertEqual(d,self.prepare())
        with self.f.f.rejected():self.prepare(details=dict(self.f.data,applicant_name='Changed'))
        self.assertEqual(frappe.db.count(recovery.DT,{'actor':self.f.f.users['manager']}),1)

    def test_execute_after_reload_replays_and_ack_removes_private_payload(self):
        d=self.prepare();counts=self.f.counts();result=self.call('execute',name=d['name'])
        self.assertEqual(self.f.counts(),tuple(v+n for v,n in zip(counts,(1,1,1,1))))
        frappe.local.document_cache={}
        self.assertEqual(result,self.call('execute',name=d['name']))
        self.assertEqual(self.call('pending')['rows'][0]['status'],'Completed')
        self.assertEqual(self.call('acknowledge',name=d['name']),{'acknowledged':True})
        self.assertEqual(self.call('pending')['rows'],[])
        self.assertFalse(frappe.db.get_value(recovery.DT,d['name'],'payload_cipher'))
        self.assertTrue(self.call('acknowledge',name=d['name'])['acknowledged'])
        with self.f.f.rejected():self.call('execute',name=d['name'])

    def test_other_actors_cannot_read_or_execute_even_hr(self):
        d=self.prepare()
        for role in ('hr','requester'):
            for method in ('inspect','execute','acknowledge','cancel'):
                with self.f.f.rejected(frappe.PermissionError):self.call(method,role=role,name=d['name'])
        self.assertEqual(self.call('pending',role='hr')['rows'],[])
        with self.f.f.rejected(frappe.PermissionError):self.call('inspect',name='not-an-envelope')

    def test_revocation_blocks_payload_execution_and_completed_replay(self):
        d=self.prepare();self.call('execute',name=d['name'])
        frappe.db.set_value('Kandil Access Grant',self.f.f.grants['manager'],'revoked',1)
        for method in ('inspect','execute','acknowledge'):
            with self.f.f.rejected(frappe.PermissionError):self.call(method,name=d['name'])
        # Own minimal receipt index contains no private business references.
        row=self.call('pending')['rows'][0]
        self.assertEqual(set(row),{'name','operation','status','created'})

    def test_native_access_and_native_changes_are_denied(self):
        d=self.prepare()
        with acting_as(self.f.f.users['manager']),self.f.f.rejected(frappe.PermissionError):client_get(recovery.DT,d['name'])
        with self.f.f.rejected(frappe.PermissionError):
            doc=frappe.get_doc(recovery.DT,d['name']);doc.status='Completed';doc.save(ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):frappe.delete_doc(recovery.DT,d['name'],ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):frappe.get_doc(dict(doctype=recovery.DT,dedupe_key='forged',actor=self.f.f.users['manager'],request=self.f.request,operation='intake',payload_hash='forged',status='Pending')).insert(ignore_permissions=True)

    def test_cancel_unexecuted_blocks_future_recovery_and_clears_payload(self):
        d=self.prepare();counts=self.f.counts()
        self.assertTrue(self.call('cancel',name=d['name'])['cancelled'])
        self.assertTrue(self.call('cancel',name=d['name'])['cancelled'])
        with self.f.f.rejected():self.call('execute',name=d['name'])
        self.assertEqual(counts,self.f.counts());self.assertEqual(self.call('pending')['rows'],[])
        self.assertFalse(frappe.db.get_value(recovery.DT,d['name'],'payload_cipher'))

    def test_pending_ack_and_completed_cancel_are_denied(self):
        d=self.prepare()
        with self.f.f.rejected():self.call('acknowledge',name=d['name'])
        self.call('execute',name=d['name'])
        with self.f.f.rejected():self.call('cancel',name=d['name'])

    def test_marker_failure_rolls_back_business_effect_even_when_caught(self):
        d=self.prepare();counts=self.f.counts();original=frappe.db.set_value
        def failing(kind,*args,**kwargs):
            if kind==recovery.DT:raise RuntimeError('Synthetic completion marker failure')
            return original(kind,*args,**kwargs)
        with patch.object(frappe.db,'set_value',side_effect=failing):
            with self.assertRaises(RuntimeError):self.call('execute',name=d['name'])
        self.assertEqual(counts,self.f.counts());self.assertEqual(frappe.db.get_value(recovery.DT,d['name'],'status'),'Pending')
        self.assertEqual(self.call('execute',name=d['name'])['status'],'Completed')

    def test_stale_payload_is_retained_without_business_effect(self):
        d=self.prepare(expected_version='2000-01-01');counts=self.f.counts()
        with self.f.f.rejected(frappe.TimestampMismatchError):self.call('execute',name=d['name'])
        self.assertEqual(counts,self.f.counts());self.assertEqual(self.call('inspect',name=d['name'])['status'],'Pending')

    def test_disabled_mode_invalid_operations_and_corruption_fail_closed(self):
        for operation,args in [([],self.args),('intake',dict(self.args,person={})),('unknown',self.args),('intake',dict(self.args,extra='bad')),('intake',dict(self.args,details='x'*16001))]:
            with self.f.f.rejected():self.call('prepare',operation=operation,arguments=args)
        d=self.prepare()
        with patch.dict(frappe.conf,{'kandil_candidate_identity_enabled':0}),self.f.f.rejected(frappe.PermissionError):self.call('execute',name=d['name'])
        frappe.db.set_value(recovery.DT,d['name'],'payload_hash','0'*64)
        with self.f.f.rejected():self.call('execute',name=d['name'])

    def test_pending_pagination_has_no_missing_or_repeated_commands(self):
        names={self.prepare(command_id=uuid.uuid4().hex)['name'] for n in range(3)}
        first=self.call('pending',page_length=2);second=self.call('pending',page_length=2,start=first['next_start'])
        self.assertTrue(first['has_more']);self.assertFalse(second['has_more'])
        self.assertEqual({r['name'] for r in first['rows']+second['rows']},names)
        self.assertEqual(len(first['rows'])+len(second['rows']),3)

    def test_correction_and_migration_reuse_existing_receipts(self):
        created=self.f.create();person=frappe.get_doc(identity.DT,created['person']);profile=json.loads(person.profile_json)
        args=dict(name=self.f.request,opening_name=self.f.opening,application=created['application'],person=created['person'],
            person_version=str(person.modified),profile=dict(profile,city='Giza'),reason='Reviewed correction',
            command_id=uuid.uuid4().hex,expected_version=str(self.f.f.load(self.f.request).modified))
        d=self.call('prepare',operation='correction',arguments=args);first=self.call('execute',name=d['name'])
        self.assertEqual(first,self.call('execute',name=d['name']));self.assertTrue(first['result']['revision'])
        with acting_as(self.f.f.users['hr']):p=migration.preview(self.f.legacy.name)
        args=dict(name=p['request'],opening_name=p['opening'],application=p['application'],application_version=p['application_version'],
            expected_version=p['request_version'],preview_hash=p['preview_hash'],reason='Reviewed migration',command_id=uuid.uuid4().hex)
        d=self.call('prepare',role='hr',operation='migration',arguments=args);first=self.call('execute',role='hr',name=d['name'])
        self.assertEqual(first,self.call('execute',role='hr',name=d['name']));self.assertTrue(first['result']['reconciliation']['preserved'])


def run():
    r=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestRecovery))
    result=dict(tests_run=r.testsRun,failures=len(r.failures),errors=len(r.errors),skipped=len(r.skipped),successful=r.wasSuccessful() and not r.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in r.failures+r.errors])
    print(json.dumps(result));return result
