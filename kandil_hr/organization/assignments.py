"""Individual position changes applied only through reviewed HR and CEO decisions.

One employee operation per proposal keeps the before/after review unambiguous.
The existing structure command owns locking, receipts, approvals and audit.
"""
import json

import frappe
from frappe.utils import add_days, getdate

from kandil_hr.organization import rules
from kandil_hr.organization.current import rows
from kandil_hr.organization.models import fail

ACTIONS = {
    "AssignEmployee": {"action", "position", "employee", "allocation", "valid_until"},
    "EndAssignment": {"action", "position", "assignment"},
    "MoveEmployee": {"action", "position", "assignment", "target_position", "valid_until"},
}


def requested(doc):
    return any(isinstance(op.get("action"), str) and op["action"] in ACTIONS
               for op in json.loads(doc.changes_json) if isinstance(op, dict))


def review_state(doc, state):
    """Bind employee eligibility and linked identity to the reviewed baseline."""
    if not requested(doc):
        return state
    operation(doc)  # Validate native JSON input before resolving any references.
    names = set()
    assignments = {a.name: a for a in state["assignments"]}
    for op in json.loads(doc.changes_json):
        if op.get("employee"):
            names.add(op["employee"])
        source = assignments.get(op.get("assignment"))
        if source:
            names.add(source.employee)
    subjects = rows("Employee", filters={"name": ["in", sorted(names)]},
                    fields=["name", "company", "status", "user_id", "date_of_joining", "relieving_date",
                            "custom_kandil_joining_voided"], order_by="name") if names else []
    users = sorted({s.user_id for s in subjects if s.user_id})
    enabled = {u.name: u.enabled for u in rows("User", filters={"name": ["in", users]},
               fields=["name", "enabled"], order_by="name")} if users else {}
    for subject in subjects:
        subject.user_enabled = enabled.get(subject.user_id)
    return {**state, "assignment_subjects": subjects}


def subject_users(doc, state):
    return {s.user_id for s in state.get("assignment_subjects", []) if s.user_id}


def operation(doc):
    operations = json.loads(doc.changes_json)
    if len(operations) != 1:
        fail("Submit one individual employee change per request, separately from structural changes.")
    op = operations[0]
    if op.get("action") not in ACTIONS or set(op) - ACTIONS[op["action"]]:
        fail("Unsupported employee assignment operation or field.")
    for value in op.values():
        if value is not None and (not isinstance(value, str) or len(value) > 140):
            fail("Assignment references must be bounded text.")
    return op


