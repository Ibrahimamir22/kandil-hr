"""Lifecycle/pin review, direct commands, commitments and partial joining proof."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch
import frappe
from frappe.utils import today, add_days
from kandil_hr.portal.vacancy_operations import context
from kandil_hr.recruitment import vacancies
from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as
from kandil_hr.recruitment.test_joining import TestJoining


class TestVacancyOperations(unittest.TestCase):
    def setUp(self):
        self.f=TestRecruitmentCommands();self.addCleanup(self.f.doCleanups);self.f.setUp()
        self.name,self.opening,_=self.f.vacancy_fixture()
        self.other=self.f.load(self.name).lines[1].job_opening

    def read(self,role='hr',opening=None):
        with acting_as(self.f.users[role]):return context(self.name,opening or self.opening)

    def act(self,action,**args):
        return self.f.call('hr',vacancies.set_state,self.name,opening_name=self.opening,
            action=action,reason=args.pop('reason','Synthetic reviewed lifecycle action'),**args)

    def pin(self,date=None,**args):
        return self.f.call('hr',vacancies.pin,self.name,opening_name=self.opening,
            pin_until=date,reason=args.pop('reason','Synthetic priority review'),**args)

    def start(self):
        self.f.call('hr',vacancies.assign_team,self.name,opening_name=self.opening,
            lead=self.f.users['hr'],members=[],reason='Synthetic lifecycle lead')
        self.act('Open')

    def candidate(self):
        self.start()
        with acting_as(self.f.users['hr']):
            return frappe.get_doc(dict(doctype='Job Applicant',applicant_name=self.f.prefix+' private candidate',
                job_title=self.opening,phone_number='01012345678')).insert()

    def test_review_is_read_only_and_explains_exact_effects(self):
        before=self.f.counts(self.name);r=self.read();actions={a['action']:a for a in r['actions']}
        self.assertEqual((r['approved'],r['remaining'],r['joined'],r['closed']),(2,2,0,0))
        self.assertFalse(actions['Open']['allowed']);self.assertEqual(actions['Open']['blocked_by'],'lead_required')
        self.assertEqual((actions['Close']['releases'],actions['Close']['closes_parent']),(2,False))
        self.assertTrue(r['can_pin']);self.assertEqual(before,self.f.counts(self.name))

    def test_pause_freeze_restore_matches_shared_targets_and_preserves_capacity(self):
        self.start()
        for action,target in [('Hold','On Hold'),('Freeze','Frozen'),('Unfreeze','On Hold'),('Resume','Open')]:
            r=self.read();self.assertEqual(next(x for x in r['actions'] if x['action']==action)['target'],target)
            self.act(action);self.assertEqual(self.read()['state'],target)
            self.f.ledger((0,0),(2,1))
        self.assertEqual(frappe.db.get_value('Job Opening',self.opening,'status'),'Open')

    def test_close_then_cancel_last_location_closes_parent_and_replays(self):
        self.act('Close');self.f.ledger((0,0),(0,1));r=self.read(opening=self.other)
        self.assertTrue(next(x for x in r['actions'] if x['action']=='Cancel')['closes_parent'])
        args=dict(opening_name=self.other,action='Cancel',reason='Cancel final location',
            expected_version=r['expected_version'],command_id=uuid.uuid4().hex)
        first=self.f.call('hr',vacancies.set_state,self.name,**args);before=self.f.counts(self.name)
        second=self.f.call('hr',vacancies.set_state,self.name,**args)
        self.assertEqual(json.loads(json.dumps(first,default=str)),json.loads(json.dumps(second,default=str)))
        self.assertEqual(before,self.f.counts(self.name));self.f.ledger((0,0),(0,0))
        self.assertEqual(self.f.load(self.name).status,'Closed');r=self.read(opening=self.other)
        self.assertEqual(r['actions'],[]);self.assertFalse(r['can_pin'])

    def test_unresolved_candidates_block_closure_without_disclosing_identity(self):
        candidate=self.candidate();before=self.f.counts(self.name);r=self.read()
        self.assertTrue(r['unresolved_candidates']);self.assertNotIn(candidate.name,json.dumps(r));self.assertNotIn(candidate.applicant_name,json.dumps(r))
        self.assertTrue(all(not a['allowed'] for a in r['actions'] if a['action'] in ('Close','Cancel')))
        with self.f.rejected():self.act('Close')
        self.assertEqual(before,self.f.counts(self.name));self.f.ledger((0,0),(2,1))
        with acting_as(self.f.users['hr']):candidate.status='Rejected';candidate.save()
        self.assertFalse(self.read()['unresolved_candidates']);self.act('Close');self.f.ledger((0,0),(0,1))

    def test_pending_offer_remains_a_closure_commitment(self):
        candidate=self.candidate()
        with acting_as(self.f.users['hr']):
            offer=frappe.get_doc(dict(doctype='Job Offer',job_applicant=candidate.name,offer_date=today(),
                designation=self.f.designation,company=self.f.company,status='Accepted')).insert();offer.submit()
        self.assertTrue(self.read()['unresolved_candidates'])
        with self.f.rejected():self.act('Cancel')
        self.f.ledger((0,0),(2,1))

    def test_native_restriction_wrong_request_and_requester_denied(self):
        with self.f.rejected(frappe.PermissionError):self.read('requester')
        other,opening,_=self.f.vacancy_fixture()
        with self.f.rejected(frappe.PermissionError),acting_as(self.f.users['hr']):context(other,self.opening)
        self.f.insert('User Permission',user=self.f.users['hr'],allow='Job Opening',for_value=opening,
            apply_to_all_doctypes=0,applicable_for='Job Opening');frappe.clear_cache(user=self.f.users['hr'])
        with self.f.rejected(frappe.PermissionError):self.read()
        with self.f.rejected(frappe.PermissionError):self.pin(today())
        with self.f.rejected(frappe.PermissionError):self.act('Hold')

    def test_read_only_and_revoked_grants_block_reads_commands_and_replays(self):
        args=dict(command_id=uuid.uuid4().hex,expected_version=str(self.f.load(self.name).modified))
        self.pin(today(),**args)
        for changes in ({'can_manage_recruitment':0},{'can_manage_recruitment':1,'revoked':1}):
            frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],changes)
            with self.f.rejected(frappe.PermissionError):self.read()
            with self.f.rejected(frappe.PermissionError):self.act('Hold')
            with self.f.rejected(frappe.PermissionError):self.pin(today(),**args)

    def test_invalid_state_reason_and_date_do_not_write(self):
        before=self.f.counts(self.name)
        for action in ('Resume','Unfreeze','Unknown',{},None):
            with self.f.rejected():self.act(action)
        for reason in ('', '  ', None, {}, 'x'*2001):
            with self.f.rejected():self.act('Hold',reason=reason)
            with self.f.rejected():self.pin(today(),reason=reason)
        for date in ('not-a-date','2027-02-30','20270101',[],False,add_days(today(),-1)):
            with self.f.rejected():self.pin(date)
        self.assertEqual(before,self.f.counts(self.name))

    def test_terminal_location_cannot_be_reopened_or_pinned(self):
        self.act('Close');r=self.read();self.assertEqual(r['actions'],[]);self.assertFalse(r['can_pin'])
        before=self.f.counts(self.name)
        for action in ('Open','Hold','Resume','Freeze','Unfreeze','Cancel'):
            with self.f.rejected():self.act(action)
        with self.f.rejected():self.pin(today())
        self.assertEqual(before,self.f.counts(self.name))

    def test_pin_today_expiry_remove_and_paused_priority(self):
        day='2030-01-10'
        with patch('kandil_hr.recruitment.vacancies.today',return_value=day),patch('kandil_hr.portal.vacancy_operations.today_cairo',return_value=day):
            self.pin(day);r=self.read();self.assertEqual(r['pin_until'],day)
            self.assertIn({'reason':'temporary pin','points':100},r['priority']['parts'])
            self.act('Hold');self.assertEqual(self.read()['priority']['score'],0)
            self.act('Resume');self.assertGreater(self.read()['priority']['score'],100)
        with patch('kandil_hr.portal.vacancy_operations.today_cairo',return_value='2030-01-11'):
            before=self.f.counts(self.name);self.assertNotIn('temporary pin',[p['reason'] for p in self.read()['priority']['parts']]);self.assertEqual(before,self.f.counts(self.name))
        self.pin('');self.assertIsNone(self.read()['pin_until']);self.f.ledger((0,0),(2,1))

    def test_pin_stale_version_replay_and_changed_payload(self):
        args=dict(command_id=uuid.uuid4().hex,expected_version=str(self.f.load(self.name).modified))
        self.pin(today(),**args);before=self.f.counts(self.name);self.pin(today(),**args)
        self.assertEqual(before,self.f.counts(self.name))
        with self.f.rejected():self.pin(add_days(today(),1),**args)
        with self.f.rejected(frappe.TimestampMismatchError):self.act('Hold',expected_version=args['expected_version'])
        self.assertEqual(before,self.f.counts(self.name))

    def test_invalid_restore_state_cannot_be_used_to_reopen_closed_data(self):
        self.act('Hold');frappe.db.set_value('Job Opening',self.opening,'custom_kandil_before_pause','Closed')
        self.assertNotIn('Resume',[a['action'] for a in self.read()['actions']])
        with self.f.rejected():self.act('Resume')
        self.f.ledger((0,0),(2,1))


class TestPartialClosure(unittest.TestCase):
    def setUp(self):
        self.j=TestJoining();self.addCleanup(self.j.doCleanups);self.j.setUp()

    def test_real_joined_employee_survives_remaining_seat_closure(self):
        j=self.j;offer=j.offer();result=j.outcome(offer)
        with acting_as(j.f.users['hr']):r=context(j.name,j.opening)
        self.assertEqual((r['state'],r['joined'],r['remaining']),('Partially Filled',1,1))
        self.assertFalse(r['unresolved_candidates'])
        j.f.call('hr',vacancies.set_state,j.name,opening_name=j.opening,action='Close',reason='Keep joiner, close remaining seat')
        j.f.ledger((0,0),(0,1),(1,0))
        self.assertTrue(frappe.db.exists('Employee',result['employee']))
        self.assertTrue(frappe.db.exists('Kandil Position Assignment',result['assignment']))
        with acting_as(j.f.users['hr']):r=context(j.name,j.opening)
        self.assertEqual((r['joined'],r['closed'],r['remaining']),(1,1,0))


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    suite=unittest.TestSuite(unittest.defaultTestLoader.loadTestsFromTestCase(c) for c in (TestVacancyOperations,TestPartialClosure))
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(suite)
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
        limits=['Rollback-scoped lifecycle/pin and real synthetic joining tests; browser/concurrency/load proof is separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Vacancy lifecycle regression failed')
    return value
