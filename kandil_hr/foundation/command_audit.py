"""Transactional command envelopes, not externally anchored tamper evidence.

Call only after command authorization/domain locks and replay detection. Callers
provide frozen, explicit projections, including related effects they actually
cover. This helper neither commits nor sends notifications nor authorizes work.
No function is whitelisted. Ordinary users cannot read the private envelope.
"""

import hashlib
import json
import math
import re
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.model.document import Document

DOCTYPE = "Kandil Command Audit"
FLAG = "kandil_command_audit_insert"
SECRET_KEYS = frozenset(
	{
		"password",
		"new_password",
		"api_key",
		"api_secret",
		"access_token",
		"refresh_token",
		"authorization",
		"cookie",
		"cookies",
		"sid",
		"session_id",
	}
)
OPERATIONS = {
	"recruitment": frozenset(
		{
			"submit",
			"decide",
			"revise",
			"review",
			"send_to_ceo",
			"amend",
			"cancel",
			"vacancy_state",
			"vacancy_team",
			"bulk_vacancy_team",
			"vacancy_pin",
			"application_owner",
			"application_task",
			"candidate_intake",
			"candidate_identity_migrate",
			"candidate_profile_correct",
			"candidate_source_correct",
			"candidate_referral_change",
			"candidate_referral_bonus",
			"candidate_activity_record",
			"candidate_activity_void",
			"candidate_close",
			"candidate_screen",
			"candidate_reopen",
			"candidate_message_resolve",
			"hr_correction",
			"void_joining",
			"record_outcome",
			"revise_pending_quantities",
		}
	),
	"organization": frozenset({"submit", "decide", "approve_revision", "review_import", "apply_import", "portal_save_jd", "portal_create_jd"}),
	"delegation": frozenset({"create", "revoke", "decide", "revise"}),
}
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
STRUCTURE_FIELDS = (
	*COMMON,
	"effective_on",
	"reason",
	"changes_json",
	"preview_hash",
	"snapshot_hash",
	"approved_by",
	"approved_at",
	"snapshot",
	"route_snapshot",
	"created_positions_json",
)
STRUCTURE_STEP_FIELDS = (
	"name",
	"idx",
	"step_key",
	"authority",
	"principal",
	"authority_position",
	"decision",
	"actor",
	"decided_at",
	"comment",
	"waiting_since",
	"reviewed_snapshot",
)
RELATED_FIELDS = {
	"Kandil Capacity": (
		*COMMON,
		"position",
		"designation",
		"structural",
		"occupied",
		"reserved",
		"open_slots",
		"available",
	),
	"Job Opening": (
		*COMMON,
		"job_title",
		"designation",
		"vacancies",
		"custom_kandil_request",
		"custom_kandil_capacity",
		"custom_kandil_vacancy_state",
		"custom_kandil_lead",
		"custom_kandil_team",
		"custom_kandil_priority_score",
		"custom_kandil_pin_until",
		"custom_kandil_pin_reason",
		"custom_kandil_before_freeze",
		"custom_kandil_before_pause",
		"custom_kandil_started_on",
		"custom_kandil_priority_pin",
	),
	"Kandil Candidate Person": (*COMMON, "identity_state"),
	"Kandil Candidate Message Resolution": (*COMMON, "closure", "application", "outcome", "channel", "provider_verified", "sent_by_system", "content_hash"),
	"Kandil Candidate Reopening": (*COMMON, "closure", "application", "target_stage", "closure_hash", "consent_evidence", "content_hash"),
	"Kandil Candidate Closure": (*COMMON, "application", "decision", "reason_code", "catalog_version", "message_status", "content_hash"),
	"Kandil Referral Revision": (*COMMON, "application", "person", "opening", "sequence", "action", "before_hash", "content_hash"),
	"Kandil Referral Submission": (*COMMON, "application", "person", "opening", "content_hash"),
	"Kandil Agency Submission": (*COMMON, "application", "person", "agency_code", "agency_version", "ownership_from", "ownership_until", "content_hash"),
	"Kandil Source Correction": (*COMMON, "application", "person", "sequence", "previous_revision", "before_hash", "content_hash"),
	"Kandil Candidate Activity": (*COMMON, "application", "person", "kind", "voids", "content_hash", "stage_from", "stage_to", "source_activity", "message_resolution"),
	"Kandil Candidate Profile Revision": (*COMMON, "person", "application", "content_hash", "before_version", "after_version"),
	"Job Applicant": (
		*COMMON,
		"job_title",
		"custom_kandil_person",
		"custom_kandil_identity_origin",
		"custom_kandil_responsible_user",
		"custom_kandil_ownership_state",
		"custom_kandil_ownership_reason",
		"custom_kandil_ownership_history",
		"custom_kandil_next_action",
		"custom_kandil_next_action_due",
		"custom_kandil_next_action_owner",
	),
	"Job Offer": (
		*COMMON,
		"job_applicant",
		"custom_kandil_outcome",
		"custom_kandil_outcome_reason",
		"custom_kandil_assignment",
		"custom_kandil_joining_voided",
		"custom_kandil_void_reason",
		"custom_kandil_voided_by",
		"custom_kandil_voided_on",
	),
	"Employee": (
		*COMMON,
		"user_id",
		"designation",
		"date_of_joining",
		"relieving_date",
		"custom_kandil_offer",
		"custom_kandil_applicant",
		"custom_kandil_joining_voided",
	),
	"Employee Onboarding": (
		*COMMON,
		"employee",
		"job_applicant",
		"job_offer",
		"custom_kandil_joining_voided",
	),
	"Kandil Structure Snapshot": (*COMMON, "as_of", "payload_json", "structure_change", "digest"),
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
	),
	"Kandil Position Assignment": (
		*COMMON,
		"position",
		"employee",
		"user",
		"allocation",
		"valid_from",
		"valid_until",
		"is_voided",
		"void_reason",
		"voided_by",
		"voided_on",
	),
	"Kandil JD Revision": (
		*COMMON,
		"position",
		"revision",
		"supersedes",
		"valid_from",
		"valid_until",
		"approved_by",
		"approved_at",
	),
	"Kandil Grade Band": (
		*COMMON,
		"grade_code",
		"title",
		"currency",
		"minimum",
		"maximum",
		"valid_from",
		"valid_until",
		"approved_by",
	),
}


