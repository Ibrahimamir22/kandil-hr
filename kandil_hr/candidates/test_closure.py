"""Synthetic ordinary-role closure contracts; fixtures roll back completely."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.client import get as client_get
from kandil_hr.candidates import closure, activities, recovery
from kandil_hr.catalogs import api as catalog
from kandil_hr.candidates.test_identity import TestCandidateIdentity
from kandil_hr.recruitment.test_commands import acting_as


class TestCandidateClosure(unittest.TestCase):
    def setUp(self):
        self.f=TestCandidateIdentity();self.addCleanup(self.f.doCleanups);self.f.setUp()
        self.created=self.f.create();self.name=self.created['application']
        self.company=self.f.f.load(self.f.request).company

    def args(self, **changes):
        decision=changes.get('decision','Rejected')
        config=catalog.state(self.company,closure.PROCESSES.get(decision,'CANDIDATE_REJECT'))
        app=frappe.get_doc('Job Applicant',self.name)
        args=dict(name=self.f.request,opening_name=self.f.opening,application=self.name,
            application_version=str(app.modified),expected_version=str(self.f.f.load(self.f.request).modified),
            decision=decision,reason_code='OTHER',catalog_version=config['version'],
            internal_note='Private synthetic decision reason',candidate_message='',command_id=uuid.uuid4().hex)
        args.update(changes);return args

    def call(self, args=None, role='manager', **changes):
        with acting_as(self.f.f.users[role]):return closure.close(**(args or self.args(**changes)))

    def counts(self):
        return tuple(frappe.db.count(dt) for dt in (closure.DT,activities.DT,'Kandil Command Receipt','Kandil Command Audit'))

    def state(self):
        app=frappe.get_doc('Job Applicant',self.name)
        caps=[frappe.get_doc('Kandil Capacity',x.capacity).as_dict() for x in self.f.f.load(self.f.request).lines]
        return app.as_dict(),caps

    def test_rejection_clears_followup_preserves_owner_identity_capacity_and_message_separation(self):
        from kandil_hr.recruitment import ownership
        app=frappe.get_doc('Job Applicant',self.name)
        ownership.store(app,app.custom_kandil_responsible_user,'Fixture followup','Fixture',next_owner=app.custom_kandil_responsible_user,task='Private followup',due='2026-12-01')
        before,caps=self.state();r=self.call(candidate_message='Thank you for your application.')
        after,newcaps=self.state();self.assertEqual(caps,newcaps)
        self.assertEqual(after['status'],'Rejected')
        for k in ('custom_kandil_person','job_title','custom_kandil_source_channel','custom_kandil_source_detail','custom_kandil_responsible_user'):
            self.assertEqual(before[k],after[k])
        for k in ('custom_kandil_next_action','custom_kandil_next_action_owner','custom_kandil_next_action_due'):self.assertFalse(after[k])
        doc=frappe.get_doc(closure.DT,r['closure']);self.assertEqual(doc.message_status,'Pending');self.assertFalse(r['sent'])
        self.assertEqual(doc.internal_note,'Private synthetic decision reason');self.assertEqual(doc.candidate_message,'Thank you for your application.')
        event=frappe.get_doc(activities.DT,r['activity']);self.assertFalse(event.note);self.assertEqual(event.stage_to,'Rejected')
        self.assertFalse(activities.can_void(event,self.f.f.load(self.f.request)))

    def test_withdrawal_is_a_distinct_immutable_decision_with_closed_native_projection(self):
        r=self.call(decision='Withdrawn');doc=frappe.get_doc(closure.DT,r['closure'])
        self.assertEqual(doc.decision,'Withdrawn');self.assertEqual(doc.message_status,'Not applicable')
        self.assertEqual(frappe.db.get_value('Job Applicant',self.name,'status'),'Rejected')
        self.assertEqual(frappe.db.get_value(activities.DT,r['activity'],'stage_to'),'Withdrawn')

    def test_exact_replay_once_and_changed_command_conflicts(self):
        args=self.args();result=self.call(args);before=self.counts();self.assertEqual(result,self.call(args));self.assertEqual(before,self.counts())
        with self.assertRaises(frappe.ValidationError):self.call(dict(args,candidate_message='Changed payload'))
        self.assertEqual(before,self.counts())

    def test_invalid_or_wrong_list_reason_and_missing_required_note_leave_no_effect(self):
        before=self.counts();state=self.state()
        for change in (dict(reason_code='INVALID'),dict(reason_code='DUPLICATE'),dict(internal_note='ab'),dict(decision='Unknown'),dict(decision='Withdrawn',candidate_message='Wrong task'),dict(internal_note={}),dict(candidate_message='x'*2001)):
            with self.assertRaises(frappe.ValidationError):self.call(**change)
        self.assertEqual(before,self.counts());self.assertEqual(state,self.state())

    def test_stale_application_catalog_and_request_versions_are_rejected(self):
        before=self.counts()
        for change in (dict(application_version='2000-01-01'),dict(catalog_version='DEFAULTS:stale'),dict(expected_version='2000-01-01')):
            with self.assertRaises(frappe.TimestampMismatchError):self.call(**change)
        self.assertEqual(before,self.counts())

    def test_second_decision_does_not_replace_history(self):
        self.call();before=self.counts()
        with self.assertRaises(frappe.ValidationError):self.call(decision='Withdrawn')
        self.assertEqual(before,self.counts())

    def test_audit_failure_rolls_back_without_outer_test_savepoint(self):
        before=self.state();counts=self.counts()
        with patch('kandil_hr.foundation.command_audit.record_command',side_effect=RuntimeError('Synthetic failure')):
            with self.assertRaises(RuntimeError):self.call()
        self.assertEqual(before,self.state());self.assertEqual(counts,self.counts())

    def test_stage_failure_rolls_back_closure_and_followup(self):
        before=self.state();counts=self.counts()
        with patch('kandil_hr.candidates.activities.append',side_effect=RuntimeError('Synthetic event failure')):
            with self.assertRaises(RuntimeError):self.call()
        self.assertEqual(before,self.state());self.assertEqual(counts,self.counts())

    def test_generic_audit_and_receipts_do_not_contain_internal_or_message_text(self):
        note='PRIVATE_CLOSE_'+uuid.uuid4().hex;message='PRIVATE_MESSAGE_'+uuid.uuid4().hex
        result=self.call(internal_note=note,candidate_message=message)
        audits=frappe.get_all('Kandil Command Audit',filters={'operation':'candidate_close','target_name':self.f.request},fields=['*'])
        raw=frappe.as_json(audits);self.assertEqual(len(audits),1)
        self.assertNotIn(note,raw);self.assertNotIn(message,raw);self.assertIn(result['closure'],raw);self.assertIn(activities.digest(note),raw)
        raw=frappe.as_json(frappe.get_all('Kandil Command Receipt',fields=['result_json']))
        self.assertNotIn(note,raw);self.assertNotIn(message,raw)

    def test_native_closure_crud_cannot_bypass(self):
        r=self.call();doc=frappe.get_doc(closure.DT,r['closure']);before=doc.as_dict()
        with acting_as(self.f.f.users['manager']),self.f.f.rejected(frappe.PermissionError):client_get(closure.DT,doc.name)
        with self.f.f.rejected(frappe.PermissionError):frappe.copy_doc(doc).insert(ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):doc.internal_note='Tampered';doc.save(ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):frappe.delete_doc(closure.DT,doc.name,ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):frappe.rename_doc(closure.DT,doc.name,'Tampered',force=True)
        self.assertEqual(before,frappe.get_doc(closure.DT,doc.name).as_dict())

    def test_native_rejection_and_reopening_cannot_bypass(self):
        with acting_as(self.f.f.users['manager']),self.f.f.rejected(frappe.PermissionError):
            app=frappe.get_doc('Job Applicant',self.name);app.status='Rejected';app.save()
        self.call()
        with acting_as(self.f.f.users['manager']),self.f.f.rejected(frappe.PermissionError):
            app=frappe.get_doc('Job Applicant',self.name);app.status='Open';app.save()

    def test_closed_application_rejects_downstream_documents(self):
        self.call()
        for dt in ('Interview','Job Offer'):
            with self.assertRaises(frappe.PermissionError):closure.validate_downstream(frappe._dict(doctype=dt,job_applicant=self.name))

    def test_recovery_preserves_both_texts_and_original_reason_then_replays_once(self):
        args=self.args(candidate_message='Reviewed separate message')
        with acting_as(self.f.f.users['manager']):
            saved=recovery.prepare('closure',args);review=recovery.inspect(saved['name'])
            self.assertEqual(review['arguments'],args);self.assertIn('label_ar',review['closure_reason'])
            result=recovery.execute(saved['name']);before=self.counts();self.assertEqual(result,recovery.execute(saved['name']));self.assertEqual(before,self.counts())
            self.assertTrue(recovery.acknowledge(saved['name'])['acknowledged'])
        cipher=frappe.db.get_value(recovery.DT,saved['name'],'payload_cipher');self.assertFalse(cipher)

    def test_context_is_current_scope_and_shows_separate_internal_note_and_message(self):
        with acting_as(self.f.f.users['manager']):
            context=closure.context(self.name);self.assertTrue(context['can_close']);self.assertEqual(set(context['catalogs']),{'Rejected','Withdrawn'})
        self.call(candidate_message='Separate text')
        with acting_as(self.f.f.users['manager']):
            context=closure.context(self.name);self.assertFalse(context['can_close']);self.assertEqual(context['closure']['candidate_message'],'Separate text')
            self.assertNotEqual(context['closure']['candidate_message'],context['closure']['internal_note'])
        with acting_as(self.f.f.users['requester']),self.f.f.rejected(frappe.PermissionError):closure.context(self.name)

    def test_current_revocation_denies_replay_and_recovery(self):
        args=self.args()
        with acting_as(self.f.f.users['manager']):saved=recovery.prepare('closure',args)
        self.call(args)
        for name in frappe.get_all('Kandil Access Grant',filters={'user':self.f.f.users['manager'],'company':self.company},pluck='name'):
            doc=frappe.get_doc('Kandil Access Grant',name);doc.revoked=1;doc.save(ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):self.call(args)
        with acting_as(self.f.f.users['manager']),self.f.f.rejected(frappe.PermissionError):recovery.inspect(saved['name'])

    def test_wrong_opening_reference_and_disabled_feature_rejected(self):
        wrong=self.f.f.load(self.f.request).lines[1].job_opening
        with self.f.f.rejected(frappe.PermissionError):self.call(opening_name=wrong)
        with patch.dict(frappe.conf,{'kandil_candidate_identity_enabled':0}),self.f.f.rejected(frappe.PermissionError):self.call()

    def test_live_interview_and_accepted_stage_are_not_silently_closed(self):
        # A real persisted native downstream record exercises SQL eligibility;
        # insert directly only to avoid coupling this unit suite to scheduling.
        name='CLOSE-TEST-'+uuid.uuid4().hex
        frappe.db.sql("INSERT INTO `tabInterview` (name,job_applicant,status,docstatus) VALUES (%s,%s,'Pending',0)",(name,self.name))
        before=self.state();counts=self.counts()
        with self.assertRaises(frappe.ValidationError):self.call()
        self.assertEqual(before,self.state());self.assertEqual(counts,self.counts())
        frappe.db.sql('DELETE FROM `tabInterview` WHERE name=%s',(name,))
        frappe.db.set_value('Job Applicant',self.name,'status','Accepted')
        with self.assertRaises(frappe.ValidationError):self.call()

    def test_withdrawal_portal_filter_and_detail_are_distinct_from_rejection(self):
        from kandil_hr.portal import candidates
        self.call(decision='Withdrawn')
        with acting_as(self.f.f.users['manager']):
            self.assertEqual(candidates.detail(self.name)['application']['status'],'Withdrawn')
            self.assertEqual(candidates.listing(search=self.name,status='Withdrawn')['total'],1)
            self.assertEqual(candidates.listing(search=self.name,status='Rejected')['total'],0)

    def test_accepted_offer_pending_joining_routes_to_joining_outcome(self):
        name='CLOSE-OFFER-'+uuid.uuid4().hex
        frappe.db.sql("INSERT INTO `tabJob Offer` (name,job_applicant,status,docstatus,custom_kandil_outcome) VALUES (%s,%s,'Accepted',1,'Pending')",(name,self.name))
        self.assertEqual(closure.blockers(frappe.get_doc('Job Applicant',self.name),True),'joining_outcome')
        before=self.counts()
        with self.assertRaises(frappe.ValidationError):self.call()
        self.assertEqual(before,self.counts())

    def test_native_referral_cannot_be_silently_rejected_by_application_save(self):
        name='CLOSE-REFERRAL-'+uuid.uuid4().hex
        frappe.db.sql("INSERT INTO `tabEmployee Referral` (name,status,docstatus) VALUES (%s,'In Process',0)",(name,))
        frappe.db.set_value('Job Applicant',self.name,'employee_referral',name)
        before=self.state();counts=self.counts()
        with self.assertRaises(frappe.ValidationError):self.call()
        self.assertEqual(before,self.state());self.assertEqual(counts,self.counts())
        self.assertEqual(frappe.db.get_value('Employee Referral',name,'status'),'In Process')
        with acting_as(self.f.f.users['manager']):
            context=closure.context(self.name)
            self.assertFalse(context['can_close']);self.assertEqual(context['blocker'],'referral_workflow')


def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestCandidateClosure))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
