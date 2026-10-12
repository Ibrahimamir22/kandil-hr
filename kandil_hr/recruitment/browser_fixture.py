"""Private, UUID-scoped native-browser fixture. Never whitelisted; CLI parity only."""

import json
import secrets
import uuid
from pathlib import Path

import frappe
from frappe.utils import today
from frappe.utils.password import update_password

from kandil_hr.organization.api import transition
from kandil_hr.recruitment import api
from kandil_hr.recruitment.concurrency_fixture import guard as base_guard
from kandil_hr.recruitment.concurrency_fixture import insert, persist
from kandil_hr.recruitment.test_commands import acting_as


def guard(run_id):
	base_guard(run_id)
	if getattr(frappe.local, "request", None):
		raise RuntimeError("Browser fixtures require the parity CLI")


def path_for(run_id):
	return Path(frappe.get_site_path("private", f"kandil-browser-{run_id}.json"))


def prepare(run_id):
	guard(run_id)
	path = path_for(run_id)
	if path.exists():
		raise RuntimeError("Browser fixture identifier already exists")
	prefix = "BROWSER-" + run_id
	company = insert(
		"Company",
		company_name="Kandil BROWSER TEST " + run_id,
		abbr="B" + run_id[:5],
		default_currency="EGP",
		country="Egypt",
	).name
	department = insert("Department", department_name=prefix, company=company).name
	designation = insert("Designation", designation_name=prefix).name
	branch = insert("Branch", branch=prefix).name
	users = {}
	for role, roles in {
		"requester": ["Kandil Requester"],
		"manager": ["Kandil Approver"],
		"hr": ["Kandil Recruiter"],
		"sector": ["Kandil Sector Approver"],
	}.items():
		email = f"{prefix.lower()}-{role}@example.invalid"
		password = secrets.token_urlsafe(36)
		insert(
			"User",
			email=email,
			first_name=f"{prefix} {role}",
			enabled=1,
			send_welcome_email=0,
			user_type="System User",
			language="ar" if role == "requester" else "en",
			roles=[{"role": r} for r in roles],
		)
		update_password(email, password, logout_all_sessions=True)
		users[role] = dict(email=email, password=password)
		insert(
			"Kandil Access Grant",
			user=email,
			company=company,
			department=department,
			valid_from=today(),
			reason="Synthetic native-browser QA",
			can_manage_recruitment=1,
			can_view_sensitive=1,
		)
	insert(
		"Kandil Organization Settings",
		company=company,
		hr_approver=users["hr"]["email"],
		sector_approver=users["sector"]["email"],
	)
	insert(
		"Kandil Recruitment Route",
		company=company,
		department=department,
		manager_approver=users["manager"]["email"],
		hr_approver=users["hr"]["email"],
		exception_approver=users["sector"]["email"],
		enabled=1,
		headcount_mode="Warn",
	)
	with transition():
		head = insert(
			"Kandil Position",
			company=company,
			department=department,
			designation=designation,
			position_code=prefix + "-HEAD",
			title="Synthetic browser department head",
		)
		insert(
			"Kandil Position Hierarchy",
			company=company,
			department=department,
			position=head.name,
			valid_from=today(),
			authority="Department Approval",
		)
		position = insert(
			"Kandil Position",
			company=company,
			department=department,
			branch=branch,
			designation=designation,
			position_code=prefix,
			title="Synthetic browser operator",
			structural=5,
		)
		insert(
			"Kandil Position Hierarchy",
			company=company,
			department=department,
			branch=branch,
			position=position.name,
			parent_position=head.name,
			valid_from=today(),
			authority="Department Approval",
		)
		cap = insert(
			"Kandil Capacity",
			company=company,
			department=department,
			branch=branch,
			designation=designation,
			position=position.name,
			structural=5,
		)
	employee = insert(
		"Employee",
		first_name=prefix,
		gender="Male",
		date_of_birth="1990-01-01",
		date_of_joining=today(),
		company=company,
		department=department,
		user_id=users["manager"]["email"],
		status="Active",
	)
	insert(
		"Kandil Position Assignment",
		company=company,
		department=department,
		position=head.name,
		employee=employee.name,
		user=users["manager"]["email"],
		allocation="Primary",
		valid_from=today(),
	)
	requests = {}
	with acting_as(users["requester"]["email"]):
		for kind, qty in (("correction", 4), ("shortage", 3)):
			req = frappe.get_doc(
				dict(
					doctype="Kandil Hiring Request",
					company=company,
					department=department,
					title=f"{prefix} {kind}",
					requested_position=position.name,
					need_reason="Expansion",
					revision=1,
					requested_priority="Normal",
					qualifications="Original synthetic qualification",
					lines=[dict(capacity=cap.name, requested_qty=qty)],
				)
			).insert()
			requests[kind] = req.name
		name = requests["correction"]
		api.submit_request(
			name, uuid.uuid4().hex, str(frappe.get_doc("Kandil Hiring Request", name).modified)
		)
	for role in ("manager", "hr"):
		with acting_as(users[role]["email"]):
			req = frappe.get_doc("Kandil Hiring Request", name)
			step = next(s for s in req.approval_steps if s.decision == "Pending")
			api.decide(
				name,
				"Approve",
				step.step_key,
				uuid.uuid4().hex,
				str(req.modified),
				comment="Synthetic browser fixture approval",
			)
	with acting_as(users["hr"]["email"]):
		insert(
			"Kandil HR Note",
			request=name,
			note="Synthetic confidential note retained during fields-only correction",
		)
	data = dict(
		run_id=run_id,
		company=company,
		department=department,
		capacity=cap.name,
		users=users,
		requests=requests,
		cleaned=False,
	)
	persist(path, data)
	frappe.db.commit()
	return dict(run_id=run_id, requests=requests, credentials="private-file-only")