def normalized(value, depth=0):
	"""Only JSON-compatible primitives plus explicit date/decimal conversions.

	No fallback object repr: arbitrary User/Documents could serialize credentials.
	Secret-key detection fails instead of silently changing reviewed arguments.
	"""
	if depth > 32:
		raise ValueError("Audit payload nesting exceeds the supported bound")
	if value is None or isinstance(value, (str, bool, int)):
		return value
	if isinstance(value, float):
		if not math.isfinite(value):
			raise ValueError("Audit numbers must be finite")
		return value
	if isinstance(value, (datetime, date)):
		return value.isoformat()
	if isinstance(value, Decimal):
		if not value.is_finite():
			raise ValueError("Audit numbers must be finite")
		return str(value)
	if isinstance(value, dict):
		if any(not isinstance(k, str) or k.casefold() in SECRET_KEYS for k in value):
			raise ValueError("Audit payload contains an unsupported or secret field")
		return {k: normalized(v, depth + 1) for k, v in value.items()}
	if isinstance(value, (list, tuple)):
		return [normalized(v, depth + 1) for v in value]
	raise ValueError("Audit payload must use explicit primitive projections")


def canonical(value):
	result = json.dumps(
		normalized(value), sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False
	)
	if len(result.encode("utf-8")) > 2_000_000:
		raise ValueError("Audit projection exceeds the supported bound")
	return result


