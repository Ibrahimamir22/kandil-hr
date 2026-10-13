"""Exact synthetic HTTP cohort's real post-commit RQ invitation jobs only."""
import json
import uuid

import frappe
from rq import Queue, SimpleWorker
from frappe.utils.background_jobs import get_queue, get_redis_conn

from kandil_hr.portal import fixture, reminder_recipient_fixture
from kandil_hr.recruitment import invitations
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist


def load(run_id):
    return reminder_recipient_fixture.load(run_id)


def queue_for(run_id):
    guard(run_id)
    return Queue('kandil-invitations-'+run_id, connection=get_redis_conn())


def prepare(run_id):
    return reminder_recipient_fixture.prepare(run_id)


def own_targets(data):
    return {
        invitations.PREFIX+'process_request': set(frappe.get_all('Kandil Hiring Request', filters={'company':data['company']}, pluck='name')),
        invitations.PREFIX+'process_delegation': set(frappe.get_all('Kandil Delegation', filters={'company':data['company']}, pluck='name')),
    }


def own(job, data, targets):
    args = job.kwargs
    return (args.get('site') == 'kandil-parity.localhost'
        and args.get('method') in targets
        and args.get('kwargs',{}).get('name') in targets[args['method']]
        and args.get('user') in {x['email'] for x in data['users'].values()})


def work(run_id):
    data = load(run_id); targets = own_targets(data)
    shared, private = get_queue('short'), queue_for(run_id)
    before = set(shared.job_ids)
    jobs = [j for j in shared.get_jobs() if j and own(j, data, targets)]
    moved = []
    for job in jobs:
        # Move only this cohort's exact authorized HTTP post-commit job. No
        # manually generated replacement and no shared/general worker.
        if shared.remove(job.id) != 1:
            raise RuntimeError('Synthetic job changed before isolated transfer')
        private.enqueue_job(job)
        moved.append(job.id)
    data['invitation_jobs'] = sorted(set(data.get('invitation_jobs',[])) | set(moved))
    persist(fixture.path_for(run_id),data)
    worker = SimpleWorker([private],connection=private.connection,
        name=private.name+'-'+uuid.uuid4().hex,log_job_description=False)
    frappe.destroy()
    try:
        worker.work(burst=True,with_scheduler=False,logging_level='WARNING')
    finally:
        frappe.init('kandil-parity.localhost',force=True);frappe.connect();frappe.set_user('Administrator')
    # Frappe execute_job restores worker authority and owns each transaction.
    from rq.job import Job
    states = [Job.fetch(k,connection=private.connection).get_status(refresh=True).value for k in moved]
    after = set(get_queue('short').job_ids)
    return dict(moved=len(moved),states=states,unrelated_jobs_preserved=before-set(moved)==after,
        notices=notices(data),private_queue_empty=private.count==0)


def notices(data):
    names = list(own_targets(data)[invitations.PREFIX+'process_request'])
    if not names:return []
    return frappe.get_all('Kandil Notification Outbox', filters={
        'reference_doctype':'Kandil Hiring Request','reference_name':['in',names],
        'subject':'Approval requested / مطلوب اعتمادك',
    },fields=['name','recipient','reference_name','status','notification_log'],order_by='creation,name')


def deliver(run_id):
    data = load(run_id)
    from kandil_hr.foundation.outbox import process_one
    for row in notices(data):
        if row.recipient not in {u['email'] for u in data['users'].values()}:
            raise RuntimeError('Foreign invitation recipient')
        process_one(row.name)
    return dict(notices=notices(data),external_email_sent=False)


def cleanup(run_id):
    data=load(run_id); targets=own_targets(data)
    shared,private=get_queue('short'),queue_for(run_id)
    from rq.job import Job
    # No worker runs during teardown. Only own queued jobs are removed, including
    # those triggered by fixture retirement after this first pass.
    def retire_jobs():
        for job in shared.get_jobs():
            if job and own(job,data,targets):shared.remove(job.id);job.delete()
        for job in private.get_jobs():
            if job and own(job,data,targets):private.remove(job.id);job.delete()
            else:raise RuntimeError('Foreign job in synthetic invitation queue')
        for key in data.get('invitation_jobs',[]):
            try:job=Job.fetch(key,connection=private.connection)
            except Exception as error:
                from rq.exceptions import NoSuchJobError
                if isinstance(error,NoSuchJobError):continue
                raise
            if not own(job,data,targets):raise RuntimeError('Foreign retained invitation job')
            if job.get_status(refresh=True).value=='started':raise RuntimeError('Invitation worker still running')
            job.delete()
    retire_jobs()
    result=reminder_recipient_fixture.cleanup(run_id)
    retire_jobs()
    return result | dict(own_invitation_jobs_retired=True,private_queue_empty=private.count==0)
