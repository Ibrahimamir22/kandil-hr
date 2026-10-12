"""Returned structure revision and final Create receipt proof using ordinary users."""

import json
import uuid

import frappe
from frappe.utils import today

from kandil_hr.organization import api
from kandil_hr.organization.integration_tests import user


def run_cases(ctx):
	company, department, branch, designation, hr = (
		ctx[k] for k in ("company", "department", "branch", "designation", "hr")
	)
	checks = []

	def denied(fn):
		point = "returned" + uuid.uuid4().hex
		frappe.db.savepoint(point)
		try:
			fn()
		except frappe.ValidationError, frappe.PermissionError, frappe.TimestampMismatchError:
			frappe.db.rollback(save_point=point)
		else:
			raise AssertionError("Expected structural return boundary rejection")

	operation = dict(
		action="Create",
		draft_key="returned-create",
		title="Synthetic returned position",
		department=department,
		branch=branch,
		designation=designation,
		authority="Department Approval",
	)
	before = frappe.db.count("Kandil Position", {"company": company})
	with user(hr):
		doc = frappe.get_doc(
			dict(
				doctype="Kandil Structure Change",
				company=company,
				effective_on=today(),
				reason="Synthetic revised structural need",
				changes_json=json.dumps([operation]),
			)
		).insert()
		preview = api.preview_structure(doc.name)
		doc.reload()
		api.submit_structure(doc.name, preview["preview_hash"], uuid.uuid4().hex, str(doc.modified))
	doc.reload()
	step = doc.approval_steps[0]
	old_step = step.step_key
	args = dict(
		name=doc.name,
		preview_hash=doc.preview_hash,
		decision="Returned",
		step_id=step.step_key,
		command_id=uuid.uuid4().hex,
		expected_version=str(doc.modified),
		comment="Clarify the position title",
	)
	with user(step.principal):
		denied(lambda: api.decide_structure(**{**args, "comment": " "}))
		denied(lambda: api.decide_structure(**{**args, "decision": "Rejected", "comment": "no"}))
		returned = api.decide_structure(**args)
		assert api.decide_structure(**args) == returned
		denied(lambda: api.decide_structure(**{**args, "comment": "Changed replay reason"}))
	assert returned["status"] == "Returned"
	assert frappe.db.count("Kandil Position", {"company": company}) == before
	doc.reload()
	assert doc.approval_steps[0].comment == args["comment"] and not doc.preview_hash
	checks.append(
		"Return and reject require a reason; return replay is stable and changed replay is rejected"
	)
	with user(step.principal):
		changed = frappe.get_doc(doc.doctype, doc.name)
		changed.reason = "Non-author cannot edit"
		denied(changed.save)
		denied(lambda: api.preview_structure(doc.name))
	with user(hr):
		changed = frappe.get_doc(doc.doctype, doc.name)
		changed.approval_steps[0].comment = "Forged history"
		denied(changed.save)
		changed = frappe.get_doc(json.loads(frappe.as_json(frappe.get_doc(doc.doctype, doc.name))))
		operation["title"] = "Synthetic corrected position"
		changed.changes_json = json.dumps([operation])
		changed.save()
		denied(
			lambda: api.submit_structure(
				doc.name, preview["preview_hash"], uuid.uuid4().hex, str(changed.modified)
			)
		)
		preview = api.preview_structure(doc.name)
		changed.reload()
		api.submit_structure(doc.name, preview["preview_hash"], uuid.uuid4().hex, str(changed.modified))
	doc.reload()
	route = json.loads(doc.route_snapshot)
	assert route["round"] == 2 and route["history"][0]["steps"][0]["comment"] == args["comment"]
	assert route["history"][0]["changes"][0]["title"] == "Synthetic returned position"
	assert all(s.step_key != old_step and s.decision == "Pending" for s in doc.approval_steps)
	checks.append(
		"Only author revises returned content; protected prior reason/proposal retained; fresh preview and fresh independent steps required"
	)
	with user(step.principal):
		denied(
			lambda: api.decide_structure(
				**{**args, "command_id": uuid.uuid4().hex, "expected_version": str(doc.modified)}
			)
		)
	while doc.status == "Pending":
		step = next(s for s in doc.approval_steps if s.decision == "Pending")
		final_args = dict(
			name=doc.name,
			preview_hash=doc.preview_hash,
			decision="Approved",
			step_id=step.step_key,
			command_id=uuid.uuid4().hex,
			expected_version=str(doc.modified),
			comment="Reviewed corrected request",
		)
		with user(step.principal):
			result = api.decide_structure(**final_args)
		doc.reload()
		if doc.status == "Pending":
			assert frappe.db.count("Kandil Position", {"company": company}) == before
	assert doc.status == "Approved"
	created = json.loads(doc.created_positions_json)[operation["draft_key"]]
	with user(step.principal):
		assert api.decide_structure(**final_args) == result
	assert frappe.db.count("Kandil Position", {"company": company}) == before + 1
	assert frappe.db.count("Kandil Capacity", {"position": created}) == 1
	assert frappe.db.get_value("Kandil Position", created, "title") == operation["title"]
	checks.append(
		"Old step cannot decide new round; independent HR and CEO create exactly one Position and one capacity; final receipt replay creates none"
	)
	with user(hr):
		rejected = frappe.get_doc(
			dict(
				doctype="Kandil Structure Change",
				company=company,
				effective_on=today(),
				reason="Synthetic rejected need",
				changes_json=json.dumps([operation]),
			)
		).insert()
		preview = api.preview_structure(rejected.name)
		rejected.reload()
		api.submit_structure(rejected.name, preview["preview_hash"], uuid.uuid4().hex, str(rejected.modified))
	rejected.reload()
	step = rejected.approval_steps[0]
	with user(step.principal):
		api.decide_structure(
			rejected.name,
			rejected.preview_hash,
			"Rejected",
			step.step_key,
			uuid.uuid4().hex,
			str(rejected.modified),
			"Need is not justified",
		)
	rejected.reload()
	assert rejected.status == "Rejected" and rejected.approval_steps[0].comment == "Need is not justified"
	with user(hr):
		denied(lambda: api.preview_structure(rejected.name))
		denied(rejected.save)
	assert frappe.db.count("Kandil Position", {"company": company}) == before + 1
	checks.append(
		"Terminal rejection retains its reason, creates no Position and cannot be reopened or edited"
	)
	return dict(case_id="AT-ORG-006-02", status="PASS", assertions=checks)
