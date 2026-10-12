"""CLI-only UUID headcount HTTP fixture; synthetic retained audit, no external mail."""

import json
import uuid

import frappe
from frappe.utils import today

from kandil_hr.organization.api import transition
from kandil_hr.recruitment import api
from kandil_hr.recruitment import browser_fixture as base
from kandil_hr.recruitment.concurrency_fixture import insert, persist
from kandil_hr.recruitment.test_commands import acting_as


def load(run_id):
	base.guard(run_id)
	data = json.loads(base.path_for(run_id).read_text())
	if data["company"] != "Kandil BROWSER TEST " + run_id:
		raise RuntimeError("Headcount fixture company mismatch")
	return data


def policy(run_id, mode):
	data = load(run_id)
	if mode not in ("Warn", "Block"):
		raise ValueError("Use Warn or Block")
	routes = frappe.get_all(
		"Kandil Recruitment Route",
		filters={"company": data["company"], "department": data["department"]},
		pluck="name",
	)
	if len(routes) != 1:
		raise RuntimeError("Expected exactly one synthetic route")
	route = frappe.get_doc("Kandil Recruitment Route", routes[0])
	route.headcount_mode = mode
	route.save(ignore_permissions=True)
	frappe.db.commit()
	return dict(mode=mode, run_id=run_id)


def prepare(run_id):
	base.guard(run_id)
	base.prepare(run_id)
	data = load(run_id)
	# Retire the base browser examples through real commands before this gate.
	for name in data["requests"].values():
		with acting_as(data["users"]["requester"]["email"]):
			doc = frappe.get_doc("Kandil Hiring Request", name)
			api.cancel_request(
				name,
				uuid.uuid4().hex,
				str(doc.modified),
				"Retire base examples for isolated headcount HTTP gate",
			)
	frappe.db.commit()
	policy(run_id, "Block")
	original = frappe.get_doc("Kandil Capacity", data["capacity"])
	parent = frappe.db.get_value(
		"Kandil Position Hierarchy", {"position": original.position}, "parent_position"
	)
	data["purpose"] = "headcount-http-and-browser"
	data["headcount_requests"] = {}
	data["headcount_capacities"] = {}
	for key, structural, quantity, pending, reason in [
		("replay", 3, 2, True, ""),
		("browser_success_en", 3, 2, True, ""),
		("browser_success_ar", 3, 2, True, ""),
		("browser_denied_en", 3, 2, True, ""),
		("browser_denied_ar", 3, 2, True, ""),
		("race", 3, 2, True, ""),
		("revision_denied", 3, 2, True, ""),
		("block_blank", 1, 3, False, ""),
		("block_valid", 1, 3, False, "Valid synthetic shortage justification"),
		("warn_short", 1, 3, False, "123456789"),
	]:
		with transition():
			position = insert(
				"Kandil Position",
				company=data["company"],
				department=data["department"],
				branch=original.branch,
				designation=original.designation,
				position_code=f"HC-{run_id}-{key}",
				title=f"Synthetic HTTP {key}",
				structural=structural,
			)
			insert(
				"Kandil Position Hierarchy",
				company=data["company"],
				department=data["department"],
				branch=original.branch,
				position=position.name,
				parent_position=parent,
				valid_from=today(),
				authority="Department Approval",
			)
			cap = insert(
				"Kandil Capacity",
				company=data["company"],
				department=data["department"],
				branch=original.branch,
				designation=original.designation,
				position=position.name,
				structural=structural,
			)
		data["headcount_capacities"][key] = cap.name
		with acting_as(data["users"]["requester"]["email"]):
			for variant, qty in [(key, quantity)] + ([("race_other", 1)] if key == "race" else []):
				doc = frappe.get_doc(
					dict(
						doctype="Kandil Hiring Request",
						company=data["company"],
						department=data["department"],
						title=f"HEADCOUNT-{run_id}-{variant}",
						requested_position=position.name,
						revision=1,
						requested_priority="Normal",
						need_reason="Expansion",
						exception_reason=reason,
						lines=[dict(capacity=cap.name, requested_qty=qty)],
					)
				).insert()
				data["requests"][variant] = doc.name
				data["headcount_requests"][variant] = doc.name
				if pending and variant == key:
					result = api.submit_request(doc.name, uuid.uuid4().hex, str(doc.modified))
					if result.get("outcome") == "denied":
						raise RuntimeError("Synthetic initial reservation unexpectedly denied")
		# Persist only completed committed cohorts so cleanup remains recoverable.
		frappe.db.commit()
		persist(base.path_for(run_id), data)
	return dict(
		run_id=run_id,
		prepared=True,
		credentials="private-file-only",
		requests=len(data["headcount_requests"]),
	)


