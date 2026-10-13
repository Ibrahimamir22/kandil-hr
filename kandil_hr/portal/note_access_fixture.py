"""Personal HTTP note/read fixture; CLI-only synthetic parity cohort."""
import hashlib
import uuid
from pathlib import Path

import frappe
from kandil_hr.portal import api, fixture
from kandil_hr.portal.route_preview_fixture import load
from kandil_hr.portal.request_operations_fixture import cleanup
from kandil_hr.recruitment import api as commands
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as


def prepare(run_id):
    guard(run_id);fixture.prepare(run_id);data=load(run_id)
    with acting_as(data['users']['requester']['email']):
        request=api.save_draft(dict(company=data['company'],department=data['department'],
            title='Synthetic correction note '+run_id,requested_position=data['positions'][0],
            need_reason='Expansion',requested_priority='Normal',
            lines=[dict(capacity=data['capacities'][0],requested_qty=2)]),uuid.uuid4().hex)
        commands.submit_request(request['name'],uuid.uuid4().hex,request['modified'])
    for role in ('manager','hr'):
        with acting_as(data['users'][role]['email']):
            doc=frappe.get_doc('Kandil Hiring Request',request['name'])
            step=next(x for x in doc.approval_steps if x.decision=='Pending')
            commands.decide(name=doc.name,command_id=uuid.uuid4().hex,expected_version=str(doc.modified),
                            step_id=step.step_key,decision='Approve',comment='Synthetic reviewed')
    event=frappe.get_all('Kandil Recruitment Event',filters={'request':request['name']},pluck='name',order_by='creation asc')[0]
    name='synthetic-event-file-'+run_id;content='Synthetic retained event attachment '+run_id
    file=frappe.get_doc(dict(doctype='File',name=name,file_name=name+'.txt',file_url='/private/files/'+name+'.txt',
        is_private=1,is_folder=0,attached_to_doctype='Kandil Recruitment Event',attached_to_name=event,
        owner=data['users']['requester']['email']))
    file.db_insert();Path(frappe.get_site_path('private','files',file.file_name)).write_text(content)
    data['note_case']=dict(request=request['name'],event=event,file=file.name,file_url=file.file_url,content=content,
        version=str(frappe.db.get_value('Kandil Hiring Request',request['name'],'modified')))
    persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(run_id=run_id,prepared=True,accounts=len(data['users']),credentials='private-file-only')


def capture(run_id):
    guard(run_id);data=load(run_id);name=data['note_case']['request']
    revision=frappe.get_all('Kandil Request Revision',filters={'request':name,'action':'HR correction'},fields=['name','snapshot_json'])[0]
    event=frappe.get_all('Kandil Recruitment Event',filters={'request':name,'action':'HR correction'},fields=['name','note','public_note'])[0]
    data['note_case'].update(correction_event=event.name,revision=revision.name,
        snapshot_sha256=hashlib.sha256(revision.snapshot_json.encode()).hexdigest(),
        note_sha256=hashlib.sha256(event.note.encode()).hexdigest(),reason=event.public_note)
    persist(fixture.path_for(run_id),data)
    return dict(captured=True,correction_event=event.name,revision=revision.name,snapshot_sha256=data['note_case']['snapshot_sha256'])


def restrict(run_id):
    guard(run_id);data=load(run_id)
    frappe.get_doc(dict(doctype='User Permission',user=data['users']['requester']['email'],
        allow='Kandil Recruitment Event',for_value=data['note_case']['correction_event'],apply_to_all_doctypes=1)).insert(ignore_permissions=True)
    frappe.clear_cache(user=data['users']['requester']['email']);frappe.db.commit()
    return dict(restricted=True)


def inspect(run_id):
    guard(run_id);data=load(run_id);case=data['note_case']
    revision=frappe.db.get_value('Kandil Request Revision',case['revision'],'snapshot_json')
    note=frappe.db.get_value('Kandil Recruitment Event',case['correction_event'],'note')
    current=frappe.db.get_value('Kandil Hiring Request',case['request'],'decision_note')
    return dict(snapshot_unchanged=hashlib.sha256(revision.encode()).hexdigest()==case['snapshot_sha256'],
        note_unchanged=hashlib.sha256(note.encode()).hexdigest()==case['note_sha256'],current_matches_audit=current==note)
