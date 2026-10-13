"""Structured vacancy history shape/reference checks; isolated rollback fixtures."""
import copy
import json
import sys
import unittest

import frappe
from frappe.client import get, get_list
from kandil_hr.recruitment import vacancies, ownership
from kandil_hr.recruitment.test_history_access import TestHistoryAccess
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.test_handoff_audit import TestHandoffAudit


class TestHistoryNotes(unittest.TestCase):
    def setUp(self):
        self.base=TestHistoryAccess();self.addCleanup(self.base.doCleanups);self.base.setUp()
        self.f=self.base.f;self.name=self.base.name
        self.f.approve_all(self.name)
        self.opening=self.f.load(self.name).lines[0].job_opening
        self.f.call('hr',vacancies.assign_team,self.name,opening_name=self.opening,
                    lead=self.f.users['hr'],members=[],reason='Synthetic shared vacancy assignment')
        self.revision=frappe.get_all('Kandil Request Revision',filters={'request':self.name,'action':'Recruiter team changed'},fields=['name','snapshot_json'])[0]
        self.original=self.revision.snapshot_json;self.value=json.loads(self.original)
        self.note=json.loads(self.value['decision_note'])

    def store(self):
        self.value['decision_note']=json.dumps(self.note)
        self.raw=json.dumps(self.value)
        frappe.db.set_value('Kandil Request Revision',self.revision.name,'snapshot_json',self.raw)

    def read(self,role='requester'):
        with acting_as(self.f.users[role]):return get('Kandil Request Revision',self.revision.name)

    def denied(self):
        with acting_as(self.f.users['requester']):
            self.assertEqual(get_list('Kandil Request Revision',filters={'name':self.revision.name},fields=['name','snapshot_json']),[])
            with self.f.rejected(frappe.PermissionError):get('Kandil Request Revision',self.revision.name)
        self.assertEqual(frappe.db.get_value('Kandil Request Revision',self.revision.name,'snapshot_json'),self.raw)

    def permission(self,kind,values):
        for value in values:self.f.insert('User Permission',user=self.f.users['requester'],allow=kind,for_value=value,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester'])

    def former(self):
        return self.f.insert('User',email=self.f.prefix.lower()+'-former@example.invalid',first_name='Former synthetic recruiter',enabled=1,send_welcome_email=0,user_type='System User',roles=[{'role':'Kandil Recruiter'}]).name

    def test_new_shared_snapshot_projects_team_user_only(self):
        opening=frappe.get_doc('Job Opening',self.opening)
        self.assertTrue(opening.custom_kandil_team)
        opening.custom_kandil_team[0].private_salary='Do not capture'
        value=vacancies.vacancy_snapshot(opening,self.f.load(self.name))
        self.assertEqual(value['custom_kandil_team'],[{'user':r.user} for r in opening.custom_kandil_team])
        for role in ('requester','manager','hr'):
            self.assertEqual(self.read(role)['snapshot_json'],self.original)

    def test_legacy_team_metadata_stays_readable_when_allowed(self):
        self.note['after']['custom_kandil_team']=[dict(user=self.f.users['hr'],name='retained-child-id',
            doctype='Kandil Recruiter Member',parent=self.opening,parenttype='Job Opening',parentfield='custom_kandil_team',
            idx=1,owner=self.f.users['hr'],modified_by=self.f.users['hr'],creation='2026-10-01',modified='2026-10-01',docstatus=0)]
        self.store();self.assertEqual(self.read()['snapshot_json'],self.raw)

    def test_unknown_private_fields_and_nested_scalars_fail_closed(self):
        original=copy.deepcopy(self.note)
        for path in ('root','before','team','scalar','array','malformed'):
            self.note=copy.deepcopy(original)
            if path=='root':self.note['applications']=[{'private_contact':'Do not expose'}]
            elif path=='before':self.note['before']['private_salary']='Do not expose'
            elif path=='team':self.note['after']['custom_kandil_team'][0]['private_salary']='Do not expose'
            elif path=='scalar':self.note['after']['custom_kandil_pin_reason']={'private':'Do not expose'}
            elif path=='array':self.note=['Do not expose']
            self.store()
            if path=='malformed':
                self.value['decision_note']='{"broken":';self.raw=json.dumps(self.value)
                frappe.db.set_value('Kandil Request Revision',self.revision.name,'snapshot_json',self.raw)
            self.denied()

    def test_lead_team_and_initiator_restrictions_apply_inside_notes(self):
        actor=self.former();original=copy.deepcopy(self.note)
        self.permission('User',list(self.f.users.values()))
        for path in ('lead','team','owner','modified_by','initiated_by'):
            self.note=copy.deepcopy(original)
            if path=='lead':self.note['before']['custom_kandil_lead']=actor
            elif path=='team':self.note['before']['custom_kandil_team']=[{'user':actor}]
            elif path in ('owner','modified_by'):self.note['after']['custom_kandil_team'][0][path]=actor
            else:self.note[path]=actor
            self.store();self.denied()

    def test_disabled_historical_recruiter_remains_valid_identity(self):
        actor=self.former();self.note['before']['custom_kandil_team']=[{'user':actor}]
        self.store();frappe.db.set_value('User',actor,'enabled',0)
        self.assertEqual(self.read()['snapshot_json'],self.raw)

    def test_opening_must_belong_to_this_capture_and_request(self):
        original=copy.deepcopy(self.note)
        for key in ('before','after'):
            self.note=copy.deepcopy(original);self.note[key]['name']='not-this-opening';self.store();self.denied()

    def test_legacy_child_cannot_reference_another_parent(self):
        for key,value in [('parent','some-other-opening'),('parenttype','Job Applicant'),('doctype','Unknown Private Child'),('parentfield','private_children')]:
            self.note=json.loads(json.loads(self.original)['decision_note'])
            self.note['after']['custom_kandil_team'][0][key]=value;self.store();self.denied()

    def test_revision_attachment_metadata_follows_structured_note_denial(self):
        self.base.revision=self.revision
        file=self.base.revision_attachment()
        self.assertEqual(len(self.base.file_listing(file)),1)
        self.note['after']['custom_kandil_team'][0]['private_salary']='Do not expose'
        self.store();self.assertEqual(self.base.file_listing(file),[])
        with acting_as(self.f.users['requester']):
            self.assertFalse(frappe.get_doc('File',file.name).is_downloadable())
            with self.f.rejected(frappe.PermissionError):get('File',file.name)

    def test_invocation_payload_schema_and_historical_user_are_checked(self):
        actor=self.former()
        self.note['invocation']=dict(command='kandil_hr.recruitment.ownership.handoff_disabled_user',
            origin='system_invocation',actor=self.f.users['hr'],principal=self.f.users['hr'],executor='Administrator',
            invocation_id='synthetic-only',at='2026-10-13',payload={'user':actor,'actor':self.f.users['hr'],'reason':'Account disabled'})
        self.store();self.assertEqual(self.read()['snapshot_json'],self.raw)
        original=copy.deepcopy(self.note)
        self.note['invocation']['payload']['private_contact']='Do not expose';self.store();self.denied()
        self.note=original;self.store();self.permission('User',list(self.f.users.values()));self.denied()

    def test_plain_comments_and_empty_notes_keep_original_contract(self):
        for value in ('Approved', 'تم الاعتماد', '123', None, ''):
            self.value['decision_note']=value;raw=json.dumps(self.value)
            frappe.db.set_value('Kandil Request Revision',self.revision.name,'snapshot_json',raw)
            self.assertEqual(self.read()['snapshot_json'],raw)

    def test_native_event_actor_and_principal_user_permissions(self):
        event=frappe.get_all('Kandil Recruitment Event',filters={'request':self.name},fields=['name','actor','principal'])[0]
        actor=self.former();self.permission('User',list(self.f.users.values()))
        for field in ('actor','principal'):
            frappe.db.set_value('Kandil Recruitment Event',event.name,dict(actor=event.actor,principal=event.principal))
            frappe.db.set_value('Kandil Recruitment Event',event.name,field,actor)
            with acting_as(self.f.users['requester']):
                self.assertEqual(get_list('Kandil Recruitment Event',filters={'name':event.name},fields=['name','actor','principal']),[])
                with self.f.rejected(frappe.PermissionError):get('Kandil Recruitment Event',event.name)


class TestHandoffNoteRead(unittest.TestCase):
    def setUp(self):
        self.base=TestHandoffAudit();self.addCleanup(self.base.doCleanups);self.base.setUp();self.f=self.base.f

    def test_actual_handoff_note_readable_without_candidate_private_values(self):
        note,_=self.base.cleanup(self.f.users['hr'])
        revision=frappe.get_all('Kandil Request Revision',filters={'request':self.base.request,'action':'Disabled recruiter unassigned'},fields=['name','snapshot_json'])[0]
        with acting_as(self.f.users['requester']):
            self.assertEqual(get('Kandil Request Revision',revision.name)['snapshot_json'],revision.snapshot_json)
        self.assertNotIn(self.base.secret_task,revision.snapshot_json)

    def test_unknown_scheduler_label_not_a_required_user_account(self):
        self.base.cleanup()
        revision=frappe.get_all('Kandil Request Revision',filters={'request':self.base.request,'action':'Disabled recruiter unassigned'},fields=['name','snapshot_json'])[0]
        with acting_as(self.f.users['requester']):
            self.assertEqual(get('Kandil Request Revision',revision.name)['snapshot_json'],revision.snapshot_json)


class TestJoiningNoteRead(unittest.TestCase):
    def setUp(self):
        from kandil_hr.recruitment.test_joining_corrections import TestJoiningCorrections
        self.base=TestJoiningCorrections();self.addCleanup(self.base.doCleanups);self.base.setUp()
        self.f=self.base.f;self.base.void()
        self.row=frappe.get_all('Kandil Request Revision',filters={'request':self.base.name,'action':'Joining voided'},fields=['name','snapshot_json'])[0]

    def test_authorized_hr_reads_exact_reversal_bytes_requester_gets_safe_projection(self):
        with acting_as(self.f.users['hr']):
            self.assertEqual(get('Kandil Request Revision',self.row.name)['snapshot_json'],self.row.snapshot_json)
        with acting_as(self.f.users['requester']):
            self.assertEqual(get_list('Kandil Request Revision',filters={'name':self.row.name},fields=['name']),[])
            with self.f.rejected(frappe.PermissionError):get('Kandil Request Revision',self.row.name)
            from kandil_hr.portal.api import detail
            result=detail(self.base.name)
            self.assertTrue(any(e.note=='Incorrect synthetic joining entry' for e in result['timeline']['events']))
            self.assertNotIn(self.base.offer,json.dumps(result,default=str))

    def test_mismatched_joining_reference_and_unknown_field_denied(self):
        original=json.loads(self.row.snapshot_json)
        for field in ('employee','offer','private_pay'):
            value=copy.deepcopy(original);note=json.loads(value['decision_note']);note['before'][field]='not-this-record'
            value['decision_note']=json.dumps(note);raw=json.dumps(value)
            frappe.db.set_value('Kandil Request Revision',self.row.name,'snapshot_json',raw)
            with acting_as(self.f.users['hr']),self.f.rejected(frappe.PermissionError):get('Kandil Request Revision',self.row.name)
            self.assertEqual(frappe.db.get_value('Kandil Request Revision',self.row.name,'snapshot_json'),raw)

    def test_native_assignment_permission_restricts_reversal_history(self):
        other=frappe.db.get_value('Kandil Position Assignment',{'name':['!=',self.base.joined['assignment']],'company':self.f.company},'name')
        self.assertTrue(other)
        self.f.insert('User Permission',user=self.f.users['hr'],allow='Kandil Position Assignment',for_value=other,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['hr'])
        with acting_as(self.f.users['hr']),self.f.rejected(frappe.PermissionError):get('Kandil Request Revision',self.row.name)


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    suite=unittest.TestSuite(unittest.defaultTestLoader.loadTestsFromTestCase(t) for t in (TestHistoryNotes,TestHandoffNoteRead,TestJoiningNoteRead))
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(suite)
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
        limits=['Synthetic native raw structured-note and Event identity checks; not full S3 acceptance or production security certification.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Structured history notes failed')
    return value
