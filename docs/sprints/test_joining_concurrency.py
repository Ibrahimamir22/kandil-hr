#!/usr/bin/env python3
"""20-way ordinary-session HTTP joining proof, then dated-occupancy replay.

Requires root's exclusive parity DB lease. Uses a fresh private UUID fixture;
never selects existing company data. No real email/provider. This is a bounded
HTTP race proof, not throughput certification or complete joining acceptance.
"""

import argparse
import copy
import datetime
import hashlib
import json
import subprocess
import uuid
from pathlib import Path

import test_concurrency as http

APP = Path(__file__).resolve().parents[2]
DEV_ROOT = Path(__file__).resolve().parents[6]
SITE = "kandil-parity.localhost"
FIXTURE = "kandil_hr.recruitment.joining_concurrency_fixture"
METHOD = "kandil_hr.pilot.api.record_outcome"


def bench(action, run_id):
	result = subprocess.run(
		[
			"docker",
			"compose",
			"exec",
			"-T",
			"-w",
			"/workspace/frappe-bench",
			"frappe",
			"bench",
			"--site",
			SITE,
			"execute",
			FIXTURE + "." + action,
			"--kwargs",
			json.dumps({"run_id": run_id}),
		],
		cwd=DEV_ROOT,
		capture_output=True,
		text=True,
		timeout=180,
	)
	if result.returncode:
		raise RuntimeError(
			"Private joining fixture " + action + " failed; inspect locally without exposing credentials"
		)
	lines = [line for line in result.stdout.splitlines() if line.startswith("{")]
	if not lines:
		raise RuntimeError("Joining fixture returned no structured evidence")
	return json.loads(lines[-1])


def hashes():
	value = http.source_hashes()
	for relative in ["docs/sprints/test_joining_concurrency.py", "docs/sprints/test_concurrency.py"]:
		value[relative] = hashlib.sha256((APP / relative).read_bytes()).hexdigest()
	return value


def equal_results(results):
	assert all(row["status"] == 200 for row in results), "Concurrent joining/replay returned an HTTP error"
	bodies = [json.dumps(row["body"].get("message"), sort_keys=True) for row in results]
	assert len(set(bodies)) == 1, "Joining requests returned different results"
	value = results[0]["body"].get("message")
	assert all(value.get(key) for key in ("employee", "assignment", "onboarding")), (
		"Joining result omitted an original effect link"
	)
	return value


