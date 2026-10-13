"""Exact scoped dashboard and approval queue; minimal bounded read projections."""
from copy import deepcopy
import frappe
from frappe.query_builder.functions import Count
from pypika import Order
from kandil_hr.foundation.clock import today_cairo
from kandil_hr.portal.api import authenticated, read_request
from kandil_hr.portal.organization import bounded_text, paging
from kandil_hr.portal.vacancies import permitted_names, query as vacancy_query
from kandil_hr.portal.approval_query import condition

DT='Kandil Hiring Request'
FIELDS=('name','title','status','revision','modified','requested_by','department','required_by')


def requests_query(search=''):
    r=frappe.qb.DocType(DT).as_('r')
    q=frappe.qb.from_(r).where(r.name.isin(permitted_names(DT)))
    if search:
        literal='%'+search.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
        q=q.where(r.name.like(literal)|r.title.like(literal))
    return q,r


def approvals_query(search=''):
    q,r=requests_query(search);s=frappe.qb.DocType('Kandil Approval Step').as_('s')
    q=q.join(s).on((s.parent==r.name)&(s.parenttype==DT)&(s.parentfield=='approval_steps')).where(condition())
    return q,r,s


def count(q,r):
    return int(deepcopy(q).select(Count(r.name).as_('total')).run(as_dict=True)[0].total)


def cards(names):
    result=[]
    for row in names:
        doc=read_request(row.name)
        item={field:doc.get(field) for field in FIELDS}
        item.update(modified=str(doc.modified),quantity=sum(int(l.requested_qty or 0) for l in doc.lines))
        if row.get('authority'):item['authority']=row.authority
        result.append(item)
    return result


@frappe.whitelist(methods=['GET'])
def approvals(search='',start=0,page_length=25):
    authenticated();term=bounded_text(search);start,limit=paging(start,page_length)
    q,r,s=approvals_query(term);total=count(q,r)
    rows=deepcopy(q).select(r.name,s.authority).orderby(r.modified,order=Order.desc).orderby(r.name).limit(limit).offset(start).run(as_dict=True)
    return dict(rows=cards(rows),total=total,start=start,page_length=limit,next_start=start+limit,
                has_more=start+limit<total,count_scope='all_current_permitted_approval_actions')


@frappe.whitelist(methods=['GET'])
def summary():
    authenticated();day=str(today_cairo());q,r=requests_query();a,ar,_=approvals_query()
    recent=deepcopy(q).select(r.name).orderby(r.modified,order=Order.desc).orderby(r.name).limit(5).run(as_dict=True)
    counts=dict(requests=count(q,r),approvals=count(a,ar))
    counts['overdue_requests']=count(deepcopy(q).where(r.status.isin(('Pending','Approved'))&(r.required_by<day)),r)
    for key,mode in (('vacancies','scope'),('unassigned','unassigned')):
        if frappe.has_permission('Job Opening','read'):
            v,o,*_=vacancy_query(mode,'active','','','','',day);counts[key]=count(v,o)
        else:counts[key]=0
    return dict(counts=counts,requests=cards(recent),approvals=approvals(page_length=5)['rows'],
                as_of=day,count_scope='all_permitted_records',limits=dict(recent_requests=5,next_actions=5),
                overdue_definition='Pending or Approved requests whose required-by date precedes the Cairo date; not SLA business-day expiry.')
