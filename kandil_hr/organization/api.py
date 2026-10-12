"""Reviewed organization commands. No direct cross-system database writes."""

import hashlib
import json
import uuid
from contextlib import contextmanager

import frappe
from frappe import _
from frappe.utils import add_days, cint, get_datetime, getdate, now_datetime

from kandil_hr.foundation.security import assert_scope
from kandil_hr.organization import rules
from kandil_hr.organization.contracts import AUTHORITY_ROLES, SETTINGS_AUTHORITIES
from kandil_hr.organization.current import rows as current_rows
from kandil_hr.organization.models import fail, lock_company
from kandil_hr.pilot.api import transition as recruitment_transition
from kandil_hr.pilot.models import enabled_guard


def serialized(value):
	return json.dumps(value, sort_keys=True, ensure_ascii=False, default=str, separators=(",", ":"))


def digest(value):
	return hashlib.sha256(serialized(value).encode()).hexdigest()


@contextmanager
def transition():
	before = frappe.flags.get("kandil_organization_transition")
	frappe.flags.kandil_organization_transition = True
	try:
		yield
	finally:
		frappe.flags.kandil_organization_transition = before


def authorize(company, capability="manage", decision=False):
	enabled_guard()
	roles = frappe.get_roles()
	if not set(roles) & {
		"Kandil Recruiter",
		"Kandil Sector Approver",
		"Kandil Approver",
		"Kandil CEO Approver",
		"Kandil Board Approver",
		"System Manager",
	}:
		frappe.throw(_("Organization access is restricted to authorized HR roles."), frappe.PermissionError)
	if decision and "Kandil Sector Approver" not in roles and frappe.session.user != "Administrator":
		frappe.throw(_("A structural authority must approve this action."), frappe.PermissionError)
	assert_scope(company, capability=capability)
	if capability != "read":
		lock_company(company)


def get_locked(doctype, name, decision=False):
	company = frappe.db.get_value(doctype, name, "company")
	if not company:
		frappe.throw(_("Record not found."), frappe.DoesNotExistError)
	authorize(company, decision=decision)
	doc = frappe.get_doc(doctype, name, for_update=True)
	doc.check_permission("write")
	return doc


def require_independent(doc):
	if doc.owner == frappe.session.user:
		frappe.throw(_("The author cannot approve their own organization change."), frappe.PermissionError)


def structure_state(company):
	lock_company(company)
	result = {
		"positions": current_rows(
			"Kandil Position",
			filters={"company": company},
			fields=["name", "department", "branch", "designation", "structural", "status", "closed_on"],
			order_by="name",
		),
		"hierarchy": current_rows(
			"Kandil Position Hierarchy",
			filters={"company": company},
			fields=["name", "position", "parent_position", "authority", "valid_from", "valid_until"],
			order_by="name",
		),
		"assignments": current_rows(
			"Kandil Position Assignment",
			filters={"company": company},
			fields=["name", "position", "employee", "user", "allocation", "valid_from", "valid_until"],
			order_by="name",
		),
	}

	if frappe.get_meta("Kandil Capacity").has_field("position"):
		result["capacities"] = current_rows(
			"Kandil Capacity",
			filters={"company": company},
			fields=["name", "position", "structural", "occupied", "reserved", "open_slots"],
			order_by="name",
		)
	return result


def active_hierarchy(company, at):
	lock_company(company)
	return {
		r.position: r
		for r in current_rows(
			"Kandil Position Hierarchy",
			filters={"company": company},
			fields=["name", "position", "parent_position", "authority", "valid_from", "valid_until"],
		)
		if rules.effective(r, at)
	}


def authority_for(position, at):
	rows = [
		r
		for r in current_rows(
			"Kandil Position Assignment",
			filters={"position": position},
			fields=["name", "user", "employee", "allocation", "valid_from", "valid_until"],
		)
		if rules.effective(r, at)
	]
	acting = [r for r in rows if r.allocation == "Acting"]
	candidates = acting or [r for r in rows if r.allocation == "Primary"]
	if len(candidates) > 1:
		fail(
			"Position has multiple occupants and no unique acting authority. Configure a dedicated head position."
		)
	if not candidates or not candidates[0].user:
		return None
	row = candidates[0]
	if not frappe.db.get_value("User", row.user, "enabled"):
		return None
	return row


def assert_route_settings(config):
	"""Fail closed while legacy department route fields coexist with company principals."""
	lock_company(config.company)
	settings = frappe.get_doc("Kandil Organization Settings", config.company, for_update=True)
	for legacy, canonical in [
		("hr_approver", "hr_approver"),
		("exception_approver", "sector_approver"),
		("ceo_approver", "ceo_approver"),
		("board_approver", "board_approver"),
	]:
		if config.get(legacy) and config.get(legacy) != settings.get(canonical):
			fail(
				"Department route authorities conflict with Organization Settings. Reconcile the configuration before submitting."
			)
	return settings


