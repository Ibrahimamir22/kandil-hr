"""Rollback-scoped ordinary-role structural portal command proof."""
import json
import unittest
import uuid

import frappe
from frappe.utils import add_days, today

from kandil_hr.organization import api as domain
from kandil_hr.portal import structure as api
from kandil_hr.portal.test_organization import TestOrganizationPortal
from kandil_hr.recruitment.test_commands import acting_as


class TestStructurePortal(unittest.TestCase):
    def setUp(self):
        self.base=TestOrganizationPortal();self.addCleanup(self.base.doCleanups);self.base.setUp();self.f=self.base.f
        for role in ('manager','hr','sector'):
            self.f.insert('Kandil Access Grant',company=self.f.company,user=self.f.users[role],valid_from=today(),can_manage_recruitment=1,reason='Synthetic structural authority')
        account=frappe.get_doc('User',self.f.users['sector']);account.append('roles',{'role':'Kandil CEO Approver'});account.save(ignore_permissions=True)
        settings=frappe.get_doc('Kandil Organization Settings',self.f.company);settings.ceo_approver=self.f.users['sector'];settings.save(ignore_permissions=True)
        self.seats=frappe.db.get_value('Kandil Position',self.f.positions[0],'structural')
        self.payload=dict(company=self.f.company,effective_on=today(),reason='Synthetic reviewed capacity requirement',operations=[dict(action='Resize',position=self.f.positions[0],structural=self.seats+1)])

    def call(self,method,role='manager',**kwargs):
        with acting_as(self.f.users[role]):return getattr(api,method)(**kwargs)

    def denied(self,method,role='manager',**kwargs):
        point='denied_'+uuid.uuid4().hex;frappe.db.savepoint(point)
        try:
            with self.assertRaises((frappe.ValidationError,frappe.PermissionError,frappe.TimestampMismatchError)):
                self.call(method,role,**kwargs)
        finally:frappe.db.rollback(save_point=point)

    def draft(self,payload=None):
        return self.call('save',payload=payload or self.payload,command_id=uuid.uuid4().hex)

    def prepared(self,payload=None):
        draft=self.draft(payload);return self.call('preview',name=draft['name'],expected_version=draft['modified'],command_id=uuid.uuid4().hex)

    def pending(self,payload=None):
        preview=self.prepared(payload)
        self.call('submit',name=preview['name'],preview_hash=preview['preview_hash'],expected_version=preview['modified'],command_id=uuid.uuid4().hex)
        return self.call('detail',name=preview['name'])

    def decide(self,doc,role='hr',decision='Approved',comment='Reviewed synthetic change'):
        current=self.call('detail',role,name=doc['name'])
        args=dict(name=current['name'],expected_version=current['modified'],preview_hash=current['preview_hash'],step_id=current['actions']['step_id'],command_id=uuid.uuid4().hex,decision=decision,comment=comment)
        return self.call('decide',role,**args),args

    def test_draft_and_preview_replay_version_and_changed_payload(self):
        args=dict(payload=self.payload,command_id=uuid.uuid4().hex)
        first=self.call('save',**args);self.assertEqual(first,self.call('save',**args))
        self.denied('save',**{**args,'payload':{**self.payload,'reason':'Changed command input'}})
        self.assertEqual(frappe.db.count('Kandil Structure Change',{'name':first['name']}),1)
        pa=dict(name=first['name'],expected_version=first['modified'],command_id=uuid.uuid4().hex)
        preview=self.call('preview',**pa);self.assertEqual(preview,self.call('preview',**pa))
        self.assertNotIn('reconciliation',preview);self.assertNotIn('hierarchy',preview)
        self.assertEqual(preview['review'][0]['before']['structural'],self.seats)
        self.denied('save',payload=self.payload,name=first['name'],expected_version=first['modified'],command_id=uuid.uuid4().hex)

    def test_independent_chain_replay_and_exact_capacity_change(self):
        doc=self.pending();self.assertEqual([s['authority'] for s in doc['steps']],['HR Approval','CEO Approval'])
        self.assertFalse(doc['actions']['decide'])
        args=dict(name=doc['name'],preview_hash=doc['preview_hash'],step_id=doc['steps'][0]['step_key'],expected_version=doc['modified'],command_id=uuid.uuid4().hex,decision='Approved')
        self.denied('decide',**args);self.denied('decide',role='sector',**args)
        first,args=self.decide(doc);self.assertEqual(first,self.call('decide','hr',**args))
        self.assertEqual(frappe.db.get_value('Kandil Capacity',self.f.capacities[0],'structural'),self.seats)
        final,args=self.decide(doc,'sector');self.assertEqual(final['status'],'Approved');self.assertEqual(final,self.call('decide','sector',**args))
        self.assertEqual(frappe.db.get_value('Kandil Capacity',self.f.capacities[0],'structural'),self.seats+1)
        self.assertEqual(frappe.db.count('Kandil Command Audit',{'target_name':doc['name'],'operation':'decide'}),2)
        recorded=self.call('detail',name=doc['name'])
        self.assertEqual(recorded['review_basis'],'submitted_snapshot')
        self.assertEqual(recorded['review'][0]['before']['structural'],self.seats)
        self.assertEqual(recorded['review'][0]['operation']['structural'],self.seats+1)
        self.denied('decide','sector',**{**args,'comment':'Changed replay'})

    def test_return_revision_preserves_history_and_invalidates_old_steps(self):
        doc=self.pending();self.denied('decide','hr',name=doc['name'],expected_version=doc['modified'],preview_hash=doc['preview_hash'],step_id=doc['steps'][0]['step_key'],command_id=uuid.uuid4().hex,decision='Returned',comment=' ')
        self.decide(doc,decision='Returned',comment='Clarify the proposed seats')
        returned=self.call('detail',name=doc['name']);self.assertEqual(returned['status'],'Returned');self.assertEqual(len(returned['history']),1)
        changed={**self.payload,'reason':'Revised capacity proposal','operations':[dict(action='Resize',position=self.f.positions[0],structural=self.seats+2)]}
        self.denied('save','hr',payload=changed,name=doc['name'],expected_version=returned['modified'],command_id=uuid.uuid4().hex)
        saved=self.call('save',payload=changed,name=doc['name'],expected_version=returned['modified'],command_id=uuid.uuid4().hex)
        preview=self.call('preview',name=doc['name'],expected_version=saved['modified'],command_id=uuid.uuid4().hex)
        self.call('submit',name=doc['name'],preview_hash=preview['preview_hash'],expected_version=preview['modified'],command_id=uuid.uuid4().hex)
        current=self.call('detail',name=doc['name']);self.assertEqual(current['round'],2);self.assertEqual(current['history'][0]['operations'],self.payload['operations'])
        self.assertNotEqual(current['steps'][0]['step_key'],doc['steps'][0]['step_key'])
        self.denied('decide','hr',name=doc['name'],expected_version=current['modified'],preview_hash=current['preview_hash'],step_id=doc['steps'][0]['step_key'],command_id=uuid.uuid4().hex,decision='Approved')

    def test_rejection_keeps_capacity_and_freezes_proposal(self):
        doc=self.pending();self.decide(doc,decision='Rejected',comment='No supported business need')
        current=self.call('detail',name=doc['name']);self.assertEqual(current['status'],'Rejected');self.assertFalse(current['actions']['edit'])
        self.denied('save',payload=self.payload,name=doc['name'],expected_version=current['modified'],command_id=uuid.uuid4().hex)
        self.assertEqual(frappe.db.get_value('Kandil Capacity',self.f.capacities[0],'structural'),self.seats)

    def test_department_only_requester_and_revoked_or_disabled_author(self):
        doc=self.draft()
        self.assertEqual(self.call('choices','requester')['companies'],[])
        self.denied('detail','requester',name=doc['name']);self.denied('catalog','requester',company=self.f.company,kind='department')
        self.denied('save','requester',payload=self.payload,command_id=uuid.uuid4().hex)
        for name in frappe.get_all('Kandil Access Grant',filters={'user':self.f.users['manager'],'company':self.f.company},pluck='name'):
            grant=frappe.get_doc('Kandil Access Grant',name);grant.revoked=1;grant.save(ignore_permissions=True)
        self.denied('preview',name=doc['name'],expected_version=doc['modified'],command_id=uuid.uuid4().hex)
        account=frappe.get_doc('User',self.f.users['hr']);account.enabled=0;account.save(ignore_permissions=True)
        self.denied('listing','hr')

    def test_stale_baseline_blocks_submission_and_capacity_underflow(self):
        preview=self.prepared()
        with domain.transition():
            p=frappe.get_doc('Kandil Position',self.f.positions[1]);p.title='Changed baseline';p.save(ignore_permissions=True)
        self.denied('submit',name=preview['name'],preview_hash=preview['preview_hash'],expected_version=preview['modified'],command_id=uuid.uuid4().hex)
        cap=frappe.get_doc('Kandil Capacity',self.f.capacities[0]);frappe.db.set_value(cap.doctype,cap.name,'reserved',self.seats)
        bad={**self.payload,'operations':[dict(action='Resize',position=self.f.positions[0],structural=1)]}
        self.denied('save',payload=bad,command_id=uuid.uuid4().hex)

    def test_create_and_close_without_replacing_existing_headcount(self):
        op=dict(action='Create',draft_key='new',department=self.f.department,branch=self.base.branch,designation=self.f.designation,title='Synthetic portal new seat',title_ar='منصب تجريبي جديد',authority='Department Approval',structural=2,parent_position='')
        doc=self.pending({**self.payload,'operations':[op]});self.decide(doc);self.decide(doc,'sector')
        current=self.call('detail',name=doc['name']);created=current['created_positions']['new']
        self.assertEqual(frappe.db.count('Kandil Capacity',{'position':created}),1)
        close=self.pending({**self.payload,'operations':[dict(action='Close',position=created)]});self.decide(close);self.decide(close,'sector')
        self.assertEqual(frappe.db.get_value('Kandil Position',created,'status'),'Closed')
        self.assertEqual(frappe.db.get_value('Kandil Capacity',{'position':created},'structural'),0)

    def test_future_reparent_keeps_current_reporting_and_history(self):
        future=add_days(today(),1)
        payload={**self.payload,'effective_on':future,'operations':[dict(action='Reparent',position=self.f.positions[0],parent_position='',authority='Department Approval')]}
        doc=self.pending(payload);self.decide(doc);self.decide(doc,'sector')
        self.assertEqual(domain.active_hierarchy(self.f.company,today())[self.f.positions[0]].parent_position,self.base.parent)
        self.assertFalse(domain.active_hierarchy(self.f.company,future)[self.f.positions[0]].parent_position)

    def test_input_field_allowlist_date_quantity_and_foreign_target(self):
        for operation in [dict(action='Resize',position=self.f.positions[0],structural=True),dict(action='Resize',position=self.f.positions[0],structural=2,approved_by=self.f.users['hr']),dict(action='Close',position='foreign-hidden-position')]:
            self.denied('save',payload={**self.payload,'operations':[operation]},command_id=uuid.uuid4().hex)
        self.denied('save',payload={**self.payload,'effective_on':add_days(today(),1)},command_id=uuid.uuid4().hex)
        self.denied('save',payload={**self.payload,'status':'Approved'},command_id=uuid.uuid4().hex)
        self.denied('detail',name='nonexistent')

    def test_catalog_scoped_listing_and_minimal_projection(self):
        doc=self.draft();result=self.call('detail',name=doc['name'])
        for field in ['command_history','route_snapshot','snapshot_hash']:self.assertNotIn(field,result)
        self.assertEqual(self.call('listing',company='foreign')['rows'],[])
        catalog=self.call('catalog',company=self.f.company,kind='position',search=self.f.prefix,page_length=1)
        self.assertEqual(len(catalog['rows']),1);self.assertTrue(catalog['has_more'])
        self.denied('catalog',company='foreign',kind='designation')
        for kind,reference in [('department',self.f.department),('branch',self.base.branch),('designation',self.f.designation)]:
            result=self.call('catalog',company=self.f.company,kind=kind,search=reference)
            self.assertIn(reference,[r['id'] for r in result['rows']],kind)
        with acting_as(self.f.users['manager']):
            self.assertFalse(frappe.has_permission('Branch','read'))
            self.assertFalse(frappe.has_permission('Branch','write'))
            self.assertFalse(frappe.has_permission('Designation','write'))


def run():
    from kandil_hr.foundation.concurrency_runner import _guard
    from kandil_hr.foundation.tests_runner import RecordedResult
    _guard();suite=unittest.defaultTestLoader.loadTestsFromTestCase(TestStructurePortal)
    result=unittest.TextTestRunner(verbosity=2,resultclass=RecordedResult).run(suite)
    return dict(result='PASS' if result.wasSuccessful() and not result.skipped and result.testsRun==10 else 'FAIL',total=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),tests=result.checks,
                limits=['Ordinary-role native commands with rolled-back synthetic fixtures; independent HTTP/browser/concurrency proof is separate.'])
