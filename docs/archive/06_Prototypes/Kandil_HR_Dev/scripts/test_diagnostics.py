import os, json
import frappe
os.chdir('/workspace/frappe-bench/sites')
frappe.init(site='kandil-test.localhost');frappe.connect();frappe.set_user('Administrator')
for row in frappe.get_all('Error Log',fields=['method','error'],order_by='creation desc',limit=5):
    print(json.dumps(row))
try:
    frappe.get_print('Job Offer','HR-OFF-2026-00001',print_format='Standard',as_pdf=True,no_letterhead=1)
except Exception:
    import traceback
    traceback.print_exc()
frappe.destroy()
