"""Small, permission-checked projections for the personal-session HR portal.

Business transitions remain in recruitment.api/vacancies. No public service key,
permission bypass on business documents, or second employee database is used.
"""

import hashlib
import json
import re

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, get_fullname, today

from kandil_hr.foundation.mutation_access import assert_current_request_scope
from kandil_hr.foundation.security import has_scope, request_scope
from kandil_hr.pilot.api import event, transactional_retry, transition
from kandil_hr.pilot.navigation import has_app_permission, request_actions
from kandil_hr.recruitment.models import guard
from kandil_hr.recruitment.reference_access import visible_employee
from kandil_hr.recruitment.review_views import timeline

EDITABLE = (
    "company", "department", "title", "requested_position", "need_reason",
    "requested_priority", "required_by", "qualifications", "skills_required",
    "experience_required", "working_conditions", "employment_type", "exception_reason",
    "replacement_employee",
)
REQUEST_FIELDS = (*EDITABLE, "name", "requested_by", "modified", "status", "revision", "creation", "hr_priority", "amends", "request_kind")
WRITE_ROLES = ("Kandil Requester", "Kandil Recruiter", "Kandil Sector Approver")


def authenticated():
    guard()
    if not has_app_permission() or not frappe.db.get_value("User", frappe.session.user, "enabled"):
        frappe.throw(_("Sign in with an authorized HR account."), frappe.PermissionError)


def read_request(name, for_update=False):
    doc = frappe.get_doc("Kandil Hiring Request", name, for_update=for_update)
    doc.check_permission("read")
    if not request_scope(doc):
        frappe.throw(_("This request is outside your HR scope."), frappe.PermissionError)
    return doc


def project(doc):
    result = {key: doc.get(key) for key in REQUEST_FIELDS}
    result["modified"] = str(doc.modified)
    replacement = doc.get("replacement_employee")
    result["replacement_restricted"] = bool(replacement and not visible_employee(replacement))
    if result["replacement_restricted"]:
        result["replacement_employee"] = None
    result["quantity"] = sum(cint(row.requested_qty) for row in doc.lines)
    result["lines"] = []
    for row in doc.lines:
        cap = frappe.db.get_value("Kandil Capacity", row.capacity, ["branch", "designation"], as_dict=True)
        result["lines"].append(dict(
            name=row.name, capacity=row.capacity, branch=cap.branch, designation=cap.designation,
            requested_qty=row.requested_qty, proposed_qty=row.proposed_qty, approved_qty=row.approved_qty,
            reserved_qty=row.reserved_qty, joined_qty=row.joined_qty, closed_qty=row.closed_qty, job_opening=row.job_opening,
        ))
    result["approval_steps"] = [
        {key: row.get(key) for key in ("step_key", "authority", "principal", "decision", "comment", "decided_at")}
        for row in doc.approval_steps
    ]
    return result


def capabilities(doc):
    from kandil_hr.portal.request_operations import action_hints
    hints = request_actions(doc.name)
    manage = request_scope(doc, frappe.session.user, "manage")
    for key in ("submit", "decide", "revise", "revise_pending_quantities"):
        hints[key] = bool(hints.get(key) and manage)
    return {key: hints.get(key) for key in (
        "submit", "decide", "revise", "revise_pending_quantities", "step_id", "expected_version", "status", "next_authority",
    )} | action_hints(doc) | {"edit": bool(manage and doc.status == "Draft" and doc.requested_by == frappe.session.user and doc.has_permission("write"))}


@frappe.whitelist(methods=["GET"])
def bootstrap():
    authenticated()
    from frappe.sessions import get_csrf_token
    from kandil_hr.candidates.migration import can_review as can_review_migration

    grants = frappe.get_all("Kandil Access Grant", filters={"user": frappe.session.user,
        "revoked": 0, "can_manage_recruitment": 1, "valid_from": ["<=", today()]}, fields=["valid_until"])
    can_manage = frappe.session.user == "Administrator" or any(not g.valid_until or str(g.valid_until) >= today() for g in grants)
    return dict(
        user=dict(id=frappe.session.user, full_name=get_fullname()),
        synthetic_test=(frappe.local.site == "kandil-parity.localhost" or bool(frappe.conf.get("kandil_review_environment"))),
        csrf_token=get_csrf_token(),
        can_review_candidate_migration=can_review_migration(),
        can_read_candidates=bool(frappe.has_permission("Job Applicant", "read") and (frappe.session.user == "Administrator" or "Kandil Recruiter" in frappe.get_roles())),
        can_create=bool(can_manage and set(WRITE_ROLES).intersection(frappe.get_roles()) and frappe.has_permission("Kandil Hiring Request", "create")),
    )


@frappe.whitelist(methods=["GET"])
def detail(name):
    authenticated()
    doc = read_request(name)
    return dict(request=project(doc), actions=capabilities(doc), timeline=timeline(name))


