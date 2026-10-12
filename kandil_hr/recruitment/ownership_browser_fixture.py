"""Isolated UUID native ownership/joining-correction browser fixtures, CLI only."""

import hashlib
import json
import secrets
import uuid

import frappe
from frappe.utils import today
from frappe.utils.password import update_password

from kandil_hr.pilot.api import record_outcome
from kandil_hr.recruitment import browser_fixture, joining_corrections, vacancies
from kandil_hr.recruitment.concurrency_fixture import insert, persist
from kandil_hr.recruitment.test_commands import acting_as


def load(run_id):
	browser_fixture.guard(run_id)
	data = json.loads(browser_fixture.path_for(run_id).read_text())
	if data["company"] != "Kandil BROWSER TEST " + run_id:
		raise RuntimeError("Ownership browser fixture company mismatch")
	return data


def prepare(run_id):
	browser_fixture.guard(run_id)
	browser_fixture.prepare(run_id)
	data = load(run_id)
	email = f"browser-{run_id}-recruiter@example.invalid"
	password = secrets.token_urlsafe(36)
	insert(
		"User",
		email=email,
		first_name=f"BROWSER-{run_id} recruiter",
		enabled=1,
		send_welcome_email=0,
		user_type="System User",
		language="en",
		roles=[{"role": "Kandil Recruiter"}],
	)
	update_password(email, password, logout_all_sessions=True)
	data["users"]["recruiter"] = dict(email=email, password=password)
	insert(
		"Kandil Access Grant",
		user=email,
		company=data["company"],
		department=data["department"],
		valid_from=today(),
		can_manage_recruitment=1,
		can_view_sensitive=1,
		reason="Synthetic ownership browser team",
	)
	data["offers"] = {}
	with acting_as(data["users"]["hr"]["email"]):
		request = frappe.get_doc("Kandil Hiring Request", data["requests"]["correction"])
		opening = request.lines[0].job_opening
		vacancies.assign_team(
			request.name,
			opening,
			data["users"]["hr"]["email"],
			[email],
			"Synthetic browser recruiter team",
			uuid.uuid4().hex,
			str(request.modified),
		)
		request.reload()
		vacancies.set_state(
			request.name, opening, "Open", "Synthetic browser intake", uuid.uuid4().hex, str(request.modified)
		)
		app = frappe.get_doc(
			dict(
				doctype="Job Applicant",
				applicant_name=f"Synthetic ownership {run_id}",
				email_id=f"ownership-{run_id}@example.invalid",
				job_title=opening,
			)
		).insert()
		data["application"] = app.name
		for label in ("en", "ar", "http"):
			applicant = frappe.get_doc(
				dict(
					doctype="Job Applicant",
					applicant_name=f"Synthetic joining {label} {run_id}",
					email_id=f"joining-{label}-{run_id}@example.invalid",
					job_title=opening,
				)
			).insert()
			offer = frappe.get_doc(
				dict(
					doctype="Job Offer",
					job_applicant=applicant.name,
					offer_date=today(),
					designation=frappe.db.get_value("Kandil Capacity", data["capacity"], "designation"),
					company=data["company"],
					status="Accepted",
				)
			).insert()
			offer.submit()
			joined = record_outcome(
				offer.name, "Joined", joining_date=today(), date_of_birth="1995-01-01", gender="Male"
			)
			data["offers"][label] = dict(offer=offer.name, application=applicant.name, **joined)
	data["opening"] = opening
	persist(browser_fixture.path_for(run_id), data)
	frappe.db.commit()
	return dict(
		run_id=run_id,
		application=data["application"],
		offers={k: v["offer"] for k, v in data["offers"].items()},
		credentials="private-file-only",
	)


def language(run_id, language):
	data = load(run_id)
	if language not in ("ar", "en") or data["cleaned"]:
		raise RuntimeError("Invalid fixture locale change")
	user = frappe.get_doc("User", data["users"]["hr"]["email"])
	user.language = language
	user.save(ignore_permissions=True)
	frappe.db.commit()
	return dict(language=language)


def inspect(run_id):
	data = load(run_id)
	request = frappe.get_doc("Kandil Hiring Request", data["requests"]["correction"])
	cap = frappe.get_doc("Kandil Capacity", data["capacity"])
	app = frappe.get_doc("Job Applicant", data["application"])
	offers = {}
	for label, row in data["offers"].items():
		offer = frappe.get_doc("Job Offer", row["offer"])
		assignment = frappe.get_doc("Kandil Position Assignment", row["assignment"])
		employee = frappe.get_doc("Employee", row["employee"])
		onboarding = frappe.get_doc("Employee Onboarding", row["onboarding"])
		offers[label] = dict(
			name=offer.name,
			outcome=offer.custom_kandil_outcome,
			voided=offer.custom_kandil_joining_voided,
			reason=offer.custom_kandil_void_reason,
			actor=offer.custom_kandil_voided_by,
			at=offer.custom_kandil_voided_on,
			assignment=dict(
				name=assignment.name,
				employee=assignment.employee,
				allocation=assignment.allocation,
				valid_from=assignment.valid_from,
				valid_until=assignment.valid_until,
				is_voided=assignment.is_voided,
			),
			employee=dict(
				name=employee.name, status=employee.status, voided=employee.custom_kandil_joining_voided
			),
			onboarding=dict(
				name=onboarding.name,
				docstatus=onboarding.docstatus,
				voided=onboarding.custom_kandil_joining_voided,
			),
		)
	events = frappe.get_all(
		"Kandil Recruitment Event",
		filters={"request": request.name},
		fields=["name", "action", "actor", "principal", "creation", "note", "snapshot"],
		order_by="creation asc,name asc",
	)
	return dict(
		run_id=run_id,
		request=dict(
			name=request.name,
			status=request.status,
			modified=str(request.modified),
			joined=request.lines[0].joined_qty,
			approved=request.lines[0].approved_qty,
		),
		ledger={
			key: cap.get(key) for key in ("structural", "occupied", "reserved", "open_slots", "available")
		},
		vacancy=frappe.db.get_value("Job Opening", data["opening"], "custom_kandil_vacancy_state"),
		application=dict(
			name=app.name,
			modified=str(app.modified),
			status=app.status,
			owner=app.custom_kandil_responsible_user,
			next_owner=app.custom_kandil_next_action_owner,
			task=app.custom_kandil_next_action,
			due=app.custom_kandil_next_action_due,
			history=json.loads(app.custom_kandil_ownership_history or "[]"),
		),
		offers=offers,
		events=events,
		counts={
			dt: frappe.db.count(dt, {"request": request.name})
			for dt in ("Kandil Command Receipt", "Kandil Request Revision", "Kandil Recruitment Event")
		},
		history_sha256=hashlib.sha256(json.dumps(events, sort_keys=True, default=str).encode()).hexdigest(),
	)


def cleanup(run_id):
	data = load(run_id)
	if not data["cleaned"]:
		with acting_as(data["users"]["hr"]["email"]):
			for row in data["offers"].values():
				if not frappe.db.get_value("Job Offer", row["offer"], "custom_kandil_joining_voided"):
					req = frappe.get_doc("Kandil Hiring Request", data["requests"]["correction"])
					joining_corrections.void_joining(
						req.name,
						row["offer"],
						uuid.uuid4().hex,
						str(req.modified),
						"Synthetic browser cleanup of unused joining fixture",
					)
			app = frappe.get_doc("Job Applicant", data["application"])
			app.status = "Rejected"
			app.save()
	return browser_fixture.cleanup(run_id)
