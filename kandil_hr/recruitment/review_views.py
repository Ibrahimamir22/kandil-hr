"""Permission-filtered request lists and original immutable event timelines.

Absent historical principals stay absent; this projection never guesses from the
current route and never returns revision payloads or confidential HR notes.
"""

import frappe
from frappe import _
from frappe.utils import cint, get_system_timezone

from kandil_hr.foundation.security import request_scope
from kandil_hr.recruitment.models import guard


def pagination(start, page_length):
	return max(0, cint(start)), min(100, max(1, cint(page_length)))


@frappe.whitelist()
def my_requests(start=0, page_length=20):
	guard()
	start, page_length = pagination(start, page_length)
	return frappe.get_list(
		"Kandil Hiring Request",
		filters={"requested_by": frappe.session.user},
		fields=["name", "title", "status", "company", "department", "requested_by", "modified"],
		order_by="modified desc, name asc",
		start=start,
		page_length=page_length,
	)


@frappe.whitelist()
def timeline(name, start=0, page_length=100):
	guard()
	doc = frappe.get_doc("Kandil Hiring Request", name)
	doc.check_permission("read")
	if not request_scope(doc):
		frappe.throw(_("This request is outside your HR scope."), frappe.PermissionError)
	start, page_length = pagination(start, page_length)
	rows = frappe.get_list(
		"Kandil Recruitment Event",
		filters={"request": name},
		fields=["name", "action", "actor", "principal", "creation", "public_note"],
		order_by="creation asc, name asc",
		start=start,
		page_length=page_length + 1,
	)
	for row in rows:
		row.note = row.pop("public_note", "")
	return dict(
		name=name,
		events=rows[:page_length],
		has_more=len(rows) > page_length,
		next_start=start + page_length,
		timezone=get_system_timezone(),
	)
