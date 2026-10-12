"""Isolated native independent-connection invariant probes; commits UUID fixtures then cleans them.

CLI only, exact muted parity site; coordinate the exclusive test database slot.
"""

import hashlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier, Event

import frappe
from frappe.utils import today

from kandil_hr.organization.api import transition


def guard():
	if (
		frappe.local.site != "kandil-parity.localhost"
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
		or not all(
			frappe.conf.get(k)
			for k in [
				"allow_tests",
				"mute_emails",
				"kandil_parity_enabled",
				"kandil_foundation_enabled",
				"kandil_pilot_enabled",
			]
		)
	):
		raise RuntimeError("Organization concurrency tests require the isolated muted parity CLI site.")


def race(site, sites_path, actions):
	barrier = Barrier(len(actions), timeout=20)

	def worker(action):
		frappe.init(site=site, sites_path=sites_path)
		frappe.connect()
		frappe.set_user("Administrator")
		try:
			guard()
			# Establish an old RR snapshot before either contender takes Company.
			frappe.db.sql("SELECT COUNT(*) FROM `tabKandil Position Assignment`")
			frappe.db.sql("SELECT COUNT(*) FROM `tabKandil Position Hierarchy`")
			connection = frappe.db.sql("SELECT CONNECTION_ID()")[0][0]
			isolation = frappe.db.sql("SELECT @@tx_isolation")[0][0]
			barrier.wait()
			try:
				value = action()
				frappe.db.commit()
				return {"connection": connection, "outcome": "created", "name": value, "isolation": isolation}
			except (frappe.ValidationError, frappe.PermissionError) as error:
				frappe.db.rollback()
				return {
					"connection": connection,
					"outcome": "rejected",
					"error": str(error),
					"isolation": isolation,
				}
		finally:
			frappe.db.rollback()
			frappe.destroy()

	with ThreadPoolExecutor(max_workers=len(actions)) as pool:
		futures = [pool.submit(worker, action) for action in actions]
		result = [f.result(timeout=45) for f in futures]
	if len({r["connection"] for r in result}) != len(actions):
		raise AssertionError("Independent DB connections required")
	return result


