"""CLI-only synthetic calendar UI cohort, using the real current Cairo date."""
import json
from datetime import timedelta
import frappe
from kandil_hr.foundation.clock import now_cairo
from kandil_hr.portal import fixture
from kandil_hr.recruitment.browser_fixture import guard


def load(run_id):
    guard(run_id)
    data = json.loads(fixture.path_for(run_id).read_text())
    if data['company'] != 'Kandil PORTAL TEST ' + run_id or data.get('cleaned'):
        raise RuntimeError('Invalid active synthetic calendar cohort')
    return data


def prepare(run_id):
    result = fixture.prepare(run_id)
    data = load(run_id)
    frappe.get_doc(dict(doctype='Kandil Business Calendar', company=data['company'],
        calendar_title='Synthetic calendar UI', weekend_days='4,5', timezone='Africa/Cairo')).insert(ignore_permissions=True)
    frappe.db.commit()
    return result


def waiting(run_id, name):
    data = load(run_id)
    doc = frappe.get_doc('Kandil Hiring Request', name, for_update=True)
    if doc.company != data['company'] or doc.status != 'Pending':
        raise RuntimeError('Requires own synthetic pending request')
    step = next(row for row in doc.approval_steps if row.decision == 'Pending')
    instant = (now_cairo() - timedelta(days=8)).replace(tzinfo=None)
    frappe.db.set_value('Kandil Approval Step', step.name, 'waiting_since', instant, update_modified=False)
    frappe.db.commit()
    return dict(prepared=True)


def unavailable(run_id):
    data = load(run_id)
    # Ambiguous calendar is a real configuration error, with no request mutation.
    frappe.get_doc(dict(doctype='Kandil Business Calendar', company=data['company'],
        calendar_title='Synthetic ambiguous calendar', weekend_days='4,5', timezone='Africa/Cairo')).insert(ignore_permissions=True)
    frappe.db.commit()
    return dict(prepared=True)


def revoke(run_id):
    data = load(run_id)
    for name in frappe.get_all('Kandil Access Grant', filters={'user':data['users']['requester']['email'], 'company':data['company']}, pluck='name'):
        doc = frappe.get_doc('Kandil Access Grant', name)
        doc.revoked = 1
        doc.save(ignore_permissions=True)
    frappe.db.commit()
    return dict(revoked=True)


def cleanup(run_id):
    guard(run_id)
    return fixture.cleanup(run_id)
