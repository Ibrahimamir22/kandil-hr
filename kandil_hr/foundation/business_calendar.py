"""Internal company-calendar service for already-authorized business commands.

These helpers are not HTTP endpoints and do not grant access to HR records.
Callers must authorize the relevant request/position before calculating its SLA.
Calendar configuration remains restricted to native System Manager forms.
"""

from dataclasses import dataclass
from datetime import date

from kandil_hr.foundation.calendar import add_working_days, as_date, working_days_between


@dataclass(frozen=True)
class CompanyCalendar:
	name: str
	company: str
	weekends: tuple
	holidays: tuple
	valid_from: date | None = None
	valid_until: date | None = None

	def _check_range(self, start, end):
		if (self.valid_from and start < self.valid_from) or (self.valid_until and end > self.valid_until):
			import frappe
			from frappe import _

			frappe.throw(_("The holiday list does not cover the requested business-calendar period."))

	def deadline(self, start, days):
		start = as_date(start)
		end = add_working_days(start, days, self.weekends, self.holidays)
		self._check_range(start, end)
		return end

	def elapsed(self, start, end):
		start, end = as_date(start), as_date(end)
		count = working_days_between(start, end, self.weekends, self.holidays)
		self._check_range(start, end)
		return count


def company_calendar(company, calendar_name=None, *, current=False):
	"""Load one explicit/company calendar; no implicit workweek or annual rollover."""
	import frappe
	from frappe import _

	from kandil_hr.foundation.models import guard

	guard()
	if not company:
		frappe.throw(_("A company is required for business-calendar calculations."))
	filters = {"company": company}
	if calendar_name:
		filters["name"] = calendar_name
	# Delivery/scheduler callers acquire Company before these calendar/holiday
	# locks and acquire User rows afterwards. Current reads avoid a stale RR
	# snapshot established before waiting for the company's workflow mutex.
	if current:
		rows = frappe.db.sql(
			"SELECT name,company,weekend_days,holiday_list,timezone FROM `tabKandil Business Calendar` "
			"WHERE company=%s" + (" AND name=%s" if calendar_name else "") + " ORDER BY name LIMIT 2 FOR UPDATE",
			(company, calendar_name) if calendar_name else (company,), as_dict=True,
		)
	else:
		rows = frappe.get_all(
			"Kandil Business Calendar", filters=filters,
			fields=["name", "company", "weekend_days", "holiday_list", "timezone"], limit_page_length=2,
		)
	if len(rows) != 1:
		frappe.throw(
			_(
				"Configure exactly one company business calendar or select an explicit calendar belonging to that company."
			)
		)
	row = rows[0]
	if row.timezone != "Africa/Cairo":
		frappe.throw(_("The company business calendar must use Africa/Cairo."))
	weekends = tuple(int(value) for value in (row.weekend_days or "").split(",") if value.strip())
	# Validate even for a zero-duration calculation or an imported config record.
	add_working_days(date(2000, 1, 1), 0, weekends)
	holidays, valid_from, valid_until = (), None, None
	if row.holiday_list:
		period = frappe.db.get_value("Holiday List", row.holiday_list, ["from_date", "to_date"],
			as_dict=True, for_update=current)
		if not period or not period.from_date or not period.to_date:
			frappe.throw(_("The selected holiday list must define its coverage dates."))
		valid_from, valid_until = as_date(period.from_date), as_date(period.to_date)
		if current:
			holiday_rows = frappe.db.sql(
				"SELECT holiday_date FROM `tabHoliday` WHERE parent=%s AND parenttype='Holiday List' ORDER BY name FOR UPDATE",
				(row.holiday_list,), pluck=True,
			)
		else:
			holiday_rows = frappe.get_all("Holiday", filters={"parent": row.holiday_list, "parenttype": "Holiday List"}, pluck="holiday_date")
		holidays = tuple(as_date(day) for day in holiday_rows)
	return CompanyCalendar(row.name, row.company, weekends, holidays, valid_from, valid_until)


def company_deadline(company, start, days, calendar_name=None):
	"""Exclude the start date; use today in Cairo only when start is explicitly None."""
	from kandil_hr.foundation.clock import today_cairo

	return company_calendar(company, calendar_name).deadline(today_cairo() if start is None else start, days)


def company_working_days(company, start, end=None, calendar_name=None):
	"""Count working dates in (start, end]; default end is the Cairo business date."""
	from kandil_hr.foundation.clock import today_cairo

	return company_calendar(company, calendar_name).elapsed(start, today_cairo() if end is None else end)
