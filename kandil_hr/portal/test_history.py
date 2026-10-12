"""Ordinary-role history proof with real commands and rollback-scoped cohorts."""
import json
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.utils import today, add_days
from kandil_hr.portal import history
from kandil_hr.portal.test_job_descriptions import TestJobDescriptions
from kandil_hr.organization.test_assignment_changes import TestAssignmentChanges
from kandil_hr.recruitment.test_commands import acting_as


class TestJDHistory(unittest.TestCase):
    def setUp(self):
        self.base=TestJobDescriptions();self.addCleanup(self.base.doCleanups);self.base.setUp();self.f=self.base.f

    def call(self,method,role='hr',**args):
        with acting_as(self.f.users[role]):return getattr(history,method)(**args)

    def test_saved_edits_have_exact_immutable_differences_and_actor(self):
        a=self.base.save();self.base.payload['purpose']='Changed once';b=self.base.save(name=a['name'],expected_version=a['modified'])
        events=self.call('events',kind='jd',name=a['name']);self.assertEqual(len(events['rows']),2)
        event=next(r for r in events['rows'] if r['operation']=='portal_save_jd')
        detail=self.call('event',kind='jd',name=a['name'],event_id=event['name'])
        change=next(r for r in detail['changes'] if r['field']=='purpose')
        self.assertEqual(change,dict(field='purpose',before='Safe operation',after='Changed once'))
        self.assertEqual(detail['event']['actor'],self.f.users['hr'])
        self.base.payload['purpose']='Changed again';self.base.save(name=a['name'],expected_version=b['modified'])
        self.assertEqual(detail,self.call('event',kind='jd',name=a['name'],event_id=event['name']))

    def test_revision_compare_preserves_children_and_removes_sensitive_fields(self):
        a=self.base.save();self.base.call('approve',role='sector',name=a['name'],expected_version=a['modified'],command_id=uuid.uuid4().hex)
        self.base.payload.update(valid_from=add_days(today(),1),purpose_ar='هدف الإصدار الثاني')
        self.base.payload['kpis']=[dict(indicator='Safety',kind='Weighted',weight=100,formula='Safe / Total',frequency='Day')]
        b=self.base.save(supersedes=a['name'])
        comparison=self.call('compare',name=b['name'],other=a['name'])
        self.assertEqual(comparison['before']['name'],a['name']);self.assertEqual(comparison['after']['name'],b['name'])
        self.assertIn('kpis',[r['field'] for r in comparison['changes']]);self.assertIn('purpose_ar',[r['field'] for r in comparison['changes']])
        raw=json.dumps(comparison,default=str)
        for key in ('grade_band','salary','envelope_json','command_id','receipt_key','parenttype'):self.assertNotIn(key,raw)
        revisions=self.call('revisions',name=b['name'],page_length=1);self.assertEqual(len(revisions['rows']),1);self.assertTrue(revisions['has_more'])

    def test_pagination_and_event_target_confusion_denied(self):
        a=self.base.save();b=self.base.save()
        event=self.call('events',kind='jd',name=b['name'])['rows'][0]
        with self.assertRaises(frappe.PermissionError):self.call('event',kind='jd',name=a['name'],event_id=event['name'])
        self.base.payload['purpose']='Second event';self.base.save(name=a['name'],expected_version=a['modified'])
        first=self.call('events',kind='jd',name=a['name'],page_length=1)
        second=self.call('events',kind='jd',name=a['name'],page_length=1,start=first['next_start'])
        self.assertTrue(first['has_more']);self.assertNotEqual(first['rows'][0]['name'],second['rows'][0]['name'])
        self.assertNotIn('envelope_json',first['rows'][0])

    def test_hidden_anchor_and_revocation_block_history_and_comparison(self):
        a=self.base.save();hidden=self.base.call('save',position=self.f.positions[1],payload=self.base.payload,command_id=uuid.uuid4().hex)
        for name in frappe.get_all('Kandil Access Grant',filters={'user':self.f.users['hr']},pluck='name'):
            grant=frappe.get_doc('Kandil Access Grant',name);grant.revoked=1;grant.save(ignore_permissions=True)
        branch=frappe.db.get_value('Kandil Position',self.f.positions[0],'branch')
        grant=self.f.insert('Kandil Access Grant',company=self.f.company,department=self.f.department,branch=branch,
            user=self.f.users['hr'],valid_from=today(),can_manage_recruitment=1,reason='Synthetic history branch scope')
        self.assertNotIn(hidden['name'],[r['name'] for r in self.call('revisions',name=a['name'])['rows']])
        with self.assertRaises(frappe.PermissionError):self.call('compare',name=a['name'],other=hidden['name'])
        with self.assertRaises(frappe.PermissionError):self.call('events',kind='jd',name=hidden['name'])
        event=self.call('events',kind='jd',name=a['name'])['rows'][0]
        grant.revoked=1;grant.save(ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):self.call('event',kind='jd',name=a['name'],event_id=event['name'])

    def test_guest_disabled_and_unprivileged_rejected_no_audit_writes(self):
        a=self.base.save();count=frappe.db.count(history.AUDIT)
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError):history.events('jd',a['name'])
        with self.assertRaises(frappe.PermissionError):self.call('events',role='requester',kind='jd',name=a['name'])
        user=frappe.get_doc('User',self.f.users['hr']);user.enabled=0;user.save(ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):self.call('events',kind='jd',name=a['name'])
        self.assertEqual(count,frappe.db.count(history.AUDIT))

    def test_compare_rejects_different_job_even_with_current_scope(self):
        a=self.base.save()
        # Native fixture record establishes a different readable job; it must not
        # become a valid comparison merely because both records are readable.
        other_job=self.f.insert('Designation',designation_name=self.f.prefix+'-other-history-job')
        from kandil_hr.organization.api import transition
        with transition():
            position=self.f.insert('Kandil Position',company=self.f.company,department=self.f.department,
                designation=other_job.name,position_code=self.f.prefix+'-history-job',title='Other history job')
        b=self.base.call('save',position=position.name,payload=self.base.payload,command_id=uuid.uuid4().hex)
        with self.assertRaises(frappe.PermissionError):self.call('compare',name=a['name'],other=b['name'])


