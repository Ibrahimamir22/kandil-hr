"""Native administrative records; trusted server effects use a narrow context flag."""

from contextlib import contextmanager

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today

from kandil_hr.foundation.security import enabled
from kandil_hr.pilot.models import KandilDelegation as PilotDelegation


@contextmanager
def effect():
	old = frappe.flags.get("kandil_foundation_effect")
	frappe.flags.kandil_foundation_effect = True
	try:
		yield
	finally:
		frappe.flags.kandil_foundation_effect = old


def guard():
	if not enabled():
		frappe.throw(_("Kandil HR foundation is not enabled on this site."), frappe.PermissionError)


def record_security_event(action, target_user, changed_fields="", reference=None):
	with effect():
		return frappe.get_doc(
			{
				"doctype": "Kandil Security Event",
				"action": action,
				"target_user": target_user,
				"actor": frappe.session.user,
				"changed_fields": changed_fields,
				"reference": reference,
			}
		).insert(ignore_permissions=True)


class KandilAccessGrant(Document):
	def validate(self):
		guard()
		if "System Manager" not in frappe.get_roles():
			frappe.throw(_("Only System Managers may administer access grants."), frappe.PermissionError)
		old = self.get_doc_before_save()
		if self.user in ("Guest", "Administrator") or (
			not self.revoked and not frappe.db.get_value("User", self.user, "enabled")
		):
			frappe.throw(_("Select an enabled ordinary user for the access grant."))
		if self.department and frappe.db.get_value("Department", self.department, "company") != self.company:
			frappe.throw(_("The department must belong to the selected company."))
		if self.valid_until and getdate(self.valid_until) < getdate(self.valid_from):
			frappe.throw(_("Access expiry cannot precede its start date."))
		if old:
			fields = [
				"user",
				"company",
				"department",
				"branch",
				"valid_from",
				"valid_until",
				"can_manage_recruitment",
				"can_view_sensitive",
				"reason",
			]
			if any(self.has_value_changed(f) for f in fields) or (old.revoked and not self.revoked):
				frappe.throw(_("Access grants are immutable. Revoke this grant and create a new one."))

	def on_update(self):
		old = self.get_doc_before_save()
		if not old or self.revoked != old.revoked:
			record_security_event(
				"Access grant revoked" if self.revoked else "Access grant created",
				self.user,
				reference=self.name,
			)

	def on_trash(self):
		frappe.throw(_("Revoke access grants instead of deleting their history."))


class KandilSecurityEvent(Document):
	def validate(self):
		guard()
		if not frappe.flags.get("kandil_foundation_effect") or not self.is_new():
			frappe.throw(
				_("Security events are server-generated and cannot be edited."), frappe.PermissionError
			)

	def on_trash(self):
		frappe.throw(_("Security events cannot be deleted through the application."))


class KandilNotificationOutbox(Document):
	def autoname(self):
		self.name = self.dedupe_name

	def validate(self):
		guard()
		if not frappe.flags.get("kandil_foundation_effect"):
			frappe.throw(_("Notification outbox records are managed by the server."), frappe.PermissionError)

	def on_trash(self):
		frappe.throw(_("Notification history cannot be deleted through the application."))


class KandilBusinessCalendar(Document):
	def validate(self):
		guard()
		values = [v.strip() for v in (self.weekend_days or "").split(",") if v.strip()]
		if any(not v.isdigit() or int(v) not in range(7) for v in values) or len(set(values)) == 7:
			frappe.throw(
				_(
					"Weekend days must be comma-separated numbers from 0 (Monday) to 6 (Sunday), with a working day remaining."
				)
			)
		self.weekend_days = ",".join(str(v) for v in sorted({int(v) for v in values}))


class KandilSecurityPolicy(Document):
	def validate(self):
		guard()
		if self.mfa_requirement not in (
			"Not reviewed",
			"Required for privileged users",
			"Required for all HR users",
		):
			frappe.throw(_("Select a supported MFA policy."))
		# This records a decision only; it does not pretend that MFA is configured.
		if self.mfa_requirement != "Not reviewed" and not self.policy_owner:
			frappe.throw(_("Assign an owner to the authentication policy."))


def working_deadline(calendar_name, start, days):
	from kandil_hr.foundation.business_calendar import company_deadline

	calendar = frappe.get_doc("Kandil Business Calendar", calendar_name)
	calendar.check_permission("read")
	return company_deadline(calendar.company, start, days, calendar.name)


class KandilDelegation(PilotDelegation):
	def validate(self):
		if not frappe.conf.get("kandil_parity_enabled"):
			return super().validate()
		from kandil_hr.foundation.delegation import validate

		validate(self)

	def on_update(self):
		if frappe.conf.get("kandil_parity_enabled"):
			from kandil_hr.foundation.delegation import audit

			audit(self)
