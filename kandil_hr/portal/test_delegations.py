"""Delegation portal authority, receipt, temporal and projection contracts."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.utils import add_days

from kandil_hr.foundation import delegation
from kandil_hr.foundation.clock import today_cairo
from kandil_hr.foundation.test_delegation import TestDelegation
from kandil_hr.portal import delegations as portal
from kandil_hr.recruitment.test_commands import acting_as


class TestPortalDelegations(unittest.TestCase):
    def setUp(self):
        self.f = TestDelegation()
        self.addCleanup(self.f.doCleanups)
        self.f.setUp()
        self.f.actor('delegate', ['Kandil Approver'])

    def data(self, **extra):
        return dict(company=self.f.company, department=self.f.department,
            from_user=self.f.users['manager'], to_user=self.f.users['delegate'],
            from_date=str(today_cairo()), to_date=str(add_days(today_cairo(), 89)),
            reason='Synthetic delegated approval coverage', process_scope='APPROVALS', **extra)

    def create(self, data=None, role='sector', key=None):
        with acting_as(self.f.users[role]):
            return portal.create(data or self.data(), key or uuid.uuid4().hex)

    def load(self, name):
        return frappe.get_doc(portal.DT, name)

    def action(self, name, operation, payload, role='sector', **extra):
        args = dict(name=name, operation=operation, payload=payload,
            command_id=uuid.uuid4().hex, expected_version=str(self.load(name).modified))
        args.update(extra)
        with acting_as(self.f.users[role]): return portal.execute(**args)

    def detail(self, name, role='sector'):
        with acting_as(self.f.users[role]): return portal.detail(name)

    def audits(self, name):
        return frappe.get_all('Kandil Command Audit', filters={'domain':'delegation','target_name':name},
            fields=['operation','command_origin','envelope_json'], order_by='creation')

    def test_create_exact_retry_one_grant_one_audit_and_minimal_receipt(self):
        key=uuid.uuid4().hex;data=self.data()
        a=self.create(data,key=key);b=self.create(data,key=key)
        self.assertEqual(a,b);self.assertEqual(set(a),{'name','operation'})
        self.assertEqual(frappe.db.count(portal.DT,{'company':self.f.company,'department':self.f.department}),1)
        audits=self.audits(a['name']);self.assertEqual(len(audits),1)
        value=json.loads(audits[0].envelope_json)
        self.assertEqual((audits[0].operation,audits[0].command_origin),('create','client_command'))
        self.assertEqual(value['payload'],dict(payload=data,command_id=key))
        self.assertEqual(value['before'],dict(doctype=portal.DT,name=a['name'],record_exists=False))

    def test_changed_payload_reusing_create_key_is_rejected(self):
        key=uuid.uuid4().hex;data=self.data();self.create(data,key=key)
        with self.f.rejected():self.create(data|{'reason':'A different instruction'},key=key)
        self.assertEqual(frappe.db.count(portal.DT,{'company':self.f.company,'department':self.f.department}),1)

    def test_revoke_exact_retry_preserves_creation_reason_and_one_new_audit(self):
        name=self.create()['name'];original=self.load(name).reason
        key=uuid.uuid4().hex;version=str(self.load(name).modified)
        args=dict(command_id=key,expected_version=version)
        a=self.action(name,'revoke',{'reason':'End delegated coverage'},**args)
        self.assertEqual(a,self.action(name,'revoke',{'reason':'End delegated coverage'},**args))
        doc=self.load(name)
        self.assertEqual((doc.revoked,doc.reason,doc.revocation_reason),(1,original,'End delegated coverage'))
        self.assertEqual(len(self.audits(name)),2)
        self.assertEqual(self.detail(name)['effective_processes'],[])
        with self.f.rejected(): self.action(name,'revoke',{'reason':'Changed retry'},**args)

    def test_revise_creates_linked_version_and_revokes_old_without_overwrite(self):
        name=self.create()['name'];before=self.load(name)
        payload={'process_scope':'ALL','from_date':str(before.from_date),'to_date':str(before.to_date),'reason':'Include team authority'}
        key=uuid.uuid4().hex;args=dict(command_id=key,expected_version=str(before.modified))
        new=self.action(name,'revise',payload,**args)
        self.assertEqual(new,self.action(name,'revise',payload,**args))
        after=self.load(name);child=self.load(new['name'])
        self.assertEqual((after.revoked,after.reason,after.process_scope),(1,before.reason,'APPROVALS'))
        self.assertEqual((child.supersedes,child.delegation_version,child.process_scope),(name,2,'ALL'))
        self.assertEqual(self.detail(child.name)['effective_processes'],['APPROVALS','TEAM'])
        self.assertEqual(len(self.audits(name)),2)

    def test_ceo_authority_needs_configured_ceo_decision_and_new_version_reapproval(self):
        ceo=self.f.ceo();name=self.create(self.data()|{'from_user':ceo})['name']
        self.assertEqual(self.detail(name)['effective_processes'],[])
        self.assertTrue(self.detail(name,'ceo')['actions']['decide'])
        for role in ('sector','manager','delegate'):
            with self.f.rejected(frappe.PermissionError):self.action(name,'decide',{'decision':'Approve','reason':'Invalid actor'},role=role)
        version=str(self.load(name).modified);key=uuid.uuid4().hex
        args=dict(role='ceo',command_id=key,expected_version=version)
        result=self.action(name,'decide',{'decision':'Approve','reason':'Approve coverage'},**args)
        self.assertEqual(result,self.action(name,'decide',{'decision':'Approve','reason':'Approve coverage'},**args))
        self.assertEqual(self.detail(name)['effective_processes'],['APPROVALS'])
        doc=self.load(name)
        new=self.action(name,'revise',{'from_date':str(doc.from_date),'to_date':str(doc.to_date),'reason':'Revise coverage scope','process_scope':'TEAM'})
        self.assertEqual(self.detail(new['name'])['approval_status'],'Pending CEO')
        self.assertEqual(self.detail(new['name'])['effective_processes'],[])

    def test_ceo_rejection_never_activates_authority(self):
        ceo=self.f.ceo();name=self.create(self.data()|{'from_user':ceo})['name']
        self.action(name,'decide',{'decision':'Reject','reason':'Do not delegate'},role='ceo')
        self.assertEqual(self.detail(name)['approval_status'],'Rejected')
        self.assertEqual(self.detail(name)['effective_processes'],[])

    def test_ninety_inclusive_days_allowed_ninety_one_denied(self):
        self.create()
        with self.f.rejected():self.create(self.data()|{'to_date':str(add_days(today_cairo(),90))})

    def test_effective_date_boundaries_and_process_isolation(self):
        name=self.create(self.data()|{'process_scope':'TEAM'})['name'];doc=self.load(name)
        for offset,expected in ((-1,[]),(0,['TEAM']),(89,['TEAM']),(90,[])):
            with patch.object(delegation,'today_cairo',return_value=add_days(doc.from_date,offset)):
                self.assertEqual(self.detail(name)['effective_processes'],expected)

    def test_self_delegation_and_creating_to_self_are_denied(self):
        self.f.actor('admin_delegate',['Kandil Approver','Kandil Sector Approver'])
        for data in (self.data()|{'to_user':self.f.users['manager']},self.data()|{'to_user':self.f.users['admin_delegate']}):
            with self.f.rejected(frappe.ValidationError if data['to_user']==data['from_user'] else frappe.PermissionError):
                self.create(data,role='admin_delegate')

    def test_board_principal_cannot_use_ordinary_delegation(self):
        board=self.f.actor('board',['Kandil Board Approver'])
        with self.f.rejected(frappe.PermissionError):self.create(self.data()|{'from_user':board})

    def test_disabled_delegate_is_ineffective_but_admin_can_revoke(self):
        name=self.create()['name']
        user=frappe.get_doc('User',self.f.users['delegate']);user.enabled=0;user.save(ignore_permissions=True)
        self.assertEqual(self.detail(name)['effective_processes'],[])
        self.action(name,'revoke',{'reason':'Delegate account disabled'})
        self.assertTrue(self.load(name).revoked)

    def test_revoked_actor_scope_denies_create_replay_read_and_mutation(self):
        key=uuid.uuid4().hex;name=self.create(key=key)['name']
        grant=frappe.get_doc('Kandil Access Grant',self.f.grants['sector']);grant.revoked=1;grant.save(ignore_permissions=True)
        for call in (lambda:self.create(key=key),lambda:self.detail(name),lambda:self.action(name,'revoke',{'reason':'Lost authority'})):
            with self.f.rejected(frappe.PermissionError):call()
        with acting_as(self.f.users['sector']):self.assertEqual(portal.listing(company=self.f.company)['rows'],[])
        self.assertFalse(self.load(name).revoked)

    def test_only_sector_creates_and_revokes_other_roles_can_read_with_scope(self):
        name=self.create()['name']
        for role in ('delegate','manager'):
            self.assertFalse(self.detail(name,role)['actions']['revoke'])
            with self.f.rejected(frappe.PermissionError):self.create(role=role)
            with self.f.rejected(frappe.PermissionError):self.action(name,'revoke',{'reason':'Not authorized'},role=role)
        with acting_as('Guest'),self.f.rejected(frappe.PermissionError):portal.detail(name)

    def test_stale_revoke_after_revision_cannot_affect_successor(self):
        name=self.create()['name'];before=self.load(name)
        child=self.action(name,'revise',{'from_date':str(before.from_date),'to_date':str(before.to_date),'process_scope':'ALL','reason':'Change reviewed authority'})
        with self.f.rejected(frappe.TimestampMismatchError):
            self.action(name,'revoke',{'reason':'Old screen revoke'},expected_version=str(before.modified))
        self.assertFalse(self.load(child['name']).revoked)

    def test_revocation_between_view_and_delegated_approval_denies_action(self):
        name=self.create()['name'];req=self.f.request((1,));self.f.submit(req.name)
        self.assertEqual(delegation.find_delegation(self.f.load(req.name),self.f.users['manager'],self.f.users['delegate']),name)
        self.action(name,'revoke',{'reason':'Stop authority before decision'})
        with self.f.rejected(frappe.PermissionError):self.f.decide(req.name,'delegate')
        self.assertEqual(self.f.load(req.name).approval_steps[0].decision,'Pending')

    def test_projection_and_pagination_never_return_internal_receipts(self):
        name=self.create()['name']
        for i in range(3):
            start=add_days(today_cairo(),100*(i+1))
            self.create(self.data()|{'from_date':str(start),'to_date':str(add_days(start,4))})
        with acting_as(self.f.users['sector']):
            first=portal.listing(company=self.f.company,page_length=2)
            second=portal.listing(company=self.f.company,page_length=2,start=first['next_start'])
            filtered=portal.listing(company=self.f.company,search=name)
        self.assertTrue(first['has_more']);self.assertFalse(second['has_more'])
        self.assertEqual(len({r.name for r in first['rows']+second['rows']}),4)
        self.assertEqual([r.name for r in filtered['rows']],[name])
        for value in [self.detail(name),*first['rows'],*second['rows']]:
            self.assertFalse({'decision_key','revision_key','envelope_json','payload_json'} & set(value))

    def test_participant_directory_is_scoped_paginated_and_minimal(self):
        # More than one page, all in this fixture's explicit department.
        for i in range(4): self.f.actor('lookup'+str(i),['Kandil Approver'])
        with acting_as(self.f.users['sector']):
            args=dict(company=self.f.company,department=self.f.department,kind='delegate',search=self.f.prefix.lower()+'-lookup',page_length=2)
            first=portal.people(**args);second=portal.people(**args,start=first['next_start'])
        self.assertTrue(first['has_more']);self.assertFalse(second['has_more'])
        self.assertEqual({r['id'] for r in first['rows']+second['rows']},{self.f.users['lookup'+str(i)] for i in range(4)})
        self.assertTrue(all(set(r)=={'id','label'} for r in first['rows']+second['rows']))
        user=frappe.get_doc('User',self.f.users['lookup0']);user.enabled=0;user.save(ignore_permissions=True)
        grant=frappe.get_doc('Kandil Access Grant',self.f.grants['lookup1']);grant.revoked=1;grant.save(ignore_permissions=True)
        with acting_as(self.f.users['sector']):
            rows=portal.people(**(args|{'page_length':20}))['rows']
        self.assertEqual({r['id'] for r in rows},{self.f.users['lookup2'],self.f.users['lookup3']})

    def test_participant_directory_denies_plain_manager_and_outside_scope(self):
        with acting_as(self.f.users['manager']),self.f.rejected(frappe.PermissionError):
            portal.people(self.f.company,self.f.department,'delegate')
        with acting_as(self.f.users['sector']),self.f.rejected(frappe.PermissionError):
            portal.people(self.f.company,'Nonexistent outside department','delegate')
        with acting_as('Guest'),self.f.rejected(frappe.PermissionError):
            portal.people(self.f.company,self.f.department,'delegate')

    def test_participant_directory_excludes_board_principals_and_self_delegates(self):
        board=self.f.actor('board',['Kandil Board Approver'])
        # A Sector administrator can also hold an Approver role, but must not
        # use this endpoint to create a grant to themself.
        self.f.actor('lookup_admin',['Kandil Approver','Kandil Sector Approver'])
        with acting_as(self.f.users['lookup_admin']):
            principals=portal.people(self.f.company,self.f.department,'principal',search=board)['rows']
            delegates=portal.people(self.f.company,self.f.department,'delegate',search=self.f.users['lookup_admin'])['rows']
        self.assertEqual(principals,[]);self.assertEqual(delegates,[])

    def test_malformed_fields_fail_without_effects(self):
        invalid=[{'from_user':{}},{'reason':'x'},{'reason':'x'*2001},{'from_date':''},{'from_date':'bad'},
            {'process_scope':'PAYROLL'},{'approved_by':self.f.users['sector']},{'delegation_version':'2'}]
        for bad in invalid:
            with self.subTest(field=next(iter(bad))),self.f.rejected():self.create(self.data()|bad)
        self.assertEqual(frappe.db.count(portal.DT,{'company':self.f.company,'department':self.f.department}),0)
        name=self.create()['name'];before=self.load(name).as_dict()
        base=dict(name=name,operation='revoke',payload={'reason':'Invalid metadata'},expected_version=str(before.modified),command_id=uuid.uuid4().hex)
        for bad in ({'name':{}},{'operation':{}},{'expected_version':None},{'expected_version':'bad'}, {'command_id':'short'},{'payload':'not json'},{'payload':{'reason':'Valid reason','revoked':'0'}}):
            with acting_as(self.f.users['sector']),self.f.rejected():portal.execute(**(base|bad))
        self.assertEqual(before,self.load(name).as_dict())

    def test_audit_failure_rolls_back_create_and_receipt(self):
        key=uuid.uuid4().hex
        with patch.object(portal.delegation_audit,'record',side_effect=frappe.ValidationError('Synthetic audit failure')),self.f.rejected():
            self.create(key=key)
        self.assertEqual(frappe.db.count(portal.DT,{'company':self.f.company,'department':self.f.department}),0)
        self.create(key=key)
        self.assertEqual(frappe.db.count(portal.DT,{'company':self.f.company,'department':self.f.department}),1)


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestPortalDelegations))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
        limits=['Rollback-scoped native adapter checks; delegation browser screens, Board integration and production acceptance remain separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Delegation portal regression failed')
    return value
