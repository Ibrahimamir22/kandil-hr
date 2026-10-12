"""Read-only source preflight for the pinned installer. Never includes file contents."""

import json
import subprocess
from pathlib import Path


def verify(source):
	source = Path(source).resolve()

	def git(*args):
		return subprocess.check_output(
			["git", "-c", f"safe.directory={source}", "-C", str(source), *args],
			text=True,
			stderr=subprocess.PIPE,
		).strip()

	if Path(git("rev-parse", "--show-toplevel")).resolve() != source:
		raise RuntimeError("The custom app must be its own Git checkout.")
	changes = git("status", "--porcelain", "--untracked-files=all")
	if changes:
		raise RuntimeError(
			"The custom app checkout is dirty. Commit/review it before running the pinned installer."
		)
	lock = json.loads((source / "deployment/versions.lock.json").read_text())
	return dict(
		custom_app_commit=git("rev-parse", "HEAD"),
		clean=True,
		upstream_commits={name: app["commit"] for name, app in lock["apps"].items()},
		images=lock["images"],
		platform=lock["platform"],
		limit="Source checkout proof; not deployment or workflow acceptance.",
	)


if __name__ == "__main__":
	print(json.dumps(verify(Path(__file__).resolve().parent.parent), indent=2))