def copy(value):
	return json.loads(canonical(value))


def project_request(doc):
	from kandil_hr.recruitment.privacy import shared_snapshot

	if doc.doctype != "Kandil Hiring Request":
		raise ValueError("Request projection requires a hiring request")
	return copy(shared_snapshot(doc))


def project_structure(doc):
	if doc.doctype != "Kandil Structure Change":
		raise ValueError("Structure projection requires a structure change")
	value = {key: doc.get(key) for key in STRUCTURE_FIELDS}
	value["approval_steps"] = [
		{key: row.get(key) for key in STRUCTURE_STEP_FIELDS} for row in doc.get("approval_steps") or []
	]
	return copy(value)


def project_related(doc):
	from kandil_hr.foundation import delegation_audit
	from kandil_hr.organization import audit_projections
	from kandil_hr.recruitment import joining_audit

	if doc.doctype == "Kandil Hiring Request":
		return project_request(doc)
	if doc.doctype == "Kandil Delegation":
		return delegation_audit.project(doc)
	if doc.doctype in joining_audit.PROJECTION_FIELDS:
		return joining_audit.project(doc)
	if doc.doctype in audit_projections.PROJECTION_FIELDS:
		return audit_projections.project(doc)
	fields = RELATED_FIELDS.get(doc.doctype)
	if not fields:
		raise ValueError("This related audit target needs an explicit reviewed projection")
	value = {key: doc.get(key) for key in fields}
	if doc.doctype == "Job Opening":
		value["custom_kandil_team"] = [
			{key: row.get(key) for key in ("name", "idx", "user")}
			for row in doc.get("custom_kandil_team") or []
		]
	return copy(value)


def checked_projection(value, *, allow_absent=False):
	from kandil_hr.foundation import delegation_audit
	from kandil_hr.organization import audit_projections
	from kandil_hr.recruitment import joining_audit

	if not isinstance(value, dict) or not value.get("name"):
		raise ValueError("Audit state requires a named projected target")
	doctype = value.get("doctype")
	if (
		allow_absent
		and doctype in ("Kandil Delegation", "Kandil JD Revision")
		and set(value) == {"doctype", "name", "record_exists"}
		and value["record_exists"] is False
	):
		return copy(value)
	children = {}
	if doctype == "Kandil Hiring Request":
		from kandil_hr.recruitment.privacy import LINE_FIELDS, REQUEST_FIELDS, STEP_FIELDS

		allowed = set(REQUEST_FIELDS) | {"lines", "approval_steps"}
		children = {"lines": LINE_FIELDS, "approval_steps": STEP_FIELDS}
	elif doctype == "Kandil Structure Change":
		allowed = set(STRUCTURE_FIELDS) | {"approval_steps"}
		children = {"approval_steps": STRUCTURE_STEP_FIELDS}
	elif doctype == "Kandil Delegation":
		allowed = set(delegation_audit.FIELDS)
	elif doctype in joining_audit.PROJECTION_FIELDS:
		children = joining_audit.CHILD_FIELDS.get(doctype, {})
		allowed = set(joining_audit.PROJECTION_FIELDS[doctype]) | set(children)
	elif doctype in audit_projections.PROJECTION_FIELDS:
		children = audit_projections.CHILD_FIELDS.get(doctype, {})
		allowed = set(audit_projections.PROJECTION_FIELDS[doctype]) | set(children)
	else:
		allowed = set(RELATED_FIELDS.get(doctype, ()))
		if doctype == "Job Opening":
			children = {"custom_kandil_team": ("name", "idx", "user")}
	if not allowed or set(value) - allowed:
		raise ValueError("Audit state contains fields outside its reviewed projection")
	for field, fields in children.items():
		if not isinstance(value.get(field), list) or any(
			not isinstance(row, dict) or set(row) - set(fields) for row in value[field]
		):
			raise ValueError("Audit child state contains unreviewed fields")
	return copy(value)


