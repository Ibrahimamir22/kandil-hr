"""Permissioned rendering of a stored revision; never reconstruct history from live records."""

import json
from html import escape

import frappe
from frappe import _
from werkzeug.wrappers import Response

from kandil_hr.foundation.security import assert_scope
from kandil_hr.organization import rules
from kandil_hr.organization.api import digest
from kandil_hr.pilot.models import enabled_guard


def render(name, language="en"):
	enabled_guard()
	if language not in ("en", "ar"):
		frappe.throw(_("Choose Arabic or English."), frappe.ValidationError)
	doc = frappe.get_doc("Kandil Structure Snapshot", name)
	doc.check_permission("read")
	# A snapshot contains whole-company historical relationships.
	assert_scope(doc.company, capability="read")
	payload = json.loads(doc.payload_json)
	state = payload.get("state", payload)
	if digest(state) != doc.digest:
		frappe.throw(_("The stored structure snapshot failed its integrity check."), frappe.ValidationError)
	positions = {row["name"]: row for row in state["positions"]}
	edges = {row["position"]: row for row in state["hierarchy"] if rules.effective(row, doc.as_of)}
	rows = []
	for name, position in sorted(positions.items()):
		edge = edges.get(name, {})
		rows.append(
			{
				"position": name,
				"title": position.get("title_ar")
				if language == "ar" and position.get("title_ar")
				else position.get("title") or name,
				"department": position["department"],
				"parent_position": edge.get("parent_position") or "",
				"authority": edge.get("authority") or "",
				"structural": position["structural"],
				"status": position["status"],
			}
		)
	labels = ["Position", "Title", "Department", "Parent Position", "Authority", "Structural", "Status"]
	arabic = ["المنصب", "المسمى", "الإدارة", "المنصب الأعلى", "سلطة الاعتماد", "العدد المعتمد", "الحالة"]
	title = "إصدار الهيكل التنظيمي" if language == "ar" else "Organization Structure Revision"
	header = "".join("<th>" + escape(label) + "</th>" for label in (arabic if language == "ar" else labels))
	body = "".join(
		"<tr>" + "".join("<td>" + escape(str(value)) + "</td>" for value in row.values()) + "</tr>"
		for row in rows
	)
	html = f'''<!doctype html><html lang="{language}" dir="{"rtl" if language == "ar" else "ltr"}"><head><meta charset="utf-8"><title>{escape(title)}</title><style>body{{font:16px Arial,sans-serif;margin:2rem}}table{{border-collapse:collapse;width:100%}}td,th{{padding:.5rem;border:1px solid #ccc;text-align:start}}code{{unicode-bidi:isolate}}</style></head><body><h1>{escape(title)}</h1><p>{escape(doc.company)} · <code>{escape(doc.name)}</code> · {escape(str(doc.as_of))}</p><table><thead><tr>{header}</tr></thead><tbody>{body}</tbody></table></body></html>'''
	return {"name": doc.name, "as_of": str(doc.as_of), "digest": doc.digest, "rows": rows, "html": html}


@frappe.whitelist()
def view(name, language="en"):
	return Response(render(name, language)["html"], mimetype="text/html")
