"""Transactional, idempotent LOCAL Notification Log delivery. Never sends email.

Outbox insertion is part of the business transaction. A database row lock and
single transaction protect the receipt + Notification Log from retry duplication.
No claim of exactly-once remote delivery is made; no remote adapter exists here.
"""

import hashlib
import json

import frappe
from frappe import _
from frappe.utils import add_to_date, now_datetime

from kandil_hr.foundation.models import effect, guard
from kandil_hr.foundation.security import enabled


def enqueue(key, recipient, subject, body="", reference_doctype=None, reference_name=None):
	guard()
	if not key or not recipient or not subject:
		frappe.throw(_("A notification requires a stable key, recipient and subject."))
	if bool(reference_doctype) != bool(reference_name):
		frappe.throw(_("Both notification reference fields are required together."))
	data = dict(
		recipient=recipient,
		subject=subject,
		body=body,
		reference_doctype=reference_doctype,
		reference_name=reference_name,
	)
	digest = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
	name = "KNO-" + hashlib.sha256(key.encode()).hexdigest()[:40]
	# Serialize writers through a stable, pre-existing User row, including first insert.
	users = frappe.db.sql(
		"SELECT name, enabled FROM `tabUser` WHERE name=%s FOR UPDATE", (recipient,), as_dict=True
	)
	if not users:
		frappe.throw(_("Notification recipient must exist."))
	# A transaction may have established a repeatable-read snapshot before waiting
	# for the User lock. Use a current read here, not exists/get_doc snapshot reads.
	prior = frappe.db.sql(
		"SELECT name, payload_hash FROM `tabKandil Notification Outbox` WHERE name=%s FOR UPDATE",
		(name,),
		as_dict=True,
	)
	if prior:
		old = prior[0]
		if old.payload_hash != digest:
			frappe.throw(_("Notification key was already used with different content."))
		return old.name
	with effect():
		disabled = not users[0].enabled
		return (
			frappe.get_doc(
				dict(
					doctype="Kandil Notification Outbox",
					dedupe_name=name,
					payload_hash=digest,
					status="Suppressed" if disabled else "Pending",
					attempts=0,
					next_attempt=None if disabled else now_datetime(),
					last_error="Recipient disabled at enqueue" if disabled else "",
					**data,
				)
			)
			.insert(ignore_permissions=True)
			.name
		)


def deliver(name):
	guard()
	from kandil_hr.foundation.outbox_access import lock_delivery

	doc, suppression_reason = lock_delivery(name)
	if doc.status in ("Delivered locally", "Suppressed", "Failed"):
		return doc.status
	if doc.next_attempt and doc.next_attempt > now_datetime():
		return doc.status
	doc.attempts += 1
	with effect():
		if suppression_reason:
			doc.status, doc.last_error = "Suppressed", suppression_reason
		else:
			from markupsafe import escape

			receipt = frappe.get_doc(
				dict(
					doctype="Notification Log",
					type="Alert",
					for_user=doc.recipient,
					subject=str(escape(doc.subject)),
					email_content=str(escape(doc.body or "")),
					document_type=doc.reference_doctype,
					document_name=doc.reference_name,
				)
			)
			receipt.flags.kandil_local_only = True
			receipt.insert(ignore_permissions=True)
			doc.status, doc.notification_log, doc.last_error = "Delivered locally", receipt.name, ""
			doc.delivered_at = now_datetime()
		doc.save(ignore_permissions=True)
	return doc.status


@frappe.whitelist(methods=["POST"])
def retry_failed(name, reason):
	"""Explicit operator recovery. Terminal suppressions are never resurrected."""
	guard()
	frappe.only_for("System Manager")
	if not isinstance(reason, str) or not reason.strip() or len(reason) > 500:
		frappe.throw(_("Provide a retry reason of no more than 500 characters."))
	doc = frappe.get_doc("Kandil Notification Outbox", name, for_update=True)
	doc.check_permission("read")
	if doc.status != "Failed":
		frappe.throw(_("Only a failed notification can be retried manually."))
	with effect():
		doc.status, doc.attempts, doc.next_attempt = "Pending", 0, now_datetime()
		doc.manual_retries = (doc.manual_retries or 0) + 1
		doc.retry_reason = reason.strip()
		doc.save(ignore_permissions=True)
		from kandil_hr.foundation.models import record_security_event

		record_security_event("Local notification retry requested", doc.recipient, reference=doc.name)
	return {"name": doc.name, "status": doc.status}


class LocalNotificationMixin:
	def after_insert(self):
		if not self.flags.get("kandil_local_only"):
			return super().after_insert()
		# Native Notification Log.after_insert can send email based on user settings.
		# The server-only flag intentionally selects only its local UI effects.
		from frappe.desk.doctype.notification_log.notification_log import set_notifications_as_unseen

		frappe.publish_realtime("notification", after_commit=True, user=self.for_user)
		set_notifications_as_unseen(self.for_user)


def process_pending():
	if not enabled():
		return
	for name in frappe.get_all(
		"Kandil Notification Outbox",
		filters={"status": ["in", ["Pending", "Retry"]], "next_attempt": ["<=", now_datetime()]},
		pluck="name",
		limit=100,
	):
		try:
			deliver(name)
			frappe.db.commit()
		except Exception as exc:
			frappe.db.rollback()
			_record_failure(name, type(exc).__name__)
			frappe.db.commit()


def _record_failure(name, error_type):
	"""Call after rollback; never persist arbitrary exception text/private payloads."""
	doc = frappe.get_doc("Kandil Notification Outbox", name, for_update=True)
	if doc.status in ("Delivered locally", "Suppressed", "Failed"):
		return doc.status
	with effect():
		doc.attempts += 1
		doc.status = "Failed" if doc.attempts >= 5 else "Retry"
		doc.last_error = "Local notification creation failed: " + error_type
		doc.next_attempt = add_to_date(now_datetime(), minutes=min(60, 2**doc.attempts))
		doc.save(ignore_permissions=True)
	return doc.status
