"""UUID-scoped native capture/revocation fixture. CLI parity only, private credentials."""

import json
import secrets
import uuid

import frappe
from frappe.utils import add_days, today
from frappe.utils.password import update_password

from kandil_hr.organization import api
from kandil_hr.recruitment import browser_fixture
from kandil_hr.recruitment.concurrency_fixture import insert, persist
from kandil_hr.recruitment.test_commands import acting_as


def load(run_id):
	browser_fixture.guard(run_id)
	data = json.loads(browser_fixture.path_for(run_id).read_text())
	if data["company"] != "Kandil BROWSER TEST " + run_id:
		raise RuntimeError("Delivery browser fixture scope mismatch")
	return data


def prepare(run_id):
	browser_fixture.guard(run_id)
	browser_fixture.prepare(run_id)
	data = load(run_id)
	for key, role, locale, scoped in (
		("hr_ar", "Kandil Recruiter", "ar", True),
		("sector_ar", "Kandil Sector Approver", "ar", True),
		("recipient", "Kandil Recruiter", "en", True),
		("outsider", "Kandil Recruiter", "en", False),
		("delegate_en", "Kandil Approver", "en", True),
		("delegate_ar", "Kandil Approver", "ar", True),
	):
		email = f"browser-{run_id}-{key}@example.invalid"
		password = secrets.token_urlsafe(36)
		insert(
			"User",
			email=email,
			first_name=f"BROWSER-{run_id} {key}",
			enabled=1,
			send_welcome_email=0,
			user_type="System User",
			language=locale,
			roles=[dict(role=role)],
		)
		update_password(email, password, logout_all_sessions=True)
		data["users"][key] = dict(email=email, password=password)
		if scoped:
			insert(
				"Kandil Access Grant",
				user=email,
				company=data["company"],
				department=data["department"],
				valid_from=today(),
				can_manage_recruitment=1,
				reason="Synthetic native document/revocation fixture",
			)
	for key in ("hr", "sector", "hr_ar", "sector_ar"):
		insert(
			"Kandil Access Grant",
			user=data["users"][key]["email"],
			company=data["company"],
			valid_from=today(),
			can_manage_recruitment=1,
			reason="Synthetic company-wide JD authoring scope",
		)
	position = frappe.db.get_value("Kandil Capacity", data["capacity"], "position")
	p = frappe.get_doc("Kandil Position", position)
	with acting_as(data["users"]["hr"]["email"]):
		jd = frappe.get_doc(
			dict(
				doctype="Kandil JD Revision",
				company=data["company"],
				department=data["department"],
				branch=p.branch,
				position=p.name,
				valid_from=today(),
				purpose="Synthetic browser document only. Operate safely.",
				purpose_ar="مستند اختبار فقط. العمل بأمان.",
				responsibility_rows=[
					dict(description="Maintain quality", description_ar="حافظ على الجودة"),
					dict(description="Report hazards", description_ar="أبلغ عن المخاطر"),
					dict(description="Follow instructions", description_ar="اتبع التعليمات"),
				],
			)
		).insert()
	with acting_as(data["users"]["sector"]["email"]):
		api.approve_revision(jd.doctype, jd.name, str(jd.modified))
		data["delegations"] = {}
		for locale in ("en", "ar"):
			grant = frappe.get_doc(
				dict(
					doctype="Kandil Delegation",
					company=data["company"],
					department=data["department"],
					from_user=data["users"]["manager"]["email"],
					to_user=data["users"]["delegate_" + locale]["email"],
					from_date=today(),
					to_date=add_days(today(), 10),
					process_scope="APPROVALS",
					reason="Synthetic native revocation " + locale,
				)
			).insert()
			data["delegations"][locale] = grant.name
	data["jd"] = jd.name
	data["purpose"] = "document-delivery-and-revocation-browser"
	persist(browser_fixture.path_for(run_id), data)
	frappe.db.commit()
	return dict(
		run_id=run_id,
		jd=jd.name,
		delegations=data["delegations"],
		credentials="private-file-only",
		site=frappe.local.site,
	)


def inspect(run_id):
	data = load(run_id)
	return dict(
		run_id=run_id,
		captures=frappe.get_all(
			"Kandil Document Delivery",
			filters={"company": data["company"]},
			fields=["name", "status", "language", "sender", "recipient", "content_hash"],
		),
		delegations=[
			dict(
				name=name,
				**frappe.db.get_value(
					"Kandil Delegation",
					name,
					["revoked", "revocation_reason", "approval_status"],
					as_dict=True,
				),
			)
			for name in data["delegations"].values()
		],
	)


def cleanup(run_id):
	data = load(run_id)
	if not data.get("cleaned"):
		with acting_as(data["users"]["sector"]["email"]):
			for name in data["delegations"].values():
				grant = frappe.get_doc("Kandil Delegation", name)
				if not grant.revoked:
					grant.revoked = 1
					grant.revocation_reason = "Synthetic browser fixture cleanup"
					grant.save()
	return browser_fixture.cleanup(run_id)
