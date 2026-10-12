"""Position timeline projected from authorized, immutable source commands."""
import json

import frappe
from frappe import _

from kandil_hr.foundation import position_history_index as index
from kandil_hr.portal import history, imports, job_descriptions, structure
from kandil_hr.portal.api import authenticated, read_request
from kandil_hr.portal.organization import bounded_text, paging, position_record


def anchor(name):
    authenticated()
    position = position_record(name)
    if not frappe.db.table_exists(index.DT) or not frappe.db.exists('Patch Log', {'patch': index.PATCH, 'skipped': 0}):
        frappe.throw(_('Position history needs its database migration before use.'))
    return frappe.get_doc('Kandil Position', position.name)


def source(row, position):
    readers = {'Kandil Structure Change': structure.read, 'Kandil Organization Import': imports.read,
               'Kandil JD Revision': job_descriptions.read, 'Kandil Hiring Request': read_request}
    reader = readers.get(row.target_doctype)
    if not reader: history.deny()
    try: doc = reader(row.target_name)
    except frappe.DoesNotExistError: history.deny()
    if doc.company != position.company: history.deny()
    value = history.envelope(row, doc)
    if position.name not in index.positions(value): history.deny()
    return value


def linked(position, event_id):
    # Private lookup only after anchor authorization; verify its frozen source.
    link = frappe.db.get_value(index.DT, {'company': position.company, 'position': position.name,
                                        'audit': bounded_text(event_id)}, ['audit', 'source_hash'], as_dict=True)
    if not link: history.deny()
    row = frappe.db.get_value(history.AUDIT, {'name': link.audit, 'company': position.company},
        [*history.META, 'company', 'domain', 'target_doctype', 'target_name', 'content_hash', 'envelope_json'], as_dict=True)
    if not row or row.content_hash != link.source_hash: history.deny()
    return row, source(row, position)


def metadata(row):
    return {k: row.get(k) for k in (*history.META, 'target_doctype', 'target_name')}


def projection(value, position, start, limit):
    old = {(r['doctype'], r['name']): r for r in value.get('related_before', []) if r.get('doctype') in history.RELATED}
    new = {(r['doctype'], r['name']): r for r in value.get('related_after', []) if r.get('doctype') in history.RELATED}
    candidates = []
    for identity in sorted(old.keys() | new.keys()):
        a, b = old.get(identity), new.get(identity)
        association = lambda r: r.get('name') if identity[0] == 'Kandil Position' else r.get('position')
        if not any(r and association(r) == position.name for r in (a, b)): continue
        # Never project the other end of a relocation under this position.
        if not all(not r or association(r) == position.name for r in (a, b)): continue
        if not all(history.visible(r, position) for r in (a, b)): continue
        fields = history.RELATED[identity[0]]
        left, right = ({k: r.get(k) for k in fields} if r else None for r in (a, b))
        if left != right: candidates.append((identity, left, right))
    output = []
    for (dt, name), before, after in candidates[start:start+limit]:
        if not frappe.db.exists(dt, name) or not frappe.get_doc(dt, name).has_permission('read'): continue
        for side in (before, after):
            if side:
                for k in side: side[k] = history.redact_reference(k, side[k])
        output.append(dict(doctype=dt, name=name, position=position.name, before_captured=before is not None,
                           after_captured=after is not None, changes=history.differences(before, after)))
    return dict(rows=output, start=start, next_start=start+limit, has_more=len(candidates)>start+limit,
                basis='audit_capture_presence_not_record_creation_or_deletion')


def events(name, start=0, page_length=20):
    position = anchor(name); start, limit = paging(start, page_length)
    links = frappe.get_all(index.DT, filters={'company': position.company, 'position': position.name},
                           fields=['audit'], order_by='occurred_at desc, audit desc', start=start, page_length=limit+1)
    rows = []
    for link in links[:limit]:
        try: row, value = linked(position, link.audit)
        except frappe.PermissionError: continue
        rows.append(metadata(row))
    return dict(rows=rows, start=start, next_start=start+limit, has_more=len(links)>limit,
                basis='recorded_position_commands', count_scope='visible_rows_on_event_page')


def event(name, event_id, related_start=0, page_length=20):
    position = anchor(name); start, limit = paging(related_start, page_length)
    row, value = linked(position, event_id)
    if row.target_doctype == 'Kandil JD Revision':
        before, after = (history.snapshot(value.get(side), 'jd') for side in ('before','after'))
    else:
        fields = ('status', 'effective_on') if row.target_doctype == 'Kandil Structure Change' else (
            ('status','import_kind','reviewed_by') if row.target_doctype == 'Kandil Organization Import' else ('status',))
        before, after = ({k: (value.get(side) or {}).get(k) for k in fields} for side in ('before','after'))
    return dict(event=metadata(row), changes=history.differences(before, after), before_captured=bool(value.get('before')) and value['before'].get('record_exists') is not False,
                after_captured=bool(value.get('after')), related=projection(value, position, start, limit),
                basis='recorded_position_commands')
