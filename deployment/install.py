"""Install a pinned local sandbox. Does not update existing checkouts or other sites."""

import hashlib
import json
import os
import subprocess
from pathlib import Path

SOURCE = Path("/opt/kandil-source")
BASE = Path("/workspace")
BENCH = BASE / "frappe-bench"
SITE = "kandil-sandbox.localhost"
LOCK = json.loads((SOURCE / "deployment/versions.lock.json").read_text())


def run(*args, cwd=BASE, private=False):
	result = subprocess.run(
		args,
		cwd=cwd,
		stdout=subprocess.PIPE if private else None,
		stderr=subprocess.PIPE if private else None,
		text=True,
	)
	if result.returncode:
		raise RuntimeError(
			f"Installation step failed: {args[0]} (exit {result.returncode}); private arguments/output omitted"
		)


def output(*args, cwd=BASE):
	return subprocess.check_output(args, cwd=cwd, text=True).strip()


def stage(name):
	item = LOCK["apps"][name]
	p = BASE / "pinned-sources" / name
	p.parent.mkdir(exist_ok=True)
	# Docker Desktop bind mounts retain host ownership. Trust only these known sandbox paths.
	run("git", "config", "--global", "--add", "safe.directory", str(p))
	run("git", "config", "--global", "--add", "safe.directory", str(BENCH / "apps" / name))
	if not p.exists():
		p.mkdir()
		run("git", "init", str(p))
		run("git", "-C", str(p), "remote", "add", "origin", item["url"])
	head = subprocess.run(
		["git", "-C", str(p), "rev-parse", "--verify", "HEAD"], capture_output=True, text=True
	)
	if head.returncode:
		# Resume an interrupted initial fetch; never reset an existing checkout.
		run("git", "-C", str(p), "fetch", "--depth", "1", "origin", item["commit"])
		run("git", "-C", str(p), "checkout", "-b", "kandil-pinned", item["commit"])
	if output("git", "-C", str(p), "rev-parse", "HEAD") != item["commit"]:
		raise RuntimeError("Pinned source mismatch; manual repair required: " + name)
	return p


for name in LOCK["apps"]:
	stage(name)
if not BENCH.exists():
	run(
		"bench",
		"init",
		"--skip-redis-config-generation",
		"--frappe-path",
		str(stage("frappe")),
		"--frappe-branch",
		"kandil-pinned",
		"--python",
		"/home/frappe/.pyenv/shims/python3",
		"frappe-bench",
	)
for name, item in LOCK["apps"].items():
	p = BENCH / "apps" / name
	if not p.exists():
		run("bench", "get-app", "--branch", "kandil-pinned", str(stage(name)), cwd=BENCH)
	if output("git", "-C", str(p), "rev-parse", "HEAD") != item["commit"]:
		raise RuntimeError("Existing app version differs; refusing upgrade: " + name)
config = BENCH / "sites/common_site_config.json"
settings = json.loads(config.read_text())
settings.update(
	db_host="mariadb",
	redis_cache="redis://redis-cache:6379",
	redis_queue="redis://redis-queue:6379",
	redis_socketio="redis://redis-queue:6379",
	socketio_port=9110,
	serve_default_site=True,
)
config.write_text(json.dumps(settings, indent=2) + "\n")
proc = BENCH / "Procfile"
lines = proc.read_text().splitlines()
proc.write_text(
	"\n".join(
		line for line in lines if not line.startswith(("redis_cache:", "redis_queue:", "redis_socketio:"))
	)
	+ "\n"
)
if not (BENCH / "apps/kandil_hr").exists():
	run("bench", "get-app", "--soft-link", str(SOURCE), cwd=BENCH)
if not (BENCH / "sites" / SITE / "site_config.json").exists():
	run(
		"bench",
		"new-site",
		SITE,
		"--db-root-password",
		Path("/run/secrets/db_password").read_text().strip(),
		"--admin-password",
		Path("/run/secrets/admin_password").read_text().strip(),
		"--mariadb-user-host-login-scope=%",
		cwd=BENCH,
		private=True,
	)
for key, value in [("mute_emails", "1"), ("disable_telemetry", "1"), ("host_name", "http://localhost:8110")]:
	run("bench", "--site", SITE, "set-config", key, value, cwd=BENCH)
installed = json.loads(output("bench", "--site", SITE, "list-apps", "--format", "json", cwd=BENCH)).get(
	SITE, []
)
for app in ["erpnext", "hrms", "kandil_hr"]:
	if app not in installed:
		run("bench", "--site", SITE, "install-app", app, cwd=BENCH)
run("bench", "use", SITE, cwd=BENCH)
# Re-running does not migrate or update an existing site. Explicit reviewed migrations are separate.
run("bench", "build", "--app", "kandil_hr", cwd=BENCH)
run("bench", "--site", SITE, "disable-scheduler", cwd=BENCH)
print(
	"Pinned local sandbox installed. http://localhost:8110; synthetic testing only; enhanced workflows require explicit test configuration."
)
