"""Approved JD mail composition captured locally; never calls an email provider.

Reference JobDescriptions.gs jdCanSend_/jdRecipients_/jdSend_: HR/managers,
approved revision, deduped 1..10 active portal users with email, note up to 500.
Existing native JD read/print and scoped grants remain additional restrictions.
"""

import base64
import binascii
import hashlib
import json
from contextlib import contextmanager
from email.message import EmailMessage
from email.policy import SMTP
from email.utils import format_datetime
from html import escape
from urllib.parse import quote

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime, now_datetime, validate_email_address

from kandil_hr.foundation.mutation_access import assert_current_scope
from kandil_hr.foundation.outbox import enqueue
from kandil_hr.foundation.security import has_scope
from kandil_hr.organization import documents
from kandil_hr.organization.api import active_hierarchy
from kandil_hr.organization.current import rows
from kandil_hr.pilot.api import transactional_retry

DOCTYPE = "Kandil Document Delivery"
SENDER_ROLES = (
	"Kandil Recruiter",
	"Kandil Sector Approver",
	"Kandil Approver",
	"Kandil CEO Approver",
	"Kandil Board Approver",
)


@contextmanager
def effect():
	old = frappe.flags.get("kandil_document_capture")
	frappe.flags.kandil_document_capture = True
	try:
		yield
	finally:
		frappe.flags.kandil_document_capture = old


@contextmanager
def as_user(user):
	before = frappe.session.user
	frappe.set_user(user)
	try:
		yield
	finally:
		frappe.set_user(before)


def mime_bytes(value):
	# Store ASCII base64 so native HTML sanitization cannot rewrite MIME headers or
	# text/plain bodies. The hash and download are over the original MIME bytes.
	try:
		return base64.b64decode(value, validate=True)
	except ValueError, TypeError, binascii.Error:
		frappe.throw(_("Document capture content does not match its integrity hash."))


class KandilDocumentDelivery(Document):
	def autoname(self):
		self.name = self.capture_key

	def validate(self):
		if not frappe.flags.get("kandil_document_capture") or not self.is_new():
			frappe.throw(
				_("Document delivery captures are immutable and created by the capture command."),
				frappe.PermissionError,
			)
		if not captured_scopes(self):
			frappe.throw(_("The captured document has no valid included scope record."))
		if (
			self.status != "Captured locally"
			or hashlib.sha256(mime_bytes(self.mime_content)).hexdigest() != self.content_hash
		):
			frappe.throw(_("Document capture content does not match its integrity hash."))

	def before_rename(self, old, new, merge=False):
		frappe.throw(_("Document delivery history cannot be renamed."), frappe.PermissionError)

	def on_trash(self):
		frappe.throw(_("Document delivery history cannot be deleted."), frappe.PermissionError)


def guard():
	if not frappe.conf.get("kandil_parity_enabled") or frappe.session.user == "Guest":
		frappe.throw(_("Document delivery capture is not available."), frappe.PermissionError)


def captured_scopes(doc):
	"""Only server-captured explicit scopes; old or malformed captures fail closed."""
	try:
		value = json.loads(doc.get("included_scopes_json") or "null")
	except ValueError, TypeError:
		return None
	if not isinstance(value, list) or not value:
		return None
	for scope in value:
		if (
			not isinstance(scope, dict)
			or set(scope) != {"company", "department", "branch"}
			or scope["company"] != doc.company
			or any(
				v is not None and (not isinstance(v, str) or not v or len(v) > 140) for v in scope.values()
			)
		):
			return None
	keys = {(r["company"], r["department"], r["branch"]) for r in value}
	anchor = (doc.company, doc.department or None, doc.branch or None)
	return value if len(keys) == len(value) and anchor in keys else None


def current_jd_permission(jd, user, roles):
	"""Current read AND print DocPerm, supplementing native hooks/permissions."""
	if user == "Administrator":
		return True
	permissions = frappe.db.sql(
		"SELECT role,permlevel,`read`,`print`,if_owner FROM `tabCustom DocPerm` WHERE parent=%s ORDER BY name FOR UPDATE",
		(jd.doctype,),
		as_dict=True,
	)
	if not permissions:
		permissions = frappe.db.sql(
			"SELECT role,permlevel,`read`,`print`,if_owner FROM `tabDocPerm` WHERE parent=%s ORDER BY name FOR UPDATE",
			(jd.doctype,),
			as_dict=True,
		)
	roles = set(roles) | {"All"}
	if frappe.db.get_value("User", user, "user_type", for_update=True) == "System User":
		roles.add("Desk User")
	return all(
		any(
			row.role in roles
			and not row.permlevel
			and row.get(right)
			and (not row.if_owner or jd.owner == user)
			for row in permissions
		)
		for right in ("read", "print")
	)


