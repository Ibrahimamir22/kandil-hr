"""Current permission-checked navigation between requests and amendments."""
import frappe

from kandil_hr.portal.api import read_request
from kandil_hr.portal.organization import paging
from kandil_hr.portal.request_history import target

DT = 'Kandil Hiring Request'
FIELDS = ('name', 'title', 'status', 'revision')


def card(doc):
    return {key: doc.get(key) for key in FIELDS}


@frappe.whitelist(methods=['GET'])
def related(name, start=0, page_length=20):
    doc = target(name)
    start, limit = paging(start, page_length)
    parent, restricted = None, False
    if doc.amends:
        try:
            original = read_request(doc.amends)
            if original.company != doc.company:
                raise frappe.PermissionError
            parent = card(original)
        except (frappe.PermissionError, frappe.DoesNotExistError):
            frappe.clear_messages()
            restricted = True
    rows = frappe.get_list(DT, filters={'amends': doc.name, 'company': doc.company},
                           fields=['name'], order_by='creation desc,name desc',
                           start=start, page_length=limit + 1)
    children = [card(read_request(r.name)) for r in rows[:limit]]
    return dict(parent=parent, parent_restricted=restricted, amendments=children,
                start=start, next_start=start+limit, has_more=len(rows)>limit,
                basis='current_permitted_relationships')
