"""Native rollback-only proof of exact revision/import private command envelopes."""

import hashlib
import json
import sys
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import frappe
from frappe.utils import add_days, today

from kandil_hr.foundation import command_audit
from kandil_hr.organization import api, audit_projections, revision_import_audit
from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as


class TestRevisionImportAudit(unittest.TestCase):
	def setUp(self):
		self.f = TestRecruitmentCommands()
		self.addCleanup(self.f.doCleanups)
		self.f.setUp()
		for key in ("hr", "sector"):
			self.f.insert(
				"Kandil Access Grant",
				user=self.f.users[key],
				company=self.f.company,
				valid_from=today(),
				can_manage_recruitment=1,
				can_view_sensitive=1,
				reason="Synthetic revision/import audit company authority",
			)

	def draft(self, doctype, **values):
		with acting_as(self.f.users["hr"]):
			return frappe.get_doc(dict(doctype=doctype, company=self.f.company, **values)).insert()

	def jd(self, **values):
		p = frappe.get_doc("Kandil Position", self.f.positions[0])
		data = dict(
			department=p.department,
			branch=p.branch,
			position=p.name,
			valid_from=today(),
			purpose="Safe operations",
			purpose_ar="العمل بأمان",
			qualifications="Qualification",
			qualifications_ar="المؤهل",
			experience="Experience",
			experience_ar="الخبرة",
			technical_skills="Skills",
			technical_skills_ar="المهارات",
			working_conditions="Hazards",
			working_conditions_ar="المخاطر",
			certifications="Licence",
			certifications_ar="الترخيص",
			responsibility_rows=[
				dict(area="Safety", description="Duty " + str(i), description_ar="واجب " + str(i))
				for i in range(3)
			],
			competencies=[
				dict(
					competency="Safety",
					competency_ar="السلامة",
					weight=100,
					measure="Assessment",
					measure_ar="تقييم",
					target="Pass",
					competency_group="Core",
					required_level="2",
					behavior="Report",
					behavior_ar="الإبلاغ",
				)
			],
			kpis=[
				dict(
					indicator="Quality",
					indicator_ar="الجودة",
					kind="Weighted",
					weight=100,
					formula="passed/total",
					formula_ar="مقبول/إجمالي",
					frequency="Monthly",
				)
			],
			authorities=[
				dict(decision="Stop unsafe work", decision_ar="إيقاف العمل غير الآمن", authority_level="Stop")
			],
		)
		data.update(values)
		return self.draft("Kandil JD Revision", **data)

	def approve(self, doc):
		args = dict(doctype=doc.doctype, name=doc.name, expected_version=str(doc.modified))
		with acting_as(self.f.users["sector"]):
			result = api.approve_revision(**args)
			self.assertEqual(api.approve_revision(**args), result)
		return self.envelope(doc.name, "approve_revision"), args

	def envelope(self, name, operation):
		found = frappe.get_all(
			command_audit.DOCTYPE,
			filters={"target_name": name, "operation": operation},
			fields=["name", "envelope_json", "command_origin"],
		)
		self.assertEqual(len(found), 1)
		self.assertEqual(found[0].command_origin, "server_invocation")
		value = json.loads(found[0].envelope_json)
		self.assertEqual(value["command_origin"], "server_invocation")
		self.assertEqual(value["company"], self.f.company)
		for row in value["related_before"] + value["related_after"]:
			if row["doctype"] != "Designation":
				self.assertEqual(row["company"], self.f.company)
		return value

	def test_jd_full_content_child_fields_independent_actor_and_replay(self):
		doc = self.jd()
		with acting_as(self.f.users["hr"]), self.f.rejected(frappe.PermissionError):
			api.approve_revision(doc.doctype, doc.name, str(doc.modified))
		value, args = self.approve(doc)
		self.assertEqual(value["payload"], args)
		self.assertEqual(value["actor"], self.f.users["sector"])
		self.assertNotEqual(value["actor"], value["before"]["owner"])
		self.assertEqual(value["before"]["status"], "Draft")
		self.assertEqual(value["after"]["status"], "Approved")
		self.assertEqual(value["after"], audit_projections.project(frappe.get_doc(doc.doctype, doc.name)))
		doc.reload()
		self.assertEqual(value["after"], audit_projections.project(doc))
		self.assertEqual(
			audit_projections.temporal("purpose", "2026-10-12 08:54:39.632711"), "2026-10-12 08:54:39.632711"
		)
		for table in ("competencies", "responsibility_rows", "kpis", "authorities"):
			self.assertTrue(value["before"][table])
			self.assertEqual(value["before"][table], value["after"][table])
		self.assertEqual(value["after"]["working_conditions_ar"], "المخاطر")
		self.assertEqual(value["after"]["authorities"][0]["authority_level"], "Stop")

	def test_superseded_approved_revision_is_exact_unchanged_related_record(self):
		prior = self.jd()
		self.approve(prior)
		prior.reload()
		new = self.jd(supersedes=prior.name, valid_from=add_days(today(), 1), purpose="Revised duty")
		value, _ = self.approve(new)
		before = next(row for row in value["related_before"] if row["name"] == prior.name)
		after = next(row for row in value["related_after"] if row["name"] == prior.name)
		self.assertEqual(before, after)
		self.assertEqual(after, audit_projections.project(prior))
		self.assertEqual(value["after"]["revision"], 2)
		self.assertEqual(value["after"]["supersedes"], prior.name)

	def test_grade_full_range_private_envelope(self):
		doc = self.draft(
			"Kandil Grade Band",
			grade_code=self.f.prefix,
			title="Private range",
			valid_from=today(),
			currency="EGP",
			minimum=1234,
			maximum=5678,
		)
		value, args = self.approve(doc)
		self.assertEqual(value["payload"], args)
		self.assertEqual((value["after"]["minimum"], value["after"]["maximum"]), (1234, 5678))
		name = frappe.db.get_value(command_audit.DOCTYPE, {"target_name": doc.name}, "name")
		for key in ("hr", "sector", "requester"):
			with acting_as(self.f.users[key]):
				try:
					listed = frappe.get_list(command_audit.DOCTYPE, filters={"name": name})
				except frappe.PermissionError:
					listed = []
				self.assertEqual(listed, [])
				with self.assertRaises(frappe.PermissionError):
					frappe.get_doc(command_audit.DOCTYPE, name).check_permission("read")

	def batch(self, kind, rows):
		return self.draft(
			"Kandil Organization Import",
			import_kind=kind,
			rows_json=json.dumps(rows, ensure_ascii=False),
			baseline_reference="Synthetic reviewed source " + kind,
		)

	def run_batch(self, kind, rows):
		doc = self.batch(kind, rows)
		version = str(doc.modified)
		with acting_as(self.f.users["sector"]):
			preview = api.review_import(doc.name, version)
			self.assertEqual(api.review_import(doc.name, version), preview)
		review = self.envelope(doc.name, "review_import")
		self.assertEqual(review["payload"], {"name": doc.name, "expected_version": version})
		self.assertEqual(json.loads(review["before"]["rows_json"]), rows)
		self.assertEqual(review["before"]["status"], "Draft")
		self.assertEqual(review["after"]["status"], "Reviewed")
		self.assertEqual(review["related_before"], review["related_after"])
		doc.reload()
		with acting_as(self.f.users["hr"]):
			result = api.apply_import(doc.name, doc.digest)
			self.assertEqual(api.apply_import(doc.name, doc.digest), result)
		value = self.envelope(doc.name, "apply_import")
		self.assertEqual(value["payload"], {"name": doc.name, "reviewed_digest": doc.digest})
		self.assertEqual(value["actor"], self.f.users["hr"])
		self.assertEqual(value["before"]["reviewed_by"], self.f.users["sector"])
		self.assertEqual((value["before"]["status"], value["after"]["status"]), ("Reviewed", "Applied"))
		self.assertEqual(value["result"], result)
		if result["created"]:
			snap = next(r for r in value["related_after"] if r["doctype"] == "Kandil Structure Snapshot")
			self.assertEqual(snap["name"], result["snapshot"])
			self.assertFalse(any(r["name"] == snap["name"] for r in value["related_before"]))
		return value, result

	def check_repeat(self, kind, rows, target_type):
		first, result = self.run_batch(kind, rows)
		added = [r for r in first["related_added_to_capture"] if r[0] == target_type]
		self.assertEqual(len(added), 1)
		second, repeated = self.run_batch(kind, rows)
		self.assertEqual((repeated["created"], repeated["unchanged"]), (0, 1))
		self.assertEqual(second["related_before"], second["related_after"])
		self.assertEqual(second["related_added_to_capture"], [])
		return first, result

	def test_units_import_records_actual_department_code_snapshot_and_unchanged(self):
		self.check_repeat(
			"Units",
			[dict(external_code="unit-" + self.f.prefix, title=self.f.prefix + " Unit")],
			"Department",
		)

	def test_jobs_import_records_actual_designation_code_snapshot_and_unchanged(self):
		self.check_repeat(
			"Jobs",
			[
				dict(
					external_code="job-" + self.f.prefix, title=self.f.prefix + " Job", job_family="Technical"
				)
			],
			"Designation",
		)

	def test_positions_import_records_exact_position_code_and_existing_capacity(self):
		p = frappe.get_doc("Kandil Position", self.f.positions[0])
		rows = [
			dict(
				position_code=self.f.prefix + "-import",
				title="New imported position",
				department=self.f.department,
				designation=self.f.designation,
				structural=2,
			)
		]
		self.check_repeat("Positions", rows, "Kandil Position")
		existing = [
			dict(
				position_code=p.name,
				title=p.title,
				department=p.department,
				designation=p.designation,
				branch=p.branch,
				structural=p.structural,
			)
		]
		value, result = self.run_batch("Positions", existing)
		self.assertEqual(result["unchanged"], 1)
		before = next(r for r in value["related_before"] if r["doctype"] == "Kandil Capacity")
		self.assertEqual(before, next(r for r in value["related_after"] if r["name"] == before["name"]))
		self.assertEqual(before["name"], self.f.capacities[0])

	def new_position(self):
		with api.transition():
			return self.f.insert(
				"Kandil Position",
				company=self.f.company,
				department=self.f.department,
				designation=self.f.designation,
				position_code=self.f.prefix + "-dated",
				title="Imported dated position",
				structural=2,
			)

	def test_hierarchy_import_records_actual_dated_row_and_repeat(self):
		p = self.new_position()
		self.check_repeat(
			"Hierarchy",
			[dict(position=p.name, authority="Department Approval", valid_from=today())],
			"Kandil Position Hierarchy",
		)

	def test_assignments_import_records_actual_employee_reference_dates_and_repeat(self):
		p = self.new_position()
		employee = self.f.insert(
			"Employee",
			first_name=self.f.prefix + " Imported",
			company=self.f.company,
			department=self.f.department,
			gender="Male",
			date_of_birth="1990-01-01",
			date_of_joining=today(),
			status="Active",
		)
		value, _ = self.check_repeat(
			"Assignments",
			[
				dict(
					position=p.name,
					employee=employee.name,
					allocation="Primary",
					valid_from=today(),
					remarks="Reviewed baseline allocation",
				)
			],
			"Kandil Position Assignment",
		)
		row = next(r for r in value["related_after"] if r["doctype"] == "Kandil Position Assignment")
		self.assertEqual(row["employee"], employee.name)
		self.assertEqual(row["remarks"], "Reviewed baseline allocation")

	def test_audit_failure_rolls_back_review_apply_created_records_and_revision(self):
		doc = self.batch(
			"Units", [dict(external_code="failure-" + self.f.prefix, title=self.f.prefix + " Failure Unit")]
		)
		with (
			acting_as(self.f.users["sector"]),
			self.f.rejected(RuntimeError),
			patch.object(
				command_audit, "record_command", side_effect=RuntimeError("Synthetic audit failure")
			),
		):
			api.review_import(doc.name, str(doc.modified))
		doc.reload()
		self.assertEqual(doc.status, "Draft")
		self.assertEqual(frappe.db.count(command_audit.DOCTYPE, {"target_name": doc.name}), 0)
		with acting_as(self.f.users["sector"]):
			api.review_import(doc.name, str(doc.modified))
		doc.reload()
		counts = {
			dt: frappe.db.count(dt)
			for dt in [
				"Department",
				"Kandil Organization Code",
				"Kandil Structure Snapshot",
				command_audit.DOCTYPE,
			]
		}
		with (
			acting_as(self.f.users["hr"]),
			self.f.rejected(RuntimeError),
			patch.object(
				command_audit, "record_command", side_effect=RuntimeError("Synthetic audit failure")
			),
		):
			api.apply_import(doc.name, doc.digest)
		doc.reload()
		self.assertEqual(doc.status, "Reviewed")
		self.assertEqual(counts, {dt: frappe.db.count(dt) for dt in counts})
		jd = self.jd()
		with (
			acting_as(self.f.users["sector"]),
			self.f.rejected(RuntimeError),
			patch.object(
				command_audit, "record_command", side_effect=RuntimeError("Synthetic audit failure")
			),
		):
			api.approve_revision(jd.doctype, jd.name, str(jd.modified))
		jd.reload()
		self.assertEqual(jd.status, "Draft")
		self.assertEqual(frappe.db.count(command_audit.DOCTYPE, {"target_name": jd.name}), 0)

	def test_foreign_company_target_rejected_without_envelope(self):
		other = frappe.db.get_value(
			"Department",
			{"company": "Kandil PARITY TEST B"},
			["name", "department_name", "is_group"],
			as_dict=True,
		)
		if not other:
			other = self.f.insert(
				"Department", company="Kandil PARITY TEST B", department_name=self.f.prefix + " Foreign"
			).as_dict()
		doc = self.batch(
			"Units",
			[
				dict(
					external_code="foreign",
					title=other.department_name,
					target=other.name,
					is_group=other.is_group,
				)
			],
		)
		with acting_as(self.f.users["sector"]), self.f.rejected(frappe.ValidationError):
			api.review_import(doc.name, str(doc.modified))
		self.assertEqual(frappe.db.count(command_audit.DOCTYPE, {"target_name": doc.name}), 0)
		doc.reload()
		self.assertEqual(doc.status, "Draft")

	def test_disabled_parity_adapter_is_read_write_free_noop(self):
		with (
			patch.dict(frappe.conf, {"kandil_parity_enabled": 0}),
			patch.object(
				revision_import_audit, "project", side_effect=AssertionError("No projection outside parity")
			),
			patch.object(
				revision_import_audit, "rows", side_effect=AssertionError("No locks outside parity")
			),
			patch.object(
				command_audit, "record_command", side_effect=AssertionError("No audit outside parity")
			),
		):
			self.assertIsNone(revision_import_audit.before(None))
			self.assertEqual(revision_import_audit.revision_related(None), [])
			self.assertEqual(revision_import_audit.import_related(None, None), [])
			self.assertIsNone(
				revision_import_audit.record("apply_import", None, None, None, None, None, None, None)
			)