def resolve_route(company, department, position, as_of=None):
	"""Internal routing contract: manager chain plus explicit terminal HR; vacant seats recorded."""
	enabled_guard()
	at = getdate(as_of)
	lock_company(company)
	p = frappe.get_doc("Kandil Position", position, for_update=True)
	assert_scope(company, department, p.branch, capability="read")
	if p.company != company or p.department != department or (p.closed_on and getdate(p.closed_on) <= at):
		fail("Requested position does not match the active company and department.")
	settings = frappe.get_doc("Kandil Organization Settings", company, for_update=True)
	hierarchy = active_hierarchy(company, at)
	row = hierarchy.get(position)
	if not row:
		fail("Position has no approved hierarchy for the requested date.")
	current = row.parent_position
	steps, skipped, seen = [], [], {position}
	while current:
		if current in seen:
			fail("Position hierarchy cannot contain a cycle.")
		seen.add(current)
		parent = hierarchy.get(current)
		if not parent:
			fail("An authority position has no approved hierarchy for the requested date.")
		ancestor = frappe.get_doc("Kandil Position", current, for_update=True)
		if ancestor.company != company or (ancestor.closed_on and getdate(ancestor.closed_on) <= at):
			fail("An authority position is closed or outside this company.")
		assigned = authority_for(current, at)
		authority = parent.authority
		if assigned:
			roles = frappe.get_roles(assigned.user)
			needed = AUTHORITY_ROLES.get(authority)
			if needed not in roles:
				fail("An assigned authority does not have the required approval role.")
			steps.append(
				{
					"position": current,
					"principal": assigned.user,
					"authority": authority,
					"assignment": assigned.name,
				}
			)
		else:
			skipped.append(
				{"position": current, "reason": "Vacant or no enabled linked user", "authority": authority}
			)
		current = parent.parent_position
	if (
		not settings.hr_approver
		or not frappe.db.get_value("User", settings.hr_approver, "enabled")
		or "Kandil Recruiter" not in frappe.get_roles(settings.hr_approver)
	):
		fail("Configure an enabled terminal HR authority before submitting a request.")
	if not steps or steps[-1]["authority"] != "HR Approval" or steps[-1]["principal"] != settings.hr_approver:
		steps.append(
			{
				"position": None,
				"principal": settings.hr_approver,
				"authority": "HR Approval",
				"assignment": None,
			}
		)
	revision = digest(
		{
			"hierarchy": hierarchy,
			"steps": steps,
			"settings": {
				k: settings.get(k)
				for k in ["hr_approver", "sector_approver", "ceo_approver", "board_approver"]
			},
		}
	)
	return {
		"position": position,
		"as_of": str(at),
		"steps": steps,
		"skipped": skipped,
		"structure_revision": revision,
		"exception_approver": settings.sector_approver,
		"ceo_approver": settings.ceo_approver,
		"board_approver": settings.board_approver,
	}


def reconcile(company, as_of=None):
	at = getdate(as_of)
	state = structure_state(company)
	positions = {p.name: p for p in state["positions"]}
	rows = []
	assignments = [a for a in state["assignments"] if a.allocation == "Primary" and rules.effective(a, at)]
	capacities = (
		current_rows(
			"Kandil Capacity",
			filters={"company": company},
			fields=["name", "position", "structural", "occupied", "reserved", "open_slots"],
		)
		if frappe.get_meta("Kandil Capacity").has_field("position")
		else []
	)
	for p in positions.values():
		allocated = sum(a.position == p.name for a in assignments)
		ledgers = [c for c in capacities if c.position == p.name]
		baseline = sum(c.occupied for c in ledgers)
		rows.append(
			{
				"position": p.name,
				"structural": p.structural,
				"allocated": allocated,
				"capacity_occupied": baseline,
				"difference": baseline - allocated,
				"capacities": [c.name for c in ledgers],
				"over_allocated": allocated > p.structural,
			}
		)
	return {
		"as_of": str(at),
		"rows": rows,
		"unmapped_capacities": [c.name for c in capacities if not c.position],
		"balanced": all(r["difference"] == 0 and not r["over_allocated"] for r in rows)
		and all(c.position for c in capacities),
	}


@frappe.whitelist()
def reconcile_occupancy(company, as_of=None):
	authorize(company, "read")
	return reconcile(company, as_of)


def validate_new_position(op, company):
	if not isinstance(op.get("draft_key"), str) or not op["draft_key"] or len(op["draft_key"]) > 80:
		fail("A temporary draft key is required for a new position.")
	if not all(op.get(k) for k in ["title", "department", "designation", "authority"]):
		fail("New positions require a title, department, designation and approval authority.")
	if frappe.db.get_value("Department", op["department"], "company") != company:
		fail("Department must belong to the selected company.")
	if not frappe.db.exists("Designation", op["designation"]) or (
		op.get("branch") and not frappe.db.exists("Branch", op["branch"])
	):
		fail("Imported designation and branch must already exist.")
	if op["authority"] not in AUTHORITY_ROLES or op["authority"] == "Headcount Exception":
		fail("Select a supported approval authority.")
	quantity = op.get("structural", 1)
	if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity < 1:
		fail("Structural seats must be a positive whole number.")
	for field in ["title", "title_ar", "job_family", "external_id"]:
		if len(str(op.get(field) or "")) > 140:
			fail("Position text fields cannot exceed 140 characters.")


