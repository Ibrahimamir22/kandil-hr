import os,json
import frappe
os.chdir('/workspace/frappe-bench/sites');frappe.init(site='kandil.localhost');frappe.connect()
print(json.dumps({'site':frappe.local.site,'pilot_enabled':bool(frappe.conf.get('kandil_pilot_enabled')),'company_count':frappe.db.count('Company'),'pilot_schema_present':bool(frappe.db.exists('DocType','Kandil Hiring Request'))}))
frappe.destroy()
