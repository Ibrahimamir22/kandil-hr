"""Historical command content, location capture and ordinary-role restrictions."""
import copy
import json
import sys
import unittest

import frappe
from kandil_hr.portal import request_history as history
from kandil_hr.portal.test_api import TestPortalAPI
from kandil_hr.recruitment import api
from kandil_hr.recruitment.test_commands import acting_as


class TestRequestHistory(unittest.TestCase):
    def setUp(self):
        self.base=TestPortalAPI();self.addCleanup(self.base.doCleanups);self.base.setUp();self.f=self.base.f
        self.name=self.base.save()['name'];self.f.submit(self.name)

    def rows(self, role='requester', **args):
        with acting_as(self.f.users[role]):return history.events(self.name, **args)

    def detail(self, event_id, role='requester', **args):
        with acting_as(self.f.users[role]):return history.event(self.name,event_id,**args)

    def audit(self, operation='submit'):
        return frappe.get_all(history.AUDIT,filters=history.filters(self.f.load(self.name))|{'operation':operation},
            fields=['name','operation','envelope_json','actor','principal','occurred_at_iso'],order_by='creation desc')[0]

    def test_submission_before_after_and_location_are_frozen(self):
        row=self.audit();original=row.envelope_json
        value=self.detail(row.name)
        self.assertEqual(value['before']['status'],'Draft');self.assertEqual(value['after']['status'],'Pending')
        self.assertEqual(value['after']['location_capture'],'complete')
        captured=value['after']['position_branch']
        # Direct synthetic DB drift, not a supported organization mutation.
        frappe.db.set_value('Kandil Position',self.f.positions[0],'branch',self.f.branches[1] if hasattr(self.f,'branches') else frappe.db.get_value('Kandil Capacity',self.f.capacities[1],'branch'))
        self.assertEqual(self.detail(row.name)['after']['position_branch'],captured)
        self.assertEqual(frappe.db.get_value(history.AUDIT,row.name,'envelope_json'),original)

    def test_decision_content_survives_return_revision_and_policy_change(self):
        self.f.decide(self.name,'manager',decision='Return',comment='Clarify requirements')
        row=self.audit('decide');old=self.detail(row.name)
        self.f.call('requester',api.revise,self.name,reason='Clarified scope')
        with acting_as(self.f.users['requester']):
            doc=self.f.load(self.name);doc.title='A different title';doc.lines[0].requested_qty=3;doc.save()
        self.f.submit(self.name)
        self.assertEqual(self.detail(row.name),old)
        self.assertTrue(old['reviewed_before_decision'])
        self.assertEqual(old['before']['revision'],1);self.assertEqual(old['before']['lines'][0]['requested_qty'],2)
        self.assertEqual(old['after']['approval_steps'][0]['decision'],'Returned')
        self.assertEqual(old['after']['approval_steps'][0]['comment'],'Clarify requirements')

    def test_actual_frozen_policy_not_current_settings(self):
        row=self.audit();old=self.detail(row.name)['after']['policy']
        frappe.db.set_value('Kandil Recruitment Route',self.f.route.name,'board_after_ceo',not old['board_after_ceo'])
        self.assertEqual(self.detail(row.name)['after']['policy'],old)

    def test_requested_and_hr_proposed_values_are_distinct(self):
        self.f.decide(self.name,'manager')
        self.f.call('hr',api.review,self.name,quantities={self.f.load(self.name).lines[0].name:1},priority='Normal',reason='Reviewed need')
        value=self.detail(self.audit('review').name)
        self.assertEqual(value['before']['lines'][0]['requested_qty'],2)
        self.assertEqual(value['after']['lines'][0]['requested_qty'],2)
        self.assertEqual(value['after']['lines'][0]['proposed_qty'],1)
        self.assertFalse(value['reviewed_before_decision'])

    def test_no_private_envelope_fields_and_no_read_side_effects(self):
        row=self.audit();before=self.f.counts(self.name)
        result=self.detail(row.name);self.rows()
        self.assertEqual(before,self.f.counts(self.name))
        for forbidden in ('envelope_json','receipt_key','payload','related_before','submitted_snapshot','reviewed_snapshot','decision_note'):
            self.assertNotIn('"'+forbidden+'"',json.dumps(result))
        self.assertEqual(set(result['after']['lines'][0]),set(history.LINE_FIELDS)|{'branch'})

    def test_event_identity_bound_to_authorized_request(self):
        other=self.base.save()['name'];self.f.submit(other)
        alien=frappe.get_all(history.AUDIT,filters={'target_name':other},pluck='name')[0]
        with self.f.rejected(frappe.PermissionError):self.detail(alien)
        with self.f.rejected(frappe.PermissionError):self.detail('does-not-exist')

    def test_revoked_access_denies_detail_and_listing(self):
        row=self.audit();grant=frappe.get_doc('Kandil Access Grant',self.f.grants['requester']);grant.revoked=1;grant.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):self.detail(row.name)
        with self.f.rejected(frappe.PermissionError):self.rows()

    def test_narrow_current_branch_cannot_read_previous_branch(self):
        row=self.audit();branch=frappe.db.get_value('Kandil Capacity',self.f.capacities[1],'branch')
        frappe.db.set_value('Kandil Position',self.f.positions[0],'branch',branch)
        frappe.db.set_value('Kandil Capacity',self.f.capacities[0],'branch',branch)
        self.base.replace_requester_grant(branch=branch)
        with self.f.rejected(frappe.PermissionError):self.detail(row.name)
        self.assertEqual(self.rows()['rows'],[])

    def test_missing_old_position_capture_never_uses_current_branch(self):
        row=self.audit();value=json.loads(row.envelope_json)
        for side in ('related_before','related_after'):
            value[side]=[r for r in value[side] if r['doctype']!='Kandil Position']
        row.envelope_json=json.dumps(value)
        with acting_as(self.f.users['requester']):
            _,_,after=history.envelope(row,self.f.load(self.name))
            self.assertIsNone(after['position_branch']);self.assertEqual(after['location_capture'],'partial')
        self.base.replace_requester_grant(branch=frappe.db.get_value('Kandil Capacity',self.f.capacities[0],'branch'))
        with acting_as(self.f.users['requester']),self.f.rejected(frappe.PermissionError):history.envelope(row,self.f.load(self.name))

    def test_unknown_private_fields_are_not_projected(self):
        row=self.audit();value=json.loads(row.envelope_json)
        for side in ('before','after'):
            value[side]['private_hr_note']='DO NOT EXPOSE';value[side]['salary']=99001
        row.envelope_json=json.dumps(value)
        with acting_as(self.f.users['requester']):
            _,before,after=history.envelope(row,self.f.load(self.name))
        self.assertNotIn('DO NOT EXPOSE',json.dumps([before,after]));self.assertNotIn('99001',json.dumps([before,after]))

    def test_restricted_employee_identity_is_redacted_in_both_captures(self):
        row=self.audit();value=json.loads(row.envelope_json)
        employee=frappe.db.get_value('Employee',{'user_id':self.f.users['manager']},'name')
        for side in ('before','after'):value[side]['replacement_employee']=employee
        row.envelope_json=json.dumps(value)
        self.base.replace_requester_grant(can_manage_recruitment=0,can_view_sensitive=0)
        with acting_as(self.f.users['requester']):
            _,before,after=history.envelope(row,self.f.load(self.name))
        self.assertTrue(before['replacement_restricted']);self.assertTrue(after['replacement_restricted'])
        self.assertNotIn(employee,json.dumps([before,after]))

    def test_mismatched_envelope_target_or_historical_department_denied(self):
        original=self.audit()
        for key,value in [('target_name','another-request'),('company','another-company')]:
            row=copy.deepcopy(original);body=json.loads(row.envelope_json);body[key]=value;row.envelope_json=json.dumps(body)
            with acting_as(self.f.users['requester']),self.f.rejected(frappe.PermissionError):history.envelope(row,self.f.load(self.name))
        row=copy.deepcopy(original);body=json.loads(row.envelope_json);body['before']['department']='another-department';row.envelope_json=json.dumps(body)
        with acting_as(self.f.users['requester']),self.f.rejected(frappe.PermissionError):history.envelope(row,self.f.load(self.name))

    def test_pagination_preserves_every_visible_command(self):
        self.f.decide(self.name,'manager',decision='Return',comment='Revise')
        self.f.call('requester',api.revise,self.name,reason='Clarify');self.f.submit(self.name)
        first=self.rows(page_length=2);second=self.rows(start=first['next_start'],page_length=2)
        self.assertTrue(first['has_more']);self.assertFalse(second['has_more'])
        self.assertEqual(len({r['name'] for r in first['rows']+second['rows']}),4)
        self.assertEqual(self.rows(page_length=10000)['next_start'],100)

    def test_guest_and_native_user_permission_denied(self):
        row=self.audit()
        with acting_as('Guest'),self.f.rejected(frappe.PermissionError):history.events(self.name)
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Kandil Position',for_value=self.f.positions[1],apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester'])
        with self.f.rejected(frappe.PermissionError):self.detail(row.name)


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestRequestHistory))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
        limits=['Native command-history adapter checks; revision-source comparisons, browser UI and native legacy history access hardening are separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Request history regression failed')
    return value