def planned_hierarchy(doc, state):
	rows = [dict(r) for r in state["hierarchy"]]
	at = getdate(doc.effective_on)
	operations = json.loads(doc.changes_json)
	seen = set()
	positions = {p.name: p for p in state["positions"]}
	for op in operations:
		if not isinstance(op, dict) or op.get("action") not in ["Create", "Reparent", "Resize", "Close"]:
			fail("Structure changes support Create, Reparent, Resize and Close operations.")
		if op["action"] == "Create":
			validate_new_position(op, doc.company)
			if getdate(doc.effective_on) != getdate():
				fail("New position creation must take effect today until scheduled creation is enabled.")
			key = ("Create", op["draft_key"])
			if key in seen:
				fail("Duplicate draft position key in structure request.")
			seen.add(key)
			parent = op.get("parent_position")
			if parent and (parent not in positions or positions[parent].status == "Closed"):
				fail("Select an active parent position in this company.")
			rows.append(
				{
					"position": "__new:" + op["draft_key"],
					"parent_position": parent,
					"authority": op["authority"],
					"valid_from": at,
					"valid_until": None,
				}
			)
			continue
		position = op.get("position")
		if position not in positions:
			fail("Every changed position must belong to this company.")
		if (position, op["action"]) in seen:
			fail("A structure change cannot repeat an action on the same position.")
		seen.add((position, op["action"]))
		if positions[position].status == "Closed":
			fail("Closed positions cannot be modified.")
		if op["action"] == "Reparent":
			parent = op.get("parent_position")
			if parent and (parent not in positions or positions[parent].status == "Closed"):
				fail("Select an active parent position in this company.")
			if op.get("authority") not in [
				"Department Approval",
				"Sector Approval",
				"HR Approval",
				"CEO Approval",
				"Board Approval",
			]:
				fail("Select a supported approval authority.")
			for row in rows:
				if row["position"] == position:
					if getdate(row["valid_from"]) >= at:
						fail("Hierarchy revision already exists on or after this effective date.")
					if not row.get("valid_until") or getdate(row["valid_until"]) >= at:
						row["valid_until"] = add_days(at, -1)
			rows.append(
				{
					"position": position,
					"parent_position": parent,
					"authority": op["authority"],
					"valid_from": at,
					"valid_until": None,
				}
			)
		else:
			if at != getdate():
				fail(
					"Seat resizing and position closure must take effect today until scheduled structural changes are enabled."
				)
			active = [
				a
				for a in state["assignments"]
				if a.position == position and (not a.valid_until or getdate(a.valid_until) >= at)
			]
			capacities = (
				current_rows(
					"Kandil Capacity",
					filters={"position": position},
					fields=["occupied", "reserved", "open_slots", "name"],
				)
				if frappe.get_meta("Kandil Capacity").has_field("position")
				else []
			)
			if len(capacities) > 1:
				fail("A position must map to at most one capacity ledger.")
			committed = sum(c.occupied + c.reserved + c.open_slots for c in capacities)
			if op["action"] == "Close":
				if (
					active
					or committed
					or any(
						r.get("parent_position") == position
						and (not r.get("valid_until") or getdate(r["valid_until"]) >= at)
						and not (
							positions.get(r["position"], {}).get("closed_on")
							and getdate(positions[r["position"]]["closed_on"]) <= at
						)
						for r in rows
					)
				):
					fail(
						"End assignments, commitments and subordinate hierarchy links before closing a position."
					)
			else:
				quantity = op.get("structural")
				if (
					not isinstance(quantity, int)
					or isinstance(quantity, bool)
					or quantity < max(1, rules.peak_occupancy(active), committed)
				):
					fail("Structural seats cannot be below allocated or committed headcount.")
	try:
		rules.validate_hierarchy(rows)
	except ValueError as exc:
		fail(str(exc))
	return operations, rows


@frappe.whitelist(methods=["POST"])
def preview_structure(name):
	doc = get_locked("Kandil Structure Change", name)
	if doc.status != "Draft":
		fail("Only draft structure changes can be previewed.")
	state = structure_state(doc.company)
	operations, rows = planned_hierarchy(doc, state)
	with transition():
		doc.snapshot_hash = digest(state)
		doc.preview_hash = digest(
			{"operations": operations, "effective_on": doc.effective_on, "baseline": doc.snapshot_hash}
		)
		doc.save()
	return {
		"preview_hash": doc.preview_hash,
		"operations": operations,
		"hierarchy": rows,
		"reconciliation": reconcile(doc.company, doc.effective_on),
	}


