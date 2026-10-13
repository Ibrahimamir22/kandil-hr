"""Native invitation catch-up, only inside the existing separate synthetic sandbox."""
import os
from unittest.mock import patch

import frappe
from frappe.utils import add_to_date, now_datetime, today

from kandil_hr.foundation import scheduler_rehearsal as base
from kandil_hr.portal import fixture
from kandil_hr.portal.route_preview_fixture import load
from kandil_hr.recruitment import api, invitations
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as

METHODS = ('kandil_hr.recruitment.invitations.process_pending','kandil_hr.foundation.outbox.process_pending')


def state(run_id):
    base.isolated(run_id)
    return load(run_id)


def grant(data, role):
    # Deliberately model a committed mutation whose event callback was lost.
    # The real scheduler/worker methods below are never patched or called here.
    with patch.object(invitations,'schedule_delegation'), acting_as(data['users']['sector']['email']):
        return frappe.get_doc(dict(doctype='Kandil Delegation',company=data['company'],department=data['department'],
            from_user=data['users']['manager']['email'],to_user=data['users'][role]['email'],
            from_date=today(),to_date=add_to_date(today(),days=10),process_scope='APPROVALS',
            reason='Synthetic lost invitation callback')).insert()


def prepare(run_id):
    base.isolated(run_id)
    if not frappe.conf.get('pause_scheduler'):raise RuntimeError('Prepare only while paused')
    from frappe.core.doctype.scheduled_job_type.scheduled_job_type import sync_jobs
    # The normal migration clears hook caches before syncing scheduled jobs.
    # This isolated reused site must do the same after mounting newer source.
    frappe.clear_cache()
    sync_jobs()
    jobs=frappe.get_all('Scheduled Job Type',fields=['name','method','stopped','create_log','frequency'],limit_page_length=0)
    if set(METHODS)-{j.method for j in jobs}:raise RuntimeError('Catch-up hook not registered')
    frappe.db.commit()
    fixture.prepare(run_id);data=load(run_id)
    # Existing record ownership/permissions remain enforced in each ordinary-role action.
    for role in ('hr','recruiter'):
        user=frappe.get_doc('User',data['users'][role]['email'])
        user.append('roles',dict(role='Kandil Approver'))
        with fixture.local_user_contacts(run_id):user.save(ignore_permissions=True)
    with patch.object(invitations,'schedule_request'):
        pending=base.request(data,'Synthetic invitation recovery')
        cancelled=base.request(data,'Synthetic inactive invitation')
        with acting_as(data['users']['requester']['email']):
            api.cancel_request(cancelled.name,reason='Synthetic terminal request',command_id=__import__('uuid').uuid4().hex,expected_version=str(cancelled.modified))
    grant(data,'recruiter')
    active=set(frappe.get_all('Kandil Hiring Request',filters={'status':'Pending'},pluck='name'))
    if active!={pending.name}:raise RuntimeError('Unexpected active request in isolated catch-up site')
    data['catchup']=dict(pending=pending.name,cancelled=cancelled.name,jobs=jobs,armed=False)
    persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(prepared=True,accounts=6,missed_callbacks=True)


def arm(run_id):
    data=state(run_id);s=data['catchup']
    if s['armed']:raise RuntimeError('Already armed; inspect the live processes')
    for row in s['jobs']:
        fields=dict(stopped=1)
        if row['method'] in METHODS:fields.update(stopped=0,create_log=1,last_execution=add_to_date(now_datetime(),days=-2))
        frappe.db.set_value('Scheduled Job Type',row['name'],fields,update_modified=False)
    frappe.db.set_single_value('System Settings','enable_scheduler',1)
    base.config(pause_scheduler=0,disable_scheduler=0,scheduler_interval=60)
    s.update(armed=True,armed_at=str(now_datetime()));persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(frequencies={r['method']:r['frequency'] for r in s['jobs'] if r['method'] in METHODS},interval=60)


def late_grant(run_id):
    data=state(run_id)
    if data['catchup'].get('late_grant'):raise RuntimeError('Late grant already created')
    row=grant(data,'hr');data['catchup']['late_grant']=row.name
    persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(created=True,event_callback_dropped=True)


def inspect(run_id):
    data=state(run_id);s=data['catchup']
    rows=frappe.get_all('Kandil Notification Outbox',filters={'reference_name':['in',[s['pending'],s['cancelled']]],
        'subject':'Approval requested / مطلوب اعتمادك'},fields=['name','recipient','reference_name','status','notification_log'],limit_page_length=0)
    names={v['email']:k for k,v in data['users'].items()}
    jobs={r['name']:r['method'] for r in s['jobs'] if r['method'] in METHODS}
    logs=frappe.get_all('Scheduled Job Log',filters={'scheduled_job_type':['in',list(jobs)],'creation':['>=',s.get('armed_at') or now_datetime()]},fields=['scheduled_job_type','status'],limit_page_length=0)
    return dict(notices=[dict(role=names[r.recipient],status=r.status,receipt=bool(r.notification_log),
        captures=frappe.db.count('Kandil Mail Capture',{'outbox':r.name}),active_reference=r.reference_name==s['pending']) for r in rows],
        logs=[dict(method=jobs[r.scheduled_job_type],status=r.status) for r in logs],
        pending_status=frappe.db.get_value('Kandil Hiring Request',s['pending'],'status'),
        cancelled_status=frappe.db.get_value('Kandil Hiring Request',s['cancelled'],'status'),
        ledgers=fixture.inspect(run_id)['capacities'])


def cleanup(run_id):
    base.isolated(run_id)
    if not frappe.conf.get('pause_scheduler'):raise RuntimeError('Pause before cleanup')
    if not fixture.path_for(run_id).exists():
        result=fixture.verify_absent(run_id)
        if not result['absent']:raise RuntimeError('Partial fixture without retirement manifest')
        return result | dict(scheduler_paused=True)
    data=load(run_id)
    from rq import Worker
    from frappe.utils.background_jobs import get_redis_conn
    for w in Worker.all(connection=get_redis_conn()):
        if w.name.startswith('kandil-scheduled-'+run_id+'-'):
            try:os.kill(w.pid,0)
            except ProcessLookupError:w.register_death()
            else:raise RuntimeError('Catch-up worker still alive')
    for row in data.get('catchup',{}).get('jobs',[]):
        frappe.db.set_value('Scheduled Job Type',row['name'],dict(stopped=row['stopped'],create_log=row['create_log']),update_modified=False)
    # Explicitly revoke own delegations before the shared fixture retires accounts.
    with acting_as(data['users']['sector']['email']):
        for name in frappe.get_all('Kandil Delegation',filters={'company':data['company'],'revoked':0},pluck='name'):
            doc=frappe.get_doc('Kandil Delegation',name);doc.revoked=1;doc.revocation_reason='Synthetic catch-up retirement';doc.save()
    frappe.db.commit()
    result=fixture.cleanup(run_id)
    return result | dict(scheduler_paused=True,all_fixture_delegations_revoked=not frappe.db.count('Kandil Delegation',{'company':data['company'],'revoked':0}))
