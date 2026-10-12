"""Advisory draft evaluation: no inserts, saves, ledger refresh or notices.

POST keeps editable HR text out of URLs and requires the normal session/CSRF.
Company/current-row locks match routing reads; all changes to the proposal and
route snapshot are in memory. Submission independently validates and freezes.
"""
import copy
import json

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, get_fullname

from kandil_hr.foundation.clock import now_cairo, today_cairo
from kandil_hr.foundation.mutation_access import assert_current_request_scope
from kandil_hr.organization.models import lock_company
from kandil_hr.organization.occupancy import values
from kandil_hr.pilot.models import integer
from kandil_hr.portal.api import WRITE_ROLES, authenticated, editable_payload, read_request
from kandil_hr.portal.request_form import position_anchor
from kandil_hr.recruitment import api as commands
from kandil_hr.recruitment.headcount_contract import HeadcountDenied, enforce_shortage
from kandil_hr.recruitment.reference_access import can_reference_employee


def proposal(payload, name=None, expected_version=None):
    payload = copy.deepcopy(editable_payload(payload))
    if not payload.get('company') or not payload.get('department') or not (payload.get('title') or '').strip():
        frappe.throw(_('Complete the request title, company and department.'))
    lock_company(payload['company'])
    if name:
        doc = read_request(name, for_update=True)
        if doc.company != payload['company']:
            frappe.throw(_('The company of a saved request cannot change.'))
        if doc.status != 'Draft' or doc.requested_by != frappe.session.user:
            frappe.throw(_('Only the requester can preview this draft.'), frappe.PermissionError)
        doc.check_permission('write')
        if not expected_version or get_datetime(doc.modified) != get_datetime(expected_version):
            frappe.throw(_('This record changed. Reload it before editing.'), frappe.TimestampMismatchError)
    else:
        if not frappe.has_permission('Kandil Hiring Request', 'create'):
            frappe.throw(_('You cannot create a hiring request.'), frappe.PermissionError)
        doc = frappe.get_doc(dict(doctype='Kandil Hiring Request', owner=frappe.session.user,
            requested_by=frappe.session.user, status='Draft', revision=1))
    previous_replacement = doc.get('replacement_employee')
    doc.update({key: value for key, value in payload.items() if key != 'lines'})
    doc.set('lines', [])
    seen = set()
    for row in payload['lines']:
        quantity = integer(row.get('requested_qty'))
        if quantity < 1 or row['capacity'] in seen:
            frappe.throw(_('Use positive whole quantities and one line per location.'))
        seen.add(row['capacity'])
        doc.append('lines', dict(capacity=row['capacity'], requested_qty=quantity))
    # Check current caller authority before projecting route/occupancy information.
    assert_current_request_scope(doc, required_roles=WRITE_ROLES)
    selected = position_anchor(doc.requested_position)
    if selected.company != doc.company or selected.department != doc.department:
        frappe.throw(_('The position must match the selected company and department.'))
    caps = {}
    for key in sorted(seen):
        cap = frappe.get_doc('Kandil Capacity', key, for_update=True)
        cap.check_permission('read')
        position = position_anchor(cap.position)
        if (cap.company != doc.company or cap.department != doc.department or cap.designation != selected.designation
                or any(cap.get(k) != position.get(k) for k in ('company','department','branch','designation'))):
            frappe.throw(_('Every location must match a currently active position for this job.'))
        caps[key] = cap
    if doc.requested_priority not in ('Normal','Important','Critical') or doc.need_reason not in ('Expansion','Replacement','Temporary Cover','New Position'):
        frappe.throw(_('Choose a valid priority and need reason.'))
    if doc.need_reason == 'Replacement' and not doc.replacement_employee:
        frappe.throw(_('Select the employee being replaced.'))
    if doc.replacement_employee:
        employee = frappe.get_doc('Employee', doc.replacement_employee)
        if (doc.replacement_employee != previous_replacement or not name) and not can_reference_employee(employee):
            frappe.throw(_('Replacement employee is outside your permitted recruitment scope.'), frappe.PermissionError)
        if employee.company != doc.company or employee.department != doc.department:
            frappe.throw(_('Replacement employee must be within this department.'))
    return doc, caps


