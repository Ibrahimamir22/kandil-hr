"""Normal authenticated private Board proof URL checks; synthetic parity only."""

import argparse
import datetime
import hashlib
import importlib.util
import json
import urllib.error
import urllib.request
from pathlib import Path

APP = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gate", APP / "docs/sprints/test_concurrency.py")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def main(run_id):
	manifest = (
		gate.DEV_ROOT
		/ "development/frappe-bench/sites"
		/ gate.SITE
		/ "private"
		/ f"kandil-browser-{run_id}.json"
	)
	d = json.loads(manifest.read_text())
	assert not d["cleaned"] and d["company"] == "Kandil BROWSER TEST " + run_id
	result = {}
	for key in ("sector", "requester", "outsider"):
		actor = gate.Actor(d["users"][key])
		request = urllib.request.Request(gate.BASE + d["proofs"]["board_en"]["url"], headers=actor.headers)
		try:
			with urllib.request.urlopen(request, timeout=30) as response:
				body = response.read()
				status = response.status
		except urllib.error.HTTPError as error:
			body = error.read()
			status = error.code
		result[key] = dict(status=status, bytes=len(body), sha256=hashlib.sha256(body).hexdigest())
		if key == "sector":
			assert status == 200 and b"SYNTHETIC ONLY" in body
		if key == "outsider":
			assert status in (403, 404) and b"SYNTHETIC ONLY" not in body
	output = APP / "docs/sprints/evidence/browser/authority-delegation/private-proof-http.json"
	output.write_text(
		json.dumps(
			dict(
				status="PASS",
				run_id=run_id,
				checked_at=datetime.datetime.now(datetime.UTC).isoformat(),
				authentication="Normal password sessions, no API key",
				results=result,
				limits=[
					"Requester own-request proof access recorded as observed; no denial expectation was invented."
				],
			),
			indent=2,
		)
		+ "\n"
	)
	print(json.dumps(result))


if __name__ == "__main__":
	p = argparse.ArgumentParser()
	p.add_argument("run_id")
	main(p.parse_args().run_id)
