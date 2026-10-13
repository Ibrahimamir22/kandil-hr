"""Opted-in parity CLI/RQ recovery proof. Never starts Frappe's global scheduler.

Only UUID-cohort records and one private RQ queue are touched. Deliberate process
exit is restricted to that queue's own job, after real transactional writes.
"""
import hashlib
import json
import os
import uuid
from unittest.mock import patch

import frappe
from frappe.utils import add_to_date, now_datetime

from kandil_hr.foundation import outbox
from kandil_hr.portal import fixture
from kandil_hr.portal.route_preview_fixture import load
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as

LABELS = ('before_commit', 'after_commit', 'retry', 'exhaust', 'revoked', 'healthy')


def queue_for(run_id):
    guard(run_id)
    from rq import Queue
    from frappe.utils.background_jobs import get_redis_conn
    return Queue('kandil-recovery-' + run_id, connection=get_redis_conn())


def marker(run_id):
    guard(run_id)
    return fixture.path_for(run_id).with_name('kandil-worker-marker-' + run_id + '.json')


def shared_queues(run_id):
    """Read-only job membership fingerprints, excluding this cohort's queue."""
    from rq import Queue
    q = queue_for(run_id)
    return {other.name: dict(count=other.count,
        membership_sha256=hashlib.sha256(json.dumps(other.job_ids).encode()).hexdigest())
        for other in Queue.all(connection=q.connection) if other.name != q.name}


def prepare(run_id):
    guard(run_id)
    baseline = shared_queues(run_id)
    fixture.prepare(run_id)
    data = load(run_id)
    with acting_as(data['users']['requester']['email']):
        request = frappe.get_doc(dict(doctype='Kandil Hiring Request', company=data['company'],
            department=data['department'], title='Synthetic worker recovery ' + run_id,
            requested_position=data['positions'][0], revision=1, need_reason='Expansion',
            requested_priority='Normal', lines=[dict(capacity=data['capacities'][0], requested_qty=1)])).insert()
    data['recovery'] = dict(request=request.name, notices={}, jobs=[], shared_queues=baseline)
    for label in LABELS:
        data['recovery']['notices'][label] = outbox.enqueue('worker-recovery:' + run_id + ':' + label,
            data['users']['requester']['email'], 'Synthetic worker recovery ' + label,
            'Synthetic local capture only', 'Kandil Hiring Request', request.name)
    persist(fixture.path_for(run_id), data)
    frappe.db.commit()
    return dict(prepared=True, accounts=6, notices=len(LABELS), queue=queue_for(run_id).name)


def enqueue(run_id, label, mode='normal'):
    data = load(run_id)
    if label not in LABELS or mode not in ('normal', 'fail', 'before_commit', 'after_commit'):
        raise ValueError('Unknown recovery scenario')
    q = queue_for(run_id)
    from frappe.utils.background_jobs import execute_job
    job = q.enqueue(execute_job, kwargs=dict(site=frappe.local.site,
        method='kandil_hr.foundation.worker_recovery_fixture.run_job', event=None,
        job_name='Synthetic isolated recovery', user='Administrator',
        kwargs=dict(run_id=run_id, label=label, mode=mode)), job_id=q.name + '-' + uuid.uuid4().hex,
        job_timeout=60, result_ttl=3600, failure_ttl=3600)
    data['recovery']['jobs'].append(job.id)
    persist(fixture.path_for(run_id), data)
    return dict(queued=True, job=job.id)


def run_job(run_id, label, mode):
    data = load(run_id)
    from rq import get_current_job
    job = get_current_job()
    if (not job or job.origin != queue_for(run_id).name
            or job.id not in data['recovery']['jobs'] or label not in LABELS):
        raise RuntimeError('Recovery fault injection requires this cohort private RQ job')
    name = data['recovery']['notices'][label]
    original = outbox.deliver

    def interrupted(target):
        if target != name:
            raise RuntimeError('Cross-cohort recovery delivery denied')
        result = original(target)
        if result != 'Delivered locally':
            raise RuntimeError('Fault point requires actual receipt and capture writes')
        if mode == 'fail':
            raise RuntimeError('Synthetic private error content must never be persisted')
        if mode == 'before_commit':
            persist(marker(run_id), dict(point=mode, pid=os.getpid(), writes_created=True))
            os._exit(91)
        return result

    if mode in ('fail', 'before_commit'):
        with patch.object(outbox, 'deliver', side_effect=interrupted):
            result = outbox.process_one(name)
    else:
        result = outbox.process_one(name)
    if mode == 'after_commit':
        persist(marker(run_id), dict(point=mode, pid=os.getpid(), committed=True))
        os._exit(92)
    return dict(label=label, status=result)