def run():
	guard()
	site = frappe.local.site
	sites_path = str(Path(frappe.local.sites_path).resolve())
	prefix = "ORG-RACE-" + uuid.uuid4().hex[:12]
	company = frappe.db.get_value("Company", {"company_name": ["like", "%TEST%"]}, "name")
	if not company:
		raise RuntimeError("A synthetic TEST company is required")
	positions = []
	employees = []
	users = []
	department = None
	designation = None
	route_name = None
	grant_name = None
	original_settings = None
	checks = []

	def insert(dt, **values):
		return frappe.get_doc({"doctype": dt, **values}).insert()

	def check(name, result, expected_error):
		outcomes = sorted(r["outcome"] for r in result)
		assert outcomes == ["created", "rejected"], (name, outcomes)
		assert any(expected_error in r.get("error", "") for r in result), (name, result)
		checks.append(
			{
				"test": name,
				"status": "PASS",
				"connections": len({r["connection"] for r in result}),
				"isolation": sorted({r["isolation"] for r in result}),
			}
		)

	try:
		department = insert("Department", department_name=prefix, company=company).name
		designation = insert("Designation", designation_name=prefix).name
		with transition():
			for suffix in ["ONE", "A", "B", "X", "Y"]:
				positions.append(
					insert(
						"Kandil Position",
						company=company,
						department=department,
						designation=designation,
						position_code=prefix + "-" + suffix,
						title=suffix,
						structural=1,
					).name
				)
		for i in range(3):
			employees.append(
				insert(
					"Employee",
					first_name=prefix + "-" + str(i),
					gender="Male",
					date_of_birth="1990-01-01",
					date_of_joining=today(),
					company=company,
					department=department,
					designation=designation,
					status="Active",
				).name
			)
		frappe.db.commit()

		def assign(position, employee):
			return lambda: (
				insert(
					"Kandil Position Assignment",
					company=company,
					department=department,
					position=position,
					employee=employee,
					allocation="Primary",
					valid_from=today(),
				).name
			)

		result = race(
			site, sites_path, [assign(positions[0], employees[0]), assign(positions[0], employees[1])]
		)
		frappe.db.rollback()
		check("two_old_snapshots_cannot_overfill_one_seat", result, "exceed structural seats")
		assert frappe.db.count("Kandil Position Assignment", {"position": positions[0]}) == 1
		result = race(
			site, sites_path, [assign(positions[1], employees[2]), assign(positions[2], employees[2])]
		)
		frappe.db.rollback()
		check("two_old_snapshots_cannot_double_allocate_one_employee", result, "overlapping primary")
		assert frappe.db.count("Kandil Position Assignment", {"employee": employees[2]}) == 1

		def edge(position, parent):
			def action():
				with transition():
					return insert(
						"Kandil Position Hierarchy",
						company=company,
						department=department,
						position=position,
						parent_position=parent,
						authority="Department Approval",
						valid_from=today(),
					).name

			return action

		result = race(site, sites_path, [edge(positions[3], positions[4]), edge(positions[4], positions[3])])
		frappe.db.rollback()
		check("two_old_snapshots_cannot_commit_hierarchy_cycle", result, "cycle")
		assert frappe.db.count("Kandil Position Hierarchy", {"position": ["in", positions]}) == 1
		# Configuration changes committed while a reader waits on Company must
		# replace both route and canonical settings despite its earlier snapshot.
		for suffix in ["old", "new"]:
			email = prefix.lower() + "-" + suffix + "@example.invalid"
			insert(
				"User",
				email=email,
				first_name=prefix,
				enabled=1,
				send_welcome_email=0,
				user_type="System User",
				roles=[
					{"role": r}
					for r in [
						"Kandil Recruiter",
						"Kandil Approver",
						"Kandil Sector Approver",
						"Kandil CEO Approver",
						"Kandil Board Approver",
					]
				],
			)
			users.append(email)
		settings = frappe.get_doc("Kandil Organization Settings", company)
		original_settings = {
			key: settings.get(key)
			for key in ["hr_approver", "sector_approver", "ceo_approver", "board_approver"]
		}
		for key in original_settings:
			settings.set(key, users[0])
		settings.save(ignore_version=True)
		route = insert(
			"Kandil Recruitment Route",
			company=company,
			department=department,
			manager_approver=users[0],
			hr_approver=users[0],
			exception_approver=settings.sector_approver,
			ceo_approver=settings.ceo_approver,
			board_approver=settings.board_approver,
			enabled=1,
		)
		route_name = route.name
		frappe.db.commit()
		reader_ready, writer_ready, reader_waiting = Event(), Event(), Event()

		def config_reader():
			from kandil_hr.organization.models import lock_company
			from kandil_hr.recruitment.api import route_config

			assert frappe.db.get_value("Kandil Organization Settings", company, "hr_approver") == users[0]
			reader_ready.set()
			if not writer_ready.wait(20):
				raise RuntimeError("Configuration writer did not stage")
			reader_waiting.set()
			lock_company(company)
			resolved = route_config(frappe._dict(company=company, department=department))
			assert resolved.hr_approver == users[1]
			return resolved.hr_approver

		def config_writer():
			from kandil_hr.organization.models import lock_company

			if not reader_ready.wait(20):
				raise RuntimeError("Configuration reader did not establish snapshot")
			lock_company(company)
			current = frappe.get_doc("Kandil Organization Settings", company, for_update=True)
			current.hr_approver = users[1]
			current.save(ignore_version=True)
			current_route = frappe.get_doc("Kandil Recruitment Route", route_name, for_update=True)
			current_route.hr_approver = users[1]
			current_route.save(ignore_version=True)
			writer_ready.set()
			if not reader_waiting.wait(20):
				raise RuntimeError("Configuration reader did not wait")
			return "updated"

		result = race(site, sites_path, [config_reader, config_writer])
		frappe.db.rollback()
		assert all(r["outcome"] == "created" for r in result) and result[0]["name"] == users[1]
		checks.append(
			{
				"test": "old_snapshot_observes_committed_route_and_settings_after_company_wait",
				"status": "PASS",
				"connections": 2,
				"isolation": sorted({r["isolation"] for r in result}),
			}
		)
		# The reader observes an old valid grant, waits for Company, then must
		# reject its native write after the administrator's revocation commits.
		grant = insert(
			"Kandil Access Grant",
			user=users[0],
			company=company,
			valid_from=today(),
			can_manage_recruitment=1,
			reason="Synthetic concurrency regression",
		)
		grant_name = grant.name
		frappe.db.commit()
		reader_ready, writer_ready, reader_waiting = Event(), Event(), Event()

		def grant_reader():
			from kandil_hr.foundation.security import has_scope
			from kandil_hr.organization.models import lock_company

			frappe.set_user(users[0])
			assert has_scope(users[0], company, department, capability="manage")
			reader_ready.set()
			if not writer_ready.wait(20):
				raise RuntimeError("Grant writer did not stage")
			reader_waiting.set()
			lock_company(company)
			# No assignment persists: the native before_save current grant read
			# sees revoked even though has_scope's consistent snapshot was old.
			return insert(
				"Kandil Position Assignment",
				company=company,
				department=department,
				position=positions[4],
				employee=employees[1],
				allocation="Acting",
				valid_from=today(),
			).name

		def grant_writer():
			from kandil_hr.organization.models import lock_company

			if not reader_ready.wait(20):
				raise RuntimeError("Grant reader did not establish snapshot")
			lock_company(company)
			frappe.db.set_value("Kandil Access Grant", grant_name, "revoked", 1)
			writer_ready.set()
			if not reader_waiting.wait(20):
				raise RuntimeError("Grant reader did not wait")
			return "revoked"

		result = race(site, sites_path, [grant_reader, grant_writer])
		frappe.db.rollback()
		check(
			"native_assignment_rejects_grant_revoked_while_waiting_for_company",
			result,
			"current access grant",
		)
		assert not frappe.db.exists("Kandil Position Assignment", {"position": positions[4]})
	finally:
		frappe.db.rollback()
		frappe.set_user("Administrator")
		if route_name:
			frappe.db.delete("Kandil Recruitment Route", {"name": route_name})
		if original_settings is not None:
			frappe.db.set_value(
				"Kandil Organization Settings", company, original_settings, update_modified=False
			)
		if grant_name:
			frappe.db.delete("Kandil Access Grant", {"name": grant_name})
		for account in users:
			if frappe.db.exists("User", account):
				frappe.delete_doc("User", account, force=True, ignore_permissions=True)
		if positions:
			frappe.db.delete("Kandil Position Assignment", {"position": ["in", positions]})
			frappe.db.delete("Kandil Position Hierarchy", {"position": ["in", positions]})
			frappe.db.delete("Kandil Position", {"name": ["in", positions]})
		for employee in employees:
			if frappe.db.exists("Employee", employee):
				frappe.delete_doc("Employee", employee, force=True, ignore_permissions=True)
		if department and frappe.db.exists("Department", department):
			frappe.delete_doc("Department", department, force=True, ignore_permissions=True)
		if designation and frappe.db.exists("Designation", designation):
			frappe.delete_doc("Designation", designation, force=True, ignore_permissions=True)
		frappe.db.commit()
	assert not frappe.db.exists("Kandil Position", {"name": ["like", prefix + "%"]})
	checks.append({"test": "synthetic_fixture_cleanup", "status": "PASS"})
	root = Path(__file__).parent
	return {
		"suite": "organization-independent-connections",
		"result": "PASS",
		"total": len(checks),
		"tests": checks,
		"source_hashes": {
			f.name: hashlib.sha256(f.read_bytes()).hexdigest()
			for f in [
				Path(__file__),
				root / "current.py",
				root / "models.py",
				root / "api.py",
				root.parent / "foundation" / "mutation_access.py",
				root.parent / "recruitment" / "api.py",
			]
		},
		"limits": [
			"Two contenders with pre-established snapshots; not sustained production load.",
			"Native ORM invariants, not HTTP/browser authentication.",
			"Only UUID-owned synthetic fixture rows were committed and cleaned.",
		],
	}


