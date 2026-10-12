"""Cairo business clock. Test overrides are request-local server state, never input.

This clock deliberately does not alter Frappe audit timestamps, authorization
expiry, or the system clock. No function here is whitelisted.
"""

from contextlib import contextmanager
from datetime import datetime
from zoneinfo import ZoneInfo

CAIRO = ZoneInfo("Africa/Cairo")
_FLAG = "kandil_test_clock"


def _aware(value):
	if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
		raise ValueError("The business clock requires a timezone-aware datetime")
	return value.astimezone(CAIRO)


def _test_context(frappe):
	# allow_tests alone does not authorize a browser request to manipulate time.
	if not (frappe.conf.get("allow_tests") and frappe.flags.get("in_test")) or getattr(
		frappe.local, "request", None
	):
		raise RuntimeError("Clock overrides require a server test context on an allow_tests site")


def now_cairo():
	"""Return an aware Cairo datetime, including the correct historical DST offset."""
	import frappe

	override = frappe.flags.get(_FLAG)
	if override is not None:
		_test_context(frappe)
		return _aware(override)
	return datetime.now(CAIRO)


def today_cairo():
	return now_cairo().date()


@contextmanager
def test_clock(instant):
	"""Freeze business time in native server tests; nested contexts restore correctly."""
	import frappe

	_test_context(frappe)
	instant = _aware(instant)
	previous = frappe.flags.get(_FLAG)
	frappe.flags[_FLAG] = instant
	try:
		yield instant
	finally:
		if previous is None:
			frappe.flags.pop(_FLAG, None)
		else:
			frappe.flags[_FLAG] = previous