def related(values):
	result = [checked_projection(value) for value in values]
	keys = [(row["doctype"], row["name"]) for row in result]
	if len(keys) != len(set(keys)):
		raise ValueError("Audit related targets must be unique")
	return sorted(result, key=lambda row: (row["doctype"], row["name"]))


def active():
	return all(
		frappe.conf.get(key)
		for key in ("kandil_pilot_enabled", "kandil_foundation_enabled", "kandil_parity_enabled")
	)


def permission(doc=None, user=None, ptype=None):
	return bool(
		active()
		and (user or frappe.session.user) == "Administrator"
		and ptype in (None, "read", "select", "print")
	)


def query(user=None):
	return "" if active() and (user or frappe.session.user) == "Administrator" else "1=0"


@contextmanager
def insertion():
	old = frappe.flags.get(FLAG)
	frappe.flags[FLAG] = True
	try:
		yield
	finally:
		frappe.flags[FLAG] = old


class KandilCommandAudit(Document):
	def autoname(self):
		if not re.fullmatch(r"[0-9a-f]{64}", self.audit_key or ""):
			frappe.throw(_("Invalid command audit identity."))
		self.name = self.audit_key

	def validate(self):
		if not active() or not frappe.flags.get(FLAG) or not self.is_new():
			frappe.throw(
				_("Command audit records are server generated and immutable."), frappe.PermissionError
			)

	def after_insert(self):
		from kandil_hr.foundation.position_history_index import index_event

		index_event(self)

	def on_trash(self):
		frappe.throw(_("Command audit records cannot be deleted."), frappe.PermissionError)

	def before_rename(self, *args, **kwargs):
		frappe.throw(_("Command audit records cannot be renamed."), frappe.PermissionError)


