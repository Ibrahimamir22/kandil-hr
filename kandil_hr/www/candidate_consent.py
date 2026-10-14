"""Separate candidate-facing page; bearer capability stays in browser memory."""
import frappe
from frappe.sessions import get_csrf_token
from kandil_hr.privacy.portal import enabled

no_cache = 1


def get_context(context):
    if not enabled():
        frappe.throw('Candidate consent is unavailable.',frappe.DoesNotExistError)
    context.no_cache = 1
    context.csrf = get_csrf_token()
