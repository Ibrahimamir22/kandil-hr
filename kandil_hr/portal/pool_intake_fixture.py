"""Exact isolated cohort extension for real pool-to-vacancy browser requests."""
import uuid
import frappe
from kandil_hr.portal import stage_fixture,fixture
from kandil_hr.portal.api import save_draft
from kandil_hr.recruitment import api,vacancies
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.concurrency_fixture import persist


def load(run_id):
    data=stage_fixture.load(run_id)
    if not data.get('pool_target'):raise RuntimeError('Pool target fixture required')
    return data


def prepare(run_id):
    stage_fixture.prepare(run_id);data=stage_fixture.load(run_id)
    with acting_as(data['users']['requester']['email']):
        result=save_draft(payload=dict(company=data['company'],department=data['department'],title='Pool destination / شاغر القاعدة',requested_position=data['positions'][1],need_reason='Expansion',requested_priority='Normal',lines=[dict(capacity=data['capacities'][1],requested_qty=2)]),command_id=uuid.uuid4().hex)
        api.submit_request(result['name'],uuid.uuid4().hex,result['modified'])
    for role in ('manager','hr'):
        request=frappe.get_doc('Kandil Hiring Request',result['name']);step=next(s for s in request.approval_steps if s.decision=='Pending')
        with acting_as(data['users'][role]['email']):api.decide(request.name,'Approve',step.step_key,uuid.uuid4().hex,str(request.modified),comment='Synthetic pool destination')
    request.reload();opening=request.lines[0].job_opening
    with acting_as(data['users']['hr']['email']):
        vacancies.assign_team(request.name,opening,data['users']['hr']['email'],[data['users']['recruiter']['email']],'Synthetic pool team',uuid.uuid4().hex,str(request.modified));request.reload()
        vacancies.set_state(request.name,opening,'Open','Synthetic pool target',uuid.uuid4().hex,str(request.modified))
    data['pool_target']=dict(request=request.name,opening=opening)
    persist(fixture.path_for(run_id),data);frappe.db.commit();return dict(prepared=True,target_ready=True)


def inspect(run_id):
    data=load(run_id);result=stage_fixture.inspect(run_id)
    result['target_applications']=frappe.get_all('Job Applicant',filters={'job_title':data['pool_target']['opening']},fields=['name','status','custom_kandil_person','custom_kandil_source_channel'])
    return result


def cleanup(run_id):
    data=stage_fixture.load(run_id)
    if data.get('pool_target'):
        from kandil_hr.pilot.api import transition
        from kandil_hr.portal.catalog_fixture import restore_hr
        restore_hr(run_id)
        target=data['pool_target']['opening']
        if frappe.db.get_value('Job Opening',target,'company')!=data['company']:raise RuntimeError('Refuse cross-company cleanup')
        with acting_as(data['users']['hr']['email']),transition():
            for name in frappe.get_all('Job Applicant',filters={'job_title':target},pluck='name'):
                doc=frappe.get_doc('Job Applicant',name)
                if doc.status!='Rejected':doc.status='Rejected';doc.save()
        frappe.db.commit()
    return stage_fixture.cleanup(run_id)