def structure_command(name, operation, command_id, expected_version, payload, handler):
	doc = get_locked("Kandil Structure Change", name)
	if not isinstance(command_id, str) or not command_id or len(command_id) > 100 or not expected_version:
		fail("A command ID and reviewed record version are required.")
	payload_hash = digest([operation, payload, str(expected_version)])
	history = json.loads(doc.command_history or "[]")
	prior = next((r for r in history if r["id"] == command_id and r["actor"] == frappe.session.user), None)
	if prior:
		if prior["payload_hash"] != payload_hash:
			fail("Command ID was already used with different data.")
		return prior["result"]
	if get_datetime(doc.modified) != get_datetime(expected_version):
		frappe.throw(_("This record changed. Reload it before deciding."), frappe.TimestampMismatchError)
	with transition():
		result = handler(doc)
		history.append(
			{"id": command_id, "actor": frappe.session.user, "payload_hash": payload_hash, "result": result}
		)
		doc.command_history = serialized(history)
		doc.save(ignore_permissions=True)
		from kandil_hr.foundation.outbox import enqueue

		next_step = next((row for row in doc.approval_steps if row.decision == "Pending"), None)
		recipients = {doc.owner}
		if doc.status == "Pending" and next_step:
			recipients.add(next_step.principal)
		for recipient in sorted(recipients):
			enqueue(
				"org:" + doc.name + ":" + command_id + ":" + recipient,
				recipient,
				_("Organization structure updated"),
				doc.name + ": " + _(doc.status),
				doc.doctype,
				doc.name,
			)
	return result


def structure_chain(doc):
	settings = frappe.get_doc("Kandil Organization Settings", doc.company, for_update=True)
	chain, skipped, seen = [], [], set()
	hierarchy = active_hierarchy(doc.company, doc.effective_on)
	for operation in json.loads(doc.changes_json):
		if operation["action"] == "Create":
			if not operation.get("parent_position"):
				skipped.append(
					{
						"draft_key": operation["draft_key"],
						"reason": "Initial structure; independent HR and CEO required",
					}
				)
				continue
			position = frappe.get_doc("Kandil Position", operation["parent_position"], for_update=True)
			parent_row = hierarchy.get(position.name)
			if not parent_row:
				fail("An authority position has no approved hierarchy for the requested date.")
			assigned = authority_for(position.name, doc.effective_on)
			if assigned and parent_row.authority not in ["HR Approval", "CEO Approval", "Board Approval"]:
				key = (assigned.user, parent_row.authority)
				if assigned.user != doc.owner and key not in seen:
					if AUTHORITY_ROLES.get(parent_row.authority) not in frappe.get_roles(assigned.user):
						fail("An assigned authority does not have the required approval role.")
					chain.append(
						{
							"position": position.name,
							"principal": assigned.user,
							"authority": parent_row.authority,
							"assignment": assigned.name,
						}
					)
					seen.add(key)
			elif not assigned:
				skipped.append(
					{
						"position": position.name,
						"authority": parent_row.authority,
						"reason": "Vacant or no enabled linked user",
					}
				)
		else:
			position = frappe.get_doc("Kandil Position", operation["position"], for_update=True)
		if position.name not in hierarchy:
			skipped.append(
				{"position": position.name, "reason": "Initial structure; independent HR and CEO required"}
			)
			continue
		resolved = resolve_route(doc.company, position.department, position.name, doc.effective_on)
		skipped.extend(resolved["skipped"])
		for step in resolved["steps"]:
			if step["authority"] in ["HR Approval", "CEO Approval", "Board Approval"]:
				continue
			if step["principal"] == doc.owner:
				skipped.append({**step, "reason": "Author self-approval"})
			elif (step["principal"], step["authority"]) not in seen:
				chain.append(step)
				seen.add((step["principal"], step["authority"]))
	for field in ["hr_approver", "ceo_approver"]:
		principal, authority = settings.get(field), SETTINGS_AUTHORITIES[field]
		if (
			not principal
			or principal == doc.owner
			or not frappe.db.get_value("User", principal, "enabled")
			or AUTHORITY_ROLES[authority] not in frappe.get_roles(principal)
		):
			fail("Configure independent enabled HR and CEO authorities before submitting a structure change.")
		assert_scope(doc.company, user=principal, capability="manage")
		chain.append({"principal": principal, "authority": authority, "position": None})
	for step in chain:
		assert_scope(doc.company, user=step["principal"], capability="manage")
	if settings.hr_approver == settings.ceo_approver:
		fail("HR and CEO structure approvals must be performed by different people.")
	return chain, skipped


