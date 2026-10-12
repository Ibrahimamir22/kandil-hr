"""Read-only, paginated organization projections under native + scoped access.

Dates apply to hierarchy/assignment episodes; current position attributes and
recorded capacity are explicitly not reconstructed historical headcount.
"""
import re
from datetime import date

import frappe
from frappe import _
from frappe.utils import cint

from kandil_hr.foundation.clock import today_cairo
from kandil_hr.portal.api import authenticated

POSITION_FIELDS = ['name', 'company', 'department', 'branch', 'position_code', 'title', 'title_ar',
                   'designation', 'structural', 'status', 'closed_on', 'modified']


def day(value):
    value = str(value or today_cairo())
    try:
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value): raise ValueError()
        return date.fromisoformat(value).isoformat()
    except (TypeError, ValueError):
        frappe.throw(_('Choose a valid date in YYYY-MM-DD format.'))


def paging(start, page_length):
    return max(0, cint(start)), min(100, max(1, cint(page_length)))


def bounded_text(value):
    if value is not None and (not isinstance(value, str) or len(value) > 140):
        frappe.throw(_('The organization filter must contain at most 140 characters.'))
    return (value or '').strip()


def page(rows, start, limit, **extra):
    return dict(rows=rows[:limit], start=start, next_start=start + limit, has_more=len(rows)>limit,
                count_scope='page', **extra)


def position_record(name):
    rows = frappe.get_list('Kandil Position', filters={'name': bounded_text(name)}, fields=POSITION_FIELDS, page_length=1)
    if not rows:
        frappe.throw(_('This position is unavailable in your organization scope.'), frappe.PermissionError)
    return rows[0]


def effective_filters(at):
    return [['valid_from', '<=', at]], [['valid_until', 'is', 'not set'], ['valid_until', '>=', at]]


def parents(positions, at):
    if not positions or not frappe.has_permission('Kandil Position Hierarchy', 'read'):
        return {p: dict(available=False, parent=None, restricted=False) for p in positions}
    filters, dates = effective_filters(at)
    rows = frappe.get_list('Kandil Position Hierarchy', filters=[['position','in',positions],*filters],
        or_filters=dates, fields=['position','parent_position'], order_by='name', page_length=1001)
    if len(rows)>1000:
        frappe.throw(_('Too many reporting-line episodes. Narrow the organization query.'))
    ids = sorted({r.parent_position for r in rows if r.parent_position})
    visible = {r.name:r for r in frappe.get_list('Kandil Position', filters={'name':['in',ids]},
        fields=['name','title','title_ar','position_code'], page_length=len(ids))} if ids else {}
    result = {}
    for name in positions:
        links = [r for r in rows if r.position == name]
        if len(links)>1:
            result[name] = dict(available=True,parent=None,restricted=False,ambiguous=True)
        else:
            parent = links[0].parent_position if links else None
            result[name] = dict(available=True,parent=visible.get(parent),restricted=bool(parent and parent not in visible),ambiguous=False)
    return result


@frappe.whitelist(methods=['GET'])
def options(kind='company', company=None, department=None, search='', start=0, page_length=50):
    authenticated()
    if kind not in ('company','department','branch'):
        frappe.throw(_('Unknown organization filter.'))
    start, limit = paging(start,page_length)
    filters = [[kind,'is','set']]
    for field,value in [('company',company),('department',department)]:
        if value: filters.append([field,'=',bounded_text(value)])
    term=bounded_text(search)
    if term: filters.append([kind,'like','%'+term+'%'])
    # Group over permission-filtered Positions, never a global Company/Branch list.
    rows = frappe.get_list('Kandil Position', filters=filters, fields=[kind], group_by=kind,
                          order_by=kind+' asc', start=start, page_length=limit+1)
    return page([dict(id=r[kind],label=r[kind]) for r in rows],start,limit)


