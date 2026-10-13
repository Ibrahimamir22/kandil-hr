"""CLI-only returned/revised/HR-reviewed request history for browser acceptance."""
import json
import uuid

import frappe
from kandil_hr.portal import api, fixture
from kandil_hr.foundation.clock import today_cairo
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
    amendment=call('requester',commands.amend,reason='Synthetic linked amendment')['name']
    # A separate pending request demonstrates real dated rules and interest
    # exclusions without changing the original return/revise/HR-review journey.
    user=frappe.get_doc('User',data['users']['sector']['email'])
    user.append('roles',{'role':'Kandil CEO Approver'})
    with fixture.local_user_contacts(run_id):user.save(ignore_permissions=True)
    settings=frappe.get_doc('Kandil Organization Settings',data['company'])
    settings.ceo_approver=user.name;settings.save(ignore_permissions=True)
    route=frappe.get_doc('Kandil Recruitment Route',{'company':data['company'],'department':data['department']})
    route.ceo_approver=user.name;route.save(ignore_permissions=True)
    rule=frappe.get_doc(dict(doctype='Kandil Authority Rule',company=data['company'],department=data['department'],
        authority='CEO Approval',principal=user.name,from_date=today_cairo(),enabled=1,
        reason='Original dated review / مراجعة مؤرخة أصلية')).insert(ignore_permissions=True)
    with acting_as(data['users']['requester']['email']):
        other=api.save_draft(dict(company=data['company'],department=data['department'],requested_position=data['positions'][0],title='Other history '+run_id,need_reason='Expansion',requested_priority='Normal',lines=[dict(capacity=data['capacities'][0],requested_qty=1)]),uuid.uuid4().hex)
        doc=frappe.get_doc('Kandil Hiring Request',other['name'])
        doc.beneficiary_user=data['users']['manager']['email'];doc.save()
        commands.submit_request(doc.name,uuid.uuid4().hex,str(doc.modified))
    other_event=frappe.get_all('Kandil Command Audit',filters={'domain':'recruitment','target_name':other['name']},pluck='name')[0]
    route.headcount_mode='Warn';route.save(ignore_permissions=True)
    rule.reason='Changed current rule';rule.save(ignore_permissions=True)
    data['history']=dict(name=name,title=title,original_title=original,return_event=return_event,review_event=review_event,
        other_event=other_event,other_name=other['name'],other_title=other['title'],amendment=amendment)
    persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(run_id=run_id,prepared=True,accounts=6,history_commands=len(events)+1,credentials='private-file-only')
