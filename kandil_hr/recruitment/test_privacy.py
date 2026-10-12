"""Native confidential-note and shared-snapshot boundary proof on synthetic parity."""

import json
import unittest

import frappe

from kandil_hr.recruitment import api
from kandil_hr.recruitment.privacy import shared_snapshot
from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as


class TestRecruitmentPrivacy(TestRecruitmentCommands):
	def note(self, request, text=None):
		with acting_as(self.users["hr"]):
			return frappe.get_doc(
				dict(doctype="Kandil HR Note", request=request, note=text or self.secret)
			).insert()

	def setUp(self):
		super().setUp()
		self.secret = "PRIVATE-HR-" + self.prefix

	def test_note_is_private_across_request_response_timeline_notices_print(self):
		from frappe.client import get, get_list
		from frappe.desk.form.load import getdoc
		from frappe.www.printview import get_html_and_style

		req = self.request()
		self.submit(req.name)
		counts = self.counts(req.name)
		note = self.note(req.name)
		self.assertEqual(self.counts(req.name), counts)
		self.decide(req.name, "manager")
		self.assertGreater(
			self.counts(req.name)["Kandil Notification Outbox"], counts["Kandil Notification Outbox"]
		)
		with acting_as(self.users["hr"]):
			self.assertEqual(get("Kandil HR Note", note.name)["note"], self.secret)
		with acting_as(self.users["requester"]):
			self.assertNotIn(self.secret, api.dump(get("Kandil Hiring Request", req.name)))
			previous = frappe.local.response
			frappe.local.response = frappe._dict(docs=[])
			try:
				getdoc("Kandil Hiring Request", req.name)
				self.assertNotIn(self.secret, api.dump(frappe.local.response))
			finally:
				frappe.local.response = previous
			for dt in ("Kandil Request Revision", "Kandil Recruitment Event"):
				rows = get_list(dt, fields=["*"], filters={"request": req.name})
				self.assertTrue(rows)
				self.assertNotIn(self.secret, api.dump(rows))
			rendered = get_html_and_style("Kandil Hiring Request", req.name)
			self.assertIn(req.title, rendered["html"])
			self.assertNotIn(self.secret, api.dump(rendered))
		with acting_as("Administrator"):
			notices = frappe.get_all(
				"Kandil Notification Outbox", filters={"reference_name": req.name}, fields=["*"]
			)
			self.assertTrue(notices)
			self.assertNotIn(self.secret, api.dump(notices))
			self.assertFalse(
				frappe.db.exists(
					"Comment",
					{
						"reference_doctype": "Kandil Hiring Request",
						"reference_name": req.name,
						"content": ["like", "%" + self.secret + "%"],
					},
				)
			)

	def test_requester_cannot_read_create_search_export_or_print_notes(self):
		from frappe.client import get, get_list
		from frappe.desk.reportview import export_query
		from frappe.www.printview import get_html_and_style

		req = self.request()
		note = self.note(req.name)
		with acting_as(self.users["requester"]):
			for operation in (
				lambda: get("Kandil HR Note", note.name),
				lambda: get_list("Kandil HR Note", fields=["name", "note"]),
				lambda: get_html_and_style("Kandil HR Note", note.name),
				lambda: frappe.get_doc(
					dict(doctype="Kandil HR Note", request=req.name, note="forged")
				).insert(),
			):
				with self.rejected(frappe.PermissionError):
					operation()
			previous = frappe.local.form_dict
			frappe.local.form_dict = frappe._dict(
				doctype="Kandil HR Note", fields='["name", "note"]', file_format_type="CSV"
			)
			try:
				with self.rejected(frappe.PermissionError):
					export_query()
			finally:
				frappe.local.form_dict = previous

	def test_note_immutable_and_correction_is_separate(self):
		from frappe.client import delete, save

		req = self.request()
		note = self.note(req.name)
		with acting_as(self.users["hr"]):
			changed = note.as_dict()
			changed["note"] = "replacement"
			with self.rejected(frappe.PermissionError):
				save(json.dumps(changed, default=str))
			with self.rejected(frappe.PermissionError):
				delete("Kandil HR Note", note.name)
		second = self.note(req.name, "Correction: " + self.secret)
		self.assertNotEqual(second.name, note.name)
		self.assertEqual(frappe.db.get_value("Kandil HR Note", note.name, "note"), self.secret)

	def test_sensitive_grant_revocation_removes_note_detail_and_list_access(self):
		from frappe.client import get, get_list

		req = self.request()
		note = self.note(req.name)
		frappe.db.set_value("Kandil Access Grant", self.grants["hr"], "can_view_sensitive", 0)
		with acting_as(self.users["hr"]):
			with self.rejected(frappe.PermissionError):
				get("Kandil HR Note", note.name)
			self.assertEqual(get_list("Kandil HR Note", filters={"request": req.name}), [])
			with self.rejected(frappe.PermissionError):
				frappe.get_doc(dict(doctype="Kandil HR Note", request=req.name, note="denied")).insert()
		self.assertEqual(frappe.db.count("Kandil HR Note", {"request": req.name}), 1)

	def test_snapshot_schema_excludes_internal_pay_and_nested_custom_fields(self):
		req = self.request()
		req.hr_internal_notes = self.secret
		req.custom_salary = self.secret
		req.lines[0].custom_salary = self.secret
		req.append(
			"approval_steps",
			dict(
				principal=self.users["manager"],
				authority="HR Approval",
				custom_salary=self.secret,
				reviewed_snapshot=self.secret,
			),
		)
		snapshot = shared_snapshot(req)
		self.assertNotIn(self.secret, api.dump(snapshot))
		self.assertEqual(snapshot["revision"], 1)
		self.assertEqual(snapshot["lines"][0]["requested_qty"], 2)
		self.assertEqual(snapshot["approval_steps"][0]["principal"], self.users["manager"])

	def test_note_does_not_change_immutable_approval_snapshot_or_public_result(self):
		req = self.request()
		self.submit(req.name)
		self.decide(req.name, "manager")
		before = frappe.db.get_value(
			"Kandil Approval Step", self.load(req.name).approval_steps[0].name, "reviewed_snapshot"
		)
		self.note(req.name)
		result = self.decide(req.name, "hr")
		self.assertNotIn(self.secret, api.dump(result))
		self.assertEqual(
			frappe.db.get_value(
				"Kandil Approval Step", self.load(req.name).approval_steps[0].name, "reviewed_snapshot"
			),
			before,
		)
		with acting_as(self.users["requester"]):
			from frappe.client import get_list

			for row in get_list(
				"Kandil Request Revision", fields=["snapshot_json"], filters={"request": req.name}
			):
				self.assertNotIn(self.secret, row.snapshot_json)
				self.assertNotIn("hr_internal_notes", row.snapshot_json)
				self.assertNotIn("custom_salary", row.snapshot_json)

	def test_requester_cannot_export_shared_snapshots_or_nested_reviewed_payloads(self):
		from frappe.desk.reportview import export_query

		req = self.request()
		self.submit(req.name)
		self.note(req.name)
		self.decide(req.name, "manager")
		previous = frappe.local.form_dict
		try:
			with acting_as(self.users["requester"]):
				for doctype, field in (
					("Kandil Request Revision", "snapshot_json"),
					("Kandil Hiring Request", "submitted_snapshot"),
				):
					frappe.local.form_dict = frappe._dict(
						doctype=doctype, fields=json.dumps(["name", field]), file_format_type="CSV"
					)
					with self.rejected(frappe.PermissionError):
						export_query()
		finally:
			frappe.local.form_dict = previous

	def test_noted_draft_cannot_move_scope_but_can_edit_quantity_and_public_text(self):
		from frappe.client import save

		req = self.request((2,))
		note = self.note(req.name)
		with acting_as(self.users["requester"]):
			moved = self.load(req.name).as_dict()
			moved["lines"][0]["capacity"] = self.capacities[1]
			with self.rejected(frappe.PermissionError):
				save(json.dumps(moved, default=str))
			current = self.load(req.name)
			self.assertEqual(current.lines[0].capacity, self.capacities[0])
			current.title = "Public title correction"
			current.lines[0].requested_qty = 1
			current.save()
			self.assertEqual(self.load(req.name).lines[0].requested_qty, 1)
		self.assertEqual(frappe.db.get_value("Kandil HR Note", note.name, "request"), req.name)
		self.assertEqual(frappe.db.get_value("Kandil HR Note", note.name, "note"), self.secret)


def run():
	import sys
	from datetime import UTC, datetime

	names = [name for name in TestRecruitmentPrivacy.__dict__ if name.startswith("test_")]
	suite = unittest.TestSuite(TestRecruitmentPrivacy(name) for name in names)
	result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2).run(suite)
	summary = dict(
		suite="recruitment-confidential-notes",
		checked_at=datetime.now(UTC).isoformat(),
		tests_run=result.testsRun,
		failures=len(result.failures),
		errors=len(result.errors),
		skipped=len(result.skipped),
		successful=result.wasSuccessful() and not result.skipped,
		fixtures_rolled_back=True,
		cases=names,
	)
	if not summary["successful"]:
		print(json.dumps(summary))
		raise AssertionError("Privacy suite failed; see exact test errors")
	return summary
