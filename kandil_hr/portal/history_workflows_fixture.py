"""CLI-only expanded authority/correction history cohort; retained synthetic proof."""
import hashlib
import json
import uuid

import frappe
from kandil_hr.foundation.clock import today_cairo
from kandil_hr.portal import api, board_fixture, fixture
from kandil_hr.portal.route_preview_fixture import load
from kandil_hr.portal.request_operations_fixture import cleanup
from kandil_hr.recruitment import api as commands
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.corrections import correct_approved
from kandil_hr.recruitment.pending_revision import revise_pending_quantities
from kandil_hr.recruitment.test_commands import acting_as


def prepare(run_id):
    guard(run_id);board_fixture.prepare(run_id);data=load(run_id)
    delegate=frappe.get_doc('User',data['users']['recruiter']['email'])
    delegate.set('roles',[{'role':'Kandil Approver'}]);delegate.first_name='Delegate / المفوض'
    with fixture.local_user_contacts(run_id):delegate.save(ignore_permissions=True)
    with acting_as(data['users']['sector']['email']):
        frappe.get_doc(dict(doctype='Kandil Delegation',company=data['company'],department=data['department'],
            from_user=data['users']['manager']['email'],to_user=delegate.name,from_date=today_cairo(),to_date=today_cairo(),
            process_scope='APPROVALS',reason='Synthetic historical delegation')).insert()

    def create(title, critical=False):
        with acting_as(data['users']['requester']['email']):
            return api.save_draft(dict(company=data['company'],department=data['department'],title=title,
                requested_position=data['positions'][0],need_reason='Expansion',requested_priority='Critical' if critical else 'Normal',
                qualifications='Original requirements',lines=[dict(capacity=data['capacities'][0],requested_qty=2)]),uuid.uuid4().hex)['name']

    def call(name,role,method,**kwargs):
        with acting_as(data['users'][role]['email']):
            doc=frappe.get_doc('Kandil Hiring Request',name)
            if method==commands.decide:kwargs['step_id']=next(s.step_key for s in doc.approval_steps if s.decision=='Pending')
            return method(name=name,command_id=uuid.uuid4().hex,expected_version=str(doc.modified),**kwargs)

    def audit(name,op):
        return frappe.get_all('Kandil Command Audit',filters={'target_name':name,'operation':op},pluck='name',order_by='creation desc')[0]

    board_name=create('Historical Board review '+run_id,True)
    events={}
    call(board_name,'requester',commands.submit_request)
    call(board_name,'recruiter',commands.decide,decision='Approve',comment='Delegate reviewed two seats')
    events['delegate']=audit(board_name,'decide')
    line=frappe.get_doc('Kandil Hiring Request',board_name).lines[0].name
    call(board_name,'hr',commands.review,quantities={line:1},priority='Critical',reason='One seat proposed by HR')
    call(board_name,'hr',commands.decide,decision='Approve',comment='HR reviewed one seat')
    call(board_name,'ceo',commands.decide,decision='Approve',comment='CEO reviewed one seat')
    events['ceo']=audit(board_name,'decide')
    with acting_as(data['users']['sector']['email']):
        proof=frappe.get_doc(dict(doctype='File',file_name='synthetic-board-history.txt',is_private=1,
            attached_to_doctype='Kandil Hiring Request',attached_to_name=board_name,
            content=('Synthetic Board history proof '+run_id).encode())).insert()
    call(board_name,'sector',commands.decide,decision='Return',comment='Clarify staffing / توضيح الاحتياج',
        board_member=data['users']['vice']['email'],board_evidence=proof.name,on_behalf_method='PHONE',
        on_behalf_note='Vice reviewed one seat / راجع النائب احتياج فرد واحد')
    events['board_return']=audit(board_name,'decide')
    call(board_name,'requester',commands.revise,reason='Resubmit two seats after clarification')
    call(board_name,'requester',commands.submit_request)
    for role in ('recruiter','hr','ceo','vice'):
        call(board_name,role,commands.decide,decision='Approve',comment='Revised two seats reviewed')
    events['board_approve']=audit(board_name,'decide')
    call(board_name,'hr',correct_approved,reason='Reduced need / تخفيض الاحتياج',
        quantities={line:1},fields={'qualifications':'Corrected requirements / متطلبات مصححة'})
    events['correction']=audit(board_name,'hr_correction')
    board_case=dict(name=board_name,title='Historical Board review '+run_id,events=events,proof=proof.name,
        proof_url=proof.file_url,proof_text='Synthetic Board history proof '+run_id)

    pending_name=create('Historical quantity changes '+run_id)
    events={}
    call(pending_name,'requester',commands.submit_request)
    call(pending_name,'manager',commands.decide,decision='Approve',comment='Manager reviewed original two')
    events['old_decision']=audit(pending_name,'decide')
    line=frappe.get_doc('Kandil Hiring Request',pending_name).lines[0].name
    call(pending_name,'requester',revise_pending_quantities,quantities={line:2},reason='Same need confirmed / تأكيد نفس الاحتياج')
    events['noop']=audit(pending_name,'revise_pending_quantities')
    call(pending_name,'requester',revise_pending_quantities,quantities={line:3},reason='Three now needed / نحتاج ثلاثة الآن')
    events['restart']=audit(pending_name,'revise_pending_quantities')
    for role in ('manager','hr'):call(pending_name,role,commands.decide,decision='Approve',comment='Three reviewed after restart')
    pending_case=dict(name=pending_name,title='Historical quantity changes '+run_id,events=events)
    data['workflow_cases']=dict(board=board_case,pending=pending_case)
    data['history_digests']=digests(data)
    persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(run_id=run_id,prepared=True,accounts=len(data['users']),credentials='private-file-only')


def digests(data):
    result={}
    for case in data['workflow_cases'].values():
        for kind,filters,field in (
            ('Kandil Command Audit',{'target_name':case['name']},'envelope_json'),
            ('Kandil Request Revision',{'request':case['name']},'snapshot_json'),
        ):
            for row in frappe.get_all(kind,filters=filters,fields=['name',field]):
                result[kind+':'+row.name]=hashlib.sha256(row[field].encode()).hexdigest()
    return result


def inspect(run_id):
    guard(run_id);data=load(run_id)
    return dict(run_id=run_id,history_unchanged=digests(data)==data['history_digests'])


def revoke(run_id):
    guard(run_id);data=load(run_id)
    for role in ('chair','requester'):
        for name in frappe.get_all('Kandil Access Grant',filters={'user':data['users'][role]['email'],'company':data['company'],'revoked':0},pluck='name'):
            grant=frappe.get_doc('Kandil Access Grant',name);grant.revoked=1;grant.save(ignore_permissions=True)
    frappe.db.commit()
    return dict(run_id=run_id,revoked=True)