def inspect(run_id):
	data = load(run_id)
	requests = {}
	for key, name in data.get("headcount_requests", {}).items():
		doc = frappe.get_doc("Kandil Hiring Request", name)
		if doc.company != data["company"]:
			raise RuntimeError("Refusing cross-company inspection")
		requests[key] = dict(
			name=name,
			modified=str(doc.modified),
			status=doc.status,
			revision=doc.revision,
			exception_reason=doc.exception_reason,
			lines=[
				dict(
					name=row.name,
					capacity=row.capacity,
					requested=row.requested_qty,
					proposed=row.proposed_qty,
					reserved=row.reserved_qty,
				)
				for row in doc.lines
			],
			steps=[
				dict(
					key=row.step_key, authority=row.authority, principal=row.principal, decision=row.decision
				)
				for row in doc.approval_steps
			],
			counts={
				dt: frappe.db.count(dt, {field: name})
				for dt, field in [
					("Kandil Command Receipt", "request"),
					("Kandil Command Audit", "target_name"),
					("Kandil Request Revision", "request"),
					("Kandil Recruitment Event", "request"),
					("Kandil Notification Outbox", "reference_name"),
					("Job Opening", "custom_kandil_request"),
				]
			},
		)
	capacities = {}
	for key, name in data.get("headcount_capacities", {}).items():
		cap = frappe.get_doc("Kandil Capacity", name)
		if cap.company != data["company"]:
			raise RuntimeError("Refusing cross-company capacity inspection")
		capacities[key] = {
			field: cap.get(field)
			for field in ("structural", "occupied", "reserved", "open_slots", "available")
		}
	events = []
	for row in frappe.get_all(
		"Kandil Security Event",
		filters={"target_user": data["users"]["requester"]["email"]},
		fields=["name", "action", "actor", "reference", "changed_fields", "creation"],
		order_by="creation asc",
	):
		try:
			row["payload"] = json.loads(row.pop("changed_fields") or "{}")
		except ValueError:
			continue
		events.append(row)
	return dict(run_id=run_id, requests=requests, capacities=capacities, security_events=events)


def cleanup(run_id):
	data = load(run_id)
	result = base.cleanup(run_id)
	final = inspect(run_id)
	if any(
		cap[field] for cap in final["capacities"].values() for field in ("occupied", "reserved", "open_slots")
	):
		raise RuntimeError("Headcount fixture cleanup left occupied/open/reserved capacity")
	data = load(run_id)
	for account in data["users"].values():
		account.pop("password", None)
	persist(base.path_for(run_id), data)
	return dict(
		run_id=run_id,
		cleaned=True,
		users_disabled=result["disabled_users"],
		all_fixture_ledgers_zero=True,
		immutable_audit_retained=True,
	)


def language(run_id, language):
	data = load(run_id)
	if data.get("cleaned") or language not in ("en", "ar"):
		raise ValueError("Use an active synthetic fixture and en/ar language")
	user = frappe.get_doc("User", data["users"]["requester"]["email"])
	user.language = language
	user.save(ignore_permissions=True)
	frappe.db.commit()
	return dict(run_id=run_id, language=language)