@frappe.whitelist(methods=["POST"])
def submit_structure(name, preview_hash, command_id, expected_version):
	def act(doc):
		if doc.status != "Draft" or doc.owner != frappe.session.user:
			frappe.throw(_("Only the author can submit this draft structure change."), frappe.PermissionError)
		state = structure_state(doc.company)
		if not preview_hash or preview_hash != doc.preview_hash or doc.snapshot_hash != digest(state):
			fail("Structure changed after preview. Preview and review the changes again.")
		planned_hierarchy(doc, state)
		chain, skipped = structure_chain(doc)
		doc.set("approval_steps", [])
		for index, step in enumerate(chain):
			doc.append(
				"approval_steps",
				{
					"principal": step["principal"],
					"authority": step["authority"],
					"authority_position": step.get("position"),
					"decision": "Pending",
					"step_key": uuid.uuid4().hex,
					"waiting_since": now_datetime() if index == 0 else None,
				},
			)
		doc.route_snapshot = serialized({"chain": chain, "skipped": skipped})
		doc.status = "Pending"
		return {"name": doc.name, "status": doc.status, "snapshot": None}

	return structure_command(
		name, "submit", command_id, expected_version, {"preview_hash": preview_hash}, act
	)


@frappe.whitelist(methods=["POST"])
def decide_structure(
	name, preview_hash, decision, step_id=None, command_id=None, expected_version=None, comment=""
):
	def act(doc):
		require_independent(doc)
		step = next((s for s in doc.approval_steps if s.decision == "Pending"), None)
		if doc.status != "Pending" or not step or step.step_key != step_id:
			fail("This is no longer the active approval step.")
		if (
			step.principal != frappe.session.user
			or not frappe.db.get_value("User", step.principal, "enabled")
			or AUTHORITY_ROLES.get(step.authority) not in frappe.get_roles(step.principal)
		):
			frappe.throw(
				_("Only the active structural authority may decide this step."), frappe.PermissionError
			)
		if decision not in ["Approved", "Rejected"]:
			fail("Choose Approved or Rejected.")
		if decision == "Rejected" and not comment.strip():
			fail("A reason is required.")
		if preview_hash != doc.preview_hash:
			fail("The reviewed structure preview does not match this request.")
		state = structure_state(doc.company)
		if decision == "Approved" and doc.snapshot_hash != digest(state):
			fail("Structure changed after preview. Reject this change and create a new reviewed request.")
		operations, _rows = planned_hierarchy(doc, state) if decision == "Approved" else ([], [])
		step.reviewed_snapshot = serialized(
			{
				"changes": json.loads(doc.changes_json),
				"baseline": doc.snapshot_hash,
				"effective_on": doc.effective_on,
			}
		)
		step.decision, step.actor, step.decided_at, step.comment = (
			decision,
			frappe.session.user,
			now_datetime(),
			comment,
		)
		if decision == "Rejected":
			doc.status = "Rejected"
		elif all(s.decision == "Approved" for s in doc.approval_steps):
			apply_structure(doc, operations)
			doc.status = "Approved"
			doc.approved_by, doc.approved_at = frappe.session.user, now_datetime()
		else:
			next(s for s in doc.approval_steps if s.decision == "Pending").waiting_since = now_datetime()
		return {"name": doc.name, "status": doc.status, "snapshot": doc.snapshot}

	return structure_command(
		name,
		"decide",
		command_id,
		expected_version,
		{"preview_hash": preview_hash, "decision": decision, "step_id": step_id, "comment": comment},
		act,
	)


def apply_structure(doc, operations):
	# End all prior edges first: a valid bulk reorganization must not be
	# rejected merely because its new edges are inserted in another order.
	for op in operations:
		if op["action"] != "Reparent":
			continue
		for prior in current_rows(
			"Kandil Position Hierarchy",
			filters={"position": op["position"]},
			fields=["name", "valid_from", "valid_until"],
		):
			if not prior.valid_until or getdate(prior.valid_until) >= getdate(doc.effective_on):
				old = frappe.get_doc("Kandil Position Hierarchy", prior.name, for_update=True)
				old.valid_until = add_days(doc.effective_on, -1)
				old.save(ignore_permissions=True)
	created = {}
	for op in operations:
		if op["action"] == "Create":
			values = {
				key: op.get(key)
				for key in [
					"title",
					"title_ar",
					"department",
					"branch",
					"designation",
					"job_family",
					"external_id",
				]
			}
			p = frappe.get_doc(
				{
					"doctype": "Kandil Position",
					"company": doc.company,
					"structural": op.get("structural", 1),
					**values,
				}
			).insert(ignore_permissions=True)
			created[op["draft_key"]] = p.name
			frappe.get_doc(
				{
					"doctype": "Kandil Position Hierarchy",
					"company": p.company,
					"department": p.department,
					"branch": p.branch,
					"position": p.name,
					"parent_position": op.get("parent_position"),
					"authority": op["authority"],
					"valid_from": doc.effective_on,
					"structure_change": doc.name,
				}
			).insert(ignore_permissions=True)
			if p.branch:
				with recruitment_transition():
					frappe.get_doc(
						{
							"doctype": "Kandil Capacity",
							"company": p.company,
							"department": p.department,
							"branch": p.branch,
							"designation": p.designation,
							"position": p.name,
							"structural": p.structural,
							"occupied": 0,
						}
					).insert(ignore_permissions=True)
			continue
		p = frappe.get_doc("Kandil Position", op["position"], for_update=True)
		if op["action"] == "Reparent":
			frappe.get_doc(
				{
					"doctype": "Kandil Position Hierarchy",
					"company": p.company,
					"department": p.department,
					"branch": p.branch,
					"position": p.name,
					"parent_position": op.get("parent_position"),
					"authority": op["authority"],
					"valid_from": doc.effective_on,
					"structure_change": doc.name,
				}
			).insert(ignore_permissions=True)
		elif op["action"] == "Resize":
			# Future-dated resizing needs a scheduler; do not apply early.
			if getdate(doc.effective_on) != getdate():
				fail("Seat resizing must take effect today until scheduled structural changes are enabled.")
			p.structural = op["structural"]
			p.save(ignore_permissions=True)
			sync_capacity(p, p.structural)
		else:
			if getdate(doc.effective_on) != getdate():
				fail(
					"Position closure must take effect today until scheduled structural changes are enabled."
				)
			p.status, p.closed_on = "Closed", doc.effective_on
			p.save(ignore_permissions=True)
			sync_capacity(p, 0)
	doc.created_positions_json = serialized(created)
	snap = frappe.get_doc(
		{
			"doctype": "Kandil Structure Snapshot",
			"company": doc.company,
			"as_of": doc.effective_on,
			"payload_json": serialized(structure_state(doc.company)),
			"structure_change": doc.name,
		}
	)
	snap.digest = digest(json.loads(snap.payload_json))
	snap.insert(ignore_permissions=True)
	doc.snapshot = snap.name