def assert_current_capture_access(doc, user):
	"""Outbox adapter: call after domain locks, before outbox lock/effects."""
	scopes = captured_scopes(doc)
	if user not in (doc.sender, doc.recipient) or not scopes:
		frappe.throw(_("The captured document is outside your current access scope."), frappe.PermissionError)
	roles = None
	for scope in scopes:
		roles = assert_current_scope(**scope, user=user, capability="read")
	jd = frappe.get_doc("Kandil JD Revision", doc.jd_revision)
	if not current_jd_permission(jd, user, roles):
		frappe.throw(
			_("The captured document requires current read and print permission."), frappe.PermissionError
		)


def permission(doc, user=None, ptype=None):
	user = user or frappe.session.user
	if not frappe.conf.get("kandil_parity_enabled") or ptype not in (None, "read", "select", "print"):
		return False
	scopes = captured_scopes(doc)
	if user not in (doc.sender, doc.recipient) or not scopes:
		return False
	if not frappe.db.get_value("User", user, "enabled") or not all(
		has_scope(user, scope["company"], scope["department"], scope["branch"], "read") for scope in scopes
	):
		return False
	jd = frappe.get_doc("Kandil JD Revision", doc.jd_revision)
	return all(
		frappe.has_permission(jd.doctype, right, doc=jd, user=user, ignore_share_permissions=True)
		for right in ("read", "print")
	)


def query(user=None):
	user = user or frappe.session.user
	if not frappe.conf.get("kandil_parity_enabled") or not frappe.db.get_value("User", user, "enabled"):
		return "1=0"
	# get_all deliberately avoids recursively invoking this query hook. Only own
	# candidate metadata is inspected, never MIME content or other users' records.
	candidates = frappe.get_all(
		DOCTYPE,
		or_filters={"sender": user, "recipient": user},
		fields=[
			"name",
			"company",
			"department",
			"branch",
			"sender",
			"recipient",
			"jd_revision",
			"included_scopes_json",
		],
		limit_page_length=0,
	)
	allowed = [row.name for row in candidates if permission(row, user, "read")]
	if not allowed:
		return "1=0"
	return (
		"`tabKandil Document Delivery`.name IN (" + ",".join(frappe.db.escape(name) for name in allowed) + ")"
	)


@contextmanager
def quiet_eligibility():
	before = frappe.flags.get("mute_messages")
	frappe.flags.mute_messages = True
	try:
		yield
	finally:
		frappe.flags.mute_messages = before


def recipient_ids(recipients):
	if isinstance(recipients, str):
		try:
			recipients = json.loads(recipients)
		except ValueError:
			frappe.throw(_("Select portal users from the recipient list."))
	if (
		not isinstance(recipients, list)
		or len(recipients) > 100
		or any(not isinstance(x, str) or not x or len(x) > 140 for x in recipients)
	):
		frappe.throw(_("Select portal users from the recipient list."))
	ids = sorted(set(recipients))
	if not 1 <= len(ids) <= 10:
		frappe.throw(_("Select between one and ten distinct portal users."))
	return ids


def valid_email(value):
	# Frappe's generic validator accepts address lists; a portal account must
	# contribute exactly its own mailbox, never injected CC/extra recipients.
	return (
		isinstance(value, str)
		and bool(value)
		and not any(c in value for c in "\r\n,;")
		and validate_email_address(value) == value
	)


def check_recipient(jd, user, current=False):
	if user in ("Guest", "Administrator"):
		frappe.throw(
			_("Only eligible active portal users may receive this document."), frappe.PermissionError
		)
	account = frappe.db.get_value("User", user, ["enabled", "email"], as_dict=True, for_update=current)
	if not account or not account.enabled or not valid_email(account.email):
		frappe.throw(
			_("Only eligible active portal users with email may receive this document."),
			frappe.PermissionError,
		)
	if current:
		roles = assert_current_scope(jd.company, jd.department, jd.branch, user=user, capability="read")
		if not current_jd_permission(jd, user, roles):
			frappe.throw(
				_("The recipient no longer has access to this approved document."), frappe.PermissionError
			)
	if not has_scope(user, jd.company, jd.department, jd.branch, "read") or not all(
		frappe.has_permission(jd.doctype, p, doc=jd, user=user, ignore_share_permissions=True)
		for p in ("read", "print")
	):
		frappe.throw(_("The recipient is outside this document's permitted scope."), frappe.PermissionError)
	return account.email


