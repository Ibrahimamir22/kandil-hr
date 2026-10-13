"""Baseline read relationship for an authorized, submitted amendment reviewer.

The original request is needed to review/apply an amendment. The relationship is
one level only, requires a server-frozen approval route and complete current read
access to the amendment. Native role, parent Link permissions and parent scope
remain additional gates. No write, candidate, compensation or HR-note rights are
created. Draft amendments never establish this relationship.
"""
import frappe
from frappe.permissions import get_allowed_docs_for_doctype

from kandil_hr.recruitment.history_access import user_permissions

DT = 'Kandil Hiring Request'
TABLE = '`tabKandil Hiring Request`'
ALIAS = '`amendment_baseline_reader`'


def condition(user):
    if not frappe.conf.get('kandil_parity_enabled') or user == 'Guest':
        return '1=0'
    from kandil_hr.pilot.permissions import request_query

    # Exactly one non-recursive relationship. A parent cannot gain access from
    # another parent's derived access; nested amendments are not supported.
    # Privileged scope is handled by the caller using its current role check.
    # Never infer a relationship from a cached former HR/sector role here.
    access = request_query(user, include_amendments=False, include_privileged=False) or '1=1'
    access += ' AND (' + user_permissions(DT, user) + ')'
    access = access.replace(TABLE, ALIAS)
    clauses = [access]
    # Match Document child-Link permissions, omitted by native list compilation.
    permissions = frappe.permissions.get_user_permissions(user)
    strict = frappe.get_system_settings('apply_strict_user_permissions')
    for table_field in frappe.get_meta(DT).get_table_fields():
        child = '`tab' + table_field.options + '`'
        for field in frappe.get_meta(table_field.options).get_link_fields():
            if field.ignore_user_permissions:
                continue
            allowed = get_allowed_docs_for_doctype(permissions.get(field.options, []), DT)
            if not allowed:
                continue
            value = f"COALESCE({child}.`{field.fieldname}`,'')"
            forbidden = value + ' NOT IN (' + ','.join(frappe.db.escape(v) for v in allowed) + ')'
            if not strict:
                forbidden += f" AND {value}<>''"
            clauses.append(f"NOT EXISTS (SELECT 1 FROM {child} WHERE {child}.parent={ALIAS}.name "
                f"AND {child}.parenttype={frappe.db.escape(DT)} AND {child}.parentfield={frappe.db.escape(table_field.fieldname)} AND ({forbidden}))")
    return f"""(COALESCE({TABLE}.amends,'')='' AND EXISTS (
        SELECT 1 FROM {TABLE} {ALIAS}
        WHERE {ALIAS}.amends={TABLE}.name AND {ALIAS}.company={TABLE}.company
        AND {ALIAS}.department={TABLE}.department AND {ALIAS}.request_kind='Amendment'
        AND {ALIAS}.status IN ('Pending','Returned','Rejected','Cancelled','Applied')
        AND EXISTS (SELECT 1 FROM `tabKandil Approval Step` amendment_frozen_step
            WHERE amendment_frozen_step.parent={ALIAS}.name
            AND amendment_frozen_step.parenttype='Kandil Hiring Request'
            AND amendment_frozen_step.parentfield='approval_steps')
        AND {' AND '.join('('+c+')' for c in clauses)}))"""


def allowed(doc, user, *, current=False):
    if doc.amends:
        return False
    # The caller still enforces native permissions on the original record. A
    # locking read is used by delivery after its Company/domain/account locks.
    sql = f"SELECT name FROM {TABLE} WHERE name=%s AND ({condition(user)})"
    if current:
        sql += ' FOR UPDATE'
    return bool(frappe.db.sql(sql, (doc.name,)))


def lock_principals(doc):
    """Before any User locks, freeze child routes needed for baseline access.

    Delivery has the original Company/request lock; all amendment commands use
    that Company first. Include every frozen child principal/vice in the caller's
    globally sorted User set before evaluating dated/delegated relationships.
    """
    if doc.amends:
        return set()
    values = frappe.db.sql("""SELECT s.principal, s.board_vice
        FROM `tabKandil Hiring Request` a JOIN `tabKandil Approval Step` s ON s.parent=a.name
        WHERE a.amends=%s AND a.company=%s AND a.department=%s AND a.request_kind='Amendment'
        AND a.status IN ('Pending','Returned','Rejected','Cancelled','Applied')
        AND s.parenttype='Kandil Hiring Request' AND s.parentfield='approval_steps'
        ORDER BY a.name,s.name FOR UPDATE""", (doc.name, doc.company, doc.department), as_dict=True)
    return {user for row in values for user in (row.principal, row.board_vice) if user}
