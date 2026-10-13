"""CLI-only returned/revised/HR-reviewed request history for browser acceptance."""
import json
import uuid

import frappe
from kandil_hr.portal import api, fixture
from kandil_hr.portal.route_preview_fixture import load
from kandil_hr.portal.request_operations_fixture import cleanup
from kandil_hr.portal.requests_fixture import revoke
from kandil_hr.recruitment import api as commands
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as


def prepare(run_id):
    guard(run_id);fixture.prepare(run_id);data=load(run_id)
    original='History original '+run_id;title='History revised '+run_id
    values=dict(company=data['company'],department=data['department'],requested_position=data['positions'][0],
        title=original,need_reason='Expansion',requested_priority='Normal',qualifications='Original qualifications',
        lines=[dict(capacity=data['capacities'][0],requested_qty=2)])
    with acting_as(data['users']['requester']['email']):row=api.save_draft(values,uuid.uuid4().hex)
    name=row['name']
    def call(role,method,**kwargs):
        with acting_as(data['users'][role]['email']):
            doc=frappe.get_doc('Kandil Hiring Request',name)
            if method==commands.decide:kwargs['step_id']=next(s.step_key for s in doc.approval_steps if s.decision=='Pending')
            return method(name=name,command_id=uuid.uuid4().hex,expected_version=str(doc.modified),**kwargs)
    call('requester',commands.submit_request)
    call('manager',commands.decide,decision='Return',comment='Clarify the need')
    call('requester',commands.revise,reason='Clarified need and quantity')
    with acting_as(data['users']['requester']['email']):
        doc=frappe.get_doc('Kandil Hiring Request',name);doc.title=title;doc.lines[0].requested_qty=3;doc.qualifications='Revised qualifications';doc.save()
    call('requester',commands.submit_request)
    call('manager',commands.decide,decision='Approve',comment='Reviewed revised need')
    call('hr',commands.review,quantities={frappe.get_doc('Kandil Hiring Request',name).lines[0].name:1},priority='Normal',reason='One seat approved by HR')
    call('hr',commands.decide,decision='Approve',comment='Final HR approval')
    events=frappe.get_all('Kandil Command Audit',filters={'domain':'recruitment','target_name':name},fields=['name','operation','payload_json'],order_by='creation asc')
    return_event=next(r.name for r in events if r.operation=='decide' and json.loads(r.payload_json).get('decision')=='Return')
    review_event=next(r.name for r in events if r.operation=='review')
    with acting_as(data['users']['requester']['email']):
        other=api.save_draft(dict(company=data['company'],department=data['department'],requested_position=data['positions'][0],title='Other history '+run_id,need_reason='Expansion',requested_priority='Normal',lines=[dict(capacity=data['capacities'][0],requested_qty=1)]),uuid.uuid4().hex)
        commands.submit_request(other['name'],uuid.uuid4().hex,other['modified'])
    other_event=frappe.get_all('Kandil Command Audit',filters={'domain':'recruitment','target_name':other['name']},pluck='name')[0]
    route=frappe.get_doc('Kandil Recruitment Route',{'company':data['company'],'department':data['department']})
    route.headcount_mode='Warn';route.save(ignore_permissions=True)
    data['history']=dict(name=name,title=title,original_title=original,return_event=return_event,review_event=review_event,other_event=other_event)
    persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(run_id=run_id,prepared=True,accounts=6,history_commands=len(events),credentials='private-file-only')
