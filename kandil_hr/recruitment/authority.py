"""Explicit interest and Board authority rules from CHG-74/78.

These implement the frozen source direction, not HR sign-off on a deployment's
nominated people. Ordinary delegation cannot replace Board membership/recording.
Call mutation helpers after Company/request/capacity locks.
"""

import json

import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import cint, getdate

from kandil_hr.foundation.clock import today_cairo
from kandil_hr.foundation.mutation_access import assert_current_request_scope, current_identity
from kandil_hr.foundation.outbox import enqueue
from kandil_hr.organization.current import rows
from kandil_hr.organization.rules import effective

BOARD_METHODS = ("MEETING", "WHATSAPP", "PHONE", "EMAIL", "PAPER", "OTHER")


def install():
	if not frappe.conf.get("kandil_parity_enabled"):
		return
	create_custom_fields(
		{
			"Kandil Organization Settings": [
				dict(
					fieldname="board_vice_approver",
					label="Board Vice Approver",
					fieldtype="Link",
					options="User",
					insert_after="board_approver",
				)
			],
			"Kandil Hiring Request": [
				dict(
					fieldname="beneficiary_user",
					label="Beneficiary User",
					fieldtype="Link",
					options="User",
					insert_after="requested_by",
					description="Optional explicit beneficiary. Own-position interests are also checked automatically.",
				)
			],
			"Kandil Approval Step": [
				dict(
					fieldname="board_vice",
					label="Frozen Board Vice",
					fieldtype="Link",
					options="User",
					read_only=1,
				),
				dict(
					fieldname="board_member",
					label="Deciding Board Member",
					fieldtype="Link",
					options="User",
					read_only=1,
				),
				dict(
					fieldname="on_behalf_method",
					label="External Board Decision Method",
					fieldtype="Select",
					options="\n" + "\n".join(BOARD_METHODS),
					read_only=1,
				),
				dict(
					fieldname="on_behalf_note",
					label="External Board Decision Note",
					fieldtype="Small Text",
					read_only=1,
				),
			],
		}
	)


def validate_settings(doc, method=None):
	if not frappe.conf.get("kandil_parity_enabled") or not doc.get("board_vice_approver"):
		return
	if "Kandil Board Approver" not in current_identity(doc.board_vice_approver):
		frappe.throw(_("The Board Vice must be an enabled Board approver."))
	if doc.board_vice_approver == doc.board_approver:
		frappe.throw(_("Board Chairman and Vice must be distinct users."))


def _snapshot(doc):
	try:
		return json.loads(doc.route_snapshot or "{}")
	except TypeError, ValueError:
		frappe.throw(_("The frozen approval authority snapshot is invalid."))


def interested_users(doc):
	"""Union frozen and current facts so later identity edits cannot erase interest."""
	users = {doc.requested_by, doc.owner, doc.get("beneficiary_user")} - {None, ""}
	frozen = _snapshot(doc).get("interest_snapshot") or {}
	users.update(frozen.get("users") or [])
	positions = {doc.requested_position} - {None, ""}
	for line in doc.lines:
		for cap in rows(
			"Kandil Capacity", filters={"name": line.capacity, "company": doc.company}, fields=["position"]
		):
			if cap.position:
				positions.add(cap.position)
	if positions:
		for row in rows(
			"Kandil Position Assignment",
			filters={"company": doc.company, "position": ["in", sorted(positions)]},
			fields=["employee", "user", "valid_from", "valid_until"],
		):
			if effective(row, today_cairo()):
				if row.user:
					users.add(row.user)
				# Native assignments may omit optional User. The linked Employee's
				# account still creates an own-position interest; never omit it.
				for employee in rows(
					"Employee", filters={"name": row.employee, "company": doc.company}, fields=["user_id"]
				):
					if employee.user_id:
						users.add(employee.user_id)
	return users


def enforce_chain(doc, chain, config):
	"""Return (chain, skipped, frozen interests); caller stores the snapshot."""
	interests = interested_users(doc)
	filtered, skipped, needs_ceo = [], [], False
	for principal, authority, position in chain:
		if principal in interests:
			if authority in ("CEO Approval", "Board Approval"):
				frappe.throw(_("Configure an independent authority for this personal request."))
			skipped.append(
				dict(
					principal=principal,
					authority=authority,
					position=position,
					reason="Personal interest: requester, creator, beneficiary or own position",
				)
			)
			needs_ceo = needs_ceo or authority in ("HR Approval", "Headcount Exception")
			continue
		filtered.append((principal, authority, position))
	needs_ceo = needs_ceo or any(a == "Board Approval" for _, a, _ in filtered)
	if needs_ceo and not any(a == "CEO Approval" for _, a, _ in filtered):
		if not config.ceo_approver or config.ceo_approver in interests:
			frappe.throw(_("Personal or Board requests require an independent CEO authority."))
		filtered.append((config.ceo_approver, "CEO Approval", None))
	if (
		cint(config.board_after_ceo)
		and any(a == "CEO Approval" for _, a, _ in filtered)
		and not any(a == "Board Approval" for _, a, _ in filtered)
	):
		if not config.board_approver or config.board_approver in interests:
			frappe.throw(_("Configure an independent Board authority."))
		filtered.append((config.board_approver, "Board Approval", None))
	# All required CEO decisions precede Board, including dated Board-only rules.
	filtered = [s for s in filtered if s[1] != "Board Approval"] + [
		s for s in filtered if s[1] == "Board Approval"
	]
	if not filtered:
		frappe.throw(_("At least one independent approval is required."))
	return filtered, skipped, dict(users=sorted(interests), evaluated_on=str(today_cairo()))


