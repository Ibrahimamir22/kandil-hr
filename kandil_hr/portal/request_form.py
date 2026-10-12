"""Bounded hiring selectors; native permissions plus current management scope."""
import frappe
from frappe import _

from kandil_hr.foundation.security import has_scope, scope_query
from kandil_hr.recruitment.reference_access import can_reference_employee
from kandil_hr.portal.api import authenticated
from kandil_hr.portal.organization import bounded_text, paging


def manageable(row):
    return has_scope(frappe.session.user, row.company, row.department, row.get('branch'), 'manage')


def position_anchor(name):
    rows = frappe.get_list('Kandil Position', filters={'name': bounded_text(name), 'status': 'Active'},
        fields=['name','company','department','branch','designation'], page_length=1)
    if not rows or not manageable(rows[0]):
        frappe.throw(_('Choose a position within your current recruitment scope.'), frappe.PermissionError)
    return rows[0]


@frappe.whitelist(methods=['GET'])
def references(kind, position=None, search='', start=0, page_length=20, name=None):
    authenticated()
    if kind not in ('position', 'capacity', 'replacement'):
        frappe.throw(_('Unknown hiring reference type.'))
    start, limit = paging(start, page_length)
    term = bounded_text(search)
    anchor = position_anchor(position) if kind != 'position' else None
    if kind == 'position':
        dt = 'Kandil Position'; filters = {'status': 'Active'}
        fields = ['name','title','title_ar','company','department','branch','designation']
        searched = ['name','title','title_ar']
    elif kind == 'capacity':
        dt = 'Kandil Capacity'
        filters = {key: anchor[key] for key in ('company','department','designation')}
        fields = ['name','position','company','department','branch','designation','structural','occupied','reserved','open_slots','available','modified']
        searched = ['name','branch']
    else:
        dt = 'Employee'; filters = {key: anchor[key] for key in ('company','department')}
        fields = ['name','employee_name','company','department','branch']
        searched = ['name','employee_name']
    if name: filters['name'] = bounded_text(name)
    if kind == 'replacement':
        # A dedicated name/ID projection does not grant native Employee profile
        # read permission. Query only bounded scoped candidates; apply native
        # User Permissions to each complete record before returning identity.
        conditions = ['company=%s', 'department=%s', '('+(scope_query('Employee', capability='manage') or '1=1')+')']
        values = [anchor.company, anchor.department]
        if name: conditions.append('name=%s'); values.append(bounded_text(name))
        if term:
            conditions.append('(name LIKE %s OR employee_name LIKE %s)')
            values.extend(['%'+term+'%','%'+term+'%'])
        rows = frappe.db.sql('SELECT name,employee_name FROM `tabEmployee` WHERE '+' AND '.join(conditions)+' ORDER BY name ASC LIMIT %s OFFSET %s',
                             (*values, limit+1, start), as_dict=True)
    else:
        rows = frappe.get_list(dt, filters=filters, or_filters=[[key,'like','%'+term+'%'] for key in searched] if term else None,
            fields=fields, order_by='name asc', start=start, page_length=limit+1)
    output = []
    for row in rows[:limit]:
        if kind == 'replacement':
            if can_reference_employee(frappe.get_doc('Employee',row.name)):
                output.append(dict(id=row.name,label=row.employee_name))
            continue
        if not manageable(row): continue
        if kind == 'capacity':
            try: position_anchor(row.position)
            except frappe.PermissionError: continue
            output.append(dict(id=row.name,label=row.branch,**{key:row[key] for key in fields if key not in ('name','modified')},
                               availability_basis='recorded_ledger',recorded_at=str(row.modified)))
        elif kind == 'position':
            output.append(dict(id=row.name,label=row.title,label_ar=row.title_ar,
                               **{key:row[key] for key in ('company','department','designation','branch')}))
        else:
            output.append(dict(id=row.name,label=row.employee_name))
    # Advance bounded native candidates, not a silently truncated company list.
    return dict(rows=output,start=start,next_start=start+limit,has_more=len(rows)>limit,count_scope='visible_rows_on_candidate_page')