def inspect(run_id):
	guard(run_id)
	data = json.loads(path_for(run_id).read_text())
	if data["company"] != "Kandil BROWSER TEST " + run_id:
		raise RuntimeError("Browser fixture company mismatch")
	result = {}
	for key, name in data["requests"].items():
		doc = frappe.get_doc("Kandil Hiring Request", name)
		if doc.company != data["company"]:
			raise RuntimeError("Browser request scope mismatch")
		result[key] = dict(
			name=name,
			status=doc.status,
			qualifications=doc.qualifications,
			modified=str(doc.modified),
			requested=[x.requested_qty for x in doc.lines],
			approved=[x.approved_qty for x in doc.lines],
			receipts=frappe.db.count("Kandil Command Receipt", {"request": name}),
			revisions=frappe.get_all(
				"Kandil Request Revision",
				filters={"request": name},
				fields=["name", "action", "actor", "snapshot_json"],
				order_by="creation asc",
			),
		)
	cap = frappe.get_doc("Kandil Capacity", data["capacity"])
	return dict(
		run_id=run_id,
		requests=result,
		ledger={k: cap.get(k) for k in ["structural", "occupied", "reserved", "open_slots", "available"]},
	)


def cleanup(run_id):
	guard(run_id)
	data = json.loads(path_for(run_id).read_text())
	if data["company"] != "Kandil BROWSER TEST " + run_id:
		raise RuntimeError("Browser fixture company mismatch")
	if not data.get("cleaned"):
		for name in data["requests"].values():
			with acting_as(data["users"]["hr"]["email"]):
				doc = frappe.get_doc("Kandil Hiring Request", name)
				if doc.company != data["company"]:
					raise RuntimeError("Browser fixture scope mismatch")
				if doc.status != "Cancelled":
					api.cancel_request(
						name,
						uuid.uuid4().hex,
						str(doc.modified),
						"Synthetic browser proof complete; audit retained",
					)
		for account in data["users"].values():
			user = frappe.get_doc("User", account["email"])
			user.enabled = 0
			user.save(ignore_permissions=True)
		data["cleaned"] = True
		persist(path_for(run_id), data)
		frappe.db.commit()
	result = inspect(run_id)
	if any(result["ledger"][field] for field in ("occupied", "reserved", "open_slots")):
		raise RuntimeError("Synthetic browser ledger did not reconcile")
	return dict(
		run_id=run_id,
		cleaned=True,
		disabled_users=len(data["users"]),
		ledger=result["ledger"],
		audit_retained=True,
	)