def cleanup_failed_fixture(prefix):
	"""Recovery for one explicitly identified UUID fixture; never a broad prune."""
	import re

	guard()
	if not re.fullmatch(r"ORG-RACE-[a-f0-9]{12}", prefix):
		raise RuntimeError("Exact race UUID required")
	departments = frappe.get_all(
		"Department", filters={"department_name": prefix}, fields=["name", "company"]
	)
	for d in departments:
		if "TEST" not in (frappe.db.get_value("Company", d.company, "company_name") or ""):
			raise RuntimeError("Not a TEST company")
		positions = frappe.get_all(
			"Kandil Position",
			filters={"department": d.name, "position_code": ["like", prefix + "-%"]},
			pluck="name",
		)
		employees = frappe.get_all(
			"Employee", filters={"department": d.name, "first_name": ["like", prefix + "-%"]}, pluck="name"
		)
		if positions:
			frappe.db.delete("Kandil Position Assignment", {"position": ["in", positions]})
			frappe.db.delete("Kandil Position Hierarchy", {"position": ["in", positions]})
			frappe.db.delete("Kandil Position", {"name": ["in", positions]})
		for employee in employees:
			frappe.delete_doc("Employee", employee, force=True, ignore_permissions=True)
		frappe.delete_doc("Department", d.name, force=True, ignore_permissions=True)
	if frappe.db.exists("Designation", prefix):
		frappe.delete_doc("Designation", prefix, force=True, ignore_permissions=True)
	frappe.db.commit()
	return {
		"cleaned_prefix": prefix,
		"departments_remaining": frappe.db.count("Department", {"department_name": prefix}),
	}
