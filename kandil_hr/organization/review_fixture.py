"""Persistent synthetic JD for a human/browser review on the isolated parity site.

Not whitelisted. Run only with the integration coordinator's exclusive DB slot.
Credentials are written only to the site's private review JSON, never returned.
"""

import json
import os
import secrets
from pathlib import Path

import frappe
from frappe.utils import cint, today

from kandil_hr.organization.api import approve_revision
from kandil_hr.organization.models import lock_company


def install():
	if frappe.local.site != "kandil-parity.localhost" or not all(
		cint(frappe.conf.get(key))
		for key in [
			"allow_tests",
			"mute_emails",
			"kandil_foundation_enabled",
			"kandil_parity_enabled",
			"kandil_pilot_enabled",
		]
	):
		raise RuntimeError(
			"Persistent organization review fixtures require the isolated muted parity test site."
		)
	if frappe.session.user != "Administrator":
		raise frappe.PermissionError("Run fixture installation as Administrator.")
	path = Path(frappe.get_site_path("private", "kandil-review.json"))
	data = json.loads(path.read_text())
	if data.get("site") != frappe.local.site or not data.get("positions") or not data.get("prefix"):
		raise RuntimeError("Existing parity review fixture metadata is required.")
	company, department, position = data["company"], data["department"], data["positions"][0]
	if "TEST" not in (frappe.db.get_value("Company", company, "company_name") or ""):
		raise RuntimeError("Review fixtures require a synthetic TEST company.")
	anchor = frappe.get_doc("Kandil Position", position)
	if (
		anchor.company != company
		or anchor.department != department
		or not position.startswith(data["prefix"])
	):
		raise RuntimeError("Review Position must match the frozen synthetic fixture scope.")
	lock_company(company)
	credentials = data.setdefault("credentials", {})
	identity = credentials.get("organization")
	email = data["prefix"].lower() + "-organization@example.invalid"
	if identity and identity.get("email") != email:
		raise RuntimeError("Refusing to overwrite an unrelated organization review account.")
	if not identity and frappe.db.exists("User", email):
		raise RuntimeError(
			"Review account exists without private credentials; recover its private fixture metadata."
		)
	new_identity = not identity
	pending = path.with_name(path.name + ".organization-pending")
	try:
		if not identity:
			identity = {"email": email, "password": secrets.token_urlsafe(24)}
			frappe.get_doc(
				{
					"doctype": "User",
					"email": email,
					"first_name": "Synthetic Organization Reviewer",
					"enabled": 1,
					"user_type": "System User",
					"send_welcome_email": 0,
					"new_password": identity["password"],
					"roles": [{"role": "Kandil Recruiter"}, {"role": "Kandil Sector Approver"}],
				}
			).insert()
			credentials["organization"] = identity
		else:
			account = frappe.get_doc("User", email)
			if not account.enabled or not {"Kandil Recruiter", "Kandil Sector Approver"}.issubset(
				set(frappe.get_roles(email))
			):
				raise RuntimeError(
					"Existing review account is disabled or its roles changed; preserve operator changes."
				)
		grants = frappe.get_all(
			"Kandil Access Grant",
			filters={"user": email, "company": company, "revoked": 0},
			fields=["name", "department", "branch", "can_manage_recruitment", "valid_from", "valid_until"],
		)
		if not any(
			not g.department
			and not g.branch
			and g.can_manage_recruitment
			and str(g.valid_from) <= today()
			and (not g.valid_until or str(g.valid_until) >= today())
			for g in grants
		):
			if not new_identity:
				raise RuntimeError(
					"Existing organization review grant changed or expired; preserve operator changes."
				)
			frappe.get_doc(
				{
					"doctype": "Kandil Access Grant",
					"user": email,
					"company": company,
					"valid_from": today(),
					"can_manage_recruitment": 1,
					"can_view_sensitive": 0,
					"reason": "Synthetic organization browser-review fixture; dedicated test company only.",
				}
			).insert()
		name = data.setdefault("docs", {}).get("jd") or data["prefix"] + "-JD-REVIEW"
		if frappe.db.exists("Kandil JD Revision", name):
			jd = frappe.get_doc("Kandil JD Revision", name)
			if jd.company != company or jd.position != position or jd.status != "Approved":
				raise RuntimeError("Existing JD review document differs; preserve it for investigation.")
			created = False
		else:
			jd = frappe.get_doc(
				{
					"doctype": "Kandil JD Revision",
					"company": company,
					"department": department,
					"branch": anchor.branch,
					"position": position,
					"valid_from": today(),
					"job_level": "JL1",
					"purpose": "Operate equipment safely and maintain product quality. Synthetic review example.",
					"purpose_ar": "تشغيل المعدات بأمان والحفاظ على جودة المنتج. مثال تجريبي للمراجعة.",
					"responsibility_rows": [
						{
							"description": "Inspect equipment before the shift",
							"description_ar": "افحص المعدات قبل بداية الوردية",
						},
						{"description": "Maintain product quality", "description_ar": "حافظ على جودة المنتج"},
						{
							"description": "Report hazards immediately",
							"description_ar": "أبلغ عن المخاطر فوراً",
						},
						{
							"description": "Record completed production",
							"description_ar": "سجل الإنتاج المنجز",
						},
						{
							"description": "Keep the workstation clean",
							"description_ar": "حافظ على نظافة مكان العمل",
						},
					],
					"kpis": [
						{
							"indicator": "Product quality",
							"indicator_ar": "جودة المنتج",
							"kind": "Weighted",
							"weight": 60,
							"formula": "Accepted units divided by inspected units",
							"formula_ar": "الوحدات المقبولة من إجمالي الوحدات المفحوصة",
							"frequency": "Monthly",
						},
						{
							"indicator": "Safety checks",
							"indicator_ar": "فحوص السلامة",
							"kind": "Weighted",
							"weight": 40,
							"formula": "Completed checks divided by planned checks",
							"formula_ar": "الفحوص المنجزة من إجمالي الفحوص المخططة",
							"frequency": "Monthly",
						},
						{
							"indicator": "Hazard observations",
							"indicator_ar": "ملاحظات المخاطر",
							"kind": "Monitoring",
							"weight": 0,
							"formula": "Record observations for follow-up",
							"formula_ar": "تسجيل الملاحظات للمتابعة",
							"frequency": "Weekly",
						},
					],
					"competencies": [
						{
							"competency": "Safety awareness",
							"competency_ar": "الوعي بالسلامة",
							"required_level": "2",
							"competency_group": "Operational",
							"behavior": "Identify hazards before starting work",
							"behavior_ar": "تحديد المخاطر قبل بدء العمل",
							"measure": "Supervisor observation",
							"measure_ar": "ملاحظة المشرف",
						}
					],
					"authorities": [
						{
							"decision": "Unsafe equipment",
							"decision_ar": "المعدات غير الآمنة",
							"authority_level": "Stop",
						}
					],
					"certifications": "Safety training certificate",
					"certifications_ar": "شهادة تدريب السلامة",
					"working_conditions": "Moving machinery; stop and report unsafe conditions.",
					"working_conditions_ar": "معدات متحركة؛ أوقف العمل وأبلغ عن أي ظروف غير آمنة.",
					"qualifications": "Relevant practical training",
					"qualifications_ar": "تدريب عملي مناسب",
				}
			).insert(set_name=name)
			frappe.set_user(email)
			approve_revision("Kandil JD Revision", jd.name, str(jd.modified))
			frappe.set_user("Administrator")
			created = True
		data["docs"]["jd"] = jd.name
		# Stage privately first; publish metadata only after the fixture commits.
		fd = os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
		with os.fdopen(fd, "w") as stream:
			json.dump(data, stream, ensure_ascii=False, indent=2)
			stream.write("\n")
			stream.flush()
			os.fsync(stream.fileno())
		frappe.db.commit()
		os.replace(pending, path)
		os.chmod(path, 0o600)
		return {
			"status": "ready",
			"created": created,
			"doctype": "Kandil JD Revision",
			"name": jd.name,
			"credentials_saved_privately": True,
		}
	except Exception:
		frappe.db.rollback()
		raise
	finally:
		frappe.set_user("Administrator")


