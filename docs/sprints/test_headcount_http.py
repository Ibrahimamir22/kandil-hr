#!/usr/bin/env python3
"""Opt-in parity ordinary-session HTTP gate. No browser or production-load claim.

Run only after root grants the exclusive DB lease and restarts parity-web:
python3 development/frappe-bench/apps/kandil_hr/docs/sprints/test_headcount_http.py
Credentials stay in the ignored 0600 manifest. Each inspection uses a fresh bench
process/connection. All synthetic requests are cancelled and users disabled.
"""

import concurrent.futures
import datetime
import json
import subprocess
import threading
import traceback
import uuid
from pathlib import Path

from test_concurrency import APP, DEV_ROOT, SITE, Actor, batch, sanitized_batch, source_hashes

FIXTURE = "kandil_hr.recruitment.headcount_http_fixture"
SUBMIT = "kandil_hr.recruitment.api.submit_request"
REVISE = "kandil_hr.recruitment.pending_revision.revise_pending_quantities"
DECIDE = "kandil_hr.recruitment.api.decide"
OUTPUT = APP / "docs/sprints/evidence/headcount-http-2026-10-12.json"


def bench(action, run_id, **kwargs):
	result = subprocess.run(
		[
			"docker",
			"compose",
			"exec",
			"-T",
			"-w",
			"/workspace/frappe-bench",
			"parity-web",
			"bench",
			"--site",
			SITE,
			"execute",
			FIXTURE + "." + action,
			"--kwargs",
			json.dumps(dict(run_id=run_id, **kwargs)),
		],
		cwd=DEV_ROOT,
		capture_output=True,
		text=True,
		timeout=240,
	)
	if result.returncode:
		raise RuntimeError("Private fixture " + action + " failed; do not publish raw traceback/credentials")
	lines = [line for line in result.stdout.splitlines() if line.startswith("{")]
	if not lines:
		raise RuntimeError("Fixture returned no JSON")
	return json.loads(lines[-1])


def call(actor, method, payload):
	result = actor.call(method, payload, threading.Barrier(1))
	assert result["status"] < 500, "Unexpected HTTP server failure"
	return result


def message(result):
	assert result["status"] == 200, "Expected controlled HTTP 200 domain outcome"
	return result["body"]["message"]


def submit_payload(doc, command_id=None):
	return dict(name=doc["name"], command_id=command_id or uuid.uuid4().hex, expected_version=doc["modified"])


def revision_payload(doc, quantity):
	return dict(
		**submit_payload(doc),
		quantities={row["name"]: quantity for row in doc["lines"]},
		reason="Synthetic HTTP pending reservation revision",
		exception_reason="Valid synthetic shortage explanation",
	)


def event_for(state, response):
	matches = [row for row in state["security_events"] if row["name"] == response["event"]]
	assert len(matches) == 1, "Committed denial not found through independent connection"
	return matches[0]


def assert_denial(run_id, result, before, key, requester):
	outcome = message(result)
	assert outcome["outcome"] == "denied" and outcome["code"] and outcome["message"] and outcome["event"]
	after = bench("inspect", run_id)
	assert after["requests"][key] == before["requests"][key], "Denied request/steps/receipts/outbox mutated"
	assert after["capacities"] == before["capacities"], "Denied command mutated capacity"
	event = event_for(after, outcome)
	assert event["actor"] == requester, "Denial actor not authenticated requester"
	assert isinstance(event["payload"], dict), "Denial lacks structured audit data"
	return after, outcome, event


