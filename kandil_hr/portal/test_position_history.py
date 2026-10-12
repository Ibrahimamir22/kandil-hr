"""Indexed position history with real reviewed sources and rollback fixtures."""
import json
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.utils import today, add_days

from kandil_hr.foundation import position_history_index as index
from kandil_hr.portal import history, position_history
from kandil_hr.portal.test_imports import TestImportPortal, csv_text
from kandil_hr.organization.test_assignment_changes import TestAssignmentChanges
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.test_joining import TestJoining
from kandil_hr.recruitment import joining_corrections


class TestPositionHistory(unittest.TestCase):
    def setUp(self):
        self.base=TestImportPortal();self.addCleanup(self.base.doCleanups);self.base.setUp();self.f=self.base.f

    def call(self, method, role='hr', **args):
        with acting_as(self.f.users[role]):return getattr(history,method)(kind='position',**args)

    def imported(self, args=None):
        doc=self.base.reviewed(args)
        self.base.call('apply',name=doc['name'],expected_version=doc['modified'],reviewed_digest=doc['digest'],command_id=uuid.uuid4().hex)
        return doc

    def test_import_review_apply_and_structural_events_share_position_timeline(self):
        doc=self.imported();name=self.f.prefix+'-IMPORT'
        rows=self.call('events',name=name)['rows']
        self.assertEqual({r['operation'] for r in rows},{'review_import','apply_import'})
        self.assertTrue(all(r['target_name']==doc['name'] for r in rows))
        detail=self.call('event',name=name,event_id=next(r['name'] for r in rows if r['operation']=='apply_import'))
        position=next(r for r in detail['related']['rows'] if r['doctype']=='Kandil Position')
        self.assertFalse(position['before_captured']);self.assertTrue(position['after_captured'])
        self.assertEqual(next(r['after'] for r in position['changes'] if r['field']=='structural'),2)
        base=self.base.base
        proposed=base.pending(dict(base.payload,operations=[dict(action='Resize',position=name,structural=3)]))
        base.decide(proposed);base.decide(proposed,'sector')
        current=self.call('events',name=name)['rows']
        self.assertEqual({r['target_doctype'] for r in current},{'Kandil Structure Change','Kandil Organization Import'})
        self.assertEqual(detail,self.call('event',name=name,event_id=detail['event']['name']))
        raw=json.dumps(detail,default=str)
        for word in ('rows_json','preview_json','result_json','envelope_json','payload_json','salary','grade_band','snapshot_hash'):self.assertNotIn(word,raw)

    def test_index_repair_idempotence_and_immutability(self):
        doc=self.imported();audits=frappe.get_all(history.AUDIT,filters={'target_name':doc['name']},pluck='name')
        for event in audits:
            audit=frappe.get_doc(history.AUDIT,event);before=audit.as_json()
            self.assertEqual(index.index_event(audit),0)
            frappe.db.delete(index.DT,{'audit':event}) # Only rollback fixture links, to test rebuild.
            self.assertEqual(index.index_event(audit),1);self.assertEqual(index.index_event(audit),0)
            self.assertEqual(before,frappe.get_doc(history.AUDIT,event).as_json())
        link=frappe.get_doc(index.DT,{'audit':audits[0]})
        with self.assertRaises(frappe.PermissionError):link.save(ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):frappe.delete_doc(index.DT,link.name,ignore_permissions=True)
        with acting_as(self.f.users['hr']):
            self.assertFalse(frappe.get_doc(index.DT,link.name).has_permission('read'))
            try: visible=frappe.get_list(index.DT,fields=['name'])
            except frappe.PermissionError: visible=[]
            self.assertEqual(visible,[])

    def test_source_scope_required_even_when_position_remains_readable(self):
        self.imported();name=self.f.prefix+'-IMPORT';event=self.call('events',name=name)['rows'][0]['name']
        for row in frappe.get_all('Kandil Access Grant',filters={'user':self.f.users['hr'],'department':['is','not set']},pluck='name'):
            grant=frappe.get_doc('Kandil Access Grant',row);grant.revoked=1;grant.save(ignore_permissions=True)
        self.assertEqual(position_history.position_record(name).name,name)
        self.assertEqual(self.call('events',name=name)['rows'],[])
        with self.assertRaises(frappe.PermissionError):self.call('event',name=name,event_id=event)

    def test_position_source_confusion_and_corrupt_lookup_do_not_grant_access(self):
        self.imported();name=self.f.prefix+'-IMPORT';event=self.call('events',name=name)['rows'][0]['name']
        with self.assertRaises(frappe.PermissionError):self.call('event',name=self.f.positions[0],event_id=event)
        link=frappe.db.get_value(index.DT,{'audit':event,'position':name},'name')
        frappe.db.set_value(index.DT,link,'position',self.f.positions[0])
        with self.assertRaises(frappe.PermissionError):self.call('event',name=self.f.positions[0],event_id=event)
        frappe.db.set_value(index.DT,link,{'position':name,'source_hash':'wrong'})
        with self.assertRaises(frappe.PermissionError):self.call('event',name=name,event_id=event)

    def test_bounded_pages_and_no_reads_mutating_audit_or_capacity(self):
        self.imported();name=self.f.prefix+'-IMPORT'
        before=(frappe.db.count(history.AUDIT),frappe.db.count(index.DT),[frappe.as_json(frappe.get_doc('Kandil Capacity',c)) for c in self.f.capacities])
        first=self.call('events',name=name,page_length=1);second=self.call('events',name=name,page_length=1,start=first['next_start'])
        self.assertTrue(first['has_more']);self.assertNotEqual(first['rows'][0]['name'],second['rows'][0]['name']);self.assertFalse(second['has_more'])
        self.call('event',name=name,event_id=first['rows'][0]['name'])
        after=(frappe.db.count(history.AUDIT),frappe.db.count(index.DT),[frappe.as_json(frappe.get_doc('Kandil Capacity',c)) for c in self.f.capacities])
        self.assertEqual(before,after)

    def test_current_native_position_permission_guest_disabled_and_unprivileged(self):
        self.imported();name=self.f.prefix+'-IMPORT'
        self.assertEqual(self.call('events',role='requester',name=name)['rows'],[])
        self.f.insert('User Permission',user=self.f.users['hr'],allow='Kandil Position',for_value=self.f.positions[0],apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['hr'])
        with self.assertRaises(frappe.PermissionError):self.call('events',name=name)
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError):history.events('position',name)
        user=frappe.get_doc('User',self.f.users['hr']);user.enabled=0;user.save(ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):self.call('events',name=self.f.positions[0])

    def test_index_failure_rolls_back_review_with_its_audit(self):
        doc=self.base.draft();count=frappe.db.count(history.AUDIT)
        with self.f.rejected(exception=RuntimeError),patch.object(index,'index_event',side_effect=RuntimeError('synthetic index failure')):
            self.base.call('review','sector',name=doc['name'],expected_version=doc['modified'],command_id=uuid.uuid4().hex)
        self.assertEqual(frappe.db.get_value('Kandil Organization Import',doc['name'],'status'),'Draft')
        self.assertEqual(frappe.db.count(history.AUDIT),count)

    def test_missing_schema_does_not_break_other_site_commands_and_timeline_fails_explicitly(self):
        with patch.object(frappe.db,'table_exists',return_value=False):
            self.assertEqual(index.index_event(None),0)
            with self.assertRaises(frappe.ValidationError):self.call('events',name=self.f.positions[0])

    def test_imported_assignment_redacts_employee_under_native_user_permission(self):
        employee=self.f.insert('Employee',first_name='Synthetic timeline assignee',gender='Male',date_of_birth='1990-01-01',date_of_joining=today(),company=self.f.company,department=self.f.department,status='Active')
        args=dict(self.base.args,import_kind='Assignments',csv_text=csv_text([dict(position=self.f.positions[0],employee=employee.name,valid_from=today())]))
        self.imported(args);event=next(e for e in self.call('events',name=self.f.positions[0])['rows'] if e['operation']=='apply_import')
        own=frappe.db.get_value('Employee',{'user_id':self.f.users['manager']},'name')
        self.f.insert('User Permission',user=self.f.users['hr'],allow='Employee',for_value=own,apply_to_all_doctypes=1);frappe.clear_cache(user=self.f.users['hr'])
        detail=self.call('event',name=self.f.positions[0],event_id=event['name'])
        self.assertNotIn(employee.name,json.dumps(detail,default=str))

    def joining(self):
        j=TestJoining();j.f=self.f;j.name,j.opening,j.vacancies=self.f.vacancy_fixture();j.openings=[r.job_opening for r in self.f.load(j.name).lines]
        for opening in j.openings:
            self.f.call('hr',j.vacancies.assign_team,j.name,opening_name=opening,lead=self.f.users['hr'],members=[],reason='Synthetic timeline team')
            self.f.call('hr',j.vacancies.set_state,j.name,opening_name=opening,action='Open',reason='Synthetic timeline intake')
        return j

    def test_joining_and_void_keep_original_captures_and_omit_personal_payload(self):
        j=self.joining();offer=j.offer();joined=j.outcome(offer);position=self.f.positions[0]
        event=next(e for e in self.call('events',name=position)['rows'] if e['operation']=='record_outcome')
        before=self.call('event',name=position,event_id=event['name'])
        self.assertTrue(any(r['doctype']=='Kandil Position Assignment' for r in before['related']['rows']))
        self.f.call('hr',joining_corrections.void_joining,j.name,offer_name=offer,reason='Synthetic incorrect recorded joining')
        self.assertEqual(before,self.call('event',name=position,event_id=event['name']))
        void=next(e for e in self.call('events',name=position)['rows'] if e['operation']=='void_joining')
        detail=self.call('event',name=position,event_id=void['name'])
        self.assertTrue(any(c['field']=='is_voided' and c['after'] for r in detail['related']['rows'] for c in r['changes']))
        self.assertTrue(all(r['position']==position for r in detail['related']['rows']))
        for word in ('date_of_birth','gender','personal_email','cell_number','applicant_name','payload','onboarding','salary'):
            self.assertNotIn(word,json.dumps(detail,default=str))
        self.f.ledger((0,0),(2,1),(0,0))

    def test_no_show_has_destination_association_without_fabricated_assignment(self):
        j=self.joining();j.outcome(j.offer(),outcome='No Show',reason='Synthetic no show')
        event=next(e for e in self.call('events',name=self.f.positions[0])['rows'] if e['operation']=='record_outcome')
        detail=self.call('event',name=self.f.positions[0],event_id=event['name'])
        self.assertFalse(any(r['doctype']=='Kandil Position Assignment' for r in detail['related']['rows']))
        self.assertFalse(any(e['operation']=='record_outcome' for e in self.call('events',name=self.f.positions[1])['rows']))


