"""CLI-only native scheduled-hook proof in the separate deployment sandbox.

Requires a private container marker, exact site/UUID and opted-in muted config.
No whitelisted endpoints, mocked clocks, shared development jobs or external mail.
"""
import json
import os
from pathlib import Path
import time
import uuid

import frappe
from frappe.utils import add_to_date, now_datetime, today

from kandil_hr.foundation import outbox
from kandil_hr.foundation.clock import now_cairo
from kandil_hr.portal import fixture
from kandil_hr.portal.route_preview_fixture import load
from kandil_hr.recruitment import api, ownership, vacancies
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as

METHODS = ('kandil_hr.recruitment.sla.process_pending',
    'kandil_hr.foundation.outbox.process_pending',
    'kandil_hr.recruitment.ownership.process_disabled_handoffs')
MARKER = Path('/workspace/kandil-scheduler-isolation.json')


def isolated(run_id):
    guard(run_id)
    if not MARKER.exists() or not Path('/opt/kandil-source/deployment/compose.yaml').exists():
        raise RuntimeError('Requires the separate scheduler sandbox container')
    m = json.loads(MARKER.read_text())
    if (m.get('run_id') != run_id or m.get('status') != 'ready'
            or m.get('isolated_stack') != 'kandil-hr-sandbox'
            or frappe.conf.get('kandil_scheduler_rehearsal') != run_id
            or not frappe.conf.get('mute_emails')):
        raise RuntimeError('Scheduler rehearsal identity/configuration mismatch')
    if any('TEST' not in c for c in frappe.get_all('Company', pluck='name')):
        raise RuntimeError('Scheduler rehearsal must contain synthetic companies only')


def config(**values):
    path = Path(frappe.get_site_path('site_config.json'))
    data = json.loads(path.read_text());data.update(values)
    path.write_text(json.dumps(data, indent=2)+'\n');path.chmod(0o600)


def state(run_id):
    isolated(run_id)
    return load(run_id)


def request(data, title):
    with acting_as(data['users']['requester']['email']):
        doc = frappe.get_doc(dict(doctype='Kandil Hiring Request', company=data['company'],
            department=data['department'], title=title+' '+data['run_id'],
            requested_position=data['positions'][0], revision=1, need_reason='Expansion',
            requested_priority='Normal', lines=[dict(capacity=data['capacities'][0], requested_qty=1)])).insert()
        api.submit_request(doc.name, uuid.uuid4().hex, str(doc.modified))
    return frappe.get_doc(doc.doctype, doc.name)


