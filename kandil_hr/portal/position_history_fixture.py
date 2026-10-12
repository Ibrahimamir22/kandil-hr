"""CLI synthetic timeline sources created with ordinary-role domain commands."""
import json
import uuid

import frappe
from frappe.utils import today, add_days

from kandil_hr.portal import fixture, structure_fixture, imports, structure, job_descriptions
from kandil_hr.portal.test_imports import csv_text
from kandil_hr.recruitment import api as recruitment, vacancies, joining_corrections
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import insert, persist
from kandil_hr.pilot.api import record_outcome


def prepare(run_id):
    guard(run_id);structure_fixture.prepare(run_id)
    data=json.loads(fixture.path_for(run_id).read_text())
    # Grants are immutable: retire the fixture grant and issue its reviewed replacement.
    grant=frappe.get_doc('Kandil Access Grant',{'user':data['users']['hr']['email'],'company':data['company'],'department':['is','not set']})
    grant.revoked=1;grant.save(ignore_permissions=True)
    insert('Kandil Access Grant',company=data['company'],user=data['users']['hr']['email'],
           valid_from=today(),can_manage_recruitment=1,can_view_sensitive=1,
           reason='Synthetic timeline offer creation authority')
    def invoke(role, method, **args):
        with acting_as(data['users'][role]['email']): return method(**args)
    employee=insert('Employee',first_name='Synthetic timeline imported employee',gender='Male',date_of_birth='1990-01-01',
                    date_of_joining=today(),company=data['company'],department=data['department'],status='Active')
    # A completed historical episode exercises import history without today's occupancy.
    args=dict(company=data['company'],import_kind='Assignments',baseline_reference='Synthetic timeline source',
        csv_text=csv_text([dict(position=data['positions'][0],employee=employee.name,valid_from=add_days(today(),-3),valid_until=add_days(today(),-2))]))
    checked=invoke('hr',imports.validate_csv,**args)
    batch=invoke('hr',imports.save,**args,validated_digest=checked['digest'],command_id=uuid.uuid4().hex)
    invoke('sector',imports.review,name=batch['name'],expected_version=batch['modified'],command_id=uuid.uuid4().hex)
    batch=invoke('hr',imports.detail,name=batch['name'])
    invoke('hr',imports.apply,name=batch['name'],expected_version=batch['modified'],reviewed_digest=batch['digest'],command_id=uuid.uuid4().hex)
    data['import']=batch['name'];data['employee']=employee.name
    payload=dict(company=data['company'],effective_on=today(),reason='Synthetic position timeline resize',
                 operations=[dict(action='Resize',position=data['positions'][0],structural=31)])
    change=invoke('manager',structure.save,payload=payload,command_id=uuid.uuid4().hex)
    change=invoke('manager',structure.preview,name=change['name'],expected_version=change['modified'],command_id=uuid.uuid4().hex)
    invoke('manager',structure.submit,name=change['name'],expected_version=change['modified'],preview_hash=change['preview_hash'],command_id=uuid.uuid4().hex)
    for role in ['hr','sector']:
        current=invoke(role,structure.detail,name=change['name'])
        invoke(role,structure.decide,name=current['name'],expected_version=current['modified'],preview_hash=current['preview_hash'],
               step_id=current['actions']['step_id'],decision='Approved',comment='Synthetic independent timeline review',command_id=uuid.uuid4().hex)
    data['change']=change['name']
    jd=invoke('hr',job_descriptions.save,position=data['positions'][0],payload=dict(valid_from=today(),purpose='Synthetic timeline JD',purpose_ar='وصف وظيفي تجريبي للسجل',
        responsibility_rows=[dict(description=x,description_ar='مسؤولية تجريبية') for x in ['Quality','Safety','Reporting']],
        kpis=[dict(indicator='Quality',kind='Weighted',weight=100,formula='Passed / total',frequency='Monthly')]),command_id=uuid.uuid4().hex)
    invoke('sector',job_descriptions.approve,name=jd['name'],expected_version=jd['modified'],command_id=uuid.uuid4().hex);data['jd']=jd['name']
    with acting_as(data['users']['requester']['email']):
        request=frappe.get_doc(dict(doctype='Kandil Hiring Request',company=data['company'],department=data['department'],
            title='Synthetic position timeline hiring',requested_by=frappe.session.user,requested_position=data['positions'][0],
            revision=1,need_reason='Expansion',requested_priority='Normal',lines=[dict(capacity=data['capacities'][0],requested_qty=1)])).insert()
    def command(role, method, **args):
        request.reload();return invoke(role,method,name=request.name,command_id=uuid.uuid4().hex,expected_version=str(request.modified),**args)
    command('requester',recruitment.submit_request)
    for role in ['manager','hr']:
        request.reload();step=next(s for s in request.approval_steps if s.decision=='Pending')
        command(role,recruitment.decide,step_id=step.step_key,decision='Approve')
    request.reload();opening=request.lines[0].job_opening
    command('hr',vacancies.assign_team,opening_name=opening,lead=data['users']['hr']['email'],members=[],reason='Synthetic timeline team')
    command('hr',vacancies.set_state,opening_name=opening,action='Open',reason='Synthetic timeline intake')
    with acting_as(data['users']['hr']['email']):
        applicant=frappe.get_doc(dict(doctype='Job Applicant',applicant_name='Synthetic timeline candidate',email_id=uuid.uuid4().hex+'@example.invalid',job_title=opening)).insert()
        offer=frappe.get_doc(dict(doctype='Job Offer',job_applicant=applicant.name,offer_date=today(),designation=data['designation'],company=data['company'],status='Accepted')).insert()
        offer.submit()
        joined=record_outcome(offer.name,'Joined',joining_date=today(),date_of_birth='1995-01-01',gender='Male')
    command('hr',joining_corrections.void_joining,offer_name=offer.name,reason='Synthetic erroneous joining corrected')
    data.update(request=request.name,joined_assignment=joined['assignment'])
    persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(run_id=run_id,prepared=True,source_types=4,users=6)


def restrict_source(run_id):
    guard(run_id);data=json.loads(fixture.path_for(run_id).read_text())
    for name in frappe.get_all('Kandil Access Grant',filters={'user':data['users']['hr']['email'],'company':data['company'],'department':['is','not set']},pluck='name'):
        grant=frappe.get_doc('Kandil Access Grant',name);grant.revoked=1;grant.save(ignore_permissions=True)
    frappe.db.commit();return dict(whole_company_access_revoked=True,department_access_preserved=True)


def cleanup(run_id):
    guard(run_id);return structure_fixture.cleanup(run_id)
