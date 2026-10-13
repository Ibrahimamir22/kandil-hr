"""Opt-in adaptations of standard HRMS documents. No upstream edits or fake emails."""

import re
import uuid

import frappe

from kandil_hr.pilot.models import deny, enabled, identity, internal


def pilot_opening(name, lock=False):
	if not name:
		return None
	opening = frappe.get_doc("Job Opening", name)
	if not opening.get("custom_kandil_request"):
		return None
	parity = frappe.conf.get("kandil_parity_enabled")
	if parity:
		company = frappe.db.get_value("Kandil Hiring Request", opening.custom_kandil_request, "company")
		frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
	request = frappe.get_doc(
		"Kandil Hiring Request", opening.custom_kandil_request, for_update=bool(lock or parity)
	)
	if parity:
		# Re-read after the parent lock: Hold/Freeze use that same lock.
		opening = frappe.get_doc("Job Opening", name, for_update=True)
		from kandil_hr.foundation.teams import effective_lead

		if not effective_lead(opening):
			frappe.throw(frappe._("Assign an active authorized lead before accepting applications."))
		if opening.custom_kandil_vacancy_state not in ("Open", "Partially Filled"):
			frappe.throw(frappe._("Recruitment is paused or has not started for this vacancy."))
	if request.status != "Approved":
		frappe.throw(frappe._("Kandil request must be approved and open."))
	line = next((x for x in request.lines if x.job_opening == name), None)
	if not line or line.joined_qty >= line.approved_qty:
		frappe.throw(frappe._("This location has no unfilled approved vacancy."))
	return opening


class ApplicantMixin:
	def autoname(self):
		from kandil_hr.candidates.identity import enabled as candidate_identity_enabled
		if enabled() and (not self.email_id or candidate_identity_enabled()):
			self.name = "KJA-" + uuid.uuid4().hex[:20]
		else:
			super().autoname()

	def before_insert(self):
		if enabled() and self.job_title:
			pilot_opening(self.job_title, lock=True)
		from kandil_hr.candidates.identity import enabled as candidate_identity_enabled
		if candidate_identity_enabled():
			# Contact duplication is reviewed per person, never a shared-contact ban.
			return
		super().before_insert()

	def validate(self):
		super().validate()
		from kandil_hr.candidates.identity import validate_applicant
		validate_applicant(self)
		if not enabled():
			return
		if not self.email_id and not (self.phone_number or "").strip():
			frappe.throw(frappe._("Provide a phone number or an email address."))
		opening = pilot_opening(self.job_title, lock=True) if self.is_new() else None
		old = self.get_doc_before_save()
		if (
			old
			and old.get("custom_kandil_application_key")
			and any(self.get(k) != old.get(k) for k in ["job_title", "email_id", "phone_number"])
		):
			deny("Pilot application identity is immutable; create a new application for a different opening.")
		if opening:
			phone = re.sub(r"[^0-9+]", "", self.phone_number or "")
			if not self.email_id and len(re.sub(r"\D", "", phone)) < 7:
				frappe.throw(frappe._("Enter a valid contact phone number."))
			contact = (
				("email:" + (self.email_id or "").strip().lower()) if self.email_id else "phone:" + phone
			)
			self.custom_kandil_application_key = identity(
				self.job_title, "application:" + self.name if self.get("custom_kandil_person") else contact
			)
		elif not old and self.get("custom_kandil_application_key"):
			deny("Application identity is server managed.")
		elif old and self.get("custom_kandil_application_key") != old.get("custom_kandil_application_key"):
			deny("Application identity is server managed.")


