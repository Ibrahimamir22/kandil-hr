"""CLI-only, private UUID fixture for HTTP joining replay proof.

The historical episode seed is deliberately test-only. It represents yesterday's
closed assignment without relaxing the native prohibition on backdated edits.
Synthetic history/audits remain; cleanup releases commitments and disables users.
"""

import hashlib
import json
import uuid

import frappe
from frappe.utils import add_days, cint

from kandil_hr.foundation.clock import today_cairo
from kandil_hr.organization import occupancy
from kandil_hr.organization.models import lock_company
from kandil_hr.pilot.api import record_outcome
from kandil_hr.recruitment import browser_fixture as base
from kandil_hr.recruitment import vacancies
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as


def guard(run_id):
	base.guard(run_id)
	if not cint(frappe.conf.get("mute_emails")):
		raise RuntimeError("Joining concurrency requires muted email")


def load(run_id):
	guard(run_id)
	data = json.loads(base.path_for(run_id).read_text())
	if data["run_id"] != run_id or data["company"] != "Kandil BROWSER TEST " + run_id:
		raise RuntimeError("Joining fixture identity mismatch")
	return data


def prepare(run_id):
	guard(run_id)
	base.prepare(run_id)
	data = load(run_id)
	name = data["requests"]["correction"]
	with acting_as(data["users"]["hr"]["email"]):
		doc = frappe.get_doc("Kandil Hiring Request", name)
		opening = doc.lines[0].job_opening
		for method, values in (
			(vacancies.assign_team, dict(lead=frappe.session.user, members=[])),
			(vacancies.set_state, dict(action="Open")),
		):
			method(
				name,
				opening_name=opening,
				reason="Synthetic joining concurrency preparation",
				command_id=uuid.uuid4().hex,
				expected_version=str(frappe.get_doc(doc.doctype, name).modified),
				**values,
			)
		applicant = frappe.get_doc(
			dict(
				doctype="Job Applicant",
				applicant_name="Synthetic concurrent joining " + run_id,
				email_id=run_id + "@example.invalid",
				job_title=opening,
			)
		).insert()
		offer = frappe.get_doc(
			dict(
				doctype="Job Offer",
				job_applicant=applicant.name,
				offer_date=today_cairo(),
				designation=frappe.db.get_value("Job Opening", opening, "designation"),
				company=data["company"],
				status="Accepted",
			)
		).insert()
		offer.submit()
	data["joining"] = dict(
		request=name,
		opening=opening,
		offer=offer.name,
		payload=dict(
			offer_name=offer.name,
			outcome="Joined",
			reason="Synthetic concurrent joining proof",
			joining_date=str(add_days(today_cairo(), -3)),
			date_of_birth="1995-01-01",
			gender="Male",
		),
	)
	persist(base.path_for(run_id), data)
	frappe.db.commit()
	return dict(prepared=True, credentials="private-file-only")


