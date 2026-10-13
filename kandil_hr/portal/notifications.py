"""Personal inbox of delivered local receipts. No delivery or business writes."""
from copy import deepcopy
import frappe
from frappe import _
from frappe.query_builder.functions import Count
from pypika import Order
from pypika.terms import CustomFunction
from kandil_hr.portal.api import authenticated
from kandil_hr.portal.organization import bounded_text, paging
from kandil_hr.foundation.notification_access import reference_condition, no_store


def query():
    n=frappe.qb.DocType('Notification Log').as_('n')
    o=frappe.qb.DocType('Kandil Notification Outbox').as_('o')
    coalesce=CustomFunction('COALESCE',['value','fallback'])
    q=(frappe.qb.from_(n).join(o).on(o.notification_log==n.name)
       .where((o.status=='Delivered locally') & (o.recipient==frappe.session.user) & (n.for_user==frappe.session.user))
       .where((coalesce(o.reference_doctype,'')==coalesce(n.document_type,'')) & (coalesce(o.reference_name,'')==coalesce(n.document_name,'')))
       .where(reference_condition(o.reference_doctype,o.reference_name,frappe.session.user) | ((coalesce(o.reference_doctype,'')=='') & (coalesce(o.reference_name,'')==''))))
    return q,n,o


def total(q,n):
    return int(deepcopy(q).select(Count(n.name).as_('total')).run(as_dict=True)[0].total)


@frappe.whitelist(methods=['GET'])
def listing(state='all',search='',start=0,page_length=25):
    authenticated();no_store()
    if state not in ('all','unread','read'):
        frappe.throw(_('Choose a valid notification view.'))
    search=bounded_text(search);start,limit=paging(start,page_length)
    q,n,o=query();unread=total(deepcopy(q).where(n.read==0),n)
    if state!='all':q=q.where(n.read==(0 if state=='unread' else 1))
    if search:
        term='%'+search.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
        q=q.where(o.subject.like(term)|o.body.like(term))
    count=total(q,n)
    # Queue recovery may deliver old events after newer ones. Order and label
    # by event creation, not receipt delivery, with a stable outbox-ID tie-breaker.
    rows=q.select(n.name,o.creation,n.read,o.subject,o.body,o.reference_doctype,o.reference_name).orderby(o.creation,order=Order.desc).orderby(o.name).limit(limit).offset(start).run(as_dict=True)
    for row in rows:
        row['read']=bool(row['read'])
        # A fixed type allowlist, never a URL from message content.
        row['request']=row.reference_name if row.reference_doctype=='Kandil Hiring Request' else (
            frappe.db.get_value('Job Opening',row.reference_name,'custom_kandil_request') if row.reference_doctype=='Job Opening' else None)
    return dict(rows=rows,total=count,unread=unread,start=start,page_length=limit,next_start=start+limit,has_more=start+limit<count)


@frappe.whitelist(methods=['POST'])
def mark_read(name):
    authenticated();no_store();name=bounded_text(name)
    q,n,o=query()
    hit=q.select(o.name).where(n.name==name).limit(1).run(as_dict=True)
    if not hit:
        frappe.throw(_('This notification is unavailable.'),frappe.PermissionError)
    # Acquire current domain/identity/grant locks before the receipt; permissions
    # are rechecked under these locks so a stale request snapshot cannot lend access.
    from kandil_hr.foundation.outbox_access import lock_domain, current_role_read, request_relationship
    from kandil_hr.foundation.mutation_access import current_identity, assert_current_scope, assert_current_request_scope
    out=frappe.get_doc('Kandil Notification Outbox',hit[0].name)
    doc,parent=lock_domain(out.reference_doctype,out.reference_name)
    roles=current_identity(frappe.session.user)
    if not doc and out.reference_doctype:frappe.throw(_('This notification is unavailable.'),frappe.PermissionError)
    if parent:assert_current_request_scope(parent,user=frappe.session.user,capability='read')
    elif doc:assert_current_scope(doc.company,doc.get('department'),doc.get('branch'),user=frappe.session.user,capability='sensitive' if doc.doctype=='Kandil Grade Band' else 'read')
    if doc and doc.doctype=='Kandil Document Delivery':
        from kandil_hr.organization.document_delivery import assert_current_capture_access
        assert_current_capture_access(doc,frappe.session.user)
    if doc and (not current_role_read(doc,frappe.session.user,roles) or (doc.doctype=='Kandil Hiring Request' and not request_relationship(doc,frappe.session.user,roles))):
        frappe.throw(_('This notification is unavailable.'),frappe.PermissionError)
    if doc:doc.check_permission('read')
    receipt=frappe.get_doc('Notification Log',name,for_update=True)
    if receipt.for_user!=frappe.session.user or (receipt.document_type or '')!=(out.reference_doctype or '') or (receipt.document_name or '')!=(out.reference_name or ''):
        frappe.throw(_('This notification is unavailable.'),frappe.PermissionError)
    # Set-only idempotence: duplicate/lost-response retry never toggles it back.
    if not receipt.read:frappe.db.set_value('Notification Log',name,'read',1,update_modified=False)
    return dict(name=name,read=True)
