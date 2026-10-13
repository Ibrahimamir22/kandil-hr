"""Request register counts, pagination and current personal-role boundaries."""
import json
import sys
import unittest
from unittest.mock import patch

import frappe
from kandil_hr.portal import requests
from kandil_hr.portal.test_api import TestPortalAPI
from kandil_hr.recruitment.test_commands import acting_as


class TestRequests(unittest.TestCase):
    def setUp(self):
        self.base=TestPortalAPI();self.addCleanup(self.base.doCleanups);self.base.setUp();self.f=self.base.f

    def create(self,title='Request',role='requester',**extra):
        return self.base.save(self.base.payload()|dict(title=self.f.prefix+' '+title)|extra,key=role)

    def listing(self,role='hr',**args):
        with acting_as(self.f.users[role]):return requests.listing(**args)

    def test_mine_and_scope_counts_follow_requester_identity(self):
        own=self.create('Own HR','hr');other=self.create('Other request')
        mine=self.listing();scope=self.listing(mode='scope')
        self.assertEqual((mine['total'],scope['total']),(1,2))
        self.assertEqual([r['name'] for r in mine['rows']],[own['name']])
        self.assertEqual({r['name'] for r in scope['rows']},{own['name'],other['name']})
        self.assertEqual(self.listing('requester',mode='scope')['total'],1)

    def test_principal_sees_routed_request_but_not_unrelated_draft(self):
        user=frappe.get_doc('User',self.f.users['manager'])
        user.set('roles',[r for r in user.roles if r.role!='Kandil Recruiter']);user.save(ignore_permissions=True)
        visible=self.create('Submitted');self.f.submit(visible['name']);self.create('Draft')
        self.assertEqual(self.listing('manager')['total'],0)
        self.assertEqual([r['name'] for r in self.listing('manager',mode='scope')['rows']],[visible['name']])

    def test_search_applies_before_pagination_and_count(self):
        target=self.create('Target needle')
        for i in range(5):self.create('Other '+str(i))
        first=self.listing(mode='scope',page_length=2)
        self.assertNotIn(target['name'],[r['name'] for r in first['rows']])
        found=self.listing(mode='scope',search='needle',page_length=2)
        self.assertEqual((found['total'],len(found['rows'])),(1,1));self.assertEqual(found['rows'][0]['name'],target['name'])
        self.assertEqual(self.listing(mode='scope',search=target['name'])['total'],1)

    def test_pages_stable_complete_and_total_not_page_count(self):
        names={self.create(str(i))['name'] for i in range(7)}
        seen=[]
        for start in (0,3,6):
            value=self.listing(mode='scope',start=start,page_length=3)
            self.assertEqual(value['total'],7);self.assertEqual(value['has_more'],start<6)
            seen += [r['name'] for r in value['rows']]
        self.assertEqual(set(seen),names);self.assertEqual(len(seen),7)
        self.assertEqual(self.listing(mode='scope',start=99)['rows'],[])

    def test_status_and_arabic_filters_intersect(self):
        submitted=self.create('احتياج التشغيل');self.f.submit(submitted['name'])
        self.create('احتياج التشغيل draft')
        result=self.listing(mode='scope',status='Pending',search='التشغيل')
        self.assertEqual(result['total'],1);self.assertEqual(result['rows'][0]['name'],submitted['name'])
        self.assertEqual(self.listing(mode='scope',status='Rejected')['total'],0)

    def test_wildcards_quotes_and_sql_text_do_not_widen_search(self):
        target=self.create("Literal 100%_ done")
        self.create('Literal 100AB done')
        value=self.listing(mode='scope',search='100%_')
        self.assertEqual([r['name'] for r in value['rows']],[target['name']])
        self.assertEqual(self.listing(mode='scope',search="' OR 1=1 --")['total'],0)

    def test_revocation_removes_count_and_records_immediately(self):
        self.create();self.assertEqual(self.listing(mode='scope')['total'],1)
        grant=frappe.get_doc('Kandil Access Grant',self.f.grants['hr']);grant.revoked=1;grant.save(ignore_permissions=True)
        value=self.listing(mode='scope');self.assertEqual((value['total'],value['rows']),(0,[]))

    def test_native_position_user_permission_restricts_count_and_page(self):
        first=self.create('First')
        other=self.create('Second',requested_position=self.f.positions[1],lines=[dict(capacity=self.f.capacities[1],requested_qty=1)])
        self.f.insert('User Permission',user=self.f.users['hr'],allow='Kandil Position',for_value=self.f.positions[0],apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['hr'])
        value=self.listing(mode='scope');self.assertEqual(value['total'],1)
        self.assertEqual([r['name'] for r in value['rows']],[first['name']]);self.assertNotIn(other['name'],json.dumps(value))

    def test_multilocation_requires_scope_for_every_line(self):
        single=self.create('Single');self.create('Both',lines=[dict(capacity=c,requested_qty=1) for c in self.f.capacities])
        grant=frappe.get_doc('Kandil Access Grant',self.f.grants['hr']);grant.revoked=1;grant.save(ignore_permissions=True)
        self.f.insert('Kandil Access Grant',user=self.f.users['hr'],company=self.f.company,department=self.f.department,
            branch=frappe.db.get_value('Kandil Capacity',self.f.capacities[0],'branch'),valid_from=grant.valid_from,reason='Single branch register test')
        value=self.listing(mode='scope');self.assertEqual(value['total'],1);self.assertEqual(value['rows'][0]['name'],single['name'])

    def test_minimal_projection_and_read_has_no_effects(self):
        doc=self.create(qualifications='Public detail not needed on list');before=self.f.counts(doc['name'])
        result=self.listing(mode='scope');self.assertEqual(self.f.counts(doc['name']),before)
        self.assertEqual(set(result['rows'][0]),set(requests.FIELDS)|{'quantity'})
        self.assertNotIn('qualifications',json.dumps(result));self.assertEqual(result['rows'][0]['quantity'],2)

    def test_guest_and_disabled_account_denied(self):
        with acting_as('Guest'),self.f.rejected(frappe.PermissionError):requests.listing()
        user=frappe.get_doc('User',self.f.users['hr']);user.enabled=0;user.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):self.listing(mode='scope')

    def test_invalid_filters_and_bounded_pages(self):
        for bad in ({'mode':'all users'},{'mode':{}},{'status':[]},{'status':'Unknown'},{'search':{}},{'search':'x'*141}):
            with self.f.rejected():self.listing(**bad)
        value=self.listing(start=-5,page_length=10000)
        self.assertEqual((value['start'],value['page_length']),(0,100))


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestRequests))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
        limits=['Native rollback register tests; HTTP/browser and full historical snapshot acceptance are separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Request register regression failed')
    return value
