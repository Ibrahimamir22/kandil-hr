"""Ordinary-role organization read contracts on rolled-back synthetic fixtures."""
import json
import unittest
from unittest.mock import patch

import frappe
from frappe.utils import add_days, today

from kandil_hr.portal import organization as api
from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as


class TestOrganizationPortal(unittest.TestCase):
    def setUp(self):
        self.f=TestRecruitmentCommands();self.addCleanup(self.f.doCleanups)
        original=self.f.insert
        def insert_fixture(doctype,**values):
            if doctype!='User':return original(doctype,**values)
            previous=frappe.flags.get('in_import')
            try:
                frappe.flags.in_import=True
                return original(doctype,**values)
            finally:frappe.flags.in_import=previous
        with patch.object(self.f,'insert',side_effect=insert_fixture):self.f.setUp()
        self.branch=frappe.db.get_value('Kandil Position',self.f.positions[0],'branch')
        self.parent=frappe.db.get_value('Kandil Position Hierarchy',{'position':self.f.positions[0]},'parent_position')

    def call(self,method,role='hr',**kwargs):
        with acting_as(self.f.users[role]):return getattr(api,method)(**kwargs)

    def branch_scope(self,role='hr'):
        old=frappe.get_doc('Kandil Access Grant',self.f.grants[role]);old.revoked=1;old.save(ignore_permissions=True)
        self.f.insert('Kandil Access Grant',company=self.f.company,department=self.f.department,branch=self.branch,
                      user=self.f.users[role],valid_from=today(),can_manage_recruitment=1,reason='Synthetic branch-only organization access')

    def test_scoped_options_pagination_and_server_search(self):
        opts=self.call('options',kind='company')
        self.assertEqual([r['id'] for r in opts['rows']],[self.f.company])
        first=self.call('positions',page_length=1)
        self.assertEqual(len(first['rows']),1);self.assertTrue(first['has_more'])
        second=self.call('positions',page_length=1,start=first['next_start'])
        self.assertNotEqual(first['rows'][0]['name'],second['rows'][0]['name'])
        result=self.call('positions',search=self.f.prefix+'-B')
        self.assertEqual([r['name'] for r in result['rows']],[self.f.positions[1]])
        self.assertEqual(self.call('positions',company='No authorized company')['rows'],[])
        self.assertEqual(self.call('options',kind='branch',company='No authorized company')['rows'],[])

    def test_branch_filter_and_hidden_parent_do_not_leak_ids(self):
        self.branch_scope()
        result=self.call('positions')
        self.assertEqual([r['name'] for r in result['rows']],[self.f.positions[0]])
        self.assertTrue(result['rows'][0]['reporting']['restricted'])
        self.assertNotIn(self.parent,json.dumps(result,default=str))
        self.assertEqual([r['id'] for r in self.call('options',kind='branch')['rows']],[self.branch])
        for target in [self.parent,self.f.positions[1],'nonexistent']:
            with self.assertRaises(frappe.PermissionError):self.call('detail',name=target)
            with self.assertRaises(frappe.PermissionError):self.call('related',name=target,kind='assignments')

    def test_date_changes_reporting_lines_without_changing_capacity(self):
        before=[frappe.as_json(frappe.get_doc('Kandil Capacity',c).as_dict()) for c in self.f.capacities]
        now=self.call('detail',name=self.f.positions[0],as_of=today())
        past=self.call('detail',name=self.f.positions[0],as_of=add_days(today(),-1))
        self.assertEqual(now['position']['reporting']['parent']['name'],self.parent)
        self.assertIsNone(past['position']['reporting']['parent'])
        self.assertEqual(now['capacities'],past['capacities'])
        self.assertEqual(now['capacity_basis'],'recorded_current_ledger')
        self.assertEqual(before,[frappe.as_json(frappe.get_doc('Kandil Capacity',c).as_dict()) for c in self.f.capacities])

    def test_assignment_date_boundaries_history_and_minimal_projection(self):
        row=frappe.get_doc('Kandil Position Assignment',{'position':self.parent})
        frappe.db.set_value(row.doctype,row.name,'valid_until',today())
        current=self.call('related',name=self.parent,kind='assignments',as_of=today())
        self.assertEqual(len(current['rows']),1);self.assertTrue(current['rows'][0]['active_at_date'])
        self.assertNotIn('user',current['rows'][0]);self.assertNotIn('remarks',current['rows'][0])
        future=self.call('related',name=self.parent,kind='assignments',as_of=add_days(today(),1))
        self.assertEqual(future['rows'],[])
        history=self.call('related',name=self.parent,kind='assignments',as_of=add_days(today(),1),history=1)
        self.assertEqual(len(history['rows']),1);self.assertFalse(history['rows'][0]['active_at_date'])
        # Assignment visibility alone cannot bypass Employee's native read gate.
        with patch('frappe.model.document.Document.has_permission',return_value=False):
            redacted=self.call('related',name=self.parent,kind='assignments',history=1)['rows'][0]
        self.assertTrue(redacted['identity_restricted']);self.assertIsNone(redacted['employee']);self.assertIsNone(redacted['employee_name'])

    def test_requester_can_view_positions_but_not_hr_related_records(self):
        result=self.call('detail',role='requester',name=self.f.positions[0])
        self.assertFalse(result['access']['assignments']);self.assertFalse(result['access']['job_descriptions'])
        self.assertFalse(result['position']['reporting']['available'])
        for kind in ['assignments','job_descriptions']:
            result=self.call('related',role='requester',name=self.f.positions[0],kind=kind)
            self.assertFalse(result['available']);self.assertEqual(result['rows'],[])

    def test_revoked_and_disabled_accounts_and_guest(self):
        grant=frappe.get_doc('Kandil Access Grant',self.f.grants['hr']);grant.revoked=1;grant.save(ignore_permissions=True)
        self.assertEqual(self.call('positions')['rows'],[])
        with self.assertRaises(frappe.PermissionError):self.call('detail',name=self.f.positions[0])
        user=frappe.get_doc('User',self.f.users['hr']);user.enabled=0;user.save(ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):self.call('positions')
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError):api.positions()

    def test_closed_positions_remain_discoverable(self):
        frappe.db.set_value('Kandil Position',self.f.positions[0],{'status':'Closed','closed_on':today()})
        closed=self.call('positions',status='Closed')
        self.assertEqual([r['name'] for r in closed['rows']],[self.f.positions[0]])
        self.assertIn(self.f.positions[0],{r['name'] for r in self.call('positions')['rows']})
        self.assertNotIn(self.f.positions[0],{r['name'] for r in self.call('positions',status='Active')['rows']})

    def test_filters_and_projection_are_bounded(self):
        for values in [{'as_of':'2026-02-31'},{'as_of':'yesterday'},{'status':'Forged'},{'search':'x'*141}]:
            with self.subTest(values=values),self.assertRaises(frappe.ValidationError):self.call('positions',**values)
        with self.assertRaises(frappe.ValidationError):self.call('options',kind='User')
        with self.assertRaises(frappe.ValidationError):self.call('related',name=self.parent,kind='Employee')
        with self.assertRaises(frappe.ValidationError):self.call('related',name=self.parent,kind='assignments',history='yes')
        row=self.call('positions')['rows'][0]
        self.assertNotIn('grade_band',row);self.assertNotIn('salary',row);self.assertNotIn('external_id',row)
        self.assertEqual(api.paging(-5,10000),(0,100))

    def test_job_description_uses_native_anchor_scope_and_omits_salary(self):
        position=frappe.get_doc('Kandil Position',self.f.positions[1])
        jd=self.f.insert('Kandil JD Revision',company=self.f.company,department=self.f.department,branch=position.branch,
            position=position.name,valid_from=today(),purpose='Synthetic JD',
            responsibility_rows=[dict(description=x) for x in ['Quality','Safety','Reporting']])
        rows=self.call('related',name=self.f.positions[0],kind='job_descriptions')['rows']
        self.assertEqual([r['name'] for r in rows],[jd.name])
        self.assertNotIn('grade_band',rows[0]);self.assertNotIn('purpose',rows[0]);self.assertTrue(rows[0]['can_print'])
        self.branch_scope()
        self.assertEqual(self.call('related',name=self.f.positions[0],kind='job_descriptions')['rows'],[])


def run():
    from kandil_hr.foundation.concurrency_runner import _guard
    from kandil_hr.foundation.tests_runner import RecordedResult
    _guard()
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(TestOrganizationPortal)
    assert suite.countTestCases()==9
    result=unittest.TextTestRunner(verbosity=2,resultclass=RecordedResult).run(suite)
    return dict(result='PASS' if result.wasSuccessful() and not result.skipped and result.testsRun==9 else 'FAIL',
                total=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),tests=result.checks,
                limits=['Native role tests with rolled-back synthetic fixtures; HTTP/browser checks are separate.',
                        'One Employee read-denial test patches only that native predicate; assignment/position grants are real.'])