def prepare(run_id):
    isolated(run_id)
    if not frappe.conf.get('pause_scheduler'):
        raise RuntimeError('Prepare only while scheduler is paused')
    fixture.prepare(run_id)
    data = load(run_id)
    pending = request(data, 'Synthetic automatic reminder')
    step = next(s for s in pending.approval_steps if s.decision == 'Pending')
    waiting = add_to_date(now_cairo().replace(tzinfo=None), days=-8)
    frappe.db.set_value('Kandil Approval Step', step.name, 'waiting_since', waiting, update_modified=False)
    # Seven-day synthetic workweek makes this test date-independent. Native SLA
    # suite separately verifies real configured weekends and holidays.
    frappe.get_doc(dict(doctype='Kandil Business Calendar',company=data['company'],
        calendar_title='Synthetic seven-day scheduler test',weekend_days='',timezone='Africa/Cairo')).insert(ignore_permissions=True)
    approved = request(data, 'Synthetic scheduled recruiter cleanup')
    for key in ('manager','hr'):
        approved.reload()
        step = next(s for s in approved.approval_steps if s.decision == 'Pending')
        with acting_as(data['users'][key]['email']):
            api.decide(name=approved.name,decision='Approve',command_id=uuid.uuid4().hex,expected_version=str(approved.modified),step_id=step.step_key)
    approved.reload()
    opening = approved.lines[0].job_opening
    def vacancy_call(method, **kwargs):
        approved.reload()
        with acting_as(data['users']['hr']['email']):
            return method(approved.name,opening_name=opening,command_id=uuid.uuid4().hex,
                expected_version=str(approved.modified),reason='Synthetic scheduler proof',**kwargs)
    vacancy_call(vacancies.assign_team,lead=data['users']['recruiter']['email'],members=[data['users']['hr']['email']])
    vacancy_call(vacancies.set_state,action='Open')
    with acting_as(data['users']['recruiter']['email']):
        applicant = frappe.get_doc(dict(doctype='Job Applicant',applicant_name='Synthetic scheduler applicant',
            phone_number='01012345678',job_title=opening)).insert()
        approved.reload()
        ownership.set_next_action(applicant.name,task='Synthetic callback',due=today(),
            owner=data['users']['recruiter']['email'],reason='Synthetic scheduler proof',command_id=uuid.uuid4().hex,
            expected_version=str(approved.modified),application_version=str(applicant.modified))
    # Simulate a previously committed disable whose after-commit callback did not
    # run. This tests the hourly fallback, not the immediate disable hook.
    frappe.db.set_value('User',data['users']['recruiter']['email'],'enabled',0)
    retry = outbox.enqueue('scheduled-retry:'+run_id,data['users']['requester']['email'],
        'Synthetic scheduled retry',reference_doctype=pending.doctype,reference_name=pending.name)
    outbox._record_failure(retry,'SyntheticFailure')
    jobs = frappe.get_all('Scheduled Job Type',fields=['name','method','stopped','frequency','create_log','last_execution'],limit_page_length=0)
    if set(METHODS)-{j.method for j in jobs}:
        raise RuntimeError('Installed scheduler hooks missing; migrate before rehearsal')
    data['scheduler'] = dict(pending=pending.name,approved=approved.name,opening=opening,applicant=applicant.name,
        retry=retry,jobs=jobs,armed=False)
    persist(fixture.path_for(run_id),data)
    frappe.db.commit()
    return dict(prepared=True,accounts=6,registered_methods=[j.method for j in jobs if j.method in METHODS])


def arm(run_id):
    data=state(run_id)
    if data['scheduler']['armed']:
        raise RuntimeError('Already armed; inspect existing processes rather than restarting')
    for row in data['scheduler']['jobs']:
        frappe.db.set_value('Scheduled Job Type',row['name'],'stopped',1,update_modified=False)
        if row['method'] in METHODS:
            frappe.db.set_value('Scheduled Job Type',row['name'],dict(stopped=0,create_log=1,
                last_execution=add_to_date(now_datetime(),days=-2)),update_modified=False)
    due=add_to_date(now_datetime(),seconds=75)
    frappe.db.set_value('Kandil Notification Outbox',data['scheduler']['retry'],'next_attempt',due,update_modified=False)
    frappe.db.set_single_value('System Settings','enable_scheduler',1)
    config(pause_scheduler=0,disable_scheduler=0,scheduler_interval=60)
    data['scheduler'].update(armed=True,retry_due=str(due),armed_at=str(now_datetime()))
    persist(fixture.path_for(run_id),data)
    frappe.db.commit()
    return dict(armed=True,retry_due=str(due),hook_frequencies={r['method']:r['frequency'] for r in data['scheduler']['jobs'] if r['method'] in METHODS})


def scheduler_loop(run_id):
    """Native site scheduler dispatch every two seconds, bounded by private stop file.

    The scheduler's own due checks retain Daily/Hourly and one-minute All cadence.
    Only this site's enqueue entry is selected; no other site's flags are altered.
    """
    isolated(run_id)
    stop=MARKER.with_name('kandil-scheduler-stop-'+run_id)
    from frappe.utils.scheduler import enqueue_events_for_site
    started=time.monotonic()
    frappe.destroy()
    try:
        while not stop.exists() and time.monotonic()-started < 900:
            time.sleep(2)
            enqueue_events_for_site('kandil-parity.localhost')
    finally:
        frappe.init('kandil-parity.localhost',force=True);frappe.connect();frappe.set_user('Administrator')
    return dict(scheduler_stopped=True)


