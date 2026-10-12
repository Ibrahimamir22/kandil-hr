"""Frozen Requests.gs shortage contract, before reservation mutation.

BLOCK forbids shortage regardless of justification. WARN requires at least ten
trimmed characters and still needs independent approval through the normal route.
Rejected command transactions roll back: this helper is not durable denial audit.
"""

import frappe
from frappe import _


def enforce_shortage(*, excess, mode, reason):
	if not excess:
		return
	if mode == "Block":
		frappe.throw(_("Headcount blocking is enabled. Adjust capacity or requested quantity."))
	if len((reason or "").strip()) < 10:
		frappe.throw(_("Headcount exception justification must contain at least 10 characters."))
