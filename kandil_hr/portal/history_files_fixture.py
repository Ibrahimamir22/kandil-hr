"""CLI-only legacy revision attachment fixture for personal-session HTTP checks."""
import hashlib
import json
import uuid
from pathlib import Path

import frappe
from kandil_hr.portal import api, fixture
from kandil_hr.portal.route_preview_fixture import load
from kandil_hr.portal.request_operations_fixture import cleanup as base_cleanup
from kandil_hr.recruitment import api as commands
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as


def prepare(run_id):
    guard(run_id); fixture.prepare(run_id); data=load(run_id)
    with acting_as(data['users']['requester']['email']):
        request=api.save_draft(dict(company=data['company'],department=data['department'],
            title='Synthetic revision file '+run_id,requested_position=data['positions'][0],
            need_reason='Expansion',requested_priority='Normal',
            lines=[dict(capacity=data['capacities'][0],requested_qty=2)]),uuid.uuid4().hex)
        commands.submit_request(request['name'],uuid.uuid4().hex,request['modified'])
    revision=frappe.get_all('Kandil Request Revision',filters={'request':request['name']},
        fields=['name','snapshot_json'],order_by='creation asc')[0]
    name='synthetic-history-file-'+run_id
    content='Synthetic retained revision attachment '+run_id
    # Ordinary users cannot write immutable revisions. Model a retained legacy
    # File record directly, within this explicitly guarded synthetic fixture.
    file=frappe.get_doc(dict(doctype='File',name=name,file_name=name+'.txt',
        file_url='/private/files/'+name+'.txt',is_private=1,is_folder=0,
        attached_to_doctype='Kandil Request Revision',attached_to_name=revision.name,
        owner=data['users']['requester']['email']))
    with acting_as(data['users']['requester']['email']):file.db_insert()
    if file.owner!=data['users']['requester']['email']:raise RuntimeError("Fixture file must belong to the tested reader")
    Path(frappe.get_site_path('private','files',file.file_name)).write_text(content)
    data['history_file']=dict(request=request['name'],revision=revision.name,file=file.name,
        file_url=file.file_url,content=content,snapshot_sha256=hashlib.sha256(revision.snapshot_json.encode()).hexdigest())
    persist(fixture.path_for(run_id),data); frappe.db.commit()
    return dict(run_id=run_id,prepared=True,accounts=len(data['users']),credentials='private-file-only')


def restrict(run_id):
    data=load(run_id)
    user=data['users']['requester']['email']
    grants=frappe.get_all('Kandil Access Grant',filters={'company':data['company'],'user':user,'revoked':0},pluck='name')
    if len(grants)!=1: raise RuntimeError('Expected one active synthetic grant')
    old=frappe.get_doc('Kandil Access Grant',grants[0]); old.revoked=1; old.save(ignore_permissions=True)
    frappe.get_doc(dict(doctype='Kandil Access Grant',user=user,company=data['company'],
        department=data['department'],branch=frappe.db.get_value('Kandil Capacity',data['capacities'][0],'branch'),
        valid_from=old.valid_from,can_manage_recruitment=1,can_view_sensitive=0,
        reason='Synthetic branch-only historical access check')).insert(ignore_permissions=True)
    frappe.db.commit()
    return dict(run_id=run_id,restricted_to_current_branch=True)


def inspect(run_id):
    data=load(run_id); value=data['history_file']
    raw=frappe.db.get_value('Kandil Request Revision',value['revision'],'snapshot_json')
    content=Path(frappe.get_site_path('private','files','synthetic-history-file-'+run_id+'.txt')).read_text()
    return dict(run_id=run_id,snapshot_unchanged=hashlib.sha256(raw.encode()).hexdigest()==value['snapshot_sha256'],
        file_unchanged=content==value['content'])


def cleanup(run_id):
    guard(run_id)
    result=base_cleanup(run_id)
    # Only this exact synthetic file, retained row and history are preserved.
    # Files remain private; all fixture users are disabled by base cleanup.
    return result | dict(private_synthetic_attachment_retained=True)
