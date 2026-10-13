"""Nested historical payload and reference regressions; isolated native rollback."""
import copy
import json
import sys
import unittest
import uuid

import frappe
from frappe.client import get
from kandil_hr.recruitment.test_history_access import TestHistoryAccess
from kandil_hr.recruitment.test_commands import acting_as


class TestHistorySchema(unittest.TestCase):
    def setUp(self):
        self.base=TestHistoryAccess(); self.addCleanup(self.base.doCleanups); self.base.setUp()
        self.f=self.base.f
        self.original=json.loads(self.base.revision.snapshot_json)

    def store(self, value):
        frappe.db.set_value('Kandil Request Revision',self.base.revision.name,'snapshot_json',json.dumps(value))

    def test_unknown_nested_route_fields_are_not_shared(self):
        for container in ('root','policy','resolved','step','skipped','interests','basis','cohort','pending'):
            with self.subTest(container=container):
                value=copy.deepcopy(self.original);route=json.loads(value['route_snapshot'])
                targets={
                    'root':route,'policy':route['policy'],'resolved':route['resolved'],
                    'step':route['resolved']['steps'][0],
                    'skipped':dict(authority='Department Approval',reason='Recorded'),
                    'interests':route['interest_snapshot'],
                    'basis':next(iter(route['headcount_basis'].values())),
                    'cohort':dict(committed=1,joined=0,closed=0),
                    'pending':dict(reason='Recorded',lines=[]),
                }
                targets[container]['private_salary']={'amount':999999}
                if container=='skipped':route['skipped']=[targets['skipped']]
                if container=='cohort':next(iter(route['headcount_basis'].values()))['cohort']={'synthetic-line':targets['cohort']}
                if container=='pending':route['pending_quantity_revision']=targets['pending']
                value['route_snapshot']=json.dumps(route);self.store(value);self.base.denied()

    def test_known_scalar_fields_cannot_embed_private_objects(self):
        for target,key in [('root','qualifications'),('line','proposed_qty'),('step','comment')]:
            with self.subTest(target=target):
                value=copy.deepcopy(self.original)
                row=value if target=='root' else value['lines' if target=='line' else 'approval_steps'][0]
                row[key]={'private_hr_note':'Synthetic private content'}
                self.store(value);self.base.denied()

    def test_malformed_route_shapes_fail_closed(self):
        for route in ('invalid json','[]',json.dumps({'policy':[]}),json.dumps({'resolved':{'steps':[None]}}),json.dumps({'interest_snapshot':{'users':[{'secret':'x'}]}})):
            with self.subTest(route=route):
                value=copy.deepcopy(self.original);value['route_snapshot']=route
                self.store(value);self.base.denied()

    def test_portal_known_scalar_fields_cannot_return_nested_private_objects(self):
        from kandil_hr.portal.request_history import project
        for field in ('qualifications','comment','requested_qty','headcount_mode'):
            value=copy.deepcopy(self.original)
            if field=='comment':value['approval_steps'][0][field]={'secret':'x'}
            elif field=='requested_qty':value['lines'][0][field]={'secret':'x'}
            elif field=='headcount_mode':
                route=json.loads(value['route_snapshot']);route['policy'][field]={'secret':'x'};value['route_snapshot']=json.dumps(route)
            else:value[field]={'secret':'x'}
            with acting_as(self.f.users['requester']),self.f.rejected(frappe.PermissionError):
                project(value,[],self.f.load(self.base.name))

    def test_amendment_reference_respects_native_user_permission(self):
        other=self.base.base.save()['name']
        value=copy.deepcopy(self.original);value['amends']=other;self.store(value)
        self.assertEqual(json.loads(self.base.read()['snapshot_json'])['amends'],other)
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Kandil Hiring Request',for_value=self.base.name,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester']);self.base.denied()

    def opening(self):
        name='HISTORY-'+uuid.uuid4().hex
        doc=frappe.get_doc(dict(doctype='Job Opening',name=name,job_title=name,
            company=self.f.company,custom_kandil_request=self.base.name,
            custom_kandil_capacity=self.f.capacities[0],status='Open'))
        doc.db_insert();return doc.name

    def test_job_opening_reference_respects_user_permission(self):
        opening=self.opening();other=self.opening()
        value=copy.deepcopy(self.original);value['lines'][0]['job_opening']=opening;self.store(value)
        # HR has native opening read rights; keep safe historical access.
        self.assertEqual(json.loads(self.base.read('hr')['snapshot_json'])['lines'][0]['job_opening'],opening)
        self.f.insert('User Permission',user=self.f.users['hr'],allow='Job Opening',for_value=other,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['hr']);self.base.denied('hr')

    def test_board_proof_must_be_private_and_match_exact_request(self):
        file=self.base.revision_attachment()
        value=copy.deepcopy(self.original);value['approval_steps'][0]['board_evidence']=file.name;self.store(value)
        # A readable File for a different record is not proof for this request.
        self.base.denied()
        frappe.db.set_value('File',file.name,{'attached_to_doctype':'Kandil Hiring Request','attached_to_name':self.base.name})
        self.assertEqual(json.loads(self.base.read()['snapshot_json'])['approval_steps'][0]['board_evidence'],file.name)
        frappe.db.set_value('File',file.name,'is_private',0);self.base.denied()

    def test_board_proof_respects_native_file_user_permission(self):
        file=self.base.revision_attachment();other=self.base.revision_attachment()
        frappe.db.set_value('File',file.name,{'attached_to_doctype':'Kandil Hiring Request','attached_to_name':self.base.name})
        value=copy.deepcopy(self.original);value['approval_steps'][0]['board_evidence']=file.name;self.store(value)
        self.assertEqual(json.loads(self.base.read()['snapshot_json'])['approval_steps'][0]['board_evidence'],file.name)
        self.f.insert('User Permission',user=self.f.users['requester'],allow='File',for_value=other.name,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester']);self.base.denied()

    def test_approved_amended_corrected_and_relocated_versions_keep_original_bytes(self):
        from kandil_hr.recruitment import api
        from kandil_hr.recruitment.corrections import correct_approved
        self.f.approve_all(self.base.name)
        amendment=self.f.call('requester',api.amend,self.base.name,reason='Synthetic additional need')['name']
        with acting_as(self.f.users['requester']):
            doc=self.f.load(amendment);doc.lines[0].requested_qty=3;doc.save()
        self.f.submit(amendment);self.f.approve_all(amendment)
        self.f.call('hr',correct_approved,self.base.name,reason='Synthetic correction',fields={'qualifications':'Updated qualifications'})
        doc=self.f.load(self.base.name)
        self.f.call('hr',correct_approved,self.base.name,reason='Synthetic relocation',relocations={doc.lines[0].name:self.f.capacities[1]})
        revisions=frappe.get_all('Kandil Request Revision',filters={'request':['in',[self.base.name,amendment]]},fields=['name','snapshot_json'])
        self.assertTrue(any(json.loads(r.snapshot_json)['status']=='Applied' for r in revisions))
        self.assertTrue(any(any(line.get('job_opening') for line in json.loads(r.snapshot_json)['lines']) for r in revisions))
        for row in revisions:
            for role in ('requester','manager','hr'):
                with acting_as(self.f.users[role]):
                    self.assertEqual(get('Kandil Request Revision',row.name)['snapshot_json'],row.snapshot_json)

    def test_safe_pending_change_and_cohort_remain_exact_readable_bytes(self):
        from kandil_hr.recruitment.pending_revision import revise_pending_quantities
        other=self.base.base.save()['name'];self.f.submit(other)
        doc=self.f.load(other)
        self.f.call('requester',revise_pending_quantities,other,
            quantities={doc.lines[0].name:3},reason='Synthetic increased need')
        revisions=frappe.get_all('Kandil Request Revision',filters={'request':other},fields=['name','snapshot_json'])
        self.assertTrue(any(json.loads(r.snapshot_json)['route_snapshot'] and
            json.loads(json.loads(r.snapshot_json)['route_snapshot']).get('pending_quantity_revision') for r in revisions))
        for row in revisions:
            for role in ('requester','manager','hr'):
                with acting_as(self.f.users[role]):
                    self.assertEqual(get('Kandil Request Revision',row.name)['snapshot_json'],row.snapshot_json)


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestHistorySchema))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
        limits=['Native nested shape and amendment/opening/proof references; deeper frozen route identity and cohort-reference audit remains separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Nested historical access failed')
    return value
