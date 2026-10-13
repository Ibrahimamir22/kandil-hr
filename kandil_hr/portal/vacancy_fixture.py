"""CLI-only isolated vacancy browser cohort; personal credentials stay private."""
import json
import uuid

import frappe
from kandil_hr.portal import fixture
from kandil_hr.portal.api import save_draft
from kandil_hr.recruitment import api, vacancies
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as


def prepare(run_id):
    guard(run_id);fixture.prepare(run_id)
    data=json.loads(fixture.path_for(run_id).read_text())
    for position,capacity in zip(data['positions'],data['capacities']):
        frappe.db.set_value('Kandil Position',position,'structural',100)
        frappe.db.set_value('Kandil Capacity',capacity,{'structural':100,'available':100})
    outsider=frappe.get_doc('User',data['users']['outsider']['email'])
    outsider.append('roles',{'role':'Kandil Recruiter'})
    with fixture.local_user_contacts(run_id):outsider.save(ignore_permissions=True)
    requests=[]
    for index in range(14):
        with acting_as(data['users']['requester']['email']):
            result=save_draft(payload=dict(company=data['company'],department=data['department'],
                title=f'Vacancy queue / شواغر التشغيل {index:02}',requested_position=data['positions'][0],
                need_reason='Expansion',requested_priority='Normal',lines=[dict(capacity=c,requested_qty=1) for c in data['capacities'][:2]]),
                command_id=uuid.uuid4().hex)
            api.submit_request(result['name'],uuid.uuid4().hex,result['modified'])
        for role in ('manager','hr'):
            doc=frappe.get_doc('Kandil Hiring Request',result['name'])
            step=next(s for s in doc.approval_steps if s.decision=='Pending')
            with acting_as(data['users'][role]['email']):
                api.decide(doc.name,'Approve',step.step_key,uuid.uuid4().hex,str(doc.modified),comment='Synthetic vacancy queue fixture')
        requests.append(result['name'])
    first=frappe.get_doc('Kandil Hiring Request',requests[0])
    with acting_as(data['users']['hr']['email']):
        vacancies.assign_team(first.name,first.lines[0].job_opening,data['users']['recruiter']['email'],
            json.dumps([data['users']['hr']['email']]),'Synthetic queue lead',uuid.uuid4().hex,str(first.modified))
    first.reload()
    with acting_as(data['users']['hr']['email']):
        vacancies.set_state(first.name,first.lines[1].job_opening,'Hold','Synthetic queue pause',uuid.uuid4().hex,str(first.modified))
    data['queue_requests']=requests
    data['queue_names']=sorted(frappe.get_all('Job Opening',filters={'company':data['company'],'custom_kandil_vacancy_state':['in',['Approved','On Hold']]},pluck='name'))
    from kandil_hr.portal.vacancies import listing
    with acting_as(data['users']['hr']['email']):
        data['queue_search_target']=listing(page_length=100)['rows'][-1]['name']
    data['queue_branch']=frappe.db.get_value('Kandil Capacity',data['capacities'][0],'branch')
    persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(prepared=True,run_id=run_id,requests=len(requests),openings=len(data['queue_names']))


def revoke_lead(run_id):
    guard(run_id);data=json.loads(fixture.path_for(run_id).read_text())
    for name in frappe.get_all('Kandil Access Grant',filters={'company':data['company'],'user':data['users']['recruiter']['email']},pluck='name'):
        doc=frappe.get_doc('Kandil Access Grant',name);doc.revoked=1;doc.save(ignore_permissions=True)
    frappe.db.commit();return dict(revoked=True)


def cleanup(run_id):
    guard(run_id);return fixture.cleanup(run_id)
