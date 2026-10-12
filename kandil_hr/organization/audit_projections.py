"""Explicit private projections for revision approvals and reviewed imports.

No arbitrary document serialization; the central audit validator consumes the
same field and child allowlists. Credentials and unrelated employee facts are
never part of these projections.
"""

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
CHILD_COMMON = ("name", "idx")
CHILD_FIELDS = {
	"Kandil JD Revision": {
		"competencies": (
			*CHILD_COMMON,
			"competency",
			"competency_ar",
			"weight",
			"measure",
			"target",
			"competency_group",
			"required_level",
			"behavior",
			"behavior_ar",
			"measure_ar",
		),
		"responsibility_rows": (*CHILD_COMMON, "area", "description", "description_ar"),
		"kpis": (
			*CHILD_COMMON,
			"indicator",
			"indicator_ar",
			"kind",
			"weight",
			"formula",
			"formula_ar",
			"frequency",
		),
		"authorities": (*CHILD_COMMON, "decision", "decision_ar", "authority_level"),
	}
}
PROJECTION_FIELDS = {
	"Kandil JD Revision": (
		*COMMON,
		"position",
		"revision",
		"supersedes",
		"grade_band",
		"valid_from",
		"purpose",
		"purpose_ar",
		"responsibilities",
		"responsibilities_ar",
		"qualifications",
		"approved_by",
		"approved_at",
		"designation",
		"job_level",
		"responsibility_reason",
		"qualifications_ar",
		"experience",
		"experience_ar",
		"technical_skills",
		"technical_skills_ar",
		"working_conditions",
		"working_conditions_ar",
		"certifications",
		"certifications_ar",
	),
	"Kandil Grade Band": (
		*COMMON,
		"grade_code",
		"title",
		"valid_from",
		"valid_until",
		"currency",
		"minimum",
		"maximum",
		"approved_by",
	),
	"Kandil Organization Import": (
		*COMMON,
		"rows_json",
		"preview_json",
		"digest",
		"reviewed_by",
		"result_json",
		"import_kind",
		"baseline_reference",
	),
	"Kandil Organization Code": (
		*COMMON,
		"entity_type",
		"external_code",
		"title",
		"job_family",
		"target_doctype",
		"target_name",
		"import_batch",
	),
	"Department": (*COMMON, "department_name", "parent_department", "is_group", "disabled"),
	"Designation": (*COMMON, "designation_name", "description"),
}
PROJECTION_FIELDS.update(
	{
		"Kandil Capacity": (
			*COMMON,
			"position",
			"designation",
			"structural",
			"occupied",
			"reserved",
			"open_slots",
			"available",
			"occupancy_basis",
			"occupancy_as_of",
		),
		"Kandil Position": (
			*COMMON,
			"position_code",
			"title",
			"title_ar",
			"designation",
			"structural",
			"closed_on",
			"external_id",
			"job_family",
		),
		"Kandil Position Hierarchy": (
			*COMMON,
			"position",
			"parent_position",
			"authority",
			"valid_from",
			"valid_until",
			"structure_change",
		),
		"Kandil Position Assignment": (
			*COMMON,
			"position",
			"employee",
			"user",
			"allocation",
			"valid_from",
			"valid_until",
			"remarks",
			"is_voided",
			"void_reason",
			"voided_by",
			"voided_on",
		),
		"Kandil Structure Snapshot": (*COMMON, "as_of", "payload_json", "structure_change", "digest"),
	}
)


# Only declared temporal schema fields are parsed. User-authored text resembling
# a date, including raw import JSON and descriptions, stays byte-for-byte text.
DATE_FIELDS = frozenset({"valid_from", "valid_until", "closed_on", "as_of", "occupancy_as_of"})
DATETIME_FIELDS = frozenset({"creation", "modified", "approved_at", "voided_on"})


def temporal(field, value):
	if not value:
		return value
	from frappe.utils import get_datetime, getdate

	if field in DATE_FIELDS:
		return getdate(value).isoformat()
	if field in DATETIME_FIELDS:
		return get_datetime(value).isoformat()
	return value


def project(doc):
	from kandil_hr.foundation.command_audit import copy

	fields = PROJECTION_FIELDS[doc.doctype]
	value = {field: temporal(field, doc.get(field)) for field in fields}
	for table, allowed in CHILD_FIELDS.get(doc.doctype, {}).items():
		value[table] = [{field: row.get(field) for field in allowed} for row in doc.get(table) or []]
	return copy(value)