@frappe.whitelist(methods=["GET"])
def overview(start=0, page_length=50):
    authenticated()
    start, limit = max(0, cint(start)), min(100, max(1, cint(page_length)))
    names = frappe.get_list(
        "Kandil Hiring Request", fields=["name"], order_by="modified desc, name asc",
        start=start, page_length=limit + 1,
    )
    requests, approvals, vacancies = [], [], []
    from kandil_hr.recruitment.vacancies import actions

    for row in names[:limit]:
        doc = read_request(row.name)
        item = project(doc)
        requests.append(item)
        if capabilities(doc)["decide"]:
            approvals.append(item)
        for line in doc.lines:
            if not line.job_opening:
                continue
            opening = frappe.get_doc("Job Opening", line.job_opening)
            if not opening.has_permission("read"):
                continue
            hints = actions(opening.name)
            from kandil_hr.portal.vacancies import visible_team
            labels, restricted = visible_team(opening)
            lead = opening.custom_kandil_lead
            vacancies.append(dict(
                name=opening.name, request=doc.name, title=doc.title,
                branch=frappe.db.get_value("Kandil Capacity", line.capacity, "branch"),
                quantity=line.approved_qty, joined=line.joined_qty,
                state=opening.custom_kandil_vacancy_state, lead=lead if lead in labels else None,
                members=[row.user for row in opening.custom_kandil_team if row.user in labels],
                lead_name=labels.get(lead), team_restricted=restricted, expected_version=str(doc.modified),
                can_assign=bool(not restricted and hints.get("can_assign") and hints.get("can_manage")),
            ))
    # These are explicit page counts; do not present them as organization totals.
    return dict(requests=requests, approvals=approvals, vacancies=vacancies,
                counts=dict(requests=len(requests), approvals=len(approvals), vacancies=len(vacancies)),
                has_more=len(names) > limit, next_start=start + limit, start=start, count_scope="page")


@frappe.whitelist(methods=["GET"])
def choices():
    authenticated()
    positions, capacities = [], []
    rows = frappe.get_list("Kandil Position", filters={"status": "Active"},
        fields=["name", "title", "company", "department", "branch", "designation"],
        order_by="title asc, name asc", page_length=501)
    for row in rows[:500]:
        if has_scope(frappe.session.user, row.company, row.department, row.branch, "manage"):
            positions.append(dict(id=row.name, label=row.title, company=row.company,
                                  department=row.department, designation=row.designation))
    caps = frappe.get_list("Kandil Capacity", fields=["name", "position", "company", "department", "branch", "designation", "available", "modified"],
                          order_by="branch asc, name asc", page_length=501)
    for row in caps[:500]:
        if (has_scope(frappe.session.user, row.company, row.department, row.branch, "manage")
                and frappe.db.get_value("Kandil Position", row.position, "status") == "Active"):
            capacities.append(dict(id=row.name, availability_basis="recorded_ledger",
                recorded_at=str(row.modified), **{key: row[key] for key in (
                "position", "company", "department", "branch", "designation", "available")}))
    return dict(positions=positions, capacities=capacities, truncated=len(rows) > 500 or len(caps) > 500)


@frappe.whitelist(methods=["GET"])
def recruiters(opening_name):
    authenticated()
    from kandil_hr.recruitment.vacancies import actions

    hints = actions(opening_name)
    if not hints.get("can_assign") or not hints.get("can_manage"):
        frappe.throw(_("You cannot assign recruiters to this vacancy."), frappe.PermissionError)
    doc = read_request(hints["name"])
    # Compatibility projection for older clients. The current portal uses the
    # bounded directory endpoint; this path may not expose hidden User references.
    from kandil_hr.portal.vacancy_teams import projected_directory
    result = projected_directory([doc],page_length=100)
    if result['has_more']:
        frappe.throw(_('Use the searchable recruiter directory to choose from this team.'))
    return result['rows']


def editable_payload(payload):
    payload = frappe.parse_json(payload)
    if not isinstance(payload, dict) or set(payload) - set(EDITABLE) - {"lines"}:
        frappe.throw(_("Only editable request fields are accepted."))
    lines = payload.get("lines")
    if not isinstance(lines, list) or not 1 <= len(lines) <= 50:
        frappe.throw(_("Choose between one and fifty locations."))
    if any(not isinstance(row, dict) or set(row) - {"capacity", "requested_qty", "name"} for row in lines):
        frappe.throw(_("Only a location and quantity may be edited."))
    if any(not isinstance(row.get("capacity"), str) or not 1 <= len(row["capacity"]) <= 140 for row in lines):
        frappe.throw(_("Choose a valid capacity for every location."))
    if any(key in payload and payload[key] is not None and not isinstance(payload[key], str) for key in EDITABLE):
        frappe.throw(_("Request text and reference fields must be text."))
    if len(json.dumps(payload)) > 40000:
        frappe.throw(_("The hiring request is too large."))
    return payload


