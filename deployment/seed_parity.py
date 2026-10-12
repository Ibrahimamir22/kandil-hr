"""Seed only two synthetic companies on the explicit local parity test site."""

import json
import os
from pathlib import Path

import frappe
from frappe.utils import getdate

SITE = "kandil-parity.localhost"
BENCH = Path("/workspace/frappe-bench")
os.chdir(BENCH / "sites")
frappe.init(site=SITE, sites_path=str(BENCH / "sites"))
frappe.connect()
frappe.set_user("Administrator")
try:
	assert frappe.local.site == SITE and frappe.conf.get("allow_tests") and frappe.conf.get("mute_emails")
	if not frappe.is_setup_complete():
		from frappe.desk.page.setup_wizard.setup_wizard import setup_complete

		year = getdate().year
		setup_complete(
			dict(
				language="English",
				lang="en",
				country="Egypt",
				timezone="Africa/Cairo",
				currency="EGP",
				company_name="Kandil PARITY TEST A",
				company_abbr="KPTA",
				fy_start_date=f"{year}-01-01",
				fy_end_date=f"{year}-12-31",
				chart_of_accounts="Standard",
				domain="Manufacturing",
				setup_demo=0,
				enable_telemetry=0,
			)
		)
	if not frappe.db.exists("Company", "Kandil PARITY TEST B"):
		frappe.get_doc(
			dict(
				doctype="Company",
				company_name="Kandil PARITY TEST B",
				abbr="KPTB",
				country="Egypt",
				default_currency="EGP",
				chart_of_accounts="Standard",
			)
		).insert()
	frappe.db.commit()
	print(
		json.dumps(
			{
				"site": SITE,
				"companies": frappe.get_all("Company", pluck="name"),
				"real_data": False,
				"outbound_email": "muted",
			}
		)
	)
finally:
	frappe.destroy()
