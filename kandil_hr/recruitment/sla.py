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

import json
import hashlib
from datetime import datetime, time
from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.utils import get_datetime, get_system_timezone

from kandil_hr.foundation.business_calendar import company_calendar
from kandil_hr.foundation.clock import now_cairo
from kandil_hr.foundation.outbox import enqueue, recheck_calendar_deferred
from kandil_hr.recruitment.models import enabled

STAGES = {2: "reminder", 3: "escalation", 4: "warning", 5: "expiry"}
LEGACY_SUBJECTS = {"Approval reminder", "Approval escalation", "Approval expiry warning", "Approval deadline reached"}


def validate_context(context):
	fields = {"kind", "revision", "step_key", "principal", "waiting_since", "stage"}
	if isinstance(context, dict) and context.get("kind") == "approval_sla_v3":
		fields.add("recipient_basis")
		bases = context.get("recipient_basis")
		allowed = {"principal", "board_vice", "hr_contact", "sector_contact", "requester"}
		if (not isinstance(bases, list) or not bases or len(bases) > 6
				or any(not isinstance(b, str) or len(b) > 160 or not (b in allowed or (b.startswith("delegation:") and len(b) > 11)) for b in bases)
				or bases != sorted(set(bases))):
			raise ValueError("Invalid reminder recipient authority")
	if (not isinstance(context, dict) or set(context) != fields
			or context["kind"] not in ("approval_sla_v2", "approval_sla_v3")
			or type(context["revision"]) is not int or context["revision"] < 1
			or context["stage"] not in STAGES.values()
			or any(not isinstance(context[k], str) or not context[k] for k in ("step_key", "principal", "waiting_since"))):
		raise ValueError("Invalid approval reminder delivery context")
	get_datetime(context["waiting_since"])


def delivery_reason(request, notice):
	"""Called with current Company/request and recipient locks, before any receipt.

	A historical update remains deliverable; an instruction to act on a finished
	approval step does not. Unknown/malformed contexts fail visibly for recovery.
	Old unversioned SLA events cannot prove their step and are suppressed; the
	versioned scheduler key lets the current due reminder be regenerated safely.
	Delivered receipts are untouched by this guard.
	"""
	raw = notice.get("delivery_context")
	if not raw:
		if (notice.reference_doctype == "Kandil Hiring Request" and notice.subject in LEGACY_SUBJECTS):
			return "Legacy approval reminder lacks a verifiable step; regenerate through scheduler"
		return ""
	context = json.loads(raw)
	validate_context(context)
	if context["kind"] == "approval_sla_v2":
		return "Legacy approval reminder recipient authority must be regenerated"
	if not request or notice.reference_doctype != "Kandil Hiring Request":
		return "Approval reminder reference no longer exists"
	step = next((row for row in request.approval_steps if row.decision == "Pending"), None)
	if (request.status != "Pending" or not step
			or int(request.revision) != context["revision"]
			or step.step_key != context["step_key"] or step.principal != context["principal"]
			or not step.waiting_since
			or get_datetime(step.waiting_since) != get_datetime(context["waiting_since"])):
		return "Approval reminder superseded by current request or approval step"
	return ""


def timing_plan(request, notice):
	"""Internal delivery timing, before recipient locks; caller holds Company.

	Later due milestones suppress stale instructions. Holidays/weekends or a
	calendar edit moving this same milestone into the future postpone the row
	without consuming an attempt. The existing stable key remains usable.
	"""
	if not notice.get("delivery_context") or delivery_reason(request, notice):
		return {}
	context = json.loads(notice.delivery_context)
	calendar = company_calendar(request.company, current=True)
	start = _waiting_date(context["waiting_since"])
	day = now_cairo().date()
	elapsed = calendar.elapsed(start, day) if day >= start else 0
	target = next(n for n, label in STAGES.items() if label == context["stage"])
	if elapsed > target and target < 5:
		return {"reason": "Approval reminder superseded by a later business-day milestone"}
	if elapsed < target:
		resume = calendar.deadline(start, target)
	elif day.weekday() in calendar.weekends or day in calendar.holidays:
		resume = calendar.deadline(day, 1)
	else:
		return {}
	# next_attempt uses the Frappe site's naive wall-clock representation, while
	# business dates use Cairo (including historical DST). No browser clock input.
	instant = datetime.combine(resume, time.min, tzinfo=ZoneInfo("Africa/Cairo"))
	return {"defer_until": instant.astimezone(ZoneInfo(get_system_timezone())).replace(tzinfo=None)}


