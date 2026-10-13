"""Projected historical identities respect User Permissions without losing content."""
import copy
import json
import sys
import unittest

import frappe
from kandil_hr.portal import request_history as history, request_revisions as revisions
from kandil_hr.portal.test_request_history import TestRequestHistory
from kandil_hr.recruitment.test_commands import acting_as


class TestHistoryIdentities(unittest.TestCase):
    def setUp(self):
        self.base=TestRequestHistory();self.addCleanup(self.base.doCleanups);self.base.setUp()
        self.f=self.base.f;self.name=self.base.name
        self.actor=self.f.insert('User',email=self.f.prefix.lower()+'-former@example.invalid',first_name='Former actor',
            enabled=1,send_welcome_email=0,user_type='System User',roles=[{'role':'Kandil Requester'}]).name
        for user in self.f.users.values():
            self.f.insert('User Permission',user=self.f.users['requester'],allow='User',for_value=user,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester'])

    def test_snapshot_redacts_only_restricted_identity_fields(self):
        row=self.base.audit();value=json.loads(row.envelope_json);snapshot=copy.deepcopy(value['after'])
        snapshot['approval_steps'][0]['actor']=self.actor
        snapshot['approval_steps'][0]['board_member']=self.actor
        route=json.loads(snapshot['route_snapshot']);route['policy']['board_vice_approver']=self.actor
        snapshot['route_snapshot']=json.dumps(route);original=copy.deepcopy(snapshot)
        with acting_as(self.f.users['requester']):
            result=history.project(snapshot,value['related_after'],self.f.load(self.name))
        self.assertIsNone(result['approval_steps'][0]['actor']);self.assertIsNone(result['approval_steps'][0]['board_member'])
        self.assertEqual(result['approval_steps'][0]['restricted_identities'],['actor','board_member'])
        self.assertEqual(result['approval_steps'][0]['principal'],snapshot['approval_steps'][0]['principal'])
        self.assertIsNone(result['policy']['board_vice_approver']);self.assertEqual(result['policy']['restricted_identities'],['board_vice_approver'])
        self.assertEqual(result['lines'][0]['requested_qty'],snapshot['lines'][0]['requested_qty'])
        self.assertNotIn(self.actor,json.dumps(result));self.assertEqual(snapshot,original)

    def test_command_list_detail_metadata_and_capture_hide_same_actor(self):
        row=self.base.audit()
        frappe.db.set_value(history.AUDIT,row.name,{'actor':self.actor,'principal':self.actor})
        with acting_as(self.f.users['requester']):
            page=history.events(self.name);event=history.event(self.name,row.name)
        meta=next(r for r in page['rows'] if r['name']==row.name)
        self.assertIsNone(meta['actor']);self.assertIsNone(meta['principal'])
        self.assertEqual(meta['restricted_identities'],['actor','principal'])
        self.assertEqual(event['event'],meta)
        self.assertEqual(frappe.db.get_value(history.AUDIT,row.name,'actor'),self.actor)

    def test_saved_version_list_and_detail_redact_actor_without_hiding_version(self):
        row=frappe.get_all(revisions.DT,filters={'request':self.name},fields=['name','snapshot_json'])[0]
        frappe.db.set_value(revisions.DT,row.name,'actor',self.actor)
        with acting_as(self.f.users['requester']):
            page=revisions.revisions(self.name);detail=revisions.revision(self.name,row.name)
        meta=next(r for r in page['rows'] if r['name']==row.name)
        self.assertIsNone(meta['actor']);self.assertEqual(meta['restricted_identities'],['actor'])
        self.assertEqual(detail['revision'],{key:meta[key] for key in detail['revision']})
        self.assertEqual(meta['status'],detail['snapshot']['status'])
        self.assertEqual(frappe.db.get_value(revisions.DT,row.name,'snapshot_json'),row.snapshot_json)

    def test_disabled_permitted_actor_is_shown_with_original_identity(self):
        from kandil_hr.portal.history_identities import metadata
        frappe.db.set_value('User',self.f.users['manager'],'enabled',0)
        value=dict(actor=self.f.users['manager'],principal=self.f.users['hr'])
        with acting_as(self.f.users['requester']):result=metadata(value.copy())
        self.assertEqual(result,value)

    def test_policy_and_root_identity_projection_cannot_leak_unknown_users(self):
        from kandil_hr.portal.history_identities import capture
        value=dict(requested_by=self.actor,beneficiary_user=self.actor,lines=[],approval_steps=[],policy={'hr_approver':self.actor})
        with acting_as(self.f.users['requester']):result=capture(value)
        self.assertIsNone(result['requested_by']);self.assertIsNone(result['beneficiary_user'])
        self.assertIsNone(result['policy']['hr_approver']);self.assertNotIn(self.actor,json.dumps(result))

    def test_nonscalar_identity_fails_closed(self):
        from kandil_hr.portal.history_identities import metadata
        with acting_as(self.f.users['requester']),self.f.rejected(frappe.PermissionError):metadata({'actor':{'private':'data'}})


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestHistoryIdentities))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
        limits=['Projected identity fields and metadata; free-text user-authored content is not a semantic redaction engine.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Projected historical identity checks failed')
    return value
