"""Rollback-scoped profile corrections, receipts, native bypass and private history."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.client import get as client_get
from kandil_hr.candidates import corrections, identity
from kandil_hr.candidates.test_identity import TestCandidateIdentity
from kandil_hr.portal import candidates
from kandil_hr.recruitment.test_commands import acting_as


class TestCorrections(unittest.TestCase):
    def setUp(self):
        self.f=TestCandidateIdentity();self.addCleanup(self.f.doCleanups);self.f.setUp()
        self.created=self.f.create(profile={'city':'Cairo','experience_years':0})
        with acting_as(self.f.f.users['manager']):
            self.profile=candidates.person(self.created['person'])['profile']
        self.args=dict(name=self.f.request,opening_name=self.f.opening,application=self.created['application'],
            person=self.created['person'],person_version=self.created['person_version'],
            profile=dict(self.profile,city='Giza'),reason='Corrected city after candidate review',command_id=uuid.uuid4().hex,
            expected_version=str(self.f.f.load(self.f.request).modified))

    def correct(self,role='manager',**changes):
        with acting_as(self.f.f.users[role]):return corrections.correct(**dict(self.args,**changes))

    def history(self,role='manager',**changes):
        with acting_as(self.f.f.users[role]):return candidates.profile_history(self.created['application'],**changes)

    def test_reasoned_change_has_exact_history_and_preserves_application(self):
        before=frappe.get_doc('Job Applicant',self.created['application']).as_dict()
        result=self.correct(profile=dict(self.profile,city='Giza',email_id='corrected@example.invalid',experience_years=1))
        current=frappe.get_doc(identity.DT,self.created['person'])
        self.assertNotEqual(result['person_version'],self.created['person_version'])
        self.assertEqual(json.loads(current.profile_json)['email_id'],'corrected@example.invalid')
        self.assertEqual(frappe.get_doc('Job Applicant',self.created['application']).as_dict(),before)
        h=self.history();self.assertEqual(h['total'],1)
        changes={x['field']:x for x in h['rows'][0]['changes']}
        self.assertEqual(changes['experience_years'],dict(field='experience_years',before=0,after=1))
        self.assertEqual(set(changes),{'email_id','city','experience_years'})
        self.assertNotIn('application',h['rows'][0]);self.assertNotIn('before_json',h['rows'][0])

    def test_replay_exactly_once_and_changed_payload_denied(self):
        first=self.correct();count=frappe.db.count(corrections.REVISION)
        self.assertEqual(self.correct(),first);self.assertEqual(frappe.db.count(corrections.REVISION),count)
        with self.f.f.rejected():self.correct(reason='Changed reason with same command')
        self.assertEqual(frappe.db.count(corrections.REVISION),count)

    def test_stale_noop_and_invalid_data_have_no_effect(self):
        count=frappe.db.count(corrections.REVISION);before=frappe.get_doc(identity.DT,self.created['person']).profile_json
        for changes in ({'person_version':'2000-01-01'},{'profile':self.profile},{'reason':''},
                        {'profile':dict(self.profile,salary=5000)},{'profile':dict(self.profile,full_name='')},
                        {'profile':' '*8001},{'profile':dict(self.profile,email_id='',phone_number='bad')}):
            with self.f.f.rejected():self.correct(**changes)
        self.assertEqual(frappe.db.count(corrections.REVISION),count)
        self.assertEqual(frappe.get_doc(identity.DT,self.created['person']).profile_json,before)

    def test_private_revision_native_reads_mutation_and_deletion_denied(self):
        result=self.correct()
        with acting_as(self.f.f.users['manager']),self.f.f.rejected(frappe.PermissionError):client_get(corrections.REVISION,result['revision'])
        with self.f.f.rejected(frappe.PermissionError):
            doc=frappe.get_doc(corrections.REVISION,result['revision']);doc.reason='overwrite';doc.save(ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):frappe.delete_doc(corrections.REVISION,result['revision'],ignore_permissions=True)
        with self.f.f.rejected(frappe.PermissionError):
            doc=frappe.get_doc(identity.DT,self.created['person']);doc.profile_json='{}';doc.save(ignore_permissions=True)

    def test_revoked_access_denies_replay_and_history(self):
        self.correct()
        frappe.db.set_value('Kandil Access Grant',self.f.f.grants['manager'],'revoked',1)
        with self.f.f.rejected(frappe.PermissionError):self.correct()
        with self.f.f.rejected(frappe.PermissionError):self.history()
        with self.f.f.rejected(frappe.PermissionError):self.correct(role='requester')

    def test_history_omits_revisions_from_other_unreadable_application(self):
        self.correct();opening=self.f.second_opening()
        person=frappe.get_doc(identity.DT,self.created['person'])
        other=self.f.create(opening_name=opening,person=person.name,person_version=str(person.modified),identity_reason='Reviewed second application')
        from kandil_hr.recruitment import vacancies
        args=dict(self.args,opening_name=opening,application=other['application'],person_version=str(person.modified),
            profile=dict(self.profile,city='Alexandria'),command_id=uuid.uuid4().hex,expected_version=str(self.f.f.load(self.f.request).modified))
        with acting_as(self.f.f.users['manager']):corrections.correct(**args)
        self.assertEqual(self.history()['total'],2)
        self.f.f.call('hr',vacancies.assign_team,self.f.request,opening_name=opening,lead=self.f.f.users['hr'],members=[],reason='Restricted second application')
        self.assertEqual(self.history()['total'],1)
        self.assertEqual(self.history()['rows'][0]['changes'][0]['after'],'Giza')

    def test_disabled_mode_keeps_history_read_only(self):
        self.correct()
        with patch.dict(frappe.conf, {'kandil_candidate_identity_enabled':0}):
            with self.f.f.rejected(frappe.PermissionError):self.correct()
            self.assertEqual(self.history()['total'],1)
            with acting_as(self.f.f.users['manager']):
                self.assertFalse(candidates.detail(self.created['application'])['profile_edit']['allowed'])

    def test_audit_failure_rolls_back_profile_and_revision(self):
        before=frappe.get_doc(identity.DT,self.created['person']).as_dict()
        count=frappe.db.count(corrections.REVISION)
        with patch('kandil_hr.foundation.command_audit.record_command', side_effect=RuntimeError('Synthetic audit failure')):
            with self.f.f.rejected(RuntimeError):self.correct()
        self.assertEqual(frappe.get_doc(identity.DT,self.created['person']).as_dict(),before)
        self.assertEqual(frappe.db.count(corrections.REVISION),count)

    def test_history_pagination_and_request_person_mismatch(self):
        self.correct();person=frappe.get_doc(identity.DT,self.created['person'])
        self.correct(person_version=str(person.modified),profile=dict(self.profile,city='Alexandria'),command_id=uuid.uuid4().hex)
        a=self.history(page_length=1);b=self.history(start=1,page_length=1)
        self.assertEqual(a['total'],2);self.assertNotEqual(a['rows'][0]['name'],b['rows'][0]['name'])
        other=self.f.create()
        for target in (other['person'], 'KCP-unavailable-random-person'):
            with patch('frappe.get_doc', wraps=frappe.get_doc) as read:
                with self.f.f.rejected(frappe.PermissionError):self.correct(person=target,person_version=other['person_version'],command_id=uuid.uuid4().hex)
                self.assertFalse(any(c.args[:2] == (identity.DT,target) for c in read.call_args_list))


def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestCorrections))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),
                 successful=result.wasSuccessful() and not result.skipped,fixtures_rolled_back=True,
                 failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
