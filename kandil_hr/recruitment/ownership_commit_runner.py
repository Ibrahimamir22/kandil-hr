"""Synthetic committed User hook proof. Exclusive parity DB slot is required.

Capture exactly the native documents inserted by this fixture and remove only
those UUID fixture documents and their child rows. Restore the one existing
company settings record changed by the shared fixture. No generic ToDo proof.
"""

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import frappe
from frappe.model.document import Document

from kandil_hr.recruitment import ownership
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.test_ownership import TestOwnership


def run():
	if (
		not frappe.conf.get("allow_tests")
		or str(frappe.local.site) != "kandil-parity.localhost"
		or frappe.session.user != "Administrator"
	):
		raise RuntimeError("Exclusive synthetic parity Administrator test only")
	company = frappe.db.get_value("Company", {"company_name": ["like", "%TEST%"]}, "name")
	if not company:
		raise RuntimeError("Synthetic company required")
	prior_settings = (
		frappe.get_doc("Kandil Organization Settings", company).as_dict()
		if frappe.db.exists("Kandil Organization Settings", company)
		else None
	)
	inserted = []
	original_insert = Document.insert
	fixture = TestOwnership("test_owner_default_and_native_forgery_denied")
	original_user = frappe.session.user

	def record_insert(doc, *args, **kwargs):
		result = original_insert(doc, *args, **kwargs)
		key = (doc.doctype, doc.name)
		if key not in inserted:
			inserted.append(key)
		return result

	checks = []
	with patch.object(Document, "insert", record_insert):
		try:
			fixture.setUp()
			name, opening, app = fixture.fixture()
			fixture.app_call(
				"manager",
				ownership.set_next_action,
				name,
				app,
				task="Synthetic follow-up survives disable",
				due="",
				owner=fixture.users["manager"],
			)
			with acting_as(fixture.users["hr"]):
				second = frappe.get_doc(
					dict(
						doctype="Job Applicant",
						applicant_name=fixture.prefix + " second",
						phone_number="01098765432",
						job_title=opening,
					)
				).insert()
			fixture.app_call(
				"hr",
				ownership.set_next_action,
				name,
				second,
				task="Second account follow-up",
				due="",
				owner=fixture.users["hr"],
			)
			frappe.db.commit()
			checks.append("UUID fixture committed with accountable owner and next-action owner")
			# Savepoint rollback retains callbacks in Frappe; callback must inspect
			# the committed enabled state before touching any ownership records.
			frappe.db.savepoint("ownership_disable_rollback")
			user = frappe.get_doc("User", fixture.users["manager"])
			user.enabled = 0
			user.save()
			frappe.db.rollback(save_point="ownership_disable_rollback")
			frappe.db.commit()
			app.reload()
			assert app.custom_kandil_responsible_user == fixture.users["manager"]
			assert frappe.db.get_value("User", user.name, "enabled") == 1
			checks.append("Native disable rolled back to savepoint then commit leaves ownership intact")
			user = frappe.get_doc("User", user.name)
			user.enabled = 0
			user.save()
			other_user = frappe.get_doc("User", fixture.users["hr"])
			other_user.enabled = 0
			other_user.save()
			frappe.db.commit()  # real on_update registration and real after_commit callback
			app.reload()
			assert not app.custom_kandil_responsible_user and not app.custom_kandil_next_action_owner
			assert app.custom_kandil_next_action == "Synthetic follow-up survives disable"
			history = json.loads(app.custom_kandil_ownership_history)
			assert sum(row["action"] == "Account disabled" for row in history) == 1
			assert history[-1]["actor"] == "Administrator"
			team = frappe.get_doc("Job Opening", opening)
			assert user.name not in [row.user for row in team.custom_kandil_team]
			checks.append(
				"Committed native disable invokes cleanup once, preserves task and immutable original-actor history"
			)
			second.reload()
			assert not second.custom_kandil_responsible_user and not second.custom_kandil_next_action_owner
			assert second.custom_kandil_next_action == "Second account follow-up"
			assert (
				sum(
					row["action"] == "Account disabled"
					for row in json.loads(second.custom_kandil_ownership_history)
				)
				== 1
			)
			assert not frappe.db.get_value("Job Opening", opening, "custom_kandil_lead")
			checks.append("Two accounts disabled in one native commit both receive their cleanup callbacks")
			assert ownership.handoff_disabled_user(user.name) == dict(openings=0, applications=0)
			frappe.db.commit()
			checks.append("Repeated cleanup is idempotent")
		finally:
			frappe.db.rollback()
			frappe.set_user("Administrator")
			# Cleanup uses captured concrete inserted IDs, never broad prefix scans.
			for doctype, docname in reversed(inserted):
				for field in frappe.get_meta(doctype).get_table_fields():
					frappe.db.delete(field.options, {"parent": docname, "parenttype": doctype})
				frappe.db.delete(doctype, {"name": docname})
			if prior_settings:
				restored = frappe.get_doc(prior_settings)
				restored.db_update()
				for field in restored.meta.get_table_fields():
					frappe.db.delete(field.options, {"parent": restored.name, "parenttype": restored.doctype})
					for child in restored.get(field.fieldname) or []:
						child.db_insert()
			frappe.db.commit()
			remaining = sum(bool(frappe.db.exists(dt, n)) for dt, n in inserted)
			if hasattr(fixture, "flags_patch"):
				fixture.flags_patch.stop()
			frappe.set_user(original_user)
			assert remaining == 0, "Captured synthetic records were not fully removed"
	checks.append("All captured UUID fixture documents and child records cleaned; original settings restored")
	root = Path(frappe.get_app_path("kandil_hr")).parent
	paths = [
		"kandil_hr/recruitment/ownership.py",
		"kandil_hr/recruitment/ownership_commit_runner.py",
		"kandil_hr/recruitment/vacancies.py",
		"kandil_hr/hooks.py",
	]
	return dict(
		checked_at=datetime.now(UTC).isoformat(),
		site=frappe.local.site,
		checks=checks,
		passed=len(checks),
		cleaned_documents=len(inserted),
		source_sha256={p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in paths},
		limits=[
			"Synthetic local committed callback proof; no browser User disable or generic ToDo coverage.",
			"No external email; no production traffic.",
		],
	)
