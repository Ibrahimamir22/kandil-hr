app_name = "kandil_hr"
app_title = "Kandil HR"
app_publisher = "Kandil"
app_description = "Internal Kandil HR workflows and integrations"
app_email = "development@example.invalid"
app_license = "custom"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "kandil_hr",
# 		"logo": "/assets/kandil_hr/logo.png",
# 		"title": "Kandil HR",
# 		"route": "/kandil_hr",
# 		"has_permission": "kandil_hr.api.permission.has_app_permission",
# 	}
# ]

# The dock, the rail down the left of the desk, is a document rather than a hook. Author it in
# Manage Dock on a developer-mode site and press Export to App, and it is written to
# `kandil_hr/dock/kandil_hr/kandil_hr.json` for git to carry. An app that ships none has no
# rail: its sidebar gets a switcher in the header instead.
#
# A companion app, one that extends a host app rather than standing on its own, says so with
# `mount_on` on that same record, and its entries are appended to the host's rail. Mounting keeps
# the companion off the apps screen, so it takes precedence over any add_to_apps_screen above.

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/kandil_hr/css/kandil_hr.css"
# app_include_js = "/assets/kandil_hr/js/kandil_hr.js"

# include js, css files in header of web template
# web_include_css = "/assets/kandil_hr/css/kandil_hr.css"
# web_include_js = "/assets/kandil_hr/js/kandil_hr.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "kandil_hr/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_kanban_js = {"doctype" : "public/js/doctype_kanban.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "kandil_hr/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "kandil_hr.utils.jinja_methods",
# 	"filters": "kandil_hr.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "kandil_hr.install.before_install"
# after_install = "kandil_hr.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "kandil_hr.uninstall.before_uninstall"
# after_uninstall = "kandil_hr.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "kandil_hr.utils.before_app_install"
# after_app_install = "kandil_hr.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "kandil_hr.utils.before_app_uninstall"
# after_app_uninstall = "kandil_hr.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "kandil_hr.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "kandil_hr.notifications.get_notification_config"

# Awesome Bar
# -----------
# Extra search results: list of dicts with label, description, route, index.
# route: ["List", "ToDo"], "/desk/docs/some/page", or "https://example.com"
# awesomebar_search = ["kandil_hr.search.awesomebar_results"]

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"kandil_hr.tasks.all"
# 	],
# 	"daily": [
# 		"kandil_hr.tasks.daily"
# 	],
# 	"hourly": [
# 		"kandil_hr.tasks.hourly"
# 	],
# 	"weekly": [
# 		"kandil_hr.tasks.weekly"
# 	],
# 	"monthly": [
# 		"kandil_hr.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "kandil_hr.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "kandil_hr.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "kandil_hr.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "kandil_hr.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["kandil_hr.utils.before_request"]
# after_request = ["kandil_hr.utils.after_request"]

# Job Events
# ----------
# before_job = ["kandil_hr.utils.before_job"]
# after_job = ["kandil_hr.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"kandil_hr.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []


# Standard HRMS remains the HR foundation.
required_apps = ["hrms"]

# Local recruitment pilot; runtime guards keep other sites unchanged until explicitly enabled.
after_migrate = "kandil_hr.pilot.setup.install"
extend_doctype_class = {
	"Job Applicant": ["kandil_hr.pilot.extensions.ApplicantMixin"],
	"Job Offer": ["kandil_hr.pilot.extensions.OfferMixin"],
}
doc_events = {
	"Job Opening": {"validate": "kandil_hr.pilot.extensions.validate_opening"},
	"Employee": {
		"validate": "kandil_hr.pilot.extensions.validate_employee",
		"on_trash": "kandil_hr.pilot.extensions.protect_employee_delete",
	},
	"Job Offer": {"before_cancel": "kandil_hr.pilot.extensions.protect_offer_cancel"},
}
has_permission = {
	"Kandil Hiring Request": "kandil_hr.pilot.permissions.request_permission",
	"Kandil Recruitment Event": "kandil_hr.pilot.permissions.event_permission",
}
permission_query_conditions = {
	"Kandil Hiring Request": "kandil_hr.pilot.permissions.request_query",
	"Kandil Recruitment Event": "kandil_hr.pilot.permissions.event_query",
}
doctype_js = {"Job Offer": "public/js/job_offer.js"}
doctype_list_js = {"Kandil Hiring Request": "public/js/hiring_request_list.js"}
add_to_apps_screen = [
	{
		"name": "kandil_hr",
		"logo": "/assets/kandil_hr/kandil.svg",
		"title": "Kandil workspace",
		"route": "/kandil",
		"has_permission": "kandil_hr.pilot.navigation.has_app_permission",
	}
]

