"""Isolated rollback tests for the counted vacancy queue and native boundaries."""
import json
import sys
import unittest
from unittest.mock import patch

import frappe
from frappe.utils import add_days, today

from kandil_hr.foundation.teams import effective_lead
from kandil_hr.portal import vacancies
from kandil_hr.portal.test_api import TestPortalAPI
from kandil_hr.recruitment import vacancies as commands
from kandil_hr.recruitment.test_commands import acting_as


class TestVacancies(unittest.TestCase):
    def setUp(self):
        self.base=TestPortalAPI(); self.addCleanup(self.base.doCleanups); self.base.setUp(); self.f=self.base.f
        # Larger synthetic baseline lets pagination tests create > one page
        # without invoking the separate exceptional-headcount route.
        for capacity,position in zip(self.f.capacities,self.f.positions):
            frappe.db.set_value('Kandil Capacity',capacity,{'structural':100,'available':100})
            frappe.db.set_value('Kandil Position',position,'structural',100)

    def create(self,title='Vacancy',both=False,position=0,**extra):
        payload=self.base.payload() | dict(title=self.f.prefix+' '+title,requested_position=self.f.positions[position],
            lines=[dict(capacity=c,requested_qty=1) for c in (self.f.capacities if both else [self.f.capacities[position]])]) | extra
        doc=self.base.save(payload); self.f.submit(doc['name']); self.f.approve_all(doc['name'])
        return self.f.load(doc['name'])

    def listing(self,role='hr',**args):
        with acting_as(self.f.users[role]):return vacancies.listing(**args)

    def assign(self,doc,role='manager',members=None):
        opening=doc.lines[0].job_opening
        self.f.call('hr',commands.assign_team,doc.name,opening_name=opening,lead=self.f.users[role],
                    members=json.dumps(members or []),reason='Synthetic queue team')
        return opening

    def test_exact_location_count_pages_and_no_writes(self):
        docs=[self.create(str(i),both=True) for i in range(3)]
        before={d.name:self.f.counts(d.name) for d in docs}
        expected={l.job_opening for d in docs for l in d.lines};seen=[]
        for start in (0,2,4):
            result=self.listing(start=start,page_length=2)
            self.assertEqual((result['total'],len(result['rows']),result['has_more']),(6,2,start<4))
            seen.extend(r['name'] for r in result['rows'])
        self.assertEqual(seen,sorted(expected)); self.assertEqual(len(set(seen)),6)
        self.assertEqual(self.listing(start=99)['rows'],[])
        self.assertEqual(before,{d.name:self.f.counts(d.name) for d in docs})

    def test_search_before_paging_arabic_literal_and_injection(self):
        target=self.create('احتياج 100%_')
        for i in range(3):self.create('Other '+str(i))
        for search in ('احتياج','100%_',target.name,target.lines[0].job_opening):
            result=self.listing(search=search,page_length=1)
            self.assertEqual(result['total'],1);self.assertEqual(result['rows'][0]['request'],target.name)
        self.assertEqual(self.listing(search="' OR 1=1 --")['total'],0)
        self.assertEqual(self.listing(search='missing')['total'],0)

    def test_native_parent_position_permissions_before_count(self):
        first=self.create('First');self.create('Second',position=1)
        self.f.insert('User Permission',user=self.f.users['hr'],allow='Kandil Position',for_value=self.f.positions[0],apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['hr'])
        # The approved request also references the manager's position in its
        # approval child rows. Without that native allowance, neither is readable.
        self.assertEqual(self.listing()['total'],0)
        self.assertEqual(self.options(kind='company')['rows'],[])
        manager_position=frappe.db.get_value('Kandil Position',{'position_code':self.f.prefix+'-manager'},'name')
        self.f.insert('User Permission',user=self.f.users['hr'],allow='Kandil Position',for_value=manager_position,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['hr'])
        result=self.listing();self.assertEqual(result['total'],1)
        self.assertEqual(result['rows'][0]['request'],first.name)

    def test_native_opening_permission_before_count(self):
        first=self.create('First');self.create('Second')
        self.f.insert('User Permission',user=self.f.users['hr'],allow='Job Opening',for_value=first.lines[0].job_opening,
                      apply_to_all_doctypes=0,applicable_for='Job Opening')
        frappe.clear_cache(user=self.f.users['hr'])
        result=self.listing();self.assertEqual(result['total'],1)
        self.assertEqual(result['rows'][0]['request'],first.name)

    def test_every_location_scope_and_revocation(self):
        first=self.create('Single');self.create('Multi',both=True)
        grant=frappe.get_doc('Kandil Access Grant',self.f.grants['hr']);grant.revoked=1;grant.save(ignore_permissions=True)
        new=self.f.insert('Kandil Access Grant',user=self.f.users['hr'],company=self.f.company,department=self.f.department,
            branch=frappe.db.get_value('Kandil Capacity',self.f.capacities[0],'branch'),valid_from=today(),reason='One branch queue')
        result=self.listing();self.assertEqual(result['total'],1);self.assertEqual(result['rows'][0]['request'],first.name)
        self.assertEqual(len(self.options(kind='branch')['rows']),1)
        new.revoked=1;new.save(ignore_permissions=True)
        self.assertEqual(self.listing()['total'],0)

    def test_dimensions_intersect(self):
        self.create(both=True)
        branch=frappe.db.get_value('Kandil Capacity',self.f.capacities[0],'branch')
        self.assertEqual(self.listing(company=self.f.company,department=self.f.department,branch=branch)['total'],1)
        self.assertEqual(self.listing(company='Unknown')['total'],0)
        self.assertEqual(self.listing(department='Unknown')['total'],0)
        self.assertEqual(self.listing(branch='Unknown')['total'],0)

    def test_unassigned_and_team_match_live_domain(self):
        doc=self.create();opening=self.assign(doc,members=[self.f.users['hr']])
        self.assertEqual(self.listing(mode='unassigned')['total'],0)
        self.assertEqual(self.listing(mode='mine')['total'],1)
        self.assertEqual(self.listing('manager',mode='mine')['total'],1)
        with self.f.rejected(frappe.PermissionError):self.listing('requester',mode='mine')
        frappe.db.set_value('Kandil Access Grant',self.f.grants['manager'],'revoked',1)
        self.assertIsNone(effective_lead(frappe.get_doc('Job Opening',opening)))
        result=self.listing(mode='unassigned');self.assertEqual(result['total'],1)
        self.assertTrue(result['rows'][0]['unassigned']);self.assertIsNone(result['rows'][0]['lead'])
        self.assertEqual(self.listing('manager',mode='mine')['total'],0)

    def test_unassigned_disabled_and_removed_role(self):
        doc=self.create();opening=self.assign(doc)
        account=frappe.get_doc('User',self.f.users['manager']);account.enabled=0;account.save(ignore_permissions=True)
        self.assertEqual(self.listing(mode='unassigned')['total'],1)
        self.assertIsNone(effective_lead(frappe.get_doc('Job Opening',opening)))
        account.enabled=1;account.set('roles',[r for r in account.roles if r.role!='Kandil Recruiter']);account.save(ignore_permissions=True)
        self.assertEqual(self.listing(mode='unassigned')['total'],1)
        self.assertIsNone(effective_lead(frappe.get_doc('Job Opening',opening)))

    def test_unassigned_expired_future_and_partial_grant(self):
        doc=self.create(both=True);opening=self.assign(doc)
        grant=frappe.get_doc('Kandil Access Grant',self.f.grants['manager'])
        for changes in ({'valid_until':add_days(today(),-1)}, {'valid_until':None,'valid_from':add_days(today(),1)},
                        {'valid_from':today(),'branch':frappe.db.get_value('Kandil Capacity',self.f.capacities[0],'branch')}):
            frappe.db.set_value('Kandil Access Grant',grant.name,changes)
            self.assertIsNone(effective_lead(frappe.get_doc('Job Opening',opening)))
            self.assertEqual(self.listing(mode='unassigned')['total'],2)

    def test_priority_boundaries_match_domain_and_order(self):
        doc=self.create();opening=doc.lines[0].job_opening
        at=today()
        with patch('kandil_hr.portal.vacancies.today_cairo',return_value=at):
            for age in (-1,0,15,16,30,31,60,61):
                for due in (None,-1,0,7,8,30,31):
                    frappe.db.set_value('Job Opening',opening,'custom_kandil_started_on',add_days(at,-age))
                    frappe.db.set_value('Kandil Hiring Request',doc.name,'required_by',None if due is None else add_days(at,due))
                    result=self.listing();self.assertEqual(len(result['rows']),1) # endpoint compares SQL/pure score
            frappe.db.set_value('Kandil Hiring Request',doc.name,{'hr_priority':'Critical','requested_priority':'Normal'})
            for expiry in (None,add_days(at,-1),at,add_days(at,1)):
                frappe.db.set_value('Job Opening',opening,'custom_kandil_pin_until',expiry)
                self.assertEqual(len(self.listing()['rows']),1)
        high=self.create('Higher')
        self.f.call('hr',commands.pin,high.name,opening_name=high.lines[0].job_opening,pin_until=add_days(today(),1),reason='Queue priority check')
        frappe.db.set_value('Job Opening',opening,'custom_kandil_pin_until',None)
        self.assertEqual(self.listing(page_length=1)['rows'][0]['request'],high.name)

    def test_lifecycle_filters_zero_paused_priority_closed_quantities(self):
        doc=self.create();opening=doc.lines[0].job_opening
        self.f.call('hr',commands.set_state,doc.name,opening_name=opening,action='Hold',reason='Synthetic hold')
        row=self.listing(state='On Hold')['rows'][0];self.assertEqual(row['priority']['score'],0)
        self.assertEqual((row['quantity'],row['remaining'],row['joined'],row['closed']),(1,1,0,0))
        self.assertEqual(self.listing(state='Open')['total'],0)
        self.f.call('hr',commands.set_state,doc.name,opening_name=opening,action='Close',reason='Synthetic close')
        self.assertEqual(self.listing()['total'],0)
        row=self.listing(state='Closed')['rows'][0]
        self.assertEqual((row['remaining'],row['closed']),(0,1));self.assertFalse(row['can_manage'])
        self.assertEqual(self.listing(state='all')['total'],1)

    def test_closed_location_has_no_action_hint_while_parent_stays_approved(self):
        doc=self.create(both=True)
        self.f.call('hr',commands.set_state,doc.name,opening_name=doc.lines[0].job_opening,action='Close',reason='One location closed')
        self.assertEqual(self.f.load(doc.name).status,'Approved')
        closed=self.listing(state='Closed')['rows'][0]
        self.assertFalse(closed['can_assign']);self.assertFalse(closed['can_manage'])
        self.assertTrue(self.listing()['rows'][0]['can_assign'])

    def test_restricted_team_never_silently_replaces_hidden_members(self):
        doc=self.create();self.assign(doc,members=[self.f.users['hr']])
        self.f.insert('User Permission',user=self.f.users['hr'],allow='User',for_value=self.f.users['hr'],
                      apply_to_all_doctypes=0,applicable_for='User')
        frappe.clear_cache(user=self.f.users['hr'])
        result=self.listing();self.assertEqual(result['total'],1)
        row=result['rows'][0];self.assertTrue(row['team_restricted']);self.assertFalse(row['can_assign'])
        self.assertFalse(row['unassigned']);self.assertIsNone(row['lead'])
        self.assertNotIn(self.f.users['manager'],json.dumps(result))

    def test_guessed_opening_parent_mismatch_excluded(self):
        one=self.create('One');two=self.create('Two')
        frappe.db.set_value('Job Opening',one.lines[0].job_opening,'custom_kandil_request',two.name)
        self.assertEqual(self.listing()['total'],1)
        self.assertEqual(self.listing()['rows'][0]['request'],two.name)

    def options(self,role='hr',**args):
        with acting_as(self.f.users[role]):return vacancies.filter_options(**args)

    def test_filter_options_distinct_bounded_search_and_resolution(self):
        self.create(both=True);self.create(both=True)
        before=self.listing()
        branches=sorted(frappe.db.get_value('Kandil Capacity',c,'branch') for c in self.f.capacities)
        first=self.options(kind='branch',page_length=1)
        second=self.options(kind='branch',page_length=1,start=first['next_start'])
        self.assertEqual([r['id'] for r in first['rows']+second['rows']],branches)
        self.assertTrue(first['has_more']);self.assertFalse(second['has_more'])
        self.assertEqual(self.options(kind='branch',start=99)['rows'],[])
        self.assertEqual(self.options(kind='company')['rows'],[dict(id=self.f.company,label=self.f.company)])
        self.assertEqual(self.options(kind='branch',name=branches[1])['rows'],[dict(id=branches[1],label=branches[1])])
        self.assertEqual(self.options(kind='branch',search=branches[1])['rows'],[dict(id=branches[1],label=branches[1])])
        self.assertEqual(self.options(kind='branch',search="' OR 1=1 --")['rows'],[])
        self.assertEqual(self.options(kind='branch',search='%_')['rows'],[])
        self.assertEqual(before,self.listing())

    def test_filter_options_dependencies_and_terminal_history(self):
        doc=self.create()
        self.assertEqual(self.options(kind='department',company=self.f.company)['rows'][0]['id'],self.f.department)
        for args in ({'kind':'department','company':'Unknown'}, {'kind':'branch','department':'Unknown'},
                     {'kind':'branch','company':'Unknown'},{'kind':'branch','name':'Unknown'}):
            self.assertEqual(self.options(**args)['rows'],[])
        self.f.call('hr',commands.set_state,doc.name,opening_name=doc.lines[0].job_opening,action='Close',reason='Synthetic selector history')
        self.assertEqual(self.listing()['total'],0)
        self.assertEqual(len(self.options(kind='branch')['rows']),1)

    def test_filter_options_exclude_drafts_outsiders_and_revoked_scope(self):
        self.base.save(self.base.payload())
        self.assertEqual(self.options()['rows'],[])
        self.create(both=True)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['manager'],'revoked',1)
        self.assertEqual(self.options('manager',company=self.f.company)['rows'],[])
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        for kind in ('company','department','branch'):
            self.assertEqual(self.options(kind=kind)['rows'],[])

    def test_filter_options_native_opening_permission(self):
        first=self.create();self.create(position=1)
        self.f.insert('User Permission',user=self.f.users['hr'],allow='Job Opening',for_value=first.lines[0].job_opening,
                      apply_to_all_doctypes=0,applicable_for='Job Opening')
        frappe.clear_cache(user=self.f.users['hr'])
        branch=frappe.db.get_value('Kandil Capacity',first.lines[0].capacity,'branch')
        self.assertEqual(self.options(kind='branch')['rows'],[dict(id=branch,label=branch)])

    def test_filter_options_validation_and_disabled_session(self):
        for args in ({'kind':{}},{'kind':'User'},{'company':[]},{'department':'x'*141},{'search':{}},{'name':'x'*141}):
            with self.f.rejected():self.options(**args)
        result=self.options(start=-10,page_length=9999)
        self.assertEqual((result['start'],result['page_length']),(0,100))
        with acting_as('Guest'),self.f.rejected(frappe.PermissionError):vacancies.filter_options()
        account=frappe.get_doc('User',self.f.users['hr']);account.enabled=0;account.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):self.options()

    def test_guest_disabled_invalid_and_bounded(self):
        with acting_as('Guest'),self.f.rejected(frappe.PermissionError):vacancies.listing()
        for args in ({'mode':{}},{'mode':'sql'},{'state':[]},{'state':'Unknown'},{'search':{}},{'branch':'x'*141}):
            with self.f.rejected():self.listing(**args)
        result=self.listing(start=-9,page_length=9999)
        self.assertEqual((result['start'],result['page_length']),(0,100))
        account=frappe.get_doc('User',self.f.users['hr']);account.enabled=0;account.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):self.listing()


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestVacancies))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
               limits=['Rollback-scoped native queue tests; HTTP/browser and sustained capacity remain separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Vacancy queue regression failed')
    return value
