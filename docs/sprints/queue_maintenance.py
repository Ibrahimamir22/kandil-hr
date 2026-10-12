"""CLI-only inventory and narrowly bounded stale synthetic contact-job cleanup.

No global queue purge, job execution, real-user deletion or database mutation.
Default mode is read-only. Output never contains job kwargs or serialized Users.
"""

import hashlib
import re
from collections import Counter
from datetime import UTC, datetime

import frappe

SITE = "kandil-parity.localhost"
METHOD = "frappe.core.doctype.user.user.create_contact"


def guard():
	if (
		frappe.local.site != SITE
		or frappe.session.user != "Administrator"
		or getattr(frappe.local, "request", None)
		or not frappe.conf.get("allow_tests")
	):
		raise RuntimeError("Queue maintenance requires isolated parity Administrator CLI test context")


def label(value):
	return (
		value
		if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_.:-]{1,160}", value)
		else "<nonstandard>"
	)


def user_name(job):
	args = job.kwargs
	if not isinstance(args, dict) or args.get("site") != SITE or args.get("method") != METHOD:
		return None
	if job.func_name != "frappe.utils.background_jobs.execute_job":
		return None
	payload = args.get("kwargs")
	if not isinstance(payload, dict):
		return None
	user = payload.get("user")
	name = user.get("name") if isinstance(user, dict) else getattr(user, "name", None)
	if not isinstance(name, str) or not re.fullmatch(r"(?:rec-|org-)[a-z0-9_-]+@example\.invalid", name):
		return None
	return name


def missing_user(name):
	# Current read, not a repeatable-read snapshot from an earlier inventory pass.
	return not frappe.db.sql("SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE", (name,))


def run(cleanup=False):
	guard()
	if not isinstance(cleanup, bool):
		raise ValueError("cleanup must be an explicit boolean")
	from frappe.utils.background_jobs import get_queues

	counts = Counter()
	stats = Counter()
	deleted = []
	for queue in get_queues():
		for job_id in queue.get_job_ids():
			stats["queued_ids_seen"] += 1
			job = queue.fetch_job(job_id)
			if job is None:
				stats["missing_job_records"] += 1
				continue
			args = job.kwargs if isinstance(job.kwargs, dict) else {}
			counts[(label(args.get("site")), label(args.get("method")))] += 1
			name = user_name(job)
			if not name or job.get_status(refresh=True) != "queued" or not missing_user(name):
				continue
			stats["eligible_stale_synthetic_contacts"] += 1
			if not cleanup:
				continue
			# Reload job metadata and recheck site/method/user/status immediately
			# before mutation. Never remove a started job or a live User's job.
			job.refresh()
			if user_name(job) != name or job.get_status(refresh=True) != "queued" or not missing_user(name):
				stats["changed_before_cleanup"] += 1
				continue
			# LREM is atomic: if a worker already dequeued this ID, remove returns
			# zero and the worker-owned job is left alone. Only our removed queued
			# entry can proceed to standard RQ Job.delete.
			if queue.remove(job_id) != 1:
				stats["already_dequeued"] += 1
				continue
			if job.get_status(refresh=True) != "queued":
				stats["changed_after_queue_removal"] += 1
				continue
			job.delete()
			deleted.append(hashlib.sha256(job_id.encode()).hexdigest())
	return dict(
		mode="cleanup" if cleanup else "inventory",
		checked_at=datetime.now(UTC).isoformat(),
		counts_by_site_method=[
			dict(site=site, method=method, count=count) for (site, method), count in sorted(counts.items())
		],
		statistics=dict(stats),
		deleted_count=len(deleted),
		deleted_job_id_sha256=deleted,
	)
