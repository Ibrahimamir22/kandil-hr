"""CLI-only candidate portal cohort, with a reversible synthetic-site intake lease."""
import json
import uuid
from unittest.mock import patch

import frappe
from frappe.installer import update_site_config
from kandil_hr.portal import fixture
from kandil_hr.portal.api import save_draft
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment import api,vacancies
from kandil_hr.candidates import intake


def load(run_id):
    guard(run_id);data=json.loads(fixture.path_for(run_id).read_text())
    if data['company']!='Kandil PORTAL TEST '+run_id:raise RuntimeError('Wrong candidate cohort')
    return data


def prepare(run_id):
    guard(run_id)
    if frappe.conf.get('kandil_candidate_identity_enabled'):raise RuntimeError('Candidate mode already active; do not replace its configuration')
    fixture.prepare(run_id);data=load(run_id)
    with acting_as(data['users']['requester']['email']):
        req=save_draft(payload=dict(company=data['company'],department=data['department'],title='Candidate portal / بوابة المرشحين',
            requested_position=data['positions'][0],need_reason='Expansion',requested_priority='Normal',
            lines=[dict(capacity=data['capacities'][0],requested_qty=2)]),command_id=uuid.uuid4().hex)
        api.submit_request(req['name'],uuid.uuid4().hex,req['modified'])
    for role in ('manager','hr'):
        doc=frappe.get_doc('Kandil Hiring Request',req['name']);step=next(s for s in doc.approval_steps if s.decision=='Pending')
        with acting_as(data['users'][role]['email']):api.decide(doc.name,'Approve',step.step_key,uuid.uuid4().hex,str(doc.modified),comment='Synthetic candidate intake')
    doc.reload();opening=doc.lines[0].job_opening
    with acting_as(data['users']['hr']['email']):
        vacancies.assign_team(doc.name,opening,data['users']['hr']['email'],[data['users']['recruiter']['email']],
            'Synthetic candidate team',uuid.uuid4().hex,str(doc.modified));doc.reload()
        vacancies.set_state(doc.name,opening,'Open','Synthetic candidate intake',uuid.uuid4().hex,str(doc.modified));doc.reload()
        legacy=frappe.get_doc(dict(doctype='Job Applicant',applicant_name='Legacy review / سجل سابق',phone_number='01012345678',job_title=opening)).insert()
    data['candidate']={'request':doc.name,'opening':opening,'legacy':legacy.name,'before_flag':frappe.conf.get('kandil_candidate_identity_enabled'),'lease':False}
    with patch.dict(frappe.conf,{'kandil_candidate_identity_enabled':1}),acting_as(data['users']['recruiter']['email']):
        for index in range(21):
            result=intake.create_application(doc.name,opening,dict(applicant_name=f'Synthetic candidate {index:02d}',
                email_id=f'candidate-{run_id}-{index}@example.invalid',phone_number='01012345678',source_channel='Referral',source_detail='Synthetic cohort'),
                uuid.uuid4().hex,str(doc.modified),profile=dict(city='القاهرة',experience_years=0))
            if index==0:data['candidate']['existing']=result
    persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(prepared=True,applications=22,accounts=len(data['users']))


def enable(run_id):
    data=load(run_id)
    if frappe.conf.get('kandil_candidate_identity_enabled') and not data['candidate']['lease']:
        raise RuntimeError('Candidate mode changed outside this test')
    data['candidate']['lease']=True;persist(fixture.path_for(run_id),data)
    update_site_config('kandil_candidate_identity_enabled',1)
    return dict(test_intake_enabled=True)


def snapshot(run_id):
    data=load(run_id)
    apps=frappe.get_all('Job Applicant',filters={'job_title':data['candidate']['opening']},
        fields=['name','custom_kandil_person','status'])
    return dict(applications=apps,capacity=fixture.inspect(run_id)['capacities'],
        people=frappe.db.count('Kandil Candidate Person',{'company':data['company']}),
        migrations=frappe.db.count('Kandil Command Audit',{'operation':'candidate_identity_migrate','target_name':data['candidate']['request']}))


def revoke(run_id):
    data=load(run_id)
    for grant in frappe.get_all('Kandil Access Grant',filters={'user':data['users']['recruiter']['email'],'company':data['company']},pluck='name'):
        doc=frappe.get_doc('Kandil Access Grant',grant);doc.revoked=1;doc.save(ignore_permissions=True)
    frappe.db.commit();return dict(revoked=True)


def cleanup(run_id):
    data=load(run_id)
    if data.get('candidate',{}).get('lease'):
        update_site_config('kandil_candidate_identity_enabled',data['candidate']['before_flag'])
        data['candidate']['lease']=False;persist(fixture.path_for(run_id),data)
    if 'candidate' not in data:
        return fixture.cleanup(run_id)
    from kandil_hr.pilot.api import transition
    with acting_as(data['users']['hr']['email']), transition():
        for name in frappe.get_all('Job Applicant',filters={'job_title':data['candidate']['opening']},pluck='name'):
            app=frappe.get_doc('Job Applicant',name)
            if app.status!='Rejected':app.status='Rejected';app.save()
    frappe.db.commit()
    result=fixture.cleanup(run_id);result['intake_lease_restored']=True
    return result


def migration_race_records(run_id):
    """Two fresh legacy applications for committed first-write race evidence."""
    data=load(run_id)
    if not data['candidate']['lease'] or not frappe.conf.get('kandil_candidate_identity_enabled'):
        raise RuntimeError('Expected active synthetic candidate lease')
    if data['candidate'].get('migration_race'):
        raise RuntimeError('This cohort already has race records')
    names=[]
    with patch.dict(frappe.conf,{'kandil_candidate_identity_enabled':0}),acting_as(data['users']['hr']['email']):
        for index in range(2):
            doc=frappe.get_doc(dict(doctype='Job Applicant',applicant_name='Legacy race '+str(index)+' '+run_id,
                phone_number='0109876000'+str(index),job_title=data['candidate']['opening'])).insert()
            names.append(doc.name)
    data['candidate']['migration_race']=names;persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(applications=names)
