"""CLI-only UUID mail-sink browser fixture. Private credentials; local delivery only."""

import json

import frappe

from kandil_hr.foundation import mail_capture, outbox
from kandil_hr.recruitment import browser_fixture
from kandil_hr.recruitment.concurrency_fixture import persist

PURPOSE = "hiring-request-mail-capture-browser"


def load(run_id):
	browser_fixture.guard(run_id)
	data = json.loads(browser_fixture.path_for(run_id).read_text())
	if (
		data.get("run_id") != run_id
		or data.get("company") != "Kandil BROWSER TEST " + run_id
		or data.get("purpose") != PURPOSE
		or any(
			account["email"] != f"browser-{run_id}-{key}@example.invalid"
			for key, account in data["users"].items()
		)
	):
		raise RuntimeError("Mail capture browser fixture identity mismatch")
	return data


def prepare(run_id):
	browser_fixture.guard(run_id)
	if not mail_capture.active():
		raise RuntimeError("Mail capture requires the opted-in parity site")
	browser_fixture.prepare(run_id)
	data = json.loads(browser_fixture.path_for(run_id).read_text())
	data["purpose"] = PURPOSE
	data["mail_captures"] = {}
	# Persist purpose before preparation continues so cleanup can recover a partial
	# run. The base fixture commits its own UUID company/accounts before returning.
	persist(browser_fixture.path_for(run_id), data)
	request = data["requests"]["correction"]
	for locale, key in (("en", "manager"), ("ar", "requester")):
		user = data["users"][key]["email"]
		candidates = frappe.get_all(
			"Kandil Notification Outbox",
			filters={
				"reference_doctype": mail_capture.REQUEST,
				"reference_name": request,
				"recipient": user,
				"status": "Pending",
			},
			pluck="name",
			order_by="creation asc",
			limit=1,
		)
		if not candidates:
			raise RuntimeError("The native approval fixture produced no expected pending recipient event")
		name = candidates[0]
		filters = {"for_user": user, "document_type": mail_capture.REQUEST, "document_name": request}
		before_count = frappe.db.count("Notification Log", filters)
		if outbox.deliver(name) != "Delivered locally":
			raise AssertionError("Synthetic native event did not deliver locally")
		capture = frappe.get_doc(mail_capture.DOCTYPE, {"outbox": name})
		receipt = frappe.db.get_value("Kandil Notification Outbox", name, "notification_log")
		if outbox.deliver(name) != "Delivered locally":
			raise AssertionError("Synthetic delivery replay changed status")
		capture_count = frappe.db.count(mail_capture.DOCTYPE, {"outbox": name})
		log_delta = frappe.db.count("Notification Log", filters) - before_count
		if (
			capture_count != 1
			or log_delta != 1
			or capture.status != "Captured locally"
			or receipt != frappe.db.get_value("Kandil Notification Outbox", name, "notification_log")
		):
			raise AssertionError("Synthetic delivery replay duplicated capture or notification")
		data["mail_captures"][locale] = dict(
			user_key=key,
			name=capture.name,
			outbox=name,
			request=request,
			notification_log=receipt,
			content_hash=capture.content_hash,
			capture_count=capture_count,
			notification_delta=log_delta,
			replay_status="Delivered locally",
		)
	persist(browser_fixture.path_for(run_id), data)
	frappe.db.commit()
	return dict(
		run_id=run_id,
		captures={k: v["name"] for k, v in data["mail_captures"].items()},
		site=frappe.local.site,
		credentials="private-file-only",
		provider_sent=False,
	)


def inspect(run_id):
	data = load(run_id)
	checks = {}
	for locale, expected in data["mail_captures"].items():
		doc = frappe.get_doc(mail_capture.DOCTYPE, expected["name"])
		if doc.company != data["company"] or doc.recipient != data["users"][expected["user_key"]]["email"]:
			raise RuntimeError("Synthetic capture identity mismatch")
		checks[locale] = dict(
			name=doc.name,
			status=doc.status,
			capture_count=frappe.db.count(mail_capture.DOCTYPE, {"outbox": expected["outbox"]}),
			notification_count=frappe.db.count("Notification Log", {"name": expected["notification_log"]}),
			content_unchanged=doc.content_hash == expected["content_hash"],
		)
	return dict(run_id=run_id, captures=checks, cleaned=data.get("cleaned", False), provider_sent=False)


def cleanup(run_id):
	load(run_id)
	# Cancel only the UUID fixture's requests and disable only its manifest users.
	# Retain immutable captures/history. No global deletes or settings changes.
	result = browser_fixture.cleanup(run_id)
	return dict(**result, mail_capture_state=inspect(run_id))
