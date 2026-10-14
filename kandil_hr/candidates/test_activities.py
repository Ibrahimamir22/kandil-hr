"""Rollback-scoped activity effects, reasoned voids and current-access history."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.client import get as client_get

from kandil_hr.candidates import activities, recovery
from kandil_hr.candidates.test_identity import TestCandidateIdentity
from kandil_hr.recruitment import vacancies
from kandil_hr.recruitment.test_commands import acting_as


class TestCandidateActivities(unittest.TestCase):
    def setUp(self):
        self.f=TestCandidateIdentity();self.addCleanup(self.f.doCleanups);self.f.setUp()
        self.created=self.f.create();self.name=self.created['application']

    def args(self, **changes):
        app=frappe.get_doc('Job Applicant',self.name)
        args=dict(name=self.f.request,opening_name=self.f.opening,application=self.name,
            application_version=str(app.modified),expected_version=str(self.f.f.load(self.f.request).modified),
            command_id=uuid.uuid4().hex,kind='CALL',outcome='REACHED',note='Synthetic private discussion')
        args.update(changes);return args

    def call(self, method='record', role='manager', args=None, **changes):
        with acting_as(self.f.f.users[role]):
            return getattr(activities,method)(**(args or self.args(**changes)))

    def void_args(self, event, **changes):
        args=self.args(activity=event,reason='Incorrectly logged conversation')
        for key in ('kind','outcome','note'):args.pop(key)
        args.update(changes);return args

    def history(self, role='manager', **kwargs):
        with acting_as(self.f.f.users[role]):return activities.listing(self.name,**kwargs)

    def counts(self):
        return tuple(frappe.db.count(dt) for dt in (activities.DT,'Kandil Command Receipt','Kandil Command Audit'))

    def test_manual_types_and_call_outcomes(self):
        for kind in activities.TYPES:
            self.call(kind=kind,outcome='REACHED' if kind=='CALL' else '')
        for outcome in activities.OUTCOMES[1:]:self.call(outcome=outcome)
        data=self.history();self.assertEqual(data['total'],9)
        self.assertTrue(data['can_record']);self.assertTrue(all(row['can_void'] for row in data['rows']))
        self.assertNotIn('@example.invalid',json.dumps(data['rows']))
        self.assertEqual({row['user'] for row in data['owners']},{self.f.f.users[k] for k in ('hr','manager')})
        self.assertTrue(all(row['recorded_at'].endswith('+03:00') or row['recorded_at'].endswith('+02:00') for row in data['rows']))

    def test_plain_text_is_preserved_and_content_hash_matches_saved_fields(self):
        note='<img src=x onerror=alert(1)> ملاحظة داخلية'
        first=self.call(note=note)
        event=frappe.get_doc(activities.DT,first['activity'])
        self.assertEqual(event.note,note)
        keys=('application','person','company','actor','recorded_at','kind','outcome','note','voids')
        label_keys=('kind_label_ar','kind_label_en','catalog_version')
        self.assertEqual(event.content_hash,activities.digest({k:event.get(k) for k in keys+label_keys}))
        reason='<script>void_reason</script> reviewed reason'
        result=self.call('void',args=self.void_args(event.name,reason=reason))
        cancel=frappe.get_doc(activities.DT,result['void_activity'])
        self.assertEqual(cancel.note,reason)
        self.assertEqual(cancel.content_hash,activities.digest({k:cancel.get(k) for k in keys}))

    def test_validation_rejects_missing_notes_outcome_and_reserved_events(self):
        before=self.counts()
        for change in (dict(kind='SYSTEM'),dict(kind='STAGE'),dict(kind='VOID'),dict(kind='UNKNOWN'),
                       dict(outcome=''),dict(outcome='UNKNOWN'),dict(outcome=None),dict(outcome={}),
                       dict(kind='NOTE',outcome='REACHED'),dict(kind='NOTE',outcome='',note='  '),
                       dict(kind='MEETING',outcome='',note='ab'),dict(note='x'*2001),dict(note={})):
            with self.f.f.rejected(frappe.ValidationError):self.call(**change)
        self.assertEqual(before,self.counts())

    def test_exact_record_replay_is_once_and_payload_conflict_is_rejected(self):
        args=self.args();first=self.call(args=args);before=self.counts()
        self.assertEqual(first,self.call(args=args));self.assertEqual(before,self.counts())
        with self.f.f.rejected(frappe.ValidationError):self.call(args=dict(args,note='Different note'))
        self.assertEqual(before,self.counts())

    def test_void_retains_original_and_reason_in_separate_entry(self):
        first=self.call();original=frappe.get_doc(activities.DT,first['activity']).as_dict()
        args=self.void_args(first['activity']);result=self.call('void',args=args)
        self.assertEqual(original,frappe.get_doc(activities.DT,first['activity']).as_dict())
        self.assertEqual(result,self.call('void',args=args))
        self.assertEqual(frappe.db.count(activities.DT,{'voids':first['activity']}),1)
        row=self.history()['rows'][0]
        self.assertEqual(row['void_reason'],args['reason']);self.assertEqual(row['note'],original['note'])
        self.assertFalse(row['can_void']);self.assertEqual(self.history()['total'],1)
        with self.f.f.rejected(frappe.ValidationError):self.call('void',args=self.void_args(first['activity']))

    def test_reason_required_and_reserved_system_entries_cannot_be_voided(self):
        first=self.call();before=self.counts()
        for reason in ('','ab','x'*1001):
            with self.f.f.rejected(frappe.ValidationError):self.call('void',args=self.void_args(first['activity'],reason=reason))
        self.assertEqual(before,self.counts())
        for kind in ('SYSTEM','STAGE'):
            # Trusted-server fixture, not an exposed creation endpoint.
            event=activities.append(frappe.get_doc('Job Applicant',self.name),self.f.f.load(self.f.request),kind,'','Synthetic system event')
            with self.f.f.rejected(frappe.PermissionError):self.call('void','hr',args=self.void_args(event.name))

    def test_author_or_configured_hr_only(self):
        first=self.call(role='hr')
        self.assertFalse(self.history()['rows'][0]['can_void'])
        with self.f.f.rejected(frappe.PermissionError):self.call('void',args=self.void_args(first['activity']))
        second=self.call()
        self.assertTrue(self.call('void','hr',args=self.void_args(second['activity']))['voided'])

    def test_native_access_create_update_delete_and_rename_cannot_bypass(self):
        first=self.call();doc=frappe.get_doc(activities.DT,first['activity']);original=doc.as_dict()
        with acting_as(self.f.f.users['manager']),self.f.f.rejected(frappe.PermissionError):client_get(activities.DT,doc.name)
        with self.f.f.rejected(frappe.PermissionError):
            new=frappe.copy_doc(doc);new.insert(ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):
            doc.note='Forged';doc.save(ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):frappe.delete_doc(activities.DT,doc.name,ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):frappe.rename_doc(activities.DT,doc.name,'Forged activity',force=True)
        self.assertEqual(original,frappe.get_doc(activities.DT,doc.name).as_dict())

    def test_notes_and_void_reasons_do_not_leak_into_general_request_audit(self):
        secret='PRIVATE_ACTIVITY_BODY_'+uuid.uuid4().hex
        first=self.call(note=secret);reason='PRIVATE_VOID_REASON_'+uuid.uuid4().hex
        self.call('void',args=self.void_args(first['activity'],reason=reason))
        audits=frappe.get_all('Kandil Command Audit',filters={'target_name':self.f.request,'operation':['in',['candidate_activity_record','candidate_activity_void']]},fields=['*'])
        self.assertEqual(len(audits),2);raw=frappe.as_json(audits)
        self.assertNotIn(secret,raw);self.assertNotIn(reason,raw)
        self.assertIn(first['activity'],raw);self.assertIn(activities.digest(secret),raw)

    def test_audit_failure_rolls_back_record_and_void(self):
        first=self.call()
        for method,args in [('record',self.args()),('void',self.void_args(first['activity']))]:
            before=self.counts()
            with patch('kandil_hr.foundation.command_audit.record_command',side_effect=RuntimeError('Synthetic audit failure')):
                with self.f.f.rejected(RuntimeError):self.call(method,args=args)
            self.assertEqual(before,self.counts())
        self.assertTrue(self.history()['rows'][0]['can_void'])

    def test_stale_or_malformed_application_and_request_versions_leave_no_effect(self):
        before=self.counts()
        for value in ('2000-01-01','not-a-date'):
            with self.f.f.rejected(frappe.TimestampMismatchError):self.call(application_version=value)
        with self.f.f.rejected(frappe.TimestampMismatchError):self.call(expected_version='2000-01-01')
        self.assertEqual(before,self.counts())

    def test_shared_person_history_filters_each_current_application_before_counting(self):
        first=self.call();opening=self.f.second_opening()
        second=self.f.create(opening_name=opening,person=self.created['person'],person_version=self.created['person_version'],identity_reason='Synthetic shared history')
        app=frappe.get_doc('Job Applicant',second['application'])
        self.call(application=app.name,application_version=str(app.modified),opening_name=opening,note='Other application discussion')
        one=self.history(page_length=1);two=self.history(start=1,page_length=1)
        self.assertEqual(one['total'],2);self.assertTrue(one['has_more']);self.assertFalse(two['has_more'])
        self.assertEqual(len({one['rows'][0]['name'],two['rows'][0]['name']}),2)
        other=next(r for r in self.history()['rows'] if r['other_application']);self.assertFalse(other['can_void'])
        self.f.f.call('hr',vacancies.assign_team,self.f.request,opening_name=opening,lead=self.f.f.users['hr'],members=[],reason='Restrict second application history')
        data=self.history();self.assertEqual(data['total'],1);self.assertEqual(data['rows'][0]['name'],first['activity'])
        self.assertNotIn('Other application discussion',json.dumps(data))

    def test_actual_native_user_permission_filters_person_history(self):
        self.call();second=self.f.create(person=self.created['person'],person_version=self.created['person_version'],identity_reason='Synthetic another application')
        app=frappe.get_doc('Job Applicant',second['application']);self.call(application=app.name,application_version=str(app.modified))
        frappe.get_doc(dict(doctype='User Permission',user=self.f.f.users['manager'],allow='Job Applicant',for_value=self.name,apply_to_all_doctypes=1)).insert(ignore_permissions=True)
        frappe.clear_cache(user=self.f.f.users['manager'])
        self.assertEqual(self.history()['total'],1)

    def test_cross_application_activity_cannot_be_voided(self):
        first=self.call();second=self.f.create();app=frappe.get_doc('Job Applicant',second['application'])
        with self.f.f.rejected(frappe.PermissionError):
            self.call('void',args=self.void_args(first['activity'],application=app.name,application_version=str(app.modified)))
        self.assertTrue(self.history()['rows'][0]['can_void'])

    def test_replay_and_reads_recheck_revoked_team_and_readonly_grants(self):
        args=self.args();self.call(args=args)
        frappe.db.set_value('Kandil Access Grant',self.f.f.grants['manager'],'can_manage_recruitment',0)
        self.assertFalse(self.history()['can_record'])
        with self.f.f.rejected(frappe.PermissionError):self.call(args=args)
        frappe.db.set_value('Kandil Access Grant',self.f.f.grants['manager'],'can_manage_recruitment',1)
        self.f.f.call('hr',vacancies.assign_team,self.f.request,opening_name=self.f.opening,lead=self.f.f.users['hr'],members=[],reason='Revoke activity access')
        with self.f.f.rejected(frappe.PermissionError):self.call(args=args)
        with self.f.f.rejected(frappe.PermissionError):self.history()

    def test_recovery_keeps_private_payload_and_exactly_once_effect(self):
        args=self.args()
        with acting_as(self.f.f.users['manager']):
            saved=recovery.prepare('activity',args)
            self.assertNotIn(args['note'],frappe.as_json(recovery.pending()))
            self.assertNotIn(args['note'],frappe.db.get_value(recovery.DT,saved['name'],'payload_cipher'))
            first=recovery.execute(saved['name']);self.assertEqual(first,recovery.execute(saved['name']))
            self.assertEqual(recovery.inspect(saved['name'])['arguments'],args)
            self.assertTrue(recovery.acknowledge(saved['name'])['acknowledged'])
        with acting_as(self.f.f.users['hr']),self.f.f.rejected(frappe.PermissionError):recovery.inspect(saved['name'])
        args=self.void_args(first['result']['activity'])
        with acting_as(self.f.f.users['manager']):
            saved=recovery.prepare('activity_void',args);result=recovery.execute(saved['name'])
            self.assertTrue(result['result']['voided']);self.assertEqual(result,recovery.execute(saved['name']))

    def test_recovery_scope_revocation_denies_inspect_execute_acknowledge(self):
        with acting_as(self.f.f.users['manager']):
            saved=recovery.prepare('activity',self.args());recovery.execute(saved['name'])
        self.f.f.call('hr',vacancies.assign_team,self.f.request,opening_name=self.f.opening,lead=self.f.f.users['hr'],members=[],reason='Revoke recovery access')
        for method in ('inspect','execute','acknowledge'):
            with acting_as(self.f.f.users['manager']),self.f.f.rejected(frappe.PermissionError):getattr(recovery,method)(saved['name'])

    def followup(self, **changes):
        return dict(mode='set',task='PRIVATE_FOLLOWUP_CALL',due='2027-01-05',owner=self.f.f.users['hr'],**changes)

    def application_state(self):
        app=frappe.get_doc('Job Applicant',self.name)
        return {k:app.get(k) for k in ('status','modified','custom_kandil_responsible_user','custom_kandil_next_action',
            'custom_kandil_next_action_due','custom_kandil_next_action_owner','custom_kandil_ownership_history')}

    def test_compound_contact_followup_stage_and_receipt_are_one_action(self):
        before=self.application_state();args=self.args(move_to_contacted=True,next_action=self.followup())
        result=self.call(args=args);after=self.application_state();stage=frappe.get_doc(activities.DT,result['stage_activity'])
        self.assertEqual(after['status'],'Replied');self.assertEqual(after['custom_kandil_next_action'],'PRIVATE_FOLLOWUP_CALL')
        self.assertEqual(after['custom_kandil_next_action_owner'],self.f.f.users['hr'])
        self.assertEqual(after['custom_kandil_responsible_user'],before['custom_kandil_responsible_user'])
        self.assertEqual(str(after['modified']),result['application_version']);self.assertTrue(result['moved'] and result['followup_applied'])
        self.assertEqual((stage.stage_from,stage.stage_to,stage.source_activity),('Open','Replied',result['activity']))
        keys=('application','person','company','actor','recorded_at','kind','outcome','note','voids','stage_from','stage_to','source_activity')
        self.assertEqual(stage.content_hash,activities.digest({k:stage.get(k) for k in keys}))
        counts=self.counts();self.assertEqual(result,self.call(args=args));self.assertEqual(counts,self.counts())
        self.assertEqual(after,self.application_state())
        audits=frappe.get_all('Kandil Command Audit',filters={'target_name':self.f.request,'operation':'candidate_activity_record'},fields=['*'])
        raw=frappe.as_json(audits);self.assertNotIn('PRIVATE_FOLLOWUP_CALL',raw);self.assertNotIn(args['note'],raw)
        self.assertIn(stage.name,raw);self.assertFalse(next(r for r in self.history()['rows'] if r['kind']=='STAGE')['can_void'])

    def test_failed_contact_and_notes_do_not_advance_stage(self):
        for outcome in ('NO_ANSWER','BUSY','WRONG_NUMBER'):
            result=self.call(move_to_contacted=True,outcome=outcome);self.assertFalse(result['moved']);self.assertIsNone(result['stage_activity'])
        self.assertFalse(self.call(kind='NOTE',outcome='',move_to_contacted=True)['moved'])
        self.assertEqual(self.application_state()['status'],'Open')
        self.assertTrue(self.call(move_to_contacted=True,outcome='CALL_BACK')['moved'])

    def test_contact_does_not_overwrite_a_later_stage_or_existing_followup(self):
        self.call(next_action=self.followup());before=self.application_state()
        # Existing HRMS selection state, prepared by trusted fixture only.
        frappe.db.set_value('Job Applicant',self.name,'status','Accepted')
        result=self.call(move_to_contacted=True,kind='EMAIL',outcome='')
        after=self.application_state();self.assertFalse(result['moved']);self.assertEqual(after['status'],'Accepted')
        for field in ('custom_kandil_next_action','custom_kandil_next_action_due','custom_kandil_next_action_owner','custom_kandil_ownership_history'):
            self.assertEqual(before[field],after[field])

    def test_clear_followup_preserves_owner_and_void_does_not_undo_changes(self):
        first=self.call(move_to_contacted=True,next_action=self.followup());before=self.application_state()
        self.call('void',args=self.void_args(first['activity']));self.assertEqual(before,self.application_state())
        clear=self.call(next_action=dict(mode='clear'));after=self.application_state()
        self.assertTrue(clear['followup_applied']);self.assertEqual(after['status'],'Replied')
        self.assertFalse(after['custom_kandil_next_action'] or after['custom_kandil_next_action_due'] or after['custom_kandil_next_action_owner'])
        self.assertEqual(before['custom_kandil_responsible_user'],after['custom_kandil_responsible_user'])

    def test_invalid_compound_input_has_no_partial_effect(self):
        invalid=[dict(move_to_contacted='true'),dict(next_action=[]),dict(next_action={'mode':'keep'}),
            dict(next_action={'mode':'clear','task':'hidden'}),dict(next_action={'mode':'set'}),
            *[dict(next_action=dict(self.followup(),due=d)) for d in ('','2027-02-30','2027-2-1',None)],
            dict(next_action=dict(self.followup(),task='  ')),dict(next_action=dict(self.followup(),task='x'*1001))]
        before=self.application_state();counts=self.counts()
        for kwargs in invalid:
            with self.assertRaises(frappe.ValidationError):self.call(**kwargs)
        self.assertEqual(before,self.application_state());self.assertEqual(counts,self.counts())
        with self.assertRaises(frappe.PermissionError):self.call(move_to_contacted=True,next_action=dict(self.followup(),owner=self.f.f.users['requester']))
        self.assertEqual(before,self.application_state());self.assertEqual(counts,self.counts())

    def test_activity_permission_does_not_grant_followup_ownership(self):
        from kandil_hr.recruitment import ownership
        app=frappe.get_doc('Job Applicant',self.name)
        with acting_as(self.f.f.users['manager']):
            ownership.assign_application(name=self.name,owner=self.f.f.users['hr'],reason='Synthetic handoff',command_id=uuid.uuid4().hex,
                expected_version=str(self.f.f.load(self.f.request).modified),application_version=str(app.modified))
        self.assertTrue(self.history()['can_record']);self.assertFalse(self.history()['can_followup'])
        before=self.application_state();counts=self.counts()
        for change in (self.followup(),dict(mode='clear')):
            with self.assertRaises(frappe.PermissionError):self.call(move_to_contacted=True,next_action=change)
        self.assertEqual(before,self.application_state());self.assertEqual(counts,self.counts())
        self.assertTrue(self.call(move_to_contacted=True)['moved'])

    def test_compound_audit_or_stage_failure_rolls_back_without_test_savepoint(self):
        before=self.application_state();counts=self.counts();original=activities.append
        def fail_stage(*args,**kwargs):
            if args[2]=='STAGE':raise RuntimeError('Synthetic stage failure')
            return original(*args,**kwargs)
        for target,effect in [('kandil_hr.foundation.command_audit.record_command',RuntimeError('Synthetic audit failure')),
                              ('kandil_hr.candidates.activities.append',fail_stage)]:
            with patch(target,side_effect=effect),self.assertRaises(RuntimeError):
                self.call(move_to_contacted=True,next_action=self.followup())
            self.assertEqual(before,self.application_state());self.assertEqual(counts,self.counts())

    def test_closed_vacancy_denies_compound_but_allows_historical_note(self):
        frappe.db.set_value('Job Opening',self.f.opening,'custom_kandil_vacancy_state','Closed')
        before=self.application_state();counts=self.counts()
        with self.assertRaises(frappe.ValidationError):self.call(move_to_contacted=True,next_action=self.followup())
        self.assertEqual(before,self.application_state());self.assertEqual(counts,self.counts())
        self.call(kind='NOTE',outcome='')

    def test_compound_recovery_is_exact_and_stale_second_action_fails(self):
        args=self.args(move_to_contacted=True,next_action=self.followup());stale=dict(args,command_id=uuid.uuid4().hex)
        with acting_as(self.f.f.users['manager']):
            saved=recovery.prepare('activity',args);self.assertEqual(recovery.inspect(saved['name'])['arguments'],args)
            result=recovery.execute(saved['name']);before=self.application_state();counts=self.counts()
            self.assertEqual(result,recovery.execute(saved['name']))
        with self.assertRaises(frappe.TimestampMismatchError):self.call(args=stale)
        self.assertEqual(before,self.application_state());self.assertEqual(counts,self.counts())

    def test_disabled_feature_preserves_read_history_and_denies_new_effect(self):
        self.call()
        with patch.dict(frappe.conf,{'kandil_candidate_identity_enabled':0}):
            self.assertEqual(self.history()['total'],1);self.assertFalse(self.history()['can_record'])
            with self.f.f.rejected(frappe.PermissionError):self.call()


def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestCandidateActivities))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),
        successful=result.wasSuccessful() and not result.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
