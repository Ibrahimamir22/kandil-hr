"""Private, CLI-only session acceptance fixture. Never returns credentials.

Native User.save disables accounts; expiry is a controlled old timestamp on
only this UUID account's real native session in both Redis and Sessions table.
No System Settings or provider/MFA configuration is changed.
"""

import json
import os
import secrets
import uuid
from pathlib import Path

import frappe

from kandil_hr.foundation.concurrency_runner import _guard


def manifest():
	_guard()
	if not frappe.conf.get("mute_emails"):
		raise RuntimeError("Synthetic identity checks require muted emails")
	return Path(frappe.get_site_path("private", "security-session-probe.json"))


def load():
	data = json.loads(manifest().read_text())
	if data.get("site") != frappe.local.site or not data.get("prefix", "").startswith("session-probe-"):
		raise RuntimeError("Invalid synthetic session fixture")
	return data


def prepare():
	path = manifest()
	if path.exists():
		raise RuntimeError("Session fixture exists; clean up that run first")
	prefix = "session-probe-" + uuid.uuid4().hex
	data = dict(site=frappe.local.site, prefix=prefix, credentials={})
	for key in ("enabled", "disabled", "expired"):
		data["credentials"][key] = dict(
			email=f"{prefix}-{key}@example.invalid", password=secrets.token_urlsafe(24)
		)
	path.write_text(json.dumps(data))
	os.chmod(path, 0o600)
	for key, credential in data["credentials"].items():
		frappe.get_doc(
			dict(
				doctype="User",
				email=credential["email"],
				first_name="Synthetic " + key + " session",
				enabled=1,
				user_type="System User",
				send_welcome_email=0,
				new_password=credential["password"],
				language="en",
				roles=[dict(role="Kandil Recruiter")],
			)
		).insert(ignore_permissions=True)
	frappe.db.commit()
	return dict(prepared=3, private_credentials=True)


def rollback_disable():
	data = load()
	user = data["credentials"]["enabled"]["email"]
	before = frappe.db.count("Sessions", {"user": user})
	if not before:
		raise RuntimeError("Authenticate enabled fixture before rollback proof")
	frappe.db.savepoint("before_account_disable")
	doc = frappe.get_doc("User", user)
	doc.enabled = 0
	doc.save(ignore_permissions=True)
	# Exercise both callback cancellation on full rollback and persisted-state
	# recheck after savepoint rollback followed by a successful outer commit.
	frappe.db.rollback(save_point="before_account_disable")
	frappe.db.commit()
	if (
		not frappe.db.get_value("User", user, "enabled")
		or frappe.db.count("Sessions", {"user": user}) != before
	):
		raise AssertionError("Rolled-back disable revoked valid native sessions")
	doc = frappe.get_doc("User", user)
	doc.enabled = 0
	doc.save(ignore_permissions=True)
	frappe.db.rollback()
	frappe.db.commit()
	if (
		not frappe.db.get_value("User", user, "enabled")
		or frappe.db.count("Sessions", {"user": user}) != before
	):
		raise AssertionError("Full rollback revoked valid native sessions")
	return dict(savepoint_and_full_rollback_preserve_session=True)


def revoke():
	data = load()
	user = frappe.get_doc("User", data["credentials"]["disabled"]["email"])
	user.enabled = 0
	user.save(ignore_permissions=True)
	frappe.db.commit()
	if frappe.db.count("Sessions", {"user": user.name}):
		raise AssertionError("Committed disable retained native Sessions rows")
	user = data["credentials"]["expired"]["email"]
	sessions = frappe.db.sql("SELECT sid,sessiondata FROM `tabSessions` WHERE user=%s", (user,), as_dict=True)
	if not sessions:
		raise RuntimeError("Authenticate expired-session fixture before expiring it")
	for row in sessions:
		payload = frappe.parse_json(row.sessiondata)
		payload.update(last_updated="2000-01-01 00:00:00", session_expiry="00:00:01")
		frappe.db.sql(
			"UPDATE `tabSessions` SET lastupdate=%s,sessiondata=%s WHERE sid=%s AND user=%s",
			("2000-01-01 00:00:00", frappe.as_json(payload), row.sid, user),
		)
		cached = frappe.cache.hget("session", row.sid)
		if cached:
			cached["data"].update(payload)
			frappe.cache.hset("session", row.sid, cached)
	frappe.db.commit()
	return dict(disabled=1, expired_sessions=len(sessions), global_settings_changed=False)


def cleanup():
	data = load()
	from frappe.sessions import clear_sessions

	for identity in data["credentials"].values():
		user = identity["email"]
		if not user.startswith(data["prefix"]) or not user.endswith("@example.invalid"):
			raise RuntimeError("Refusing non-fixture cleanup")
		clear_sessions(user=user, force=True)
		frappe.db.delete("Kandil Security Event", {"target_user": user})
		frappe.db.delete("Activity Log", {"user": user})
		frappe.db.delete("Notification Log", {"for_user": user})
		if frappe.db.exists("User", user):
			frappe.delete_doc("User", user, ignore_permissions=True, force=True)
	frappe.db.commit()
	assert not any(frappe.db.exists("User", x["email"]) for x in data["credentials"].values())
	manifest().unlink()
	return dict(cleaned=3, sessions_removed=True, private_manifest_removed=True)
