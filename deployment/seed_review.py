"""Persistent SYNTHETIC manual-review fixtures; exact parity site only.

Uses the same fixture builder as native recruitment tests, then commits explicitly
for browser review. Never run on a business site. No outbound communication.
Credentials are generated locally and saved only to ignored private local state.
"""

import json
import secrets
from pathlib import Path

import frappe
from frappe.utils.password import update_password

from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as


def run():
	if frappe.local.site != "kandil-parity.localhost" or not frappe.conf.get("allow_tests"):
		raise RuntimeError("Manual fixtures require the isolated parity test site")
	if not frappe.conf.get("mute_emails"):
		raise RuntimeError("Mute outbound email before creating manual review fixtures")
	path = Path(frappe.get_site_path("private", "kandil-review.json"))
	if path.exists():
		data = json.loads(path.read_text())
		return {"status": "Existing fixtures preserved", "requests": data["requests"]}
	if any("TEST" not in name for name in frappe.get_all("Company", pluck="name")):
		raise RuntimeError("Only synthetic TEST companies are allowed")
	t = TestRecruitmentCommands()
	t.setUp()
	draft = t.request((2, 1))
	pending = t.request((1, 1))
	t.submit(pending.name)
	approved = t.request((2, 1))
	t.submit(approved.name)
	t.approve_all(approved.name)
	frappe.set_user("Administrator")
	credentials = {}
	for key, email in t.users.items():
		password = secrets.token_urlsafe(24)
		update_password(email, password, logout_all_sessions=True)
		user = frappe.get_doc("User", email)
		user.language = "en"
		user.save(ignore_permissions=True)
		credentials[key] = {"email": email, "password": password}
	# Ordinary account deliberately has no grant to this request's company/department.
	outsider = t.prefix.lower() + "-outsider@example.invalid"
	t.insert(
		"User",
		email=outsider,
		first_name="Synthetic restricted reviewer",
		enabled=1,
		send_welcome_email=0,
		user_type="System User",
		roles=[{"role": "Kandil Recruiter"}],
	)
	password = secrets.token_urlsafe(24)
	update_password(outsider, password, logout_all_sessions=True)
	credentials["outsider"] = {"email": outsider, "password": password}
	data = {
		"site": frappe.local.site,
		"base_url": "http://localhost:8102",
		"company": t.company,
		"department": t.department,
		"credentials": credentials,
		"requests": {"draft": draft.name, "pending": pending.name, "approved": approved.name},
		"capacities": t.capacities,
		"positions": t.positions,
		"prefix": t.prefix,
	}
	# Do not call unittest cleanup: this is the explicitly persistent review fixture.
	frappe.db.commit()
	path.parent.mkdir(exist_ok=True)
	path.write_text(json.dumps(data, indent=2))
	path.chmod(0o600)
	t.flags_patch.stop()
	frappe.set_user("Administrator")
	return {
		"status": "Synthetic review fixtures created",
		"requests": data["requests"],
		"credentials": "private/kandil-review.json (not committed)",
	}