class TestStructureHistory(unittest.TestCase):
    def setUp(self):
        self.base=TestAssignmentChanges();self.addCleanup(self.base.doCleanups);self.base.setUp();self.f=self.base.f

    def call(self,method,role='manager',**args):
        with acting_as(self.f.users[role]):return getattr(history,method)(**args)

    def final_event(self,doc):
        events=self.call('events',kind='structure',name=doc.name)['rows']
        event=next(r for r in events if r['operation']=='decide' and r['actor']==self.f.users['sector'])
        return self.call('event',kind='structure',name=doc.name,event_id=event['name'])

    def test_assignment_approval_diff_exact_and_excludes_unrelated_baseline(self):
        doc=self.base.applied();detail=self.final_event(doc)
        steps=next(r for r in detail['changes'] if r['field']=='approval_steps')
        self.assertEqual(steps['after'][-1]['decision'],'Approved')
        assignment=next(r for r in detail['related']['rows'] if r['doctype']=='Kandil Position Assignment')
        self.assertFalse(assignment['before_captured']);self.assertTrue(assignment['after_captured'])
        self.assertEqual(next(r['after'] for r in assignment['changes'] if r['field']=='employee'),self.base.employee.name)
        self.assertTrue(all(r['position']==self.f.positions[0] for r in detail['related']['rows']))
        for key in ('user','remarks','envelope_json','route_snapshot','snapshot_hash','grade_band'):
            self.assertNotIn('"'+key+'"',json.dumps(detail,default=str))

    def test_transfer_history_keeps_dates_after_later_end(self):
        self.base.applied();source=self.base.assignment()
        move=self.base.applied(dict(action='MoveEmployee',position=source.position,assignment=source.name,target_position=self.f.positions[1]),add_days(today(),2))
        detail=self.final_event(move)
        old=next(r for r in detail['related']['rows'] if r['name']==source.name)
        self.assertEqual(next(r['after'] for r in old['changes'] if r['field']=='valid_until'),str(add_days(today(),1)))
        target=frappe.get_doc('Kandil Position Assignment',{'employee':self.base.employee.name,'position':self.f.positions[1]})
        self.base.applied(dict(action='EndAssignment',position=target.position,assignment=target.name),add_days(today(),3))
        self.assertEqual(detail,self.final_event(move))

    def test_native_employee_restriction_redacts_history_identity(self):
        doc=self.base.applied()
        original=frappe.model.document.Document.has_permission
        def permission(record,*args,**kwargs):
            if record.doctype=='Employee':return False
            return original(record,*args,**kwargs)
        with patch('frappe.model.document.Document.has_permission',permission):
            detail=self.final_event(doc)
        self.assertNotIn(self.base.employee.name,json.dumps(detail,default=str))

    def test_actual_employee_user_permission_cannot_be_bypassed_by_history(self):
        doc=self.base.applied()
        own=frappe.db.get_value('Employee',{'user_id':self.f.users['manager']},'name')
        self.assertTrue(own)
        self.f.insert('User Permission',user=self.f.users['manager'],allow='Employee',for_value=own,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['manager'])
        with acting_as(self.f.users['manager']):
            self.assertFalse(frappe.get_doc('Employee',self.base.employee.name).has_permission('read'))
        detail=self.final_event(doc)
        self.assertNotIn(self.base.employee.name,json.dumps(detail,default=str))

    def test_rejected_and_returned_events_do_not_claim_application(self):
        doc=self.base.pending();self.base.decide(doc,decision='Returned')
        events=self.call('events',kind='structure',name=doc.name)['rows']
        returned=next(r for r in events if r['operation']=='decide')
        detail=self.call('event',kind='structure',name=doc.name,event_id=returned['name'])
        self.assertEqual(next(r['after'] for r in detail['changes'] if r['field']=='status'),'Returned')
        self.assertEqual(detail['related']['rows'],[])
        self.assertFalse(frappe.db.exists('Kandil Position Assignment',{'employee':self.base.employee.name}))

    def test_resize_history_is_frozen_and_related_pages_are_bounded(self):
        structure=self.base.base
        doc=structure.pending();structure.decide(doc);structure.decide(doc,'sector')
        record=frappe.get_doc('Kandil Structure Change',doc['name']);detail=self.final_event(record)
        position=next(r for r in detail['related']['rows'] if r['doctype']=='Kandil Position')
        change=next(r for r in position['changes'] if r['field']=='structural')
        self.assertEqual(change['before'],structure.seats);self.assertEqual(change['after'],structure.seats+1)
        first=self.call('event',kind='structure',name=record.name,event_id=detail['event']['name'],page_length=1)
        self.assertEqual(len(first['related']['rows']),1);self.assertTrue(first['related']['has_more'])
        next_page=self.call('event',kind='structure',name=record.name,event_id=detail['event']['name'],page_length=1,related_start=first['related']['next_start'])
        self.assertNotEqual(first['related']['rows'][0]['name'],next_page['related']['rows'][0]['name'])
        payload=dict(structure.payload,operations=[dict(action='Resize',position=self.f.positions[0],structural=structure.seats+2)])
        later=structure.pending(payload);structure.decide(later);structure.decide(later,'sector')
        self.assertEqual(detail,self.final_event(record))

    def test_unreadable_assignment_reference_is_hidden(self):
        self.base.applied();source=self.base.assignment()
        doc=self.base.applied(dict(action='MoveEmployee',position=source.position,assignment=source.name,target_position=self.f.positions[1]),add_days(today(),2))
        original=frappe.model.document.Document.has_permission
        def permission(record,*args,**kwargs):
            if record.doctype=='Kandil Position Assignment':return False
            return original(record,*args,**kwargs)
        with patch('frappe.model.document.Document.has_permission',permission):
            events=self.call('events',kind='structure',name=doc.name)['rows']
            detail=self.call('event',kind='structure',name=doc.name,event_id=next(r['name'] for r in events if r['operation']=='submit'))
        self.assertNotIn(source.name,json.dumps(detail,default=str))

    def test_structure_requires_whole_company_access(self):
        doc=self.base.applied()
        with self.assertRaises(frappe.PermissionError):self.call('events',role='requester',kind='structure',name=doc.name)
        first=self.call('events',kind='structure',name=doc.name,page_length=1)
        self.assertTrue(first['has_more']);self.assertEqual(len(first['rows']),1)


def run():
    from kandil_hr.foundation.concurrency_runner import _guard
    from kandil_hr.foundation.tests_runner import RecordedResult
    _guard();suite=unittest.TestSuite(unittest.defaultTestLoader.loadTestsFromTestCase(c) for c in (TestJDHistory,TestStructureHistory))
    result=unittest.TextTestRunner(verbosity=2,resultclass=RecordedResult).run(suite)
    return dict(result='PASS' if result.wasSuccessful() and not result.skipped and result.testsRun==14 else 'FAIL',
        total=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),tests=result.checks,
        limits=['Rolled-back ordinary-role history proof; HTTP/browser and sustained load are separate.'])