def plan(doc, state):
    op = operation(doc)
    at = getdate(doc.effective_on)
    if at < getdate():
        fail("Individual employee changes cannot be backdated.")
    positions = {p.name: p for p in state["positions"]}
    source_position = positions.get(op.get("position"))
    if not source_position or source_position.status != "Active":
        fail("Select an active position in this company.")
    source = None
    proposed = None
    ending = None
    if op["action"] != "AssignEmployee":
        source = next((a for a in state["assignments"] if a.name == op.get("assignment")), None)
        if not source or source.position != source_position.name or not rules.effective(source, at):
            fail("Select an assignment active at the effective date in the selected position.")
        ending = at if op["action"] == "EndAssignment" else getdate(add_days(at, -1))
        if ending < getdate(source.valid_from):
            fail("A transfer must start after the original assignment start date.")
        if source.valid_until and ending >= getdate(source.valid_until):
            fail("The proposed end must shorten the existing assignment episode.")
    employee_id = op.get("employee") if source is None else source.employee
    employee = next((e for e in state.get("assignment_subjects", []) if e.name == employee_id), None)
    if not employee or employee.company != doc.company:
        fail("Select an employee in this company.")
    if doc.status in ("Draft", "Returned"):
        # Authors must be able to read the specific person, including native User Permissions.
        # Named independent reviewers receive only the reviewed assignment projection.
        frappe.get_doc("Employee", employee.name).check_permission("read")
        if source:
            frappe.get_doc("Kandil Position Assignment", source.name).check_permission("read")
    target = source_position if source is None else positions.get(op.get("target_position"))
    if op["action"] != "EndAssignment":
        if not target or target.status != "Active" or (source and target.name == source.position):
            fail("Select a different active destination position in this company.")
        if employee.status != "Active" or employee.custom_kandil_joining_voided:
            fail("Only an active employee with a valid joining can receive an assignment.")
        if employee.user_id and not employee.user_enabled:
            fail("The employee linked account must be enabled.")
        if employee.date_of_joining and at < getdate(employee.date_of_joining):
            fail("Assignment cannot begin before the employee joins.")
        until = op.get("valid_until") or (source.valid_until if source else None)
        if until:
            try:
                until = getdate(until)
            except (ValueError, TypeError):
                fail("Choose a valid assignment end date.")
            if until < at:
                fail("Assignment end cannot precede its start.")
        if employee.relieving_date and (not until or until > getdate(employee.relieving_date)):
            fail("Assignment cannot continue beyond the employee relieving date.")
        if target.closed_on and (not until or until >= getdate(target.closed_on)):
            fail("Assignment cannot overlap position closure.")
        allocation = source.allocation if source else op.get("allocation", "Primary")
        if allocation not in ("Primary", "Acting"):
            fail("Choose Primary or Acting allocation.")
        proposed = frappe._dict(position=target.name, employee=employee.name, user=employee.user_id,
                               valid_from=at, valid_until=until, allocation=allocation)
    projected = [frappe._dict(a) for a in state["assignments"]]
    if source:
        next(a for a in projected if a.name == source.name).valid_until = ending
    if proposed:
        for other in projected:
            if not rules.overlap(other, proposed):
                continue
            if other.employee == proposed.employee and other.allocation == proposed.allocation == "Primary":
                fail("An employee cannot have overlapping primary assignments.")
            if other.position == proposed.position and other.allocation == proposed.allocation == "Acting":
                fail("A position cannot have overlapping acting authorities.")
        projected.append(proposed)
        future = [a for a in projected if a.position == target.name and
                  (not a.valid_until or getdate(a.valid_until) >= at)]
        peak = rules.peak_occupancy(future)
        if peak > target.structural:
            fail("Position assignments exceed structural seats.")
    affected = {source_position.name}
    if proposed:
        affected.add(target.name)
    capacities = []
    from kandil_hr.organization.occupancy import values
    for position in sorted(affected):
        ledgers = [c for c in state.get("capacities", []) if c.position == position]
        if len(ledgers) > 1:
            fail("A position must map to at most one capacity ledger.")
        for item in ledgers:
            cap = frappe.get_doc("Kandil Capacity", item.name, for_update=True)
            if values(cap)["unresolved"]:
                fail("Review the unmatched occupied baseline before changing assignments.")
            if proposed and proposed.allocation == "Primary" and position == target.name:
                if peak + cap.reserved + cap.open_slots > min(target.structural, cap.structural):
                    fail("The destination has insufficient seats after reserved and open hiring commitments.")
            capacities.append(cap)
    return dict(source=source, ending=ending, proposed=proposed, capacities=capacities)


def apply(doc, state):
    from kandil_hr.organization.occupancy import refresh_locked
    change = plan(doc, state)
    if change["source"]:
        old = frappe.get_doc("Kandil Position Assignment", change["source"].name, for_update=True)
        old.valid_until = change["ending"]
        old.save(ignore_permissions=True)
    if change["proposed"]:
        values = dict(change["proposed"])
        position = frappe.get_doc("Kandil Position", values["position"], for_update=True)
        frappe.get_doc(dict(doctype="Kandil Position Assignment", company=doc.company,
                            department=position.department, branch=position.branch, **values)).insert(ignore_permissions=True)
    for cap in change["capacities"]:
        # plan verified the pre-change legacy baseline; record the reviewed dated basis.
        cap.occupancy_basis = "Dated Assignments"
        refresh_locked(cap)
