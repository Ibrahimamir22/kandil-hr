"""Private, rebuildable position lookup for immutable command envelopes.

This index authorizes nothing. Portal reads re-check source identity, association,
current native permissions and historical scopes. No commits or external jobs.
"""
import hashlib
import json
from contextlib import contextmanager

import frappe
from frappe.model.document import Document

DT = 'Kandil Position Audit Link'
PATCH = 'kandil_hr.foundation.position_history_index'
FLAG = 'kandil_position_audit_index'
KINDS = {'Kandil Position', 'Kandil Capacity', 'Kandil Position Hierarchy', 'Kandil Position Assignment'}


def positions(value):
    """Extract frozen associations, never resolve them from today's database."""
    found = set()
    doctype = value.get('target_doctype')
    for side in ('before', 'after'):
        row = value.get(side) or {}
        if doctype == 'Kandil JD Revision':
            found.add(row.get('position'))
        elif doctype == 'Kandil Structure Change':
            for operation in json.loads(row.get('changes_json') or '[]'):
                found.update(operation.get(k) for k in ('position', 'target_position'))
            found.update(json.loads(row.get('created_positions_json') or '{}').values())
        elif doctype == 'Kandil Organization Import':
            for item in json.loads(row.get('preview_json') or '[]'):
                if row.get('import_kind') in ('Hierarchy', 'Assignments'):
                    found.add(item.get('data', {}).get('position'))
                elif row.get('import_kind') in (None, '', 'Positions'):
                    found.add(item.get('code'))
    old = {(r['doctype'], r['name']): r for r in value.get('related_before', []) if r.get('doctype') in KINDS}
    new = {(r['doctype'], r['name']): r for r in value.get('related_after', []) if r.get('doctype') in KINDS}
    for key in old.keys() | new.keys():
        a, b = old.get(key), new.get(key)
        # Original outcomes explicitly capture only the destination Position;
        # retain no-show/outcome records even if its capacity did not change.
        captured_outcome = value.get('operation') == 'record_outcome' and key[0] == 'Kandil Position'
        if a != b or captured_outcome:
            for row in (a, b):
                if row:
                    found.add(row.get('name') if key[0] == 'Kandil Position' else row.get('position'))
    return sorted(p for p in found if isinstance(p, str) and p)


@contextmanager
def insertion():
    old = frappe.flags.get(FLAG)
    frappe.flags[FLAG] = True
    try: yield
    finally: frappe.flags[FLAG] = old


class KandilPositionAuditLink(Document):
    def validate(self):
        if not frappe.flags.get(FLAG) or not self.is_new():
            frappe.throw('Position audit links are server-generated and immutable.', frappe.PermissionError)

    def on_trash(self):
        frappe.throw('Position audit links cannot be deleted through document actions.', frappe.PermissionError)

    def before_rename(self, *args, **kwargs):
        frappe.throw('Position audit links cannot be renamed.', frappe.PermissionError)


def index_event(audit):
    # Other local sites share source but must explicitly migrate their own schema.
    # Missing optional lookup schema must not break their existing HR commands.
    if not frappe.db.table_exists(DT): return 0
    value = json.loads(audit.envelope_json)
    if any(value.get(k) != audit.get(k) for k in ('company', 'target_doctype', 'target_name', 'domain', 'operation')):
        raise ValueError('Audit/index source identity mismatch')
    inserted = 0
    for position in positions(value):
        name = hashlib.sha256((audit.name + '\0' + position).encode()).hexdigest()
        expected = dict(audit=audit.name, position=position, company=audit.company,
                        source_hash=audit.content_hash, occurred_at=audit.occurred_at)
        existing = frappe.db.get_value(DT, name, list(expected), as_dict=True)
        if existing:
            if any(str(existing.get(k)) != str(v) for k, v in expected.items()):
                raise ValueError('Existing position audit index differs from its source')
            continue
        with insertion():
            frappe.get_doc(dict(doctype=DT, name=name, **expected)).insert(ignore_permissions=True)
        inserted += 1
    return inserted


def execute():
    """Post-model-sync patch; idempotent keyset backfill without editing audits."""
    frappe.db.add_index(DT, ['company', 'position', 'occurred_at', 'audit'], 'position_history_lookup')
    cursor, events, links = '', 0, 0
    while True:
        rows = frappe.get_all('Kandil Command Audit', filters={'name': ['>', cursor]},
                              fields=['name'], order_by='name asc', page_length=100)
        if not rows: break
        for row in rows:
            links += index_event(frappe.get_doc('Kandil Command Audit', row.name))
            events += 1
        cursor = rows[-1].name
    return dict(events_scanned=events, links_created=links, source_audits_unchanged=True)
