"""Event-triggered approval invitations with periodic recovery.

Authorized domain writes enqueue only after commit. Workers re-read current
state; job parameters confer no authority. Local outbox delivery rechecks it.
"""
import hashlib
import json

import frappe
from frappe import _

from kandil_hr.recruitment import reminder_recipients
from kandil_hr.recruitment.models import enabled

PREFIX = 'kandil_hr.recruitment.invitations.'
METHODS = {PREFIX + name for name in ('process_request', 'process_delegation', 'process_pending')}


def _guard():
    job = getattr(frappe.local, 'job', None)
    worker = job and job.get('method') in METHODS and job.get('site') == frappe.local.site
    if getattr(frappe.local, 'request', None) or (frappe.session.user != 'Administrator' and not worker):
        frappe.throw(_('Approval invitations are restricted to internal workers.'), frappe.PermissionError)


def schedule_request(doc):
    if enabled() and doc.status == 'Pending':
        frappe.enqueue(PREFIX + 'process_request', name=doc.name, queue='short', enqueue_after_commit=True)


def schedule_delegation(doc):
    old = doc.get_doc_before_save()
    if (enabled() and not doc.revoked and doc.approval_status == 'Active'
            and (doc.process_scope or 'APPROVALS') in ('APPROVALS', 'ALL')
            and (not old or old.approval_status != 'Active')):
        frappe.enqueue(PREFIX + 'process_delegation', name=doc.name, queue='short', enqueue_after_commit=True)


def process_request(name):
    """One domain transaction; Frappe job execution owns commit/rollback."""
    _guard()
    if not enabled():
        return dict(status='Disabled', outbox=[])
    company = frappe.db.get_value('Kandil Hiring Request', name, 'company')
    if not company:
        return dict(status='Inactive', outbox=[])
    frappe.db.sql('SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE', (company,))
    doc = frappe.get_doc('Kandil Hiring Request', name, for_update=True)
    if doc.company != company:
        raise RuntimeError('Approval invitation company changed; retry transaction')
    step = next((s for s in doc.approval_steps if s.decision == 'Pending'), None)
    if doc.status != 'Pending' or not step:
        return dict(status='Inactive', outbox=[])
    if not step.waiting_since or not step.step_key or not step.principal:
        raise ValueError('Active approval step lacks a frozen invitation identity')
    plan = reminder_recipients.candidates(doc, step, 'invitation')
    for user in sorted(set(plan) | {s.principal for s in doc.approval_steps if s.principal}):
        frappe.db.sql('SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE', (user,))
    from kandil_hr.foundation.outbox import enqueue
    subject = 'Approval requested / مطلوب اعتمادك'
    body = (f'Request {doc.name}: approval step {step.idx} is waiting for your review. '
        f'/ الطلب {doc.name}: خطوة الاعتماد {step.idx} بانتظار مراجعتك.')
    context = dict(kind='approval_invitation_v1', revision=int(doc.revision),
        step_key=step.step_key, principal=step.principal, waiting_since=str(step.waiting_since), stage='invitation')
    queued = []
    for user, bases in sorted(plan.items()):
        current = reminder_recipients.eligible(doc, step, user, bases)
        if not current:
            continue
        recipient_context = context | {'recipient_basis': current}
        digest = hashlib.sha256(json.dumps(recipient_context, sort_keys=True).encode()).hexdigest()[:24]
        key = f'approval-invitation:v1:{name}:{user}:{digest}'
        queued.append(enqueue(key, user, subject, body, doc.doctype, doc.name, delivery_context=recipient_context))
    return dict(status='Queued', outbox=queued)


def _process(names):
    result = dict(processed=0, failed=0)
    for name in names:
        try:
            process_request(name)
            frappe.db.commit()
            result['processed'] += 1
        except Exception as error:
            frappe.db.rollback()
            frappe.get_doc(dict(doctype='Error Log', method='Approval invitation generation failed',
                error=f'{name}: {type(error).__name__}; review active-step configuration and authority.')).insert(ignore_permissions=True)
            frappe.db.commit()
            result['failed'] += 1
    return result


def process_delegation(name):
    """Catch active requests after a new/CEO-approved delegation commits."""
    _guard()
    if not enabled():
        return dict(processed=0, failed=0, disabled=True)
    grant = frappe.db.get_value('Kandil Delegation', name, ['company', 'department', 'from_user'], as_dict=True)
    if not grant:
        return dict(processed=0, failed=0)
    # Discovery is only a hint. Each request and recipient is rechecked under
    # Company/request/User locks, so revoked/future/expired grants lend no access.
    names = frappe.db.sql('''SELECT DISTINCT r.name FROM `tabKandil Hiring Request` r
        INNER JOIN `tabKandil Approval Step` s ON s.parent=r.name
        WHERE r.status='Pending' AND r.company=%s AND r.department=%s
        AND s.decision='Pending' AND s.principal=%s ORDER BY r.name''',
        (grant.company, grant.department, grant.from_user), pluck=True)
    return _process(names)


def process_pending():
    """Scheduler recovery for missed jobs and newly effective dated grants."""
    _guard()
    if not enabled():
        return dict(processed=0, failed=0, disabled=True)
    return _process(frappe.get_all('Kandil Hiring Request', filters={'status': 'Pending'},
        pluck='name', order_by='name asc', limit_page_length=0))
