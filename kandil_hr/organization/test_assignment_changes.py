"""Rollback-scoped independent HR + CEO approval proof for individual assignments."""
import json
import unittest
import uuid

import frappe
from frappe.utils import add_days, today

from kandil_hr.organization import api
from kandil_hr.portal.test_structure import TestStructurePortal
from kandil_hr.recruitment.test_commands import acting_as


class TestAssignmentChanges(unittest.TestCase):
    def setUp(self):
        self.base = TestStructurePortal()
        self.addCleanup(self.base.doCleanups)
        self.base.setUp()
        self.f = self.base.f
        # Remove only the seed manager's automatic own-employee restriction.
        # This synthetic account represents an HR author with company-wide employee visibility.
        frappe.db.delete("User Permission", {"user": self.f.users["manager"], "allow": "Employee"})
        frappe.clear_cache(user=self.f.users["manager"])
        self.employee = self.f.insert('Employee', first_name='Synthetic reviewed assignee',
            gender='Male', date_of_birth='1990-01-01', date_of_joining=add_days(today(), -30),
            company=self.f.company, department=self.f.department, status='Active')

    def call(self, method, role='manager', **kwargs):
        with acting_as(self.f.users[role]):
            return getattr(api, method)(**kwargs)

    def denied(self, callback):
        point = 'denied_' + uuid.uuid4().hex
        frappe.db.savepoint(point)
        try:
            with self.assertRaises((frappe.ValidationError, frappe.PermissionError, frappe.TimestampMismatchError)):
                callback()
        finally:
            frappe.db.rollback(save_point=point)

    def op(self, **overrides):
        return dict(action='AssignEmployee', position=self.f.positions[0], employee=self.employee.name,
                    allocation='Primary', **overrides)

    def draft(self, op=None, effective_on=None):
        with acting_as(self.f.users['manager']):
            return frappe.get_doc(dict(doctype='Kandil Structure Change', company=self.f.company,
                effective_on=effective_on or today(), reason='Synthetic individual position review',
                changes_json=json.dumps([op or self.op()]))).insert()

    def pending(self, op=None, effective_on=None):
        doc = self.draft(op, effective_on)
        self.call('preview_structure', name=doc.name)
        doc.reload()
        self.call('submit_structure', name=doc.name, preview_hash=doc.preview_hash,
                  expected_version=str(doc.modified), command_id=uuid.uuid4().hex)
        return doc.reload()

    def decide(self, doc, role='hr', decision='Approved', command_id=None):
        doc.reload()
        step = next(s for s in doc.approval_steps if s.decision == 'Pending')
        args = dict(name=doc.name, preview_hash=doc.preview_hash, decision=decision, step_id=step.step_key,
                    command_id=command_id or uuid.uuid4().hex, expected_version=str(doc.modified),
                    comment='Synthetic reviewed decision')
        return self.call('decide_structure', role, **args), args

    def applied(self, op=None, effective_on=None):
        doc = self.pending(op, effective_on)
        self.decide(doc)
        self.decide(doc, 'sector')
        return doc.reload()

    def assignment(self):
        return frappe.get_doc('Kandil Position Assignment', {'employee':self.employee.name})

    def occupied(self, index=0):
        return frappe.db.get_value('Kandil Capacity', self.f.capacities[index], 'occupied')

    def test_two_independent_approvals_atomic_occupancy_receipts_and_audit(self):
        doc = self.pending()
        self.assertEqual([s.authority for s in doc.approval_steps], ['HR Approval', 'CEO Approval'])
        self.assertEqual(self.occupied(), 0)
        self.denied(lambda:self.decide(doc, 'manager'))
        self.denied(lambda:self.decide(doc, 'sector'))
        first, args = self.decide(doc)
        self.assertEqual(first, self.call('decide_structure', 'hr', **args))
        self.assertFalse(frappe.db.exists('Kandil Position Assignment', {'employee':self.employee.name}))
        final, args = self.decide(doc, 'sector')
        self.assertEqual(final['status'], 'Approved')
        self.assertEqual(final, self.call('decide_structure', 'sector', **args))
        self.assertEqual(self.occupied(), 1)
        self.assertEqual(frappe.db.count('Kandil Position Assignment', {'employee':self.employee.name}), 1)
        envelope = json.loads(frappe.get_all('Kandil Command Audit',
            filters={'target_name':doc.name,'command_id':args['command_id']},pluck='envelope_json')[0])
        assignment = self.assignment()
        self.assertTrue(any(r.get('name') == assignment.name and r.get('doctype') == assignment.doctype
                            for r in envelope['related_after']))
        self.assertFalse(any(r.get('name') == assignment.name for r in envelope['related_before']))

    def test_native_create_and_edit_cannot_bypass_approval(self):
        position = frappe.get_doc('Kandil Position', self.f.positions[0])
        def create():
            with acting_as(self.f.users['hr']):
                frappe.get_doc(dict(doctype='Kandil Position Assignment', company=self.f.company,
                    department=position.department, branch=position.branch, position=position.name,
                    employee=self.employee.name, allocation='Primary', valid_from=today())).insert()
        self.denied(create)
        self.applied()
        def edit():
            with acting_as(self.f.users['hr']):
                doc = self.assignment();doc.valid_until=add_days(today(),1);doc.save()
        self.denied(edit)
        self.assertFalse(self.assignment().valid_until)

    def test_future_transfer_preserves_source_episode_and_current_count(self):
        self.applied()
        source = self.assignment()
        move = dict(action='MoveEmployee', position=source.position, assignment=source.name,
                    target_position=self.f.positions[1])
        self.applied(move, add_days(today(), 2))
        source.reload()
        self.assertEqual(str(source.valid_until), str(add_days(today(), 1)))
        target = frappe.get_doc('Kandil Position Assignment', {'employee':self.employee.name,'position':self.f.positions[1]})
        self.assertEqual(str(target.valid_from), str(add_days(today(), 2)))
        self.assertEqual(source.position, self.f.positions[0])
        self.assertEqual((self.occupied(), self.occupied(1)), (1, 0))
        result = api.reconcile(self.f.company, add_days(today(), 2))
        self.assertEqual({r['position']:r['allocated'] for r in result['rows']}[target.position], 1)

    def test_end_date_is_inclusive_and_does_not_rewrite_history(self):
        self.applied()
        source = self.assignment()
        self.applied(dict(action='EndAssignment', position=source.position, assignment=source.name))
        source.reload()
        self.assertEqual(str(source.valid_until), today())
        self.assertEqual(str(source.valid_from), today())
        self.assertEqual(self.occupied(), 1)
        result = api.reconcile(self.f.company, add_days(today(), 1))
        self.assertEqual(next(r['allocated'] for r in result['rows'] if r['position']==source.position), 0)

    def test_return_and_reject_do_not_apply_and_can_revise(self):
        doc = self.pending()
        self.decide(doc, decision='Returned')
        doc.reload()
        self.assertEqual(doc.status,'Returned')
        self.assertFalse(doc.preview_hash)
        self.assertFalse(frappe.db.exists('Kandil Position Assignment', {'employee':self.employee.name}))
        self.call('preview_structure',name=doc.name);doc.reload()
        self.call('submit_structure',name=doc.name,preview_hash=doc.preview_hash,
                  expected_version=str(doc.modified),command_id=uuid.uuid4().hex)
        self.decide(doc, decision='Rejected')
        self.assertEqual(doc.reload().status,'Rejected')
        self.assertEqual(self.occupied(),0)

    def test_overlapping_primary_and_invalid_dates_are_denied(self):
        self.applied()
        doc=self.draft();self.denied(lambda:self.call('preview_structure',name=doc.name))
        bad=self.draft(self.op(valid_until=add_days(today(),-1)))
        self.denied(lambda:self.call('preview_structure',name=bad.name))
        source=self.assignment()
        move=self.draft(dict(action='MoveEmployee',position=source.position,assignment=source.name,target_position=self.f.positions[1]))
        self.denied(lambda:self.call('preview_structure',name=move.name))

    def test_hiring_commitments_and_legacy_baseline_are_not_overwritten(self):
        frappe.db.set_value('Kandil Capacity',self.f.capacities[0],'reserved',5)
        doc=self.draft();self.denied(lambda:self.call('preview_structure',name=doc.name))
        frappe.db.set_value('Kandil Capacity',self.f.capacities[0],{'reserved':0,'occupied':2,'occupancy_basis':'Legacy Baseline'})
        self.denied(lambda:self.call('preview_structure',name=doc.name))
        self.assertEqual(self.occupied(),2)

    def test_eligibility_change_after_first_approval_requires_new_review(self):
        doc=self.pending();self.decide(doc)
        frappe.db.set_value('Employee',self.employee.name,'status','Inactive')
        self.denied(lambda:self.decide(doc,'sector'))
        self.assertFalse(frappe.db.exists('Kandil Position Assignment',{'employee':self.employee.name}))
        self.decide(doc,'sector',decision='Returned')
        self.assertEqual(doc.reload().status,'Returned')

    def test_employee_cannot_approve_own_change(self):
        frappe.db.set_value('Employee',self.employee.name,'user_id',self.f.users['hr'])
        doc=self.draft();self.call('preview_structure',name=doc.name);doc.reload()
        self.denied(lambda:self.call('submit_structure',name=doc.name,preview_hash=doc.preview_hash,
                    expected_version=str(doc.modified),command_id=uuid.uuid4().hex))

    def test_concurrent_pending_proposals_cannot_double_apply(self):
        first=self.pending();second=self.pending()
        self.decide(first);self.decide(first,'sector')
        self.denied(lambda:self.decide(second))
        self.assertEqual(frappe.db.count('Kandil Position Assignment',{'employee':self.employee.name}),1)
        self.assertEqual(self.occupied(),1)

    def test_foreign_employee_destination_and_mixed_operations_are_denied(self):
        op=self.op();op['employee']='foreign-employee'
        doc=self.draft(op);self.denied(lambda:self.call('preview_structure',name=doc.name))
        self.applied();source=self.assignment()
        doc=self.draft(dict(action='MoveEmployee',position=source.position,assignment=source.name,
                            target_position='foreign-position'),add_days(today(),1))
        self.denied(lambda:self.call('preview_structure',name=doc.name))
        doc=self.draft()
        with acting_as(self.f.users['manager']):
            doc.changes_json=json.dumps([self.op(),dict(action='Resize',position=self.f.positions[0],structural=6)])
            doc.save()
        self.denied(lambda:self.call('preview_structure',name=doc.name))

    def test_future_assignment_does_not_increment_current_occupancy(self):
        self.applied(effective_on=add_days(today(),5))
        self.assertEqual(self.occupied(),0)
        self.assertEqual(str(self.assignment().valid_from),str(add_days(today(),5)))

    def test_current_transfer_refreshes_both_ledgers_and_keeps_identity(self):
        # Historical seed is trusted fixture setup, never a client mutation.
        p=frappe.get_doc('Kandil Position',self.f.positions[0])
        source=self.f.insert('Kandil Position Assignment',company=p.company,department=p.department,
            branch=p.branch,position=p.name,employee=self.employee.name,allocation='Primary',valid_from=add_days(today(),-3))
        self.applied(dict(action='MoveEmployee',position=p.name,assignment=source.name,target_position=self.f.positions[1]))
        self.assertEqual((self.occupied(),self.occupied(1)),(0,1))
        source.reload()
        self.assertEqual(str(source.valid_until),str(add_days(today(),-1)))
        self.assertEqual(str(source.valid_from),str(add_days(today(),-3)))
        self.assertEqual(source.employee,self.employee.name)
        self.assertEqual(source.position,p.name)

    def test_portal_assignment_catalog_save_review_and_scope(self):
        payload={**self.base.payload,'operations':[self.op()]}
        catalog=self.base.call('catalog',company=self.f.company,kind='employee',search=self.employee.name)
        self.assertEqual([r['id'] for r in catalog['rows']],[self.employee.name])
        doc=self.base.pending(payload)
        self.base.decide(doc);self.base.decide(doc,'sector')
        assignment=self.assignment()
        end={**payload,'operations':[dict(action='EndAssignment',position=assignment.position,assignment=assignment.name)]}
        review=self.base.pending(end)
        self.assertEqual(review['review'][0]['assignment_before']['employee'],self.employee.name)
        self.assertEqual(review['review_basis'],'submitted_snapshot')
        self.base.denied('catalog','requester',company=self.f.company,kind='employee')
        self.base.denied('catalog',company='foreign',kind='employee')
        entries=self.base.call('catalog',company=self.f.company,kind='assignment',position=assignment.position)
        self.assertIn(assignment.name,[r['id'] for r in entries['rows']])

    def test_acting_assignment_does_not_consume_primary_seat(self):
        op=self.op();op['allocation']='Acting'
        self.applied(op)
        self.assertEqual(self.occupied(),0)
        other=self.f.insert('Employee',first_name='Synthetic second acting employee',gender='Male',
            date_of_birth='1990-01-01',date_of_joining=today(),company=self.f.company,department=self.f.department,status='Active')
        op['employee']=other.name
        doc=self.draft(op);self.denied(lambda:self.call('preview_structure',name=doc.name))

    def test_revoked_ceo_cannot_apply_pending_change(self):
        doc=self.pending();self.decide(doc)
        account=frappe.get_doc('User',self.f.users['sector'])
        account.enabled=0;account.save(ignore_permissions=True)
        self.denied(lambda:self.decide(doc,'sector'))
        self.assertEqual(self.occupied(),0)

    def test_native_employee_user_permission_also_blocks_guessed_proposal(self):
        own=frappe.db.get_value('Employee',{'user_id':self.f.users['manager']},'name')
        self.f.insert('User Permission',user=self.f.users['manager'],allow='Employee',for_value=own,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['manager'])
        self.assertEqual(self.base.call('catalog',company=self.f.company,kind='employee',search=self.employee.name)['rows'],[])
        doc=self.draft()
        self.denied(lambda:self.call('preview_structure',name=doc.name))

    def test_malformed_native_assignment_json_is_a_controlled_rejection(self):
        doc=self.draft()
        for changes in ([{**self.op(),'employee':['invalid']}],[self.op(),'invalid'],[{**self.op(),'approved_by':'forged'}]):
            with acting_as(self.f.users['manager']):
                doc.reload();doc.changes_json=json.dumps(changes);doc.save()
            self.denied(lambda:self.call('preview_structure',name=doc.name))


def run():
    from kandil_hr.foundation.concurrency_runner import _guard
    from kandil_hr.foundation.tests_runner import RecordedResult
    _guard()
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(TestAssignmentChanges)
    result=unittest.TextTestRunner(verbosity=2,resultclass=RecordedResult).run(suite)
    return dict(result='PASS' if result.wasSuccessful() and not result.skipped and result.testsRun==18 else 'FAIL',
        total=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),tests=result.checks,
        limits=['Rollback-scoped native commands. Portal assignment editor, real HTTP, simultaneous transaction proof and HR acceptance remain separate gates.'])
