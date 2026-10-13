"""Current-reference privacy for Kandil receipts, including native Desk/API reads.

Non-Kandil notifications retain upstream behavior. No upstream source changes.
Permission predicates execute before count/page and unknown Kandil types fail
closed. The portal only exposes delivered, matching outbox receipts.
"""
import frappe
from frappe.database.query import RawCriterion
from frappe.utils import cint
from pypika import Criterion
from pypika.terms import CustomFunction
from kandil_hr.foundation.outbox_access import SCOPED_TYPES

TYPES = tuple(sorted(SCOPED_TYPES | {'Kandil Hiring Request', 'Job Opening'}))


def active():
    return bool(frappe.conf.get('kandil_parity_enabled'))


def no_store():
    if getattr(frappe.local, 'response_headers', None) is not None:
        frappe.local.response_headers.set('Cache-Control', 'no-store')


def reference_condition(kind, name, user):
    from kandil_hr.portal.vacancies import permitted_names
    choices = []
    for doctype in TYPES:
        if not frappe.has_permission(doctype, 'read', user=user):
            continue
        allowed = permitted_names(doctype, user=user)
        # Native Job Opening permission must also include every parent child-Link
        # restriction, not merely the opening's company/read grant.
        if doctype == 'Job Opening':
            opening = frappe.qb.DocType(doctype)
            allowed = allowed.where(opening.custom_kandil_request.isin(permitted_names('Kandil Hiring Request', user=user)))
        choices.append((kind == doctype) & name.isin(allowed))
    return Criterion.any(choices) if choices else RawCriterion('1=0')


def managed_condition(n):
    out = frappe.qb.DocType('Kandil Notification Outbox')
    return ((CustomFunction('LEFT',['value','length'])(n.document_type,7)=='Kandil ') | (n.document_type == 'Job Opening')
            | n.name.isin(frappe.qb.from_(out).select(out.notification_log).where(out.notification_log.isnotnull() & (out.notification_log!=''))))


def native_condition(user=None):
    user = user or frappe.session.user
    if not active():
        return ''
    if user == 'Guest' or not frappe.db.get_value('User', user, 'enabled'):
        return '1=0'
    n = frappe.qb.DocType('Notification Log')
    # An outbox event without a reference is an account-only informational alert.
    blank = ((n.document_type.isnull() | (n.document_type == '')) & (n.document_name.isnull() | (n.document_name == '')))
    permitted = reference_condition(n.document_type, n.document_name, user) | blank
    # A hook is embedded as one AND operand. Preserve the complete OR group,
    # otherwise a different permitted row could satisfy a named-record check.
    clause=((~managed_condition(n)) | ((n.for_user == user) & permitted)).get_sql(quote_char='`',with_namespace=True)
    return '('+clause+')'


def native_permission(doc, user=None, ptype=None):
    if not active():
        return True
    user = user or frappe.session.user
    if not frappe.db.get_value('User', user, 'enabled'):
        return False
    n = frappe.qb.DocType('Notification Log')
    # Let insertion validation and the upstream recipient check retain their roles.
    if doc.is_new():
        return True
    return bool(frappe.qb.from_(n).select(n.name).where(n.name == doc.name)
                .where(RawCriterion(native_condition(user))).limit(1).run())


@frappe.whitelist(methods=['GET','POST'])
def get_notification_logs(limit=20):
    from frappe.desk.doctype.notification_log import notification_log as upstream
    if not active():
        return upstream.get_notification_logs(limit=cint(limit))
    no_store()
    logs = frappe.get_list('Notification Log', fields=['*'], page_length=min(100,max(1,cint(limit))), order_by='creation desc,name desc')
    # Do not expand other User profiles in the HR notification response.
    return dict(notification_logs=logs, user_info={})
