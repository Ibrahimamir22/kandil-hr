"""Isolated delegation schema proof and one explicitly identified synthetic repair.

Run ``run`` in its own fresh bench process: temporary-table ALTER may cross DDL
transaction boundaries. It never changes application rows. The separate repair
does not commit; its caller must explicitly commit or roll back the audited save.
Neither entry point is whitelisted or usable on preserved pilot/production sites.
"""

import uuid
from datetime import UTC, datetime

import frappe
from frappe.database.schema import DbColumn
from frappe.utils import cint, get_datetime


def guard():
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
		raise RuntimeError("Requires isolated synthetic parity Administrator CLI test context")


def run():
	guard()
	if frappe.db.transaction_writes:
		raise RuntimeError("Schema proof requires its own fresh process without pending application writes")
	checks = []

	def check(name, condition):
		checks.append({"test": name, "status": "PASS" if condition else "FAIL"})
		if not condition:
			error = AssertionError(name)
			error.summary = dict(result="FAIL", executed=len(checks), checks=checks)
			raise error

	df = frappe.get_meta("Kandil Delegation").get_field("approval_status")
	check(
		"installed_metadata_has_no_active_default_and_blank_first_option",
		bool(df) and not df.default and (df.options or "").split("\n")[0] == "",
	)
	column = DbColumn(
		table=None,
		fieldname=df.fieldname,
		fieldtype=df.fieldtype,
		length=df.length,
		default=df.default,
		set_index=df.search_index,
		options=df.options,
		unique=df.unique,
		precision=df.precision,
		not_nullable=df.not_nullable,
	)
	definition = column.get_definition()
	check("actual_frappe_column_definition_has_no_active_default", "DEFAULT" not in definition.upper())
	table = "kandil_delegation_schema_" + uuid.uuid4().hex
	try:
		frappe.db.sql(f"CREATE TEMPORARY TABLE `{table}` (name VARCHAR(140) PRIMARY KEY)")
		frappe.db.sql(f"INSERT INTO `{table}` (name) VALUES (%s)", ("legacy-before-column",))
		# Only the temporary fixture was written. Frappe correctly refuses ALTER
		# with pending writes, so end this isolated fixture transaction explicitly.
		frappe.db.commit()
		frappe.db.sql(f"ALTER TABLE `{table}` ADD COLUMN `approval_status` {definition}")
		rows = frappe.db.sql(f"SELECT name,approval_status FROM `{table}`")
		check(
			"preexisting_row_remains_null_after_actual_add_column",
			rows == (("legacy-before-column", None),) or rows == [("legacy-before-column", None)],
		)
		active = frappe.db.sql(f"SELECT COUNT(*) FROM `{table}` WHERE approval_status='Active'")[0][0]
		check("legacy_row_cannot_match_active_delegation_filter", active == 0)
		actual = frappe.db.sql(
			"SHOW COLUMNS FROM `tabKandil Delegation` LIKE 'approval_status'", as_dict=True
		)
		check("installed_site_column_has_null_default", len(actual) == 1 and actual[0].get("Default") is None)
	finally:
		frappe.db.sql(f"DROP TEMPORARY TABLE IF EXISTS `{table}`")
	return dict(
		result="PASS",
		discovered=5,
		executed=len(checks),
		failures=0,
		errors=0,
		skips=0,
		checks=checks,
		checked_at=datetime.now(UTC).isoformat(),
	)


def repair_known_legacy_fixture():
	"""Only the pre-migration disabled-account fixture approved for remediation.

	This is deliberately not a migration or a general Active-row repair heuristic.
	A legitimate new ordinary delegation also has no CEO approval metadata.
	"""
	guard()
	from kandil_hr.foundation import delegation

	name = "eqf23hsfmd"
	principal = "browser-b6c847d19e20-manager@example.invalid"
	delegate = "browser-b6c847d19e20-delegate@example.invalid"
	created = get_datetime("2026-10-12 07:18:15.996476")
	doc = delegation.lock_context(name)
	if (doc.from_user, doc.to_user, get_datetime(doc.creation)) != (principal, delegate, created):
		raise RuntimeError("Known legacy fixture identity does not match; no repair performed")
	for user in (principal, delegate):
		row = frappe.db.sql("SELECT enabled FROM `tabUser` WHERE name=%s FOR UPDATE", (user,))
		if len(row) != 1 or cint(row[0][0]):
			raise RuntimeError("Known legacy fixture must reference two disabled accounts")
	if cint(doc.revoked) == 1 and doc.approval_status == "Revoked":
		return dict(result="NOOP", name=name, reason="Known fixture already revoked", committed=False)
	if cint(doc.revoked) != 0 or doc.approval_status != "Active":
		raise RuntimeError("Known legacy fixture state does not match; no repair performed")
	before = frappe.db.count("Kandil Security Event", {"reference": name, "action": "Delegation changed"})
	with delegation.effect():
		doc.revoked = 1
		doc.revocation_reason = "Revoke exact disabled synthetic legacy fixture"
		doc.save(ignore_permissions=True)
	after = frappe.db.count("Kandil Security Event", {"reference": name, "action": "Delegation changed"})
	if (cint(doc.revoked), doc.approval_status, after - before) != (1, "Revoked", 1):
		raise AssertionError("Known fixture repair did not produce exactly one native audited revocation")
	return dict(result="REVOKED", name=name, audit_events_added=1, committed=False)
