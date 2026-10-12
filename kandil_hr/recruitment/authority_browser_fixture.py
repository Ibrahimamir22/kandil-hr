"""Isolated native Board/delegation browser fixture; parity CLI only."""

import hashlib
import json
import secrets
import uuid

import frappe
from frappe.utils import add_days, today
from frappe.utils.password import update_password

from kandil_hr.recruitment import api, browser_fixture, vacancies
from kandil_hr.recruitment.concurrency_fixture import insert, persist
from kandil_hr.recruitment.test_commands import acting_as


def load(run_id):
	browser_fixture.guard(run_id)
	data = json.loads(browser_fixture.path_for(run_id).read_text())
	if data["company"] != "Kandil BROWSER TEST " + run_id:
		raise RuntimeError("Authority fixture scope mismatch")
	return data


def prepare(run_id):
	browser_fixture.guard(run_id)
	browser_fixture.prepare(run_id)
	data = load(run_id)
	with acting_as(data["users"]["hr"]["email"]):
		doc = frappe.get_doc("Kandil Hiring Request", data["requests"]["correction"])
		api.cancel_request(
			doc.name, uuid.uuid4().hex, str(doc.modified), "Release base fixture capacity for Board proof"
		)
	for key, role in [
		("ceo", "Kandil CEO Approver"),
		("chair", "Kandil Board Approver"),
		("vice", "Kandil Board Approver"),
		("delegate_en", "Kandil Approver"),
		("delegate_ar", "Kandil Approver"),
		("recruiter", "Kandil Recruiter"),
	]:
		email = f"browser-{run_id}-{key}@example.invalid"
		password = secrets.token_urlsafe(36)
		insert(
			"User",
			email=email,
			first_name=f"BROWSER-{run_id} {key}",
			enabled=1,
			send_welcome_email=0,
			user_type="System User",
			language="en",
			roles=[dict(role=role)],
		)
		update_password(email, password, logout_all_sessions=True)
		data["users"][key] = dict(email=email, password=password)
		insert(
			"Kandil Access Grant",
			user=email,
			company=data["company"],
			department=data["department"],
			valid_from=today(),
			can_manage_recruitment=1,
			can_view_sensitive=1,
			reason="Synthetic native Board/delegation browser scope",
		)
	settings = frappe.get_doc("Kandil Organization Settings", data["company"])
	settings.ceo_approver = data["users"]["ceo"]["email"]
	settings.board_approver = data["users"]["chair"]["email"]
	settings.board_vice_approver = data["users"]["vice"]["email"]
	settings.save()
	route = frappe.get_doc(
		"Kandil Recruitment Route", {"company": data["company"], "department": data["department"]}
	)
	route.ceo_approver = settings.ceo_approver
	route.board_approver = settings.board_approver
	route.board_after_ceo = 1
	route.ceo_for_critical = 1
	route.save()
	data["delegations"] = {}
	data["proofs"] = {}
	for locale in ("en", "ar"):
		with acting_as(data["users"]["sector"]["email"]):
			delegation = frappe.get_doc(
				dict(
					doctype="Kandil Delegation",
					company=data["company"],
					department=data["department"],
					from_user=settings.ceo_approver,
					to_user=data["users"]["delegate_" + locale]["email"],
					from_date=today(),
					to_date=add_days(today(), 10),
					reason="Synthetic CEO delegation " + locale,
					process_scope="APPROVALS",
				)
			).insert()
		data["delegations"][locale] = delegation.name
	position = frappe.db.get_value("Kandil Capacity", data["capacity"], "position")
	for label in ("board_en", "board_ar", "board_vice"):
		with acting_as(data["users"]["requester"]["email"]):
			doc = frappe.get_doc(
				dict(
					doctype="Kandil Hiring Request",
					company=data["company"],
					department=data["department"],
					title=f"BROWSER-{run_id} {label}",
					requested_position=position,
					need_reason="Expansion",
					revision=1,
					requested_priority="Critical",
					qualifications="Synthetic Board browser fixture",
					lines=[dict(capacity=data["capacity"], requested_qty=1)],
				)
			).insert()
			api.submit_request(doc.name, uuid.uuid4().hex, str(doc.modified))
		data["requests"][label] = doc.name
		for actor in ("manager", "hr", "ceo"):
			with acting_as(data["users"][actor]["email"]):
				doc.reload()
				step = next(s for s in doc.approval_steps if s.decision == "Pending")
				api.decide(
					doc.name,
					"Approve",
					step.step_key,
					uuid.uuid4().hex,
					str(doc.modified),
					comment="Synthetic browser fixture preceding authority approval",
				)
		if label != "board_vice":
			with acting_as(data["users"]["sector"]["email"]):
				file = frappe.get_doc(
					dict(
						doctype="File",
						file_name=f"board-proof-{run_id}-{label}.txt",
						is_private=1,
						attached_to_doctype=doc.doctype,
						attached_to_name=doc.name,
						content=f"SYNTHETIC ONLY. Vice Board approval proof {run_id} {label}. No real personal data.".encode(),
					)
				).insert()
			data["proofs"][label] = dict(name=file.name, url=file.file_url)
	with acting_as(data["users"]["requester"]["email"]):
		doc = frappe.get_doc(
			dict(
				doctype="Kandil Hiring Request",
				company=data["company"],
				department=data["department"],
				title=f"BROWSER-{run_id} ownership select",
				requested_position=position,
				need_reason="Expansion",
				revision=1,
				requested_priority="Normal",
				qualifications="Synthetic ownership native Select check",
				lines=[dict(capacity=data["capacity"], requested_qty=1)],
			)
		).insert()
		api.submit_request(doc.name, uuid.uuid4().hex, str(doc.modified))
	data["requests"]["ownership"] = doc.name
	for actor in ("manager", "hr"):
		with acting_as(data["users"][actor]["email"]):
			doc.reload()
			step = next(s for s in doc.approval_steps if s.decision == "Pending")
			api.decide(
				doc.name,
				"Approve",
				step.step_key,
				uuid.uuid4().hex,
				str(doc.modified),
				comment="Synthetic owner Select fixture",
			)
	with acting_as(data["users"]["hr"]["email"]):
		doc.reload()
		opening = doc.lines[0].job_opening
		vacancies.assign_team(
			doc.name,
			opening,
			data["users"]["hr"]["email"],
			[data["users"]["recruiter"]["email"]],
			"Synthetic native Select team",
			uuid.uuid4().hex,
			str(doc.modified),
		)
		doc.reload()
		vacancies.set_state(
			doc.name, opening, "Open", "Synthetic Select intake", uuid.uuid4().hex, str(doc.modified)
		)
		app = frappe.get_doc(
			dict(
				doctype="Job Applicant",
				applicant_name=f"Synthetic select {run_id}",
				email_id=f"select-{run_id}@example.invalid",
				job_title=opening,
			)
		).insert()
	data["application"] = app.name
	persist(browser_fixture.path_for(run_id), data)
	frappe.db.commit()
	return dict(
		run_id=run_id,
		requests={k: v for k, v in data["requests"].items() if k.startswith("board")},
		delegations=data["delegations"],
		credentials="private-file-only",
	)


