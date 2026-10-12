"""Synthetic ordinary-role JD portal contracts; every case rolls back."""
import json
import unittest
import uuid

import frappe
from frappe.utils import add_days, today

from kandil_hr.portal import job_descriptions as api
from kandil_hr.portal.test_organization import TestOrganizationPortal
from kandil_hr.recruitment.test_commands import acting_as


class TestJobDescriptions(unittest.TestCase):
    def setUp(self):
        fixture=TestOrganizationPortal();self.addCleanup(fixture.doCleanups);fixture.setUp();self.f=fixture.f
        for role in ('hr','sector'):
            self.f.insert('Kandil Access Grant',company=self.f.company,user=self.f.users[role],valid_from=today(),
                          can_manage_recruitment=1,reason='Synthetic JD whole-company author/reviewer')
        self.payload=dict(valid_from=today(),purpose='Safe operation',purpose_ar='التشغيل الآمن',
            responsibility_rows=[dict(description=x,description_ar='مسؤولية تجريبية') for x in ('Quality','Safety','Reporting')],
            kpis=[dict(indicator='Quality',kind='Weighted',weight=100,formula='Passed / total',frequency='Monthly')])

    def call(self,method,role='hr',**args):
        with acting_as(self.f.users[role]):return getattr(api,method)(**args)

    def save(self,**extra):
        return self.call('save',position=self.f.positions[0],payload=self.payload,command_id=uuid.uuid4().hex,**extra)

    def test_create_roundtrip_and_minimal_projection(self):
        saved=self.save();doc=self.call('detail',name=saved['name'])
        self.assertTrue(doc['actions']['edit']);self.assertFalse(doc['actions']['approve'])
        self.assertEqual(doc['purpose_ar'],'التشغيل الآمن');self.assertEqual(doc['kpis'][0]['weight'],100)
        for secret in ('grade_band','salary','user','audit_json'):self.assertNotIn(secret,doc)
        self.assertNotIn('parent',doc['kpis'][0])
        clean={key:doc.get(key) or ([] if key in api.TABLES else '') for key in api.EDITABLE}
        self.call('save',position=self.f.positions[0],payload=json.loads(frappe.as_json(clean)),name=saved['name'],
            expected_version=saved['modified'],command_id=uuid.uuid4().hex)
        self.assertEqual(len(self.call('listing',position=self.f.positions[1])['rows']),1)

    def test_idempotent_save_and_payload_mismatch(self):
        args=dict(position=self.f.positions[0],payload=self.payload,command_id=uuid.uuid4().hex)
        a=self.call('save',**args);self.assertEqual(a,self.call('save',**args))
        args['payload']=dict(self.payload,purpose='Changed')
        with self.assertRaises(frappe.ValidationError):self.call('save',**args)
        self.assertEqual(frappe.db.count(api.DT,{'position':self.f.positions[0]}),1)

    def test_independent_approval_immutable_and_receipt(self):
        a=self.save();args=dict(name=a['name'],expected_version=a['modified'],command_id=uuid.uuid4().hex)
        with self.assertRaises(frappe.PermissionError):self.call('approve',**args)
        approved=self.call('approve',role='sector',**args)
        self.assertEqual(approved,self.call('approve',role='sector',**args));self.assertEqual(approved['revision'],1)
        with self.assertRaises(frappe.PermissionError):self.save(name=a['name'],expected_version=approved['modified'])
        with acting_as(self.f.users['hr']),self.assertRaises(frappe.ValidationError):
            doc=frappe.get_doc(api.DT,a['name']);doc.purpose='Bypass';doc.save()
        self.assertEqual(frappe.db.count('Kandil Command Audit',{'target_name':a['name'],'operation':'approve_revision'}),1)

    def test_author_cannot_approve_even_with_reviewer_role(self):
        a=self.save();u=frappe.get_doc('User',self.f.users['hr']);u.append('roles',{'role':'Kandil Sector Approver'});u.save(ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):self.call('approve',name=a['name'],expected_version=a['modified'],command_id=uuid.uuid4().hex)

    def test_edit_requires_author_and_current_version(self):
        a=self.save();self.payload['purpose']='Updated safely'
        with self.assertRaises(frappe.PermissionError):self.call('save',role='sector',position=self.f.positions[0],payload=self.payload,
            name=a['name'],expected_version=a['modified'],command_id=uuid.uuid4().hex)
        edited=self.save(name=a['name'],expected_version=a['modified'])
        with self.assertRaises(frappe.TimestampMismatchError):self.save(name=a['name'],expected_version=a['modified'])
        with self.assertRaises(frappe.TimestampMismatchError):self.call('approve',role='sector',name=a['name'],expected_version=a['modified'],command_id=uuid.uuid4().hex)
        self.assertNotEqual(a['modified'],edited['modified'])

    def test_version_chain_and_competing_successor(self):
        first=self.save();approved=self.call('approve',role='sector',name=first['name'],expected_version=first['modified'],command_id=uuid.uuid4().hex)
        self.payload['valid_from']=add_days(today(),1)
        second=self.save(supersedes=first['name']);other=self.save(supersedes=first['name'])
        self.assertEqual(self.call('approve',role='sector',name=second['name'],expected_version=second['modified'],command_id=uuid.uuid4().hex)['revision'],2)
        with self.assertRaises(frappe.ValidationError):self.call('approve',role='sector',name=other['name'],expected_version=other['modified'],command_id=uuid.uuid4().hex)
        self.assertEqual(frappe.db.get_value(api.DT,first['name'],'revision'),1)

    def test_invalid_weights_bounds_and_protected_fields(self):
        bad=[dict(self.payload,status='Approved'),dict(self.payload,purpose='x'*12001),dict(self.payload,responsibility_rows=[]),
             dict(self.payload,kpis=[dict(indicator='Bad',kind='Weighted',weight=50,formula='x',frequency='Day')]),
             dict(self.payload,kpis=[dict(indicator='Bad',kind='Monitoring',weight=1,formula='x',frequency='Day')]),
             dict(self.payload,competencies=[dict(name='forged')]),dict(self.payload,valid_from='2026-02-31')]
        for payload in bad:
            with self.subTest(payload=str(payload)[:40]),self.assertRaises(frappe.ValidationError):
                self.call('save',position=self.f.positions[0],payload=payload,command_id=uuid.uuid4().hex)
        self.assertEqual(frappe.db.count(api.DT,{'position':self.f.positions[0]}),0)

    def test_department_scope_can_read_but_not_write(self):
        a=self.save()
        self.assertEqual(self.call('detail',role='manager',name=a['name'])['name'],a['name'])
        self.assertFalse(self.call('detail',role='manager',name=a['name'])['actions']['edit'])
        with self.assertRaises(frappe.PermissionError):self.call('save',role='manager',position=self.f.positions[0],payload=self.payload,command_id=uuid.uuid4().hex)
        with self.assertRaises(frappe.PermissionError):self.call('detail',role='requester',name=a['name'])

    def test_revocation_denies_receipt_replay(self):
        key=uuid.uuid4().hex;args=dict(position=self.f.positions[0],payload=self.payload,command_id=key)
        a=self.call('save',**args)
        for name in frappe.get_all('Kandil Access Grant',filters={'user':self.f.users['hr']},pluck='name'):
            doc=frappe.get_doc('Kandil Access Grant',name);doc.revoked=1;doc.save(ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):self.call('save',**args)
        with self.assertRaises(frappe.PermissionError):self.call('detail',name=a['name'])
        self.assertEqual(self.call('listing')['rows'],[])

    def test_guest_and_disabled_account(self):
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError):api.listing()
        user=frappe.get_doc('User',self.f.users['hr']);user.enabled=0;user.save(ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):self.call('positions')

    def test_document_escaping_and_native_print_gate(self):
        from kandil_hr.organization import documents
        self.payload['purpose']='<img src=x onerror=alert(1)> Safe';a=self.save()
        with acting_as(self.f.users['hr']):
            rendered=documents.render(a['name'],language='ar',kind='worker')
            self.assertNotIn('onerror',str(rendered));self.assertIn('بطاقة العامل',str(rendered))
        with acting_as(self.f.users['requester']),self.assertRaises(frappe.PermissionError):documents.load(a['name'])

    def test_native_status_bypass_blocked_and_audit_saved(self):
        a=self.save()
        with acting_as(self.f.users['hr']),self.assertRaises(frappe.ValidationError):
            doc=frappe.get_doc(api.DT,a['name']);doc.status='Approved';doc.save()
        self.assertEqual(frappe.db.get_value(api.DT,a['name'],'status'),'Draft')
        self.assertEqual(frappe.db.count('Kandil Command Audit',{'target_name':a['name'],'operation':'portal_create_jd'}),1)


def run():
    from kandil_hr.foundation.concurrency_runner import _guard
    from kandil_hr.foundation.tests_runner import RecordedResult
    _guard();suite=unittest.defaultTestLoader.loadTestsFromTestCase(TestJobDescriptions)
    result=unittest.TextTestRunner(verbosity=2,resultclass=RecordedResult).run(suite)
    return dict(result='PASS' if result.wasSuccessful() and not result.skipped and result.testsRun==12 else 'FAIL',
        total=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),tests=result.checks,
        limits=['Rolled-back synthetic native roles; HTTP/browser evidence is separate.'])