def worker(run_id, idle_limit=180):
    isolated(run_id)
    from frappe.utils.background_jobs import get_queue
    from rq import SimpleWorker
    q=get_queue('default')
    for job in q.jobs:
        if job.kwargs.get('site')!='kandil-parity.localhost':
            raise RuntimeError('Unexpected other-site job in isolated default queue')
    # Do not instantiate FrappeWorker, which starts the all-sites scheduler.
    w=SimpleWorker([q],connection=q.connection,name='kandil-scheduled-'+run_id+'-'+uuid.uuid4().hex,
        log_job_description=False)
    persist(MARKER.with_name('kandil-scheduler-worker-'+run_id+'.json'),dict(pid=os.getpid(),name=w.name))
    frappe.destroy()
    import logging, sys
    w.log.addHandler(logging.StreamHandler(sys.stderr))
    try:
        worked=w.work(with_scheduler=False,logging_level='INFO',max_idle_time=idle_limit)
    finally:
        frappe.init('kandil-parity.localhost',force=True);frappe.connect();frappe.set_user('Administrator')
    return dict(worker_stopped=True,worked=worked)


def inspect(run_id):
    data=state(run_id);s=data['scheduler']
    notices=frappe.get_all('Kandil Notification Outbox',filters=dict(reference_doctype='Kandil Hiring Request',
        reference_name=s['pending']),fields=['name','subject','recipient','status','attempts','notification_log','delivery_context','next_attempt'],limit_page_length=0)
    reminders=[r for r in notices if r.delivery_context]
    retry=frappe.get_doc('Kandil Notification Outbox',s['retry'])
    applicant=frappe.get_doc('Job Applicant',s['applicant']);opening=frappe.get_doc('Job Opening',s['opening'])
    logs=frappe.get_all('Scheduled Job Log',filters={'scheduled_job_type':['in',[r['name'] for r in s['jobs'] if r['method'] in METHODS]],'creation':['>=',s.get('armed_at') or now_datetime()]},
        fields=['name','scheduled_job_type','status','creation'],order_by='creation asc',limit_page_length=0)
    outage=frappe.get_doc('Kandil Notification Outbox',s['outage']) if s.get('outage') else None
    return dict(now=str(now_datetime()),retry_due=s.get('retry_due'),
        outage=dict(status=outage.status,attempts=outage.attempts,receipt=bool(outage.notification_log),
            captures=frappe.db.count('Kandil Mail Capture',dict(outbox=outage.name))) if outage else None,
        reminder_count=len(reminders),reminder_statuses=[r.status for r in reminders],
        reminder_receipts=sum(bool(r.notification_log) for r in reminders),
        reminder_captures=sum(frappe.db.count('Kandil Mail Capture',dict(outbox=r.name)) for r in reminders),
        reminder_stages=[json.loads(r.delivery_context)['stage'] for r in reminders],
        retry=dict(status=retry.status,attempts=retry.attempts,receipt=bool(retry.notification_log),
            captures=frappe.db.count('Kandil Mail Capture',dict(outbox=retry.name))),
        handoff=dict(lead_cleared=not opening.custom_kandil_lead,owner_cleared=not applicant.custom_kandil_responsible_user,
            next_owner_cleared=not applicant.custom_kandil_next_action_owner,state=applicant.custom_kandil_ownership_state,
            events=len(json.loads(applicant.custom_kandil_ownership_history or '[]')),
            audits=frappe.db.count('Kandil Security Event',dict(target_user=data['users']['recruiter']['email'],action='Recruitment ownership cleanup'))),
        logs=logs,job_methods={r['name']:r['method'] for r in s['jobs'] if r['method'] in METHODS},
        pending_status=frappe.db.get_value('Kandil Hiring Request',s['pending'],'status'),
        ledgers=fixture.inspect(run_id)['capacities'])


def stop(run_id):
    isolated(run_id)
    MARKER.with_name('kandil-scheduler-stop-'+run_id).touch(mode=0o600)
    config(pause_scheduler=1)
    frappe.db.set_single_value('System Settings','enable_scheduler',0)
    frappe.db.commit()
    return dict(paused=True)