# Explicitly opted-in parity-site foundation. Every handler returns without changes
# on the preserved main and review sites when kandil_foundation_enabled is false.
_foundation = "kandil_hr.foundation."
for _doctype, _query in {
	"Kandil Capacity": "capacity",
	"Kandil Recruitment Route": "route",
	"Kandil Delegation": "delegation",
}.items():
	has_permission[_doctype] = _foundation + "security.scoped_permission"
	permission_query_conditions[_doctype] = _foundation + "queries." + _query
	_events = doc_events.setdefault(_doctype, {})
	_existing = _events.get("validate")
	_events["validate"] = ([_existing] if isinstance(_existing, str) else list(_existing or [])) + [
		_foundation + "security.validate_scoped_document"
	]

for _doctype, _query in {
	"Job Opening": "job_opening",
	"Job Applicant": "job_applicant",
	"Job Offer": "job_offer",
	"Interview": "interview",
	"Interview Feedback": "interview_feedback",
	"Employee": "employee",
}.items():
	has_permission[_doctype] = _foundation + "security.hr_permission"
	permission_query_conditions[_doctype] = _foundation + "queries." + _query
	_events = doc_events.setdefault(_doctype, {})
	_existing = _events.get("validate")
	_events["validate"] = ([_existing] if isinstance(_existing, str) else list(_existing or [])) + [
		_foundation + "security.validate_hr_document"
	]

doc_events.setdefault("User", {}).update(
	{
		"validate": _foundation + "security.validate_user_security",
		"on_update": [
			_foundation + "security.user_security_audit",
			_foundation + "account_sessions.revoke_disabled_sessions",
		],
	}
)
doc_events.setdefault("File", {})["validate"] = _foundation + "security.validate_private_file"
doc_events["File"]["before_validate"] = _foundation + "board_files.before_validate"
doc_events["File"]["before_rename"] = _foundation + "board_files.protect_recorded"
has_permission["File"] = _foundation + "security.file_permission"
extend_doctype_class["Notification Log"] = [_foundation + "outbox.LocalNotificationMixin"]
scheduler_events = {"all": [_foundation + "outbox.process_pending"]}

# Revision snapshots inherit the complete request scope; they are never independently writable.
has_permission["Kandil Request Revision"] = "kandil_hr.recruitment.models.revision_permission"
permission_query_conditions["Kandil Request Revision"] = "kandil_hr.recruitment.models.revision_query"

# Native organization records share the same scope restrictions as commands.
for _dt, _query in {
	"Kandil Organization Settings": "settings",
	"Kandil Position": "position",
	"Kandil Position Hierarchy": "hierarchy",
	"Kandil Position Assignment": "assignment",
	"Kandil Grade Band": "grade",
	"Kandil JD Revision": "jd",
	"Kandil Structure Change": "change",
	"Kandil Structure Snapshot": "snapshot",
	"Kandil Organization Import": "import_batch",
	"Kandil Organization Code": "code",
}.items():
	has_permission[_dt] = "kandil_hr.organization.permissions.permission"
	permission_query_conditions[_dt] = "kandil_hr.organization.permissions." + _query
permission_query_conditions["File"] = "kandil_hr.foundation.security.file_query"
has_permission["Employee Onboarding"] = "kandil_hr.foundation.security.hr_permission"
permission_query_conditions["Employee Onboarding"] = "kandil_hr.foundation.queries.employee_onboarding"
doc_events.setdefault("Employee Onboarding", {})["validate"] = (
	"kandil_hr.foundation.security.validate_hr_document"
)

doc_events.setdefault("User", {}).update(
	{
		"before_rename": "kandil_hr.foundation.security.validate_user_rename",
		"after_rename": "kandil_hr.foundation.security.audit_user_rename",
	}
)

doctype_js["Job Opening"] = "public/js/job_opening.js"
doctype_js["Job Applicant"] = "public/js/job_applicant.js"

has_permission["Kandil Authority Rule"] = "kandil_hr.foundation.security.scoped_permission"
permission_query_conditions["Kandil Authority Rule"] = "kandil_hr.recruitment.models.authority_query"
doc_events.setdefault("Kandil Authority Rule", {})["validate"] = (
	"kandil_hr.foundation.security.validate_scoped_document"
)
extend_doctype_class["Job Opening"] = ["kandil_hr.pilot.extensions.OpeningMixin"]

scheduler_events["daily"] = ["kandil_hr.recruitment.sla.process_pending"]

extend_doctype_class["File"] = ["kandil_hr.foundation.files.FileMixin"]
doc_events.setdefault("DocShare", {})["validate"] = "kandil_hr.foundation.files.validate_share"
override_whitelisted_methods = {"frappe.core.api.file.zip_files": "kandil_hr.foundation.files.zip_files"}

extend_doctype_class["Report"] = ["kandil_hr.foundation.reports.ReportMixin"]
extend_doctype_class["Prepared Report"] = ["kandil_hr.foundation.reports.PreparedReportMixin"]
has_permission["Prepared Report"] = "kandil_hr.foundation.reports.prepared_permission"
permission_query_conditions["Prepared Report"] = "kandil_hr.foundation.reports.prepared_query"

