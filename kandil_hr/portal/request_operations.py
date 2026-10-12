"""Personal-session adapters; recruitment commands own locks, receipts and audit.

Hints never authorize a mutation. Do not recheck stage before a command's exact
receipt replay: current access is revalidated by the authoritative command.
"""
import json
import re

import frappe
from frappe import _
from frappe.utils import get_datetime

from kandil_hr.foundation.security import request_scope
from kandil_hr.pilot.api import can_act
from kandil_hr.recruitment import api as commands
from kandil_hr.recruitment.corrections import correct_approved


def action_hints(doc):
    user = frappe.session.user
    hr = 'Kandil Recruiter' in frappe.get_roles(user)
    manage = request_scope(doc, user, 'manage')
    owner = doc.requested_by == user
    step = next((s for s in doc.approval_steps if s.decision == 'Pending'), None)
    review = bool(manage and hr and doc.status == 'Pending' and step
        and step.authority == 'HR Approval' and can_act(doc, step.principal)
        and 'Kandil Recruiter' in frappe.get_roles(step.principal)
        and request_scope(doc, step.principal, 'manage'))
    active_amendment = bool(frappe.db.exists(doc.doctype,
        {'amends': doc.name, 'status': ['in', ['Draft', 'Pending', 'Returned']]}))
    return dict(
        review=review,
        send_to_ceo=bool(review and not any(s.authority == 'CEO Approval' and s.decision == 'Pending' for s in doc.approval_steps)),
        cancel=bool(manage and (owner or hr) and not active_amendment and doc.status in ('Draft', 'Returned', 'Pending', 'Approved')),
        amend=bool(manage and (owner or hr) and not doc.amends and not active_amendment and doc.status in ('Approved', 'Filled')),
        correct_approved=bool(manage and hr and not doc.amends and not active_amendment and doc.status in ('Approved', 'Closed', 'Filled')),
        active_amendment=active_amendment,
    )


@frappe.whitelist(methods=['POST'])
def execute(name, operation, command_id, expected_version, payload):
    from kandil_hr.portal.api import authenticated, read_request

    authenticated()
    if not isinstance(name, str) or not 1 <= len(name) <= 140:
        frappe.throw(_('Choose a valid request identifier.'))
    if not isinstance(command_id, str) or not re.fullmatch(r'[a-zA-Z0-9-]{16,100}', command_id):
        frappe.throw(_('A valid command identifier is required.'))
    if not isinstance(expected_version, str) or not 1 <= len(expected_version) <= 40:
        frappe.throw(_('A valid reviewed record version is required.'))
    try:
        get_datetime(expected_version)
    except (TypeError, ValueError, OverflowError):
        frappe.throw(_('A valid reviewed record version is required.'))
    read_request(name)
    allowed = {
        'review': {'reason', 'quantities', 'priority'},
        'send_to_ceo': {'reason'}, 'cancel': {'reason'}, 'amend': {'reason'},
        'correct_approved': {'reason', 'fields', 'quantities', 'relocations'},
        'revise': {'reason'},
    }
    if not isinstance(operation, str) or operation not in allowed:
        frappe.throw(_('Unknown request action.'))
    if isinstance(payload, str) and len(payload) > 40000:
        frappe.throw(_('Only the selected action fields are accepted.'))
    values = frappe.parse_json(payload)
    if not isinstance(values, dict) or set(values) - allowed[operation] or len(json.dumps(values)) > 40000:
        frappe.throw(_('Only the selected action fields are accepted.'))
    reason = values.get('reason')
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 2000:
        frappe.throw(_('Enter an action reason of 1 to 2000 characters.'))
    for key in ('quantities', 'fields', 'relocations'):
        if key in values and (not isinstance(values[key], dict) or len(values[key]) > 50):
            frappe.throw(_('Action values must be objects with at most fifty entries.'))
    if operation == 'review' and not {'quantities', 'priority'} <= set(values):
        frappe.throw(_('Review quantities and priority are required.'))
    handler = {'review': commands.review, 'send_to_ceo': commands.send_to_ceo,
        'cancel': commands.cancel_request, 'amend': commands.amend,
        'correct_approved': correct_approved, 'revise': commands.revise}[operation]
    result = handler(name=name, command_id=command_id, expected_version=expected_version, **values)
    # Native receipts can contain full documents. Never expose those private
    # snapshots through this adapter, including on an exact retry after success.
    return dict(name=result['name'], operation=operation)
