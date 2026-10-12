"""Scoped, explicit history projections. The private audit store is never exposed."""
import json

import frappe
from frappe import _

from kandil_hr.foundation.security import has_scope
from kandil_hr.portal import job_descriptions as jd, structure
from kandil_hr.portal.api import authenticated
from kandil_hr.portal.organization import bounded_text, paging, page

AUDIT = 'Kandil Command Audit'
META = ['name', 'operation', 'actor', 'principal', 'occurred_at_iso']
STEP = ('authority', 'principal', 'decision', 'actor', 'decided_at', 'comment')
RELATED = {
    'Kandil Position': ('title', 'title_ar', 'structural', 'status', 'closed_on', 'department', 'branch'),
    'Kandil Capacity': ('structural', 'occupied', 'reserved', 'open_slots', 'available'),
    'Kandil Position Hierarchy': ('parent_position', 'authority', 'valid_from', 'valid_until'),
    'Kandil Position Assignment': ('employee', 'allocation', 'valid_from', 'valid_until', 'is_voided'),
}


def deny():
    frappe.throw(_('This history is unavailable for your role or scope.'), frappe.PermissionError)


def target(kind, name):
    authenticated()
    if kind == 'jd': return jd.read(name)
    if kind == 'structure': return structure.read(name)
    frappe.throw(_('Choose job description or structure history.'))


def visible(snapshot, doc):
    if not snapshot or snapshot.get('record_exists') is False: return True
    return (snapshot.get('company') == doc.company
            and has_scope(frappe.session.user, doc.company, snapshot.get('department'), snapshot.get('branch')))


def envelope(row, doc):
    value = json.loads(row.envelope_json)
    if (value.get('target_doctype') != doc.doctype or value.get('target_name') != doc.name
            or value.get('company') != doc.company): deny()
    if not all(visible(value.get(side), doc) for side in ('before', 'after')): deny()
    return value


def employee_visible(name):
    return not name or (frappe.db.exists('Employee', name)
                        and frappe.get_doc('Employee', name).has_permission('read'))


def redact_reference(key, value):
    if key == 'assignment' and value:
        if not frappe.db.exists('Kandil Position Assignment', value): return None
        if not frappe.get_doc('Kandil Position Assignment', value).has_permission('read'): return None
    if key == 'employee' and value and not employee_visible(value):
        return None
    if key in ('parent_position', 'target_position', 'position') and value:
        if not frappe.db.exists('Kandil Position', value): return None
        if not frappe.get_doc('Kandil Position', value).has_permission('read'): return None
    return value


def snapshot(value, kind):
    if not value or value.get('record_exists') is False: return None
    if kind == 'jd':
        result = {k: value.get(k) for k in (*jd.TEXT, 'job_level', 'valid_from', 'status', 'revision',
                  'supersedes', 'position', 'designation', 'approved_by', 'approved_at')}
        for table, fields in jd.TABLES.items():
            result[table] = [{k: row.get(k) for k in fields} for row in value.get(table, [])]
        # A predecessor or anchor outside current native scope must not leak an ID.
        result['position'] = redact_reference('position', result['position'])
        prior = result.get('supersedes')
        if prior:
            try: jd.read(prior)
            except frappe.PermissionError: result['supersedes'] = None
        return result
    result = {k: value.get(k) for k in ('status', 'effective_on', 'reason', 'approved_by', 'approved_at')}
    operations = json.loads(value.get('changes_json') or '[]')
    result['operations'] = [{k: redact_reference(k, v) for k, v in op.items()
                            if k in structure.OP_FIELDS.get(op.get('action'), set())} for op in operations]
    result['approval_steps'] = [{k: row.get(k) for k in STEP} for row in value.get('approval_steps', [])]
    return result


def differences(before, after):
    left, right = before or {}, after or {}
    return [dict(field=k, before=left.get(k), after=right.get(k)) for k in dict.fromkeys([*left, *right])
            if left.get(k) != right.get(k)]


