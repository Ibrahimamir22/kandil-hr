"""Private immutable headcount denials; caller owns locks, rollback and commit.

A denial is not a successful command receipt. The HTTP transaction commits only
this event after the entire rejected business effect has been rolled back.
"""

import hashlib
import json
import re
from contextlib import contextmanager

import frappe
from frappe import _
from frappe.utils import cint, get_datetime

from kandil_hr.foundation.clock import now_cairo, today_cairo
from kandil_hr.foundation.mutation_access import assert_current_request_scope
from kandil_hr.recruitment.headcount_contract import MESSAGES, HeadcountDenied
from kandil_hr.recruitment.models import guard

ACTION = "Headcount command denied"
OPERATIONS = {"submit", "revise_pending_quantities"}
POLICY_FIELDS = {"mode", "config", "config_modified", "evaluated_on"}
LINE_FIELDS = {
	"line",
	"capacity",
	"branch",
	"requested_qty",
	"own_reserved_qty",
	"additional_qty",
	"available",
	"effective_available",
	"excess",
	"structural",
	"occupied",
	"reserved",
	"open_slots",
	"occupancy_basis",
	"occupancy_as_of",
}
NUMERIC_FIELDS = LINE_FIELDS - {"line", "capacity", "branch", "occupancy_basis", "occupancy_as_of"}
EVALUATION_FIELDS = {"request", "company", "department", "revision", "exception_reason", "policy", "lines"}


def canonical(value):
	return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


@contextmanager
def context():
	previous = frappe.flags.get("kandil_headcount_denial")
	frappe.flags.kandil_headcount_denial = True
	try:
		yield
	finally:
		frappe.flags.kandil_headcount_denial = previous


def boundary():
	guard()
	if not frappe.flags.get("kandil_headcount_denial"):
		frappe.throw(
			_("Headcount denial records require an authorized command boundary."), frappe.PermissionError
		)


def authorize(doc):
	if doc.doctype != "Kandil Hiring Request" or doc.requested_by != frappe.session.user:
		frappe.throw(_("Only the requester may inspect this command outcome."), frappe.PermissionError)
	doc.check_permission("read")
	assert_current_request_scope(
		doc,
		required_roles=(
			"Kandil Requester",
			"Kandil Approver",
			"Kandil Recruiter",
			"Kandil Sector Approver",
			"Kandil CEO Approver",
			"Kandil Board Approver",
		),
	)


def identity(doc, command_id):
	if not isinstance(command_id, str) or not command_id or len(command_id) > 100:
		frappe.throw(_("A valid command ID is required."))
	return hashlib.sha256(f"{frappe.session.user}|{doc.name}|{command_id}".encode()).hexdigest()


def digest(operation, expected_version, payload):
	return hashlib.sha256(canonical([operation, payload, str(expected_version)]).encode()).hexdigest()


def prior(key):
	rows = frappe.db.sql(
		"SELECT name,changed_fields FROM `tabKandil Security Event` WHERE action=%s AND reference=%s FOR UPDATE",
		(ACTION, key),
		as_dict=True,
	)
	if len(rows) > 1:
		raise RuntimeError("Ambiguous headcount command outcome")
	return rows[0] if rows else None


def response(name, code):
	return dict(outcome="denied", code=code, message=_(MESSAGES[code]), event=name)


def replay(doc, operation, command_id, expected_version, payload):
	boundary()
	old = prior(identity(doc, command_id))
	if old is None:
		return None  # All command operations share the same identity namespace.
	authorize(doc)
	value = json.loads(old.changed_fields)
	if value["payload_hash"] != digest(operation, expected_version, payload):
		frappe.throw(_("Command ID was already used with different data."))
	return response(old.name, value["denial"]["code"])


def build_evaluation(
	doc,
	caps,
	config,
	*,
	requested_quantities=None,
	own_reservations=None,
	baseline_quantities=None,
	exception_reason=None,
):
	requested_quantities = requested_quantities or {}
	own_reservations = own_reservations or {}
	baseline_quantities = baseline_quantities or {}
	lines = []
	for line in doc.lines:
		cap = caps[line.capacity]
		requested = cint(requested_quantities.get(line.name, line.requested_qty))
		own = cint(own_reservations.get(line.name, 0))
		additional = max(0, requested - cint(baseline_quantities.get(line.name, 0)))
		available = cint(cap.available)
		lines.append(
			dict(
				line=line.name,
				capacity=cap.name,
				branch=cap.branch,
				requested_qty=requested,
				own_reserved_qty=own,
				additional_qty=additional,
				available=available,
				effective_available=available + own,
				excess=max(0, additional - available - own),
				structural=cint(cap.structural),
				occupied=cint(cap.occupied),
				reserved=cint(cap.reserved),
				open_slots=cint(cap.open_slots),
				occupancy_basis=cap.occupancy_basis,
				occupancy_as_of=str(cap.occupancy_as_of) if cap.occupancy_as_of else None,
			)
		)
	return dict(
		request=doc.name,
		company=doc.company,
		department=doc.department,
		revision=cint(doc.revision),
		exception_reason=doc.exception_reason if exception_reason is None else exception_reason,
		policy=dict(
			mode=config.headcount_mode,
			config=config.name,
			config_modified=str(config.modified),
			evaluated_on=str(today_cairo()),
		),
		lines=lines,
	)


