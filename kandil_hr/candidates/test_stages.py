"""Isolated rollback tests for actual Screening and leadership reopening effects."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.client import get as client_get
from kandil_hr.candidates import stages,closure,closure_history,activities,recovery,messages
from kandil_hr.catalogs import api as catalog
from kandil_hr.privacy import consent
from kandil_hr.privacy.test_consent import TestConsent
from kandil_hr.recruitment.test_commands import acting_as


class TestStages(unittest.TestCase):
    def setUp(self):
        self.c=TestConsent();self.addCleanup(self.c.doCleanups);self.c.setUp()
        self.f=self.c.f;self.app=self.c.app;self.request=self.c.n.c.a.f.request;self.opening=self.c.n.c.a.f.opening
        flag=patch.dict(frappe.conf,{stages.FLAG:1});flag.start();self.addCleanup(flag.stop)

    def accept(self):
        token=self.c.reveal(self.c.issue());return self.c.accept(self.c.payload(token))

    def args(self,**changes):
        doc=frappe.get_doc('Job Applicant',self.app)
        args=dict(name=self.request,opening_name=self.opening,application=self.app,application_version=str(doc.modified),
            expected_version=str(frappe.get_doc('Kandil Hiring Request',self.request).modified),reason='Private synthetic screening reason',command_id=uuid.uuid4().hex)
        active=closure.existing(self.app,current=True)
        if active:args.update(closure_name=active,closure_hash=frappe.db.get_value(closure.DT,active,'content_hash'))
        args.update(changes);return args

    def call(self,operation='screen',args=None,role='hr'):
        with acting_as(self.f.users[role]):return getattr(stages,operation)(**(args or self.args()))

    def close(self,decision='Rejected',candidate_message='Synthetic draft'):
        args=self.args();args.pop('reason');args.pop('closure_name',None);args.pop('closure_hash',None)
        config=catalog.state(self.c.company,closure.PROCESSES[decision])
        args.update(decision=decision,reason_code='OTHER',catalog_version=config['version'],internal_note='Synthetic close reason',candidate_message=candidate_message if decision=='Rejected' else '')
        with acting_as(self.f.users['manager']):return closure.close(**args)

    def counts(self):
        return tuple(frappe.db.count(dt) for dt in (closure_history.DT,activities.DT,'Kandil Command Audit','Kandil Command Receipt'))

    def capacity(self):
        return [frappe.get_doc('Kandil Capacity',x.capacity).as_dict() for x in self.f.load(self.request).lines]

    def test_consent_is_required_and_issue_is_not_acceptance(self):
        before=self.counts()
        with self.assertRaises(frappe.PermissionError):self.call()
        self.c.issue()
        with self.assertRaises(frappe.PermissionError):self.call()
        self.assertEqual(before,self.counts());self.assertEqual(frappe.db.get_value('Job Applicant',self.app,'status'),'Open')

    def test_actual_screening_stage_with_immutable_activity_and_unchanged_capacity(self):
        self.accept();before=self.capacity();result=self.call(role='manager')
        self.assertEqual(result['stage'],'Screening');self.assertIsNone(result['reopening'])
        self.assertEqual(frappe.db.get_value('Job Applicant',self.app,'status'),'Screening')
        event=frappe.get_doc(activities.DT,result['activity']);self.assertEqual(event.stage_from,'Open');self.assertEqual(event.stage_to,'Screening')
        self.assertEqual(before,self.capacity());self.assertFalse(result['sent'])
        audit=frappe.get_all('Kandil Command Audit',filters={'operation':'candidate_screen'},fields=['*'])
        self.assertNotIn('Private synthetic screening reason',json.dumps(audit,default=str))

    def test_exact_retry_and_changed_payload_conflict(self):
        self.accept();args=self.args();result=self.call(args=args);before=self.counts()
        self.assertEqual(result,self.call(args=args));self.assertEqual(before,self.counts())
        with self.assertRaises(frappe.ValidationError):self.call(args=dict(args,reason='Changed reason'))

    def test_reopening_preserves_closure_cancels_pending_message_and_returns_real_screening(self):
        self.accept();closed=self.close();original=frappe.get_doc(closure.DT,closed['closure']).as_dict();before=self.capacity()
        result=self.call('reopen');event=frappe.get_doc(closure_history.DT,result['reopening'])
        self.assertEqual(event.consent_evidence,consent.acceptance(self.c.company,self.c.person).name)
        self.assertEqual(event.closure_hash,original['content_hash']);self.assertEqual(event.target_stage,'Screening')
        self.assertIsNone(closure.existing(self.app,current=True));self.assertEqual(original,frappe.get_doc(closure.DT,closed['closure']).as_dict())
        self.assertEqual(before,self.capacity());self.assertEqual(frappe.db.get_value('Job Applicant',self.app,'status'),'Screening')
        with acting_as(self.f.users['hr']):history=closure_history.history(self.app)
        self.assertEqual(history['rows'][0]['message_status'],'CANCELLED')

    def test_withdrawn_application_reopens_and_closes_again_with_two_distinct_cycles(self):
        self.accept();first=self.close('Withdrawn');self.call('reopen');second=self.close();self.call('reopen')
        self.assertNotEqual(first['closure'],second['closure'])
        self.assertEqual(frappe.db.count(closure_history.DT,{'application':self.app}),2)
        self.assertEqual(frappe.db.count(closure.DT,{'application':self.app}),2)

    def test_reopening_requires_current_leadership_even_on_retry(self):
        self.accept();self.close();args=self.args()
        with self.assertRaises(frappe.PermissionError):self.call('reopen',args,role='manager')
        result=self.call('reopen',args)
        settings=frappe.get_doc('Kandil Organization Settings',self.c.company)
        frappe.db.set_value(settings.doctype,settings.name,'hr_approver',self.f.users['manager'])
        with self.assertRaises(frappe.PermissionError):self.call('reopen',args)
        self.assertTrue(result['reopening'])

    def test_reopen_requires_consent_and_active_vacancy(self):
        self.close()
        with self.assertRaises(frappe.PermissionError):self.call('reopen')
        self.accept();frappe.db.set_value('Job Opening',self.opening,'custom_kandil_vacancy_state','Paused')
        with self.assertRaises(frappe.ValidationError):self.call('reopen')
        self.assertEqual(frappe.db.count(closure_history.DT,{'application':self.app}),0)

    def test_reviewed_application_request_and_closure_versions_are_required(self):
        self.accept();self.close();before=self.counts()
        for change in (dict(application_version='2000-01-01'),dict(expected_version='2000-01-01'),dict(closure_hash='0'*64),dict(closure_name='missing')):
            with self.assertRaises((frappe.TimestampMismatchError,frappe.DoesNotExistError)):self.call('reopen',self.args(**change))
        self.assertEqual(before,self.counts())

    def test_failed_activity_rolls_back_reopening_and_status(self):
        self.accept();self.close();before=self.counts();app=frappe.get_doc('Job Applicant',self.app).as_dict()
        with patch.object(activities,'append',side_effect=RuntimeError('Synthetic stage failure')),self.assertRaises(RuntimeError):self.call('reopen')
        self.assertEqual(before,self.counts());self.assertEqual(app,frappe.get_doc('Job Applicant',self.app).as_dict())
        self.assertIsNotNone(closure.existing(self.app,current=True))

    def test_native_applicant_changes_cannot_invent_screening_or_skip_consent(self):
        for status in ('Screening','Shortlisted','Accepted'):
            with self.f.rejected(frappe.PermissionError):
                doc=frappe.get_doc('Job Applicant',self.app);doc.status=status;doc.save(ignore_permissions=True)
        self.accept()
        with self.f.rejected(frappe.PermissionError):
            doc=frappe.get_doc('Job Applicant',self.app);doc.status='Screening';doc.save(ignore_permissions=True)

    def test_native_save_cannot_silently_undo_screening(self):
        self.accept();self.call()
        for status in ('Open','Replied','Hold','Shortlisted','Rejected'):
            with self.f.rejected(frappe.PermissionError):
                doc=frappe.get_doc('Job Applicant',self.app);doc.status=status;doc.save(ignore_permissions=True)
        self.assertEqual(frappe.db.get_value('Job Applicant',self.app,'status'),'Screening')

    def test_native_downstream_guard_requires_candidate_consent(self):
        for dt in ('Interview','Job Offer'):
            doc=frappe.get_doc(dict(doctype=dt,job_applicant=self.app))
            with self.assertRaises(frappe.PermissionError):stages.validate_downstream(doc)
        self.accept()
        for dt in ('Interview','Job Offer'):stages.validate_downstream(frappe.get_doc(dict(doctype=dt,job_applicant=self.app)))

    def test_reopening_evidence_native_read_edit_copy_delete_are_denied(self):
        self.accept();self.close();result=self.call('reopen');doc=frappe.get_doc(closure_history.DT,result['reopening']);before=doc.as_dict()
        with acting_as(self.f.users['hr']),self.assertRaises(frappe.PermissionError):client_get(doc.doctype,doc.name)
        with self.f.rejected(frappe.PermissionError):doc.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.copy_doc(doc).insert(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.delete_doc(doc.doctype,doc.name,ignore_permissions=True)
        self.assertEqual(before,frappe.get_doc(doc.doctype,doc.name).as_dict())

    def test_completed_message_outcome_survives_reopening(self):
        self.accept();self.close();args=self.args();args.pop('reason')
        args.update(outcome='NOT_NEEDED',channel='',message_text='',note='Synthetic outcome reviewed')
        with acting_as(self.f.users['hr']):done=messages.resolve(**args)
        original=frappe.get_doc(messages.DT,done['resolution']).as_dict();self.call('reopen')
        self.assertEqual(original,frappe.get_doc(messages.DT,done['resolution']).as_dict())
        with acting_as(self.f.users['hr']):history=closure_history.history(self.app)
        self.assertEqual(history['rows'][0]['message_status'],'NOT_NEEDED')

    def test_screening_from_contacted_preserves_followup(self):
        from kandil_hr.recruitment import ownership
        doc=frappe.get_doc('Job Applicant',self.app);doc.status='Replied'
        ownership.store(doc,doc.custom_kandil_responsible_user,'Synthetic contact','Fixture',next_owner=doc.custom_kandil_responsible_user,task='Synthetic reviewed follow-up',due='2026-12-01')
        self.accept();self.call()
        after=frappe.get_doc('Job Applicant',self.app)
        self.assertEqual(after.status,'Screening');self.assertEqual(after.custom_kandil_next_action,'Synthetic reviewed follow-up')

    def test_revoked_access_denies_screening_replay(self):
        self.accept();args=self.args();self.call(args=args)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        with self.assertRaises(frappe.PermissionError):self.call(args=args)

    def test_durable_reopening_recovery_is_actor_owned_and_exactly_once(self):
        self.accept();self.close();args=self.args()
        with acting_as(self.f.users['hr']):
            envelope=recovery.prepare('reopen',args);first=recovery.execute(envelope['name']);second=recovery.execute(envelope['name'])
        self.assertEqual(first,second);self.assertEqual(frappe.db.count(closure_history.DT,{'application':self.app}),1)
        with acting_as(self.f.users['manager']),self.assertRaises(frappe.PermissionError):recovery.execute(envelope['name'])


def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestStages))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,fixtures_rolled_back=True,scope='Screening/reopening service and native hooks; browser/concurrency acceptance separate',failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
