import unittest
from datetime import UTC, date, datetime, timezone

from kandil_hr.foundation.calendar import add_working_days, as_date, cairo_date, working_days_between


class TestBusinessCalendar(unittest.TestCase):
	def test_weekend_and_holiday_are_excluded(self):
		self.assertEqual(add_working_days("2026-10-08", 2, holidays=["2026-10-11"]), date(2026, 10, 13))

	def test_zero_days_preserves_start_even_on_weekend(self):
		self.assertEqual(add_working_days("2026-10-09", 0), date(2026, 10, 9))

	def test_different_workweek(self):
		self.assertEqual(add_working_days("2026-10-09", 1, weekends=(5, 6)), date(2026, 10, 12))

	def test_invalid_calendar_cannot_loop_forever(self):
		for weekdays in (range(7), (-1,), (7,)):
			with self.assertRaises(ValueError):
				add_working_days("2026-10-08", 1, weekends=weekdays)

	def test_invalid_duration(self):
		for duration in (-1, 0.5, True, "2"):
			with self.assertRaises(ValueError):
				add_working_days("2026-10-08", duration)

	def test_cairo_date_uses_timezone(self):
		self.assertEqual(cairo_date(datetime(2026, 10, 11, 22, tzinfo=UTC)), date(2026, 10, 12))
		with self.assertRaises(ValueError):
			cairo_date(datetime(2026, 10, 11))

	def test_elapsed_excludes_start_includes_end_and_skips_holidays(self):
		self.assertEqual(working_days_between("2026-10-08", "2026-10-13", holidays=["2026-10-11"]), 2)
		self.assertEqual(working_days_between("2026-10-09", "2026-10-10"), 0)
		self.assertEqual(working_days_between("2026-10-12", "2026-10-12"), 0)
		with self.assertRaises(ValueError):
			working_days_between("2026-10-13", "2026-10-12")

	def test_datetime_inputs_respect_cairo_date_boundary(self):
		instant = datetime(2026, 10, 11, 22, tzinfo=UTC)
		self.assertEqual(as_date(instant), date(2026, 10, 12))
		self.assertEqual(add_working_days(instant, 1), date(2026, 10, 13))
		self.assertEqual(working_days_between(instant, "2026-10-13"), 1)

	def test_leap_day_and_year_boundary(self):
		self.assertEqual(add_working_days("2028-02-28", 1, weekends=()), date(2028, 2, 29))
		self.assertEqual(add_working_days("2026-12-31", 1), date(2027, 1, 3))