def inspect(run_id):
	data = load(run_id)
	joining = data["joining"]
	doc = frappe.get_doc("Kandil Hiring Request", joining["request"])
	cap = frappe.get_doc("Kandil Capacity", data["capacity"])
	offer = frappe.get_doc("Job Offer", joining["offer"])
	if doc.company != data["company"] or cap.company != data["company"] or offer.company != data["company"]:
		raise RuntimeError("Joining fixture cross-company mismatch")
	employees = frappe.get_all("Employee", filters={"custom_kandil_offer": offer.name}, pluck="name")
	counts = {
		"Employee": len(employees),
		"Kandil Position Assignment": frappe.db.count(
			"Kandil Position Assignment", {"employee": ["in", employees]}
		)
		if employees
		else 0,
		"Employee Onboarding": frappe.db.count("Employee Onboarding", {"job_offer": offer.name}),
	}
	for dt, field in (
		("Kandil Request Revision", "request"),
		("Kandil Recruitment Event", "request"),
		("Kandil Command Receipt", "request"),
		("Kandil Notification Outbox", "reference_name"),
	):
		counts[dt] = frappe.db.count(dt, {field: doc.name})
	audits = frappe.get_all(
		"Kandil Command Audit",
		filters={"target_name": doc.name, "operation": "record_outcome"},
		fields=["envelope_json"],
	)
	matching = [
		json.loads(row.envelope_json)
		for row in audits
		if json.loads(row.envelope_json)["payload"]["offer_name"] == offer.name
	]
	counts["Kandil Command Audit"] = len(matching)
	line = next(row for row in doc.lines if row.job_opening == joining["opening"])

	def canonical(value):
		return hashlib.sha256(frappe.as_json(value).encode()).hexdigest()

	return dict(
		counts=counts,
		ledger={
			field: cap.get(field)
			for field in (
				"structural",
				"occupied",
				"reserved",
				"open_slots",
				"available",
				"occupancy_as_of",
				"occupancy_basis",
			)
		},
		capacity_hash=canonical(cap.as_dict()),
		request_hash=canonical(doc.as_dict()),
		offer_hash=canonical(offer.as_dict()),
		audit_hash=canonical(matching),
		line={
			field: line.get(field) for field in ("approved_qty", "joined_qty", "closed_qty", "reserved_qty")
		},
		outcome=offer.custom_kandil_outcome,
	)


def seed_ended_episode(run_id):
	"""Exact synthetic history only; never callable over HTTP or on a real site."""
	data = load(run_id)
	joining = data["joining"]
	lock_company(data["company"])
	cap = frappe.get_doc("Kandil Capacity", data["capacity"], for_update=True)
	offer = frappe.get_doc("Job Offer", joining["offer"], for_update=True)
	if offer.company != data["company"] or offer.custom_kandil_outcome != "Joined":
		raise RuntimeError("Only this completed synthetic joining may be seeded")
	assignment = frappe.get_doc("Kandil Position Assignment", offer.custom_kandil_assignment, for_update=True)
	if assignment.company != data["company"] or assignment.position != cap.position:
		raise RuntimeError("Synthetic joining assignment mismatch")
	if not data.get("historical_seed"):
		assignment.valid_until = today_cairo()
		assignment.save(ignore_permissions=True)
		# This direct test fixture seed is not a product/backdating endpoint.
		frappe.db.set_value(assignment.doctype, assignment.name, "valid_until", add_days(today_cairo(), -1))
		frappe.db.set_value(
			cap.doctype, cap.name, "occupancy_as_of", add_days(today_cairo(), -1), update_modified=False
		)
		data["historical_seed"] = (
			"CLI-only synthetic ended episode; ordinary native backdating remains forbidden"
		)
		persist(base.path_for(run_id), data)
	prospective = occupancy.values(frappe.get_doc(cap.doctype, cap.name, for_update=True))
	if prospective["occupied"] != 0 or cint(cap.occupied) != 1:
		raise RuntimeError(
			"Fixture did not produce a meaningful recorded-versus-current occupancy difference"
		)
	frappe.db.commit()
	return dict(recorded_occupied=1, current_assignment_occupied=0, fixture_seed=data["historical_seed"])


def cleanup(run_id):
	data = load(run_id)
	if not data.get("cleaned") and data.get("joining"):
		offer = frappe.get_doc("Job Offer", data["joining"]["offer"])
		if offer.company != data["company"]:
			raise RuntimeError("Cleanup offer scope mismatch")
		if offer.custom_kandil_outcome == "Joined" and not data.get("historical_seed"):
			seed_ended_episode(run_id)
		elif offer.custom_kandil_outcome == "Pending":
			with acting_as(data["users"]["hr"]["email"]):
				record_outcome(offer.name, "Withdrawn", reason="Synthetic interrupted proof cleanup")
		# base.cleanup cancels only our own requests; its command refreshes ended
		# occupancy and releases remaining open seats, while retaining join facts.
	result = base.cleanup(run_id)
	data = load(run_id)
	for account in data["users"].values():
		account.pop("password", None)
	persist(base.path_for(run_id), data)
	return result
