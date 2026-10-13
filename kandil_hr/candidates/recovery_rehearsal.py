"""Native hourly expiry rehearsal on the independently isolated synthetic stack."""
import hashlib
import json
import os
import uuid
from unittest.mock import patch

import frappe
from frappe.utils import add_to_date, now_datetime
from kandil_hr.candidates import recovery
from kandil_hr.foundation import scheduler_rehearsal as base
from kandil_hr.portal import candidate_fixture as candidates, fixture
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as

METHOD='kandil_hr.candidates.recovery.expire_pending'


def state(run_id):
    base.isolated(run_id)
    return candidates.load(run_id)


def business_digest(data):
    """Compare whole stored business rows; expose only count/hash, never profiles."""
    groups={}
    for kind,filters in [('Job Applicant',{'job_title':data['candidate']['opening']}),
        ('Kandil Candidate Person',{'company':data['company']}),
        ('Kandil Command Receipt',{'request':data['candidate']['request']}),
        ('Kandil Command Audit',{'target_name':data['candidate']['request']}),
        ('Kandil Capacity',{'company':data['company']})]:
        rows=frappe.get_all(kind,filters=filters,fields=['*'],order_by='name',limit_page_length=0)
        groups[kind]=dict(count=len(rows),sha256=hashlib.sha256(json.dumps(rows,sort_keys=True,default=str).encode()).hexdigest())
    return groups


def prepare(run_id):
    base.isolated(run_id)
    if not frappe.conf.get('pause_scheduler'):raise RuntimeError('Prepare only while paused')
    frappe.clear_cache()
    from frappe.core.doctype.scheduled_job_type.scheduled_job_type import sync_jobs
    sync_jobs();frappe.db.commit()
    jobs=frappe.get_all('Scheduled Job Type',fields=['name','method','stopped','create_log','frequency','last_execution'],limit_page_length=0)
    if not any(j.method==METHOD and j.frequency=='Hourly' for j in jobs):raise RuntimeError('Hourly cleanup hook missing')
    candidates.prepare(run_id);data=state(run_id)
    data['recovery_schedule']=dict(jobs=jobs,armed=False,expired=[],future=None)
    persist(fixture.path_for(run_id),data)
    request=frappe.get_doc('Kandil Hiring Request',data['candidate']['request'])
    with patch.dict(frappe.conf,{'kandil_candidate_identity_enabled':1}),acting_as(data['users']['recruiter']['email']):
        for index in range(107):
            args=dict(name=request.name,opening_name=data['candidate']['opening'],expected_version=str(request.modified),
                command_id=uuid.uuid4().hex,details=dict(applicant_name='Scheduler recovery '+str(index),email_id='recovery-'+str(index)+'@example.invalid',phone_number='01012345678',source_channel='Referral',source_detail='Synthetic schedule'))
            row=recovery.prepare('intake',args)
            if index==0:recovery.execute(row['name'])
            if index<106:
                frappe.db.set_value(recovery.DT,row['name'],'expires_at',add_to_date(now_datetime(),days=-1))
                data['recovery_schedule']['expired'].append(row['name'])
            else:data['recovery_schedule']['future']=row['name']
    data['recovery_schedule']['business_before']=business_digest(data)
    persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(prepared=True,accounts=6,expired_envelopes=106,unexpired_envelopes=1,candidate_mode_enabled=bool(frappe.conf.get('kandil_candidate_identity_enabled')))


def arm(run_id):
    data=state(run_id);s=data['recovery_schedule']
    if s['armed']:raise RuntimeError('Already armed; inspect live processes')
    from frappe.utils.background_jobs import get_queue
    if get_queue('default').count:raise RuntimeError('Isolated default queue is not empty; do not process unknown jobs')
    for row in s['jobs']:
        values=dict(stopped=1)
        if row['method']==METHOD:values.update(stopped=0,create_log=1,last_execution=add_to_date(now_datetime(),days=-2))
        frappe.db.set_value('Scheduled Job Type',row['name'],values,update_modified=False)
    frappe.db.set_single_value('System Settings','enable_scheduler',1)
    base.config(pause_scheduler=0,disable_scheduler=0)
    s.update(armed=True,armed_at=str(now_datetime()));persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(armed=True,frequency='Hourly',method=METHOD)


def make_due(run_id):
    data=state(run_id)
    if not data['recovery_schedule']['armed']:raise RuntimeError('Not armed')
    job=next(r for r in data['recovery_schedule']['jobs'] if r['method']==METHOD)
    frappe.db.set_value('Scheduled Job Type',job['name'],'last_execution',add_to_date(now_datetime(),days=-2),update_modified=False)
    frappe.db.commit();return dict(due=True)


def inspect(run_id):
    data=state(run_id);s=data['recovery_schedule']
    rows=frappe.get_all(recovery.DT,filters={'request':data['candidate']['request']},fields=['name','status','payload_cipher'])
    expired=[r for r in rows if r.name in s['expired']];future=next(r for r in rows if r.name==s['future'])
    job=next(r for r in s['jobs'] if r['method']==METHOD)
    logs=frappe.get_all('Scheduled Job Log',filters={'scheduled_job_type':job['name'],'creation':['>=',s.get('armed_at') or now_datetime()]},fields=['status'],limit_page_length=0)
    from frappe.utils.background_jobs import get_queue
    q=get_queue('default')
    return dict(expired_total=len(expired),erased=sum(r.status=='Expired' and not r.payload_cipher for r in expired),
        payloads_remaining=sum(bool(r.payload_cipher) for r in expired),future_preserved=future.status=='Pending' and bool(future.payload_cipher),
        business_unchanged=business_digest(data)==s['business_before'],business=business_digest(data),
        complete_logs=sum(r.status=='Complete' for r in logs),failed_logs=sum(r.status=='Failed' for r in logs),queued=q.count,
        candidate_mode_enabled=bool(frappe.conf.get('kandil_candidate_identity_enabled')))


def cleanup(run_id):
    base.isolated(run_id)
    if not frappe.conf.get('pause_scheduler'):raise RuntimeError('Pause before cleanup')
    from rq import Worker
    from frappe.utils.background_jobs import get_redis_conn
    for worker in Worker.all(connection=get_redis_conn()):
        if worker.name.startswith('kandil-scheduled-'+run_id+'-'):
            try:os.kill(worker.pid,0)
            except ProcessLookupError:worker.register_death()
            else:raise RuntimeError('Isolated worker still alive')
    if not fixture.path_for(run_id).exists():return fixture.verify_absent(run_id)
    data=state(run_id)
    for row in data.get('recovery_schedule',{}).get('jobs',[]):
        frappe.db.set_value('Scheduled Job Type',row['name'],dict(stopped=row['stopped'],create_log=row['create_log']),update_modified=False)
    # Explicitly retire the future synthetic request without running another
    # expiry batch or touching immutable business receipts/audit records.
    with patch.dict(frappe.conf,{'kandil_candidate_identity_enabled':1}),acting_as(data['users']['recruiter']['email']):
        for row in frappe.get_all(recovery.DT,filters={'request':data['candidate']['request'],'status':['in',['Pending','Completed']]},fields=['name','status']):
            # Expired envelopes from an interrupted run are kept for inspection;
            # native fixture retirement disables their actor and cancels requests.
            doc=frappe.get_doc(recovery.DT,row.name)
            if recovery.deadline(doc)>now_datetime():
                (recovery.acknowledge if row.status=='Completed' else recovery.cancel)(row.name)
    frappe.db.commit();result=candidates.cleanup(run_id)
    return result|dict(scheduler_paused=True)
