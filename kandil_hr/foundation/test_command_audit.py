"""Explicit bounded audit tests; full command coverage requires adapter suites."""

import io
import json
import unittest
import uuid
import zipfile
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import frappe

from kandil_hr.foundation import command_audit as audit


class TestAuditPrimitives(unittest.TestCase):
	def test_absent_projection_is_explicit_and_creation_only(self):
		absent = {"doctype": "Kandil Delegation", "name": "new-version", "record_exists": False}
		self.assertEqual(audit.checked_projection(absent, allow_absent=True), absent)
		with self.assertRaises(ValueError):
			audit.checked_projection(absent)
		for invalid in (
			absent | {"record_exists": 0},
			absent | {"status": "Draft"},
			absent | {"doctype": "User"},
		):
			with self.assertRaises(ValueError):
				audit.checked_projection(invalid, allow_absent=True)

	def test_canonical_primitives_are_deterministic_and_copied(self):
		data = {"z": [Decimal("1.20"), date(2026, 10, 12)], "a": "قنديل"}
		before = audit.copy(data)
		data["z"].append("later")
		self.assertEqual(before, {"a": "قنديل", "z": ["1.20", "2026-10-12"]})
		self.assertEqual(audit.canonical({"b": 2, "a": 1}), audit.canonical({"a": 1, "b": 2}))

	def test_secrets_nonfinite_and_arbitrary_objects_rejected(self):
		for value in ({"x": [{"api_secret": "synthetic"}]}, {"SID": "synthetic"}, float("nan"), object()):
			with self.assertRaises(ValueError):
				audit.canonical(value)

	def test_related_allowlist_omits_unreviewed_fields_and_projects_team(self):
		doc = frappe._dict(
			doctype="Job Opening",
			name="OPEN",
			custom_salary=999,
			custom_kandil_team=[frappe._dict(name="MEMBER", idx=1, user="actor", api_secret="synthetic")],
		)
		projection = audit.project_related(doc)
		self.assertNotIn("custom_salary", projection)
		self.assertEqual(projection["custom_kandil_team"], [{"name": "MEMBER", "idx": 1, "user": "actor"}])
		self.assertEqual(audit.checked_projection(projection), projection)
		projection["custom_salary"] = 999
		with self.assertRaises(ValueError):
			audit.checked_projection(projection)

	def test_duplicate_related_targets_and_unknown_types_rejected(self):
		row = audit.project_related(frappe._dict(doctype="Employee", name="EMP"))
		with self.assertRaises(ValueError):
			audit.related([row, row])
		with self.assertRaises(ValueError):
			audit.project_related(frappe._dict(doctype="User", name="private"))

	def test_permission_contract_is_administrator_read_only(self):
		with patch.object(audit, "active", return_value=True):
			self.assertTrue(audit.permission(user="Administrator", ptype="read"))
			for action in ("read", "write", "create", "delete", "export"):
				self.assertFalse(audit.permission(user="ordinary@example.invalid", ptype=action))
			self.assertFalse(audit.permission(user="Administrator", ptype="write"))
			self.assertEqual(audit.query("ordinary@example.invalid"), "1=0")