def sync_capacity(position, quantity):
	if not frappe.get_meta("Kandil Capacity").has_field("position"):
		return
	names = current_rows("Kandil Capacity", filters={"position": position.name}, pluck="name")
	if len(names) > 1:
		fail("A position must map to at most one capacity ledger.")
	for name in names:
		cap = frappe.get_doc("Kandil Capacity", name, for_update=True)
		if quantity < cap.occupied + cap.reserved + cap.open_slots:
			fail("Structural seats cannot be below allocated or committed headcount.")
		with recruitment_transition():
			cap.structural = quantity
			cap.save(ignore_permissions=True)


@frappe.whitelist(methods=["POST"])
def approve_revision(doctype, name, expected_version=None):
	if doctype not in ["Kandil JD Revision", "Kandil Grade Band"]:
		fail("Unsupported revision type.")
	doc = get_locked(doctype, name, decision=True)
	require_independent(doc)
	if doc.status == "Approved":
		return {"name": doc.name, "status": doc.status}
	if doc.status != "Draft":
		fail("Only draft revisions can be approved.")
	if not expected_version or get_datetime(doc.modified) != get_datetime(expected_version):
		frappe.throw(_("This record changed. Reload it before deciding."), frappe.TimestampMismatchError)
	with transition():
		if doctype == "Kandil JD Revision":
			assert_scope(doc.company, capability="manage")
			job = frappe.db.get_value("Kandil Position", doc.position, "designation")
			positions = current_rows(
				"Kandil Position", filters={"company": doc.company, "designation": job}, pluck="name"
			)
			prior = current_rows(
				doctype,
				filters={"company": doc.company, "position": ["in", positions], "status": "Approved"},
				fields=["name", "revision", "valid_from"],
				order_by="valid_from desc, revision desc",
			)
			if prior and (
				doc.supersedes != prior[0].name or getdate(doc.valid_from) <= getdate(prior[0].valid_from)
			):
				fail(
					"The description must supersede the latest approved revision with a later effective date."
				)
			doc.revision = (prior[0].revision if prior else 0) + 1
			doc.approved_at = now_datetime()
		doc.status, doc.approved_by = "Approved", frappe.session.user
		doc.save()
	return {"name": doc.name, "status": doc.status}


def position_import_preview(doc):
	try:
		rows = json.loads(doc.rows_json)
		if not isinstance(rows, list) or not rows or len(rows) > 1000:
			raise ValueError
	except ValueError, TypeError:
		fail("Import must contain between 1 and 1000 position rows.")
	allowed = {
		"position_code",
		"title",
		"title_ar",
		"department",
		"branch",
		"designation",
		"structural",
		"external_id",
		"job_family",
	}
	seen, output = set(), []
	for row in rows:
		if (
			not isinstance(row, dict)
			or set(row) - allowed
			or not all(row.get(k) for k in ["position_code", "title", "department", "designation"])
		):
			fail(
				"Every import row needs a position code, title, department and designation; unsupported fields are rejected."
			)
		if row["position_code"] in seen:
			fail("Duplicate position code in import batch.")
		seen.add(row["position_code"])
		quantity = row.get("structural", 1)
		if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity < 1:
			fail("Imported structural seats must be positive whole numbers.")
		if frappe.db.get_value("Department", row["department"], "company") != doc.company:
			fail("Imported department must belong to this company.")
		if not frappe.db.exists("Designation", row["designation"]) or (
			row.get("branch") and not frappe.db.exists("Branch", row["branch"])
		):
			fail("Imported designation and branch must already exist.")
		data = {**row, "company": doc.company, "structural": quantity}
		existing = frappe.db.get_value(
			"Kandil Position",
			row["position_code"],
			["name", *allowed, "company"],
			as_dict=True,
			for_update=True,
		)
		if existing:
			if any((existing.get(k) or "") != (v or "") for k, v in data.items()):
				fail(
					"Existing position differs from the import. Use a reviewed structure change or edit descriptive fields first."
				)
			action = "Unchanged"
		else:
			action = "Create"
		output.append({"code": row["position_code"], "action": action, "data": data})
	return output


