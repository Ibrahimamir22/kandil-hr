"""Bench-only synthetic fixture for independent-connection HTTP race tests.

Never whitelisted. Requires Administrator, exact disposable parity site, explicit
allow_tests and all feature flags. Passwords live only in a mode-0600 private file.
Cleanup cancels test requests, reconciles the ledger and disables test accounts;
immutable synthetic audit records remain available for inspection.
"""

import json
import os
import re
import secrets
from pathlib import Path

import frappe
from frappe.utils import today
from frappe.utils.password import update_password

from kandil_hr.organization.api import transition
from kandil_hr.recruitment import api
from kandil_hr.recruitment.models import guard as feature_guard


def guard(run_id):
	feature_guard()
	if (
		frappe.local.site != "kandil-parity.localhost"
		or not frappe.conf.get("allow_tests")
		or frappe.session.user != "Administrator"
	):
		raise RuntimeError("Synthetic concurrency fixture is restricted to the opted-in parity Administrator")
	if not re.fullmatch(r"[a-f0-9]{12}", run_id):
		raise ValueError("Use a fresh twelve-character hexadecimal test run identifier")


def path_for(run_id):
	return Path(frappe.get_site_path("private", f"kandil-concurrency-{run_id}.json"))


def persist(path, payload):
	path.parent.mkdir(parents=True, exist_ok=True)
	fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
	try:
		os.fchmod(fd, 0o600)
		with os.fdopen(fd, "w") as handle:
			json.dump(payload, handle, default=str)
	except Exception:
		raise


def load(run_id):
	guard(run_id)
	data = json.loads(path_for(run_id).read_text())
	if data["run_id"] != run_id or not data["company"].startswith("Kandil CONCURRENCY TEST "):
		raise RuntimeError("Fixture identity mismatch")
	return data


def insert(doctype, **values):
	return frappe.get_doc(dict(doctype=doctype, **values)).insert(ignore_permissions=True)


