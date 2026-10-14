"""Ordinary-role candidate ownership/follow-up, replay and privacy contracts."""
import json
import sys
import unittest
import uuid

import frappe

from kandil_hr.candidates import recovery, work
from kandil_hr.candidates.test_identity import TestCandidateIdentity
from kandil_hr.recruitment import ownership, vacancies
from kandil_hr.recruitment.test_commands import acting_as


class TestCandidateWork(unittest.TestCase):
    def setUp(self):
        self.f = TestCandidateIdentity()
        self.addCleanup(self.f.doCleanups)
        self.f.setUp()
        self.created = self.f.create()
        self.name = self.created['application']

    def context(self, role='manager', **kwargs):
        with acting_as(self.f.f.users[role]):
            return work.context(self.name, **kwargs)

    def arguments(self, **kwargs):
        app = frappe.get_doc('Job Applicant', self.name)
        args = dict(name=self.f.request, opening_name=self.f.opening, application=self.name,
                    application_version=str(app.modified), expected_version=str(self.f.f.load(self.f.request).modified),
                    command_id=uuid.uuid4().hex, owner=self.f.f.users['hr'], reason='Reviewed work change')
        args.update(kwargs)
        return args

    def call(self, method, role='manager', **kwargs):
        with acting_as(self.f.f.users[role]):
            return getattr(recovery, method)(**kwargs)

    def change(self, operation='owner', role='manager', **kwargs):
        prepared = self.call('prepare', role, operation=operation, arguments=self.arguments(**kwargs))
        result = self.call('execute', role, name=prepared['name'])
        return prepared, result

    def test_context_exposes_scoped_choices_and_bounded_history_only(self):
        data = self.context()
        self.assertTrue(data['can_manage'])
        self.assertEqual({r['user'] for r in data['owners']}, {self.f.f.users[k] for k in ('hr','manager')})
        self.assertEqual(data['history']['total'], 1)
        history = json.dumps(data['history'])
        for raw in ('custom_kandil_', '@example.invalid', 'invocation', self.f.data['phone_number']):
            self.assertNotIn(raw, history)
        with self.f.f.rejected(frappe.PermissionError):
            self.context('requester')

    def test_handoff_replays_after_actor_stops_being_owner_and_can_acknowledge(self):
        prepared, result = self.change()
        self.assertEqual(result['result']['owner'], self.f.f.users['hr'])
        self.assertEqual(result, self.call('execute', name=prepared['name']))
        self.assertFalse(self.context()['can_manage'])
        self.assertEqual(self.context()['history']['total'], 2)
        self.assertTrue(self.call('acknowledge', name=prepared['name'])['acknowledged'])
        with self.f.f.rejected(frappe.PermissionError):
            self.change(owner=self.f.f.users['manager'])

    def test_replay_and_prepared_payload_fail_after_team_revocation(self):
        prepared, _ = self.change()
        self.f.f.call('hr', vacancies.assign_team, self.f.request, opening_name=self.f.opening,
                      lead=self.f.f.users['hr'], members=[], reason='Remove former owner access')
        for method in ('inspect','execute','acknowledge'):
            with self.f.f.rejected(frappe.PermissionError):
                self.call(method, name=prepared['name'])
        with self.f.f.rejected(frappe.PermissionError):
            self.context()

    def test_direct_native_receipt_replay_rechecks_team_access(self):
        args = self.arguments()
        native = dict(name=args['application'], **{k: args[k] for k in
                      ('owner','reason','command_id','expected_version','application_version')})
        with acting_as(self.f.f.users['manager']):
            ownership.assign_application(**native)
        self.f.f.call('hr', vacancies.assign_team, self.f.request, opening_name=self.f.opening,
                      lead=self.f.f.users['hr'], members=[], reason='Revoke native replay access')
        with acting_as(self.f.f.users['manager']), self.f.f.rejected(frappe.PermissionError):
            ownership.assign_application(**native)

    def test_followup_owner_and_application_owner_are_independent(self):
        _, result = self.change('followup', task='Call after shift / اتصال بعد الوردية', due='2027-01-05')
        self.assertEqual(result['result']['owner'], self.f.f.users['manager'])
        self.assertEqual(result['result']['next_action_owner'], self.f.f.users['hr'])
        data = self.context()
        self.assertEqual(str(data['due']), '2027-01-05')
        self.assertEqual(data['history']['total'], 2)
        self.change()
        self.assertEqual(self.context('hr')['next_owner'], self.f.f.users['hr'])

    def test_clear_removes_next_action_but_preserves_reasoned_history_and_owner(self):
        self.change('followup', task='Call candidate', due='2027-01-05')
        self.change('followup', task='', due=None, owner='', reason='No further call required')
        data = self.context()
        self.assertEqual(data['owner'], self.f.f.users['manager'])
        self.assertFalse(data['task'] or data['due'] or data['next_owner'])
        self.assertEqual(data['history']['rows'][0]['before']['task'], 'Call candidate')
        self.assertEqual(data['history']['rows'][0]['reason'], 'No further call required')

    def test_followup_requires_real_date_and_current_team_owner(self):
        for due in ('',None,'2027-02-30','2027-2-1','not-a-date'):
            with self.f.f.rejected():
                self.change('followup', task='Call candidate', due=due)
        with self.f.f.rejected(frappe.PermissionError):
            self.change('followup', task='Call candidate', due='2027-01-01', owner=self.f.f.users['requester'])
        self.assertEqual(self.context()['history']['total'], 1)

    def test_changed_application_version_cannot_overwrite_followup(self):
        saved = self.call('prepare', operation='followup', arguments=self.arguments(task='Stale call', due='2027-01-01'))
        self.change('followup', task='Current call', due='2027-01-02')
        with self.f.f.rejected(frappe.TimestampMismatchError):
            self.call('execute', name=saved['name'])
        self.assertEqual(self.context()['task'], 'Current call')

    def test_cross_opening_reference_is_denied_before_envelope_creation(self):
        other = self.f.second_opening()
        before = frappe.db.count(recovery.DT)
        with self.f.f.rejected(frappe.PermissionError):
            self.call('prepare', operation='owner', arguments=self.arguments(opening_name=other))
        self.assertEqual(frappe.db.count(recovery.DT), before)

    def test_historical_pagination_has_no_duplicate_entries(self):
        for i in range(3):
            self.change('followup', task=f'Call {i}', due='2027-01-01')
        one = self.context(page_length=2)['history']; two = self.context(start=2,page_length=2)['history']
        self.assertTrue(one['has_more']); self.assertFalse(two['has_more'])
        self.assertEqual(one['total'], 4)
        self.assertEqual(len({r['at'] for r in one['rows'] + two['rows']}), 4)

    def test_terminal_application_disables_actions_and_blocks_new_effect(self):
        with acting_as(self.f.f.users['hr']):
            frappe.db.set_value('Job Applicant',self.name,'status','Rejected')  # Trusted fixture of a historical closed application.
        self.assertFalse(self.context()['can_manage'])
        with self.f.f.rejected():
            self.change()

    def test_other_actors_cannot_inspect_saved_internal_followup(self):
        prepared=self.call('prepare',operation='followup',arguments=self.arguments(task='Internal followup',due='2027-01-01'))
        with self.f.f.rejected(frappe.PermissionError):
            self.call('inspect','hr',name=prepared['name'])
        self.assertNotIn('Internal followup',json.dumps(self.call('pending')))


def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestCandidateWork))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),
                 skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,
                 fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