def install_csv():
	"""One persistent synthetic draft and literal CSV for ordinary browser review."""
	import csv
	from io import StringIO

	if (
		frappe.local.site != "kandil-parity.localhost"
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
		or not all(
			cint(frappe.conf.get(key))
			for key in [
				"allow_tests",
				"mute_emails",
				"kandil_foundation_enabled",
				"kandil_parity_enabled",
				"kandil_pilot_enabled",
			]
		)
	):
		raise RuntimeError("CSV review fixture requires the isolated muted parity CLI site.")
	path = Path(frappe.get_site_path("private", "kandil-review.json"))
	data = json.loads(path.read_text())
	company, department, position = data["company"], data["department"], data["positions"][0]
	reviewer = data["credentials"]["organization"]["email"]
	if data.get("site") != frappe.local.site or "TEST" not in (
		frappe.db.get_value("Company", company, "company_name") or ""
	):
		raise RuntimeError("Existing synthetic review metadata is required.")
	anchor = frappe.get_doc("Kandil Position", position)
	if (
		anchor.company != company
		or anchor.department != department
		or not position.startswith(data["prefix"])
	):
		raise RuntimeError("Review Position scope does not match.")
	name = data.get("docs", {}).get("import") or data["prefix"] + "-CSV-REVIEW"
	stream = StringIO(newline="")
	writer = csv.writer(stream)
	writer.writerow(
		["position_code", "title", "title_ar", "department", "branch", "designation", "structural"]
	)
	writer.writerow(
		[
			data["prefix"] + "-CSV-PREVIEW",
			"CSV Review Position",
			"منصب تجريبي لاستيراد CSV",
			department,
			anchor.branch or "",
			anchor.designation,
			1,
		]
	)
	sample = stream.getvalue()
	try:
		frappe.set_user(reviewer)
		if frappe.db.exists("Kandil Organization Import", name):
			doc = frappe.get_doc("Kandil Organization Import", name)
			if (
				doc.owner != reviewer
				or doc.company != company
				or doc.import_kind != "Positions"
				or doc.status != "Draft"
			):
				raise RuntimeError("Existing CSV review record changed; preserve it.")
			created = False
		else:
			doc = frappe.get_doc(
				{
					"doctype": "Kandil Organization Import",
					"company": company,
					"import_kind": "Positions",
					"baseline_reference": "Synthetic CSV browser-review fixture",
					"rows_json": "[]",
				}
			).insert(set_name=name)
			created = True
		# Reload metadata before its narrow update, retaining any other fixture keys.
		latest = json.loads(path.read_text())
		latest.setdefault("docs", {})["import"] = doc.name
		latest["csv_sample"] = sample
		pending = path.with_name(path.name + ".csv-pending")
		fd = os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
		with os.fdopen(fd, "w") as output:
			json.dump(latest, output, ensure_ascii=False, indent=2)
			output.write("\n")
			output.flush()
			os.fsync(output.fileno())
		frappe.db.commit()
		os.replace(pending, path)
		os.chmod(path, 0o600)
		return {"status": "ready", "created": created, "name": doc.name, "csv_sample": sample}
	except Exception:
		frappe.db.rollback()
		raise
	finally:
		frappe.set_user("Administrator")
