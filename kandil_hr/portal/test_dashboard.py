"""Dashboard and approval query parity before pagination, under ordinary roles."""
import json
import sys
import unittest
from unittest.mock import patch
import frappe
from frappe.utils import add_days, today
from kandil_hr.portal import dashboard
from kandil_hr.portal.test_api import TestPortalAPI
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.test_authority_audit import TestAuthorityAudit


class TestDashboard(unittest.TestCase):
    def setUp(self):
        self.base=TestPortalAPI();self.addCleanup(self.base.doCleanups);self.base.setUp();self.f=self.base.f

    def create(self,title='Dashboard request',**extra):
        return self.base.save(self.base.payload()|dict(title=self.f.prefix+' '+title)|extra)

    def summary(self,role='hr'):
        with acting_as(self.f.users[role]):return dashboard.summary()

    def approvals(self,role='manager',**args):
        with acting_as(self.f.users[role]):return dashboard.approvals(**args)

    def test_full_request_total_and_recent_bound_not_first_page(self):
        names={self.create(str(i))['name'] for i in range(53)}
        with patch('kandil_hr.portal.dashboard.read_request',wraps=dashboard.read_request) as read:
            result=self.summary();self.assertEqual(read.call_count,5)
        self.assertEqual(result['counts']['requests'],53);self.assertEqual(len(result['requests']),5)
        self.assertTrue({r['name'] for r in result['requests']}<=names)
        self.assertEqual(result['count_scope'],'all_permitted_records')

    def test_approval_filters_before_count_and_page(self):
        # Increase only this rollback-scoped synthetic position/capacity before submitting seven requests.
        frappe.db.set_value('Kandil Position',self.f.positions[0],'structural',50)
        frappe.db.set_value('Kandil Capacity',self.f.capacities[0],{'structural':50,'available':50})
        names=[]
        for i in range(7):
            r=self.create('Needle' if i==0 else str(i));self.f.submit(r['name']);names.append(r['name'])
        for i in range(3):self.create('Later draft '+str(i))
        with patch('kandil_hr.portal.dashboard.read_request',wraps=dashboard.read_request) as hydrated:
            self.assertEqual(self.summary('manager')['counts']['approvals'],7);self.assertLessEqual(hydrated.call_count,10)
        seen=[]
        for start in (0,3,6):
            r=self.approvals(start=start,page_length=3);self.assertEqual(r['total'],7);seen.extend(x['name'] for x in r['rows'])
        self.assertEqual(set(seen),set(names));self.assertEqual(len(seen),7)
        r=self.approvals(search='Needle',page_length=1);self.assertEqual(r['total'],1);self.assertEqual(r['rows'][0]['name'],names[0])
        self.assertEqual(self.approvals(search="' OR 1=1 --")['total'],0)
        self.assertEqual(self.approvals(start=100)['rows'],[])

    def test_next_authority_and_current_roles(self):
        r=self.create();self.f.submit(r['name']);self.assertEqual(self.approvals()['total'],1)
        self.assertEqual(self.approvals('hr')['total'],0)
        doc=self.f.load(r['name']);step=next(s for s in doc.approval_steps if s.decision=='Pending')
        self.f.decide(doc.name,'manager','Approve',step_id=step.step_key)
        self.assertEqual(self.approvals()['total'],0);self.assertEqual(self.approvals('hr')['total'],1)
        frappe.db.delete('Has Role',{'parent':self.f.users['hr'],'role':'Kandil Recruiter'});frappe.clear_cache(user=self.f.users['hr'])
        # Removing the account's only HR role denies portal access as well.
        with self.f.rejected(frappe.PermissionError):self.approvals('hr')

    def test_manage_revocation_removes_actions_without_hiding_readable_requests(self):
        r=self.create();self.f.submit(r['name']);self.assertEqual(self.approvals()['total'],1)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['manager'],'can_manage_recruitment',0)
        self.assertEqual(self.approvals()['total'],0);self.assertEqual(self.summary('manager')['counts']['requests'],1)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['manager'],'revoked',1)
        value=self.summary('manager');self.assertTrue(all(v==0 for v in value['counts'].values()));self.assertEqual(value['requests'],[])

    def test_current_and_frozen_interests_never_count_as_decisions(self):
        r=self.create();self.f.submit(r['name']);self.assertEqual(self.approvals()['total'],1)
        frappe.db.set_value('Kandil Hiring Request',r['name'],'beneficiary_user',self.f.users['manager'])
        self.assertEqual(self.approvals()['total'],0)
        frappe.db.set_value('Kandil Hiring Request',r['name'],'beneficiary_user',None)
        doc=self.f.load(r['name']);snap=json.loads(doc.route_snapshot);snap['interest_snapshot']['users'].append(self.f.users['manager'])
        frappe.db.set_value('Kandil Hiring Request',r['name'],'route_snapshot',json.dumps(snap))
        self.assertEqual(self.approvals()['total'],0)

    def test_native_child_link_permission_applies_before_counts(self):
        first=self.create();second=self.create('Other',requested_position=self.f.positions[1],lines=[dict(capacity=self.f.capacities[1],requested_qty=1)])
        self.f.submit(first['name']);self.f.submit(second['name'])
        self.f.insert('User Permission',user=self.f.users['manager'],allow='Kandil Capacity',for_value=self.f.capacities[0],apply_to_all_doctypes=0,applicable_for='Kandil Hiring Request');frappe.clear_cache(user=self.f.users['manager'])
        r=self.summary('manager');self.assertEqual(r['counts']['requests'],1);self.assertEqual(r['counts']['approvals'],1)
        self.assertNotIn(second['name'],json.dumps(r,default=str))

    def test_counts_minimal_no_writes_and_vacancy_parity(self):
        name,opening,_=self.f.vacancy_fixture();before=self.f.counts(name)
        result=self.summary();self.assertEqual(result['counts']['vacancies'],2);self.assertEqual(result['counts']['unassigned'],2)
        from kandil_hr.recruitment import vacancies
        self.f.call('hr',vacancies.assign_team,name,opening_name=opening,lead=self.f.users['hr'],members=[],reason='Dashboard assignment')
        before=self.f.counts(name);result=self.summary();self.assertEqual(result['counts']['unassigned'],1)
        self.assertEqual(before,self.f.counts(name));self.assertNotIn('approval_steps',json.dumps(result,default=str));self.assertNotIn('qualifications',json.dumps(result,default=str))
        self.assertEqual(set(result['requests'][0]),set(dashboard.FIELDS)|{'quantity'})

    def test_legacy_overview_does_not_expose_restricted_team_identity(self):
        from kandil_hr.recruitment import vacancies
        from kandil_hr.portal import api
        name,opening,_=self.f.vacancy_fixture()
        self.f.call('hr',vacancies.assign_team,name,opening_name=opening,lead=self.f.users['manager'],members=[],reason='Legacy projection privacy')
        self.f.insert('User Permission',user=self.f.users['hr'],allow='User',for_value=self.f.users['hr'],apply_to_all_doctypes=0,applicable_for='User')
        frappe.clear_cache(user=self.f.users['hr'])
        with acting_as(self.f.users['hr']):rows=api.overview()['vacancies']
        row=next(r for r in rows if r['name']==opening)
        self.assertIsNone(row['lead']);self.assertIsNone(row['lead_name']);self.assertEqual(row['members'],[])
        self.assertTrue(row['team_restricted']);self.assertFalse(row['can_assign'])

    def test_overdue_label_uses_required_by_not_sla(self):
        r=self.create(required_by=add_days(today(),-1));self.f.submit(r['name'])
        self.create('Future',required_by=add_days(today(),3));self.create('Past draft',required_by=add_days(today(),-2))
        result=self.summary();self.assertEqual(result['counts']['overdue_requests'],1);self.assertIn('not SLA',result['overdue_definition'])

    def test_guest_and_input_bounds(self):
        with acting_as('Guest'),self.f.rejected(frappe.PermissionError):dashboard.summary()
        for bad in ({'search':{}},{'search':'x'*141}):
            with self.f.rejected():self.approvals(**bad)
        r=self.approvals(start=-1,page_length=10000);self.assertEqual((r['start'],r['page_length']),(0,100))


