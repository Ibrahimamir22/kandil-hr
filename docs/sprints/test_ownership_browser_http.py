#!/usr/bin/env python3
"""Supplement CUA native UI proof with normal session/CSRF authorization and replay."""

import argparse
import datetime
import importlib.util
import json
import threading
import uuid
from pathlib import Path

APP = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("http_gate", APP / "docs/sprints/test_concurrency.py")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
gate.FIXTURE = "kandil_hr.recruitment.ownership_browser_fixture"


def main(run_id):
	manifest = (
		gate.DEV_ROOT
		/ "development/frappe-bench/sites"
		/ gate.SITE
		/ "private"
		/ f"kandil-browser-{run_id}.json"
	)
	data = json.loads(manifest.read_text())
	assert not data["cleaned"] and data["company"] == "Kandil BROWSER TEST " + run_id
	actors = {k: gate.Actor(data["users"][k]) for k in ("requester", "hr")}

	def call(actor, method, payload):
		return actors[actor].call("kandil_hr.recruitment." + method, payload, threading.Barrier(1))

	before = gate.bench("inspect", run_id)
	base = dict(
		name=before["request"]["name"],
		offer_name=data["offers"]["http"]["offer"],
		command_id=uuid.uuid4().hex,
		expected_version=before["request"]["modified"],
		reason="Synthetic HTTP incorrect joining correction",
	)
	denied_void = call("requester", "joining_corrections.void_joining", base)
	denied_owner = call(
		"requester",
		"ownership.assign_application",
		dict(
			name=data["application"],
			owner=data["users"]["requester"]["email"],
			reason="Synthetic requester denial",
			command_id=uuid.uuid4().hex,
			expected_version=before["request"]["modified"],
			application_version=before["application"]["modified"],
		),
	)
	assert denied_void["status"] == 403 and denied_owner["status"] == 403, "Requester endpoint authorization"
	blank = call("hr", "joining_corrections.void_joining", dict(base, reason=""))
	assert blank["status"] == 417, "Blank reason must be denied"
	unchanged = gate.bench("inspect", run_id)
	assert unchanged == before, "Denied operations changed stored records"
	result = call("hr", "joining_corrections.void_joining", base)
	assert result["status"] == 200, "HTTP void failed"
	after = gate.bench("inspect", run_id)
	replay = call("hr", "joining_corrections.void_joining", base)
	assert replay["status"] == 200 and replay["body"]["message"] == result["body"]["message"]
	assert gate.bench("inspect", run_id) == after, "Replay changed history/ledger/receipts"
	changed = call("hr", "joining_corrections.void_joining", dict(base, reason="Different reason"))
	assert changed["status"] == 417, "Changed replay payload must fail"
	duplicate = call(
		"hr",
		"joining_corrections.void_joining",
		dict(base, command_id=uuid.uuid4().hex, expected_version=after["request"]["modified"]),
	)
	assert duplicate["status"] == 417, "Fresh duplicate void must fail"
	assert gate.bench("inspect", run_id) == after
	assert after["events"][: len(before["events"])] == before["events"], "Original events rewritten"
	assert after["ledger"] == dict(structural=5, occupied=0, reserved=0, open_slots=4, available=1)
	assert after["request"]["joined"] == 0 and after["vacancy"] == "Open"
	for key in ("en", "ar", "http"):
		old, new = before["offers"][key], after["offers"][key]
		assert new["voided"] and new["outcome"] == "Joined"
		assert new["employee"]["status"] == "Inactive" and new["employee"]["voided"]
		assert (
			new["assignment"]["is_voided"]
			and new["onboarding"]["docstatus"] == 0
			and new["onboarding"]["voided"]
		)
		for field in ("name", "employee", "allocation", "valid_from", "valid_until"):
			assert new["assignment"][field] == old["assignment"][field]
		assert (
			new["employee"]["name"] == old["employee"]["name"]
			and new["onboarding"]["name"] == old["onboarding"]["name"]
		)
	assert after["counts"]["Kandil Command Receipt"] == before["counts"]["Kandil Command Receipt"] + 1
	evidence = dict(
		run_id=run_id,
		site=gate.SITE,
		checked_at=datetime.datetime.now(datetime.UTC).isoformat(),
		status="PASS",
		authentication="Ordinary password login with valid CSRF; no API-key bypass",
		checks=[
			"Requester ownership POST denied403; unchanged records",
			"Requester void POST denied403; unchanged records",
			"Blank reason denied417; unchanged records",
			"Exact void replay identical with no second effect",
			"Changed-payload replay and fresh duplicate denied417",
			"Original events and joining references retained",
			"Three total voids reconcile occupied0/open4; original outcome remains Joined",
		],
		statuses=dict(
			requester_void=denied_void["status"],
			requester_owner=denied_owner["status"],
			blank_reason=blank["status"],
			void=result["status"],
			replay=replay["status"],
			changed_payload=changed["status"],
			duplicate=duplicate["status"],
		),
		before=before,
		after=after,
		source_hashes=gate.source_hashes(),
		limits=[
			"EN/AR first two voids are separately recorded CUA UI proof; deterministic command replay is this separate HTTP case."
		],
	)
	output = APP / "docs/sprints/evidence/browser/ownership-joining/http-results.json"
	output.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n")
	print(json.dumps(dict(status="PASS", checks=len(evidence["checks"]), output=str(output))))


if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument("run_id")
	main(parser.parse_args().run_id)
