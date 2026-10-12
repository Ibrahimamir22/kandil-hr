"""Lazy, date-aware reporting navigation using native permission-filtered lists.

Roots are boundaries of the selected visible subset, not claims about the whole
company. Candidate cursors advance even when a page contains no visible nodes.
"""
import frappe
from frappe import _

from kandil_hr.portal.api import authenticated
from kandil_hr.portal.organization import (
    POSITION_FIELDS, bounded_text, day, effective_filters, paging, parents, position_record,
)

BATCH = 100
SCAN_LIMIT = 500


def selection(company=None, department=None, branch=None, status='', search=''):
    filters = {}
    for key, value in [('company', company), ('department', department), ('branch', branch)]:
        if value:
            filters[key] = bounded_text(value)
    if status:
        if status not in ('Active', 'Closed'):
            frappe.throw(_('Unknown position status.'))
        filters['status'] = status
    term = bounded_text(search)
    terms = [[key, 'like', '%' + term + '%'] for key in ('title', 'title_ar', 'position_code', 'name')] if term else None
    return filters, terms


def selected(filters, terms, names=None, start=0, limit=BATCH + 1):
    query = dict(filters)
    if names is not None:
        if not names:
            return []
        query['name'] = ['in', names]
    return frappe.get_list('Kandil Position', filters=query, or_filters=terms,
                           fields=POSITION_FIELDS, order_by='position_code asc, name asc',
                           start=start, page_length=limit)


@frappe.whitelist(methods=['GET'])
def nodes(parent='', focus='', company=None, department=None, branch=None, status='', search='',
          as_of=None, start=0, page_length=20):
    authenticated()
    at = day(as_of)
    start, limit = paging(start, page_length)
    parent, focus = bounded_text(parent), bounded_text(focus)
    if parent and focus:
        frappe.throw(_('Choose a parent or a focus position, not both.'))
    filters, terms = selection(company, department, branch, status, search)
    # Validate guessed anchors even for a role without hierarchy read access.
    anchor = position_record(parent or focus) if parent or focus else None
    available = bool(frappe.has_permission('Kandil Position Hierarchy', 'read'))
    result = dict(rows=[], start=start, next_start=start, has_more=False, available=available,
                  as_of=at, attributes_basis='current_records', count_scope='visible_nodes_on_candidate_page')
    if not available:
        return result
    if focus:
        # Explicit focus ignores directory filters. The UI labels this mode.
        result['rows'] = [dict(anchor, reporting=parents([focus], at)[focus], boundary='focus')]
        return result

    cursor, scanned, output = start, 0, []
    while scanned < SCAN_LIMIT:
        if parent:
            valid, dates = effective_filters(at)
            candidates = frappe.get_list('Kandil Position Hierarchy',
                filters=[['parent_position', '=', parent], *valid], or_filters=dates,
                fields=['position'], group_by='position', order_by='position asc',
                start=cursor, page_length=BATCH + 1)
            names = [r.position for r in candidates[:BATCH]]
            visible = {r.name: r for r in selected(filters, terms, names, limit=BATCH)}
            rows = [visible.get(name) for name in names]
        else:
            candidates = selected(filters, terms, start=cursor)
            rows = candidates[:BATCH]
        links = parents([r.name for r in rows if r], at)
        parent_ids = sorted({v['parent'].name for v in links.values() if v.get('parent')})
        matching_parents = {r.name for r in selected(filters, terms, parent_ids, limit=BATCH)} if not parent else set()
        for index, row in enumerate(rows):
            cursor += 1
            scanned += 1
            if row:
                reporting = links[row.name]
                visible_parent = reporting.get('parent')
                boundary = ('ambiguous' if reporting.get('ambiguous') else 'restricted' if reporting.get('restricted')
                            else 'no_parent' if not visible_parent else 'outside_filter' if visible_parent.name not in matching_parents
                            else '')
                include = (not reporting.get('ambiguous') and visible_parent and visible_parent.name == parent) if parent else bool(boundary)
                if include:
                    output.append(dict(row, reporting=reporting, boundary='' if parent else boundary))
            if len(output) == limit:
                result.update(rows=output, next_start=cursor, has_more=index + 1 < len(candidates))
                return result
        if len(candidates) <= BATCH:
            result.update(rows=output, next_start=cursor)
            return result
    result.update(rows=output, next_start=cursor, has_more=True)
    return result
