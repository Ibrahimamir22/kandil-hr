"""Dated assignment occupancy is authoritative; legacy imported counts need review."""

import json
from contextlib import contextmanager

import frappe
from frappe import _
from frappe.utils import cint, get_datetime

from kandil_hr.foundation.clock import today_cairo
from kandil_hr.foundation.mutation_access import assert_current_scope
from kandil_hr.foundation.security import assert_scope
from kandil_hr.organization import rules
from kandil_hr.organization.current import rows
from kandil_hr.organization.models import lock_company


@contextmanager
def refresh_context():
	old = frappe.flags.get("kandil_occupancy_refresh")
	frappe.flags.kandil_occupancy_refresh = True
	try:
		yield
	finally:
		frappe.flags.kandil_occupancy_refresh = old


def values(cap, as_of=None):
	at = as_of or today_cairo()
	assignments = rows(
		"Kandil Position Assignment",
		filters={"position": cap.position, "allocation": "Primary"},
		fields=["name", "employee", "valid_from", "valid_until", "allocation"],
	)
	occupied = sum(rules.effective(row, at) for row in assignments)
	basis = cap.get("occupancy_basis") or "Legacy Baseline"
	unresolved = basis != "Dated Assignments" and cint(cap.occupied) not in (0, occupied)
	assignment_available = cint(cap.structural) - occupied - cint(cap.reserved) - cint(cap.open_slots)
	return dict(
		as_of=str(at),
		occupied=occupied,
		capacity_occupied=cint(cap.occupied),
		difference=cint(cap.occupied) - occupied,
		available=assignment_available - (max(0, cint(cap.occupied) - occupied) if unresolved else 0),
		assignment_available=assignment_available,
		unresolved=unresolved,
		basis=cap.get("occupancy_basis") or "Legacy Baseline",
		expected_version=str(cap.modified),
	)


def refresh_locked(cap):
	"""Caller holds Company then Capacity. Run before a joining inserts its episode."""
	result = values(cap)
	basis = cap.get("occupancy_basis") or "Legacy Baseline"
	if basis != "Dated Assignments" and cint(cap.occupied) not in (0, result["occupied"]):
		# Keep imported discrepancy visible. Never erase unmatched baseline employees.
		cap.flags.occupancy_unresolved = True
		cap.available = (
			cint(cap.structural)
			- max(cint(cap.occupied), result["occupied"])
			- cint(cap.reserved)
			- cint(cap.open_slots)
		)
		return
	if (cint(cap.occupied), basis, str(cap.get("occupancy_as_of") or "")) != (
		result["occupied"],
		"Dated Assignments",
		result["as_of"],
	):
		from kandil_hr.pilot.api import transition

		with refresh_context(), transition():
			cap.occupied = result["occupied"]
			cap.occupancy_basis = "Dated Assignments"
			cap.occupancy_as_of = result["as_of"]
			cap.save(ignore_permissions=True)
	cap.available = result["available"]
	cap.flags.occupancy_unresolved = False


def assert_increase(cap):
	if cap.flags.get("occupancy_unresolved"):
		frappe.throw(_("Review the unmatched occupied baseline before adding or approving headcount."))


def committed(row):
	return cint(row.reserved_qty) + max(
		0, cint(row.approved_qty) - cint(row.joined_qty) - cint(row.closed_qty)
	)


def active_lines(capacity):
	lines = rows(
		"Kandil Request Line",
		filters={"capacity": capacity},
		fields=["name", "parent", "reserved_qty", "approved_qty", "joined_qty", "closed_qty"],
	)
	parents = (
		{
			r.name: r.status
			for r in rows(
				"Kandil Hiring Request",
				filters={"name": ["in", sorted({r.parent for r in lines})]},
				fields=["name", "status"],
			)
		}
		if lines
		else {}
	)
	return [r for r in lines if parents.get(r.parent) not in ("Cancelled", "Rejected", "Applied")]


def capture_basis(doc, caps):
	value = json.loads(doc.route_snapshot or "{}")
	basis = {}
	for line in doc.lines:
		cap = caps[line.capacity]
		prior = [r for r in active_lines(cap.name) if r.parent != doc.name]
		cohort = {
			r.name: dict(committed=committed(r), joined=cint(r.joined_qty), closed=cint(r.closed_qty))
			for r in prior
			if committed(r)
		}
		basis[cap.name] = dict(
			occupied=cap.occupied,
			structural=cap.structural,
			other_commitments=cap.reserved + cap.open_slots,
			additional=line.reserved_qty,
			cohort=cohort,
			unmatched_commitments=max(
				0, cap.reserved + cap.open_slots - sum(r["committed"] for r in cohort.values())
			),
		)
	value["headcount_basis"] = basis
	doc.route_snapshot = json.dumps(value, default=str)


