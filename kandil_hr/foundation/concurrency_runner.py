"""Independent-connection local outbox proof, for an exclusive synthetic DB slot.

Run with bench --site kandil-parity.localhost execute
kandil_hr.foundation.concurrency_runner.run

Unlike the rollback-only unit suite, this commits one synthetic user and a few
notifications so independent transactions can contend, then removes only this
run's fixtures. No upstream code or delivery adapter is patched. No email is
sent. The entry point is deliberately not whitelisted and rejects HTTP contexts.
"""

import hashlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier, Event

import frappe

from kandil_hr.foundation import outbox


def _guard():
	if (
		frappe.local.site != "kandil-parity.localhost"
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
		or not all(
			frappe.conf.get(key)
			for key in (
				"allow_tests",
				"kandil_pilot_enabled",
				"kandil_foundation_enabled",
				"kandil_parity_enabled",
			)
		)
	):
		raise RuntimeError("Outbox concurrency checks require the isolated parity CLI site")


def _connection(site, sites_path, action):
	"""Thread-local Frappe context and an independent MariaDB connection."""
	frappe.init(site=site, sites_path=sites_path)
	frappe.connect()
	frappe.set_user("Administrator")
	try:
		_guard()
		result = action()
		frappe.db.commit()
		return result
	finally:
		frappe.db.rollback()
		frappe.destroy()


def _parallel(site, sites_path, action, workers=8):
	barrier = Barrier(workers, timeout=20)

	def transaction():
		# Deliberately establish the repeatable-read snapshot BEFORE the race.
		frappe.db.sql("SELECT COUNT(*) FROM `tabKandil Notification Outbox`")
		connection_id = frappe.db.sql("SELECT CONNECTION_ID()")[0][0]
		barrier.wait()
		return connection_id, action()

	with ThreadPoolExecutor(max_workers=workers) as pool:
		futures = [pool.submit(_connection, site, sites_path, transaction) for _ in range(workers)]
		results = [future.result(timeout=45) for future in futures]
	if len({connection_id for connection_id, _ in results}) != workers:
		raise AssertionError("Race did not use independent database connections")
	return [value for _, value in results]


def _fresh():
	# Root connection must not reuse its pre-worker repeatable-read snapshot.
	frappe.db.rollback()


def run():
	_guard()
	site = frappe.local.site
	sites_path = str(Path(frappe.local.sites_path).resolve())
	token = uuid.uuid4().hex
	user = "outbox-race-" + token + "@example.invalid"
	checks = []

	def check(name, condition):
		checks.append({"test": name, "status": "PASS" if condition else "FAIL"})
		if not condition:
			raise AssertionError(name)

	before_mail = frappe.db.count("Email Queue")
	try:
		frappe.get_doc(
			dict(
				doctype="User",
				email=user,
				first_name="Synthetic outbox race",
				enabled=1,
				send_welcome_email=0,
				user_type="System User",
				roles=[dict(role="Kandil Recruiter")],
			)
		).insert(ignore_permissions=True)
		frappe.db.commit()
		key = "outbox-race-" + token
		names = _parallel(site, sites_path, lambda: outbox.enqueue(key, user, "Synthetic race"))
		_fresh()
		check(
			"eight_snapshot_transactions_enqueue_one_identity",
			len(set(names)) == 1 and frappe.db.count("Kandil Notification Outbox", {"recipient": user}) == 1,
		)
		statuses = _parallel(site, sites_path, lambda: outbox.deliver(names[0]))
		_fresh()
		row = frappe.get_doc("Kandil Notification Outbox", names[0])
		check(
			"eight_workers_deliver_once",
			statuses == ["Delivered locally"] * 8
			and row.attempts == 1
			and bool(row.notification_log)
			and frappe.db.count("Notification Log", {"for_user": user}) == 1,
		)

		# A failed worker created a receipt but loses its entire transaction. The
		# competing worker began its snapshot before rollback and must complete once.
		second = outbox.enqueue(key + "-rollback", user, "Synthetic rollback race")
		frappe.db.commit()
		receipt_created, contender_ready = Event(), Event()

		def failed_worker():
			try:
				outbox.deliver(second)
				receipt_created.set()
				if not contender_ready.wait(20):
					raise RuntimeError("Competing worker did not start")
				# Simulate failure after receipt insertion and status update, before commit.
				frappe.db.rollback()
				return "Rolled back"
			finally:
				receipt_created.set()

		def successful_worker():
			frappe.db.sql("SELECT COUNT(*) FROM `tabKandil Notification Outbox`")
			if not receipt_created.wait(20):
				raise RuntimeError("Receipt worker did not start")
			contender_ready.set()
			return outbox.deliver(second)

		with ThreadPoolExecutor(max_workers=2) as pool:
			failed = pool.submit(_connection, site, sites_path, failed_worker)
			success = pool.submit(_connection, site, sites_path, successful_worker)
			results = [failed.result(timeout=45), success.result(timeout=45)]
		_fresh()
		row = frappe.get_doc("Kandil Notification Outbox", second)
		check(
			"rollback_after_receipt_allows_one_competing_delivery",
			results == ["Rolled back", "Delivered locally"]
			and row.attempts == 1
			and bool(row.notification_log)
			and frappe.db.count("Notification Log", {"for_user": user}) == 2,
		)
		check("no_email_queue_side_effects", frappe.db.count("Email Queue") == before_mail)
	finally:
		# Only this UUID-owned synthetic fixture. No broad delete or real records.
		frappe.db.rollback()
		frappe.set_user("Administrator")
		frappe.db.delete("Notification Log", {"for_user": user})
		frappe.db.delete("Kandil Notification Outbox", {"recipient": user})
		frappe.db.delete("Kandil Security Event", {"target_user": user})
		if frappe.db.exists("User", user):
			frappe.delete_doc("User", user, ignore_permissions=True, force=True)
		frappe.db.commit()
	check(
		"synthetic_fixtures_removed",
		not frappe.db.exists("User", user)
		and not frappe.db.exists("Kandil Notification Outbox", {"recipient": user})
		and not frappe.db.exists("Notification Log", {"for_user": user}),
	)
	return {
		"result": "PASS",
		"workers": 8,
		"tests": checks,
		"total": len(checks),
		"source_sha256": {
			path.name: hashlib.sha256(path.read_bytes()).hexdigest()
			for path in (Path(__file__), Path(outbox.__file__))
		},
		"limits": [
			"Independent native transactions, not HTTP authentication",
			"Local Notification Log delivery only; no external delivery adapter",
			"Short deterministic contention probe, not sustained production capacity proof",
		],
	}
