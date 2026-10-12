"""Synthetic same-title company/branch fixtures for real native HTTP access proof."""

import json
import os
import secrets
import uuid
from pathlib import Path

import frappe
from frappe.utils import today

from kandil_hr.foundation.concurrency_runner import _guard


def manifest():
	_guard()
	if not frappe.conf.get("mute_emails"):
		raise RuntimeError("Scope fixture requires muted email")
	return Path(frappe.get_site_path("private", "security-scope-probe.json"))


def persist(data):
	manifest().write_text(json.dumps(data))
	os.chmod(manifest(), 0o600)


def load():
	data = json.loads(manifest().read_text())
	if data.get("site") != frappe.local.site or not data.get("prefix", "").startswith("scope-probe-"):
		raise RuntimeError("Invalid scope fixture")
	return data


def prepare():
	if manifest().exists():
		raise RuntimeError("Scope fixture exists; clean up before retry")
	companies = sorted(
		frappe.get_all("Company", filters={"company_name": ["like", "%TEST%"]}, pluck="name", limit=2)
	)
	if len(companies) != 2:
		raise RuntimeError("Two synthetic TEST companies are required")
	prefix = "scope-probe-" + uuid.uuid4().hex
	data = dict(
		site=frappe.local.site,
		prefix=prefix,
		email=prefix + "@example.invalid",
		password=secrets.token_urlsafe(24),
		title="Equal-looking position " + prefix,
		records={},
		departments=[],
		branches=[],
		files=[],
	)
	persist(data)
	frappe.get_doc(
		dict(
			doctype="User",
			email=data["email"],
			first_name="Synthetic read-only scoped recruiter",
			enabled=1,
			send_welcome_email=0,
			user_type="System User",
			new_password=data["password"],
			roles=[dict(role="Kandil Recruiter")],
		)
	).insert(ignore_permissions=True)
	job = frappe.get_doc(dict(doctype="Designation", designation_name=prefix)).insert(ignore_permissions=True)
	data["designation"] = job.name
	for company in companies:
		dept = frappe.get_doc(dict(doctype="Department", department_name=prefix, company=company)).insert(
			ignore_permissions=True
		)
		data["departments"].append(dept.name)
	from kandil_hr.organization.api import transition

	for key, index in (("A1", 0), ("A2", 0), ("B1", 1)):
		branch = frappe.get_doc(dict(doctype="Branch", branch=prefix + key)).insert(ignore_permissions=True)
		data["branches"].append(branch.name)
		with transition():
			doc = frappe.get_doc(
				dict(
					doctype="Kandil Position",
					company=companies[index],
					department=data["departments"][index],
					branch=branch.name,
					title=data["title"],
					designation=job.name,
					structural=1,
				)
			).insert(ignore_permissions=True)
		file = frappe.get_doc(
			dict(
				doctype="File",
				file_name=prefix + key + ".txt",
				is_private=1,
				attached_to_doctype=doc.doctype,
				attached_to_name=doc.name,
				content="Synthetic private marker " + prefix + key,
			)
		).insert(ignore_permissions=True)
		data["files"].append(file.name)
		data["records"][key] = dict(
			name=doc.name,
			company=doc.company,
			department=doc.department,
			branch=doc.branch,
			file_url=file.file_url,
			file_name=file.name,
		)
		persist(data)
	grant = frappe.get_doc(
		dict(
			doctype="Kandil Access Grant",
			user=data["email"],
			company=companies[0],
			branch=data["records"]["A1"]["branch"],
			valid_from=today(),
			can_manage_recruitment=0,
			reason="Synthetic read-only branch scope acceptance",
		)
	).insert(ignore_permissions=True)
	data["grant"] = grant.name
	persist(data)
	frappe.db.commit()
	return dict(positions=3, identical_titles=True, read_only_grant=True)


def revoke():
	data = load()
	doc = frappe.get_doc("Kandil Access Grant", data["grant"])
	doc.revoked = 1
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return dict(revoked=True)


def cleanup():
	data = load()
	from frappe.sessions import clear_sessions

	user = data["email"]
	if not user.startswith(data["prefix"]) or not user.endswith("@example.invalid"):
		raise RuntimeError("Refusing non-fixture cleanup")
	clear_sessions(user=user, force=True)
	for name in data["files"]:
		if frappe.db.exists("File", name):
			frappe.delete_doc("File", name, ignore_permissions=True, force=True)
	for row in data["records"].values():
		frappe.db.delete("Version", {"ref_doctype": "Kandil Position", "docname": row["name"]})
		frappe.db.delete("Kandil Position", {"name": row["name"]})
	for doctype, names in (
		("Department", data["departments"]),
		("Branch", data["branches"]),
		("Designation", [data.get("designation")]),
	):
		for name in names:
			if name and frappe.db.exists(doctype, name):
				frappe.delete_doc(doctype, name, ignore_permissions=True, force=True)
	for doctype, filters in (
		("Kandil Access Grant", {"user": user}),
		("Kandil Security Event", {"target_user": user}),
		("Activity Log", {"user": user}),
		("Notification Log", {"for_user": user}),
	):
		frappe.db.delete(doctype, filters)
	if frappe.db.exists("User", user):
		frappe.delete_doc("User", user, ignore_permissions=True, force=True)
	frappe.db.commit()
	assert not frappe.db.exists("User", user)
	assert not any(frappe.db.exists("Kandil Position", row["name"]) for row in data["records"].values())
	manifest().unlink()
	return dict(cleaned=True, private_files_removed=True)
