"""Seven-account CLI-only notification/independent-amendment HTTP cohort.

No shared worker, external mail or real staff. Retire the exact cohort through
normal cancellation, retaining history and disabling every generated account.
"""
import json
import secrets
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

import frappe
from frappe.utils import today
from frappe.utils.password import update_password

from kandil_hr.foundation import outbox
from kandil_hr.foundation.clock import test_clock
from kandil_hr.portal import fixture, request_operations_fixture
from kandil_hr.recruitment import sla
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist


def load(run_id):
    guard(run_id)
    data = json.loads(fixture.path_for(run_id).read_text())
    if data['company'] != 'Kandil PORTAL TEST ' + run_id:
        raise RuntimeError('Invalid synthetic notification cohort')
    return data


def prepare(run_id):
    guard(run_id)
    fixture.prepare(run_id)
    data = load(run_id)
    email = f'portal-{run_id}-ceo@example.invalid'
    password = secrets.token_urlsafe(28)
    with patch.dict(frappe.flags, {'in_import': True}), fixture.local_user_contacts(run_id):
        frappe.get_doc(dict(doctype='User', email=email, first_name='Synthetic independent CEO',
            enabled=1, send_welcome_email=0, user_type='System User',
            roles=[dict(role='Kandil CEO Approver')])).insert(ignore_permissions=True)
    update_password(email, password, logout_all_sessions=True)
    data['users']['ceo'] = dict(email=email, password=password)
    frappe.get_doc(dict(doctype='Kandil Access Grant', user=email, company=data['company'],
        department=data['department'], valid_from=today(), can_manage_recruitment=1,
        reason='Synthetic independent amendment reviewer')).insert(ignore_permissions=True)
    settings = frappe.get_doc('Kandil Organization Settings', data['company'])
    settings.ceo_approver = email
    settings.save(ignore_permissions=True)
    route = frappe.get_doc('Kandil Recruitment Route', dict(company=data['company'], department=data['department']))
    route.ceo_approver = email
    route.save(ignore_permissions=True)
    frappe.get_doc(dict(doctype='Kandil Business Calendar', company=data['company'],
        calendar_title='Synthetic reminder calendar', weekend_days='4,5', timezone='Africa/Cairo')).insert(ignore_permissions=True)
    persist(fixture.path_for(run_id), data)
    frappe.db.commit()
    return dict(prepared=True, accounts=7, credentials='private-file-only')


def queue_reminder(run_id, name):
    data = load(run_id)
    doc = frappe.get_doc('Kandil Hiring Request', name, for_update=True)
    if doc.company != data['company'] or not doc.amends or doc.status != 'Pending':
        raise RuntimeError('Requires an exact synthetic pending amendment')
    step = next(row for row in doc.approval_steps if row.decision == 'Pending')
    if step.principal != data['users']['ceo']['email']:
        raise RuntimeError('Requires synthetic CEO active step')
    frappe.db.set_value('Kandil Approval Step', step.name, 'waiting_since', '2026-10-08 12:00:00', update_modified=False)
    with patch.dict(frappe.flags, {'in_test': True}), test_clock(datetime(2026, 10, 12, 12, tzinfo=ZoneInfo('Africa/Cairo'))):
        result = sla.process_request(name)
    data['reminders'] = result['outbox']
    persist(fixture.path_for(run_id), data)
    frappe.db.commit()
    return dict(stage=result['status'], queued=len(result['outbox']))


def deliver(run_id):
    data = load(run_id)
    requests = frappe.get_all('Kandil Hiring Request', filters={'company': data['company']}, pluck='name')
    accounts = [a['email'] for a in data['users'].values()]
    notices = frappe.get_all('Kandil Notification Outbox', filters={
        'reference_doctype': 'Kandil Hiring Request', 'reference_name': ['in', requests],
        'recipient': ['in', accounts], 'status': ['in', ['Pending', 'Retry']],
    }, pluck='name', order_by='name asc', limit_page_length=0)
    counts = {}
    for name in notices:
        status = outbox.deliver(name)
        counts[status] = counts.get(status, 0) + 1
    reminders = [frappe.db.get_value('Kandil Notification Outbox', n,
        ['status', 'notification_log'], as_dict=True) for n in data.get('reminders', [])]
    frappe.db.commit()
    return dict(counts=counts, reminders=reminders, external_email_sent=False)


def cleanup(run_id):
    load(run_id)
    return request_operations_fixture.cleanup(run_id)