def language(run_id, actor, language):
	data = load(run_id)
	if data["cleaned"] or actor not in ("ceo", "sector", "vice", "hr") or language not in ("ar", "en"):
		raise RuntimeError("Invalid isolated locale operation")
	user = frappe.get_doc("User", data["users"][actor]["email"])
	user.language = language
	user.save(ignore_permissions=True)
	frappe.db.commit()
	return dict(actor=actor, language=language)


def inspect(run_id):
	data = load(run_id)
	delegations = {}
	requests = {}
	for key, name in data["delegations"].items():
		d = frappe.get_doc("Kandil Delegation", name)
		delegations[key] = {
			f: d.get(f)
			for f in [
				"name",
				"from_user",
				"to_user",
				"approval_status",
				"approved_by",
				"approved_on",
				"decision_reason",
				"decision_key",
				"process_scope",
				"revoked",
				"modified",
			]
		}
	for key, name in data["requests"].items():
		if not key.startswith("board"):
			continue
		d = frappe.get_doc("Kandil Hiring Request", name)
		requests[key] = dict(
			name=name,
			status=d.status,
			modified=str(d.modified),
			steps=[
				{
					f: s.get(f)
					for f in [
						"authority",
						"principal",
						"actor",
						"decision",
						"decided_at",
						"board_vice",
						"board_member",
						"on_behalf_method",
						"on_behalf_note",
						"board_evidence",
					]
				}
				for s in d.approval_steps
			],
			events=frappe.get_all(
				"Kandil Recruitment Event",
				filters={"request": name},
				fields=["name", "action", "actor", "principal", "note", "creation"],
				order_by="creation asc,name asc",
			),
		)
	proofs = {}
	for key, row in data["proofs"].items():
		f = frappe.get_doc("File", row["name"])
		proofs[key] = dict(
			name=f.name,
			is_private=f.is_private,
			attached_to_name=f.attached_to_name,
			sha256=hashlib.sha256(
				f.get_content().encode() if isinstance(f.get_content(), str) else f.get_content()
			).hexdigest(),
		)
	app = frappe.get_doc("Job Applicant", data["application"])
	return dict(
		run_id=run_id,
		application=dict(
			name=app.name,
			owner=app.custom_kandil_responsible_user,
			next_owner=app.custom_kandil_next_action_owner,
			task=app.custom_kandil_next_action,
			due=app.custom_kandil_next_action_due,
			history=json.loads(app.custom_kandil_ownership_history or "[]"),
		),
		delegations=delegations,
		requests=requests,
		proofs=proofs,
		ledger=browser_fixture.inspect(run_id)["ledger"],
	)