class TestAuditDatabase(unittest.TestCase):
	def setUp(self):
		from kandil_hr.recruitment.test_commands import TestRecruitmentCommands

		self.f = TestRecruitmentCommands()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()
		self.request = self.f.request((1,))
		self.before = audit.project_request(self.request)
		self.values = dict(
			domain="recruitment",
			operation="decide",
			command_id=uuid.uuid4().hex,
			receipt_key=uuid.uuid4().hex,
			reviewed_version=str(self.request.modified),
			target=self.request,
			before=self.before,
			after=self.before,
			payload={"decision": "Approve", "step_id": "synthetic-step"},
			result={"name": self.request.name},
			principal=self.f.users["manager"],
			step_key="synthetic-step",
			authority={
				"frozen_principal": self.f.users["manager"],
				"authority": "Department Approval",
				"step_key": "synthetic-step",
			},
		)

	def record(self, **changes):
		from kandil_hr.pilot.api import transition
		from kandil_hr.recruitment.test_commands import acting_as

		with acting_as(self.f.users["hr"]), transition():
			return audit.record_command(**(self.values | changes))

	def test_exact_envelope_identity_authority_timestamp_and_replay(self):
		name = self.record()
		self.assertEqual(self.record(), name)
		doc = frappe.get_doc(audit.DOCTYPE, name)
		value = json.loads(doc.envelope_json)
		self.assertEqual(
			(value["actor"], value["principal"], value["command_id"], value["operation"]),
			(self.f.users["hr"], self.f.users["manager"], self.values["command_id"], "decide"),
		)
		self.assertEqual(value["authority"]["frozen_principal"], self.f.users["manager"])
		self.assertEqual(value["payload"], self.values["payload"])
		self.assertEqual(value["command_origin"], "client_command")
		self.assertEqual(doc.command_origin, "client_command")
		self.assertEqual(value["before"], self.before)
		self.assertEqual(value["timezone"], "Africa/Cairo")
		self.assertRegex(value["occurred_at"], r"[+]0[23]:00$")
		self.assertEqual(frappe.db.count(audit.DOCTYPE, {"target_name": self.request.name}), 1)
		with self.assertRaises(frappe.ValidationError):
			self.record(payload={"decision": "Reject"})

	def test_server_invocation_origin_is_explicit_and_invalid_origin_rejected(self):
		name = self.record(command_origin="server_invocation")
		doc = frappe.get_doc(audit.DOCTYPE, name)
		self.assertEqual(doc.command_origin, "server_invocation")
		self.assertEqual(json.loads(doc.envelope_json)["command_origin"], "server_invocation")
		with self.assertRaises(ValueError):
			self.record(command_origin="invented_client_id")
		with self.assertRaises(frappe.ValidationError):
			self.record(command_origin="client_command")

	def test_native_forgery_edit_delete_and_rename_denied(self):
		from frappe.client import delete, save

		name = self.record()
		doc = frappe.get_doc(audit.DOCTYPE, name)
		with self.assertRaises(frappe.PermissionError):
			audit.record_command(**self.values)
		payload = doc.as_dict()
		payload["operation"] = "forged"
		with self.f.rejected(frappe.PermissionError):
			save(json.dumps(payload, default=str))
		with self.f.rejected(frappe.PermissionError):
			delete(audit.DOCTYPE, name)
		with self.f.rejected((frappe.PermissionError, frappe.ValidationError)):
			frappe.rename_doc(audit.DOCTYPE, name, "forged-audit")
		payload.pop("name")
		payload["audit_key"] = "a" * 64
		with self.f.rejected(frappe.PermissionError):
			frappe.get_doc(payload).insert(ignore_permissions=True)

	def test_native_ordinary_read_list_and_share_denied(self):
		from frappe.client import get, get_list

		from kandil_hr.recruitment.test_commands import acting_as

		name = self.record()
		for actor in ("requester", "hr", "sector"):
			with acting_as(self.f.users[actor]):
				with self.assertRaises(frappe.PermissionError):
					get(audit.DOCTYPE, name)
				try:
					rows = get_list(audit.DOCTYPE, filters={"name": name})
				except frappe.PermissionError:
					rows = []
				self.assertEqual(rows, [])
		with self.f.rejected(frappe.PermissionError):
			frappe.get_doc(
				dict(
					doctype="DocShare",
					share_doctype=audit.DOCTYPE,
					share_name=name,
					user=self.f.users["requester"],
					read=1,
				)
			).insert(ignore_permissions=True)

	def test_audit_and_business_effect_rollback_together_on_insert_failure(self):
		from kandil_hr.recruitment.test_commands import acting_as

		point = "audit_failure_" + uuid.uuid4().hex
		frappe.db.savepoint(point)
		try:
			with acting_as(self.f.users["requester"]):
				doc = self.f.load(self.request.name)
				doc.title = "Synthetic effect to roll back"
				doc.save()
			with patch.object(
				audit.KandilCommandAudit, "insert", side_effect=RuntimeError("Synthetic audit failure")
			):
				with self.assertRaises(RuntimeError):
					self.record(after=audit.project_request(doc))
		finally:
			frappe.db.rollback(save_point=point)
		self.assertEqual(self.f.load(self.request.name).title, self.request.title)
		self.assertEqual(frappe.db.count(audit.DOCTYPE, {"target_name": self.request.name}), 0)
		self.assertTrue(self.record())

	def test_related_additions_have_no_fabricated_before_state(self):
		row = audit.project_related(
			frappe._dict(
				doctype="Job Applicant",
				name="synthetic-added-applicant",
				custom_kandil_responsible_user=self.f.users["hr"],
			)
		)
		name = self.record(related_after=[row])
		value = json.loads(frappe.db.get_value(audit.DOCTYPE, name, "envelope_json"))
		self.assertEqual(value["related_before"], [])
		self.assertEqual(value["related_added_to_capture"], [["Job Applicant", "synthetic-added-applicant"]])
		self.assertEqual(value["related_after"][0]["custom_kandil_responsible_user"], self.f.users["hr"])

	def test_stale_share_purge_restores_native_denial(self):
		from frappe.client import get, get_list

		from kandil_hr.foundation.files import purge_protected_shares
		from kandil_hr.recruitment.test_commands import acting_as

		name = self.record()
		# Simulate old database state, never a permitted ordinary API insertion.
		share = frappe.get_doc(
			dict(
				doctype="DocShare",
				name=uuid.uuid4().hex,
				share_doctype=audit.DOCTYPE,
				share_name=name,
				user=self.f.users["hr"],
				read=1,
			)
		)
		share.db_insert()
		self.assertTrue(frappe.db.exists("DocShare", share.name))
		self.assertGreaterEqual(purge_protected_shares(), 1)
		self.assertFalse(frappe.db.exists("DocShare", share.name))
		with acting_as(self.f.users["hr"]):
			self.assertFalse(frappe.has_permission(audit.DOCTYPE, "read", doc=name))
			with self.assertRaises(frappe.PermissionError):
				get(audit.DOCTYPE, name)
			try:
				rows = get_list(audit.DOCTYPE, filters={"name": name}, fields=["envelope_json"])
			except frappe.PermissionError:
				rows = []
			self.assertEqual(rows, [])

	def test_private_file_owner_download_zip_and_alias_cannot_bypass_audit(self):
		from frappe.core.doctype.file.utils import find_file_by_url
		from frappe.handler import download_file

		from kandil_hr.foundation import files
		from kandil_hr.recruitment.test_commands import acting_as

		name = self.record()
		prefix = "synthetic-command-audit-" + uuid.uuid4().hex
		file = frappe.get_doc(
			dict(
				doctype="File",
				file_name=prefix + ".txt",
				content=prefix + " private synthetic envelope",
				is_private=1,
				attached_to_doctype=audit.DOCTYPE,
				attached_to_name=name,
			)
		).insert(ignore_permissions=True)
		path = Path(file.get_full_path()).resolve()
		self.assertEqual(path.parent, Path(frappe.get_site_path("private", "files")).resolve())
		self.assertTrue(path.name.startswith(prefix))
		self.addCleanup(path.unlink, missing_ok=True)
		# Ownership and a stale share must not defeat strict parent download checks.
		file.db_set("owner", self.f.users["hr"], update_modified=False)
		frappe.get_doc(
			dict(
				doctype="DocShare",
				name=uuid.uuid4().hex,
				share_doctype=audit.DOCTYPE,
				share_name=name,
				user=self.f.users["hr"],
				read=1,
			)
		).db_insert()
		with acting_as(self.f.users["hr"]):
			self.assertFalse(frappe.get_doc("File", file.name).is_downloadable())
			self.assertIsNone(find_file_by_url(file.file_url, file.name))
			with self.assertRaises(frappe.PermissionError):
				download_file(file.file_url)
			files.zip_files([file.name])
			with zipfile.ZipFile(io.BytesIO(frappe.response.filecontent)) as archive:
				self.assertEqual(archive.namelist(), [])
			with self.f.rejected(frappe.PermissionError):
				frappe.get_doc(
					dict(doctype="File", file_name=file.file_name, file_url=file.file_url, is_private=1)
				).insert()

	def test_native_export_and_query_report_do_not_return_private_envelope(self):
		from frappe.core.doctype.data_export.exporter import export_data
		from frappe.desk import query_report, reportview

		from kandil_hr.recruitment.test_commands import acting_as

		name = self.record()
		report = frappe.get_doc(
			dict(
				doctype="Report",
				report_name="Synthetic audit " + uuid.uuid4().hex,
				ref_doctype=audit.DOCTYPE,
				report_type="Query Report",
				is_standard="No",
				module="Kandil HR",
				query="SELECT name,envelope_json FROM `tabKandil Command Audit`",
				roles=[dict(role="Kandil Recruiter")],
			)
		).insert(ignore_permissions=True)
		with acting_as(self.f.users["hr"]):
			with self.assertRaises(frappe.PermissionError):
				export_data(
					doctype=audit.DOCTYPE,
					with_data=True,
					select_columns={audit.DOCTYPE: ["name", "envelope_json"]},
					filters={"name": name},
				)
			# Same implementation as the native report-builder export endpoint.
			with self.assertRaises(frappe.PermissionError):
				reportview._export_query(
					frappe._dict(
						doctype=audit.DOCTYPE,
						fields=["name", "envelope_json"],
						filters={"name": name},
						file_format_type="CSV",
					),
					{},
				)
			with self.assertRaises(frappe.PermissionError):
				query_report.run(report.name, filters={})
			with self.assertRaises(frappe.PermissionError):
				frappe.get_doc("Report", report.name).execute_query_report({})


def run():
	if (
		frappe.local.site != "kandil-parity.localhost"
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
		or not frappe.conf.get("allow_tests")
		or not audit.active()
	):
		raise RuntimeError("Command audit tests require isolated opted-in parity Administrator CLI")
	classes = (TestAuditPrimitives, TestAuditDatabase)
	suite = unittest.TestSuite()
	for case, expected in zip(classes, (6, 9), strict=True):
		names = sorted(name for name in case.__dict__ if name.startswith("test_"))
		if len(names) != expected:
			raise RuntimeError("Unexpected command audit discovery count")
		suite.addTests(case(name) for name in names)
	result = unittest.TextTestRunner(verbosity=2).run(suite)
	value = dict(
		result="PASS" if result.wasSuccessful() and not result.skipped and result.testsRun == 15 else "FAIL",
		discovered=15,
		executed=result.testsRun,
		native=9,
		pure=6,
		failures=len(result.failures),
		errors=len(result.errors),
		skips=len(result.skipped),
	)
	if value["result"] != "PASS":
		error = AssertionError("Command audit checks failed")
		error.summary = value
		raise error
	return value
