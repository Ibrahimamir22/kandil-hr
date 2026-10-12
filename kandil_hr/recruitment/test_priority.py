"""Pure priority boundaries; runnable without Frappe or a database."""

import unittest
from datetime import date, datetime, timedelta

from kandil_hr.recruitment.priority import score


class TestVacancyPriority(unittest.TestCase):
	def setUp(self):
		self.day = date(2026, 10, 12)

	def test_classification_components_are_explainable(self):
		for classification, expected in [("Normal", 20), ("Important", 40), ("Critical", 60)]:
			result = score(classification, self.day, as_of=self.day)
			self.assertEqual(result["score"], expected)
			self.assertEqual(sum(p["points"] for p in result["parts"]), expected)

	def test_age_brackets_on_each_boundary(self):
		for age, expected in [(0, 20), (15, 20), (16, 30), (30, 30), (31, 45), (60, 45), (61, 60)]:
			with self.subTest(age=age):
				result = score("Normal", self.day - timedelta(days=age), as_of=self.day)
				self.assertEqual(result["score"], expected)
				self.assertEqual(result["age_days"], age)

	def test_due_date_thresholds_and_overdue(self):
		for days, bonus in [(31, 0), (30, 10), (8, 10), (7, 20), (0, 20), (-1, 30)]:
			with self.subTest(days=days):
				self.assertEqual(
					score("Normal", self.day, self.day + timedelta(days=days), as_of=self.day)["score"],
					20 + bonus,
				)

	def test_pin_inclusive_expiry_and_inactive_suppression(self):
		self.assertEqual(score("Normal", self.day, pin_until=self.day, as_of=self.day)["score"], 120)
		self.assertEqual(
			score("Normal", self.day, pin_until=self.day - timedelta(days=1), as_of=self.day)["score"], 20
		)
		self.assertEqual(
			score(
				"Critical",
				self.day - timedelta(days=100),
				self.day - timedelta(days=2),
				self.day + timedelta(days=1),
				self.day,
				active=False,
			)["score"],
			0,
		)

	def test_future_start_never_creates_negative_age(self):
		result = score("Normal", self.day + timedelta(days=1), as_of=self.day)
		self.assertEqual(result["age_days"], 0)
		self.assertEqual(result["score"], 20)

	def test_native_creation_datetime_is_normalized_to_calendar_date(self):
		result = score("Normal", datetime(2026, 10, 11, 23, 30), as_of=self.day)
		self.assertEqual(result["age_days"], 1)
		self.assertEqual(result["score"], 20)