def surviving_commitments(capacity, basis):
	# Joined/closed deltas consume the original cohort; later top-ups cannot
	# refill it. New requests are excluded from this earlier reservation basis.
	current = {r.name: r for r in active_lines(capacity)}
	total = basis["unmatched_commitments"]
	for name, original in basis["cohort"].items():
		row = current.get(name)
		if row:
			remaining = max(
				0,
				original["committed"]
				- max(0, cint(row.joined_qty) - original["joined"])
				- max(0, cint(row.closed_qty) - original["closed"]),
			)
			total += min(remaining, committed(row))
	return total


def assert_approval(doc, caps):
	basis = json.loads(doc.route_snapshot or "{}").get("headcount_basis", {})
	current_additional = {line.capacity: cint(line.reserved_qty) for line in doc.lines}
	for cap in caps.values():
		assert_increase(cap)
		original = basis.get(cap.name)
		if not original or "cohort" not in original:
			frappe.throw(_("Occupied headcount changed. Return this request for a fresh headcount review."))
		reviewed_shortage = max(
			0,
			original["occupied"]
			+ original["other_commitments"]
			+ original["additional"]
			- original["structural"],
		)
		current_shortage = max(
			0,
			cap.occupied
			+ surviving_commitments(cap.name, original)
			+ current_additional[cap.name]
			- cap.structural,
		)
		if current_shortage > reviewed_shortage:
			frappe.throw(_("Occupied headcount changed. Return this request for a fresh headcount review."))


def locked_read(name):
	company = frappe.db.get_value("Kandil Capacity", name, "company")
	if not frappe.conf.get("kandil_parity_enabled"):
		frappe.throw(_("Dated occupancy requires the parity HR site."), frappe.PermissionError)
	lock_company(company)
	cap = frappe.get_doc("Kandil Capacity", name, for_update=True)
	cap.check_permission("read")
	assert_scope(company, cap.department, cap.branch, capability="read")
	return cap


@frappe.whitelist()
def preview(name):
	return values(locked_read(name))


@frappe.whitelist(methods=["POST"])
def reconcile_baseline(name, expected_version, expected_occupied, expected_baseline, reason):
	cap = locked_read(name)
	result = values(cap)
	if not isinstance(reason, str) or not reason.strip():
		frappe.throw(_("A reconciliation reason is required."))
	if len(reason) > 2000:
		frappe.throw(_("Reconciliation reason cannot exceed 2000 characters."))
	if (
		get_datetime(cap.modified) != get_datetime(expected_version)
		or result["occupied"] != cint(expected_occupied)
		or cap.occupied != cint(expected_baseline)
	):
		frappe.throw(_("Occupancy changed. Preview the reconciliation again."), frappe.TimestampMismatchError)
	assert_current_scope(cap.company, cap.department, cap.branch, required_roles=("Kandil Sector Approver",))
	from kandil_hr.pilot.api import transition

	previous_as_of = str(cap.occupancy_as_of) if cap.occupancy_as_of else None
	with refresh_context(), transition():
		cap.occupied = result["occupied"]
		cap.occupancy_basis = "Dated Assignments"
		cap.occupancy_as_of = result["as_of"]
		cap.save(ignore_permissions=True)
		cap.add_comment(
			"Info",
			_("Occupied baseline reconciled")
			+ f": {cint(expected_baseline)} → {cap.occupied}. "
			+ frappe.utils.escape_html(reason),
		)
		from kandil_hr.foundation.models import record_security_event

		record_security_event(
			"Occupied baseline reconciled",
			frappe.session.user,
			json.dumps(
				{
					"actor": frappe.session.user,
					"principal": frappe.session.user,
					"command": "occupancy.reconcile_baseline",
					"command_origin": "server_invocation",
					"payload": {
						"name": name,
						"expected_version": str(expected_version),
						"expected_occupied": expected_occupied,
						"expected_baseline": expected_baseline,
						"reason": reason,
					},
					"capacity": cap.name,
					"company": cap.company,
					"before": cint(expected_baseline),
					"after": cap.occupied,
					"as_of": result["as_of"],
					"before_as_of": previous_as_of,
					"after_as_of": str(cap.occupancy_as_of),
					"before_basis": result["basis"],
					"after_basis": cap.occupancy_basis,
					"reason": reason,
				},
				ensure_ascii=False,
			),
			reference=cap.name,
		)
	return values(cap)