def import_rows(doc):
	try:
		rows = json.loads(doc.rows_json)
		if (
			not isinstance(rows, list)
			or not rows
			or len(rows) > 1000
			or any(not isinstance(row, dict) for row in rows)
		):
			raise ValueError
	except TypeError, ValueError:
		fail("Import must contain between 1 and 1000 valid rows.")
	return rows


def import_digest(doc):
	return digest(
		[
			doc.get("import_kind") or "Positions",
			json.loads(doc.rows_json),
			doc.get("baseline_reference") or "",
		]
	)


def equivalent(a, b, fields):
	def value(row, field):
		v = row.get(field)
		return str(v)[:10] if field in ["valid_from", "valid_until"] and v else (v or "")

	return all(value(a, field) == value(b, field) for field in fields)


def dated_import_preview(doc, kind):
	is_hierarchy = kind == "Hierarchy"
	doctype = "Kandil Position Hierarchy" if is_hierarchy else "Kandil Position Assignment"
	fields = (
		["position", "parent_position", "authority", "valid_from", "valid_until"]
		if is_hierarchy
		else ["position", "employee", "user", "allocation", "valid_from", "valid_until", "remarks"]
	)
	existing = current_rows(doctype, filters={"company": doc.company}, fields=["name", *fields])
	prospective = [dict(row) for row in existing]
	output, seen = [], set()
	positions = {
		p.name: p
		for p in current_rows(
			"Kandil Position",
			filters={"company": doc.company},
			fields=["name", "company", "department", "branch", "structural", "status", "closed_on"],
		)
	}
	for row in import_rows(doc):
		if set(row) - set(fields) or not row.get("position") or not row.get("valid_from"):
			fail("Dated imports require a position and valid-from date with supported fields only.")
		p = positions.get(row["position"])
		if not p:
			fail("Every imported position must belong to this company.")
		row = {field: row.get(field) for field in fields}
		try:
			row["valid_from"] = str(getdate(row["valid_from"]))
			row["valid_until"] = str(getdate(row["valid_until"])) if row.get("valid_until") else None
		except Exception:
			fail("Imported effective dates are invalid.")
		if getdate(row["valid_from"]) > getdate():
			fail("Baseline imports cannot schedule future structural or employee changes.")
		if row.get("valid_until") and getdate(row["valid_until"]) < getdate(row["valid_from"]):
			fail("Valid Until cannot be before Valid From.")
		if p.closed_on and (
			not row.get("valid_until") or getdate(row["valid_until"]) >= getdate(p.closed_on)
		):
			fail("An imported baseline cannot overlap a position closure.")
		if is_hierarchy:
			if row["authority"] not in AUTHORITY_ROLES or row["authority"] == "Headcount Exception":
				fail("Select a supported approval authority.")
			if row.get("parent_position") and row["parent_position"] not in positions:
				fail("Parent position must belong to the same company.")
		else:
			row["allocation"] = row.get("allocation") or "Primary"
			if row["allocation"] not in ["Primary", "Acting"] or not row.get("employee"):
				fail("Assignment imports require an employee and Primary or Acting allocation.")
			employee = frappe.db.get_value("Employee", row["employee"], ["company", "user_id"], as_dict=True)
			if not employee or employee.company != doc.company:
				fail("Employee must belong to the selected company.")
			row["user"] = row.get("user") or employee.user_id or None
			if row["user"] and employee.user_id != row["user"]:
				fail("Assignment user must be the enabled user linked to the employee.")
			if (
				row["user"]
				and not frappe.db.get_value("User", row["user"], "enabled")
				and (not row["valid_until"] or getdate(row["valid_until"]) >= getdate())
			):
				fail("Current assignment imports require an enabled linked user.")
		key = digest(row)
		if key in seen:
			fail("Duplicate dated row in import batch.")
		seen.add(key)
		match = next((r for r in existing if equivalent(r, row, fields)), None)
		data = {"company": doc.company, "department": p.department, "branch": p.branch, **row}
		output.append(
			{"code": key[:16], "action": "Unchanged" if match else "Create", "doctype": doctype, "data": data}
		)
		if not match:
			prospective.append(row)
	if is_hierarchy:
		try:
			rules.validate_hierarchy(prospective)
		except ValueError as exc:
			fail(str(exc))
		for row in prospective:
			if row.get("parent_position") and not any(
				r["position"] == row["parent_position"] and rules.effective(r, row["valid_from"])
				for r in prospective
			):
				fail("Every imported parent requires an effective hierarchy row on the child start date.")
	else:
		for index, row in enumerate(prospective):
			for other in prospective[index + 1 :]:
				if rules.overlap(row, other):
					if (
						row["allocation"] == other["allocation"] == "Primary"
						and row["employee"] == other["employee"]
					):
						fail("An employee cannot have overlapping primary position assignments.")
					if (
						row["allocation"] == other["allocation"] == "Acting"
						and row["position"] == other["position"]
					):
						fail("A position cannot have overlapping acting authorities.")
		for position, p in positions.items():
			if rules.peak_occupancy([r for r in prospective if r["position"] == position]) > p.structural:
				fail("Position assignments exceed structural seats.")
	return output


