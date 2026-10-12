import unittest

from kandil_hr.organization.csv_import import MAX_BYTES, CSVImportError, parse


class CSVImportTests(unittest.TestCase):
	header = "position_code,title,department,designation"

	def test_utf8_bom_arabic(self):
		row = parse(("\ufeff" + self.header + "\nP1,عامل,Dept,Worker").encode(), "Positions")[0]
		self.assertEqual(row["title"], "عامل")
		self.assertEqual(row["structural"], 1)

	def test_quoted_commas_and_newlines(self):
		row = parse(self.header + '\nP1,"Worker, specialist\nLevel 2",Dept,Job', "Positions")[0]
		self.assertIn("\n", row["title"])

	def test_duplicate_headers(self):
		with self.assertRaises(CSVImportError):
			parse(self.header + ",title\nP1,W,D,J,X", "Positions")

	def test_missing_unknown_or_blank_header(self):
		for source in ["title\nWorker", self.header + ",company\nP1,W,D,J,X", self.header + ",\nP1,W,D,J,X"]:
			with self.assertRaises(CSVImportError):
				parse(source, "Positions")

	def test_wrong_row_width_or_missing_value(self):
		for row in ["P1,W,D", "P1,W,D,J,X", "P1,,D,J"]:
			with self.assertRaises(CSVImportError):
				parse(self.header + "\n" + row, "Positions")

	def test_bounded_size(self):
		with self.assertRaises(CSVImportError):
			parse("x" * (MAX_BYTES + 1), "Positions")

	def test_bounded_rows(self):
		with self.assertRaises(CSVImportError):
			parse(self.header + "\n" + ("P1,W,D,J\n" * 1001), "Positions")

	def test_bounded_cell(self):
		with self.assertRaises(CSVImportError):
			parse(self.header + "\nP1," + "x" * 8193 + ",D,J", "Positions")

	def test_encoding_and_controls(self):
		for source in [b"\xff", "\ud800", self.header + "\nP1,\0,D,J", None]:
			with self.assertRaises(CSVImportError):
				parse(source, "Positions")

	def test_malformed_quote(self):
		with self.assertRaises(CSVImportError):
			parse(self.header + '\nP1,"unterminated,D,J', "Positions")

	def test_formula_guard(self):
		for value in ["=SUM(A1)", "+CMD", "@SUM(A1)", "- =2"]:
			with self.assertRaises(CSVImportError):
				parse(self.header + "\nP1," + value + ",D,J", "Positions")

	def test_integer_limits(self):
		for value in ["-1", "0", "1.5", "1e3", "2147483648"]:
			with self.assertRaises(CSVImportError):
				parse(self.header + ",structural\nP1,W,D,J," + value, "Positions")

	def test_hierarchy(self):
		row = parse(
			"position,parent_position,authority,valid_from\nP1,P2,Department Approval,2026-10-12", "Hierarchy"
		)[0]
		self.assertEqual(row["parent_position"], "P2")

	def test_strict_dates(self):
		for value in ["12/10/2026", "20261012", "2026-02-30"]:
			with self.assertRaises(CSVImportError):
				parse("position,employee,valid_from\nP1,E1," + value, "Assignments")

	def test_assignment_defaults(self):
		row = parse("position,employee,valid_from\nP1,E1,2026-10-12", "Assignments")[0]
		self.assertEqual(row["allocation"], "Primary")

	def test_blank_lines_skip_but_no_empty_batch(self):
		self.assertEqual(len(parse(self.header + "\n\nP1,W,D,J\n\n", "Positions")), 1)
		with self.assertRaises(CSVImportError):
			parse(self.header + "\n", "Positions")