@frappe.whitelist(methods=['POST'])
def evaluate(payload, name=None, expected_version=None):
    authenticated()
    doc, caps = proposal(payload, name, expected_version)
    parent = commands.parent_for(doc)
    baseline = {r.capacity: r for r in parent.lines} if parent else {}
    rows, issues = [], []
    for line in doc.lines:
        if parent and (line.capacity not in baseline or line.requested_qty < cint(baseline[line.capacity].joined_qty)):
            frappe.throw(_('Amendment locations must match the original request and retain actual joiners.'))
        cap = caps[line.capacity]
        current = values(cap)
        demand = max(0, line.requested_qty - (cint(baseline[line.capacity].approved_qty) if parent else 0))
        rows.append(dict(capacity=cap.name, branch=cap.branch, structural=cint(cap.structural),
            occupied=max(current['occupied'], current['capacity_occupied']) if current['unresolved'] else current['occupied'],
            reserved=cint(cap.reserved), open_slots=cint(cap.open_slots), available=current['available'],
            requested=line.requested_qty, incremental_demand=demand, shortage=max(0,demand-current['available']) if demand else 0,
            unresolved=current['unresolved'], occupancy_basis=current['basis'], as_of=current['as_of']))
    excess = any(r['shortage'] for r in rows)
    if any(r['unresolved'] and r['incremental_demand'] for r in rows):
        issues.append(dict(code='OCCUPANCY_UNRESOLVED', message=_('HR must reconcile the imported occupancy before adding commitments.')))
    chain, skipped, policy = [], [], None
    try:
        config = commands.route_config(doc)
        policy = dict(headcount_mode=config.headcount_mode, ceo_for_critical=bool(config.ceo_for_critical), board_after_ceo=bool(config.board_after_ceo))
        try:
            enforce_shortage(excess=excess, mode=config.headcount_mode, reason=doc.exception_reason)
        except HeadcountDenied as error:
            issues.append(dict(code=error.code, message=_(error.message)))
        resolved_chain = commands.resolve_chain(doc, excess)
        # Required principals must currently be able to act on every location.
        # This is advisory preflight; the actual decision repeats current checks.
        for principal, authority, _position in resolved_chain:
            assert_current_request_scope(doc, user=principal, required_roles=(commands.ROLES[authority],))
        snapshot = json.loads(doc.route_snapshot)
        chain = [dict(order=i+1, principal=principal, label=get_fullname(principal), authority=authority, position=position)
                 for i,(principal,authority,position) in enumerate(resolved_chain)]
        # Excluded identity and the full interest/rule configuration are not exposed.
        skipped = [dict(position=s.get('position'),authority=s.get('authority'),reason='VACANT_AUTHORITY')
                   for s in snapshot['resolved'].get('skipped', [])]
        skipped += [dict(position=s.get('position'),authority=s.get('authority'),reason='PERSONAL_INTEREST')
                    for s in snapshot.get('skipped', [])]
    except (frappe.ValidationError, frappe.PermissionError) as error:
        # Caller and reference access checks have already succeeded outside this
        # block. A disabled required principal is a route blocker, not authority
        # to proceed; disclose no partial route or private identity information.
        message = _('A required approval authority is unavailable. Ask HR to review the route.') if isinstance(error, frappe.PermissionError) else str(error)
        issues.append(dict(code='ROUTE_CONFIGURATION', message=message))
    return dict(ready=not issues, advisory=True, evaluated_at=now_cairo().isoformat(), as_of=str(today_cairo()),
                expected_version=expected_version if name else None, rows=rows, policy=policy, steps=chain,
                skipped=skipped, needs_exception=excess, issues=issues)