def main():
	run_id = uuid.uuid4().hex[:12]
	evidence = dict(
		run_id=run_id,
		site=SITE,
		checked_at=datetime.datetime.now(datetime.UTC).isoformat(),
		status="RUNNING",
		source_hashes_before=source_hashes(),
		checks=[],
		limits=[
			"Local ordinary password/CSRF HTTP connections; no browser UI proof.",
			"No provider calls. Synthetic company only; immutable audit retained.",
			"No production capacity/performance certification.",
		],
	)
	manifest = (
		DEV_ROOT / "development/frappe-bench/sites" / SITE / "private" / f"kandil-browser-{run_id}.json"
	)
	try:
		bench("prepare", run_id)
		assert not manifest.stat().st_mode & 0o077, "Private manifest permissions too broad"
		data = json.loads(manifest.read_text())
		actors = {key: Actor(data["users"][key]) for key in ["requester", "sector", "hr"]}
		actor = actors["requester"]
		requester = data["users"]["requester"]["email"]
		before = bench("inspect", run_id)
		payload = revision_payload(before["requests"]["replay"], 3)
		results, peak = batch(actor, REVISE, [payload] * 20)
		replies = [message(result) for result in results]
		assert all(reply.get("outcome") != "denied" for reply in replies)
		assert all(reply == replies[0] for reply in replies), "Same command did not replay identical result"
		after = bench("inspect", run_id)
		assert after["capacities"]["replay"] == dict(
			structural=3, occupied=0, reserved=3, open_slots=0, available=0
		)
		assert after["requests"]["replay"]["revision"] == before["requests"]["replay"]["revision"] + 1
		for kind in ("Kandil Command Receipt", "Kandil Command Audit"):
			assert (
				after["requests"]["replay"]["counts"][kind]
				== before["requests"]["replay"]["counts"][kind] + 1
			)
		evidence["checks"].append(
			dict(
				name="Twenty simultaneous identical own2-to3 commands: one delta and one receipt/audit",
				status="PASS",
				**sanitized_batch(results, peak),
			)
		)

		before = bench("inspect", run_id)
		commands = [
			(REVISE, revision_payload(before["requests"]["race"], 3)),
			(SUBMIT, submit_payload(before["requests"]["race_other"])),
		]
		barrier = threading.Barrier(2)
		with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
			results = list(pool.map(lambda item: actor.call(item[0], item[1], barrier), commands))
		evidence["race_http_statuses"] = [result["status"] for result in results]
		replies = [message(result) for result in results]
		assert sum(reply.get("outcome") == "denied" for reply in replies) == 1
		after = bench("inspect", run_id)
		assert after["capacities"]["race"] == dict(
			structural=3, occupied=0, reserved=3, open_slots=0, available=0
		)
		denied_index = next(i for i, reply in enumerate(replies) if reply.get("outcome") == "denied")
		denied_key = ("race", "race_other")[denied_index]
		assert after["requests"][denied_key] == before["requests"][denied_key]
		event = event_for(after, replies[denied_index])
		assert event["actor"] == requester
		assert max(r["start"] for r in results) < min(r["end"] for r in results), (
			"Race HTTP intervals did not overlap"
		)
		evidence["checks"].append(
			dict(
				name="Pending increase versus separate last-seat submission: one admitted, one committed denial",
				status="PASS",
				statuses=[r["status"] for r in results],
				denied_command=commands[denied_index][0],
				ledger=after["capacities"]["race"],
				denial_event=event["name"],
			)
		)

		before = bench("inspect", run_id)
		payload = revision_payload(before["requests"]["revision_denied"], 5)
		after, denied, event = assert_denial(
			run_id, call(actor, REVISE, payload), before, "revision_denied", requester
		)
		replay = message(call(actor, REVISE, payload))
		assert replay == denied
		replay_state = bench("inspect", run_id)
		assert replay_state == after
		conflict = call(actor, REVISE, dict(payload, quantities={key: 4 for key in payload["quantities"]}))
		assert conflict["status"] in (400, 403, 409, 417, 422), (
			"Changed-payload reuse did not fail explicitly"
		)
		assert bench("inspect", run_id) == after
		evidence["checks"].append(
			dict(
				name="Denied pending revision durable/replay stable/changed-payload conflict",
				status="PASS",
				conflict_status=conflict["status"],
				denial_event=event["name"],
			)
		)

		denials = {}
		for key in ("block_blank", "block_valid"):
			before = bench("inspect", run_id)
			payload = submit_payload(before["requests"][key])
			after, denied, event = assert_denial(run_id, call(actor, SUBMIT, payload), before, key, requester)
			assert message(call(actor, SUBMIT, payload)) == denied
			assert bench("inspect", run_id) == after
			denials[key] = dict(payload=payload, denied=denied, audit=event)
		assert denials["block_blank"]["denied"]["code"] == denials["block_valid"]["denied"]["code"], (
			"BLOCK depended on reason validity"
		)
		evidence["checks"].append(
			dict(
				name="Same3/1 shortage BLOCK denies blank and valid reason with durable replayable audit",
				status="PASS",
				events=[row["denied"]["event"] for row in denials.values()],
			)
		)


		before = bench("inspect", run_id)
		duplicate_results, peak = batch(actor, SUBMIT, [denials["block_blank"]["payload"]] * 20)
		assert all(message(row) == denials["block_blank"]["denied"] for row in duplicate_results)
		assert bench("inspect", run_id) == before, "Denied retries created additional events or business effects"
		unauthorized = call(actors["hr"], SUBMIT, denials["block_blank"]["payload"])
		assert unauthorized["status"] == 403, "Different actor replay was not denied"
		assert denials["block_blank"]["denied"]["event"] not in json.dumps(unauthorized["body"])
		assert bench("inspect", run_id) == before
		evidence["checks"].append(dict(
			name="Twenty simultaneous denied-command retries preserve one event; another actor cannot replay it",
			status="PASS", unauthorized_status=unauthorized["status"],
			**sanitized_batch(duplicate_results, peak),
		))

		bench("policy", run_id, mode="Warn")
		before = bench("inspect", run_id)
		assert (
			message(call(actor, SUBMIT, denials["block_valid"]["payload"]))
			== denials["block_valid"]["denied"]
		), "Policy change rewrote old command outcome"
		assert bench("inspect", run_id) == before
		payload = submit_payload(before["requests"]["warn_short"])
		after, denied, event = assert_denial(
			run_id, call(actor, SUBMIT, payload), before, "warn_short", requester
		)
		assert message(call(actor, SUBMIT, payload)) == denied
		assert bench("inspect", run_id) == after
		assert denied["code"] != denials["block_valid"]["denied"]["code"]
		evidence["checks"].append(
			dict(
				name="WARN short justification durable; changed policy does not rewrite prior BLOCK denial",
				status="PASS",
				denial_event=event["name"],
			)
		)

		before = bench("inspect", run_id)
		reply = message(call(actor, SUBMIT, submit_payload(before["requests"]["block_valid"])))
		assert reply.get("outcome") != "denied"
		after = bench("inspect", run_id)
		doc = after["requests"]["block_valid"]
		step = next(row for row in doc["steps"] if row["decision"] == "Pending")
		assert (
			step["authority"] == "Headcount Exception"
			and step["principal"] == data["users"]["sector"]["email"] != requester
		)
		decision = dict(
			name=doc["name"],
			step_id=step["key"],
			decision="Approve",
			command_id=uuid.uuid4().hex,
			expected_version=doc["modified"],
			comment="Independent synthetic headcount exception review",
		)
		denied_hr = call(actors["hr"], DECIDE, decision)
		assert denied_hr["status"] in (403, 417), "Ordinary HR granted Sector exception"
		assert bench("inspect", run_id) == after
		decision["command_id"] = uuid.uuid4().hex
		message(call(actors["sector"], DECIDE, decision))
		final = bench("inspect", run_id)
		assert final["requests"]["block_valid"]["steps"][0]["decision"] == "Approved"
		assert final["capacities"]["block_valid"]["reserved"] == 3
		evidence["checks"].append(
			dict(
				name="New command re-evaluates WARN and routes to independent Sector; ordinary HR denied",
				status="PASS",
				hr_status=denied_hr["status"],
			)
		)
		evidence["committed_denials"] = [
			row
			for row in final["security_events"]
			if row["name"]
			in {check.get("denial_event") for check in evidence["checks"]}
			| {row["denied"]["event"] for row in denials.values()}
		]
		evidence["status"] = "PASS"
	except Exception as error:
		evidence["status"] = "FAIL"
		# Never include exception text: third-party failures can include credentials.
		evidence["error_type"] = type(error).__name__
		frame = traceback.extract_tb(error.__traceback__)[-1]
		evidence["failure_location"] = dict(file=Path(frame.filename).name, line=frame.lineno)
		evidence["failed_after_check"] = len(evidence["checks"])
		raise RuntimeError("Headcount HTTP gate failed; see sanitized evidence") from None
	finally:
		if manifest.exists():
			try:
				evidence["cleanup"] = bench("cleanup", run_id)
			except Exception as error:
				evidence["cleanup"] = dict(status="FAIL", error_type=type(error).__name__)
				evidence["status"] = "FAIL"
		evidence["source_hashes_after"] = source_hashes()
		evidence["source_unchanged"] = evidence["source_hashes_before"] == evidence["source_hashes_after"]
		if not evidence["source_unchanged"]:
			evidence["status"] = "FAIL"
		OUTPUT.parent.mkdir(parents=True, exist_ok=True)
		if OUTPUT.exists():
			prior = json.loads(OUTPUT.read_text())
			archived = OUTPUT.with_name(OUTPUT.stem + "-" + prior["run_id"] + OUTPUT.suffix)
			if not archived.exists():
				archived.write_text(json.dumps(prior, indent=2, default=str) + "\n")
		OUTPUT.write_text(json.dumps(evidence, indent=2, default=str) + "\n")
		print(
			json.dumps(
				dict(
					status=evidence["status"],
					checks=len(evidence["checks"]),
					evidence=str(OUTPUT),
					cleanup=evidence.get("cleanup", {}).get("cleaned", False),
				)
			)
		)
	if evidence["status"] != "PASS":
		raise SystemExit(1)


if __name__ == "__main__":
	main()
