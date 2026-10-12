"""Full request fields, bounded selectors and replacement identity boundaries."""
import copy
import json
import unittest
import uuid

import frappe
from frappe.utils import today
from kandil_hr.portal import api, request_form
from kandil_hr.portal.test_api import TestPortalAPI
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.organization.api import transition


class TestRequestForm(unittest.TestCase):
    def setUp(self):
        self.base=TestPortalAPI();self.addCleanup(self.base.doCleanups);self.base.setUp();self.f=self.base.f
        self.employee=self.f.insert('Employee',first_name='Synthetic replacement',company=self.f.company,department=self.f.department,
            branch=frappe.db.get_value('Kandil Position',self.f.positions[0],'branch'),gender='Male',date_of_birth='1990-01-01',date_of_joining=today(),status='Active')

    def choices(self,kind='replacement',**args):
        with acting_as(self.f.users['requester']):return request_form.references(kind,**({'position':self.f.positions[0]} if kind!='position' else {}),**args)

    def full(self):
        return self.base.payload()|dict(need_reason='Replacement',replacement_employee=self.employee.name,employment_type='Fixed term / محدد المدة',
            qualifications='Diploma / دبلوم',skills_required='Welding / لحام',experience_required='3 years / سنوات',working_conditions='Night shifts / وردية ليلية',
            required_by=today(),exception_reason='Synthetic reviewed shortage explanation')

    def test_full_fields_round_trip_edit_submit_and_saved_detail(self):
        payload=self.full();saved=self.base.save(copy.deepcopy(payload))
        with acting_as(self.f.users['requester']):detail=api.detail(saved['name'])['request']
        for key,value in payload.items():
            if key!='lines':self.assertEqual(str(detail[key]),str(value))
        payload['skills_required']='Updated welding / تحديث';updated=self.base.save(copy.deepcopy(payload),name=saved['name'],expected_version=saved['modified'])
        self.assertEqual(updated['skills_required'],payload['skills_required']);self.f.submit(saved['name'])
        with acting_as(self.f.users['hr']):review=api.detail(saved['name'])['request']
        self.assertEqual(review['working_conditions'],payload['working_conditions'])
        with self.f.rejected():self.base.save(copy.deepcopy(payload),name=saved['name'],expected_version=updated['modified'])

    def test_directory_is_minimal_and_does_not_grant_profile_read(self):
        rows=self.choices(name=self.employee.name)['rows'];self.assertEqual(rows,[dict(id=self.employee.name,label=self.employee.employee_name)])
        with acting_as(self.f.users['requester']):self.assertFalse(frappe.get_doc('Employee',self.employee.name).has_permission('read'))
        self.assertNotIn('date_of_birth',json.dumps(rows));self.assertNotIn('gender',json.dumps(rows))

    def test_native_employee_user_permission_filters_selector_and_guessed_native_save(self):
        other=self.f.insert('Employee',first_name='Other replacement',company=self.f.company,department=self.f.department,gender='Male',date_of_birth='1990-01-01',date_of_joining=today(),status='Active')
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Employee',for_value=other.name,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester'])
        self.assertEqual(self.choices(name=self.employee.name)['rows'],[])
        with self.f.rejected(frappe.PermissionError):self.base.save(self.full())
        with acting_as(self.f.users['requester']),self.f.rejected(frappe.PermissionError):
            frappe.get_doc(dict(doctype='Kandil Hiring Request',requested_by=frappe.session.user,revision=1,**self.full())).insert()

    def test_restricted_existing_reference_is_hidden_preserved_and_replay_redacted(self):
        payload=self.full();command=uuid.uuid4().hex;saved=self.base.save(copy.deepcopy(payload),command_id=command)
        allowed=frappe.db.get_value('Employee',{'user_id':self.f.users['manager']},'name')
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Employee',for_value=allowed,apply_to_all_doctypes=1,applicable_for='Employee')
        frappe.clear_cache(user=self.f.users['requester'])
        with acting_as(self.f.users['requester']):
            detail=api.detail(saved['name'])['request'];self.assertIsNone(detail['replacement_employee']);self.assertTrue(detail['replacement_restricted'])
        replay=self.base.save(copy.deepcopy(payload),command_id=command);self.assertIsNone(replay['replacement_employee'])
        payload.pop('replacement_employee');payload['skills_required']='Edit without changing restricted reference'
        edited=self.base.save(copy.deepcopy(payload),name=saved['name'],expected_version=saved['modified'])
        self.assertIsNone(edited['replacement_employee']);self.assertEqual(self.f.load(saved['name']).replacement_employee,self.employee.name)

    def test_branch_management_scope_rejects_guessed_employee(self):
        self.base.replace_requester_grant(branch=frappe.db.get_value('Kandil Position',self.f.positions[0],'branch'))
        frappe.db.set_value('Employee',self.employee.name,'branch',frappe.db.get_value('Kandil Position',self.f.positions[1],'branch'))
        self.assertEqual(self.choices(name=self.employee.name)['rows'],[])
        with self.f.rejected(frappe.PermissionError):self.base.save(self.full())

    def test_selectors_paginate_beyond_previous_500_limit(self):
        with transition():
            for i in range(503):
                self.f.insert('Kandil Position',company=self.f.company,department=self.f.department,
                    branch=self.employee.branch,designation=self.f.designation,position_code=self.f.prefix+'-PAGE-%03d'%i,title='Synthetic paged position')
        names=[];cursor=0
        while True:
            result=self.choices('position',search=self.f.prefix+'-PAGE-',start=cursor,page_length=100)
            names.extend(r['id'] for r in result['rows'])
            if not result['has_more']:break
            self.assertGreater(result['next_start'],cursor);cursor=result['next_start']
        self.assertEqual(len(names),503);self.assertEqual(len(set(names)),503)
        self.assertEqual(self.choices('position',name=names[-1])['rows'][0]['id'],names[-1])

    def test_capacity_anchor_native_permissions_and_paging(self):
        first=self.choices('capacity',page_length=1);second=self.choices('capacity',start=first['next_start'],page_length=1)
        self.assertTrue(first['has_more']);self.assertNotEqual(first['rows'][0]['id'],second['rows'][0]['id'])
        self.assertEqual(first['rows'][0]['availability_basis'],'recorded_ledger')
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Kandil Position',for_value=self.f.positions[1],apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester'])
        with self.assertRaises(frappe.PermissionError):self.choices('capacity')

    def test_revocation_guest_readonly_and_invalid_selector(self):
        self.base.replace_requester_grant(can_manage_recruitment=0)
        self.assertEqual(self.choices('position')['rows'],[])
        with self.assertRaises(frappe.PermissionError):self.choices()
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError):request_form.references('position')
        with self.assertRaises(frappe.ValidationError):self.choices('untrusted')


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    import sys
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires opted-in parity CLI')
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(TestRequestForm)
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(suite)
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
               limits=['Rollback-scoped native tests; personal-session HTTP/browser evidence is separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Request form regression failed')
    return value