@frappe.whitelist(methods=['GET'])
def events(kind, name, start=0, page_length=20):
    if kind == 'position':
        from kandil_hr.portal import position_history
        return position_history.events(name, start, page_length)
    doc = target(kind, name); start, limit = paging(start, page_length)
    # Deliberate private-store read after target authorization, limited to one target.
    rows = frappe.get_all(AUDIT, filters=dict(domain='organization', company=doc.company,
        target_doctype=doc.doctype, target_name=doc.name), fields=[*META, 'envelope_json'],
        order_by='occurred_at desc, name desc', start=start, page_length=limit+1)
    result = []
    for row in rows[:limit]:
        try: envelope(row, doc)
        except frappe.PermissionError: continue
        result.append({k: row.get(k) for k in META})
    return dict(rows=result, start=start, next_start=start+limit, has_more=len(rows)>limit,
                basis='recorded_commands', count_scope='visible_rows_on_event_page')


def related_changes(value, doc, start, limit):
    # Audit envelopes may include a whole-company baseline. Only operation targets
    # are candidates here, never unrelated employees, positions, grades or imports.
    operations = json.loads((value.get('after') or {}).get('changes_json') or '[]')
    positions = {op.get(k) for op in operations for k in ('position', 'target_position')} - {None, ''}
    positions.update(json.loads((value.get('after') or {}).get('created_positions_json') or '{}').values())
    old = {(r['doctype'], r['name']): r for r in value.get('related_before', []) if r.get('doctype') in RELATED}
    new = {(r['doctype'], r['name']): r for r in value.get('related_after', []) if r.get('doctype') in RELATED}
    candidates = []
    for identity in sorted(old.keys() | new.keys()):
        a, b = old.get(identity), new.get(identity); row = b or a
        position = row.get('name') if identity[0] == 'Kandil Position' else row.get('position')
        if position not in positions: continue
        if not all(visible(x, doc) for x in (a, b)): continue
        fields = RELATED[identity[0]]
        left = {k: a.get(k) for k in fields} if a else None
        right = {k: b.get(k) for k in fields} if b else None
        if left != right: candidates.append((identity, left, right, position))
    result = []
    for (dt, name), before, after, position in candidates[start:start+limit]:
        if not frappe.db.exists(dt, name) or not frappe.get_doc(dt, name).has_permission('read'): continue
        if redact_reference('position', position) is None: continue
        for side in (before, after):
            if side:
                for key in side: side[key] = redact_reference(key, side[key])
        result.append(dict(doctype=dt, name=name, position=position, before_captured=before is not None,
            after_captured=after is not None, changes=differences(before, after)))
    return dict(rows=result, start=start, next_start=start+limit, has_more=len(candidates)>start+limit,
                basis='audit_capture_presence_not_record_creation_or_deletion')


@frappe.whitelist(methods=['GET'])
def event(kind, name, event_id, related_start=0, page_length=20):
    if kind == 'position':
        from kandil_hr.portal import position_history
        return position_history.event(name, event_id, related_start, page_length)
    doc = target(kind, name); start, limit = paging(related_start, page_length)
    row = frappe.db.get_value(AUDIT, dict(name=bounded_text(event_id), domain='organization',
        company=doc.company, target_doctype=doc.doctype, target_name=doc.name), [*META, 'envelope_json'], as_dict=True)
    if not row: deny()
    value = envelope(row, doc)
    before, after = (snapshot(value.get(side), kind) for side in ('before', 'after'))
    return dict(event={k: row.get(k) for k in META}, changes=differences(before, after),
        before_captured=before is not None, after_captured=after is not None,
        related=related_changes(value, doc, start, limit) if kind == 'structure' else page([], 0, limit),
        basis='recorded_command_snapshots')


@frappe.whitelist(methods=['GET'])
def revisions(name, start=0, page_length=20):
    doc = target('jd', name); start, limit = paging(start, page_length)
    return page(frappe.get_list(jd.DT, filters=dict(company=doc.company, designation=doc.designation),
        fields=['name', 'revision', 'status', 'valid_from', 'approved_by', 'approved_at'],
        order_by='revision desc, creation desc, name', start=start, page_length=limit+1), start, limit)


@frappe.whitelist(methods=['GET'])
def compare(name, other):
    doc = target('jd', name); previous = jd.read(other)
    if doc.company != previous.company or doc.designation != previous.designation: deny()
    # Drafts can change: versions are returned so the comparison's basis is explicit.
    return dict(before=dict(name=previous.name, modified=str(previous.modified), status=previous.status),
        after=dict(name=doc.name, modified=str(doc.modified), status=doc.status),
        changes=differences(snapshot(previous.as_dict(), 'jd'), snapshot(doc.as_dict(), 'jd')),
        basis='selected_revision_records')
