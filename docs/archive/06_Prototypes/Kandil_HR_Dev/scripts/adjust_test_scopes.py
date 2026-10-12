"""Correct synthetic HR manager scopes, preserving worker restrictions."""
import os, json
from pathlib import Path
import frappe
os.chdir('/workspace/frappe-bench/sites')
frappe.init(site='kandil-test.localhost')
frappe.connect()
frappe.set_user('Administrator')
assert frappe.local.site == 'kandil-test.localhost'
fixtures=json.loads(Path('/workspace/testing/fixtures.json').read_text())
removed=0
for key in ['manager','manager2']:
    employee=frappe.get_doc('Employee',fixtures['employees'][key])
    employee.create_user_permission=0
    employee.save()
    for name in frappe.get_all('User Permission',filters={'user':employee.user_id,'allow':'Employee','for_value':employee.name},pluck='name'):
        frappe.delete_doc('User Permission',name)
        removed+=1
    frappe.clear_cache(user=employee.user_id)
frappe.db.commit()
print(json.dumps({'site':frappe.local.site,'manager_self_only_permissions_removed':removed}))
frappe.destroy()