def import_preview(doc):
	kind = doc.get("import_kind") or "Positions"
	if kind == "Positions":
		return position_import_preview(doc)
	if kind in ["Hierarchy", "Assignments"]:
		return dated_import_preview(doc, kind)
	fail("Select a supported organization import kind.")


@frappe.whitelist(methods=["POST"])
def review_import(name, expected_version=None):
	doc = get_locked("Kandil Organization Import", name, decision=True)
	require_independent(doc)
	if doc.status == "Reviewed" and doc.reviewed_by == frappe.session.user:
		return json.loads(doc.preview_json)
	if doc.status != "Draft":
		fail("Only draft imports can be reviewed.")
	if not expected_version or get_datetime(doc.modified) != get_datetime(expected_version):
		frappe.throw(_("This record changed. Reload it before deciding."), frappe.TimestampMismatchError)
	preview = import_preview(doc)
	with transition():
		doc.preview_json, doc.digest = serialized(preview), import_digest(doc)
		doc.reviewed_by, doc.status = frappe.session.user, "Reviewed"
		doc.save()
	return preview


@frappe.whitelist(methods=["POST"])
def apply_import(name, reviewed_digest):
	doc = get_locked("Kandil Organization Import", name)
	if doc.status == "Applied" and doc.digest == reviewed_digest:
		return json.loads(doc.result_json)
	if doc.status != "Reviewed" or doc.digest != reviewed_digest or import_digest(doc) != doc.digest:
		fail("A matching reviewed import is required.")
	preview = import_preview(doc)
	with transition():
		for row in preview:
			if row["action"] == "Create":
				frappe.get_doc({"doctype": row.get("doctype", "Kandil Position"), **row["data"]}).insert()
		result = {
			"kind": doc.get("import_kind") or "Positions",
			"created": sum(r["action"] == "Create" for r in preview),
			"unchanged": sum(r["action"] == "Unchanged" for r in preview),
			"positions": [r["data"].get("position", r["code"]) for r in preview],
			"reconciliation": reconcile(doc.company),
		}
		if result["created"]:
			state = structure_state(doc.company)
			snapshot = frappe.get_doc(
				{
					"doctype": "Kandil Structure Snapshot",
					"company": doc.company,
					"as_of": getdate(),
					"payload_json": serialized({"import": doc.name, "kind": result["kind"], "state": state}),
					"digest": digest(state),
				}
			).insert()
			result["snapshot"] = snapshot.name
		doc.status, doc.result_json = "Applied", serialized(result)
		doc.save()
	return result


@frappe.whitelist()
def position_creation_policy():
	enabled_guard()
	if frappe.session.user == "Guest":
		frappe.throw(_("Login is required."), frappe.PermissionError)
	return {"approval_required": bool(frappe.conf.get("kandil_parity_enabled"))}


@frappe.whitelist(methods=["POST"])
def preview_csv_import(name, csv_text, expected_version):
	"""Validate normalized CSV against the live baseline without saving any data."""
	from kandil_hr.organization.csv_import import CSVImportError, parse

	doc = get_locked("Kandil Organization Import", name)
	if doc.status != "Draft" or doc.owner != frappe.session.user:
		frappe.throw(_("Only the author can load CSV into this draft import."), frappe.PermissionError)
	if not expected_version or get_datetime(doc.modified) != get_datetime(expected_version):
		frappe.throw(_("This record changed. Reload it before deciding."), frappe.TimestampMismatchError)
	try:
		rows = parse(csv_text, doc.get("import_kind") or "Positions")
	except CSVImportError as exc:
		fail(str(exc))
	proposed = frappe.get_doc(
		{
			"doctype": doc.doctype,
			"company": doc.company,
			"import_kind": doc.get("import_kind") or "Positions",
			"rows_json": serialized(rows),
			"baseline_reference": doc.get("baseline_reference"),
		}
	)
	preview = import_preview(proposed)
	return {
		"rows": rows,
		"preview": preview,
		"row_count": len(rows),
		"digest": import_digest(proposed),
		"expected_version": str(doc.modified),
	}