@frappe.whitelist(methods=["GET"])
def recipients(name):
	guard()
	jd = documents.load(name)
	if (
		jd.status != "Approved"
		or not set(frappe.get_roles()) & set(SENDER_ROLES)
		or not has_scope(frappe.session.user, jd.company, jd.department, jd.branch, "manage")
	):
		frappe.throw(
			_("Only authorized HR staff or managers may capture an approved document."),
			frappe.PermissionError,
		)
	result = []
	# Use access-grant candidates rather than exposing the global User directory.
	users = frappe.get_all(
		"Kandil Access Grant",
		filters={"company": jd.company, "revoked": 0},
		pluck="user",
		limit_page_length=0,
	)
	for user in sorted(set(users)):
		try:
			with quiet_eligibility():
				check_recipient(jd, user)
		except frappe.PermissionError:
			continue
		result.append(dict(user=user, label=frappe.db.get_value("User", user, "full_name") or user))
	return result


def compose(name, user, email, sender, language, kind, note, locations):
	from frappe.utils.pdf import get_pdf

	with as_user(user):
		rendered = documents.render(name, language, kind, location_rows=locations)
	html = rendered["html"]
	if len(html.encode()) > 500_000:
		frappe.throw(_("The document is too large for local delivery capture."))
	pdf = get_pdf(html, options={"page-size": "A4"})
	if not pdf.startswith(b"%PDF-") or len(pdf) > 5_000_000:
		frappe.throw(_("The generated document PDF is invalid or too large."))
	message = EmailMessage(policy=SMTP)
	message["From"] = sender
	message["To"] = email
	message["Subject"] = _("Approved job description") + " — " + name
	message["X-Kandil-Delivery"] = "Captured locally; no provider transmission"
	message.set_content(
		_("Approved document captured locally. No email has been sent.") + ("\n" + note if note else "")
	)
	message.add_alternative(("<p>" + escape(note) + "</p>" if note else "") + html, subtype="html")
	message.add_attachment(pdf, maintype="application", subtype="pdf", filename=rendered["filename"] + ".pdf")
	return message.as_string()


