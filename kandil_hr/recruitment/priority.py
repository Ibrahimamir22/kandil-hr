"""Explainable source-reference weights; pure date arithmetic for boundary tests."""

from datetime import date, datetime


def score(classification, opened, required_by=None, pin_until=None, as_of=None, active=True):
	def day(value):
		return (
			value.date()
			if isinstance(value, datetime)
			else value
			if isinstance(value, date)
			else date.fromisoformat(str(value)[:10])
		)

	current = day(as_of or date.today())
	age = max(0, (current - day(opened or current)).days)
	due = (day(required_by) - current).days if required_by else None
	parts = [
		{
			"reason": "classification",
			"points": {"Normal": 20, "Important": 40, "Critical": 60}.get(classification, 20),
		}
	]
	age_points = 40 if age > 60 else 25 if age > 30 else 10 if age > 15 else 0
	if age_points:
		parts.append({"reason": "age", "points": age_points})
	if due is not None and due <= 30:
		parts.append({"reason": "due date", "points": 30 if due < 0 else 20 if due <= 7 else 10})
	if pin_until and day(pin_until) >= current:
		parts.append({"reason": "temporary pin", "points": 100})
	return {
		"score": sum(p["points"] for p in parts) if active else 0,
		"parts": parts,
		"age_days": age,
		"due_days": due,
	}
