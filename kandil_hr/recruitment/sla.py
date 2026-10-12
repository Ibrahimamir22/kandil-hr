"""PD-05 / CHG-84 approval waiting notifications, LOCAL delivery only.

Synthetic/default deployment decisions, not HR-approved policy:
* Working day 2: frozen active approver; day 3: current company HR + sector
  contacts; day 4: approver + requester; day 5: all those contacts, expiry notice.
* A late scheduler emits only the highest due milestone, avoiding obsolete alert
  bursts. A milestone is deduped by request revision, frozen step, and recipient.
* Weekends/holidays pause all notices. Missing/ambiguous/out-of-range calendars
  fail closed per request, recorded as an operator error without stopping others.
* Expiry is an advisory notice. NO automatic rejection, reservation release,
  approval mutation, or salary action occurs; those need separate HR acceptance.

Root integration: register process_pending as a daily scheduler event. Existing
foundation outbox worker delivers the local notices after transaction commit,
rechecking recipient account and reference read permissions at delivery time.
All entry points remain non-whitelisted and Administrator-only server functions.
"""

from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.utils import get_datetime

from kandil_hr.foundation.business_calendar import company_calendar
from kandil_hr.foundation.clock import now_cairo
from kandil_hr.foundation.outbox import enqueue
from kandil_hr.recruitment.models import enabled

STAGES = {2: "reminder", 3: "escalation", 4: "warning", 5: "expiry"}


def due_milestone(working_days):
	return STAGES.get(min(working_days, 5))


def _server_guard():
	if frappe.session.user != "Administrator" or getattr(frappe.local, "request", None):
		frappe.throw(
			_("Approval SLA processing is restricted to the internal scheduler."), frappe.PermissionError
		)


def _waiting_date(value):
	instant = get_datetime(value)
	# Recruitment commands store the business clock as naive Cairo wall time.
	# Do not reinterpret these controlled workflow fields as UTC/server time.
	if instant.tzinfo is None:
		instant = instant.replace(tzinfo=ZoneInfo("Africa/Cairo"))
	return instant.astimezone(ZoneInfo("Africa/Cairo")).date()


def process_request(name):
	"""Queue one locked request's highest due milestone; caller owns transaction."""
	_server_guard()
	if not enabled():
		return {"status": "Disabled", "outbox": []}
	doc = frappe.get_doc("Kandil Hiring Request", name, for_update=True)
	step = next((row for row in doc.approval_steps if row.decision == "Pending"), None)
	if doc.status != "Pending" or not step:
		return {"status": "Inactive", "outbox": []}
	if not step.waiting_since or not step.step_key or not step.principal:
		frappe.throw(_("The active approval step is missing its frozen identity or waiting date."))
	calendar = company_calendar(doc.company)
	current_date = now_cairo().date()
	start = _waiting_date(step.waiting_since)
	if start > current_date:
		return {"status": "Not due", "outbox": []}
	elapsed = calendar.elapsed(start, current_date)
	stage = due_milestone(elapsed)
	if not stage or current_date.weekday() in calendar.weekends or current_date in calendar.holidays:
		return {"status": "Not due", "outbox": []}
	recipients = {step.principal}
	if stage in ("escalation", "expiry"):
		settings = frappe.get_doc("Kandil Organization Settings", doc.company)
		if not settings.hr_approver or not settings.sector_approver:
			frappe.throw(_("Configure company HR and sector contacts before processing approval escalation."))
		recipients = {settings.hr_approver, settings.sector_approver}
	if stage == "warning":
		recipients.add(doc.requested_by)
	elif stage == "expiry":
		recipients.update((step.principal, doc.requested_by))
	# Global User lock order matches recruitment saves, preventing requester/team
	# inversion deadlocks. enqueue reuses these locks and suppresses disabled users.
	for user in sorted(recipients):
		frappe.db.sql("SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE", (user,))
	# Fixed payload per key: elapsed/day and current translation must not change
	# payload hashes on retry. Native catalogue supplies the translated labels.
	subject = {
		"reminder": _("Approval reminder", lang="en"),
		"escalation": _("Approval escalation", lang="en"),
		"warning": _("Approval expiry warning", lang="en"),
		"expiry": _("Approval deadline reached", lang="en"),
	}[stage]
	body = _("Request {0}: approval step {1} requires attention.", lang="en").format(doc.name, step.idx)
	if stage == "expiry":
		body += " " + _(
			"Automatic rejection is disabled; an authorized decision is still required.", lang="en"
		)
	queued = []
	for user in sorted(recipients):
		key = f"approval-sla:{doc.name}:{doc.revision}:{step.step_key}:{stage}:{user}"
		queued.append(enqueue(key, user, subject, body, "Kandil Hiring Request", doc.name))
	return {"status": stage, "step": step.step_key, "working_days": elapsed, "outbox": queued}


def process_pending():
	"""Scheduler boundary: commit per request; isolate failures and expose counts."""
	_server_guard()
	if not enabled():
		return {"processed": 0, "failed": 0, "disabled": True}
	names = frappe.get_all(
		"Kandil Hiring Request",
		filters={"status": "Pending"},
		pluck="name",
		order_by="name asc",
		limit_page_length=0,
	)
	result = {"processed": 0, "failed": 0, "disabled": False}
	for name in names:
		try:
			process_request(name)
			frappe.db.commit()
			result["processed"] += 1
		except Exception as error:
			frappe.db.rollback()
			result["failed"] += 1
			# No candidate data, request notes or traceback payload in the error log.
			# Insert locally instead of log_error(), which may forward to Sentry.
			frappe.get_doc(
				dict(
					doctype="Error Log",
					method="Approval SLA request failed",
					error=f"{name}: {type(error).__name__}; review calendar and active-step configuration.",
				)
			).insert(ignore_permissions=True)
			frappe.db.commit()
	return result