def work(run_id):
    """One independent SimpleWorker: deliberately excludes FrappeWorker auto-scheduler."""
    load(run_id)
    from rq import SimpleWorker
    q = queue_for(run_id)
    worker = SimpleWorker([q], connection=q.connection, name=q.name + '-' + uuid.uuid4().hex,
        log_job_description=False)
    frappe.destroy()
    try:
        worker.work(burst=True, with_scheduler=False, logging_level='WARNING')
    finally:
        frappe.init('kandil-parity.localhost', force=True)
        frappe.connect()
        frappe.set_user('Administrator')
    return dict(worker_finished=True)


def make_due(run_id, label):
    """Controlled retry-clock setup only; not evidence of a wall-clock scheduler."""
    data = load(run_id)
    if label not in ('retry', 'exhaust', 'revoked'):
        raise ValueError('Only designated retry cases may move their retry timestamp')
    name = data['recovery']['notices'][label]
    if frappe.db.get_value('Kandil Notification Outbox', name, 'status') not in ('Retry', 'Pending'):
        raise RuntimeError('Only a pending/retry notice can be made due')
    frappe.db.set_value('Kandil Notification Outbox', name, 'next_attempt',
        add_to_date(now_datetime(), minutes=-1), update_modified=False)
    frappe.db.commit()
    return dict(due=True)


def retry_failed(run_id):
    data = load(run_id)
    result = outbox.retry_failed(data['recovery']['notices']['exhaust'], 'Synthetic operator diagnosis and recovery')
    frappe.db.commit()
    return result


def revoke(run_id):
    data = load(run_id)
    for name in frappe.get_all('Kandil Access Grant', filters=dict(company=data['company'],
            user=data['users']['requester']['email']), pluck='name'):
        doc = frappe.get_doc('Kandil Access Grant', name)
        doc.revoked = 1
        doc.save(ignore_permissions=True)
    frappe.db.commit()
    return dict(revoked=True)


def inspect(run_id):
    data = load(run_id)
    result = {}
    for label, name in data['recovery']['notices'].items():
        row = frappe.get_doc('Kandil Notification Outbox', name)
        result[label] = dict(status=row.status, attempts=row.attempts, last_error=row.last_error,
            manual_retries=row.manual_retries or 0, next_attempt=str(row.next_attempt),
            receipt_count=frappe.db.count('Notification Log', dict(for_user=row.recipient,
                document_type=row.reference_doctype, document_name=row.reference_name, subject=row.subject)),
            capture_count=frappe.db.count('Kandil Mail Capture', dict(outbox=name)),
            receipt_link=bool(row.notification_log))
    return dict(notices=result, marker=json.loads(marker(run_id).read_text()) if marker(run_id).exists() else None,
        shared_queues_unchanged=shared_queues(run_id) == data['recovery']['shared_queues'])


def cleanup(run_id):
    data = load(run_id)
    q = queue_for(run_id)
    from rq.job import Job
    from rq import Worker
    workers = [w for w in Worker.all(connection=q.connection) if w.name.startswith(q.name + '-')]
    for worker in workers:
        if worker.pid:
            try:
                os.kill(worker.pid, 0)
            except ProcessLookupError:
                pass
            else:
                raise RuntimeError('A cohort worker process is still alive; do not clean its jobs')
    for job_id in data['recovery']['jobs']:
        if not job_id.startswith(q.name + '-'):
            raise RuntimeError('Foreign job in synthetic manifest')
        job = Job.fetch(job_id, connection=q.connection)
        if job.origin != q.name:
            raise RuntimeError('Foreign queue in synthetic manifest')
        job.delete()
    # Burst workers finished or deliberate os._exit was observed by the harness.
    # Remove only this cohort's worker metadata, never stop another process.
    for worker in workers:
        worker.register_death()
    q.delete(delete_jobs=True)
    result = fixture.cleanup(run_id)
    result['shared_queues_unchanged'] = shared_queues(run_id) == data['recovery']['shared_queues']
    result['private_queue_empty'] = q.count == 0
    return result