def prepare(run_id):
	guard(run_id)
	path = path_for(run_id)
	if path.exists():
		raise RuntimeError("Concurrency run already exists; use a new identifier")
	prefix = "CONC-" + run_id
	company = insert(
		"Company",
		company_name="Kandil CONCURRENCY TEST " + run_id,
		abbr="C" + run_id[:4],
		default_currency="EGP",
		country="Egypt",
	).name
	department = insert("Department", department_name=prefix, company=company).name
	designation = insert("Designation", designation_name=prefix).name
	branch = insert("Branch", branch=prefix).name
	users = {}
	for key, roles in {
		"requester": ["Kandil Requester"],
		"manager": ["Kandil Approver"],
		"hr": ["Kandil Recruiter"],
		"sector": ["Kandil Sector Approver"],
	}.items():
		email = prefix.lower() + "-" + key + "@example.invalid"
		password = secrets.token_urlsafe(36)
		insert(
			"User",
			email=email,
			first_name=prefix + " " + key,
			enabled=1,
			send_welcome_email=0,
			user_type="System User",
			roles=[{"role": r} for r in roles],
		)
		update_password(email, password, logout_all_sessions=True)
		users[key] = dict(email=email, password=password)
		insert(
			"Kandil Access Grant",
			user=email,
			company=company,
			department=department,
			valid_from=today(),
			reason="Synthetic HTTP concurrency fixture",
			can_manage_recruitment=1,
			can_view_sensitive=1,
		)
	employee = insert(
		"Employee",
		first_name=prefix,
		gender="Male",
		date_of_birth="1990-01-01",
		date_of_joining=today(),
		company=company,
		department=department,
		designation=designation,
		status="Active",
		user_id=users["manager"]["email"],
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
		headcount_mode="Block",
	)
	with transition():
		head = insert(
			"Kandil Position",
			company=company,
			department=department,
			designation=designation,
			position_code=prefix + "-HEAD",
			title="Synthetic concurrency manager",
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
			title="Synthetic concurrency operator",
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
		capacity = insert(
			"Kandil Capacity",
			company=company,
			department=department,
			branch=branch,
			designation=designation,
			position=position.name,
			structural=5,
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
	requests = []
	frappe.set_user(users["requester"]["email"])
	try:
		for i in range(20):
			doc = frappe.get_doc(
				dict(
					doctype="Kandil Hiring Request",
					company=company,
					department=department,
					title=f"{prefix} request {i + 1}",
					requested_position=position.name,
					revision=1,
					requested_priority="Normal",
					need_reason="Expansion",
					exception_reason="Synthetic BLOCK contention probe",
					lines=[dict(capacity=capacity.name, requested_qty=1)],
				)
			).insert()
			requests.append(dict(name=doc.name, modified=str(doc.modified)))
	finally:
		frappe.set_user("Administrator")
	data = dict(
		run_id=run_id,
		company=company,
		department=department,
		capacity=capacity.name,
		users=users,
		requests=requests,
		cleaned=False,
	)
	persist(path, data)
	frappe.db.commit()  # Required: separate HTTP connections must see committed synthetic fixtures.
	return dict(run_id=run_id, prepared_requests=20, structural=5, credentials="private-file-only")


def inspect(run_id):
	data = load(run_id)
	requests = [frappe.get_doc("Kandil Hiring Request", r["name"]) for r in data["requests"]]
	cap = frappe.get_doc("Kandil Capacity", data["capacity"])
	if cap.company != data["company"] or any(d.company != data["company"] for d in requests):
		raise RuntimeError("Fixture scope mismatch")
	counts = {}
	for dt, field in [
		("Kandil Command Receipt", "request"),
		("Kandil Request Revision", "request"),
		("Kandil Recruitment Event", "request"),
		("Kandil Notification Outbox", "reference_name"),
		("Job Opening", "custom_kandil_request"),
	]:
		counts[dt] = frappe.db.count(dt, {field: ["in", [r.name for r in requests]]})
	return dict(
		run_id=run_id,
		ledger={
			key: cap.get(key) for key in ["structural", "occupied", "reserved", "open_slots", "available"]
		},
		counts=counts,
		requests=[
			dict(
				name=d.name,
				status=d.status,
				modified=str(d.modified),
				steps=[
					dict(key=s.step_key, principal=s.principal, decision=s.decision) for s in d.approval_steps
				],
				lines=[
					dict(
						reserved=x.reserved_qty,
						approved=x.approved_qty,
						joined=x.joined_qty,
						closed=x.closed_qty,
						opening=x.job_opening,
					)
					for x in d.lines
				],
			)
			for d in requests
		],
	)


def cleanup(run_id):
	data = load(run_id)
	if not data.get("cleaned"):
		for item in data["requests"]:
			doc = frappe.get_doc("Kandil Hiring Request", item["name"])
			if doc.company != data["company"]:
				raise RuntimeError("Refusing cleanup outside the synthetic fixture company")
			if doc.status in ["Draft", "Returned", "Pending", "Approved"]:
				frappe.set_user(data["users"]["requester"]["email"])
				try:
					api.cancel_request(
						doc.name,
						command_id="cleanup-" + run_id + "-" + doc.name,
						expected_version=str(doc.modified),
						reason="Synthetic concurrency fixture cleanup",
					)
				finally:
					frappe.set_user("Administrator")
		for account in data["users"].values():
			user = frappe.get_doc("User", account["email"])
			user.enabled = 0
			user.save(ignore_permissions=True)
		data["cleaned"] = True
		for account in data["users"].values():
			account.pop("password", None)
		frappe.db.commit()
		persist(path_for(run_id), data)
	result = inspect(run_id)
	result["audit_retained"] = True
	result["accounts_disabled"] = True
	if any(result["ledger"][key] for key in ["occupied", "reserved", "open_slots"]):
		raise RuntimeError("Synthetic cleanup ledger did not reconcile to zero")
	return result
