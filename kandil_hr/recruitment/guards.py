"""Shared transition preconditions; never independently callable over HTTP."""

import frappe
from frappe import _


def has_unresolved_candidates(opening_name):
	for applicant in frappe.get_all(
		"Job Applicant", filters={"job_title": opening_name, "status": ["not in", ["Rejected"]]}, pluck="name"
	):
		outcomes = frappe.get_all(
			"Job Offer",
			filters={"job_applicant": applicant, "docstatus": ["<", 2]},
			pluck="custom_kandil_outcome",
		)
		if not outcomes or any(x not in ("Joined", "No Show", "Withdrawn") for x in outcomes):
			return True
	return False


def resolved_candidates(opening_name):
	if has_unresolved_candidates(opening_name):
		frappe.throw(_("Resolve candidate dispositions before closing this vacancy."))
