"""Independent-transaction authorization checks on the exclusive parity DB slot.

bench --site kandil-parity.localhost execute
kandil_hr.foundation.mutation_access_runner.run

Commits UUID synthetic users/grants, deliberately retains an old authorized
snapshot while an administrator holds Company and revokes access, then checks
that current revalidation denies mutation after the Company wait. No external
identity provider, HTTP login/session expiry or MFA proof is implied.
"""

import hashlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event

import frappe
from frappe.utils import today

from kandil_hr.foundation import mutation_access, security
from kandil_hr.foundation.concurrency_runner import _connection, _guard


def _race(site, sites_path, company, user, grant, change):
	company_held, snapshot_ready = Event(), Event()

	def revoke():
		frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
		connection = frappe.db.sql("SELECT CONNECTION_ID()")[0][0]
		company_held.set()
		if not snapshot_ready.wait(20):
			raise RuntimeError("Authorization contender did not establish its snapshot")
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

	def attempted_mutation():
		if not company_held.wait(20):
			raise RuntimeError("Company mutex was not acquired")
		frappe.set_user(user)
		connection = frappe.db.sql("SELECT CONNECTION_ID()")[0][0]
		isolation = frappe.db.sql("SELECT @@tx_isolation")[0][0]
		initial_scope = security.has_scope(user, company, capability="manage")
		initial_role = "Kandil Recruiter" in frappe.get_roles(user)
		snapshot_ready.set()
		frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
		try:
			mutation_access.assert_current_scope(company, required_roles=("Kandil Recruiter",))
		except frappe.PermissionError:
			return dict(
				connection=connection,
				isolation=isolation,
				initial_scope=initial_scope,
				initial_role=initial_role,
				denied=True,
			)
		return dict(
			connection=connection,
			isolation=isolation,
			initial_scope=initial_scope,
			initial_role=initial_role,
			denied=False,
		)

	with ThreadPoolExecutor(max_workers=2) as pool:
		mutator = pool.submit(_connection, site, sites_path, revoke)
		contender = pool.submit(_connection, site, sites_path, attempted_mutation)
		revoker_connection, outcome = mutator.result(timeout=45), contender.result(timeout=45)
	if revoker_connection == outcome["connection"]:
		raise AssertionError("Authorization race requires independent database connections")
	return outcome


def run():
	_guard()
	site, sites_path = frappe.local.site, str(Path(frappe.local.sites_path).resolve())
	company = frappe.db.get_value("Company", {"company_name": ["like", "%TEST%"]}, "name")
	if not company:
		raise RuntimeError("A synthetic TEST company is required")
	users, checks = [], []
	try:
		for change in ("grant", "disabled", "role"):
			user = "scope-race-" + uuid.uuid4().hex + "@example.invalid"
			users.append(user)
			frappe.get_doc(
				dict(
					doctype="User",
					email=user,
					first_name="Synthetic authorization race",
					enabled=1,
					send_welcome_email=0,
					user_type="System User",
					roles=[dict(role="Kandil Recruiter")],
				)
			).insert(ignore_permissions=True)
			grant = frappe.get_doc(
				dict(
					doctype="Kandil Access Grant",
					user=user,
					company=company,
					valid_from=today(),
					can_manage_recruitment=1,
					reason="Synthetic current-access proof",
				)
			).insert(ignore_permissions=True)
			frappe.db.commit()
			frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
			roles = mutation_access.assert_current_scope(
				company, user=user, required_roles=("Kandil Recruiter",)
			)
			if "Kandil Recruiter" not in roles:
				raise AssertionError("Positive current-access control failed")
			frappe.db.rollback()
			result = _race(site, sites_path, company, user, grant.name, change)
			frappe.db.rollback()
			if not (
				result["initial_scope"]
				and result["initial_role"]
				and result["denied"]
				and result["isolation"] == "REPEATABLE-READ"
			):
				raise AssertionError("Current authorization did not defeat the old snapshot: " + change)
			checks.append(
				dict(
					test=change + "_revocation_after_snapshot_before_company_lock",
					status="PASS",
					initial_authorized=True,
					revalidation_denied=True,
					connections=2,
					isolation=result["isolation"],
				)
			)
	finally:
		frappe.db.rollback()
		frappe.set_user("Administrator")
		for user in users:
			frappe.db.delete("Kandil Access Grant", {"user": user})
			frappe.db.delete("Kandil Security Event", {"target_user": user})
			if frappe.db.exists("User", user):
				frappe.delete_doc("User", user, ignore_permissions=True, force=True)
		frappe.db.commit()
	if any(
		frappe.db.exists("User", user) or frappe.db.exists("Kandil Access Grant", {"user": user})
		for user in users
	):
		raise AssertionError("Synthetic authorization fixtures remain")
	checks.append(dict(test="synthetic_authorization_fixtures_removed", status="PASS"))
	return dict(
		result="PASS",
		total=len(checks),
		tests=checks,
		source_sha256={
			path.name: hashlib.sha256(path.read_bytes()).hexdigest()
			for path in (Path(__file__), Path(mutation_access.__file__), Path(security.__file__))
		},
		limits=[
			"Internal mutation helper exercised, not every integrating endpoint",
			"No external identity, MFA, HTTP login or session-expiry proof",
			"Callers must hold domain locks and preserve global User lock order",
		],
	)
