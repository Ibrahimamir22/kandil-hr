"""Independent RR-snapshot probes for native mapped-target rename/delete guards.

CLI-only synthetic UUID fixtures; commits fixture mappings on a separate connection
then cleans every created row. Does not exercise production data or email.
"""

import hashlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timezone
from pathlib import Path
from threading import Event

import frappe

from kandil_hr.organization import api, codes
from kandil_hr.organization.concurrency_tests import guard


def run():
	guard()
	site = frappe.local.site
	sites_path = str(Path(frappe.local.sites_path).resolve())
	prefix = "CODE-RR-" + uuid.uuid4().hex[:12]
	company = frappe.db.get_value("Company", {"company_name": ["like", "%TEST%"]}, "name")
	if not company:
		raise RuntimeError("Synthetic TEST company required")
	targets, batches, checks = [], [], []
	try:
		for kind, target_dt, title_field in [
			("Job", "Designation", "designation_name"),
			("Unit", "Department", "department_name"),
		]:
			for action in ["rename", "delete"]:
				title = prefix + "-" + kind + "-" + action
				data = dict(doctype=target_dt, **{title_field: title})
				if kind == "Unit":
					data["company"] = company
				target = frappe.get_doc(data).insert()
				targets.append((target_dt, target.name))
				batch = frappe.get_doc(
					dict(
						doctype="Kandil Organization Import",
						company=company,
						import_kind=kind + "s",
						rows_json="[]",
						baseline_reference=prefix,
					)
				).insert()
				batches.append(batch.name)
				frappe.db.commit()
				snapshot_ready, mapping_committed = Event(), Event()

				def reader():
					frappe.init(site=site, sites_path=sites_path)
					frappe.connect()
					frappe.set_user("Administrator")
					try:
						connection = frappe.db.sql("SELECT CONNECTION_ID()")[0][0]
						isolation = frappe.db.sql("SELECT @@tx_isolation")[0][0]
						assert not frappe.db.exists(
							"Kandil Organization Code",
							{"target_doctype": target_dt, "target_name": target.name},
						)
						snapshot_ready.set()
						if not mapping_committed.wait(25):
							raise RuntimeError("Mapping writer did not commit")
						# Prove the old consistent snapshot still misses the committed map.
						assert not frappe.db.exists(
							"Kandil Organization Code",
							{"target_doctype": target_dt, "target_name": target.name},
						)
						try:
							if action == "rename":
								frappe.rename_doc(target_dt, target.name, title + "-renamed")
							else:
								frappe.delete_doc(target_dt, target.name)
						except frappe.ValidationError as error:
							assert "preserved external code" in str(error), str(error)
							frappe.db.rollback()
							return dict(connection=connection, isolation=isolation, outcome="denied")
						raise AssertionError("Native mapped target mutation escaped current-read guard")
					finally:
						frappe.db.rollback()
						frappe.destroy()

				with ThreadPoolExecutor(max_workers=1) as pool:
					future = pool.submit(reader)
					if not snapshot_ready.wait(25):
						raise RuntimeError("Reader did not establish old snapshot")
					writer_connection = frappe.db.sql("SELECT CONNECTION_ID()")[0][0]
					# Trusted fixture insertion uses the native mapping controller; reviewed
					# import authority itself has separate ordinary-user acceptance tests.
					with api.transition():
						codes.register(company, kind, title, target.name, title, batch.name)
					frappe.db.commit()
					mapping_committed.set()
					result = future.result(timeout=35)
				assert result["connection"] != writer_connection and result["isolation"] == "REPEATABLE-READ"
				assert frappe.db.exists(target_dt, target.name)
				assert not frappe.db.exists(target_dt, title + "-renamed")
				checks.append(
					dict(
						test=kind.lower()
						+ "_"
						+ action
						+ "_denied_after_mapping_commits_beyond_old_snapshot",
						status="PASS",
						independent_connections=2,
						isolation=result["isolation"],
					)
				)
	finally:
		frappe.db.rollback()
		for target_dt, name in targets:
			frappe.db.delete("Kandil Organization Code", {"target_doctype": target_dt, "target_name": name})
		for name in batches:
			frappe.db.delete("Kandil Organization Import", {"name": name})
		for target_dt, name in reversed(targets):
			frappe.delete_doc(target_dt, name, ignore_permissions=True)
		frappe.db.commit()
	return dict(
		suite="organization-code-current-target-guard",
		site=site,
		checks=checks,
		passed=len(checks),
		synthetic_fixtures_cleaned=True,
		checked_at=datetime.now(UTC).isoformat(),
		site_timezone=frappe.utils.get_system_timezone(),
		source_hashes={
			name: hashlib.sha256((Path(__file__).resolve().parents[2] / name).read_bytes()).hexdigest()
			for name in [
				"kandil_hr/organization/codes.py",
				"kandil_hr/organization/code_guard_tests.py",
				"kandil_hr/hooks.py",
			]
		},
		limitations=[
			"Deterministically establishes stale RR snapshot before a separate mapping commit; not a sustained concurrency load test.",
			"Mapping insertion uses a trusted synthetic fixture; ordinary-user reviewed import authorization is verified separately.",
			"Conflicting cross-company/global-master operations may be selected as database deadlock victims and must retry the whole transaction.",
		],
	)
