"""Execute without a Frappe site: python -m unittest ...organization.test_rules."""

import unittest

from kandil_hr.organization import rules


class OrganizationRulesTests(unittest.TestCase):
	def edge(self, position, parent=None, start="2026-01-01", end=None):
		return dict(position=position, parent_position=parent, valid_from=start, valid_until=end)

	def test_future_cycle_is_rejected(self):
		with self.assertRaisesRegex(ValueError, "cycle"):
			rules.validate_hierarchy([self.edge("A", "B"), self.edge("B", "A", "2027-01-01")])

	def test_historical_opposite_edges_without_overlap_are_valid(self):
		rules.validate_hierarchy(
			[self.edge("A", "B", end="2026-06-30"), self.edge("B", "A", start="2026-07-01")]
		)

	def test_same_day_boundary_is_inclusive(self):
		with self.assertRaisesRegex(ValueError, "Overlapping"):
			rules.validate_hierarchy(
				[self.edge("A", start="2026-01-01", end="2026-07-01"), self.edge("A", start="2026-07-01")]
			)

	def test_self_cycle(self):
		with self.assertRaisesRegex(ValueError, "cycle"):
			rules.validate_hierarchy([self.edge("A", "A")])

	def test_invalid_range(self):
		with self.assertRaisesRegex(ValueError, "range"):
			rules.validate_hierarchy([self.edge("A", start="2026-07-01", end="2026-06-01")])

	def test_peak_future_occupancy_excludes_acting_cover(self):
		rows = [
			dict(valid_from="2026-01-01", valid_until="2026-06-30", allocation="Primary"),
			dict(valid_from="2026-07-01", valid_until=None, allocation="Primary"),
			dict(valid_from="2026-01-01", valid_until=None, allocation="Acting"),
		]
		self.assertEqual(rules.peak_occupancy(rows), 1)
		rows.append(dict(valid_from="2027-01-01", valid_until=None, allocation="Primary"))
		self.assertEqual(rules.peak_occupancy(rows), 2)

	def test_future_assignment_not_occupied_today(self):
		self.assertFalse(rules.effective({"valid_from": "2027-01-01"}, "2026-10-12"))

	def test_competency_weight_total(self):
		rules.competency_weights([{"weight": 60}, {"weight": 40}])
		for rows in [[], [{"weight": 0}, {"weight": 100}], [{"weight": 40}, {"weight": 40}]]:
			with self.assertRaises(ValueError):
				rules.competency_weights(rows)

	def test_touching_assignment_intervals_overlap(self):
		self.assertTrue(
			rules.overlap(
				{"valid_from": "2026-01-01", "valid_until": "2026-02-01"}, {"valid_from": "2026-02-01"}
			)
		)
		self.assertFalse(
			rules.overlap(
				{"valid_from": "2026-01-01", "valid_until": "2026-01-31"}, {"valid_from": "2026-02-01"}
			)
		)

	def test_nonfinite_competency_weights_rejected(self):
		for weight in [float("nan"), float("inf"), float("-inf")]:
			with self.assertRaises(ValueError):
				rules.competency_weights([{"weight": weight}])
