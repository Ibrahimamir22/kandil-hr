"""Independent RR race at the notification authorization boundary; exact parity CLI.

Creates only UUID synthetic users, grants, a minimal stored approval-context
fixture, delegation and outbox. The request/step are explicitly trusted test-row
seeds, not a claim of request submission or headcount workflow execution. No
Company settings, capacities, employee records, other accounts or providers are
modified. Audit records and disabled synthetic identities are retained.
"""

import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event

import frappe

from kandil_hr.foundation import outbox
from kandil_hr.foundation.clock import today_cairo
from kandil_hr.foundation.concurrency_runner import _connection, _guard


def _race(site, sites_path, company, principal, recipient, request, name):
	held, ready = Event(), Event()

	def disable_principal():
		frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
		connection = frappe.db.sql("SELECT CONNECTION_ID()")[0][0]
		held.set()
		if not ready.wait(20):
			raise RuntimeError("Delivery did not establish an authorized old snapshot")
		doc = frappe.get_doc("User", principal)
		doc.enabled = 0
		doc.save(ignore_permissions=True)
		return connection

	def deliver():
		if not held.wait(20):
			raise RuntimeError("Revoker did not acquire Company lock")
		connection = frappe.db.sql("SELECT CONNECTION_ID()")[0][0]
		isolation = frappe.db.sql("SELECT @@tx_isolation")[0][0]
		initial = frappe.has_permission(
			"Kandil Hiring Request", "read", request, user=recipient, ignore_share_permissions=True
		)
		if not initial:
			raise AssertionError("Delegated recipient was not initially authorized")
		ready.set()
		return dict(
			connection=connection,
			isolation=isolation,
			initially_authorized=initial,
			status=outbox.deliver(name),
		)

	with ThreadPoolExecutor(max_workers=2) as pool:
		first = pool.submit(_connection, site, sites_path, disable_principal)
		second = pool.submit(_connection, site, sites_path, deliver)
		connection, result = first.result(timeout=45), second.result(timeout=45)
	assert connection != result["connection"], "Requires independent DB connections"
	return result


def run():
	_guard()
	company = frappe.db.exists("Company", "Kandil PARITY TEST A")
	if not company:
		raise RuntimeError("Canonical synthetic Company is required")
	site, sites_path = frappe.local.site, str(Path(frappe.local.sites_path).resolve())
	prefix = "outbox-authority-" + uuid.uuid4().hex
	users, grants = {}, []
	request_name = prefix + "-request"
	outbox_name = None
	before_email = frappe.db.count("Email Queue")
	result = None
	try:
		department = frappe.get_doc(
			dict(doctype="Department", department_name=prefix, company=company)
		).insert(ignore_permissions=True)
		for key, role in (
			("principal", "Kandil Approver"),
			("delegate", "Kandil Approver"),
			("requester", "Kandil Requester"),
		):
			user = prefix + "-" + key + "@example.invalid"
			users[key] = user
			frappe.get_doc(
				dict(
					doctype="User",
					email=user,
					first_name="Synthetic outbox authority",
					enabled=1,
					send_welcome_email=0,
					user_type="System User",
					roles=[dict(role=role)],
				)
			).insert(ignore_permissions=True)
			grant = frappe.get_doc(
				dict(
					doctype="Kandil Access Grant",
					company=company,
					department=department.name,
					user=user,
					valid_from=today_cairo(),
					can_manage_recruitment=1,
					reason="Synthetic outbox authority race",
				)
			).insert(ignore_permissions=True)
			grants.append(grant.name)
		# Seed just the immutable inputs consumed by permission evaluation. No
		# workflow command, capacity ledger or configuration bypass is asserted.
		request = frappe.get_doc(
			dict(
				doctype="Kandil Hiring Request",
				name=request_name,
				company=company,
				department=department.name,
				requested_by=users["requester"],
				owner=users["requester"],
				status="Pending",
				revision=1,
				route_snapshot="{}",
			)
		)
		request.db_insert()
		frappe.get_doc(
			dict(
				doctype="Kandil Approval Step",
				name=prefix + "-step",
				parent=request_name,
				parenttype=request.doctype,
				parentfield="approval_steps",
				idx=1,
				principal=users["principal"],
				authority="Department Approval",
				decision="Pending",
				step_key=uuid.uuid4().hex,
			)
		).db_insert()
		frappe.get_doc(
			dict(
				doctype="Kandil Delegation",
				company=company,
				department=department.name,
				from_user=users["principal"],
				to_user=users["delegate"],
				from_date=today_cairo(),
				to_date=today_cairo(),
				reason="Synthetic process-scoped authority",
				process_scope="APPROVALS",
			)
		).insert(ignore_permissions=True)
		outbox_name = outbox.enqueue(
			prefix,
			users["delegate"],
			"Synthetic delegated notice",
			reference_doctype=request.doctype,
			reference_name=request_name,
		)
		frappe.db.commit()
		result = _race(
			site, sites_path, company, users["principal"], users["delegate"], request_name, outbox_name
		)
		frappe.db.rollback()
		row = frappe.get_doc("Kandil Notification Outbox", outbox_name)
		assert result["isolation"] == "REPEATABLE-READ"
		assert result["status"] == row.status == "Suppressed"
		assert not row.notification_log
		assert frappe.db.count("Kandil Mail Capture", {"outbox": outbox_name}) == 0
		assert (
			frappe.db.count(
				"Notification Log", {"document_name": request_name, "for_user": users["delegate"]}
			)
			== 0
		)
		assert outbox.deliver(outbox_name) == "Suppressed"
		assert frappe.db.count("Email Queue") == before_email
	finally:
		frappe.db.rollback()
		frappe.set_user("Administrator")
		# Only this invocation's exact UUID accounts and grants; preserve audit.
		for name in grants:
			if frappe.db.exists("Kandil Access Grant", name):
				doc = frappe.get_doc("Kandil Access Grant", name)
				doc.revoked = 1
				doc.save(ignore_permissions=True)
		for user in users.values():
			if frappe.db.exists("User", user):
				doc = frappe.get_doc("User", user)
				doc.enabled = 0
				doc.save(ignore_permissions=True)
		frappe.db.commit()
	assert result is not None
	assert all(not frappe.db.get_value("User", user, "enabled") for user in users.values())
	return dict(
		result="PASS",
		total=1,
		tests=[
			dict(
				test="principal_disabled_after_authorized_snapshot_before_delivery",
				status="PASS",
				connections=2,
				isolation=result["isolation"],
				initially_authorized=True,
				capture_count=0,
				notification_count=0,
				terminal_replay="Suppressed",
			)
		],
		cleanup="Exact UUID users disabled and grants revoked; synthetic audit retained",
		retained_request=request_name,
		limits=[
			"Native independent connections, not HTTP",
			"Trusted approval-context seed; no request/headcount workflow claim",
			"No provider calls or other fixture-account mutations",
		],
	)
