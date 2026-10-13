"""Redact restricted historical identity fields without losing the useful capture.

This is reference visibility, not access to a User profile or today's authority.
Only projected dictionaries are passed here; immutable source records stay intact.
"""
import frappe
from frappe import _
from kandil_hr.recruitment.history_access import user_permissions


def redact(groups):
    names=set()
    for row,keys in groups:
        for key in keys:
            value=row.get(key)
            if value is None or value=='':continue
            if not isinstance(value,str) or len(value)>140:
                frappe.throw(_('This request history is unavailable for your role or scope.'),frappe.PermissionError)
            names.add(value)
    allowed=set()
    if names:
        allowed={r[0] for r in frappe.db.sql(
            f"SELECT name FROM `tabUser` WHERE name IN %(names)s AND ({user_permissions('User',frappe.session.user)})",
            {'names':tuple(sorted(names))})}
    for row,keys in groups:
        restricted=[]
        for key in keys:
            if row.get(key) and row[key] not in allowed:
                row[key]=None;restricted.append(key)
        if restricted:row['restricted_identities']=restricted


def metadata(value,keys=('actor','principal')):
    redact([(value,keys)]);return value


def capture(value):
    groups=[(value,('requested_by','beneficiary_user'))]
    groups.extend((row,('principal','actor','board_member')) for row in value['approval_steps'])
    if value.get('policy'):
        groups.append((value['policy'],('hr_approver','exception_approver','ceo_approver','board_approver','board_vice_approver')))
    redact(groups);return value
