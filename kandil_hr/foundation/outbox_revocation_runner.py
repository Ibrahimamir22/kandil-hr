"""Independent-connection in-flight recipient revocation proof; parity CLI only.

Commits only UUID synthetic User/grant/StructureChange/outbox fixtures, cleans
those records explicitly. A revoker holds Company while delivery establishes an
old authorized RR snapshot; after revocation commits, delivery must suppress.
"""

import hashlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event

import frappe
from frappe.utils import today

from kandil_hr.foundation import outbox, outbox_access, security
from kandil_hr.foundation.concurrency_runner import _connection, _guard


def race(site, sites_path, company, user, grant, reference, name, change):
	held, ready = Event(), Event()

	def revoke():
		frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
		connection = frappe.db.sql("SELECT CONNECTION_ID()")[0][0]
		held.set()
		if not ready.wait(20):
			raise RuntimeError("Delivery did not establish its old snapshot")
		if change == "grant":
			doc = frappe.get_doc("Kandil Access Grant", grant)
			doc.revoked = 1
		else:
			doc = frappe.get_doc("User", user)
			if change == "disabled":
				doc.enabled = 0
			else:
				doc.set("roles", [row for row in doc.roles if row.role != "Kandil Recruiter"])
		doc.save(ignore_permissions=True)
		return connection

	def deliver():
		if not held.wait(20):
			raise RuntimeError("Revoker did not acquire Company")
		connection = frappe.db.sql("SELECT CONNECTION_ID()")[0][0]
		isolation = frappe.db.sql("SELECT @@tx_isolation")[0][0]
		initial = frappe.has_permission("Kandil Structure Change", "read", reference, user=user)
		if not initial or not security.has_scope(user, company):
			raise AssertionError("Delivery fixture was not initially authorized")
		ready.set()
		status = outbox.deliver(name)
		return dict(connection=connection, isolation=isolation, initially_authorized=initial, status=status)

	with ThreadPoolExecutor(max_workers=2) as pool:
		f1 = pool.submit(_connection, site, sites_path, revoke)
		f2 = pool.submit(_connection, site, sites_path, deliver)
		connection, result = f1.result(timeout=45), f2.result(timeout=45)
	if connection == result["connection"]:
		raise AssertionError("Not independent connections")
	return result


def run():
	_guard()
	site, sites_path = frappe.local.site, str(Path(frappe.local.sites_path).resolve())
	company = frappe.db.get_value("Company", {"company_name": ["like", "%TEST%"]}, "name")
	if not company:
		raise RuntimeError("A synthetic TEST Company is required")
	users, references, checks = [], [], []
	before_mail = frappe.db.count("Email Queue")
	try:
		for change in ("grant", "disabled", "role"):
			user = "outbox-revocation-" + uuid.uuid4().hex + "@example.invalid"
			users.append(user)
			frappe.get_doc(
				dict(
					doctype="User",
					email=user,
					first_name="Synthetic delivery revocation",
					enabled=1,
					send_welcome_email=0,
					user_type="System User",
					roles=[dict(role="Kandil Recruiter")],
				)
			).insert(ignore_permissions=True)
			grant = frappe.get_doc(
				dict(
					doctype="Kandil Access Grant",
					company=company,
					user=user,
					valid_from=today(),
					can_manage_recruitment=1,
					reason="Synthetic delivery revocation proof",
				)
			).insert(ignore_permissions=True)
			reference = frappe.get_doc(
				dict(
					doctype="Kandil Structure Change",
					company=company,
					effective_on=today(),
					reason="Synthetic delivery revocation",
					changes_json='[ {"action":"Create","position_code":"SYNTHETIC-UNAPPLIED","title":"Synthetic unapplied change"} ]',
				)
			).insert(ignore_permissions=True)
			references.append(reference.name)
			name = outbox.enqueue(
				user,
				user,
				"Synthetic private result",
				reference_doctype=reference.doctype,
				reference_name=reference.name,
			)
			frappe.db.commit()
			result = race(site, sites_path, company, user, grant.name, reference.name, name, change)
			frappe.db.rollback()
			row = frappe.get_doc("Kandil Notification Outbox", name)
			assert result["isolation"] == "REPEATABLE-READ" and result["status"] == row.status == "Suppressed"
			assert not row.notification_log and not frappe.db.count("Notification Log", {"for_user": user})
			assert row.attempts == 1
			assert outbox.deliver(name) == "Suppressed"
			frappe.db.rollback()
			checks.append(
				dict(
					test=change + "_revoked_while_delivery_waits",
					status="PASS",
					connections=2,
					isolation=result["isolation"],
					initially_authorized=True,
					notification_count=0,
					terminal_replay="Suppressed",
				)
			)
		assert frappe.db.count("Email Queue") == before_mail
		checks.append(dict(test="no_email_queue_effect", status="PASS"))
	finally:
		frappe.db.rollback()
		frappe.set_user("Administrator")
		for user in users:
			frappe.db.delete("Notification Log", {"for_user": user})
			frappe.db.delete("Kandil Notification Outbox", {"recipient": user})
			frappe.db.delete("Kandil Access Grant", {"user": user})
			frappe.db.delete("Kandil Security Event", {"target_user": user})
			if frappe.db.exists("User", user):
				frappe.delete_doc("User", user, ignore_permissions=True, force=True)
		for name in references:
			frappe.db.delete("Version", {"ref_doctype": "Kandil Structure Change", "docname": name})
			frappe.db.delete("Kandil Structure Change", {"name": name})
		frappe.db.commit()
	assert not any(
		frappe.db.exists("User", user) or frappe.db.exists("Kandil Notification Outbox", {"recipient": user})
		for user in users
	)
	assert not any(frappe.db.exists("Kandil Structure Change", name) for name in references)
	checks.append(dict(test="uuid_fixture_cleanup", status="PASS"))
	return dict(
		result="PASS",
		total=len(checks),
		tests=checks,
		source_sha256={
			path.name: hashlib.sha256(path.read_bytes()).hexdigest()
			for path in (Path(__file__), Path(outbox.__file__), Path(outbox_access.__file__))
		},
		limits=[
			"Native independent DB connections, not HTTP",
			"Revocation wins before authorization locks; already committed notifications are not retrospectively erased",
			"No external adapter or production load claim",
		],
	)
