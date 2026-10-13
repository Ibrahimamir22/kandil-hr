import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def install():
	if not frappe.conf.get("kandil_parity_enabled"):
		return
	for role in ["Kandil CEO Approver", "Kandil Board Approver"]:
		if not frappe.db.exists("Role", role):
			frappe.get_doc(dict(doctype="Role", role_name=role)).insert()
	# Native permissions remain required in addition to scope hooks.
	from frappe.permissions import add_permission, update_permission_property

	for dt in ["Kandil Hiring Request", "Kandil Request Revision", "Kandil Recruitment Event"]:
		for role in ["Kandil CEO Approver", "Kandil Board Approver"]:
			add_permission(dt, role)
			for key in ["read", "select", "print"]:
				update_permission_property(dt, role, 0, key, 1)
	# Native permissions and company/location hooks are both required. No HR Manager bypass.
	native = {
		"Job Opening": ["read", "select", "report", "print"],
		"Job Applicant": ["read", "select", "create", "write", "report", "print"],
		"Job Offer": ["read", "select", "create", "write", "submit", "report", "print"],
		"Interview": ["read", "select", "create", "write", "submit", "report", "print"],
		"Interview Feedback": ["read", "select", "create", "write", "submit"],
		"Employee": ["read", "select"],
		"Employee Onboarding": ["read", "select"],
	}
	for dt, permissions in native.items():
		add_permission(dt, "Kandil Recruiter")
		for permission in permissions:
			update_permission_property(dt, "Kandil Recruiter", 0, permission, 1)
	create_custom_fields(
		{
			"Job Offer": [
				dict(
					fieldname="custom_kandil_assignment",
					label="Joining Position Assignment",
					fieldtype="Link",
					options="Kandil Position Assignment",
					read_only=1,
					no_copy=1,
					allow_on_submit=1,
				)
			],
			"Job Opening": [
				dict(
					fieldname="custom_kandil_vacancy_state",
					label="Kandil Vacancy State",
					fieldtype="Select",
					options="Approved\nOpen\nPartially Filled\nFilled\nOn Hold\nFrozen\nClosed\nCancelled",
					default="Approved",
					read_only=1,
				),
				dict(
					fieldname="custom_kandil_started_on",
					label="Recruitment Started On",
					fieldtype="Date",
					read_only=1,
				),
				dict(
					fieldname="custom_kandil_before_pause",
					label="State Before Hold",
					fieldtype="Data",
					read_only=1,
				),
				dict(
					fieldname="custom_kandil_before_freeze",
					label="State Before Freeze",
					fieldtype="Data",
					read_only=1,
				),
				dict(
					fieldname="custom_kandil_pin_until",
					label="Priority Pin Until",
					fieldtype="Date",
					read_only=1,
				),
				dict(
					fieldname="custom_kandil_pin_reason",
					label="Priority Pin Reason",
					fieldtype="Small Text",
					read_only=1,
				),
				dict(
					fieldname="custom_kandil_lead",
					label="Lead Recruiter",
					fieldtype="Link",
					options="User",
					read_only=1,
				),
				dict(
					fieldname="custom_kandil_team",
					label="Recruiter Team",
					fieldtype="Table",
					options="Kandil Recruiter Member",
					read_only=1,
				),
				dict(
					fieldname="custom_kandil_priority_pin", label="Priority Pin", fieldtype="Int", read_only=1
				),
				dict(
					fieldname="custom_kandil_priority_score",
					label="Priority Score",
					fieldtype="Int",
					read_only=1,
				),
			],
		}
	)
	from kandil_hr.recruitment.joining_corrections import install_fields

	install_fields()

	from kandil_hr.organization.units import install as install_units

	install_units()

	from kandil_hr.portal.reference_permissions import install as install_reference_selection

	install_reference_selection()

	from kandil_hr.recruitment.ownership import install_ownership_fields

	install_ownership_fields()

	from kandil_hr.recruitment.authority import install as install_authority

	install_authority()

	from kandil_hr.foundation.approver_capacity_access import execute as install_capacity_access

	install_capacity_access()
