"""Two-company/shared-recipient contention on independent native connections.

CLI parity-only; committed UUID fixtures are removed in finally. Each delivery
is its own transaction, matching process_pending. This is a bounded correctness
probe, not sustained load or a claim that every cross-company lock is deadlock-free.
"""

import hashlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import frappe
from frappe.utils import today

from kandil_hr.foundation import outbox, outbox_access
from kandil_hr.foundation.concurrency_runner import _connection, _guard


def run():
	_guard()
	companies = frappe.get_all("Company", filters={"company_name": ["like", "%TEST%"]}, pluck="name", limit=2)
	if len(companies) != 2:
		raise RuntimeError("Two synthetic TEST companies are required")
	site, sites_path = frappe.local.site, str(Path(frappe.local.sites_path).resolve())
	user = "outbox-companies-" + uuid.uuid4().hex + "@example.invalid"
	references, checks = [], []
	before_mail = frappe.db.count("Email Queue")
	try:
		frappe.get_doc(
			dict(
				doctype="User",
				email=user,
				first_name="Synthetic shared recipient",
				enabled=1,
				send_welcome_email=0,
				user_type="System User",
				roles=[dict(role="Kandil Recruiter")],
			)
		).insert(ignore_permissions=True)
		names = []
		for index, company in enumerate(sorted(companies)):
			frappe.get_doc(
				dict(
					doctype="Kandil Access Grant",
					company=company,
					user=user,
					valid_from=today(),
					can_manage_recruitment=0,
					reason="Synthetic shared-recipient company proof",
				)
			).insert(ignore_permissions=True)
			doc = frappe.get_doc(
				dict(
					doctype="Kandil Structure Change",
					company=company,
					effective_on=today(),
					reason="Synthetic shared-recipient contention",
					changes_json='[{"action":"Create","title":"Synthetic unapplied"}]',
				)
			).insert(ignore_permissions=True)
			references.append(doc.name)
			names.append(
				outbox.enqueue(
					user + str(index),
					user,
					"Synthetic cross-company result",
					reference_doctype=doc.doctype,
					reference_name=doc.name,
				)
			)
		frappe.db.commit()
		barrier = Barrier(8, timeout=20)

		def worker(index):
			# Both company groups share one User row. Every worker starts with its
			# own old repeatable-read snapshot before attempting domain locks.
			frappe.db.sql("SELECT COUNT(*) FROM `tabKandil Notification Outbox`")
			connection = frappe.db.sql("SELECT CONNECTION_ID()")[0][0]
			barrier.wait()
			return connection, outbox.deliver(names[index % 2])

		with ThreadPoolExecutor(max_workers=8) as pool:
			futures = [pool.submit(_connection, site, sites_path, lambda i=i: worker(i)) for i in range(8)]
			results = [future.result(timeout=45) for future in futures]
		frappe.db.rollback()
		assert len({row[0] for row in results}) == 8
		assert all(row[1] == "Delivered locally" for row in results)
		checks.append(
			dict(test="eight_independent_workers_two_companies_one_recipient", status="PASS", workers=8)
		)
		rows = [frappe.get_doc("Kandil Notification Outbox", name) for name in names]
		assert all(row.status == "Delivered locally" and row.attempts == 1 for row in rows)
		assert len({row.notification_log for row in rows}) == 2
		assert frappe.db.count("Notification Log", {"for_user": user}) == 2
		checks.append(dict(test="one_local_receipt_per_company_reference", status="PASS", receipts=2))
		assert frappe.db.count("Email Queue") == before_mail
		checks.append(dict(test="no_email_queue_effect", status="PASS"))
	finally:
		frappe.db.rollback()
		frappe.set_user("Administrator")
		for doctype, filters in (
			("Notification Log", {"for_user": user}),
			("Kandil Notification Outbox", {"recipient": user}),
			("Kandil Access Grant", {"user": user}),
			("Kandil Security Event", {"target_user": user}),
		):
			frappe.db.delete(doctype, filters)
		for name in references:
			frappe.db.delete("Version", {"ref_doctype": "Kandil Structure Change", "docname": name})
			frappe.db.delete("Kandil Structure Change", {"name": name})
		if frappe.db.exists("User", user):
			frappe.delete_doc("User", user, ignore_permissions=True, force=True)
		frappe.db.commit()
	assert not frappe.db.exists("User", user)
	assert not frappe.db.exists("Kandil Notification Outbox", {"recipient": user})
	assert not any(frappe.db.exists("Kandil Structure Change", name) for name in references)
	checks.append(dict(test="uuid_fixture_cleanup", status="PASS"))
	return dict(
		result="PASS",
		total=len(checks),
		tests=checks,
		source_sha256={
			str(path.relative_to(Path(__file__).parents[2])): hashlib.sha256(path.read_bytes()).hexdigest()
			for path in (Path(__file__), Path(outbox.__file__), Path(outbox_access.__file__))
		},
		limits=[
			"Independent DB connections, not HTTP",
			"Two companies and one shared recipient with eight workers",
			"Each worker delivers one row per transaction, as process_pending does",
			"No production-load or universal deadlock-freedom claim",
		],
	)
