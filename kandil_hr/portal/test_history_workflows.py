"""Correction, quantity restart and retained authority-history acceptance."""
import json
import sys
import unittest

import frappe
from kandil_hr.portal import request_history as history, request_revisions as revisions
from kandil_hr.recruitment import api
from kandil_hr.recruitment.corrections import correct_approved
from kandil_hr.recruitment.pending_revision import revise_pending_quantities
from kandil_hr.recruitment.test_authority_audit import TestAuthorityAudit
from kandil_hr.recruitment.test_commands import acting_as


class TestHistoryWorkflows(unittest.TestCase):
    def setUp(self):
        self.a=TestAuthorityAudit();self.addCleanup(self.a.doCleanups);self.a.setUp();self.f=self.a.f
        self.doc=self.f.request((2,))
        self.f.submit(self.doc.name)

    def row(self, operation, name=None):
        return frappe.get_all(history.AUDIT,filters={'target_name':name or self.doc.name,'operation':operation},
            fields=['name','envelope_json'],order_by='creation desc')[0]

    def read(self, row, role='requester', name=None):
        with acting_as(self.f.users[role]):return history.event(name or self.doc.name,row.name)

    def test_approved_correction_shows_public_reason_and_preserves_original_decision(self):
        self.f.approve_all(self.doc.name)
        decision=self.row('decide');original=self.read(decision)
        line=self.f.load(self.doc.name).lines[0]
        self.f.call('hr',correct_approved,self.doc.name,reason='Reduced staffing need',
            fields={'qualifications':'Updated requirements'},quantities={line.name:1})
        value=self.read(self.row('hr_correction'))
        self.assertEqual(value['action'],dict(reason='Reduced staffing need',approval_restart=False,no_change=False))
        self.assertEqual(value['before']['revision'],1);self.assertEqual(value['after']['revision'],2)
        self.assertEqual(value['before']['lines'][0]['approved_qty'],2)
        self.assertEqual(value['after']['lines'][0]['approved_qty'],1)
        self.assertEqual(value['after']['lines'][0]['requested_qty'],2)
        self.assertEqual(value['after']['qualifications'],'Updated requirements')
        self.assertEqual(self.read(decision),original)
        self.assertEqual(frappe.db.get_value(history.AUDIT,decision.name,'envelope_json'),decision.envelope_json)
        self.assertNotIn('decision_note',json.dumps(value))

    def test_relocation_retains_both_recorded_location_sides(self):
        self.f.approve_all(self.doc.name);line=self.f.load(self.doc.name).lines[0]
        self.f.call('hr',correct_approved,self.doc.name,reason='Relocate open seats',relocations={line.name:self.f.capacities[1]})
        value=self.read(self.row('hr_correction'))
        self.assertEqual(value['before']['lines'][0]['capacity'],self.f.capacities[0])
        self.assertEqual(value['before']['lines'][0]['approved_qty'],2)
        self.assertEqual(value['after']['lines'][0]['approved_qty'],0)
        self.assertEqual(value['after']['lines'][1]['capacity'],self.f.capacities[1])
        self.assertEqual(value['after']['lines'][1]['approved_qty'],2)
        self.assertNotEqual(value['before']['lines'][0]['branch'],value['after']['lines'][1]['branch'])

    def test_pending_change_retains_old_approval_and_records_restart(self):
        self.f.decide(self.doc.name,'manager');old=self.row('decide');captured=self.read(old)
        line=self.f.load(self.doc.name).lines[0]
        self.f.call('requester',revise_pending_quantities,self.doc.name,quantities={line.name:3},reason='Three people now needed')
        value=self.read(self.row('revise_pending_quantities'))
        self.assertEqual(value['action'],dict(reason='Three people now needed',approval_restart=True,no_change=False))
        self.assertEqual(value['before']['lines'][0]['reserved_qty'],2)
        self.assertEqual(value['after']['lines'][0]['reserved_qty'],3)
        self.assertEqual(value['before']['approval_steps'][0]['decision'],'Approved')
        self.assertTrue(all(s['decision']=='Pending' for s in value['after']['approval_steps']))
        self.assertEqual((value['before']['revision'],value['after']['revision']),(1,2))
        self.assertEqual(self.read(old),captured)

    def test_noop_quantities_do_not_hide_saved_version_or_claim_restart(self):
        self.f.decide(self.doc.name,'manager')
        saved=frappe.get_all(revisions.DT,filters={'request':self.doc.name},pluck='name',order_by='creation desc')[0]
        with acting_as(self.f.users['requester']):before=revisions.revision(self.doc.name,saved)
        doc=self.f.load(self.doc.name);count=frappe.db.count(revisions.DT,{'request':doc.name})
        self.f.call('requester',revise_pending_quantities,doc.name,quantities={doc.lines[0].name:2},reason='Same need confirmed')
        value=self.read(self.row('revise_pending_quantities'))
        self.assertEqual(value['action'],dict(reason='Same need confirmed',approval_restart=False,no_change=True))
        self.assertEqual(value['before'],value['after'])
        self.assertEqual(frappe.db.count(revisions.DT,{'request':doc.name}),count)
        with acting_as(self.f.users['requester']):self.assertEqual(revisions.revision(doc.name,saved),before)

    def test_board_proof_and_member_survive_new_round_and_correction(self):
        doc=self.a.reach_board(self.a.request());proof=self.a.proof(doc)
        self.f.decide(doc.name,'sector',decision='Return',comment='Clarify original need',board_member=self.f.users['vice'],
            board_evidence=proof.name,on_behalf_method='PHONE',on_behalf_note='Vice reviewed the original request')
        old=self.row('decide',doc.name);captured=self.read(old,'chair',doc.name)
        self.f.call('requester',api.revise,doc.name,reason='Clarified');self.f.submit(doc.name)
        for role in ('manager','hr','ceo','vice'):self.f.decide(doc.name,role)
        self.f.call('hr',correct_approved,doc.name,reason='Updated job conditions',fields={'working_conditions':'Day shift'})
        for role in ('chair','vice','ceo','hr','requester'):
            value=self.read(old,role,doc.name)
            self.assertEqual(value['event']['actor'],self.f.users['sector'])
            self.assertEqual(value['event']['principal'],self.f.users['vice'])
            self.assertEqual(value['after']['status'],'Returned')
            self.assertEqual(value['after']['approval_steps'][-1]['proof']['name'],proof.name)
            self.assertEqual(value['before']['revision'],1)
        self.assertEqual(self.read(old,'chair',doc.name),captured)
        self.assertEqual(frappe.db.get_value(history.AUDIT,old.name,'envelope_json'),old.envelope_json)

    def test_proof_becomes_restricted_without_exposing_an_alien_file(self):
        doc=self.a.reach_board(self.a.request());proof=self.a.proof(doc)
        self.f.decide(doc.name,'chair',board_evidence=proof.name)
        row=self.row('decide',doc.name)
        # Explicit corrupt legacy target; supported File edits prohibit this.
        frappe.db.set_value('File',proof.name,'attached_to_name',self.doc.name)
        value=self.read(row,'vice',doc.name);step=value['after']['approval_steps'][-1]
        self.assertIsNone(step['proof']);self.assertTrue(step['proof_restricted'])
        self.assertNotIn(proof.name,json.dumps(value));self.assertNotIn(proof.file_url,json.dumps(value))

    def test_reason_projection_does_not_return_other_payload_fields(self):
        row=self.row('submit');value=json.loads(row.envelope_json)
        value['payload']={'reason':'Shared explanation','private_notes':'NEVER SHARE','salary':'NEVER SHARE'}
        frappe.db.set_value(history.AUDIT,row.name,'envelope_json',json.dumps(value))
        result=self.read(row)
        self.assertEqual(result['action']['reason'],'Shared explanation')
        self.assertNotIn('NEVER SHARE',json.dumps(result));self.assertNotIn('"payload"',json.dumps(result))
        value['payload']['reason']={'private_notes':'NEVER SHARE'}
        frappe.db.set_value(history.AUDIT,row.name,'envelope_json',json.dumps(value))
        with self.f.rejected(frappe.PermissionError):self.read(row)


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestHistoryWorkflows))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
               limits=['Synthetic native correction/restart/retained-proof history; browser acceptance and native raw history audit remain separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('History workflows failed')
    return value
