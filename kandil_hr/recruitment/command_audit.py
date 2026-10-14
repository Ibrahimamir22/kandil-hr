"""Explicit effect targets for the versioned recruitment command boundary.

No unrestricted doc.as_dict() snapshots or confidential-note copies. Related
records are selected through the locked request and explicit command arguments.
Commands outside recruitment.api.command remain separate integration work.
"""

import hashlib

import frappe
from frappe import _


def request_state(doc):
	from kandil_hr.foundation.command_audit import project_request

	return project_request(doc)


def related_state(doc, operation, payload, result=None, previous=()):
	from kandil_hr.foundation.command_audit import project_related
	from kandil_hr.organization.current import rows

	targets = {}

	def add(kind, name):
		if not name or (kind, name) in targets:
			return targets.get((kind, name))
		if frappe.get_meta(kind).has_field("company"):
			company = frappe.db.get_value(kind, name, "company")
			if company and company != doc.company:
				frappe.throw(
					_("Audit effect targets must belong to the request company."), frappe.PermissionError
				)
		record = frappe.get_doc(kind, name, for_update=True)
		if record.get("company") and record.company != doc.company:
			frappe.throw(
				_("Audit effect targets must belong to the request company."), frappe.PermissionError
			)
		targets[(kind, name)] = record
		return record

	requests = [doc]
	if doc.amends:
		requests.append(add(doc.doctype, doc.amends))
	if operation == "amend" and result and result.get("name") != doc.name:
		requests.append(add(doc.doctype, result["name"]))
	for request in requests:
		# Preserve the requested position location at command time for historical scope.
		add("Kandil Position", request.requested_position)
		for line in request.lines:
			add("Kandil Capacity", line.capacity)
			add("Job Opening", line.job_opening)
	if operation == "hr_correction":
		for name in sorted((payload.get("relocations") or {}).values()):
			add("Kandil Capacity", name)
	opening_names = {name for kind, name in targets if kind == "Job Opening"}
	if operation in ("candidate_intake", "candidate_identity_migrate", "candidate_profile_correct"):
		if payload.get("opening") not in opening_names:
			frappe.throw(_("The candidate vacancy does not belong to this request."), frappe.PermissionError)
		if operation == "candidate_profile_correct":
			anchor = frappe.db.get_value("Job Applicant", payload.get("application"), ["job_title", "custom_kandil_person"], as_dict=True)
			if not anchor or anchor.job_title != payload["opening"] or anchor.custom_kandil_person != payload.get("person"):
				frappe.throw(_("The candidate profile does not match this application."), frappe.PermissionError)
		if payload.get("person"):
			add("Kandil Candidate Person", payload["person"])
		applicant = payload.get("application") or (result or {}).get("application")
		if applicant:
			if frappe.db.get_value("Job Applicant", applicant, "job_title") not in opening_names:
				frappe.throw(_("The application does not belong to this request."), frappe.PermissionError)
			app = add("Job Applicant", applicant)
			add("Kandil Candidate Person", app.get("custom_kandil_person"))
		if operation == "candidate_profile_correct" and (result or {}).get("revision"):
			add("Kandil Candidate Profile Revision", result["revision"])
	if operation in ("candidate_activity_record", "candidate_activity_void", "candidate_close"):
		if payload.get("opening") not in opening_names or frappe.db.get_value("Job Applicant", payload["application"], "job_title") != payload["opening"]:
			frappe.throw(_("Activity application does not belong to this request."), frappe.PermissionError)
		add("Job Applicant", payload["application"])
		for name in {payload.get("activity"), (result or {}).get("activity"), (result or {}).get("void_activity"), (result or {}).get("stage_activity")} - {None, ""}:
			if frappe.db.get_value("Kandil Candidate Activity", name, "application") != payload["application"]:
				frappe.throw(_("Activity belongs to another application."), frappe.PermissionError)
			add("Kandil Candidate Activity", name)
	if operation == "candidate_close" and (result or {}).get("closure"):
		closure = add("Kandil Candidate Closure", result["closure"])
		if closure.application != payload["application"]:
			frappe.throw(_("Closure belongs to another application."), frappe.PermissionError)
	if operation in ("application_owner", "application_task"):
		if frappe.db.get_value("Job Applicant", payload["application"], "job_title") not in opening_names:
			frappe.throw(_("The application does not belong to this request."), frappe.PermissionError)
		add("Job Applicant", payload["application"])
	if operation in ("vacancy_team", "bulk_vacancy_team"):
		changed = (
			{payload["opening"]}
			if operation == "vacancy_team"
			else {item["opening_name"] for item in payload["items"]} & opening_names
		)
		if not changed <= opening_names:
			frappe.throw(_("The vacancy does not belong to this request."), frappe.PermissionError)
		for opening in sorted(changed):
			for row in rows(
				"Job Applicant", filters={"job_title": opening}, fields=["name"], order_by="name"
			):
				add("Job Applicant", row.name)
	if operation == "void_joining":
		applicant = frappe.db.get_value("Job Offer", payload["offer"], "job_applicant")
		if frappe.db.get_value("Job Applicant", applicant, "job_title") not in opening_names:
			frappe.throw(_("The offer does not belong to this request."), frappe.PermissionError)
		offer = add("Job Offer", payload["offer"])
		add("Job Applicant", offer.job_applicant)
		add("Kandil Position Assignment", offer.custom_kandil_assignment)
		for kind, field in (("Employee", "custom_kandil_offer"), ("Employee Onboarding", "job_offer")):
			for row in rows(kind, filters={field: offer.name}, fields=["name"], order_by="name"):
				add(kind, row.name)
	# A relocation may remove its old line: retain that target's resulting state.
	for row in previous:
		add(row["doctype"], row["name"])
	result = []
	for (kind, _name), record in sorted(targets.items()):
		value = request_state(record) if kind == "Kandil Hiring Request" else project_related(record)
		if kind == "Job Applicant" and operation in ("candidate_activity_record", "candidate_activity_void", "candidate_close"):
			# Activity audits expose references and change fingerprints, not the
			# candidate's free-text follow-up or accumulated ownership history.
			for field in ("custom_kandil_next_action", "custom_kandil_ownership_reason", "custom_kandil_ownership_history"):
				value[field] = "sha256:" + hashlib.sha256(str(value.get(field) or "").encode()).hexdigest()
		result.append(value)
	return result


def frozen_authority(doc, operation):
	if operation not in ("decide", "review", "send_to_ceo"):
		return {}
	step = next((row for row in doc.approval_steps if row.decision == "Pending"), None)
	return (
		dict(frozen_principal=step.principal, authority=step.authority, step_key=step.step_key)
		if step
		else {}
	)


def completed_authority(doc, authority):
	value = dict(authority)
	if value.get("authority") == "Board Approval":
		step = next((row for row in doc.approval_steps if row.step_key == value["step_key"]), None)
		if step:
			value.update(
				{
					key: step.get(key)
					for key in ("board_member", "board_evidence", "on_behalf_method", "on_behalf_note")
				}
			)
			if step.get("board_evidence"):
				proof = frappe.get_doc("File", step.board_evidence, for_update=True)
				content = proof.get_content()
				content = content.encode("utf-8") if isinstance(content, str) else content
				value["evidence_identity"] = dict(file=proof.name, file_name=proof.file_name,
					sha256=hashlib.sha256(content).hexdigest(), size=len(content))
	return value