def notify_vacant_heads(doc, resolved):
	skipped = resolved.get("skipped") or []
	if not skipped:
		return None
	policy = _snapshot(doc).get("policy") or {}
	hr = policy.get("hr_approver")
	if not hr:
		frappe.throw(_("A vacant authority notice requires the frozen HR reviewer."))
	return enqueue(
		f"{doc.name}:{doc.revision}:vacant-heads:{hr}",
		hr,
		_("Vacant approval position"),
		json.dumps(dict(request=doc.name, skipped=skipped), ensure_ascii=False, sort_keys=True),
		doc.doctype,
		doc.name,
	)


def authorize_board(
	doc, step, board_evidence=None, on_behalf_method=None, on_behalf_note=None, board_member=None
):
	"""Return actual deciding member; caller records actor separately on the step."""
	policy = _snapshot(doc).get("policy") or {}
	chair, vice = step.principal, policy.get("board_vice_approver")
	members = {chair, vice} - {None, ""}
	actor = frappe.session.user
	member = board_member or actor
	if member not in members:
		frappe.throw(_("Select the frozen Board Chairman or Vice."), frappe.PermissionError)
	interests = interested_users(doc)
	if actor in interests or member in interests:
		frappe.throw(
			_("An interested person cannot decide or record this Board decision."), frappe.PermissionError
		)
	# The command must have locked its domain first. User locks are sorted here.
	for user in sorted({actor, member, chair}):
		frappe.db.sql("SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE", (user,))
	assert_current_request_scope(doc, user=member, required_roles=("Kandil Board Approver",))
	evidence = frappe.get_doc("File", board_evidence, for_update=True) if board_evidence else None
	if evidence:
		if (
			not evidence.is_private
			or evidence.is_folder
			or evidence.is_remote_file
			or not (evidence.file_url or "").startswith("/private/files/")
			or evidence.attached_to_doctype != doc.doctype
			or evidence.attached_to_name != doc.name
		):
			frappe.throw(_("Board proof must be private and attached to this request."))
		evidence.check_permission("read")
	if actor == member:
		if on_behalf_method or on_behalf_note:
			frappe.throw(_("Direct Board decisions do not use external recording fields."))
		return member
	if actor != policy.get("exception_approver"):
		frappe.throw(
			_("Only the frozen Sector authority can record an external Board decision."),
			frappe.PermissionError,
		)
	assert_current_request_scope(doc, required_roles=("Kandil Sector Approver",))
	if on_behalf_method not in BOARD_METHODS:
		frappe.throw(_("Select the external Board decision method."))
	if not isinstance(on_behalf_note, str) or not 3 <= len(on_behalf_note.strip()) <= 2000:
		frappe.throw(_("Record who approved and when in a Board note of 3 to 2000 characters."))
	if (
		not evidence
		or not evidence.is_private
		or evidence.attached_to_doctype != doc.doctype
		or evidence.attached_to_name != doc.name
	):
		frappe.throw(_("Board decisions on behalf require private evidence attached to this request."))
	evidence.check_permission("read")
	return member


def assert_independent(doc, actor, principal):
	interests = interested_users(doc)
	if actor in interests or principal in interests:
		frappe.throw(_("An interested person cannot approve this request."), frappe.PermissionError)


def board_reader(doc, user):
	if not frappe.db.get_value("User", user, "enabled") or "Kandil Board Approver" not in frappe.get_roles(
		user
	):
		return False
	return any(s.authority == "Board Approval" and s.get("board_vice") == user for s in doc.approval_steps)


def board_query(user):
	if not frappe.db.get_value("User", user, "enabled") or "Kandil Board Approver" not in frappe.get_roles(
		user
	):
		return "1=0"
	return (
		"EXISTS (SELECT 1 FROM `tabKandil Approval Step` bv WHERE bv.parent=`tabKandil Hiring Request`.name AND bv.parenttype='Kandil Hiring Request' AND bv.authority='Board Approval' AND bv.board_vice="
		+ frappe.db.escape(user)
		+ ")"
	)
