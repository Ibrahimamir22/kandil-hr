"""Calendar arithmetic independent of the wall clock for reproducible SLA tests."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo


def cairo_date(instant=None):
	instant = instant or datetime.now(ZoneInfo("Africa/Cairo"))
	if instant.tzinfo is None or instant.utcoffset() is None:
		raise ValueError("An aware datetime is required")
	return instant.astimezone(ZoneInfo("Africa/Cairo")).date()


def as_date(value):
	if isinstance(value, datetime):
		# Naive Frappe date-times already represent a local wall-clock date;
		# aware instants must first cross the Cairo date boundary correctly.
		return cairo_date(value) if value.tzinfo is not None else value.date()
	return value if isinstance(value, date) else date.fromisoformat(value)


def add_working_days(start, days, weekends=(4, 5), holidays=()):
	"""Exclude the start date; Friday/Saturday default is explicit, not a legal rule."""
	if not isinstance(days, int) or isinstance(days, bool) or days < 0:
		raise ValueError("Working days must be a non-negative integer")
	weekends = set(weekends)
	if not weekends.issubset(set(range(7))) or len(weekends) == 7:
		raise ValueError("Calendar must contain a working weekday")
	holiday_dates = {as_date(day) for day in holidays}
	day = as_date(start)
	while days:
		day += timedelta(days=1)
		if day.weekday() not in weekends and day not in holiday_dates:
			days -= 1
	return day


def working_days_between(start, end, weekends=(4, 5), holidays=()):
	"""Working dates in (start, end], matching add_working_days start exclusion."""
	start, end = as_date(start), as_date(end)
	if end < start:
		raise ValueError("Business-calendar end cannot precede its start")
	weekends = set(weekends)
	add_working_days(start, 0, weekends)  # shared calendar validation
	holiday_dates = {as_date(day) for day in holidays}
	count, day = 0, start
	while day < end:
		day += timedelta(days=1)
		if day.weekday() not in weekends and day not in holiday_dates:
			count += 1
	return count
