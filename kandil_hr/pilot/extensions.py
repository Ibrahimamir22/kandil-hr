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
	request = frappe.get_doc("Kandil Hiring Request", opening.custom_kandil_request, for_update=lock)
	if request.status != "Approved":
		frappe.throw("Kandil request must be approved and open.")
	line = next((x for x in request.lines if x.job_opening == name), None)
	if not line or line.joined_qty >= line.approved_qty:
		frappe.throw("This location has no unfilled approved vacancy.")
	return opening


class ApplicantMixin:
	def autoname(self):
		if enabled() and not self.email_id:
			self.name = "KJA-" + uuid.uuid4().hex[:20]
		else:
			super().autoname()

	def before_insert(self):
		if enabled() and self.job_title:
			pilot_opening(self.job_title, lock=True)
		super().before_insert()

	def validate(self):
		super().validate()
		if not enabled():
			return
		if not self.email_id and not (self.phone_number or "").strip():
			frappe.throw("Provide a phone number or an email address.")
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
				frappe.throw("Enter a valid contact phone number.")
			contact = (
				("email:" + (self.email_id or "").strip().lower()) if self.email_id else "phone:" + phone
			)
			self.custom_kandil_application_key = identity(self.job_title, contact)
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
				frappe.throw("An active offer already exists for this applicant.")
		else:
			super().validate_duplicate_job_offer()

	def validate(self):
		if enabled():
			old = self.get_doc_before_save()
			for field in ["custom_kandil_outcome", "custom_kandil_outcome_reason"]:
				if not internal() and (
					self.get(field) or ("Pending" if field == "custom_kandil_outcome" else "")
				) != (
					(old.get(field) if old else None)
					or ("Pending" if field == "custom_kandil_outcome" else "")
				):
					deny("Use Record Joining Outcome to change the outcome.")
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
		frappe.throw("The requisition must be approved before creating an opening.")


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
	for field in ["custom_kandil_offer", "custom_kandil_applicant"]:
		if not internal() and (doc.get(field) or "") != ((old.get(field) if old else None) or ""):
			deny("Joining links are server managed.")


def protect_employee_delete(doc, method=None):
	if enabled() and doc.get("custom_kandil_offer"):
		deny("A joined pilot employee cannot be deleted; a separate exit workflow is required.")


def protect_offer_cancel(doc, method=None):
	if enabled() and doc.get("custom_kandil_outcome") == "Joined":
		deny("A joined offer cannot be cancelled; record any later exit separately.")
