"""Narrow recruitment identity access, separate from reading an Employee profile.

No role permissions are broadened. Only current recruitment managers with native
Employee User Permission access may select an employee in their assigned scope.
Public callers must project name/ID only and bind selection to a request's unit.
"""
import frappe
from frappe.permissions import has_user_permission
from kandil_hr.foundation.security import has_scope


def can_reference_employee(employee):
    user = frappe.session.user
    if user == 'Guest' or not frappe.db.get_value('User',user,'enabled'): return False
    if not {'Kandil Requester','Kandil Recruiter','Kandil Sector Approver'}.intersection(frappe.get_roles(user)):
        return False
    return bool(has_scope(user,employee.company,employee.department,employee.branch,'manage')
                and has_user_permission(employee,user,ptype='read'))


def visible_employee(name):
    if not name or not frappe.db.exists('Employee',name): return False
    employee = frappe.get_doc('Employee',name)
    return bool(employee.has_permission('read') or can_reference_employee(employee))