@frappe.whitelist(methods=["POST"])
@transactional_retry
def capture(name, recipients, expected_version, command_id, language="ar", kind="jd", note=""):
	guard()
	ids = recipient_ids(recipients)
	if (
		language not in ("ar", "en")
		or kind not in ("jd", "worker")
		or not isinstance(note, str)
		or len(note) > 500
	):
		frappe.throw(_("Choose a supported document and a note of at most 500 characters."))
	if not isinstance(command_id, str) or not 1 <= len(command_id) <= 100 or not expected_version:
		frappe.throw(_("A command ID and reviewed record version are required."))
	actor = frappe.session.user
	company = frappe.db.get_value("Kandil JD Revision", name, "company")
	frappe.db.sql("SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE", company)
	jd = frappe.get_doc("Kandil JD Revision", name, for_update=True)
	if jd.company != company:
		frappe.throw(_("Document scope changed. Reload before capturing."))
	documents.load(name)
	if jd.status != "Approved" or get_datetime(jd.modified) != get_datetime(expected_version):
		frappe.throw(_("Capture requires the reviewed approved document revision."))
	group = hashlib.sha256(json.dumps([actor, name, command_id]).encode()).hexdigest()
	payload = hashlib.sha256(
		json.dumps([ids, str(expected_version), language, kind, note], ensure_ascii=False).encode()
	).hexdigest()
	prior = frappe.db.sql(
		"SELECT name,payload_hash,recipient FROM `tabKandil Document Delivery` WHERE command_group=%s ORDER BY recipient FOR UPDATE",
		group,
		as_dict=True,
	)
	# Current domain snapshots precede User/grant locks; render only authorized locations.
	positions = rows(
		"Kandil Position",
		filters={"company": jd.company},
		fields=["name", "designation", "department", "branch", "status", "title", "title_ar"],
	)
	by_name = {p.name: p for p in positions}
	anchor = by_name.get(jd.position)
	if not anchor:
		frappe.throw(_("The document position is no longer available."))
	hierarchy = active_hierarchy(jd.company, frappe.utils.getdate())
	if prior and (len(prior) != len(ids) or any(row.payload_hash != payload for row in prior)):
		frappe.throw(_("Document command ID was already used with different content."))
	for user in sorted(set(ids) | {actor}):
		frappe.db.sql("SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE", user)
	sender_roles = assert_current_scope(jd.company, jd.department, jd.branch, required_roles=SENDER_ROLES)
	if not current_jd_permission(jd, actor, sender_roles):
		frappe.throw(
			_("The captured document requires current read and print permission."), frappe.PermissionError
		)
	emails = {user: check_recipient(jd, user, current=True) for user in ids}
	sender_email = frappe.db.get_value("User", actor, "email", for_update=True)
	if not valid_email(sender_email):
		frappe.throw(_("The sender account needs a valid email address."))
	if prior:
		for row in prior:
			captured = frappe.get_doc(DOCTYPE, row.name)
			assert_current_capture_access(captured, actor)
			assert_current_capture_access(captured, row.recipient)
		return dict(status="Captured locally", captures=[row.name for row in prior], provider_sent=False)

	def permitted(user, position):
		try:
			with quiet_eligibility():
				assert_current_scope(
					jd.company, position.department, position.branch, user=user, capability="read"
				)
			return True
		except frappe.PermissionError:
			return False

	composed, included_scopes = {}, {}
	for user in ids:
		locations = []
		scopes = {(jd.company, jd.department or None, jd.branch or None)}
		for position in positions:
			if (
				position.status != "Active"
				or position.designation != anchor.designation
				or not permitted(user, position)
				or not permitted(actor, position)
			):
				continue
			edge = hierarchy.get(position.name)
			parent = by_name.get(edge.parent_position) if edge else None
			manager = ""
			if parent and permitted(user, parent) and permitted(actor, parent):
				manager = (
					(parent.title_ar or parent.title)
					if language == "ar"
					else (parent.title or parent.title_ar)
				)
				scopes.add((jd.company, parent.department or None, parent.branch or None))
			scopes.add((jd.company, position.department or None, position.branch or None))
			locations.append(
				dict(
					position=position.name,
					department=position.department,
					branch=position.branch,
					manager=manager,
				)
			)
		composed[user] = compose(name, user, emails[user], sender_email, language, kind, note, locations)
		included_scopes[user] = [
			dict(company=c, department=d, branch=b)
			for c, d, b in sorted(scopes, key=lambda x: tuple(v or "" for v in x))
		]
	names = []
	with effect():
		for user in ids:
			mime = composed[user]
			doc = frappe.get_doc(
				dict(
					doctype=DOCTYPE,
					capture_key="KDD-" + hashlib.sha256((group + user).encode()).hexdigest()[:40],
					command_group=group,
					payload_hash=payload,
					company=jd.company,
					department=jd.department,
					branch=jd.branch,
					jd_revision=jd.name,
					sender=actor,
					recipient=user,
					recipient_email=emails[user],
					status="Captured locally",
					language=language,
					output_kind=kind,
					note=note,
					included_scopes_json=json.dumps(included_scopes[user], ensure_ascii=False),
					mime_content=base64.b64encode(mime.encode()).decode("ascii"),
					content_hash=hashlib.sha256(mime.encode()).hexdigest(),
					captured_at=now_datetime(),
				)
			).insert(ignore_permissions=True)
			names.append(doc.name)
			enqueue(
				doc.name,
				user,
				_("Approved document captured locally"),
				_("No email has been sent. Open the captured document to review its HTML and PDF."),
				DOCTYPE,
				doc.name,
			)
		from kandil_hr.foundation.models import record_security_event

		record_security_event(
			"Document captured locally",
			actor,
			json.dumps(
				dict(
					jd=jd.name, revision=jd.revision, recipients=ids, language=language, kind=kind, note=note
				),
				ensure_ascii=False,
			),
			group,
		)
	return dict(status="Captured locally", captures=names, provider_sent=False)


@frappe.whitelist(methods=["GET"])
def download(name):
	guard()
	doc = frappe.get_doc(DOCTYPE, name)
	# Explicit no-share fallback: stale DocShare must not bypass scope denial.
	if not frappe.has_permission(DOCTYPE, "read", doc=doc, ignore_share_permissions=True):
		frappe.throw(_("The captured document is outside your current access scope."), frappe.PermissionError)
	content = mime_bytes(doc.mime_content)
	if hashlib.sha256(content).hexdigest() != doc.content_hash:
		frappe.throw(_("Document capture content does not match its integrity hash."))
	frappe.local.response.filename = quote(doc.name, safe="") + ".eml"
	frappe.local.response.filecontent = content
	frappe.local.response.type = "download"
	frappe.local.response.display_content_as = "attachment"