def cleanup(run_id):
	data = load(run_id)
	if not data["cleaned"]:
		with acting_as(data["users"]["sector"]["email"]):
			for name in data["delegations"].values():
				d = frappe.get_doc("Kandil Delegation", name)
				if not d.revoked:
					d.revoked = 1
					d.revocation_reason = "Synthetic authority browser fixture cleanup"
					d.save()
		with acting_as(data["users"]["hr"]["email"]):
			app = frappe.get_doc("Job Applicant", data["application"])
			app.status = "Rejected"
			app.save()
	return browser_fixture.cleanup(run_id)


def add_outsider(run_id):
	data = load(run_id)
	if data["cleaned"] or "outsider" in data["users"]:
		raise RuntimeError("Invalid isolated outsider fixture state")
	email = f"browser-{run_id}-outsider@example.invalid"
	password = secrets.token_urlsafe(36)
	insert(
		"User",
		email=email,
		first_name=f"BROWSER-{run_id} outsider",
		enabled=1,
		send_welcome_email=0,
		user_type="System User",
		roles=[dict(role="Kandil Requester")],
	)
	update_password(email, password, logout_all_sessions=True)
	data["users"]["outsider"] = dict(email=email, password=password)
	persist(browser_fixture.path_for(run_id), data)
	frappe.db.commit()
	return dict(created=True, scope_grants=0, credentials="private-file-only")


def add_board_picker(run_id):
	data = load(run_id)
	if data["cleaned"] or "board_picker" in data["requests"]:
		raise RuntimeError("Invalid isolated picker fixture state")
	position = frappe.db.get_value("Kandil Capacity", data["capacity"], "position")
	with acting_as(data["users"]["requester"]["email"]):
		doc = frappe.get_doc(
			dict(
				doctype="Kandil Hiring Request",
				company=data["company"],
				department=data["department"],
				title=f"BROWSER-{run_id} board_picker",
				requested_position=position,
				need_reason="Expansion",
				revision=1,
				requested_priority="Critical",
				qualifications="Synthetic bounded Board picker proof",
				lines=[dict(capacity=data["capacity"], requested_qty=1)],
			)
		).insert()
		api.submit_request(doc.name, uuid.uuid4().hex, str(doc.modified))
	for actor in ("manager", "hr", "ceo"):
		with acting_as(data["users"][actor]["email"]):
			doc.reload()
			step = next(s for s in doc.approval_steps if s.decision == "Pending")
			api.decide(
				doc.name,
				"Approve",
				step.step_key,
				uuid.uuid4().hex,
				str(doc.modified),
				comment="Synthetic picker preceding approval",
			)
	with acting_as(data["users"]["sector"]["email"]):
		file = frappe.get_doc(
			dict(
				doctype="File",
				file_name=f"board-proof-{run_id}-picker.txt",
				is_private=1,
				attached_to_doctype=doc.doctype,
				attached_to_name=doc.name,
				content=f"SYNTHETIC ONLY. Picker proof {run_id}".encode(),
			)
		).insert()
	data["requests"]["board_picker"] = doc.name
	data["proofs"]["board_picker"] = dict(name=file.name, url=file.file_url)
	persist(browser_fixture.path_for(run_id), data)
	frappe.db.commit()
	return dict(request=doc.name, proof=file.name)
