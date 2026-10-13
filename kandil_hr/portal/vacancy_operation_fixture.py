"""CLI-only isolated bilingual lifecycle cohort; normal commands and cleanup."""
import json
import uuid
import frappe
from kandil_hr.portal import fixture
from kandil_hr.portal.api import save_draft
from kandil_hr.portal.vacancy_operations import context
from kandil_hr.recruitment import api, vacancies
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as


def prepare(run_id):
    guard(run_id);fixture.prepare(run_id)
    data=json.loads(fixture.path_for(run_id).read_text());data['lifecycle']={}
    for lane in ('en','ar','blocked'):
        with acting_as(data['users']['requester']['email']):
            result=save_draft(payload=dict(company=data['company'],department=data['department'],
                title=f'Vacancy operations / إدارة الشواغر {lane}',requested_position=data['positions'][0],
                need_reason='Expansion',requested_priority='Normal',lines=[dict(capacity=c,requested_qty=q) for c,q in zip(data['capacities'],(2,1))]),
                command_id=uuid.uuid4().hex)
            api.submit_request(result['name'],uuid.uuid4().hex,result['modified'])
        for role in ('manager','hr'):
            doc=frappe.get_doc('Kandil Hiring Request',result['name'])
            step=next(s for s in doc.approval_steps if s.decision=='Pending')
            with acting_as(data['users'][role]['email']):
                api.decide(doc.name,'Approve',step.step_key,uuid.uuid4().hex,str(doc.modified),comment='Synthetic lifecycle review')
        doc.reload()
        for line in doc.lines:
            with acting_as(data['users']['hr']['email']):
                vacancies.assign_team(doc.name,line.job_opening,data['users']['hr']['email'],[],
                    'Synthetic lifecycle authority',uuid.uuid4().hex,str(doc.modified))
            doc.reload()
        data['lifecycle'][lane]=dict(name=doc.name,openings=[l.job_opening for l in doc.lines])
        if lane=='blocked':
            with acting_as(data['users']['hr']['email']):
                vacancies.set_state(doc.name,doc.lines[0].job_opening,'Open','Synthetic candidate commitment',uuid.uuid4().hex,str(doc.modified))
                applicant=frappe.get_doc(dict(doctype='Job Applicant',applicant_name='Synthetic private commitment',
                    phone_number='01012345678',job_title=doc.lines[0].job_opening)).insert()
                data['lifecycle']['blocked']['applicant']=applicant.name
    persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(prepared=True,requests=3,openings=6)


def snapshot(run_id):
    guard(run_id);data=json.loads(fixture.path_for(run_id).read_text())
    assert data['company']==f'Kandil PORTAL TEST {run_id}'
    state=fixture.inspect(run_id)
    with acting_as(data['users']['hr']['email']):
        state['contexts']={lane:[context(row['name'],o) for o in row['openings']] for lane,row in data['lifecycle'].items()}
    return state


def resolve_commitment(run_id):
    guard(run_id);data=json.loads(fixture.path_for(run_id).read_text())
    row=data.get('lifecycle',{}).get('blocked')
    if not row:return dict(resolved=False)
    applicant=frappe.get_doc('Job Applicant',row['applicant'])
    if applicant.job_title not in row['openings'] or frappe.db.get_value('Job Opening',applicant.job_title,'company')!=data['company']:
        raise RuntimeError('Refusing unrelated candidate cleanup')
    if applicant.status!='Rejected':
        with acting_as(data['users']['hr']['email']):
            applicant.status='Rejected';applicant.save()
    frappe.db.commit();return dict(resolved=True)


def cleanup(run_id):
    guard(run_id);resolve_commitment(run_id);return fixture.cleanup(run_id)
