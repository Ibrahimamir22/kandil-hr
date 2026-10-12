"""Private audit of original joining outcomes, including pre-refresh ledgers.

The public endpoint has no client command ID or reviewed-version argument.
Its audit therefore identifies a server invocation against the locked original
Offer version; that version does not claim a client reviewed the same screen.
"""

import hashlib

import frappe

COMMON = (
	"doctype",
	"name",
	"company",
	"department",
	"branch",
	"status",
	"docstatus",
	"owner",
	"creation",
	"modified",
	"modified_by",
)
PROJECTION_FIELDS = {
	"Employee": (
		*COMMON,
		"first_name",
		"middle_name",
		"last_name",
		"employee_name",
		"date_of_birth",
		"gender",
		"date_of_joining",
		"relieving_date",
		"designation",
		"user_id",
		"personal_email",
		"cell_number",
		"job_applicant",
		"job_offer",
		"custom_kandil_offer",
		"custom_kandil_applicant",
		"custom_kandil_joining_voided",
	),
	"Employee Onboarding": (
		*COMMON,
		"employee",
		"employee_name",
		"job_applicant",
		"job_offer",
		"date_of_joining",
		"boarding_begins_on",
		"notify_users",
		"project",
		"custom_kandil_joining_voided",
	),
	"Job Offer": (
		*COMMON,
		"job_applicant",
		"applicant_name",
		"offer_date",
		"designation",
		"custom_kandil_outcome",
		"custom_kandil_outcome_reason",
		"custom_kandil_assignment",
		"custom_kandil_joining_voided",
		"custom_kandil_void_reason",
		"custom_kandil_voided_by",
		"custom_kandil_voided_on",
	),
}
CHILD_FIELDS = {
	"Employee Onboarding": {
		"activities": (
			"name",
			"idx",
			"activity_name",
			"user",
			"role",
			"begin_on",
			"duration",
			"task",
			"task_weight",
			"required_for_employee_creation",
			"description",
		)
	},
}
DATE_FIELDS = frozenset(
	{"date_of_birth", "date_of_joining", "relieving_date", "boarding_begins_on", "offer_date"}
)
DATETIME_FIELDS = frozenset({"creation", "modified", "custom_kandil_voided_on"})


def project(doc):
	from frappe.utils import get_datetime, getdate

	from kandil_hr.foundation.command_audit import copy

	value = {}
	for field in PROJECTION_FIELDS[doc.doctype]:
		item = doc.get(field)
		if item and field in DATE_FIELDS:
			item = getdate(item).isoformat()
		elif item and field in DATETIME_FIELDS:
			item = get_datetime(item).isoformat()
		value[field] = item
	for table, fields in CHILD_FIELDS.get(doc.doctype, {}).items():
		value[table] = [{field: row.get(field) for field in fields} for row in doc.get(table) or []]
	return copy(value)


def start(doc):
	"""Company/request are locked; acquire capacities before refresh can save."""
	from kandil_hr.foundation import command_audit

	if not command_audit.active():
		return None
	before = []
	for name in sorted({line.capacity for line in doc.lines}):
		cap = frappe.get_doc("Kandil Capacity", name, for_update=True)
		if cap.company != doc.company:
			raise frappe.PermissionError("Joining audit capacity is outside the request company")
		before.append(command_audit.project_related(cap))
	return dict(before=command_audit.project_request(doc), related_before=before)


def attach(context, doc, cap, offer, applicant, opening):
	"""Add the already verified source lineage before authorization User locks."""
	if context is None:
		return
	from kandil_hr.foundation import command_audit

	if (
		offer.job_applicant != applicant.name
		or applicant.job_title != opening.name
		or opening.custom_kandil_request != doc.name
	):
		raise frappe.PermissionError("Joining audit source lineage does not match the request")
	context["offer_version"] = str(offer.modified)
	sources = [offer, applicant, opening]
	if cap.position:
		sources.append(frappe.get_doc("Kandil Position", cap.position, for_update=True))
		from kandil_hr.organization.current import rows

		for row in rows(
			"Kandil Position Assignment",
			filters={"company": doc.company, "position": cap.position},
			fields=["name"],
		):
			sources.append(frappe.get_doc("Kandil Position Assignment", row.name, for_update=True))
	for record in sources:
		if record.get("company") and record.company != doc.company:
			raise frappe.PermissionError("Joining audit source is outside the request company")
		context["related_before"].append(command_audit.project_related(record))


def finish(context, doc, payload, result):
	from kandil_hr.foundation import command_audit

	if context is None or not command_audit.active():
		return None
	operation = "record_outcome"
	identity = hashlib.sha256(
		command_audit.canonical(
			[operation, doc.name, payload["offer_name"], frappe.session.user, context["offer_version"]]
		).encode()
	).hexdigest()
	related_after = []
	targets = {(row["doctype"], row["name"]) for row in context["related_before"]}
	for kind, field in (
		("Employee", "employee"),
		("Kandil Position Assignment", "assignment"),
		("Employee Onboarding", "onboarding"),
	):
		if result.get(field):
			targets.add((kind, result[field]))
	for doctype, name in sorted(targets):
		record = frappe.get_doc(doctype, name, for_update=True)
		if record.get("company") and record.company != doc.company:
			raise frappe.PermissionError("Joining audit effect is outside the request company")
		related_after.append(command_audit.project_related(record))
	return command_audit.record_command(
		domain="recruitment",
		operation=operation,
		command_id=identity,
		command_origin="server_invocation",
		receipt_key=identity,
		reviewed_version=context["offer_version"],
		target=doc,
		before=context["before"],
		after=command_audit.project_request(doc),
		payload=payload,
		result=result,
		related_before=context["related_before"],
		related_after=related_after,
		principal=frappe.session.user,
	)