class TestMovedPositionHistory(unittest.TestCase):
    def test_move_projects_each_position_separately_and_later_end_preserves_history(self):
        base=TestAssignmentChanges();self.addCleanup(base.doCleanups);base.setUp();base.applied();source=base.assignment()
        move=base.applied(dict(action='MoveEmployee',position=source.position,assignment=source.name,target_position=base.f.positions[1]),add_days(today(),2))
        with acting_as(base.f.users['manager']):
            snapshots=[]
            for position in base.f.positions:
                event=next(e for e in history.events('position',position)['rows'] if e['target_name']==move.name and e['operation']=='decide')
                detail=history.event('position',position,event['name']);snapshots.append((position,event['name'],detail))
                self.assertTrue(all(r['position']==position for r in detail['related']['rows']))
        target=frappe.get_doc('Kandil Position Assignment',{'employee':base.employee.name,'position':base.f.positions[1]})
        base.applied(dict(action='EndAssignment',position=target.position,assignment=target.name),add_days(today(),3))
        with acting_as(base.f.users['manager']):
            for position,event,expected in snapshots:self.assertEqual(expected,history.event('position',position,event))


def run():
    from kandil_hr.foundation.concurrency_runner import _guard
    from kandil_hr.foundation.tests_runner import RecordedResult
    _guard()
    suite=unittest.TestSuite(unittest.defaultTestLoader.loadTestsFromTestCase(c) for c in (TestPositionHistory,TestMovedPositionHistory))
    result=unittest.TextTestRunner(verbosity=2,resultclass=RecordedResult).run(suite)
    return dict(result='PASS' if result.wasSuccessful() and not result.skipped and result.testsRun==12 else 'FAIL',
                total=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),tests=result.checks,
                limits=['Rollback-scoped native commands; independent HTTP/AR/EN and sustained-load/security acceptance remain separate.'])