@frappe.whitelist(methods=['GET'])
def positions(company=None, department=None, branch=None, search='', status='', as_of=None, start=0, page_length=25):
    authenticated()
    at=day(as_of);start,limit=paging(start,page_length)
    filters={}
    for key,value in [('company',company),('department',department),('branch',branch)]:
        if value: filters[key]=bounded_text(value)
    if status:
        if status not in ('Active','Closed'):frappe.throw(_('Unknown position status.'))
        filters['status']=status
    term=bounded_text(search)
    search_filters=[[key,'like','%'+term+'%'] for key in ('title','title_ar','position_code','name')] if term else None
    rows=frappe.get_list('Kandil Position', filters=filters, or_filters=search_filters,
                        fields=POSITION_FIELDS, order_by='position_code asc, name asc', start=start,page_length=limit+1)
    links=parents([r.name for r in rows[:limit]],at)
    return page([dict(r,reporting=links[r.name]) for r in rows[:limit]],start,limit,
                as_of=at, attributes_basis='current_records') | {'has_more':len(rows)>limit}


@frappe.whitelist(methods=['GET'])
def detail(name, as_of=None):
    authenticated();at=day(as_of);position=position_record(name)
    caps=[]
    if frappe.has_permission('Kandil Capacity','read'):
        caps=frappe.get_list('Kandil Capacity',filters={'position':position.name},
            fields=['name','structural','occupied','reserved','open_slots','available','occupancy_basis','occupancy_as_of','modified'],
            order_by='name',page_length=101)
    return dict(position=dict(position,reporting=parents([position.name],at)[position.name]),as_of=at,
                capacities=caps[:100],capacities_has_more=len(caps)>100,capacity_basis='recorded_current_ledger',
                access=dict(assignments=bool(frappe.has_permission('Kandil Position Assignment','read')),
                            job_descriptions=bool(frappe.has_permission('Kandil JD Revision','read'))))


@frappe.whitelist(methods=['GET'])
def related(name, kind, as_of=None, history=0, start=0, page_length=20):
    authenticated();at=day(as_of);position=position_record(name);start,limit=paging(start,page_length)
    if str(history) not in ('0','1'):frappe.throw(_('Choose current episodes or history.'))
    if kind not in ('assignments','job_descriptions'):frappe.throw(_('Unknown organization record type.'))
    dt='Kandil Position Assignment' if kind=='assignments' else 'Kandil JD Revision'
    if not frappe.has_permission(dt,'read'):return page([],start,limit,available=False,as_of=at)
    filters=[];dates=None
    if kind=='assignments':
        filters=[['position','=',position.name]]
        fields=['name','employee','allocation','valid_from','valid_until','is_voided']
        if not cint(history):
            valid,dates=effective_filters(at);filters.extend([['is_voided','=',0],*valid])
    else:
        # JDs belong to the job across positions, but native anchor scope still
        # applies: seeing a sibling position never grants access to a hidden JD.
        filters=[['company','=',position.company],['designation','=',position.designation]]
        fields=['name','revision','status','valid_from','approved_at']
        if not cint(history): filters.append(['valid_from','<=',at])
    rows=frappe.get_list(dt,filters=filters,or_filters=dates,fields=fields,
                        order_by='valid_from desc, name asc',start=start,page_length=limit+1)
    output=[]
    for row in rows[:limit]:
        if kind=='assignments':
            active=not row.is_voided and str(row.valid_from)<=at and (not row.valid_until or str(row.valid_until)>=at)
            employee=frappe.get_doc('Employee',row.employee)
            allowed=employee.has_permission('read')
            output.append(dict(name=row.name,employee=row.employee if allowed else None,
                employee_name=employee.employee_name if allowed else None,identity_restricted=not allowed,
                allocation=row.allocation,valid_from=row.valid_from,valid_until=row.valid_until,is_voided=bool(row.is_voided),active_at_date=bool(active)))
        else:
            output.append(dict(row,can_print=bool(frappe.has_permission(dt,'print',doc=row.name))))
    return dict(rows=output,start=start,next_start=start+limit,has_more=len(rows)>limit,available=True,as_of=at,count_scope='page')