def record_command(
	*,
	domain,
	operation,
	command_id,
	receipt_key,
	reviewed_version,
	target,
	before,
	after,
	payload,
	result,
	principal=None,
	step_key=None,
	related_before=(),
	related_after=(),
	authority=None,
	command_origin="client_command",
):
	flag = {
		"recruitment": "kandil_transition",
		"organization": "kandil_organization_transition",
		"delegation": "kandil_delegation_audit",
	}.get(domain)
	if not active() or not flag or not frappe.flags.get(flag) or operation not in OPERATIONS[domain]:
		frappe.throw(_("Command audit requires an authorized server transition."), frappe.PermissionError)
	if (
		not isinstance(command_id, str)
		or not 1 <= len(command_id) <= 100
		or not reviewed_version
		or not receipt_key
		or command_origin not in ("client_command", "server_invocation")
	):
		raise ValueError("Audit requires exact command, receipt and reviewed version")
	if authority is not None and (
		not isinstance(authority, dict)
		or set(authority)
		- {
			"frozen_principal",
			"authority",
			"board_member",
			"board_evidence",
			"evidence_identity",
			"on_behalf_method",
			"on_behalf_note",
			"step_key",
		}
	):
		raise ValueError("Audit authority contains unreviewed fields")
	if authority and "evidence_identity" in authority:
		proof = authority["evidence_identity"]
		if (
			domain != "recruitment" or operation != "decide"
			or authority.get("authority") != "Board Approval"
			or not isinstance(proof, dict)
			or set(proof) != {"file", "file_name", "sha256", "size"}
			or not isinstance(proof.get("file"), str) or not 1 <= len(proof["file"]) <= 140
			or proof["file"] != authority.get("board_evidence")
			or not isinstance(proof.get("file_name"), str) or not 1 <= len(proof["file_name"]) <= 255
			or not isinstance(proof.get("sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", proof["sha256"])
			or type(proof.get("size")) is not int or proof["size"] < 0
		):
			raise ValueError("Audit Board evidence identity is invalid")
	actor = frappe.session.user
	if actor == "Guest":
		frappe.throw(_("Command audit requires an authenticated actor."), frappe.PermissionError)
	creating = (domain == "delegation" and operation == "create") or (
		domain == "organization" and operation == "portal_create_jd" and target.doctype == "Kandil JD Revision"
	)
	before = checked_projection(before, allow_absent=creating)
	after = checked_projection(after)
	if creating and before.get("record_exists") is not False:
		raise ValueError("Creation audit requires explicit absent before state")
	identity = (target.doctype, target.name)
	if any((value["doctype"], value["name"]) != identity for value in (before, after)):
		raise ValueError("Audit before and after must identify the command target")
	allowed_targets = {
		"recruitment": {"Kandil Hiring Request"},
		"delegation": {"Kandil Delegation"},
		"organization": {
			"Kandil Structure Change",
			"Kandil JD Revision",
			"Kandil Grade Band",
			"Kandil Organization Import",
		},
	}
	if target.doctype not in allowed_targets[domain]:
		raise ValueError("Audit target does not match its command domain")
	envelope = dict(
		authority=copy(authority or {}),
		schema_version=1,
		domain=domain,
		operation=operation,
		command_id=command_id,
		command_origin=command_origin,
		receipt_key=str(receipt_key),
		reviewed_version=str(reviewed_version),
		actor=actor,
		principal=principal or actor,
		step_key=step_key,
		authority_mode="on_behalf" if principal and principal != actor else "direct",
		target_doctype=target.doctype,
		target_name=target.name,
		company=target.get("company"),
		department=target.get("department"),
		payload=copy(payload),
		before=before,
		after=after,
		result=copy(result),
		related_before=related(related_before),
		related_after=related(related_after),
	)
	old_targets = {(row["doctype"], row["name"]) for row in envelope["related_before"]}
	new_targets = {(row["doctype"], row["name"]) for row in envelope["related_after"]}
	# Absence denotes presence in this adapter's capture, not a global database
	# existence claim. New targets have no invented before state.
	envelope["related_added_to_capture"] = sorted(new_targets - old_targets)
	envelope["related_removed_from_capture"] = sorted(old_targets - new_targets)
	key = hashlib.sha256(canonical([domain, *identity, actor, command_id]).encode()).hexdigest()
	# This is the repeatable command-content fingerprint, intentionally excluding
	# occurrence time so an identical replay resolves to the first envelope.
	# It is neither a seal nor an independently verified tamper-evidence anchor.
	fingerprint = hashlib.sha256(canonical(envelope).encode()).hexdigest()
	prior = frappe.db.sql(
		"SELECT name,content_hash FROM `tabKandil Command Audit` WHERE name=%s FOR UPDATE",
		(key,),
		as_dict=True,
	)
	if prior:
		if prior[0].content_hash != fingerprint:
			frappe.throw(
				_("Command audit identity was reused with different content."), frappe.ValidationError
			)
		return prior[0].name
	instant = datetime.now(ZoneInfo("Africa/Cairo"))
	envelope["occurred_at"] = instant.isoformat()
	envelope["timezone"] = "Africa/Cairo"
	with insertion():
		doc = frappe.get_doc(
			dict(
				doctype=DOCTYPE,
				audit_key=key,
				schema_version=1,
				domain=domain,
				operation=operation,
				command_id=command_id,
				command_origin=command_origin,
				receipt_key=str(receipt_key),
				target_doctype=target.doctype,
				target_name=target.name,
				company=target.get("company"),
				department=target.get("department"),
				actor=actor,
				principal=principal or actor,
				step_key=step_key,
				reviewed_version=str(reviewed_version),
				occurred_at=instant.replace(tzinfo=None),
				occurred_at_iso=instant.isoformat(),
				content_hash=fingerprint,
				payload_json=canonical(payload),
				before_json=canonical(before),
				after_json=canonical(after),
				envelope_json=canonical(envelope),
			)
		)
		doc.insert(ignore_permissions=True)
	return doc.name