class OfferMixin:
	def validate_duplicate_job_offer(self):
		if enabled() and not self.applicant_email:
			duplicate = frappe.db.exists(
				"Job Offer",
				{
					"job_applicant": self.job_applicant,
					"docstatus": ["!=", 2],
					"status": ["not in", ["Rejected", "Cancelled"]],
					"name": ["!=", self.name],
				},
			)
			if duplicate:
				frappe.throw(frappe._("An active offer already exists for this applicant."))
		else:
			super().validate_duplicate_job_offer()

	def validate_recorded_outcome(self):
		old = self.get_doc_before_save()
		if (
			frappe.conf.get("kandil_parity_enabled")
			and old
			and old.get("custom_kandil_outcome") in ("Joined", "No Show", "Withdrawn")
			and self.status != old.status
		):
			deny("An offer with a final joining outcome cannot change status.")
		for field in [
			"custom_kandil_outcome",
			"custom_kandil_outcome_reason",
			"custom_kandil_assignment",
			"custom_kandil_joining_voided",
			"custom_kandil_void_reason",
			"custom_kandil_voided_by",
			"custom_kandil_voided_on",
		]:
			if not internal() and (
				self.get(field) or ("Pending" if field == "custom_kandil_outcome" else "")
			) != (
				(old.get(field) if old else None) or ("Pending" if field == "custom_kandil_outcome" else "")
			):
				deny("Use Record Joining Outcome to change the outcome.")

	def before_update_after_submit(self):
		# Frappe skips validate() on submitted-document updates. The parity
		# protected outcome/reference contract must also cover that native path.
		if enabled() and frappe.conf.get("kandil_parity_enabled"):
			self.validate_recorded_outcome()
		parent = getattr(super(), "before_update_after_submit", None)
		if parent:
			parent()

	def validate(self):
		if enabled():
			self.validate_recorded_outcome()
			old = self.get_doc_before_save()
			if self.job_applicant:
				app = frappe.get_doc("Job Applicant", self.job_applicant)
				linked = (
					frappe.db.get_value("Job Opening", app.job_title, "custom_kandil_request")
					if app.job_title
					else None
				)
				if linked:
					if not internal():
						pilot_opening(app.job_title, lock=True)
					if old and old.job_applicant != self.job_applicant:
						deny("Pilot offer applicant cannot be changed.")
		super().validate()


def validate_opening(doc, method=None):
	if not enabled():
		return
	old = doc.get_doc_before_save()
	linked = doc.get("custom_kandil_request") or (old.get("custom_kandil_request") if old else None)
	if linked and not internal():
		deny("Pilot openings are generated and managed by approved recruitment actions.")
	if (
		doc.job_requisition
		and frappe.db.get_value("Job Requisition", doc.job_requisition, "status") != "Open & Approved"
	):
		frappe.throw(frappe._("The requisition must be approved before creating an opening."))


def validate_employee(doc, method=None):
	if not enabled():
		return
	app = doc.job_applicant
	linked = False
	if app:
		opening = frappe.db.get_value("Job Applicant", app, "job_title")
		linked = opening and frappe.db.get_value("Job Opening", opening, "custom_kandil_request")
	if linked and doc.is_new() and not internal():
		deny("Confirm actual joining using the pilot action; direct conversion is blocked.")
	old = doc.get_doc_before_save()
	if (
		old
		and old.get("custom_kandil_offer")
		and not frappe.flags.get("kandil_joining_void")
		and any(
			doc.get(k) != old.get(k)
			for k in [
				"job_applicant",
				"job_offer",
				"company",
				"department",
				"designation",
				"branch",
				"status",
			]
		)
	):
		deny("Pilot joining assignment is immutable; transfers and exits require a separate workflow.")
	for field in ["custom_kandil_offer", "custom_kandil_applicant", "custom_kandil_joining_voided"]:
		if not internal() and (doc.get(field) or "") != ((old.get(field) if old else None) or ""):
			deny("Joining links are server managed.")


def protect_employee_delete(doc, method=None):
	if enabled() and doc.get("custom_kandil_offer"):
		deny("A joined pilot employee cannot be deleted; a separate exit workflow is required.")


def protect_offer_cancel(doc, method=None):
	if enabled() and doc.get("custom_kandil_outcome") == "Joined":
		deny("A joined offer cannot be cancelled; record any later exit separately.")


class OpeningMixin:
	def validate_current_vacancies(self):
		if frappe.conf.get("kandil_parity_enabled") and self.get("custom_kandil_request"):
			# Kandil owns position-based capacity and locks it in its command transaction.
			# Native Staffing Plan counts by designation and is a different authority model.
			if not internal():
				deny("Use the authorized Kandil vacancy actions.")
			if self.staffing_plan or self.job_requisition:
				frappe.throw(
					frappe._("Kandil vacancies cannot also use a native staffing plan or requisition.")
				)
			from kandil_hr.pilot.models import integer

			self.vacancies = integer(self.vacancies)
			return
		return super().validate_current_vacancies()
