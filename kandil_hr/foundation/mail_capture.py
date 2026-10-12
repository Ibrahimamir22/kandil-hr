"""Private local mail sink for successful Hiring Request outbox deliveries.

The outbox adapter must hold its domain, recipient and outbox locks and authorize
delivery before entering delivery_effect(). No commits, SMTP or provider calls.
This artifact is not an email-sent receipt and cannot revoke downloaded copies.
"""

import base64
import binascii
import hashlib
from contextlib import contextmanager
from email.message import EmailMessage
from email.policy import SMTP
from html import escape

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime, validate_email_address

from kandil_hr.foundation.security import enabled, request_scope

DOCTYPE = "Kandil Mail Capture"
REQUEST = "Kandil Hiring Request"


def active():
	return enabled() and bool(frappe.conf.get("kandil_parity_enabled"))


@contextmanager
def delivery_effect():
	old = frappe.flags.get("kandil_mail_capture_delivery")
	frappe.flags.kandil_mail_capture_delivery = True
	try:
		yield
	finally:
		frappe.flags.kandil_mail_capture_delivery = old


def content(doc):
	try:
		value = base64.b64decode(doc.mime_content, validate=True)
	except ValueError, TypeError, binascii.Error:
		frappe.throw(_("Local mail capture failed its integrity check."))
	if hashlib.sha256(value).hexdigest() != doc.content_hash:
		frappe.throw(_("Local mail capture failed its integrity check."))
	return value


class KandilMailCapture(Document):
	def autoname(self):
		self.name = "KMC-" + hashlib.sha256(self.outbox.encode()).hexdigest()[:40]

	def validate(self):
		if not active() or not frappe.flags.get("kandil_mail_capture_delivery") or not self.is_new():
			frappe.throw(
				_("Local mail captures are immutable server-created records."), frappe.PermissionError
			)
		if self.status != "Captured locally":
			frappe.throw(_("Local mail capture must be labelled Captured locally."))
		content(self)

	def on_trash(self):
		frappe.throw(_("Local mail capture history cannot be deleted."), frappe.PermissionError)

	def before_rename(self, old, new, merge=False):
		frappe.throw(_("Local mail capture history cannot be renamed."), frappe.PermissionError)


def permission(doc, user=None, ptype=None):
	user = user or frappe.session.user
	if not active() or ptype not in (None, "read", "select"):
		return False
	if user == "Administrator":
		return True
	if user != doc.recipient or not frappe.db.get_value("User", user, "enabled"):
		return False
	if not frappe.db.exists(REQUEST, doc.request):
		return False
	request = frappe.get_doc(REQUEST, doc.request)
	return bool(
		request_scope(request, user, "read")
		and frappe.has_permission(REQUEST, "read", doc=request, user=user, ignore_share_permissions=True)
	)


def query(user=None):
	user = user or frappe.session.user
	if not active():
		return "1=0"
	if user == "Administrator":
		return ""
	rows = frappe.get_all(DOCTYPE, filters={"recipient": user}, fields=["name", "recipient", "request"])
	names = [row.name for row in rows if permission(row, user, "read")]
	return (
		"`tabKandil Mail Capture`.name IN (" + ",".join(frappe.db.escape(name) for name in names) + ")"
		if names
		else "1=0"
	)


def capture_delivery(outbox):
	"""Called inside authorized successful delivery, before its transaction ends."""
	if not active() or outbox.reference_doctype != REQUEST:
		return None
	if not frappe.flags.get("kandil_mail_capture_delivery"):
		frappe.throw(
			_("Local mail capture requires the authorized delivery context."), frappe.PermissionError
		)
	if outbox.status not in ("Pending", "Retry"):
		frappe.throw(_("Only a pending local delivery can create a mail capture."))
	# These rows are already locked by lock_delivery. Reentrant current reads avoid an older RR
	# snapshot without acquiring any new lock targets after Outbox; the locked authorization remains authoritative.
	account = frappe.db.get_value(
		"User", outbox.recipient, ["enabled", "email"], as_dict=True, for_update=True
	)
	if (
		not account
		or not account.enabled
		or outbox.recipient in ("Guest", "Administrator")
		or not account.email
		or any(c in account.email for c in "\r\n,;")
		or validate_email_address(account.email) != account.email
	):
		frappe.throw(_("Local mail capture requires an enabled recipient with one valid email address."))
	request = frappe.get_doc(REQUEST, outbox.reference_name, for_update=True)
	probe = frappe._dict(recipient=outbox.recipient, request=request.name)
	if not permission(probe, outbox.recipient, "read"):
		frappe.throw(_("The recipient no longer has access to this hiring request."), frappe.PermissionError)
	name = "KMC-" + hashlib.sha256(outbox.name.encode()).hexdigest()[:40]
	prior = frappe.db.sql(
		"SELECT name,outbox,recipient,request,payload_hash FROM `tabKandil Mail Capture` WHERE name=%s FOR UPDATE",
		(name,),
		as_dict=True,
	)
	if prior:
		row = prior[0]
		if (row.outbox, row.recipient, row.request, row.payload_hash) != (
			outbox.name,
			outbox.recipient,
			request.name,
			outbox.payload_hash,
		):
			frappe.throw(_("Local mail capture identity was reused with different content."))
		return row.name
	message = EmailMessage(policy=SMTP)
	message["From"] = "Kandil Local Capture <no-reply@kandil.invalid>"
	message["To"] = account.email
	message["Subject"] = str(outbox.subject).replace("\r", " ").replace("\n", " ")
	message["X-Kandil-Delivery"] = "Captured locally; no provider transmission"
	message.set_content(outbox.body or "")
	message.add_alternative("<p>" + escape(outbox.body or "").replace("\n", "<br>") + "</p>", subtype="html")
	value = message.as_bytes()
	return (
		frappe.get_doc(
			dict(
				doctype=DOCTYPE,
				outbox=outbox.name,
				payload_hash=outbox.payload_hash,
				request=request.name,
				company=request.company,
				recipient=outbox.recipient,
				recipient_email=account.email,
				subject=outbox.subject,
				status="Captured locally",
				captured_at=now_datetime(),
				mime_content=base64.b64encode(value).decode("ascii"),
				content_hash=hashlib.sha256(value).hexdigest(),
			)
		)
		.insert(ignore_permissions=True)
		.name
	)


@frappe.whitelist(methods=["GET"])
def download(name):
	doc = frappe.get_doc(DOCTYPE, name)
	# Do not admit native sharing fallback, even for a historical stale share.
	if not permission(doc, ptype="read"):
		frappe.throw(_("This local mail capture is outside your current access."), frappe.PermissionError)
	frappe.local.response.filename = doc.name + ".eml"
	frappe.local.response.filecontent = content(doc)
	frappe.local.response.type = "download"
	frappe.local.response.display_content_as = "attachment"
