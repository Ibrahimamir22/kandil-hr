"""Immutable saved request versions, projected with current permissions.

An exact command AFTER capture may supply historical locations. Matching only
revision number, time or current structure is insufficient. Missing captures
use the existing department-wide legacy rule and remain explicitly partial.
"""
import json
from datetime import datetime

import frappe
from kandil_hr.portal.history_identities import metadata as project_metadata

from kandil_hr.portal import request_history as history
from kandil_hr.portal.delegations import identifier
from kandil_hr.portal.organization import paging

DT = 'Kandil Request Revision'
META = ('name', 'revision', 'action', 'actor', 'creation')
FIELDS = (*META, 'request', 'company', 'department', 'snapshot_json')
# amend creates a different request without saving its original. Its unchanged
# parent AFTER capture cannot identify when that parent's version was saved.
SNAPSHOT_OPERATIONS = tuple(op for op in history.OPERATIONS if op != 'amend')


def parse(value):
    try:
        result = json.loads(value)
    except (TypeError, ValueError):
        history.deny()
    if not isinstance(result, dict):
        history.deny()
    return result


def comparable(snapshot):
    """Normalize only declared datetime fields across the two old serializers.

    Revisions use datetime.__str__ (space); command audits use isoformat (T).
    Every other field, including free text and raw route JSON, stays exact.
    """
    value = dict(snapshot)
    def stamp(row, key):
        if row.get(key):
            try: row[key] = datetime.fromisoformat(row[key]).isoformat()
            except (TypeError, ValueError): history.deny()
    for key in ('creation', 'modified'): stamp(value, key)
    if isinstance(value.get('approval_steps'), list):
        steps = []
        for original in value['approval_steps']:
            if not isinstance(original, dict): history.deny()
            row = dict(original)
            for key in ('waiting_since', 'decided_at'): stamp(row, key)
            steps.append(row)
        value['approval_steps'] = steps
    return value


def captured_locations(snapshot, doc):
    if not snapshot.get('modified'):
        return [], None
    # The indexed target/company restriction bounds the search to one request.
    # At most two matching AFTER timestamps are loaded; ambiguity fails closed.
    normalized = comparable(snapshot)
    rows = frappe.db.sql('''
        SELECT name, operation, envelope_json FROM `tabKandil Command Audit`
        WHERE company=%s AND domain='recruitment' AND target_doctype=%s
          AND target_name=%s AND operation IN %(operations)s
          AND (operation<>'revise_pending_quantities' OR
               COALESCE(JSON_UNQUOTE(JSON_EXTRACT(envelope_json, '$.result.pending_revision_unchanged')), '')<>'true')
          AND REPLACE(JSON_UNQUOTE(JSON_EXTRACT(envelope_json, '$.after.modified')), ' ', 'T')=%s
        ORDER BY occurred_at DESC, name DESC LIMIT 2
    '''.replace('%(operations)s', '(' + ','.join(['%s'] * len(SNAPSHOT_OPERATIONS)) + ')'),
        (doc.company, history.DT, doc.name, *SNAPSHOT_OPERATIONS, normalized['modified']), as_dict=True)
    matches = []
    for row in rows:
        value = parse(row.envelope_json)
        if (value.get('domain'), value.get('company'), value.get('target_doctype'), value.get('target_name'), value.get('operation')) != ('recruitment', doc.company, history.DT, doc.name, row.operation):
            history.deny()
        if isinstance(value.get('after'), dict) and json.dumps(comparable(value['after']), sort_keys=True) == json.dumps(normalized, sort_keys=True):
            related = value.get('related_after', [])
            if not isinstance(related, list):
                history.deny()
            matches.append((related, row.name))
    if len(rows) == 2:
        # No timestamp-based choice between potentially different captures.
        history.deny()
    return matches[0] if matches else ([], None)


def projected(row, doc):
    snapshot = parse(row.snapshot_json)
    if (row.request, row.company, snapshot.get('department'), snapshot.get('revision')) != (
            doc.name, doc.company, row.department, row.revision):
        history.deny()
    related, event_id = captured_locations(snapshot, doc)
    value = history.project(snapshot, related, doc)
    return dict(revision=project_metadata({key: row.get(key) for key in META},('actor',)), snapshot=value,
                location_source='exact_command_capture' if event_id else 'legacy_uncaptured',
                basis='immutable_saved_revision')


def selected(doc, revision_id):
    row = frappe.db.get_value(DT, {'name': identifier(revision_id), 'request': doc.name,
                                  'company': doc.company}, FIELDS, as_dict=True)
    if not row:
        history.deny()
    return projected(row, doc)


@frappe.whitelist(methods=['GET'])
def revisions(name, start=0, page_length=20):
    doc = history.target(name)
    start, limit = paging(start, page_length)
    rows = frappe.get_all(DT, filters={'request': doc.name, 'company': doc.company},
                          fields=FIELDS, order_by='creation desc, name desc', start=start, page_length=limit + 1)
    visible = []
    for row in rows[:limit]:
        try:
            value = projected(row, doc)
            visible.append(value['revision'] | {'status': value['snapshot'].get('status'),
                                               'location_capture': value['snapshot']['location_capture']})
        except frappe.PermissionError:
            frappe.clear_messages()
    return dict(rows=visible, start=start, next_start=start + limit, has_more=len(rows) > limit,
                count_scope='visible_revisions_on_candidate_page', basis='immutable_saved_revisions')


@frappe.whitelist(methods=['GET'])
def revision(name, revision_id):
    return selected(history.target(name), revision_id)


@frappe.whitelist(methods=['GET'])
def compare(name, revision_id, event_id):
    left = selected(history.target(name), revision_id)
    right = history.event(name, event_id)
    if not right['reviewed_before_decision']:
        history.deny()
    before, after = left['snapshot'], right['before']
    step = next((s for s in right['after']['approval_steps'] if s.get('step_key') == right['reviewed_step']), None)
    if not step: history.deny()
    return dict(revision=left['revision'], event=right['event'], before=before, after=after,
                changed_fields=[key for key in after if before.get(key) != after.get(key)],
                reviewed_step=right['reviewed_step'], same_revision=before.get('revision') == after.get('revision'),
                outcome=right['after']['status'], decision=step['decision'],
                basis='saved_revision_versus_recorded_pre_decision')
