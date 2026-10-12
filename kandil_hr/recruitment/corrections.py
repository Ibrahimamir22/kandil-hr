"""Source-resolved PD-06 corrections to approved recruitment, with explicit audit.

Increases remain linked amendments. Relocation moves only unfilled seats; actual
employees and their dated assignments stay at the original location. No payroll
or employee mutation is performed here.
"""

import frappe
from frappe import _
from frappe.utils import cint, getdate

from kandil_hr.foundation.clock import today_cairo
from kandil_hr.foundation.mutation_access import assert_current_request_scope, assert_current_scope
from kandil_hr.organization.occupancy import assert_increase, refresh_locked
from kandil_hr.pilot.api import change_capacity, transactional_retry
from kandil_hr.pilot.models import integer
from kandil_hr.recruitment.api import command, dump, save, snapshot_payload
from kandil_hr.recruitment.guards import resolved_candidates

FIELDS = {
	"employment_type",
	"required_by",
	"qualifications",
	"skills_required",
	"experience_required",
	"working_conditions",
	"need_reason",
	"hr_priority",
}


def parsed_mapping(value):
	value = frappe.parse_json(value or {})
	if not isinstance(value, dict):
		frappe.throw(_("Correction values must be an object."))
	return value


def remaining(line):
	return max(0, cint(line.approved_qty) - cint(line.joined_qty) - cint(line.closed_qty))


def update_opening(line, opening):
	opening.vacancies = line.approved_qty
	if not remaining(line):
		opening.custom_kandil_vacancy_state = (
			"Filled" if cint(line.joined_qty) >= cint(line.approved_qty) else "Closed"
		)
		opening.status = "Closed"
	opening.save(ignore_permissions=True)


@frappe.whitelist(methods=["POST"])
@transactional_retry
def correct_approved(
	name, command_id, expected_version, reason, fields=None, quantities=None, relocations=None
):
	fields, quantities, relocations = map(parsed_mapping, (fields, quantities, relocations))
	if not isinstance(reason, str) or not reason.strip() or len(reason) > 2000:
		frappe.throw(_("A correction reason of 1 to 2000 characters is required."))
	if set(fields) - FIELDS:
		frappe.throw(_("This field cannot be changed by an HR correction."))
	if any(not isinstance(value, (str, type(None))) for value in fields.values()):
		frappe.throw(_("Correction fields must contain text or an empty value."))
	if "hr_priority" in fields and fields["hr_priority"] not in ("Normal", "Important", "Critical"):
		frappe.throw(_("Select a valid priority."))
	if fields.get("required_by"):
		fields["required_by"] = str(getdate(fields["required_by"]))

	def act(doc):
		assert_current_request_scope(doc, required_roles=("Kandil Recruiter",))
		if doc.amends or doc.status not in ("Approved", "Closed", "Filled"):
			frappe.throw(_("Only an approved original request can receive an HR correction."))
		if frappe.db.sql(
			"SELECT name FROM `tabKandil Hiring Request` WHERE amends=%s AND status IN ('Draft','Pending','Returned') FOR UPDATE",
			(doc.name,),
		):
			frappe.throw(_("Resolve the active amendment before correcting this request."))
		lines = {row.name: row for row in doc.lines}
		if (set(quantities) | set(relocations)) - set(lines):
			frappe.throw(_("Every correction line must belong to this request."))
		if any(not isinstance(value, str) or not value for value in relocations.values()):
			frappe.throw(_("Select a destination capacity for each relocation."))
		if len(set(relocations.values())) != len(relocations) or set(relocations.values()).intersection(
			row.capacity for row in doc.lines
		):
			frappe.throw(_("Relocation requires distinct new destination capacities."))
		before = snapshot_payload(doc)
		before.pop("decision_note", None)
		caps = {}
		for key in sorted({row.capacity for row in doc.lines} | set(relocations.values())):
			cap = frappe.get_doc("Kandil Capacity", key, for_update=True)
			if cap.company != doc.company or cap.department != doc.department:
				frappe.throw(
					_("Correction locations must belong to the request company and department."),
					frappe.PermissionError,
				)
			assert_current_scope(
				cap.company, cap.department, cap.branch, required_roles=("Kandil Recruiter",)
			)
			refresh_locked(cap)
			caps[key] = cap
		changed = False
		for key, value in fields.items():
			if (str(doc.get(key) or "")) != str(value or ""):
				doc.set(key, value)
				changed = True
		for key, raw in quantities.items():
			line = lines[key]
			qty = integer(raw)
			if qty < cint(line.joined_qty):
				frappe.throw(_("Quantity cannot be lower than actual joiners."))
			if qty > cint(line.approved_qty):
				frappe.throw(_("Increases require a linked amendment and approval."))
			if qty == cint(line.approved_qty):
				continue
			old_remaining = remaining(line)
			opening = frappe.get_doc("Job Opening", line.job_opening, for_update=True)
			if old_remaining:
				resolved_candidates(opening.name)
			line.approved_qty = qty
			line.proposed_qty = qty
			line.closed_qty = min(cint(line.closed_qty), qty - cint(line.joined_qty))
			change_capacity(caps[line.capacity], opened=remaining(line) - old_remaining)
			update_opening(line, opening)
			changed = True
		for key, destination in relocations.items():
			line = lines[key]
			qty = remaining(line)
			if not qty:
				frappe.throw(_("Only unfilled open seats can be relocated."))
			target = caps[destination]
			position = frappe.get_doc("Kandil Position", target.position, for_update=True)
			if (
				target.designation != caps[line.capacity].designation
				or position.status != "Active"
				or (position.closed_on and getdate(position.closed_on) <= getdate(today_cairo()))
			):
				frappe.throw(_("Relocation requires an active position for the same job."))
			assert_increase(target)
			if qty > target.available:
				frappe.throw(_("Destination headcount is insufficient; use a separately approved request."))
			opening = frappe.get_doc("Job Opening", line.job_opening, for_update=True)
			resolved_candidates(opening.name)
			line.approved_qty = cint(line.approved_qty) - qty
			line.proposed_qty = line.approved_qty
			change_capacity(caps[line.capacity], opened=-qty)
			update_opening(line, opening)
			new_opening = frappe.get_doc(
				dict(
					doctype="Job Opening",
					job_title=f"{target.designation} — {target.branch} — {doc.name}",
					designation=target.designation,
					company=doc.company,
					department=doc.department,
					location=target.branch,
					status="Closed",
					vacancies=qty,
					publish=0,
					currency="EGP",
					prevent_duplicate_applicant=1,
					custom_kandil_request=doc.name,
					custom_kandil_capacity=target.name,
					custom_kandil_vacancy_state="Approved",
				)
			).insert(ignore_permissions=True)
			doc.append(
				"lines",
				dict(
					capacity=target.name,
					requested_qty=qty,
					approved_qty=qty,
					proposed_qty=qty,
					job_opening=new_opening.name,
				),
			)
			change_capacity(target, opened=qty)
			changed = True
		if not changed:
			frappe.throw(_("No changed correction values were supplied."))
		if quantities or relocations:
			doc.status = (
				"Approved"
				if any(remaining(row) for row in doc.lines)
				else (doc.status if doc.status in ("Closed", "Filled") else "Closed")
			)
		doc.revision = cint(doc.revision) + 1
		after = snapshot_payload(doc)
		after.pop("decision_note", None)
		note = dump(dict(reason=reason, before=before, after=after))
		return save(doc, "HR correction", note)

	return command(
		name,
		"hr_correction",
		command_id,
		expected_version,
		dict(reason=reason, fields=fields, quantities=quantities, relocations=relocations),
		act,
	)