def checked_evaluation(doc, value):
	if not isinstance(value, dict) or set(value) != EVALUATION_FIELDS:
		raise ValueError("Headcount denial requires the exact server evaluation projection")
	if (value["request"], value["company"], value["department"], value["revision"]) != (
		doc.name,
		doc.company,
		doc.department,
		cint(doc.revision),
	):
		raise ValueError("Headcount denial evaluation targets a different request")
	if not isinstance(value["policy"], dict) or set(value["policy"]) != POLICY_FIELDS:
		raise ValueError("Headcount denial requires an exact policy projection")
	if value["policy"]["mode"] not in {"Warn", "Block"}:
		raise ValueError("Unknown headcount policy")
	lines = value["lines"]
	if not isinstance(lines, list) or not 1 <= len(lines) <= 1000:
		raise ValueError("Headcount evaluation must contain 1 to 1000 request lines")
	expected = {line.name: line.capacity for line in doc.lines}
	if len(lines) != len(expected) or {row.get("line") for row in lines} != set(expected):
		raise ValueError("Headcount evaluation must cover every request line exactly once")
	for row in lines:
		if set(row) != LINE_FIELDS or expected[row["line"]] != row["capacity"]:
			raise ValueError("Headcount evaluation contains an unsupported line projection")
		if any(type(row[key]) is not int for key in NUMERIC_FIELDS):
			raise ValueError("Headcount evaluation counts must be integers")
		if any(
			row[key] is not None and not isinstance(row[key], str) for key in LINE_FIELDS - NUMERIC_FIELDS
		):
			raise ValueError("Headcount evaluation identifiers must be text")
	if not any(row["excess"] > 0 for row in lines):
		raise ValueError("A headcount denial requires an actual evaluated shortage")
	encoded = canonical(value)
	if len(encoded.encode()) > 2 * 1024 * 1024:
		raise ValueError("Headcount evaluation exceeds the bounded audit size")
	return json.loads(encoded)


def record(
	doc,
	operation,
	command_id,
	expected_version,
	payload,
	denial,
	*,
	business_before_hash,
	business_after_hash,
):
	boundary()
	authorize(doc)
	if operation not in OPERATIONS or not isinstance(denial, HeadcountDenied):
		raise ValueError("Unsupported headcount denial operation")
	if get_datetime(doc.modified) != get_datetime(expected_version):
		frappe.throw(_("This record changed. Reload it before deciding."), frappe.TimestampMismatchError)
	if (
		not re.fullmatch(r"[0-9a-f]{64}", business_before_hash or "")
		or business_before_hash != business_after_hash
	):
		raise ValueError("Rejected command business state was not fully restored")
	if (
		not isinstance(payload, dict)
		or (operation == "submit" and payload)
		or (
			operation == "revise_pending_quantities"
			and set(payload) != {"quantities", "reason", "exception_reason"}
		)
	):
		raise ValueError("Headcount denial payload contains unsupported fields")
	evaluation = checked_evaluation(doc, denial.evaluation)
	mode = evaluation["policy"]["mode"]
	if denial.code not in MESSAGES or (denial.code == "HEADCOUNT_BLOCKED") != (mode == "Block"):
		raise ValueError("Headcount denial code does not match evaluated policy")
	if (
		denial.code == "HEADCOUNT_REASON_REQUIRED"
		and len((evaluation["exception_reason"] or "").strip()) >= 10
	):
		raise ValueError("Headcount reason was sufficient for the evaluated policy")
	old = replay(doc, operation, command_id, expected_version, payload)
	if old is not None:
		return old
	value = dict(
		schema_version=1,
		outcome="denied",
		actor=frappe.session.user,
		principal=frappe.session.user,
		command=operation,
		command_origin="client_command",
		command_id=command_id,
		payload_hash=digest(operation, expected_version, payload),
		reviewed_version=str(expected_version),
		request=doc.name,
		company=doc.company,
		department=doc.department,
		payload=payload,
		evaluation=evaluation,
		denial=dict(code=denial.code, message=denial.message),
		occurred_at=now_cairo().isoformat(),
		timezone="Africa/Cairo",
		business_before_hash=business_before_hash,
		business_after_hash=business_after_hash,
	)
	from kandil_hr.foundation.models import record_security_event

	event = record_security_event(
		ACTION, frappe.session.user, canonical(value), reference=identity(doc, command_id)
	)
	return response(event.name, denial.code)