def deadline_projection(doc):
	"""Minimal read-only projection for an already-authorized request viewer."""
	result = dict(state="inactive", timezone="Africa/Cairo", as_of=now_cairo().date().isoformat(),
		automatic_rejection=False, policy_status="Awaiting HR confirmation")
	step = next((row for row in doc.approval_steps if row.decision == "Pending"), None)
	if doc.status != "Pending" or not step:
		return result
	if not step.waiting_since or not step.step_key or not step.principal:
		return result | {"state": "unavailable"}
	try:
		calendar = company_calendar(doc.company)
		start, day = _waiting_date(step.waiting_since), now_cairo().date()
		elapsed = calendar.elapsed(start, day) if day >= start else 0
		milestones = [dict(working_day=n, stage=label, date=calendar.deadline(start, n).isoformat()) for n, label in STAGES.items()]
		return result | dict(state="active", waiting_from=start.isoformat(), working_days=elapsed,
			weekends=list(calendar.weekends), working_today=day.weekday() not in calendar.weekends and day not in calendar.holidays,
			current_stage=due_milestone(elapsed), milestones=milestones)
	except (frappe.ValidationError, ValueError):
		# Do not expose calendar IDs, holiday descriptions or configuration traces.
		return result | {"state": "unavailable"}


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


def notice_key(name, context, recipient):
	# A corrected/restarted waiting date or changed frozen authority is a new
	# instruction, even if the request revision and step key were preserved.
	basis = hashlib.sha256(json.dumps(context, sort_keys=True).encode()).hexdigest()[:24]
	return f"approval-sla:v3:{name}:{context['revision']}:{context['step_key']}:{context['stage']}:{recipient}:{basis}"


def process_request(name):
	"""Queue one locked request's highest due milestone; caller owns transaction."""
	_server_guard()
	if not enabled():
		return {"status": "Disabled", "outbox": []}
	company = frappe.db.get_value("Kandil Hiring Request", name, "company")
	frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", (company,))
	doc = frappe.get_doc("Kandil Hiring Request", name, for_update=True)
	if doc.company != company:
		raise RuntimeError("Approval reminder company changed; retry transaction")
	step = next((row for row in doc.approval_steps if row.decision == "Pending"), None)
	if doc.status != "Pending" or not step:
		return {"status": "Inactive", "outbox": []}
	if not step.waiting_since or not step.step_key or not step.principal:
		frappe.throw(_("The active approval step is missing its frozen identity or waiting date."))
	calendar = company_calendar(doc.company, current=True)
	current_date = now_cairo().date()
	start = _waiting_date(step.waiting_since)
	if start > current_date:
		return {"status": "Not due", "outbox": []}
	elapsed = calendar.elapsed(start, current_date)
	stage = due_milestone(elapsed)
	if not stage or current_date.weekday() in calendar.weekends or current_date in calendar.holidays:
		return {"status": "Not due", "outbox": []}
	from kandil_hr.recruitment import reminder_recipients
	plan = reminder_recipients.candidates(doc, step, stage)
	# All authority users are locked together before eligibility checks/queueing.
	for user in sorted(set(plan) | {s.principal for s in doc.approval_steps if s.principal}):
		frappe.db.sql("SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE", (user,))
	recipients = {user: reminder_recipients.eligible(doc, step, user, bases) for user, bases in plan.items()}
	recipients = {user: bases for user, bases in recipients.items() if bases}
	# Fixed payload per key: elapsed/day and current translation must not change
	# payload hashes on retry. Both language strings are fixed in each payload.
	subject = {
		"reminder": "Approval reminder / تذكير بالاعتماد",
		"escalation": "Approval escalation / تصعيد متابعة الاعتماد",
		"warning": "Approval expiry warning / تنبيه اقتراب موعد الاعتماد",
		"expiry": "Approval deadline reached / بلوغ موعد الاعتماد",
	}[stage]
	body = f"Request {doc.name}: approval step {step.idx} requires attention. / الطلب {doc.name}: خطوة الاعتماد {step.idx} تحتاج إلى متابعة."
	if stage == "expiry":
		body += " Automatic rejection is disabled; an authorized decision is still required. / الرفض التلقائي معطل؛ ما زال القرار يتطلب اعتمادًا من صاحب الصلاحية."
	context = dict(kind="approval_sla_v3", revision=int(doc.revision), step_key=step.step_key,
		principal=step.principal, waiting_since=str(step.waiting_since), stage=stage)
	queued = []
	for user in sorted(recipients):
		recipient_context = context | {"recipient_basis": recipients[user]}
		key = notice_key(doc.name, recipient_context, user)
		name = enqueue(key, user, subject, body, "Kandil Hiring Request", doc.name, delivery_context=recipient_context)
		recheck_calendar_deferred(name)
		queued.append(name)
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