# Separate confidential notes never inherit requester access or shared snapshots.
has_permission["Kandil HR Note"] = "kandil_hr.recruitment.privacy.note_permission"
permission_query_conditions["Kandil HR Note"] = "kandil_hr.recruitment.privacy.note_query"

# Preserve literal import identities when native masters are renamed/deleted.
for _dt in ("Department", "Designation"):
	for _event in ("on_trash", "before_rename"):
		_events = doc_events.setdefault(_dt, {})
		_old = _events.get(_event)
		_events[_event] = ([_old] if isinstance(_old, str) else list(_old or [])) + [
			"kandil_hr.organization.codes.protect_target"
		]

_events = doc_events.setdefault("Department", {})
_old = _events.get("validate")
_events["validate"] = ([_old] if isinstance(_old, str) else list(_old or [])) + [
	"kandil_hr.organization.codes.protect_target_scope"
]

doc_events["Employee Onboarding"]["validate"] = [
	"kandil_hr.foundation.security.validate_hr_document",
	"kandil_hr.recruitment.joining_corrections.validate_onboarding",
]
doc_events["Employee Onboarding"]["before_update_after_submit"] = (
	"kandil_hr.recruitment.joining_corrections.validate_onboarding"
)
doc_events["Employee Onboarding"]["on_trash"] = (
	"kandil_hr.recruitment.joining_corrections.protect_onboarding_delete"
)
doc_events["Payroll Entry"] = {
	"validate": "kandil_hr.recruitment.joining_corrections.validate_payroll_entry",
	"before_update_after_submit": "kandil_hr.recruitment.joining_corrections.validate_payroll_entry",
}
from kandil_hr.recruitment.employee_links import EMPLOYEE_LINKS as _employee_links

for _dt in _employee_links:
	for _event in ("validate", "before_update_after_submit"):
		_events = doc_events.setdefault(_dt, {})
		_old = _events.get(_event)
		_events[_event] = ([_old] if isinstance(_old, str) else list(_old or [])) + [
			"kandil_hr.recruitment.joining_corrections.validate_employee_use"
		]

# Native organization units require company authority and record the change reason.
for _event in ("validate", "before_save", "on_update"):
	_events = doc_events.setdefault("Department", {})
	_old = _events.get(_event)
	_events[_event] = ([_old] if isinstance(_old, str) else list(_old or [])) + [
		"kandil_hr.organization.units." + _event
	]
has_permission["Department"] = "kandil_hr.organization.units.permission"
permission_query_conditions["Department"] = "kandil_hr.organization.units.query"

# Application ownership is distinct from generic native task allocation.
doc_events["Job Applicant"]["validate"].append("kandil_hr.recruitment.ownership.validate_applicant")
doc_events["User"]["on_update"].append("kandil_hr.recruitment.ownership.schedule_disabled_handoff")
scheduler_events.setdefault("hourly", []).append("kandil_hr.recruitment.ownership.process_disabled_handoffs")

# Restricted exact-command evidence has no ordinary business-role read surface.
has_permission["Kandil Command Audit"] = "kandil_hr.foundation.command_audit.permission"
permission_query_conditions["Kandil Command Audit"] = "kandil_hr.foundation.command_audit.query"
has_permission["Kandil Mail Capture"] = "kandil_hr.foundation.mail_capture.permission"
permission_query_conditions["Kandil Mail Capture"] = "kandil_hr.foundation.mail_capture.query"
has_permission["Kandil Document Delivery"] = "kandil_hr.organization.document_delivery.permission"
permission_query_conditions["Kandil Document Delivery"] = "kandil_hr.organization.document_delivery.query"

doctype_js["Kandil JD Revision"] = "public/js/document_delivery.js"
doctype_js["Kandil Document Delivery"] = "public/js/document_delivery.js"

# A derived private lookup is never a replacement for source authorization.
has_permission["Kandil Position Audit Link"] = "kandil_hr.foundation.command_audit.permission"
permission_query_conditions["Kandil Position Audit Link"] = "kandil_hr.foundation.command_audit.query"

# Current linked-record authorization for delivered HR notifications, including
# native Desk/resource reads; preserved sites retain upstream behavior.
has_permission['Notification Log'] = 'kandil_hr.foundation.notification_access.native_permission'
permission_query_conditions['Notification Log'] = 'kandil_hr.foundation.notification_access.native_condition'
override_whitelisted_methods['frappe.desk.doctype.notification_log.notification_log.get_notification_logs'] = 'kandil_hr.foundation.notification_access.get_notification_logs'

# Event-triggered invitations also recover missed jobs and newly effective grants.
scheduler_events["all"].append("kandil_hr.recruitment.invitations.process_pending")