@frappe.whitelist(methods=["POST"])
@transactional_retry
def save_draft(payload, command_id, name=None, expected_version=None):
    authenticated()
    payload = editable_payload(payload)
    lines = payload["lines"]
    if not isinstance(command_id, str) or not re.fullmatch(r"[a-zA-Z0-9-]{16,100}", command_id):
        frappe.throw(_("A unique command ID is required."))
    company = payload.get("company")
    if not company:
        frappe.throw(_("Choose a company and position."))
    if name and frappe.db.get_value("Kandil Hiring Request", name, "company") != company:
        frappe.throw(_("The company of a saved request cannot change."))
    frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
    doc = frappe.get_doc("Kandil Hiring Request", name, for_update=True) if name else frappe.new_doc("Kandil Hiring Request")
    proposed = frappe.get_doc(dict(doctype="Kandil Hiring Request", **payload))
    # All old/new domain rows precede User/grant locks, including a draft whose
    # position or locations change. Keep the existing command lock ordering.
    for position in sorted({x for x in (doc.requested_position, proposed.requested_position) if x}):
        frappe.db.sql("SELECT name FROM `tabKandil Position` WHERE name=%s FOR UPDATE", (position,))
    locked_caps = {}
    for capacity in sorted({row.capacity for row in [*(doc.lines or []), *(proposed.lines or [])]}):
        found = frappe.db.sql("SELECT name,company,department,branch,designation,position FROM `tabKandil Capacity` WHERE name=%s FOR UPDATE", (capacity,), as_dict=True)
        if found:
            locked_caps[capacity] = found[0]
    position_ids = {x for x in (doc.requested_position, proposed.requested_position) if x}
    position_ids.update(row.position for row in locked_caps.values() if row.position)
    locked_positions = {}
    for position in sorted(position_ids):
        found = frappe.db.sql("SELECT name,company,department,branch,designation,status FROM `tabKandil Position` WHERE name=%s FOR UPDATE", (position,), as_dict=True)
        if found:
            locked_positions[position] = found[0]
    if name:
        doc.check_permission("read")
        assert_current_request_scope(doc, required_roles=WRITE_ROLES)
        if doc.requested_by != frappe.session.user:
            frappe.throw(_("Only the requester can edit this draft."), frappe.PermissionError)
    assert_current_request_scope(proposed, required_roles=WRITE_ROLES)
    key = hashlib.sha256(f"portal-draft|{frappe.session.user}|{company}|{command_id}".encode()).hexdigest()
    digest = hashlib.sha256(json.dumps([name, expected_version, payload], sort_keys=True).encode()).hexdigest()
    prior = frappe.db.sql("SELECT request,payload_hash,result_json FROM `tabKandil Command Receipt` WHERE name=%s FOR UPDATE", (key,), as_dict=True)
    if prior:
        read_request(prior[0].request, for_update=True)
        if prior[0].payload_hash != digest:
            frappe.throw(_("Command ID was already used with different data."))
        result = json.loads(prior[0].result_json)
        replacement = result.get("replacement_employee")
        result["replacement_restricted"] = bool(replacement and not visible_employee(replacement))
        if result["replacement_restricted"]: result["replacement_employee"] = None
        return result
    selected = locked_positions.get(proposed.requested_position)
    if not selected or selected.status != "Active" or selected.company != company or selected.department != proposed.department:
        frappe.throw(_("Choose a currently active position in this company and department."))
    for row in proposed.lines:
        cap = locked_caps.get(row.capacity)
        current_position = locked_positions.get(cap.position) if cap else None
        if (not cap or not current_position or current_position.status != "Active"
                or cap.company != company or cap.department != proposed.department or cap.designation != selected.designation
                or any(cap.get(key) != current_position.get(key) for key in ("company", "department", "branch", "designation"))):
            frappe.throw(_("Every location must match a currently active position for this job."))
    if name:
        if doc.status != "Draft":
            frappe.throw(_("Only a draft can be edited."))
        if not expected_version or get_datetime(doc.modified) != get_datetime(expected_version):
            frappe.throw(_("This record changed. Reload it before editing."), frappe.TimestampMismatchError)
    saved_lines = {row.capacity: row for row in (doc.lines or [])}
    for key_field in EDITABLE:
        if key_field in payload:
            doc.set(key_field, payload[key_field])
    doc.set("lines", [])
    for row in lines:
        old = saved_lines.get(row.get("capacity"))
        value = dict(capacity=row.get("capacity"), requested_qty=row.get("requested_qty"))
        if old:
            value["name"] = old.name
        doc.append("lines", value)
    # Native permission/validation checks remain active here, outside transition().
    doc.save() if name else doc.insert()
    result = project(doc)
    with transition():
        event(doc, "Draft saved" if name else "Draft created")
        frappe.get_doc(dict(doctype="Kandil Command Receipt", dedupe_key=key, request=doc.name,
            actor=frappe.session.user, payload_hash=digest, result_json=frappe.as_json(result))).insert(ignore_permissions=True)
    return result
