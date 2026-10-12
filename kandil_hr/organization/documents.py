"""Scoped HR-authored JD view/print/PDF; no public links or salary/grade output."""

import re
from html import escape

import frappe
from frappe import _
from frappe.utils import getdate, strip_html
from werkzeug.wrappers import Response

from kandil_hr.foundation.security import assert_scope, has_scope
from kandil_hr.organization.api import active_hierarchy
from kandil_hr.pilot.models import enabled_guard

LABELS = {
	"Job Description": "الوصف الوظيفي",
	"Worker Card": "بطاقة العامل",
	"Draft - not approved": "مسودة - غير معتمدة",
	"Purpose": "هدف شغلك",
	"Responsibilities": "المسؤوليات",
	"Responsibility exception reason": "سبب زيادة المسؤوليات",
	"Performance Indicators": "مؤشرات الأداء",
	"Safety First": "السلامة أولاً",
	"What we measure": "ما نقيسه في عملك",
	"Decision Authorities": "صلاحيات القرار",
	"Certificates and Licences": "الشهادات والتراخيص",
	"Qualifications": "المؤهلات",
	"Experience": "الخبرة",
	"Technical Skills": "المهارات الفنية",
	"Working Conditions and Hazards": "ظروف العمل والمخاطر",
	"Competencies": "الكفاءات",
	"Location / Department / Direct Manager": "مكان العمل / الإدارة / الرئيس المباشر",
	"Revision": "الإصدار",
	"Effective From": "ساري من",
	"Printed": "تاريخ الطباعة",
	"Formula / Purpose": "المعادلة / الغرض",
	"Frequency": "الدورية",
	"Weight": "الوزن",
	"Monitoring": "متابعة",
	"Weighted": "موزون",
	"Employee signature or thumbprint": "اسم وتوقيع العامل أو البصمة",
	"Manager signature": "اسم وتوقيع المدير",
	"Witness signature": "اسم وتوقيع الشاهد",
	"Receipt": "إقرار الاستلام",
	"Receipt wording is a draft pending legal review.": "صيغة الإقرار مسودة تُراجع قانونياً قبل أول تسليم.",
	"I received this card and my manager explained my work and its safety requirements.": "استلمت هذه البطاقة وشرح لي رئيسي المباشر عملي ومتطلبات السلامة فيه.",
	"Date": "التاريخ",
	"Decide": "يقرر",
	"Recommend": "يوصي",
	"Consult": "يستشار",
	"Inform": "يبلغ",
	"Stop": "يوقف",
	"Refuse": "يرفض",
	"Required proficiency": "مستوى الإتقان المطلوب",
	"Not configured": "غير محدد",
}


def text(value):
	return escape(strip_html(str(value or ""))).replace("\n", "<br>")


def load(name):
	enabled_guard()
	if frappe.session.user == "Guest":
		frappe.throw(_("Login is required."), frappe.PermissionError)
	doc = frappe.get_doc("Kandil JD Revision", name)
	doc.check_permission("read")
	doc.check_permission("print")
	assert_scope(doc.company, doc.department, doc.branch, capability="read")
	return doc


def locations(doc):
	anchor = frappe.get_doc("Kandil Position", doc.position)
	hierarchy = active_hierarchy(doc.company, getdate())
	output = []
	for p in frappe.get_all(
		"Kandil Position",
		filters={"company": doc.company, "designation": anchor.designation, "status": "Active"},
		fields=["name", "title", "title_ar", "department", "branch"],
	):
		if not has_scope(
			frappe.session.user,
			p.company if p.get("company") else doc.company,
			p.department,
			p.branch,
			capability="read",
		):
			continue
		row = hierarchy.get(p.name)
		manager = ""
		if row and row.parent_position:
			parent = frappe.get_doc("Kandil Position", row.parent_position)
			if has_scope(
				frappe.session.user, parent.company, parent.department, parent.branch, capability="read"
			):
				manager = parent.title_ar or parent.title
		output.append(
			{"position": p.name, "department": p.department, "branch": p.branch, "manager": manager}
		)
	return output