def main(output):
	run_id = uuid.uuid4().hex[:12]
	manifest = (
		DEV_ROOT / "development/frappe-bench/sites" / SITE / "private" / f"kandil-browser-{run_id}.json"
	)
	evidence = dict(
		run_id=run_id,
		site=SITE,
		checked_at=datetime.datetime.now(datetime.UTC).isoformat(),
		status="RUNNING",
		checks=[],
		source_hashes_before=hashes(),
		limits=[
			"20 concurrent ordinary HR session POSTs; separate HTTP connections/transactions, not instrumented DB connection IDs",
			"Later ended-episode state uses an explicit CLI-only synthetic historical seed, not an authorized backdated product edit",
			"No external email, payroll or production load claim; immutable synthetic audit and joined history retained",
		],
	)
	try:
		bench("prepare", run_id)
		if manifest.stat().st_mode & 0o077:
			raise AssertionError("Private fixture credentials have unsafe file permissions")
		data = json.loads(manifest.read_text())
		actor = http.Actor(data["users"]["hr"])
		before = bench("inspect", run_id)
		payload = data["joining"]["payload"]
		results, peak = http.batch(actor, METHOD, [copy.deepcopy(payload) for _ in range(20)])
		group = dict(
			name="20 same-offer original joining calls create one effect set",
			**http.sanitized_batch(results, peak),
		)
		evidence["checks"].append(group)
		first = equal_results(results)
		after = bench("inspect", run_id)
		delta = http.counts_delta(after["counts"], before["counts"])
		for key in (
			"Employee",
			"Kandil Position Assignment",
			"Employee Onboarding",
			"Kandil Command Audit",
			"Kandil Request Revision",
			"Kandil Recruitment Event",
		):
			assert delta[key] == 1, "Concurrent joining duplicated or omitted an effect: " + key
		assert after["counts"]["Kandil Command Audit"] == 1, (
			"Joining must produce exactly one original-outcome audit"
		)
		assert after["line"]["joined_qty"] == before["line"]["joined_qty"] + 1, (
			"Joined line quantity advanced more than once"
		)
		assert after["ledger"]["occupied"] == before["ledger"]["occupied"] + 1, (
			"Occupied seats advanced more than once"
		)
		assert after["ledger"]["open_slots"] == before["ledger"]["open_slots"] - 1, (
			"Open seats were not converted exactly once"
		)
		assert after["ledger"]["reserved"] == before["ledger"]["reserved"], (
			"Joining changed unrelated reservations"
		)
		assert after["ledger"]["available"] == before["ledger"]["available"], (
			"Open-to-occupied transfer changed available seats"
		)
		group.update(
			status="PASS",
			effect_delta=delta,
			ledger=after["ledger"],
			result_hash=hashlib.sha256(json.dumps(first, sort_keys=True).encode()).hexdigest(),
		)
		seed = bench("seed_ended_episode", run_id)
		before_replay = bench("inspect", run_id)
		assert seed["recorded_occupied"] == 1 and seed["current_assignment_occupied"] == 0, (
			"Dated replay fixture has no actual occupancy discrepancy"
		)
		results, peak = http.batch(actor, METHOD, [copy.deepcopy(payload) for _ in range(20)])
		group = dict(
			name="20 later replays preserve original result and complete stored state despite dated occupancy drift",
			**http.sanitized_batch(results, peak),
		)
		evidence["checks"].append(group)
		assert equal_results(results) == first, "Later replay returned a different effect set"
		after_replay = bench("inspect", run_id)
		assert after_replay == before_replay, "Replay mutated ledger, request, offer, audit or effect counts"
		group.update(
			status="PASS", counts=after_replay["counts"], unchanged_state=True, historical_fixture=seed
		)
		evidence["status"] = "PASS"
	except Exception as exc:
		evidence["status"] = "FAIL"
		evidence["failure_type"] = type(exc).__name__
		if isinstance(exc, (AssertionError, RuntimeError)):
			evidence["failure"] = str(exc)[:260]
		# Raw server response/tracebacks and credentials never enter evidence.
	finally:
		if manifest.exists():
			try:
				result = bench("cleanup", run_id)
				evidence["cleanup"] = {
					key: result[key] for key in ("cleaned", "disabled_users", "ledger", "audit_retained")
				}
			except Exception as exc:
				evidence["status"] = "FAIL"
				evidence["cleanup_error"] = type(exc).__name__
		evidence["source_hashes_after"] = hashes()
		evidence["source_unchanged_during_run"] = (
			evidence["source_hashes_before"] == evidence["source_hashes_after"]
		)
		if not evidence["source_unchanged_during_run"]:
			evidence["status"] = "FAIL"
		evidence["finished_at"] = datetime.datetime.now(datetime.UTC).isoformat()
		output.parent.mkdir(parents=True, exist_ok=True)
		if output.exists():
			raise RuntimeError("Refusing to overwrite prior joining HTTP evidence; choose a fresh --output")
		output.write_text(json.dumps(evidence, indent=2) + "\n")
		print(
			json.dumps(
				{key: value for key, value in evidence.items() if not key.startswith("source_hashes")},
				indent=2,
			)
		)
	return 0 if evidence["status"] == "PASS" else 1


if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument("--output", type=Path, required=True)
	args = parser.parse_args()
	if args.output.exists():
		raise SystemExit("Choose a new evidence path; prior attempts must remain")
	raise SystemExit(main(args.output))
