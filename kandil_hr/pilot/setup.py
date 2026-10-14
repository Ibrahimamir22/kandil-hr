import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.utils import cstr


def ensure_property_setter(doctype, fieldname, property_name, value, property_type):
    # Preserve an identical existing setter instead of delete/recreate on every
    # migration (which needlessly enqueues dynamic-link cleanup).
    rows = frappe.get_all("Property Setter", filters={"doc_type": doctype, "field_name": fieldname,
        "property": property_name, "doctype_or_field": "DocField"}, fields=["name", "value", "property_type"])
    if len(rows) == 1 and rows[0].value == cstr(value) and rows[0].property_type == property_type:
        return rows[0].name
    return make_property_setter(doctype, fieldname, property_name, value, property_type).name


def install():
	if not frappe.conf.get("kandil_pilot_enabled"):
		return
	for role in ["Kandil Requester", "Kandil Approver", "Kandil Recruiter", "Kandil Sector Approver"]:
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role}).insert()

	def field(name, label, kind="Data", options=None, **kwargs):
		result = {"fieldname": name, "label": label, "fieldtype": kind, "read_only": 1, **kwargs}
		if options:
			result["options"] = options
		return result

	create_custom_fields(
		{
			"Job Opening": [
				field("custom_kandil_request", "Kandil Request", "Link", "Kandil Hiring Request"),
				field("custom_kandil_capacity", "Kandil Capacity", "Link", "Kandil Capacity"),
			],
			"Job Applicant": [
				field("custom_kandil_application_key", "Kandil Application Key", unique=1, hidden=1)
			],
			"Job Offer": [
				field(
					"custom_kandil_outcome",
					"Joining Outcome",
					"Select",
					"Pending\nJoined\nNo Show\nWithdrawn",
					default="Pending",
					allow_on_submit=1,
				),
				field(
					"custom_kandil_outcome_reason", "Joining Outcome Reason", "Small Text", allow_on_submit=1
				),
			],
			"Employee": [
				field("custom_kandil_offer", "Kandil Joining Offer", "Link", "Job Offer", unique=1),
				field(
					"custom_kandil_applicant", "Kandil Joining Applicant", "Link", "Job Applicant", unique=1
				),
			],
		}
	)
	ensure_property_setter("Job Applicant", "email_id", "reqd", 0, "Check")
	# HRMS's fetched offer email also assumes that every candidate has an email.
	ensure_property_setter("Job Offer", "applicant_email", "reqd", 0, "Check")
	from kandil_hr.recruitment.setup import install as install_recruitment

	install_recruitment()
	from kandil_hr.candidates.stages import install as install_screening
	install_screening()
	from kandil_hr.foundation.files import purge_protected_shares

	purge_protected_shares()
	frappe.clear_cache()
