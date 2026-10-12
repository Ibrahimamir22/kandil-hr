"""Bounded portal projections for approved JD local mail capture; no provider sends."""
import frappe
from frappe import _

from kandil_hr.foundation.security import has_scope
from kandil_hr.organization import document_delivery as domain, documents
from kandil_hr.portal.api import authenticated
from kandil_hr.portal.organization import bounded_text, page, paging


def can_capture(jd):
    return bool(jd.status == 'Approved' and set(frappe.get_roles()) & set(domain.SENDER_ROLES)
                and has_scope(frappe.session.user, jd.company, jd.department, jd.branch, 'manage'))


@frappe.whitelist(methods=['GET'])
def capabilities(name):
    authenticated(); jd = documents.load(name)
    return dict(can_capture=can_capture(jd), delivery_mode='local_capture', provider_sent=False,
                max_recipients=10, note_limit=500)


@frappe.whitelist(methods=['GET'])
def recipients(name, search='', start=0, page_length=20):
    authenticated(); jd = documents.load(name)
    if not can_capture(jd):
        frappe.throw(_('Only authorized HR staff or managers may capture an approved document.'), frappe.PermissionError)
    start, limit = paging(start, page_length); term = bounded_text(search)
    filters = {'company': jd.company, 'revoked': 0}
    if term: filters['user'] = ['like', '%'+term+'%']
    # Paginate candidate identities BEFORE expensive native permission checks.
    # Empty eligible pages can still have_more; no global User directory query.
    candidates = frappe.get_all('Kandil Access Grant', filters=filters, fields=['user'], group_by='user',
                               order_by='user', start=start, page_length=limit+1)
    result = []
    for row in candidates[:limit]:
        try:
            with domain.quiet_eligibility(): domain.check_recipient(jd, row.user)
        except frappe.PermissionError: continue
        result.append(dict(user=row.user, label=frappe.db.get_value('User', row.user, 'full_name') or row.user))
    return dict(rows=result, start=start, next_start=start+limit, has_more=len(candidates)>limit,
                count_scope='eligible_rows_on_candidate_page')


@frappe.whitelist(methods=['GET'])
def history(name, start=0, page_length=20):
    authenticated(); documents.load(name); start, limit = paging(start, page_length)
    if not frappe.has_permission(domain.DOCTYPE, 'read'): return page([], start, limit)
    # Native query hook verifies sender/recipient and every frozen included scope.
    rows = frappe.get_list(domain.DOCTYPE, filters={'jd_revision': bounded_text(name)},
        fields=['name','jd_revision','sender','recipient','language','output_kind','status','captured_at'],
        order_by='captured_at desc, name', start=start, page_length=limit+1)
    return page(rows, start, limit, provider_sent=False, delivery_mode='local_capture')