class TestBoardDashboard(unittest.TestCase):
    def setUp(self):
        self.a=TestAuthorityAudit();self.addCleanup(self.a.doCleanups);self.a.setUp();self.f=self.a.f

    def count(self,role):
        with acting_as(self.f.users[role]):return dashboard.approvals()['total']

    def test_chair_vice_and_external_recorder_visible_only_at_board_step(self):
        doc=self.a.request();self.f.submit(doc.name)
        for role in ('chair','vice','sector'):self.assertEqual(self.count(role),0)
        # reach_board submits itself, so use a second request and leave the first at Department.
        doc=self.a.reach_board(self.a.request())
        for role in ('chair','vice','sector'):self.assertEqual(self.count(role),1)
        self.assertEqual(self.count('hr'),0)
        with acting_as(self.f.users['vice']):
            result=dashboard.summary();self.assertEqual(result['counts']['approvals'],1);self.assertEqual(result['counts']['vacancies'],0)

    def test_revoked_board_member_cannot_decide_or_support_external_recording(self):
        doc=self.a.reach_board(self.a.request())
        for role in ('chair','vice'):
            frappe.db.set_value('User',self.f.users[role],'enabled',0)
        self.assertEqual(self.count('sector'),0)

    def test_interest_blocks_recorder_and_current_member_scope(self):
        doc=self.a.reach_board(self.a.request())
        frappe.db.set_value('Kandil Hiring Request',doc.name,'beneficiary_user',self.f.users['sector'])
        self.assertEqual(self.count('sector'),0);self.assertEqual(self.count('vice'),1)
        frappe.db.set_value('Kandil Access Grant',frappe.db.get_value('Kandil Access Grant',{'user':self.f.users['vice'],'company':self.f.company},'name'),'revoked',1)
        self.assertEqual(self.count('vice'),0)


    def grant(self,principal='manager',process='APPROVALS'):
        with acting_as(self.f.users['sector']):
            return frappe.get_doc(dict(doctype='Kandil Delegation',company=self.f.company,department=self.f.department,
                from_user=self.f.users[principal],to_user=self.f.users['delegate'],from_date=today(),to_date=add_days(today(),5),
                process_scope=process,reason='Synthetic dashboard delegated approval')).insert()

    def test_current_delegate_scope_dates_and_process_precede_counts(self):
        doc=self.a.request(board=False);self.f.submit(doc.name);grant=self.grant()
        self.assertEqual(self.count('delegate'),1)
        for changes in ({'process_scope':'TEAM'},{'process_scope':'APPROVALS','to_date':add_days(today(),-1)},
                        {'to_date':add_days(today(),5),'revoked':1},{'revoked':0,'approval_status':'Pending CEO'}):
            frappe.db.set_value('Kandil Delegation',grant.name,changes);self.assertEqual(self.count('delegate'),0)
        frappe.db.set_value('Kandil Delegation',grant.name,{'approval_status':'Active','process_scope':'ALL'})
        self.assertEqual(self.count('delegate'),1)
        self.f.decide(doc.name,'delegate');self.assertEqual(self.count('delegate'),0)
        self.assertEqual(self.count('hr'),1)

    def test_principal_management_revocation_and_personal_delegate_interest(self):
        doc=self.a.request(board=False);self.f.submit(doc.name);self.grant();self.assertEqual(self.count('delegate'),1)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['manager'],'can_manage_recruitment',0)
        self.assertEqual(self.count('delegate'),0)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['manager'],'can_manage_recruitment',1)
        frappe.db.set_value('Kandil Hiring Request',doc.name,'beneficiary_user',self.f.users['delegate'])
        self.assertEqual(self.count('delegate'),0);self.assertEqual(self.count('manager'),1)

    def test_own_position_employee_link_future_and_voided_interests(self):
        doc=self.a.request(board=False);self.f.submit(doc.name)
        assignment=frappe.db.get_value('Kandil Position Assignment',{'user':self.f.users['manager']},'name')
        frappe.db.set_value('Kandil Position Assignment',assignment,{'position':self.f.positions[0],'user':None})
        self.assertEqual(self.count('manager'),0)  # Employee.user_id still establishes the interest.
        frappe.db.set_value('Kandil Position Assignment',assignment,'valid_from',add_days(today(),1))
        self.assertEqual(self.count('manager'),1)
        frappe.db.set_value('Kandil Position Assignment',assignment,{'valid_from':today(),'is_voided':1})
        self.assertEqual(self.count('manager'),1)

    def test_ceo_delegation_requires_current_personal_approval(self):
        from kandil_hr.foundation import delegation
        import uuid
        doc=self.a.request();self.f.submit(doc.name);self.f.decide(doc.name,'manager');self.f.decide(doc.name,'hr')
        grant=self.grant('ceo');self.assertEqual(self.count('delegate'),0)
        with acting_as(self.f.users['ceo']):
            delegation.decide(grant.name,'Approve','Synthetic CEO delegation consent',str(grant.modified),uuid.uuid4().hex)
        self.assertEqual(self.count('delegate'),1)
        self.f.decide(doc.name,'delegate');self.assertEqual(self.count('delegate'),0)
        self.assertEqual(self.count('chair'),1)


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    suite=unittest.TestSuite(unittest.defaultTestLoader.loadTestsFromTestCase(c) for c in (TestDashboard,TestBoardDashboard))
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(suite)
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
               limits=['Native read-model fixtures; real-role browser and production-scale performance remain separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Dashboard regression failed')
    return value