def render(name, language="en", kind="jd"):
	if language not in ["en", "ar"] or kind not in ["jd", "worker"]:
		frappe.throw(_("Unsupported document output."))
	doc = load(name)
	ar = language == "ar"
	worker = kind == "worker"
	position = frappe.get_doc("Kandil Position", doc.position)

	def label(v):
		return LABELS.get(v, v) if ar else v

	def value(row, key):
		return row.get(key + "_ar") or row.get(key) if ar else row.get(key) or row.get(key + "_ar")

	def section(title, content, cls=""):
		return (
			'<section class="' + cls + '"><h2>' + text(label(title)) + "</h2>" + content + "</section>"
			if content
			else ""
		)

	def lines(rows, key):
		return (
			"<ol>" + "".join("<li>" + text(value(r, key)) + "</li>" for r in rows) + "</ol>" if rows else ""
		)

	title = (position.title_ar or position.title) if ar else position.title
	heading = label("Worker Card" if worker else "Job Description")
	filename = re.sub(
		r"[^\w\s.\-\u0600-\u06FF]",
		"",
		position.designation + " " + title + " - " + heading + " v" + str(doc.revision or 0),
	)[:160]
	content = (
		"<header><small>"
		+ text(doc.company)
		+ "</small><h1>"
		+ text(title)
		+ "</h1><b>"
		+ text(heading)
		+ "</b></header>"
	)
	if doc.status != "Approved":
		content += "<aside>" + text(label("Draft - not approved")) + "</aside>"
	content += (
		'<p class="meta">'
		+ text(position.designation)
		+ " | "
		+ text(label("Revision"))
		+ ": "
		+ text(doc.revision or 0)
		+ " | "
		+ text(label("Effective From"))
		+ ": "
		+ text(doc.valid_from)
		+ "</p>"
	)
	sites = locations(doc)
	content += section(
		"Location / Department / Direct Manager",
		"<ul>"
		+ "".join(
			"<li>"
			+ text(s["branch"])
			+ " / "
			+ text(s["department"])
			+ " / "
			+ text(s["manager"] or label("Not configured"))
			+ "</li>"
			for s in sites
		)
		+ "</ul>",
	)
	content += section("Purpose", "<p>" + text(value(doc, "purpose")) + "</p>")
	content += section(
		"Responsibilities",
		lines(doc.get("responsibility_rows") or [], "description")
		or "<p>" + text(value(doc, "responsibilities")) + "</p>",
	)
	if doc.get("responsibility_reason"):
		content += section(
			"Responsibility exception reason", "<p>" + text(doc.responsibility_reason) + "</p>"
		)
	kpis = sorted(doc.get("kpis") or [], key=lambda k: (k.kind != "Weighted", -(k.weight or 0)))
	authorities = doc.get("authorities") or []
	if worker:
		safety = "<p>" + text(value(doc, "working_conditions")) + "</p>"
		safety += "".join(
			"<p><b>" + text(label(r.authority_level)) + ":</b> " + text(value(r, "decision")) + "</p>"
			for r in authorities
			if r.authority_level in ["Stop", "Refuse"]
		)
		content += section("Safety First", safety, "safety")
		content += section("What we measure", lines([k for k in kpis if k.kind == "Weighted"], "indicator"))
		authorities = [r for r in authorities if r.authority_level not in ["Stop", "Refuse"]]
	elif kpis:
		content += section(
			"Performance Indicators",
			"<table><thead><tr>"
			+ "".join(
				"<th>" + text(label(h)) + "</th>"
				for h in ["Performance Indicators", "Formula / Purpose", "Frequency", "Weight"]
			)
			+ "</tr></thead><tbody>"
			+ "".join(
				"<tr><td>"
				+ text(value(k, "indicator"))
				+ "</td><td>"
				+ text(value(k, "formula"))
				+ "</td><td>"
				+ text(k.frequency)
				+ "</td><td>"
				+ text(str(k.weight) + "%" if k.kind == "Weighted" else label("Monitoring"))
				+ "</td></tr>"
				for k in kpis
			)
			+ "</tbody></table>",
		)
	content += section(
		"Decision Authorities",
		"".join(
			"<p><b>" + text(label(r.authority_level)) + ":</b> " + text(value(r, "decision")) + "</p>"
			for r in authorities
		),
	)
	for key, title_ in [("certifications", "Certificates and Licences")] + (
		[]
		if worker
		else [
			("qualifications", "Qualifications"),
			("experience", "Experience"),
			("technical_skills", "Technical Skills"),
			("working_conditions", "Working Conditions and Hazards"),
		]
	):
		if value(doc, key):
			content += section(title_, "<p>" + text(value(doc, key)) + "</p>")
	if not worker:
		content += section(
			"Competencies",
			"".join(
				"<p><b>"
				+ text(value(c, "competency"))
				+ "</b> "
				+ text(c.get("competency_group"))
				+ " "
				+ text(label("Required proficiency"))
				+ ": "
				+ text(c.get("required_level"))
				+ "<br>"
				+ text(value(c, "behavior"))
				+ "<br>"
				+ text(value(c, "measure"))
				+ "</p>"
				for c in doc.competencies
			),
		)
	else:
		content += section(
			"Receipt",
			"<p>"
			+ text(
				label("I received this card and my manager explained my work and its safety requirements.")
			)
			+ '</p><div class="signatures">'
			+ "".join(
				"<div>" + text(label(s)) + "<br>________________</div>"
				for s in ["Employee signature or thumbprint", "Manager signature", "Witness signature"]
			)
			+ '</div><p class="meta">'
			+ text(label("Date"))
			+ ": ____ / ____ / ______<br>"
			+ text(label("Receipt wording is a draft pending legal review."))
			+ "</p>",
		)
	content += (
		"<footer>" + text(label("Printed")) + ": " + text(getdate()) + " | " + text(doc.name) + "</footer>"
	)
	css = """@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:"Noto Sans Arabic","DejaVu Sans",Arial,sans-serif;color:#16342f;margin:0;font-size:12px;line-height:1.55}main{max-width:186mm;margin:auto}header{border-bottom:3px solid #176356;padding-bottom:8px}h1{font-size:24px;margin:2px 0}h2{font-size:15px;margin:10px 0 3px;color:#176356}p,ul,ol{margin:3px 0 5px}li{margin:2px 0}section{page-break-inside:auto}h2{page-break-after:avoid}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:1px solid #b9cfc7;padding:5px;word-wrap:break-word}tr{page-break-inside:avoid}thead{display:table-header-group}.meta,footer{font-size:10px;color:#536a63}aside{padding:6px;background:#fff0ce;color:#805200;font-weight:bold}.safety{border:2px solid #9a4c17;padding:8px;background:#fff7e9}.signatures{display:table;width:100%}.signatures div{display:table-cell;width:33%;padding:8px}.worker{font-size:14px;line-height:1.4}.worker h2{font-size:16px;margin-top:7px}.worker h1{font-size:23px}footer{margin-top:12px;border-top:1px solid #b9cfc7;padding-top:5px}@media screen{body{background:#e8efec;padding:24px}main{padding:12mm;background:white;box-shadow:0 3px 20px #0002}}"""
	html = (
		'<!doctype html><html lang="'
		+ language
		+ '" dir="'
		+ ("rtl" if ar else "ltr")
		+ '"><head><meta charset="utf-8"><title>'
		+ escape(filename)
		+ "</title><style>"
		+ css
		+ '</style></head><body><main class="'
		+ ("worker" if worker else "jd")
		+ '">'
		+ content
		+ "</main></body></html>"
	)
	return {"html": html, "filename": filename}


@frappe.whitelist()
def view(name, language="en", kind="jd"):
	output = render(name, language, kind)
	return Response(
		output["html"],
		mimetype="text/html",
		headers={
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'",
		},
	)


@frappe.whitelist()
def download_pdf(name, language="en", kind="jd"):
	from frappe.utils.pdf import get_pdf

	output = render(name, language, kind)
	frappe.local.response.filename = output["filename"] + ".pdf"
	frappe.local.response.filecontent = get_pdf(output["html"], options={"page-size": "A4"})
	frappe.local.response.type = "pdf"
	frappe.local.response.display_content_as = "attachment"
