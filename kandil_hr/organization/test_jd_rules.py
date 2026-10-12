import unittest

from kandil_hr.organization.jd_rules import validate


class JDRulesTests(unittest.TestCase):
	def rows(self, n):
		return [{"description": str(i)} for i in range(n)]

	def kpis(self):
		return [
			dict(kind="Weighted", weight=60),
			dict(kind="Weighted", weight=40),
			dict(kind="Monitoring", weight=0),
		]

	def test_weighted_60_40_and_monitoring(self):
		validate(self.rows(5), self.kpis(), "JL1")

	def test_bad_weight_total(self):
		rows = self.kpis()
		rows[1]["weight"] = 30
		with self.assertRaisesRegex(ValueError, "total"):
			validate(self.rows(5), rows)

	def test_monitoring_weight_blocked(self):
		rows = self.kpis()
		rows[2]["weight"] = 1
		with self.assertRaisesRegex(ValueError, "Monitoring"):
			validate(self.rows(5), rows)

	def test_responsibility_hard_bounds(self):
		for count in [2, 17]:
			with self.assertRaisesRegex(ValueError, "3 and 16"):
				validate(self.rows(count), [])

	def test_above_band_needs_reason(self):
		with self.assertRaisesRegex(ValueError, "reason"):
			validate(self.rows(9), [], "JL1")
		validate(self.rows(9), [], "JL1", "Additional safety requirements")

	def test_below_band_warns(self):
		self.assertTrue(validate(self.rows(3), [], "JL1"))

	def test_nonfinite_weights(self):
		for weight in ["nan", "inf", "-inf"]:
			with self.assertRaises(ValueError):
				validate(self.rows(3), [dict(kind="Weighted", weight=weight)])

	def test_arabic_responsibilities(self):
		validate([{"description_ar": "سلامة"}] * 3, [])

	def test_empty_responsibility_rejected(self):
		with self.assertRaises(ValueError):
			validate([{}] * 3, [])
