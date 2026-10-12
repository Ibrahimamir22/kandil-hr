"""Bounded CSV decoding only. Never evaluates formulas or accepts file paths/URLs."""

import csv
import io
import re
from datetime import date

MAX_BYTES = 1024 * 1024
MAX_ROWS = 1000
MAX_CELL = 8192
SCHEMAS = {
	"Units": {
		"columns": ["external_code", "title", "target", "parent_department", "is_group"],
		"required": ["external_code", "title"],
	},
	"Jobs": {
		"columns": ["external_code", "title", "target", "job_family"],
		"required": ["external_code", "title"],
	},
	"Positions": {
		"columns": [
			"position_code",
			"title",
			"title_ar",
			"department",
			"branch",
			"designation",
			"structural",
			"external_id",
			"job_family",
		],
		"required": ["position_code", "title", "department", "designation"],
	},
	"Hierarchy": {
		"columns": ["position", "parent_position", "authority", "valid_from", "valid_until"],
		"required": ["position", "authority", "valid_from"],
	},
	"Assignments": {
		"columns": ["position", "employee", "user", "allocation", "valid_from", "valid_until", "remarks"],
		"required": ["position", "employee", "valid_from"],
	},
}


class CSVImportError(ValueError):
	pass


def parse(content, kind):
	if kind not in SCHEMAS:
		raise CSVImportError("Select a supported organization import kind.")
	if not isinstance(content, (str, bytes)):
		raise CSVImportError("CSV content must be UTF-8 text.")
	try:
		raw = content.encode("utf-8", errors="strict") if isinstance(content, str) else content
		if len(raw) > MAX_BYTES:
			raise CSVImportError("CSV content exceeds the 1 MiB limit.")
		decoded = raw.decode("utf-8-sig", errors="strict")
	except UnicodeError:
		raise CSVImportError("CSV content must be valid UTF-8 text.") from None
	if any(ord(char) < 32 and char not in "\t\n\r" for char in decoded) or "\x7f" in decoded:
		raise CSVImportError("CSV content contains unsupported control characters.")
	if not decoded.strip():
		raise CSVImportError("CSV content is empty.")
	schema = SCHEMAS[kind]
	try:
		reader = csv.reader(io.StringIO(decoded, newline=""), strict=True)
		header = next(reader)
		if not header or any(not name.strip() for name in header):
			raise CSVImportError("Every CSV column needs a header.")
		header = [name.strip() for name in header]
		if len(header) != len(set(header)):
			raise CSVImportError("CSV column headers cannot be repeated.")
		if set(header) - set(schema["columns"]):
			raise CSVImportError("CSV contains unsupported column headers. Use the selected import template.")
		if set(schema["required"]) - set(header):
			raise CSVImportError("CSV is missing required column headers. Use the selected import template.")
		rows = []
		for cells in reader:
			if not cells or all(not cell.strip() for cell in cells):
				continue
			if len(rows) >= MAX_ROWS:
				raise CSVImportError("CSV imports are limited to 1000 data rows.")
			if len(cells) != len(header):
				raise CSVImportError("Every CSV row must have the same number of columns as the header.")
			if any(len(cell) > MAX_CELL for cell in cells):
				raise CSVImportError("A CSV cell exceeds the 8192-character limit.")
			row = {key: value.strip() for key, value in zip(header, cells, strict=True) if value.strip()}
			if any(not row.get(key) for key in schema["required"]):
				raise CSVImportError("A CSV row is missing required values.")
			# Engineering import guard: formula-looking spreadsheet cells must be
			# converted to literal values before they enter a reviewed baseline.
			if any(
				value.startswith(("=", "+", "@")) or re.match(r"^-\s*[=+@]", value) for value in row.values()
			):
				raise CSVImportError("Convert spreadsheet formulas to literal values before importing CSV.")
			if kind == "Positions":
				quantity = row.get("structural", "1")
				if not re.fullmatch(r"[0-9]{1,10}", quantity) or not 1 <= int(quantity) <= 2147483647:
					raise CSVImportError(
						"CSV structural seats must be positive whole numbers within the supported integer range."
					)
				row["structural"] = int(quantity)
			elif kind == "Units":
				if row.get("is_group", "0") not in ("0", "1"):
					raise CSVImportError("Unit is_group must be 0 or 1.")
				row["is_group"] = int(row.get("is_group", "0"))
			elif kind != "Jobs":
				for field in ["valid_from", "valid_until"]:
					if row.get(field):
						if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row[field]):
							raise CSVImportError("CSV dates must use YYYY-MM-DD.")
						try:
							date.fromisoformat(row[field])
						except ValueError:
							raise CSVImportError("CSV contains an invalid calendar date.") from None
				if row.get("valid_until") and row["valid_until"] < row["valid_from"]:
					raise CSVImportError("Valid Until cannot be before Valid From.")
				if kind == "Assignments":
					row.setdefault("allocation", "Primary")
					if row["allocation"] not in ["Primary", "Acting"]:
						raise CSVImportError("CSV allocation must be Primary or Acting.")
				elif row["authority"] not in [
					"Department Approval",
					"Sector Approval",
					"HR Approval",
					"CEO Approval",
					"Board Approval",
				]:
					raise CSVImportError("CSV authority must match a supported approval authority.")
			rows.append(row)
	except csv.Error, StopIteration:
		raise CSVImportError(
			"CSV syntax is invalid. Use a comma-separated UTF-8 file with quoted multiline values."
		) from None
	if not rows:
		raise CSVImportError("CSV must contain at least one data row.")
	return rows
