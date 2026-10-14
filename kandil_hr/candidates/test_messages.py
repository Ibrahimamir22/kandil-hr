"""Synthetic rejection-message resolution, privacy and queue contracts."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.client import get as client_get
from kandil_hr.candidates import activities,closure,messages,recovery
from kandil_hr.candidates.test_identity import TestCandidateIdentity
from kandil_hr.recruitment.test_commands import acting_as


class TestCandidateMessages(unittest.TestCase):
    def setUp(self):
        self.f=TestCandidateIdentity();self.addCleanup(self.f.doCleanups);self.f.setUp()
        created=self.f.create();self.name=created['application'];self.company=self.f.f.load(self.f.request).company
        self.closed=self.close(self.name)

    def close(self,name,decision='Rejected'):
        app=frappe.get_doc('Job Applicant',name);config=closure.catalog.state(self.company,closure.PROCESSES[decision])
        with acting_as(self.f.f.users['manager']):
            return closure.close(self.f.request,self.f.opening,name,str(app.modified),decision,'OTHER',config['version'],
                'Private rejection explanation','Draft for candidate' if decision=='Rejected' else '',uuid.uuid4().hex,str(self.f.f.load(self.f.request).modified))

    def args(self,**changes):
        app=frappe.get_doc('Job Applicant',self.name);task=frappe.get_doc(closure.DT,self.closed['closure'])
        args=dict(name=self.f.request,opening_name=self.f.opening,application=self.name,application_version=str(app.modified),
            expected_version=str(self.f.f.load(self.f.request).modified),closure_name=task.name,closure_hash=task.content_hash,
            outcome='MANUAL_SENT',channel='Email',message_text='Message actually sent manually',note='Synthetic manual report',command_id=uuid.uuid4().hex)
        args.update(changes);return args

    def call(self,args=None,role='manager',**changes):
        with acting_as(self.f.f.users[role]):return messages.resolve(**(args or self.args(**changes)))

    def counts(self):
        return tuple(frappe.db.count(dt) for dt in (messages.DT,activities.DT,'Kandil Command Receipt','Kandil Command Audit'))

    def test_manual_report_records_actual_text_without_provider_or_system_sending(self):
        original=frappe.get_doc(closure.DT,self.closed['closure']).as_dict();app=frappe.get_doc('Job Applicant',self.name).as_dict()
        result=self.call();record=frappe.get_doc(messages.DT,result['resolution'])
        self.assertEqual(record.outcome,'MANUAL_SENT');self.assertEqual(record.channel,'Email');self.assertEqual(record.message_text,'Message actually sent manually')
        self.assertFalse(record.sent_by_system);self.assertFalse(record.provider_verified)
        self.assertFalse(result['sent_by_system']);self.assertFalse(result['provider_verified'])
        self.assertEqual(original,frappe.get_doc(closure.DT,self.closed['closure']).as_dict())
        self.assertEqual(app,frappe.get_doc('Job Applicant',self.name).as_dict())
        event=frappe.get_doc(activities.DT,result['activity']);self.assertEqual(event.kind,'MESSAGE');self.assertEqual(event.message_resolution,record.name);self.assertFalse(event.note)
        self.assertFalse(activities.can_void(event,self.f.f.load(self.f.request)))

    def test_not_needed_requires_reason_and_has_no_delivery_claim(self):
        r=self.call(outcome='NOT_NEEDED',channel='',message_text='',note='Candidate requested no further messages')
        d=frappe.get_doc(messages.DT,r['resolution']);self.assertEqual(d.outcome,'NOT_NEEDED');self.assertFalse(d.channel);self.assertFalse(d.message_text)
        self.assertFalse(r['sent_by_system']);self.assertFalse(r['provider_verified'])

    def test_invalid_outcomes_channels_and_text_rejected_without_effect(self):
        before=self.counts()
        for values in [dict(outcome='SENT'),dict(outcome='AUTO_SENT'),dict(channel='SMS'),dict(message_text=''),dict(message_text='x'*2001),dict(note='x'*1001),dict(note={}),dict(outcome='NOT_NEEDED'),dict(outcome='NOT_NEEDED',channel='',message_text='',note='ab')]:
            with self.assertRaises(frappe.ValidationError):self.call(**values)
        self.assertEqual(before,self.counts())

    def test_exact_replay_is_one_resolution_and_conflicting_payload_denied(self):
        args=self.args();r=self.call(args);before=self.counts();self.assertEqual(r,self.call(args));self.assertEqual(before,self.counts())
        with self.assertRaises(frappe.ValidationError):self.call(dict(args,note='Different report'))
        self.assertEqual(before,self.counts())

    def test_second_decision_cannot_overwrite_history(self):
        self.call();before=self.counts()
        with self.assertRaises(frappe.ValidationError):self.call(outcome='NOT_NEEDED',channel='',message_text='',note='Competing outcome')
        self.assertEqual(before,self.counts())

    def test_stale_application_request_and_closure_rejected(self):
        before=self.counts()
        for change in (dict(application_version='2000-01-01'),dict(expected_version='2000-01-01'),dict(closure_hash='stale')):
            with self.assertRaises(frappe.TimestampMismatchError):self.call(**change)
        self.assertEqual(before,self.counts())

    def test_cross_application_closure_is_denied(self):
        other=self.f.create();closed=self.close(other['application'])
        with self.f.f.rejected(frappe.PermissionError):self.call(closure_name=closed['closure'])

    def test_withdrawal_and_nonclosed_application_have_no_task(self):
        other=self.f.create();withdrawn=self.close(other['application'],'Withdrawn');doc=frappe.get_doc(closure.DT,withdrawn['closure'])
        with self.assertRaises(frappe.ValidationError):self.call(application=other['application'],application_version=str(frappe.get_doc('Job Applicant',other['application']).modified),closure_name=doc.name,closure_hash=doc.content_hash)
        open_app=self.f.create()
        with acting_as(self.f.f.users['manager']):self.assertFalse(messages.context(open_app['application'])['pending'])

    def test_audit_failure_rolls_back_resolution_and_event(self):
        before=self.counts()
        with patch('kandil_hr.foundation.command_audit.record_command',side_effect=RuntimeError('Synthetic audit failure')):
            with self.assertRaises(RuntimeError):self.call()
        self.assertEqual(before,self.counts())

    def test_event_failure_rolls_back_resolution(self):
        before=self.counts()
        with patch('kandil_hr.candidates.activities.append',side_effect=RuntimeError('Synthetic event failure')):
            with self.assertRaises(RuntimeError):self.call()
        self.assertEqual(before,self.counts())

    def test_audit_has_hashes_not_message_or_internal_notes(self):
        message='PRIVATE_SENT_TEXT_'+uuid.uuid4().hex;note='PRIVATE_RESOLUTION_NOTE_'+uuid.uuid4().hex
        result=self.call(message_text=message,note=note)
        rows=frappe.get_all('Kandil Command Audit',filters={'operation':'candidate_message_resolve','target_name':self.f.request},fields=['*'])
        self.assertEqual(len(rows),1);raw=frappe.as_json(rows)
        self.assertNotIn(message,raw);self.assertNotIn(note,raw);self.assertNotIn('Private rejection explanation',raw)
        self.assertIn(activities.digest(message),raw);self.assertIn(result['resolution'],raw)

    def test_native_read_create_update_delete_rename_cannot_bypass(self):
        r=self.call();doc=frappe.get_doc(messages.DT,r['resolution']);before=doc.as_dict()
        with acting_as(self.f.f.users['manager']),self.f.f.rejected(frappe.PermissionError):client_get(messages.DT,doc.name)
        with self.f.f.rejected(frappe.PermissionError):frappe.copy_doc(doc).insert(ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):doc.message_text='Forged';doc.save(ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):frappe.delete_doc(messages.DT,doc.name,ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):frappe.rename_doc(messages.DT,doc.name,'Forged',force=True)
        self.assertEqual(before,frappe.get_doc(messages.DT,doc.name).as_dict())

    def test_context_derived_status_preserves_original_closure(self):
        with acting_as(self.f.f.users['manager']):
            c=messages.context(self.name);self.assertTrue(c['pending']);self.assertTrue(c['can_resolve']);self.assertEqual(c['task']['draft'],'Draft for candidate');self.assertNotIn('Private rejection explanation',frappe.as_json(c))
        self.call()
        with acting_as(self.f.f.users['manager']):
            c=messages.context(self.name);self.assertFalse(c['pending']);self.assertFalse(c['can_resolve']);self.assertEqual(c['resolution']['outcome'],'MANUAL_SENT')
            self.assertEqual(closure.context(self.name)['closure']['message_status'],'MANUAL_SENT')
        self.assertEqual(frappe.db.get_value(closure.DT,self.closed['closure'],'message_status'),'Pending')

    def test_queue_counts_pages_search_and_sensitive_content_exclusion(self):
        for i in range(3):self.close(self.f.create()['application'])
        self.call()
        with acting_as(self.f.f.users['manager']):
            pending=messages.queue(page_length=2);self.assertEqual(pending['counts'],dict(all=4,pending=3,resolved=1));self.assertEqual(len(pending['rows']),2);self.assertTrue(pending['has_more'])
            second=messages.queue(start=2,page_length=2);self.assertEqual(len(second['rows']),1);self.assertFalse(second['has_more'])
            result=messages.queue(status='resolved',search=self.name);self.assertEqual(result['total'],1);self.assertEqual(result['rows'][0]['outcome'],'MANUAL_SENT')
            raw=frappe.as_json(pending);self.assertNotIn('Private rejection explanation',raw);self.assertNotIn('Draft for candidate',raw)
            with self.assertRaises(frappe.ValidationError):messages.queue(status='unknown')

    def test_requester_cannot_read_context_or_queue(self):
        with acting_as(self.f.f.users['requester']),self.f.f.rejected(frappe.PermissionError):messages.context(self.name)
        with acting_as(self.f.f.users['requester']),self.f.f.rejected(frappe.PermissionError):messages.queue()

    def test_recovery_preserves_actual_text_and_completion_is_exact(self):
        args=self.args()
        with acting_as(self.f.f.users['manager']):
            saved=recovery.prepare('message',args);self.assertEqual(recovery.inspect(saved['name'])['arguments'],args)
            result=recovery.execute(saved['name']);before=self.counts();self.assertEqual(result,recovery.execute(saved['name']));self.assertEqual(before,self.counts())
            self.assertTrue(recovery.acknowledge(saved['name'])['acknowledged'])
        self.assertFalse(frappe.db.get_value(recovery.DT,saved['name'],'payload_cipher'))

    def test_revocation_denies_replay_and_private_recovery(self):
        args=self.args()
        with acting_as(self.f.f.users['manager']):saved=recovery.prepare('message',args)
        self.call(args)
        for name in frappe.get_all('Kandil Access Grant',filters={'user':self.f.f.users['manager'],'company':self.company},pluck='name'):
            doc=frappe.get_doc('Kandil Access Grant',name);doc.revoked=1;doc.save(ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):self.call(args)
        with acting_as(self.f.f.users['manager']),self.f.f.rejected(frappe.PermissionError):recovery.inspect(saved['name'])
        with acting_as(self.f.f.users['manager']):self.assertEqual(messages.queue()['total'],0)

    def test_feature_disabled_denies_mutation_but_preserves_read_history(self):
        with patch.dict(frappe.conf,{'kandil_candidate_identity_enabled':0}):
            with acting_as(self.f.f.users['manager']):self.assertFalse(messages.context(self.name)['can_resolve'])
            with self.assertRaises(frappe.PermissionError):self.call()


def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestCandidateMessages))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
