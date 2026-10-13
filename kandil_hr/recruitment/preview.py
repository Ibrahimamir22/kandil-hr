"""Scoped read-only capacity guidance. Commands independently revalidate on write."""

import json

import frappe
from frappe import _
from frappe.utils import cint

from kandil_hr.foundation.security import request_scope
from kandil_hr.organization.models import lock_company
from kandil_hr.organization.occupancy import values
from kandil_hr.recruitment.api import route_config
from kandil_hr.recruitment.models import guard


def can_preview():
	# Reading frozen request references does not grant operational recalculation.
	return frappe.session.user == 'Administrator' or bool({
		'Kandil Requester', 'Kandil Approver', 'Kandil Recruiter', 'Kandil Sector Approver'
	}.intersection(frappe.get_roles()))


@frappe.whitelist()
def headcount(name):
	guard()
	if not can_preview():
		frappe.throw(_("Your role cannot preview live headcount."), frappe.PermissionError)
	company = frappe.db.get_value("Kandil Hiring Request", name, "company")
	if not company:
		frappe.throw(_("Hiring request not found."), frappe.DoesNotExistError)
	lock_company(company)
	parent_name = frappe.db.get_value("Kandil Hiring Request", name, "amends")
	parent = frappe.get_doc("Kandil Hiring Request", parent_name, for_update=True) if parent_name else None
	doc = frappe.get_doc("Kandil Hiring Request", name, for_update=True)
	doc.check_permission("read")
	if not request_scope(doc):
		frappe.throw(_("This request is outside your HR scope."), frappe.PermissionError)
	if parent:
		parent.check_permission("read")
		if parent.company != doc.company or not request_scope(parent):
			frappe.throw(_("This request is outside your HR scope."), frappe.PermissionError)
	baseline = {line.capacity: cint(line.approved_qty) for line in parent.lines} if parent else {}
	config = route_config(doc)
	frozen = json.loads(doc.route_snapshot or "{}").get("policy", {})
	caps = {
		name: frappe.get_doc("Kandil Capacity", name, for_update=True)
		for name in sorted({row.capacity for row in doc.lines})
	}
	result = []
	for row in doc.lines:
		cap = caps[row.capacity]
		cap.check_permission("read")
		current = values(cap)
		own_reserved = cint(row.reserved_qty) if doc.status == "Pending" else 0
		available = current["available"] + own_reserved
		quantity = cint(row.proposed_qty) if doc.status == "Pending" else cint(row.requested_qty)
		demand = (
			max(0, quantity - baseline.get(row.capacity, 0))
			if doc.status in ("Draft", "Pending", "Returned")
			else 0
		)
		result.append(
			dict(
				capacity=cap.name,
				position=cap.position,
				branch=cap.branch,
				requested=quantity,
				available=available,
				incremental_demand=demand,
				shortage=max(0, demand - available) if demand else 0,
				own_reserved=own_reserved,
				unresolved=current["unresolved"],
			)
		)
	return dict(
		name=doc.name,
		expected_version=str(doc.modified),
		rows=result,
		current_mode=config.headcount_mode,
		submitted_mode=frozen.get("headcount_mode"),
		status=doc.status,
	)
