"""Fresh nine-account CLI-only reminder audience rehearsal; never external email."""
import json
from datetime import timedelta
import frappe
from kandil_hr.foundation.clock import now_cairo
from kandil_hr.portal import fixture, board_fixture, delegations_fixture
from kandil_hr.recruitment import sla
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist


def load(run_id):
    guard(run_id)
    data = json.loads(fixture.path_for(run_id).read_text())
    if data['company'] != 'Kandil PORTAL TEST ' + run_id or data.get('cleaned'):
        raise RuntimeError('Invalid active reminder cohort')
    return data


def prepare(run_id):
    result = board_fixture.prepare(run_id)
    data = load(run_id)
    user = frappe.get_doc('User', data['users']['recruiter']['email'])
    user.append('roles', dict(role='Kandil Approver'))
    with fixture.local_user_contacts(run_id):user.save(ignore_permissions=True)
    # Seven-day synthetic calendar makes this HTTP scenario date independent.
    # The native calendar suite separately covers weekends/holidays and DST.
    frappe.get_doc(dict(doctype='Kandil Business Calendar', company=data['company'],
        calendar_title='Synthetic recipient rehearsal', weekend_days='', timezone='Africa/Cairo')).insert(ignore_permissions=True)
    frappe.db.commit()
    return result


def queue(run_id, name):
    data = load(run_id)
    doc = frappe.get_doc('Kandil Hiring Request', name, for_update=True)
    if doc.company != data['company'] or doc.status != 'Pending':
        raise RuntimeError('Requires own synthetic pending request')
    step = next(row for row in doc.approval_steps if row.decision == 'Pending')
    seen = data.setdefault('steps', [])
    if step.step_key not in seen:
        frappe.db.set_value('Kandil Approval Step', step.name, 'waiting_since', (now_cairo()-timedelta(days=2)).replace(tzinfo=None), update_modified=False)
        seen.append(step.step_key)
    result = sla.process_request(name)
    data['reminders'] = sorted(set(data.get('reminders', [])) | set(result['outbox']))
    persist(fixture.path_for(run_id), data)
    frappe.db.commit()
    return dict(stage=result['status'], notices=[frappe.db.get_value('Kandil Notification Outbox', n,
        ['name','recipient','status'], as_dict=True) for n in result['outbox']])


def deliver(run_id):
    data = load(run_id)
    from kandil_hr.foundation.outbox import process_one
    # Every target belongs to this private manifest and its synthetic company.
    for name in data.get('reminders', []):
        row = frappe.get_doc('Kandil Notification Outbox', name)
        if (row.recipient not in {v['email'] for v in data['users'].values()}
                or frappe.db.get_value('Kandil Hiring Request', row.reference_name, 'company') != data['company']):
            raise RuntimeError('Refusing unrelated notification')
        process_one(name)
    return dict(notices=[frappe.db.get_value('Kandil Notification Outbox', n,
        ['name','recipient','status','notification_log'], as_dict=True) for n in data.get('reminders', [])], external_email_sent=False)


def cleanup(run_id):
    guard(run_id)
    return delegations_fixture.cleanup(run_id)
