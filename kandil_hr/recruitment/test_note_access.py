"""Current/command/Event correction-note disclosure and immutable capture tests."""
import copy
import json
import sys
import unittest
import uuid

import frappe
from frappe.client import get, get_list
from kandil_hr.recruitment.test_history_access import TestHistoryAccess
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.note_projection import shared_note, execute
from kandil_hr.recruitment.corrections import correct_approved


class TestNoteAccess(unittest.TestCase):
    def setUp(self):
        self.base=TestHistoryAccess(); self.addCleanup(self.base.doCleanups); self.base.setUp()
        self.f=self.base.f;self.name=self.base.name

    def correction(self):
        self.f.approve_all(self.name)
        result=self.f.call('hr',correct_approved,self.name,reason='تصحيح متطلبات الوظيفة / Correct requirements',
                           fields={'qualifications':'Synthetic qualification'})
        return result, frappe.get_all('Kandil Recruitment Event',filters={'request':self.name,'action':'HR correction'},
                                     fields=['name','note','snapshot','public_note','modified'])[0]

    def events(self):
        with acting_as(self.f.users['requester']):
            return get_list('Kandil Recruitment Event',filters={'request':self.name},fields=['*'])

    def test_plain_and_encoded_notes_have_a_safe_text_projection(self):
        for text in ('Approved', 'تم الاعتماد', '<img src=x onerror="alert(1)"> literal'):
            self.assertEqual(shared_note(text),text)
        self.assertEqual(shared_note(json.dumps({'reason':'Reason','before':{'secret':1}})), 'Reason')
        for value in (None,{},'{}','[]','{"reason":{}}','{"reason":[]}','{"broken":','"encoded"'):
            self.assertEqual(shared_note(value),'')

    def test_current_request_and_event_native_reads_keep_reason_not_payload(self):
        result,event=self.correction()
        raw=frappe.db.get_value('Kandil Hiring Request',self.name,'decision_note')
        reason=json.loads(raw)['reason']
        for role in ('requester','manager','hr'):
            with acting_as(self.f.users[role]):
                request=get('Kandil Hiring Request',self.name)
                self.assertFalse(request.get('decision_note'))
                self.assertEqual(request['decision_reason'],reason)
                row=get('Kandil Recruitment Event',event.name)
                self.assertFalse(row.get('note'))
                self.assertEqual(row['public_note'],reason)
                self.assertEqual(row['snapshot'],event.snapshot)
                rows=get_list('Kandil Recruitment Event',filters={'name':event.name},fields=['*'])
                self.assertEqual(len(rows),1);self.assertNotIn('note',rows[0])
                from kandil_hr.recruitment.review_views import timeline
                item=next(x for x in timeline(self.name)['events'] if x.name==event.name)
                self.assertEqual(item.note,reason)
        self.assertEqual(event.note,raw)
        self.assertEqual(frappe.db.get_value('Kandil Recruitment Event',event.name,'note'),raw)

    def test_correction_command_and_receipt_replay_project_without_rewriting_receipt(self):
        self.f.approve_all(self.name)
        key=uuid.uuid4().hex;version=self.f.load(self.name).modified
        values=dict(command_id=key,expected_version=version,reason='Safe explanation',fields={'qualifications':'Synthetic corrected'})
        with acting_as(self.f.users['hr']):
            first=correct_approved(self.name,**values);second=correct_approved(self.name,**values)
        self.assertEqual(frappe.as_json(first),frappe.as_json(second));self.assertEqual(first['decision_note'],'Safe explanation')
        self.assertEqual(first['decision_reason'],'Safe explanation')
        self.assertNotIn('route_snapshot',first)
        stored=frappe.db.get_value('Kandil Hiring Request',self.name,'decision_note')
        self.assertIn('before',json.loads(stored));self.assertIn('after',json.loads(stored))
        from kandil_hr.recruitment.privacy import command_response
        legacy={'doctype':'Kandil Hiring Request','decision_note':stored,'approval_steps':[]}
        original=copy.deepcopy(legacy)
        with acting_as(self.f.users['hr']):self.assertEqual(command_response(legacy)['decision_note'],'Safe explanation')
        self.assertEqual(legacy,original)

    def test_backfill_preserves_raw_notes_snapshots_and_modified_dates(self):
        _,event=self.correction()
        request=self.f.load(self.name)
        frappe.db.set_value('Kandil Hiring Request',self.name,'decision_reason','',update_modified=False)
        frappe.db.set_value('Kandil Recruitment Event',event.name,'public_note','',update_modified=False)
        execute();execute()
        current=self.f.load(self.name)
        self.assertEqual(current.modified,request.modified);self.assertEqual(current.decision_note,request.decision_note)
        after=frappe.get_doc('Kandil Recruitment Event',event.name)
        self.assertEqual(after.modified,event.modified);self.assertEqual(after.note,event.note);self.assertEqual(after.snapshot,event.snapshot)
        self.assertEqual(after.public_note,json.loads(event.note)['reason'])

    def test_derived_note_cannot_be_forged_on_draft(self):
        other=self.base.base.save()['name']
        with acting_as(self.f.users['requester']):
            doc=self.f.load(other);doc.decision_reason='Forged CEO approval';doc.save()
        self.assertEqual(self.f.load(other).decision_reason,'')

    def test_correction_captures_obey_historical_reference_permission(self):
        _,event=self.correction()
        revision=frappe.get_all('Kandil Request Revision',filters={'request':self.name,'action':'HR correction'},fields=['name','snapshot_json'])[0]
        value=json.loads(revision.snapshot_json);note=json.loads(value['decision_note'])
        note['before']['lines'][0]['capacity']=self.f.capacities[1]
        note['before']['lines'][0]['job_opening']=None
        # Keep this synthetic previous capture coherent, including its recorded basis.
        route=json.loads(note['before']['route_snapshot'])
        route['headcount_basis'][self.f.capacities[1]]=route['headcount_basis'].pop(self.f.capacities[0])
        note['before']['route_snapshot']=json.dumps(route)
        value['decision_note']=json.dumps(note)
        frappe.db.set_value('Kandil Request Revision',revision.name,'snapshot_json',json.dumps(value))
        # Before restricting the old location, raw bytes are still readable.
        with acting_as(self.f.users['requester']):self.assertEqual(json.loads(get('Kandil Request Revision',revision.name)['snapshot_json']),value)
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Kandil Capacity',for_value=self.f.capacities[0],apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester'])
        with acting_as(self.f.users['requester']):
            with self.f.rejected(frappe.PermissionError):get('Kandil Request Revision',revision.name)
            self.assertEqual(get_list('Kandil Request Revision',filters={'name':revision.name},fields=['name']),[])
            self.assertEqual(get('Kandil Hiring Request',self.name)['decision_reason'],note['reason'])
            self.assertEqual(get('Kandil Recruitment Event',event.name)['public_note'],note['reason'])

    def test_malformed_or_recursive_correction_captures_are_denied(self):
        _,_=self.correction()
        revision=frappe.get_all('Kandil Request Revision',filters={'request':self.name,'action':'HR correction'},fields=['name','snapshot_json'])[0]
        original=json.loads(revision.snapshot_json)
        for mutation in ('reason','missing','extra','recursive'):
            value=copy.deepcopy(original);note=json.loads(value['decision_note'])
            if mutation=='reason':note['reason']={'private':1}
            elif mutation=='missing':note.pop('before')
            elif mutation=='extra':note['before']['private_salary']=100
            else:note['before']['decision_note']=json.dumps({'before':{'private':1}})
            value['decision_note']=json.dumps(note)
            frappe.db.set_value('Kandil Request Revision',revision.name,'snapshot_json',json.dumps(value))
            with acting_as(self.f.users['requester']),self.f.rejected(frappe.PermissionError):get('Kandil Request Revision',revision.name)

    def test_events_respect_parent_native_user_permission(self):
        events=self.events();self.assertTrue(events)
        other=self.base.base.save()['name']
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Kandil Hiring Request',for_value=other,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester'])
        self.assertEqual(self.events(),[])
        with acting_as(self.f.users['requester']),self.f.rejected(frappe.PermissionError):get('Kandil Recruitment Event',events[0].name)

    def test_event_snapshot_checks_old_capacity_and_attached_file_metadata(self):
        event=self.events()[0];value=json.loads(event.snapshot);value['lines'][0]['capacity']=self.f.capacities[1]
        frappe.db.set_value('Kandil Recruitment Event',event.name,'snapshot',json.dumps(value))
        file=self.base.revision_attachment()
        frappe.db.set_value('File',file.name,{'attached_to_doctype':'Kandil Recruitment Event','attached_to_name':event.name})
        with acting_as(self.f.users['requester']):
            self.assertEqual(len(get_list('File',filters={'name':file.name},fields=['name'])),1)
            self.assertEqual(get('Kandil Recruitment Event',event.name)['snapshot'],json.dumps(value))
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Kandil Capacity',for_value=self.f.capacities[0],apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester'])
        with acting_as(self.f.users['requester']):
            self.assertEqual(get_list('Kandil Recruitment Event',filters={'name':event.name},fields=['name']),[])
            self.assertEqual(get_list('File',filters={'name':file.name},fields=['name','file_url']),[])
            with self.f.rejected(frappe.PermissionError):get('Kandil Recruitment Event',event.name)
            with self.f.rejected(frappe.PermissionError):get('File',file.name)

    def test_event_snapshot_unknown_private_keys_are_denied(self):
        event=self.events()[0];value=json.loads(event.snapshot);value['private_hr_note']={'secret':1}
        frappe.db.set_value('Kandil Recruitment Event',event.name,'snapshot',json.dumps(value))
        with acting_as(self.f.users['requester']):
            self.assertEqual(get_list('Kandil Recruitment Event',filters={'name':event.name},fields=['name']),[])
            with self.f.rejected(frappe.PermissionError):get('Kandil Recruitment Event',event.name)


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestNoteAccess))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
        limits=['Synthetic note/read/command/replay/backfill and captured correction/Event access. Full route identities and production security acceptance remain open.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Note access regressions failed')
    return value


def prepare_schema():
    """Explicit CLI-only schema rehearsal on the synthetic parity site."""
    import hashlib
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    def digest():
        result={}
        for kind, fields in (('Kandil Hiring Request',['name','decision_note','modified']),
                             ('Kandil Recruitment Event',['name','note','snapshot','modified']),
                             ('Kandil Request Revision',['name','snapshot_json','modified'])):
            rows=frappe.get_all(kind,fields=fields,order_by='name asc',limit_page_length=0)
            result[kind]={'rows':len(rows),'sha256':hashlib.sha256(frappe.as_json(rows).encode()).hexdigest()}
        return result
    before=digest()
    for kind in ('kandil_hiring_request','kandil_recruitment_event'):
        frappe.reload_doc('kandil_hr','doctype',kind,force=True)
    execute()
    after=digest()
    if before!=after:raise AssertionError('Raw audit content changed')
    frappe.db.commit()
    return {'site':frappe.local.site,'raw_notes_snapshots_and_modified_unchanged':True,'records':after,'derived_fields_backfilled':True}
