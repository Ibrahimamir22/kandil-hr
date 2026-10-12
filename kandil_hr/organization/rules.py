"""Pure organization rules, shared by commands and unit tests."""

from datetime import date
from math import isfinite


def day(value):
	return value if isinstance(value, date) else date.fromisoformat(str(value)[:10])


def effective(row, at):
	at = day(at)
	return day(row["valid_from"]) <= at and (not row.get("valid_until") or at <= day(row["valid_until"]))


def overlap(a, b):
	return day(a["valid_from"]) <= day(b.get("valid_until") or "9999-12-31") and day(b["valid_from"]) <= day(
		a.get("valid_until") or "9999-12-31"
	)


def validate_hierarchy(rows):
	"""Check every boundary, not only today's graph; intervals are inclusive."""
	for row in rows:
		if row.get("valid_until") and day(row["valid_until"]) < day(row["valid_from"]):
			raise ValueError("Invalid effective date range")
	for at in {day(r["valid_from"]) for r in rows}:
		graph = {}
		for row in rows:
			if effective(row, at):
				if row["position"] in graph:
					raise ValueError("Overlapping hierarchy revisions")
				graph[row["position"]] = row.get("parent_position")
		for start in graph:
			seen = set()
			current = start
			while current:
				if current in seen:
					raise ValueError("Position hierarchy cannot contain a cycle")
				seen.add(current)
				current = graph.get(current)


def peak_occupancy(rows):
	primaries = [r for r in rows if r.get("allocation", "Primary") == "Primary"]
	return max(
		(sum(effective(r, at) for r in primaries) for at in {r["valid_from"] for r in primaries}), default=0
	)


def competency_weights(rows):
	if not rows or any(
		not isfinite(float(r.get("weight") or 0)) or float(r.get("weight") or 0) <= 0 for r in rows
	):
		raise ValueError("Competency weights must be positive")
	if abs(sum(float(r["weight"]) for r in rows) - 100) > 0.001:
		raise ValueError("Competency weights must total 100 percent")
