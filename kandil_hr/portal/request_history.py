"""Permission-checked request command history; private envelopes never leave here.

Modern captures preserve exact before/after request content. Missing old location
context is marked explicitly and requires a department-wide current grant; it is
never inferred from mutable current organization records.
"""
import json

import frappe
from frappe import _

from kandil_hr.foundation.security import has_scope
from kandil_hr.portal.api import REQUEST_FIELDS, authenticated, read_request
from kandil_hr.portal.delegations import identifier
from kandil_hr.portal.organization import paging
from kandil_hr.recruitment.reference_access import visible_employee

DT = 'Kandil Hiring Request'
AUDIT = 'Kandil Command Audit'
OPERATIONS = ('submit', 'decide', 'review', 'send_to_ceo', 'revise',
              'revise_pending_quantities', 'cancel', 'hr_correction', 'amend')
META = ('name', 'operation', 'actor', 'principal', 'occurred_at_iso')
LINE_FIELDS = ('name', 'capacity', 'requested_qty', 'proposed_qty', 'approved_qty',
               'reserved_qty', 'joined_qty', 'closed_qty')
STEP_FIELDS = ('step_key', 'authority', 'principal', 'actor', 'decision', 'comment',
               'decided_at', 'board_member', 'on_behalf_method', 'on_behalf_note')
POLICY_FIELDS = ('headcount_mode', 'ceo_for_critical', 'board_after_ceo', 'hr_approver',
                 'exception_approver', 'ceo_approver', 'board_approver', 'board_vice_approver',
                 'config_modified', 'evaluated_on')


def deny():
    frappe.throw(_('This request history is unavailable for your role or scope.'), frappe.PermissionError)


def target(name):
    authenticated()
    return read_request(identifier(name))


def filters(doc):
    return dict(domain='recruitment', company=doc.company, target_doctype=DT,
                target_name=doc.name, operation=['in', OPERATIONS])


def native_reference(kind, name):
    if not name or not frappe.db.exists(kind, name): deny()
    if not frappe.get_doc(kind, name).has_permission('read'): deny()


def historical_location(kind, name, snapshot, related, missing):
    native_reference(kind, name)
    matches = [r for r in related if r.get('doctype') == kind and r.get('name') == name]
    if len(matches) > 1: deny()
    row = matches[0] if matches else None
    if row:
        if (row.get('company') != snapshot['company']
                or row.get('department') != snapshot['department']): deny()
        if not has_scope(frappe.session.user, row['company'], row['department'], row.get('branch')): deny()
        return row.get('branch')
    # An all-department grant covers any historical branch; a single-branch
    # reader cannot establish old scope from the current Capacity/Position.
    if not has_scope(frappe.session.user, snapshot['company'], snapshot['department'], None): deny()
    missing.append(kind)
    return None


def project(snapshot, related, doc):
    if not isinstance(snapshot, dict) or (snapshot.get('doctype'), snapshot.get('name'), snapshot.get('company')) != (DT, doc.name, doc.company): deny()
    if not snapshot.get('department') or not isinstance(snapshot.get('lines'), list): deny()
    if not isinstance(related, list) or any(not isinstance(r, dict) for r in related): deny()
    if any(not isinstance(r, dict) for r in snapshot['lines']): deny()
    if not isinstance(snapshot.get('approval_steps', []), list) or any(not isinstance(r, dict) for r in snapshot.get('approval_steps', [])): deny()
    missing = []
    branch = historical_location('Kandil Position', snapshot.get('requested_position'), snapshot, related, missing)
    result = {key: snapshot.get(key) for key in REQUEST_FIELDS}
    result['position_branch'] = branch
    replacement = result.get('replacement_employee')
    result['replacement_restricted'] = bool(replacement and not visible_employee(replacement))
    if result['replacement_restricted']: result['replacement_employee'] = None
    if result.get('amends'):
        try: read_request(result['amends'])
        except (frappe.PermissionError, frappe.DoesNotExistError):
            frappe.clear_messages(); result['amends'] = None; result['amends_restricted'] = True
    result['lines'] = []
    for line in snapshot['lines']:
        branch = historical_location('Kandil Capacity', line.get('capacity'), snapshot, related, missing)
        result['lines'].append({key: line.get(key) for key in LINE_FIELDS} | {'branch': branch})
    result['approval_steps'] = []
    for step in snapshot.get('approval_steps', []):
        row = {key: step.get(key) for key in STEP_FIELDS}
        # Historical proof is still subject to current exact-target File access.
        row['proof'] = None; row['proof_restricted'] = False
        if step.get('board_evidence'):
            from kandil_hr.portal.board import file_record
            try: row['proof'] = file_record(doc, step['board_evidence'])
            except (frappe.PermissionError, frappe.DoesNotExistError):
                frappe.clear_messages(); row['proof_restricted'] = True
        result['approval_steps'].append(row)
    try: route = json.loads(snapshot.get('route_snapshot') or '{}')
    except (TypeError, ValueError): deny()
    if not isinstance(route, dict) or (route.get('policy') is not None and not isinstance(route['policy'], dict)): deny()
    # Frozen policy only, never today's policy or arbitrary configuration JSON.
    result['policy'] = {key: (route.get('policy') or {}).get(key) for key in POLICY_FIELDS} if route.get('policy') else None
    from kandil_hr.portal.history_rationale import rationale
    result['rationale'] = rationale(route)
    result['location_capture'] = 'partial' if missing else 'complete'
    return result


def envelope(row, doc):
    value = json.loads(row.envelope_json)
    if (value.get('target_doctype'), value.get('target_name'), value.get('company'), value.get('domain')) != (DT, doc.name, doc.company, 'recruitment'): deny()
    if value.get('operation') != row.operation or row.operation not in OPERATIONS: deny()
    before = project(value.get('before'), value.get('related_before', []), doc)
    after = project(value.get('after'), value.get('related_after', []), doc)
    return value, before, after


def metadata(row, after):
    return {key: row.get(key) for key in META} | {'revision': after.get('revision'), 'status': after.get('status')}


@frappe.whitelist(methods=['GET'])
def events(name, start=0, page_length=20):
    doc = target(name); start, limit = paging(start, page_length)
    rows = frappe.get_all(AUDIT, filters=filters(doc), fields=[*META, 'envelope_json'],
        order_by='occurred_at desc, name desc', start=start, page_length=limit+1)
    visible = []
    for row in rows[:limit]:
        try:
            _, _, after = envelope(row, doc)
            visible.append(metadata(row, after))
        except frappe.PermissionError: frappe.clear_messages()
    return dict(rows=visible, start=start, next_start=start+limit, has_more=len(rows)>limit,
                count_scope='visible_events_on_candidate_page', basis='recorded_commands')


@frappe.whitelist(methods=['GET'])
def event(name, event_id):
    doc = target(name)
    row = frappe.db.get_value(AUDIT, filters(doc) | {'name': identifier(event_id)}, [*META, 'envelope_json'], as_dict=True)
    if not row: deny()
    value, before, after = envelope(row, doc)
    # Deliberately omit payload, receipts, raw related effects and private audit IDs.
    return dict(event=metadata(row, after), before=before, after=after,
                changed_fields=[key for key in after if before.get(key) != after.get(key)],
                reviewed_before_decision=row.operation == 'decide',
                reviewed_step=value.get('step_key') if row.operation == 'decide' else None,
                basis='immutable_command_before_after')
