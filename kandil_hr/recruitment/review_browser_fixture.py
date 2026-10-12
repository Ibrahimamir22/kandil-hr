"""UUID-only review view browser fixture. Private credentials; audited cleanup."""

import json
import secrets
import uuid

import frappe
from frappe.utils import today
from frappe.utils.password import update_password

from kandil_hr.recruitment import api, browser_fixture, review_views
from kandil_hr.recruitment.concurrency_fixture import insert, persist
from kandil_hr.recruitment.test_commands import acting_as


def prepare(run_id):
	browser_fixture.guard(run_id)
	browser_fixture.prepare(run_id)
	path = browser_fixture.path_for(run_id)
	data = json.loads(path.read_text())
	insert(
		"Kandil Access Grant",
		user=data["users"]["sector"]["email"],
		company=data["company"],
		valid_from=today(),
		can_manage_recruitment=1,
		reason="Synthetic company unit browser authority",
	)
	email = f"browser-{run_id}-delegate@example.invalid"
	password = secrets.token_urlsafe(36)
	insert(
		"User",
		email=email,
		first_name=f"BROWSER-{run_id} delegate",
		enabled=1,
		send_welcome_email=0,
		user_type="System User",
		language="en",
		roles=[{"role": "Kandil Approver"}],
	)
	update_password(email, password, logout_all_sessions=True)
	data["users"]["delegate"] = dict(email=email, password=password)
	insert(
		"Kandil Access Grant",
		user=email,
		company=data["company"],
		department=data["department"],
		valid_from=today(),
		can_manage_recruitment=1,
		reason="Synthetic review views browser",
	)
	insert(
		"Kandil Delegation",
		company=data["company"],
		department=data["department"],
		from_user=data["users"]["manager"]["email"],
		to_user=email,
		from_date=today(),
		to_date=today(),
		reason="Synthetic browser delegation",
	)
	with acting_as(data["users"]["requester"]["email"]):
		doc = frappe.get_doc("Kandil Hiring Request", data["requests"]["shortage"])
		doc.title = f"BROWSER-{run_id} delegated timeline"
		doc.lines[0].requested_qty = 1
		doc.save()
		api.submit_request(doc.name, uuid.uuid4().hex, str(doc.modified))
	with acting_as(data["users"]["manager"]["email"]):
		own = frappe.get_doc(
			dict(
				doctype="Kandil Hiring Request",
				company=data["company"],
				department=data["department"],
				title=f"BROWSER-{run_id} manager own request",
				requested_position=doc.requested_position,
				need_reason="Expansion",
				revision=1,
				requested_priority="Normal",
				lines=[dict(capacity=data["capacity"], requested_qty=1)],
			)
		).insert()
		data["requests"]["manager_own"] = own.name
	persist(path, data)
	frappe.db.commit()
	return dict(run_id=run_id, requests=data["requests"], credentials="private-file-only")


def inspect(run_id):
	browser_fixture.guard(run_id)
	data = json.loads(browser_fixture.path_for(run_id).read_text())
	result = browser_fixture.inspect(run_id)
	result["units"] = frappe.get_all(
		"Department",
		filters={"company": data["company"]},
		fields=["name", "department_name", "company", "disabled", "custom_kandil_change_reason", "is_group"],
	)
	result["unit_audit"] = frappe.get_all(
		"Kandil Security Event",
		filters={"actor": data["users"]["sector"]["email"], "action": "Organization unit maintained"},
		fields=["name", "action", "actor", "creation", "changed_fields", "reference"],
	)
	result["denied_unit_exists"] = bool(
		frappe.db.exists(
			"Department", {"company": data["company"], "department_name": "BROWSER-" + run_id + "-DENIED"}
		)
	)
	result["views"] = {}
	for key in ("requester", "manager", "hr", "delegate"):
		with acting_as(data["users"][key]["email"]):
			result["views"][key] = dict(
				own=review_views.my_requests(),
				scoped=frappe.get_list(
					"Kandil Hiring Request", fields=["name", "requested_by"], order_by="name asc"
				),
			)
	with acting_as(data["users"]["requester"]["email"]):
		result["timeline"] = review_views.timeline(data["requests"]["shortage"])
	return result


def cleanup(run_id):
	browser_fixture.guard(run_id)
	data = json.loads(browser_fixture.path_for(run_id).read_text())
	with acting_as(data["users"]["sector"]["email"]):
		for row in frappe.get_all(
			"Department",
			filters={"company": data["company"], "department_name": "BROWSER-" + run_id + "-UNIT"},
			fields=["name"],
		):
			doc = frappe.get_doc("Department", row.name)
			doc.disabled = 1
			doc.custom_kandil_change_reason = "Synthetic browser proof finished; unit retained disabled"
			doc.save()
	return browser_fixture.cleanup(run_id)
