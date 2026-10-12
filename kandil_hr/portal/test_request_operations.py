"""Ordinary-role operations, replay, stage and ledger proof on rollback fixtures."""
import json
import unittest
import uuid

import frappe

from kandil_hr.portal import api, request_operations as operations
from kandil_hr.recruitment import api as commands
from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as
from kandil_hr.recruitment.test_contracts import TestRecruitmentContracts


class TestRequestOperations(unittest.TestCase):
    def setUp(self):
        self.f = TestRecruitmentCommands()
        self.addCleanup(self.f.doCleanups)
        self.f.setUp()
        manager=frappe.get_doc('User',self.f.users['manager'])
        manager.set('roles',[{'role':'Kandil Approver'}]);manager.save(ignore_permissions=True)
        frappe.clear_cache(user=manager.name)

    def call(self, name, operation, role='hr', **kwargs):
        values = dict(name=name, operation=operation, command_id=uuid.uuid4().hex,
            expected_version=str(self.f.load(name).modified), payload={'reason':'Synthetic reviewed action'})
        values.update(kwargs)
        with acting_as(self.f.users[role]):
            return operations.execute(**values)

    def view(self, name, role='hr'):
        with acting_as(self.f.users[role]):
            return api.detail(name)

    def pending(self, quantities=(3,2)):
        name = self.f.request(quantities).name
        self.f.submit(name)
        self.f.decide(name,'manager')
        return name

    def approved(self, quantities=(3,2)):
        name = self.pending(quantities)
        self.f.decide(name,'hr')
        return name

    def ceo(self):
        helper = TestRecruitmentContracts()
        helper.f = self.f
        return helper.ceo()

    def test_review_retains_requested_changes_only_reserved_and_replays_once(self):
        name = self.pending()
        before = self.f.load(name)
        payload = dict(reason='Reduce one requested seat',priority='Critical',quantities={before.lines[0].name:2})
        key = uuid.uuid4().hex
        args = dict(command_id=key, expected_version=str(before.modified), payload=payload)
        result = self.call(name,'review',**args)
        self.assertEqual(result,dict(name=name,operation='review'))
        after = self.view(name)['request']
        self.assertEqual(after['hr_priority'],'Critical')
        self.assertEqual([(r['requested_qty'],r['proposed_qty'],r['reserved_qty']) for r in after['lines']],[(3,2,2),(2,2,2)])
        self.f.ledger((2,2),(0,0))
        counts = self.f.counts(name)
        self.assertEqual(result,self.call(name,'review',**args))
        self.assertEqual(counts,self.f.counts(name))
        self.assertEqual(self.f.load(name).status,'Pending')

    def test_unknown_review_keys_increase_and_zero_all_are_rejected_natively(self):
        name = self.pending()
        doc = self.f.load(name)
        counts = self.f.counts(name)
        for quantities in ({'forged':1},{doc.lines[0].name:4},{r.name:0 for r in doc.lines}):
            with self.f.rejected():
                self.f.call('hr',commands.review,name,quantities=quantities,priority='Normal',reason='Invalid review test')
        self.assertEqual(counts,self.f.counts(name))
        self.f.ledger((3,2),(0,0))

    def test_review_hints_and_mutations_require_active_hr_and_current_scope(self):
        name = self.f.request().name
        self.f.submit(name)
        self.assertFalse(self.view(name)['actions']['review'])
        doc = self.f.load(name)
        payload = dict(reason='Review permission test',priority='Normal',quantities={})
        with self.f.rejected(frappe.PermissionError):
            self.call(name,'review',payload=payload)
        self.f.decide(name,'manager')
        self.assertTrue(self.view(name)['actions']['review'])
        for role in ('requester','manager','sector'):
            self.assertFalse(self.view(name,role)['actions']['review'])
            with self.f.rejected(frappe.PermissionError):
                self.call(name,'review',role=role,payload=payload)
        grant = frappe.get_doc('Kandil Access Grant',self.f.grants['hr'])
        grant.revoked=1;grant.save(ignore_permissions=True)
        self.f.insert('Kandil Access Grant',user=grant.user,company=grant.company,department=grant.department,valid_from=grant.valid_from,can_manage_recruitment=0,can_view_sensitive=1,reason='Read-only regression grant')
        self.assertFalse(self.view(name)['actions']['review'])
        with self.f.rejected(frappe.PermissionError):self.call(name,'review',payload=payload)

    def test_add_ceo_keeps_hr_pending_and_requires_both_decisions(self):
        ceo = self.ceo()
        name = self.pending()
        before = self.f.load(name)
        args = dict(command_id=uuid.uuid4().hex,expected_version=str(before.modified))
        self.call(name,'send_to_ceo',**args)
        counts = self.f.counts(name)
        self.call(name,'send_to_ceo',**args)
        self.assertEqual(counts,self.f.counts(name))
        doc = self.f.load(name)
        self.assertEqual([(s.authority,s.principal) for s in doc.approval_steps if s.decision=='Pending'],[('HR Approval',self.f.users['hr']),('CEO Approval',ceo)])
        self.assertFalse(self.view(name)['actions']['send_to_ceo'])
        self.f.decide(name,'hr');self.assertEqual(self.f.load(name).status,'Pending')
        self.f.ledger((3,2),(0,0))
        self.f.decide(name,'ceo');self.f.ledger((0,0),(3,2))

    def test_disabled_revoked_and_interested_ceo_cannot_be_added(self):
        ceo=self.ceo();name=self.pending();counts=self.f.counts(name)
        for mode in ('disabled','revoked','interested'):
            with self.f.rejected(frappe.PermissionError):
                if mode=='disabled':
                    user=frappe.get_doc('User',ceo);user.enabled=0;user.save(ignore_permissions=True)
                elif mode=='revoked':
                    grant=frappe.get_doc('Kandil Access Grant',{'user':ceo,'company':self.f.company});grant.revoked=1;grant.save(ignore_permissions=True)
                else:
                    from kandil_hr.pilot.api import transition
                    with transition():
                        doc=self.f.load(name);doc.beneficiary_user=ceo;doc.save(ignore_permissions=True)
                self.call(name,'send_to_ceo')
        self.assertEqual(counts,self.f.counts(name));self.f.ledger((3,2),(0,0))

    def test_cancel_returned_visible_to_owner_but_not_sector(self):
        name=self.f.request().name;self.f.submit(name);self.f.decide(name,'manager',decision='Return',comment='Revise details')
        self.assertTrue(self.view(name,'requester')['actions']['cancel'])
        self.assertFalse(self.view(name,'sector')['actions']['cancel'])
        with self.f.rejected(frappe.PermissionError):self.call(name,'cancel',role='sector')
        args=dict(command_id=uuid.uuid4().hex,expected_version=str(self.f.load(name).modified))
        self.call(name,'cancel',role='requester',**args);counts=self.f.counts(name)
        self.call(name,'cancel',role='requester',**args)
        self.assertEqual(counts,self.f.counts(name));self.assertEqual(self.f.load(name).status,'Cancelled')
        self.f.ledger((0,0),(0,0))

    def test_cancel_approved_releases_openings_retains_original_and_history(self):
        name=self.approved();doc=self.f.load(name)
        revisions=frappe.get_all('Kandil Request Revision',filters={'request':name},fields=['name','snapshot_json'])
        self.call(name,'cancel')
        after=self.f.load(name)
        self.assertEqual([(r.requested_qty,r.approved_qty,r.closed_qty) for r in after.lines],[(3,3,3),(2,2,2)])
        for r in revisions:self.assertEqual(frappe.db.get_value('Kandil Request Revision',r.name,'snapshot_json'),r.snapshot_json)
        self.f.ledger((0,0),(0,0))

    def test_amendment_creates_once_blocks_original_and_reapproves_delta(self):
        name=self.approved();doc=self.f.load(name)
        args=dict(command_id=uuid.uuid4().hex,expected_version=str(doc.modified))
        amendment=self.call(name,'amend',role='requester',**args)
        self.assertEqual(amendment,self.call(name,'amend',role='requester',**args))
        self.assertEqual(frappe.db.count('Kandil Hiring Request',{'amends':name}),1)
        hints=self.view(name)['actions']
        self.assertTrue(hints['active_amendment'])
        for action in ('amend','cancel','correct_approved'):self.assertFalse(hints[action])
        for op in ('cancel','correct_approved'):
            with self.f.rejected():self.call(name,op)
        view=self.view(amendment['name'],'requester')['request'];self.assertEqual(view['amends'],name)
        payload={key:view[key] for key in api.EDITABLE}
        payload['lines']=[dict(capacity=r['capacity'],requested_qty=r['requested_qty']+(1 if i==0 else 0)) for i,r in enumerate(view['lines'])]
        with acting_as(self.f.users['requester']):
            api.save_draft(payload,uuid.uuid4().hex,name=amendment['name'],expected_version=view['modified'])
        self.f.submit(amendment['name']);self.f.ledger((1,0),(3,2))
        self.f.approve_all(amendment['name']);self.f.ledger((0,0),(4,2))
        self.assertEqual(self.f.load(amendment['name']).status,'Applied')
        self.assertEqual([r.job_opening for r in self.f.load(name).lines],[r.job_opening for r in doc.lines])

    def test_amendment_draft_preserves_zero_quantity_location(self):
        name=self.pending();doc=self.f.load(name)
        self.call(name,'review',payload=dict(reason='Zero one location',priority='Normal',quantities={doc.lines[1].name:0}))
        self.f.decide(name,'hr')
        child=self.call(name,'amend',role='requester')['name'];view=self.view(child,'requester')['request']
        payload={key:view[key] for key in api.EDITABLE};payload['lines']=[dict(capacity=r['capacity'],requested_qty=r['requested_qty']) for r in view['lines']]
        with acting_as(self.f.users['requester']):saved=api.save_draft(json.dumps(payload),uuid.uuid4().hex,name=child,expected_version=view['modified'])
        self.assertEqual([r['requested_qty'] for r in saved['lines']],[3,0])
        from kandil_hr.portal.route_preview import evaluate
        with acting_as(self.f.users['requester']):
            preview=evaluate(payload,name=child,expected_version=saved['modified'])
        self.assertTrue(preview['ready'])
        self.assertEqual([(r['requested'],r['incremental_demand']) for r in preview['rows']],[(3,0),(0,0)])

    def test_correction_reduce_relocate_fields_history_and_minimal_retry(self):
        name=self.approved((3,));doc=self.f.load(name);line=doc.lines[0]
        before=frappe.get_all('Kandil Request Revision',filters={'request':name},fields=['name','snapshot_json'])
        args=dict(command_id=uuid.uuid4().hex,expected_version=str(doc.modified),payload=dict(reason='Move two remaining seats',quantities={line.name:2},relocations={line.name:self.f.capacities[1]},fields={'skills_required':'Safe operation','hr_priority':'Important'}))
        result=self.call(name,'correct_approved',**args);counts=self.f.counts(name)
        self.assertEqual(result,self.call(name,'correct_approved',**args));self.assertEqual(counts,self.f.counts(name))
        self.f.ledger((0,0),(0,2));view=self.view(name)
        self.assertEqual(view['request']['skills_required'],'Safe operation')
        self.assertEqual(view['request']['lines'][0]['requested_qty'],3)
        events=[e for e in view['timeline']['events'] if e.action=='HR correction']
        self.assertEqual(events[-1].note,'Move two remaining seats')
        for r in before:self.assertEqual(frappe.db.get_value('Kandil Request Revision',r.name,'snapshot_json'),r.snapshot_json)
        self.assertEqual(set(result),{'name','operation'})

    def test_correction_does_not_allow_increase_or_unpermitted_fields(self):
        name=self.approved();doc=self.f.load(name);before=doc.as_dict();counts=self.f.counts(name)
        for payload in ({'quantities':{doc.lines[0].name:4}}, {'fields':{'status':'Filled'}}, {'relocations':{doc.lines[0].name:self.f.capacities[1]}}, {'quantities':{'forged':1}}):
            with self.f.rejected():self.call(name,'correct_approved',payload={'reason':'Invalid correction'}|payload)
        for role in ('requester','manager','sector'):
            self.assertFalse(self.view(name,role)['actions']['correct_approved'])
            with self.f.rejected(frappe.PermissionError):self.call(name,'correct_approved',role=role,payload={'reason':'Unauthorized edit','fields':{'skills_required':'changed'}})
        self.assertEqual(before,self.f.load(name).as_dict());self.assertEqual(counts,self.f.counts(name))

    def test_stale_changed_replay_and_revoked_replay_are_denied(self):
        name=self.pending();version=str(self.f.load(name).modified);key=uuid.uuid4().hex
        self.call(name,'review',command_id=key,expected_version=version,payload={'reason':'Review','priority':'Important','quantities':{}})
        with self.f.rejected(frappe.TimestampMismatchError):self.call(name,'cancel',expected_version=version)
        with self.f.rejected():self.call(name,'review',command_id=key,expected_version=version,payload={'reason':'Changed','priority':'Important','quantities':{}})
        grant=frappe.get_doc('Kandil Access Grant',self.f.grants['hr']);grant.revoked=1;grant.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):self.call(name,'review',command_id=key,expected_version=version,payload={'reason':'Review','priority':'Important','quantities':{}})

    def test_malformed_command_metadata_fails_without_business_effects(self):
        name=self.f.request().name
        before=self.f.load(name).as_dict();counts=self.f.counts(name)
        base=dict(name=name,operation='cancel',command_id=uuid.uuid4().hex,expected_version=str(before.modified),payload={'reason':'Malformed metadata'})
        for bad in ({'name':{}},{'name':[]},{'command_id':{}},{'command_id':'short'},{'expected_version':{}},{'expected_version':'invalid timestamp'},{'operation':{}},{'operation':[]},{'payload':' '*40001}):
            with self.subTest(field=next(iter(bad))), acting_as(self.f.users['requester']), self.f.rejected():
                operations.execute(**(base|bad))
        self.assertEqual(before,self.f.load(name).as_dict());self.assertEqual(counts,self.f.counts(name))

    def test_payload_guest_and_return_revision_minimal_projection(self):
        name=self.f.request().name
        for operation,payload in [('cancel',{'reason':''}),('cancel',{'reason':'x','status':'Cancelled'}),('review',{'reason':'x','quantities':[],'priority':'Normal'}),('unknown',{'reason':'x'})]:
            with self.f.rejected():self.call(name,operation,payload=payload)
        with acting_as('Guest'),self.f.rejected(frappe.PermissionError):
            operations.execute(name,'cancel',uuid.uuid4().hex,str(self.f.load(name).modified),{'reason':'Guest'})
        self.f.submit(name);self.f.decide(name,'manager',decision='Return',comment='Revise fields')
        self.assertEqual(self.call(name,'revise',role='requester'),{'name':name,'operation':'revise'})
        self.assertTrue(self.view(name,'requester')['actions']['edit'])


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    import sys
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestRequestOperations))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
        limits=['Rollback-scoped native tests; HTTP/browser, full S3 and production acceptance are separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Request operation regression failed')
    return value
