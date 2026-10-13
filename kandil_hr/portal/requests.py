"""Server-filtered request register; never derives totals from a downloaded page."""
import frappe
from frappe import _
from frappe.utils import cint

from kandil_hr.portal.api import authenticated, read_request
from kandil_hr.portal.organization import bounded_text, paging

DT = 'Kandil Hiring Request'
STATUSES = ('Draft','Pending','Returned','Approved','Rejected','Cancelled','Filled','Closed','Applied')
FIELDS = ('name','title','status','revision','modified','requested_by','company','department','required_by')


@frappe.whitelist(methods=['GET'])
def listing(mode='mine', search='', status='', start=0, page_length=25):
    authenticated()
    if not isinstance(mode,str) or mode not in ('mine','scope'):
        frappe.throw(_('Choose My Requests or All within my scope.'))
    if not isinstance(status,str) or (status and status not in STATUSES):
        frappe.throw(_('Choose a valid request status.'))
    term=bounded_text(search);start,limit=paging(start,page_length)
    filters={}
    if mode=='mine':filters['requested_by']=frappe.session.user
    if status:filters['status']=status
    # Literal search: wildcard characters in user input must not widen results.
    escaped=term.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')
    or_filters=[[DT,field,'like','%'+escaped+'%'] for field in ('name','title')] if term else []
    query=dict(filters=filters,or_filters=or_filters)
    # Same native permission query, User Permissions and own/principal/HR scope
    # apply to both the count and the page. No get_all or raw SQL count bypass.
    total=frappe.get_list(DT,fields=[{'COUNT':'name','as':'total'}],**query)[0].total
    names=frappe.get_list(DT,fields=['name'],order_by='modified desc,name asc',
                          start=start,page_length=limit,**query)
    result=[]
    for row in names:
        doc=read_request(row.name)
        item={key:doc.get(key) for key in FIELDS}
        item['modified']=str(doc.modified)
        item['quantity']=sum(cint(line.requested_qty) for line in doc.lines)
        result.append(item)
    return dict(rows=result,total=cint(total),start=start,page_length=limit,
                next_start=start+limit,has_more=start+limit<cint(total),mode=mode,
                count_scope='permission_filtered_matching_requests',statuses=list(STATUSES))
