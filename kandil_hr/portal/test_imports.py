"""Ordinary role import adapters; isolated transaction fixtures, never production."""
import csv
import io
import json
import unittest
import uuid

import frappe
from frappe.utils import today, add_days

from kandil_hr.organization import api as domain
from kandil_hr.portal import imports as api
from kandil_hr.portal.test_structure import TestStructurePortal
from kandil_hr.recruitment.test_commands import acting_as


def csv_text(rows):
    output=io.StringIO();writer=csv.DictWriter(output,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows);return output.getvalue()


class TestImportPortal(unittest.TestCase):
    def setUp(self):
        self.base=TestStructurePortal();self.addCleanup(self.base.doCleanups);self.base.setUp();self.f=self.base.f
        self.source=csv_text([dict(position_code=self.f.prefix+'-IMPORT',title='Imported synthetic seat',title_ar='منصب تجريبي',department=self.f.department,designation=self.f.designation,structural=2)])
        self.args=dict(company=self.f.company,import_kind='Positions',csv_text=self.source,baseline_reference='Synthetic baseline')

    def call(self,method,role='hr',**args):
        with acting_as(self.f.users[role]):return getattr(api,method)(**args)

    def denied(self,method,role='hr',**args):
        point='denied_'+uuid.uuid4().hex;frappe.db.savepoint(point)
        try:
            with self.assertRaises((frappe.ValidationError,frappe.PermissionError,frappe.TimestampMismatchError)):
                self.call(method,role,**args)
        finally:frappe.db.rollback(save_point=point)

    def draft(self,args=None):
        args=args or self.args;validation=self.call('validate_csv',**args)
        return self.call('save',**args,validated_digest=validation['digest'],command_id=uuid.uuid4().hex)

    def reviewed(self,args=None):
        doc=self.draft(args);self.call('review','sector',name=doc['name'],expected_version=doc['modified'],command_id=uuid.uuid4().hex)
        return self.call('detail',name=doc['name'])

    def test_validation_does_not_save_and_all_five_schemas(self):
        before=frappe.db.count(api.DT);result=self.call('validate_csv',**self.args)
        self.assertTrue(result['valid']);self.assertEqual(result['rows'][0]['action'],'Create')
        self.assertEqual(frappe.db.count(api.DT),before)
        self.assertEqual(set(self.call('choices')['schemas']),{'Units','Jobs','Positions','Hierarchy','Assignments'})
        for args in [dict(self.args,csv_text='title\nMissing headers'),dict(self.args,csv_text=self.source.replace('Imported synthetic seat','=SUM(A1)')),dict(self.args,import_kind='User'),dict(self.args,import_kind=[]),dict(self.args,csv_text='x'*1048577)]:
            self.denied('validate_csv',**args)

    def test_validate_save_replay_changed_digest_and_stale_owner(self):
        validation=self.call('validate_csv',**self.args);args=dict(self.args,validated_digest=validation['digest'],command_id=uuid.uuid4().hex)
        doc=self.call('save',**args);self.assertEqual(doc,self.call('save',**args))
        self.denied('save',**dict(args,baseline_reference='Changed'))
        self.denied('save',**dict(args,command_id=uuid.uuid4().hex,validated_digest='forged'))
        edit=dict(args,name=doc['name'],expected_version='2000-01-01',command_id=uuid.uuid4().hex)
        self.denied('save',**edit);self.denied('save','sector',**dict(edit,expected_version=doc['modified']))

    def test_independent_review_apply_replay_freeze_and_audits(self):
        doc=self.draft();args=dict(name=doc['name'],expected_version=doc['modified'],command_id=uuid.uuid4().hex)
        self.denied('review',**args);reviewed=self.call('review','sector',**args)
        self.assertEqual(reviewed,self.call('review','sector',**args))
        detail=self.call('detail',name=doc['name']);self.assertFalse(detail['actions']['edit'])
        apply_args=dict(name=doc['name'],expected_version=detail['modified'],reviewed_digest=detail['digest'],command_id=uuid.uuid4().hex)
        self.denied('apply',**dict(apply_args,reviewed_digest='forged'))
        result=self.call('apply',**apply_args);self.assertEqual(result,self.call('apply',**apply_args))
        self.assertEqual(self.call('detail',name=doc['name'])['result']['created'],1)
        self.assertEqual(frappe.db.count('Kandil Position',{'name':self.f.prefix+'-IMPORT'}),1)
        self.assertEqual(frappe.db.count('Kandil Command Audit',{'target_name':doc['name'],'operation':'review_import'}),1)
        self.assertEqual(frappe.db.count('Kandil Command Audit',{'target_name':doc['name'],'operation':'apply_import'}),1)
        self.denied('validate_csv',**self.args,name=doc['name'],expected_version=result['modified'])

    def test_reviewer_stale_version_and_edited_draft(self):
        doc=self.draft();args=dict(self.args,baseline_reference='Revised file')
        validation=self.call('validate_csv',**args,name=doc['name'],expected_version=doc['modified'])
        saved=self.call('save',**args,name=doc['name'],expected_version=doc['modified'],validated_digest=validation['digest'],command_id=uuid.uuid4().hex)
        self.denied('review','sector',name=doc['name'],expected_version=doc['modified'],command_id=uuid.uuid4().hex)
        self.call('review','sector',name=doc['name'],expected_version=saved['modified'],command_id=uuid.uuid4().hex)

    def test_unmatched_assignment_complete_report_cannot_save(self):
        source=csv_text([dict(position=self.f.positions[0],employee='missing-person',valid_from=today()),dict(position='hidden-position',employee='missing-other',valid_from=today())])
        args=dict(self.args,import_kind='Assignments',csv_text=source);r=self.call('validate_csv',**args)
        self.assertFalse(r['valid']);self.assertEqual(r['reconciliation']['unmatched_count'],3)
        self.assertEqual([i['row'] for i in r['reconciliation']['issues']],[1,2])
        self.denied('save',**args,validated_digest=r['digest'],command_id=uuid.uuid4().hex)

    def test_employee_assignment_occupancy_and_duplicate_baseline(self):
        employee=self.f.insert('Employee',first_name='Synthetic import employee',gender='Male',date_of_birth='1990-01-01',date_of_joining=today(),company=self.f.company,department=self.f.department,status='Active')
        args=dict(self.args,import_kind='Assignments',csv_text=csv_text([dict(position=self.f.positions[0],employee=employee.name,valid_from=today())]))
        doc=self.reviewed(args);self.call('apply',name=doc['name'],expected_version=doc['modified'],reviewed_digest=doc['digest'],command_id=uuid.uuid4().hex)
        self.assertEqual(frappe.db.count('Kandil Position Assignment',{'employee':employee.name}),1)
        report=self.call('occupancy',company=self.f.company,page_length=100)
        row=next(r for r in report['rows'] if r['position']==self.f.positions[0]);self.assertEqual(row['allocated'],1)
        duplicate=self.reviewed(args);self.call('apply',name=duplicate['name'],expected_version=duplicate['modified'],reviewed_digest=duplicate['digest'],command_id=uuid.uuid4().hex)
        self.assertEqual(self.call('detail',name=duplicate['name'])['result']['unchanged'],1)
        self.assertEqual(frappe.db.count('Kandil Position Assignment',{'employee':employee.name}),1)

    def test_overlapping_assignments_and_future_baseline_rejected(self):
        employee=frappe.db.get_value('Employee',{'user_id':self.f.users['manager']},'name')
        for start in (today(),add_days(today(),1)):
            self.denied('validate_csv',**dict(self.args,import_kind='Assignments',csv_text=csv_text([dict(position=self.f.positions[0],employee=employee,valid_from=start)])))

    def test_units_jobs_hierarchy_apply_with_native_guards(self):
        for kind,row in [('Units',dict(external_code=self.f.prefix+'-UNIT',title='Synthetic import department '+self.f.prefix)),('Jobs',dict(external_code=self.f.prefix+'-JOB',title='Synthetic import job '+self.f.prefix)),('Hierarchy',dict(position=self.f.positions[0],parent_position=self.base.base.parent,authority='Department Approval',valid_from=today()))]:
            doc=self.reviewed(dict(self.args,import_kind=kind,csv_text=csv_text([row])))
            self.call('apply',name=doc['name'],expected_version=doc['modified'],reviewed_digest=doc['digest'],command_id=uuid.uuid4().hex)
            self.assertEqual(self.call('detail',name=doc['name'])['status'],'Applied')

    def test_scope_projection_pagination_revocation_and_native_bypass(self):
        doc=self.draft();self.assertEqual(self.call('listing',company='foreign')['rows'],[])
        self.denied('detail','requester',name=doc['name']);self.denied('occupancy','requester',company=self.f.company)
        self.denied('validate_csv',**dict(self.args,company='foreign'))
        detail=self.call('detail',name=doc['name'])
        for hidden in ('rows_json','preview_json','result_json'):self.assertNotIn(hidden,detail)
        self.assertEqual(len(self.call('batch_rows',name=doc['name'],page_length=1)['rows']),1)
        with acting_as(self.f.users['hr']),self.assertRaises(frappe.ValidationError):
            native=frappe.get_doc(api.DT,doc['name']);native.status='Applied';native.save()
        for grant in frappe.get_all('Kandil Access Grant',filters={'user':self.f.users['hr']},pluck='name'):
            record=frappe.get_doc('Kandil Access Grant',grant);record.revoked=1;record.save(ignore_permissions=True)
        self.denied('detail',name=doc['name']);self.assertEqual(self.call('listing')['rows'],[])

    def test_apply_revalidates_entire_batch_without_partial_writes(self):
        rows=list(csv.DictReader(io.StringIO(self.source)));rows.append({**rows[0],'position_code':self.f.prefix+'-SECOND'})
        doc=self.reviewed(dict(self.args,csv_text=csv_text(rows)))
        with domain.transition():self.f.insert('Kandil Position',company=self.f.company,department=self.f.department,designation=self.f.designation,position_code=self.f.prefix+'-SECOND',title='Conflicting live position',structural=3)
        self.denied('apply',name=doc['name'],expected_version=doc['modified'],reviewed_digest=doc['digest'],command_id=uuid.uuid4().hex)
        self.assertFalse(frappe.db.exists('Kandil Position',self.f.prefix+'-IMPORT'))
        self.assertEqual(self.call('detail',name=doc['name'])['status'],'Reviewed')


    def test_replay_cannot_bypass_revoked_grant_or_disabled_identity(self):
        validation=self.call('validate_csv',**self.args)
        args=dict(self.args,validated_digest=validation['digest'],command_id=uuid.uuid4().hex)
        self.call('save',**args)
        for name in frappe.get_all('Kandil Access Grant',filters={'user':self.f.users['hr']},pluck='name'):
            doc=frappe.get_doc('Kandil Access Grant',name);doc.revoked=1;doc.save(ignore_permissions=True)
        self.denied('save',**args)
        user=frappe.get_doc('User',self.f.users['hr']);user.enabled=0;user.save(ignore_permissions=True)
        self.denied('choices')
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError):api.choices()

    def test_pagination_preserves_all_rows_and_reconciliation_never_repairs(self):
        source=list(csv.DictReader(io.StringIO(self.source)))[0]
        args=dict(self.args,csv_text=csv_text([{**source,'position_code':self.f.prefix+'-ROW-'+str(i)} for i in range(31)]))
        doc=self.draft(args)
        first=self.call('batch_rows',name=doc['name']);second=self.call('batch_rows',name=doc['name'],start=first['next_start'])
        self.assertEqual(len(first['rows']),30);self.assertTrue(first['has_more']);self.assertEqual(second['rows'][0]['row'],31);self.assertFalse(second['has_more'])
        before=frappe.as_json(frappe.get_doc('Kandil Capacity',self.f.capacities[0]).as_dict())
        self.call('occupancy',company=self.f.company)
        self.assertEqual(before,frappe.as_json(frappe.get_doc('Kandil Capacity',self.f.capacities[0]).as_dict()))
        self.assertEqual(self.call('batch_rows',name=doc['name'],page_length=101)['next_start'],100)


    def test_changed_baseline_keeps_draft_readable_and_editable(self):
        doc=self.draft()
        with domain.transition():self.f.insert('Kandil Position',company=self.f.company,department=self.f.department,designation=self.f.designation,position_code=self.f.prefix+'-IMPORT',title='Different live position',structural=3)
        result=self.call('batch_rows',name=doc['name'])
        self.assertTrue(result['validation_error']);self.assertEqual(result['rows'][0]['action'],'Invalid')
        self.assertTrue(self.call('detail',name=doc['name'])['actions']['edit'])
        self.denied('review','sector',name=doc['name'],expected_version=doc['modified'],command_id=uuid.uuid4().hex)
        fixed=dict(self.args,csv_text=self.source.replace(self.f.prefix+'-IMPORT',self.f.prefix+'-CORRECTED'))
        validated=self.call('validate_csv',**fixed,name=doc['name'],expected_version=doc['modified'])
        self.call('save',**fixed,name=doc['name'],expected_version=doc['modified'],validated_digest=validated['digest'],command_id=uuid.uuid4().hex)
        self.assertFalse(self.call('batch_rows',name=doc['name'])['validation_error'])


def run():
    from kandil_hr.foundation.concurrency_runner import _guard
    from kandil_hr.foundation.tests_runner import RecordedResult
    _guard();result=unittest.TextTestRunner(verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestImportPortal))
    return dict(result='PASS' if result.wasSuccessful() and not result.skipped and result.testsRun==13 else 'FAIL',total=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),tests=result.checks,
                limits=['Rolled-back ordinary-role import contracts; browser and concurrent HTTP proof are separate.'])