def run():
	from kandil_hr.foundation.tests_runner import RecordedResult

	if (
		frappe.local.site != "kandil-parity.localhost"
		or not frappe.conf.get("allow_tests")
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
	):
		raise RuntimeError("Revision/import audit tests require isolated parity CLI")
	paths = [
		Path(__file__),
		Path(api.__file__),
		Path(audit_projections.__file__),
		Path(revision_import_audit.__file__),
		Path(command_audit.__file__),
	]
	before = {
		str(p.relative_to(Path(__file__).parents[2])): hashlib.sha256(p.read_bytes()).hexdigest()
		for p in paths
	}
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2, resultclass=RecordedResult).run(
		unittest.defaultTestLoader.loadTestsFromTestCase(TestRevisionImportAudit)
	)
	after = {
		str(p.relative_to(Path(__file__).parents[2])): hashlib.sha256(p.read_bytes()).hexdigest()
		for p in paths
	}
	report = dict(
		suite="revision-import-command-audit",
		checked_at=datetime.now(UTC).isoformat(),
		site=frappe.local.site,
		total=result.testsRun,
		successful=result.wasSuccessful() and not result.skipped and result.testsRun == 11,
		checks=result.checks,
		source_hashes=after,
		source_unchanged=before == after,
		fixtures_rolled_back=True,
		limitations=[
			"Private database envelope; no external audit anchoring or production acceptance.",
			"Native designation identity is global; captured only when explicitly referenced by reviewed company import.",
		],
	)
	if not report["successful"]:
		print(json.dumps(report))
		raise AssertionError("Revision/import audit suite failed")
	return report
