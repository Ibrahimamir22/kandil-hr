"""Atomic requester-only quantity revision of an existing Pending reservation.

This explicit command restarts every approval. Native Pending edits remain
forbidden; approved amendments and HR corrections retain their own contracts.
"""

import json
import uuid

import frappe
from frappe import _
from frappe.utils import cint

from kandil_hr.organization.occupancy import assert_increase, capture_basis
from kandil_hr.pilot.api import change_capacity, lock_capacities, transactional_retry
from kandil_hr.pilot.models import integer
from kandil_hr.recruitment import api
from kandil_hr.recruitment.headcount_contract import enforce_shortage


def quantity_map(value):
	def unique(pairs):
		result = {}
		for key, item in pairs:
			if key in result:
				frappe.throw(_("Each request line must appear exactly once."))
			result[key] = item
		return result

	if isinstance(value, str):
		try:
			value = json.loads(value, object_pairs_hook=unique)
		except ValueError, TypeError:
			frappe.throw(_("Provide a complete quantity map for the existing request lines."))
	if not isinstance(value, dict) or not value or not all(isinstance(key, str) for key in value):
		frappe.throw(_("Provide a complete quantity map for the existing request lines."))
	return value


@frappe.whitelist(methods=["POST"])
@transactional_retry
def revise_pending_quantities(name, command_id, expected_version, quantities, reason, exception_reason=None):
	submitted = quantity_map(quantities)
	if not isinstance(reason, str) or not 3 <= len(reason.strip()) <= 2000:
		frappe.throw(_("A revision reason of 3 to 2000 characters is required."))
	if exception_reason is not None and (
		not isinstance(exception_reason, str) or len(exception_reason) > 2000
	):
		frappe.throw(_("The exception justification must contain at most 2000 characters."))

	def act(doc):
		if doc.requested_by != frappe.session.user or doc.status != "Pending" or doc.amends:
			frappe.throw(
				_("Only the requester can revise quantities on this pending original request."),
				frappe.PermissionError,
			)
		if set(submitted) != {line.name for line in doc.lines}:
			frappe.throw(_("Provide every existing request line exactly once; locations cannot change."))
		parsed = {}
		for key, value in submitted.items():
			if isinstance(value, bool):
				frappe.throw(_("Revised quantities must be positive whole numbers."))
			parsed[key] = integer(value)
			if parsed[key] <= 0:
				frappe.throw(_("Revised quantities must be positive whole numbers."))
		if all(parsed[line.name] == cint(line.proposed_qty) for line in doc.lines):
			return dict(doc.as_dict(), pending_revision_unchanged=True)

		caps = lock_capacities(doc)
		config = api.route_config(doc)
		old_reserved = {line.name: cint(line.reserved_qty) for line in doc.lines}
		evaluation = []
		basis_caps = {}
		for line in doc.lines:
			cap = caps[line.capacity]
			assert_increase(cap)
			own = old_reserved[line.name]
			if cint(line.approved_qty) or cint(line.joined_qty) or cint(line.closed_qty) or line.job_opening:
				frappe.throw(_("Pending quantity revisions cannot change an existing vacancy."))
			if own < 0 or own > cint(cap.reserved):
				frappe.throw(_("The reservation ledger needs reconciliation before this revision."))
			available = cap.available + own
			evaluation.append(
				dict(
					line=line.name,
					capacity=cap.name,
					requested=parsed[line.name],
					own_reserved=own,
					available=cap.available,
					effective_available=available,
					delta=parsed[line.name] - own,
					excess=max(0, parsed[line.name] - available),
					occupied=cap.occupied,
					structural=cap.structural,
					open_slots=cap.open_slots,
					reserved=cap.reserved,
					occupancy_basis=cap.occupancy_basis,
					occupancy_as_of=str(cap.occupancy_as_of),
				)
			)
			# capture_basis normally runs before initial reservation. Give it the
			# equivalent *in-memory* ledger with this old reservation excluded;
			# all other request cohorts remain charged. Never release seats in DB.
			basis = frappe.get_doc(cap.as_dict())
			basis.reserved = cint(cap.reserved) - own
			basis.available = available
			basis_caps[cap.name] = basis
		excess = any(row["excess"] > 0 for row in evaluation)
		justification = doc.exception_reason if exception_reason is None else exception_reason
		# Bounded denial adapter integrates here: this is the exact evaluated
		# point, after current authorization/locks and before business changes.
		from kandil_hr.recruitment.headcount_denials import build_evaluation

		enforce_shortage(
			excess=excess,
			mode=config.headcount_mode,
			reason=justification,
			evaluation=build_evaluation(
				doc, caps, config, requested_quantities=parsed,
				own_reservations=old_reserved, exception_reason=justification,
			),
		)
		api.snapshot(doc, "Pending quantity revision source")
		doc.revision = cint(doc.revision) + 1
		doc.exception_reason = justification
		doc.needs_exception = int(excess)
		for line in doc.lines:
			line.requested_qty = parsed[line.name]
			line.proposed_qty = parsed[line.name]
			line.reserved_qty = parsed[line.name]
		chain = api.resolve_chain(doc, excess)
		capture_basis(doc, basis_caps)
		route = json.loads(doc.route_snapshot)
		route["pending_quantity_revision"] = dict(reason=reason, lines=evaluation)
		doc.route_snapshot = api.dump(route)
		doc.set("approval_steps", [])
		for index, (principal, authority, position) in enumerate(chain):
			doc.append(
				"approval_steps",
				dict(
					principal=principal,
					authority=authority,
					authority_position=position,
					board_vice=config.get("board_vice_approver") if authority == "Board Approval" else None,
					decision="Pending",
					step_key=uuid.uuid4().hex,
					waiting_since=api.now_datetime() if index == 0 else None,
				),
			)
		doc.submitted_snapshot = api.dump(api.snapshot_payload(doc))
		for line in doc.lines:
			change_capacity(caps[line.capacity], reserved=parsed[line.name] - old_reserved[line.name])
		result = api.save(doc, "Pending quantities revised", reason.strip())
		from kandil_hr.recruitment.authority import notify_vacant_heads

		notify_vacant_heads(doc, route["resolved"])
		return result

	return api.command(
		name,
		"revise_pending_quantities",
		command_id,
		expected_version,
		dict(quantities=submitted, reason=reason, exception_reason=exception_reason),
		act,
	)
