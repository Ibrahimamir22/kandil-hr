"""Backup/restore probe for the isolated deployment sandbox only.

Execute with its Bench Python, from sites/. Never imports business data. It creates
one new disposable target and refuses to overwrite an existing target site.
Secrets and backups remain under deployment/.local, never in source evidence.
"""

import hashlib
import json
import os
import subprocess
import uuid
from datetime import UTC, datetime, timezone
from pathlib import Path

import frappe

BENCH = Path("/workspace/frappe-bench")
SOURCE = "kandil-sandbox.localhost"
TARGET = "kandil-restore.localhost"


def run(*args):
	result = subprocess.run(args, cwd=BENCH, capture_output=True, text=True)
	if result.returncode:
		# Restore output may include connection credentials: preserve only privately.
		log = BENCH / "sites" / SOURCE / "private/restore-rehearsal-error.log"
		log.write_text(result.stdout + result.stderr)
		log.chmod(0o600)
		raise RuntimeError("Restore rehearsal step failed; private diagnostic log retained")


def main():
	if not (BENCH / "sites" / SOURCE / "site_config.json").exists():
		raise RuntimeError("This script only runs inside the isolated deployment sandbox")
	if (BENCH / "sites" / TARGET).exists():
		raise RuntimeError("Restore target already exists; refusing to overwrite it")
	os.chdir(BENCH / "sites")
	frappe.init(site=SOURCE)
	frappe.connect()
	frappe.set_user("Administrator")
	if frappe.get_all("Company", pluck="name"):
		raise RuntimeError("Fresh sandbox only: refusing any existing company data")
	if not frappe.conf.get("mute_emails"):
		raise RuntimeError("Outgoing email must be muted")
	marker = "SYNTHETIC RESTORE " + uuid.uuid4().hex
	todo = frappe.get_doc(dict(doctype="ToDo", description=marker, allocated_to="Administrator")).insert()
	file = frappe.get_doc(
		dict(
			doctype="File",
			file_name="restore-probe.txt",
			content=marker,
			is_private=1,
			attached_to_doctype="ToDo",
			attached_to_name=todo.name,
		)
	).insert()
	user = "restore-" + uuid.uuid4().hex[:12] + "@example.invalid"
	frappe.get_doc(
		dict(
			doctype="User", email=user, first_name="Synthetic restore probe", enabled=0, send_welcome_email=0
		)
	).insert()
	from frappe.utils.password import get_decrypted_password, set_encrypted_password

	set_encrypted_password("User", user, marker, "api_secret")
	frappe.db.commit()
	counts = {dt: frappe.db.count(dt) for dt in ["User", "ToDo", "File", "Company"]}
	from frappe.utils.backups import new_backup

	backup = new_backup(ignore_files=False, force=True, verbose=False)
	source_config = json.loads((BENCH / "sites" / SOURCE / "site_config.json").read_text())
	private = BENCH / "sites" / SOURCE / "private/restore-manifest.json"

	def absolute(value):
		return str(Path(value).resolve())

	manifest = {
		"database": absolute(backup.backup_path_db),
		"public": absolute(backup.backup_path_files),
		"private": absolute(backup.backup_path_private_files),
		"config": absolute(backup.backup_path_conf),
	}
	private.write_text(json.dumps(manifest, indent=2))
	private.chmod(0o600)
	frappe.destroy()
	db_secret = Path("/run/secrets/db_password").read_text().strip()
	admin_secret = Path("/run/secrets/admin_password").read_text().strip()
	run(
		"bench",
		"new-site",
		TARGET,
		"--db-root-password",
		db_secret,
		"--admin-password",
		admin_secret,
		"--mariadb-user-host-login-scope=%",
	)
	run(
		"bench",
		"--site",
		TARGET,
		"restore",
		manifest["database"],
		"--db-root-password",
		db_secret,
		"--admin-password",
		admin_secret,
		"--with-public-files",
		manifest["public"],
		"--with-private-files",
		manifest["private"],
	)
	target_config = BENCH / "sites" / TARGET / "site_config.json"
	config = json.loads(target_config.read_text())
	for key in ["encryption_key", "backup_encryption_key"]:
		if source_config.get(key):
			config[key] = source_config[key]
	config.update(mute_emails=1, disable_telemetry=1, pause_scheduler=1)
	target_config.write_text(json.dumps(config, indent=2) + "\n")
	target_config.chmod(0o600)
	run("bench", "--site", TARGET, "disable-scheduler")
	run("bench", "--site", TARGET, "migrate")
	os.chdir(BENCH / "sites")
	frappe.init(site=TARGET)
	frappe.connect()
	frappe.set_user("Administrator")
	actual = {dt: frappe.db.count(dt) for dt in counts}
	assert actual == counts, (counts, actual)
	assert frappe.get_doc("ToDo", todo.name).description == marker
	content = frappe.get_doc("File", file.name).get_content()
	if isinstance(content, bytes):
		content = content.decode()
	assert content == marker
	assert get_decrypted_password("User", user, "api_secret") == marker
	evidence = {
		"checked_at": datetime.now(UTC).isoformat(),
		"status": "passed",
		"source_site": SOURCE,
		"restore_site": TARGET,
		"checks": [
			"Database counts and original record IDs retained",
			"Private file bytes restored",
			"Encrypted password decrypts with securely restored encryption key",
			"Restored site migrates with current source",
			"Email muted and scheduler disabled",
		],
		"counts": actual,
		"apps": frappe.get_installed_apps(),
		"limitations": [
			"Synthetic blank-company sandbox only",
			"Current dirty custom checkout; final release restore must reference tested commit",
			"No production disaster-recovery timing or offsite storage proof",
		],
	}
	frappe.destroy()
	output = BENCH.parent / "restore-evidence.json"
	output.write_text(json.dumps(evidence, indent=2) + "\n")
	print(json.dumps(evidence))


if __name__ == "__main__":
	main()
