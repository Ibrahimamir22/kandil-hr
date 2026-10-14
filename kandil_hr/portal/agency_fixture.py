"""Exact isolated cohort extension for real agency ownership browser requests."""
import uuid
import frappe
from kandil_hr.portal import source_fixture,candidate_fixture,fixture
from kandil_hr.portal.api import save_draft
from kandil_hr.recruitment import api,vacancies
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.concurrency_fixture import persist


def load(run_id):
    data=candidate_fixture.load(run_id)
    if not data.get('agency_target'):raise RuntimeError('Agency target fixture required')
    return data


def prepare(run_id):
    source_fixture.prepare(run_id);data=candidate_fixture.load(run_id)
    with acting_as(data['users']['requester']['email']):
        result=save_draft(payload=dict(company=data['company'],department=data['department'],title='Agency destination / شاغر المكاتب',requested_position=data['positions'][1],need_reason='Expansion',requested_priority='Normal',lines=[dict(capacity=data['capacities'][1],requested_qty=2)]),command_id=uuid.uuid4().hex)
        api.submit_request(result['name'],uuid.uuid4().hex,result['modified'])
    for role in ('manager','hr'):
        request=frappe.get_doc('Kandil Hiring Request',result['name']);step=next(s for s in request.approval_steps if s.decision=='Pending')
        with acting_as(data['users'][role]['email']):api.decide(request.name,'Approve',step.step_key,uuid.uuid4().hex,str(request.modified),comment='Synthetic agency destination')
    request.reload();opening=request.lines[0].job_opening
    with acting_as(data['users']['hr']['email']):
        vacancies.assign_team(request.name,opening,data['users']['hr']['email'],[data['users']['recruiter']['email']],'Synthetic agency team',uuid.uuid4().hex,str(request.modified));request.reload()
        vacancies.set_state(request.name,opening,'Open','Synthetic agency target',uuid.uuid4().hex,str(request.modified))
    data['agency_target']=dict(request=request.name,opening=opening)
    persist(fixture.path_for(run_id),data);frappe.db.commit();return dict(prepared=True,target_ready=True)


def cleanup(run_id):
    data=candidate_fixture.load(run_id)
    if data.get('agency_target'):
        from kandil_hr.pilot.api import transition
        from kandil_hr.portal.catalog_fixture import restore_hr
        restore_hr(run_id)
        target=data['agency_target']['opening']
        if frappe.db.get_value('Job Opening',target,'company')!=data['company']:raise RuntimeError('Refuse cross-company cleanup')
        with acting_as(data['users']['hr']['email']),transition():
            for name in frappe.get_all('Job Applicant',filters={'job_title':target},pluck='name'):
                doc=frappe.get_doc('Job Applicant',name)
                if doc.status!='Rejected':doc.status='Rejected';doc.save()
        frappe.db.commit()
    return source_fixture.cleanup(run_id)