def cleanup(run_id):
    data=state(run_id)
    if not frappe.conf.get('pause_scheduler'):
        raise RuntimeError('Pause scheduler and stop its worker before cleanup')
    # No running cohort worker may race retirement. Dead workers must be stopped
    # and observed terminal by the host runner before entering here.
    from rq import Worker
    from frappe.utils.background_jobs import get_redis_conn
    for w in Worker.all(connection=get_redis_conn()):
        if w.name.startswith('kandil-scheduled-'+run_id+'-'):
            try: os.kill(w.pid,0)
            except ProcessLookupError: w.register_death()
            else: raise RuntimeError('A scheduler rehearsal worker is still alive')
    with acting_as(data['users']['hr']['email']):
        app=frappe.get_doc('Job Applicant',data['scheduler']['applicant'])
        app.status='Rejected';app.save()
    for row in data['scheduler']['jobs']:
        frappe.db.set_value('Scheduled Job Type',row['name'],dict(stopped=row['stopped'],create_log=row['create_log']),update_modified=False)
    frappe.db.commit()
    result=fixture.cleanup(run_id)
    result.update(scheduler_paused=True,external_email_sent=False)
    return result


def stop_worker(run_id):
    isolated(run_id)
    path=MARKER.with_name('kandil-scheduler-worker-'+run_id+'.json')
    if not path.exists():
        return dict(worker_not_started=True)
    worker_state=json.loads(path.read_text())
    pid=worker_state['pid']
    proc=Path('/proc')/str(pid)/'cmdline'
    if not proc.exists():
        return dict(worker_already_stopped=True)
    command_line=proc.read_bytes()
    if b'kandil_hr.foundation.scheduler_rehearsal.worker' not in command_line and worker_state['name'].encode() not in command_line:
        raise RuntimeError('Worker PID identity changed; refusing signal')
    import signal
    os.kill(pid,signal.SIGTERM)
    return dict(stop_requested=True)


def queue_during_outage(run_id):
    data=state(run_id)
    if data['scheduler'].get('outage'):
        raise RuntimeError('Outage probe already queued')
    pid_path=MARKER.with_name('kandil-scheduler-worker-'+run_id+'.json')
    if Path('/proc',str(json.loads(pid_path.read_text())['pid'])).exists():
        raise RuntimeError('Stop and observe worker terminal before outage probe')
    name=outbox.enqueue('scheduled-outage:'+run_id,data['users']['requester']['email'],
        'Synthetic worker outage recovery',reference_doctype='Kandil Hiring Request',
        reference_name=data['scheduler']['pending'])
    # Make the unchanged Daily/Hourly hooks due again to exercise their replay
    # after restart. Their production frequencies and implementation stay intact.
    for row in data['scheduler']['jobs']:
        if row['method'] in METHODS:
            frappe.db.set_value('Scheduled Job Type',row['name'],'last_execution',
                add_to_date(now_datetime(),days=-2),update_modified=False)
    data['scheduler']['outage']=name
    persist(fixture.path_for(run_id),data)
    frappe.db.commit()
    return dict(queued=True)


def retire_failed_prepare(run_id):
    isolated(run_id)
    data=load(run_id)
    if data.get('scheduler') or not frappe.conf.get('pause_scheduler'):
        raise RuntimeError('Use normal cleanup for a prepared or armed cohort')
    return fixture.cleanup(run_id)


def next_attempt(run_id):
    isolated(run_id)
    data=json.loads(fixture.path_for(run_id).read_text())
    if not data.get('cleaned') or not frappe.conf.get('pause_scheduler'):
        raise RuntimeError('Retire prior cohort and pause before a fresh attempt')
    next_id=uuid.uuid4().hex[:12]
    m=json.loads(MARKER.read_text());m['run_id']=next_id
    config(kandil_scheduler_rehearsal=next_id)
    persist(MARKER,m)
    return dict(run_id=next_id,previous=run_id)
