"""Reference CHG-88/89 rules; numeric bands warn, structural constraints block."""

from math import isfinite

RESP_BANDS = {
	"JL1": (5, 8),
	"JL2": (5, 8),
	"JL3": (6, 10),
	"JL4": (8, 12),
	"JL5": (8, 12),
	"JL6": (8, 16),
	"JL7": (8, 16),
}
KPI_BANDS = {
	"JL1": (3, 5),
	"JL2": (3, 5),
	"JL3": (3, 5),
	"JL4": (4, 6),
	"JL5": (4, 6),
	"JL6": (5, 7),
	"JL7": (5, 7),
}


def validate(responsibilities, kpis, level="", reason=""):
	warnings = []
	if level and level not in RESP_BANDS:
		raise ValueError("Select a supported job level.")
	if not 3 <= len(responsibilities) <= 16:
		raise ValueError("A job description needs between 3 and 16 responsibilities.")
	if any(
		not str(row.get("description") or row.get("description_ar") or "").strip() for row in responsibilities
	):
		raise ValueError("Every responsibility needs an English or Arabic description.")
	band = RESP_BANDS.get(level)
	if band and len(responsibilities) > band[1] and not str(reason or "").strip():
		raise ValueError("Responsibilities above the job-level band require a written reason.")
	if band and len(responsibilities) < band[0]:
		warnings.append("The responsibility count is below the indicative job-level band.")
	if (
		level in ["JL6", "JL7"]
		and not 4 <= len({str(r.get("area") or "").strip() for r in responsibilities if r.get("area")}) <= 6
	):
		warnings.append("Group senior-level responsibilities under 4 to 6 areas.")
	weighted = []
	for row in kpis:
		if row.get("kind") not in ["Weighted", "Monitoring"]:
			raise ValueError("Each KPI needs a Weighted or Monitoring type.")
		try:
			weight = float(row.get("weight") or 0)
		except ValueError, TypeError:
			raise ValueError("KPI weights must be valid numbers.")
		if not isfinite(weight):
			raise ValueError("KPI weights must be valid numbers.")
		if row["kind"] == "Weighted":
			if weight <= 0:
				raise ValueError("Every weighted KPI needs a positive weight.")
			weighted.append(weight)
		elif weight:
			raise ValueError("Monitoring KPIs cannot carry a weight.")
	if weighted and abs(sum(weighted) - 100) > 0.000001:
		raise ValueError("Weighted KPI weights must total 100 percent.")
	if kpis and not weighted:
		warnings.append("This job description has no weighted KPIs.")
	band = KPI_BANDS.get(level)
	if band and weighted and not band[0] <= len(weighted) <= band[1]:
		warnings.append("The weighted KPI count is outside the indicative job-level band.")
	if sum(r.get("kind") == "Monitoring" for r in kpis) > 4:
		warnings.append("More than four monitoring KPIs exceed the indicative guideline.")
	return warnings
