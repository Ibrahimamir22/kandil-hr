from pathlib import Path
import os,json,secrets
import frappe
os.chdir('/workspace/frappe-bench/sites');frappe.init(site='kandil-test.localhost');frappe.connect();frappe.set_user('Administrator')
assert frappe.local.site=='kandil-test.localhost'
cpath=Path('/workspace/test-credentials.json');creds=json.loads(cpath.read_text())
if 'sector' not in creds:creds['sector']={'email':'kandil-test-sector@example.invalid','password':secrets.token_urlsafe(24)}
u=creds['sector']
if not frappe.db.exists('User',u['email']):frappe.get_doc(dict(doctype='User',email=u['email'],first_name='TEST Sector Authority',enabled=1,user_type='System User',send_welcome_email=0,new_password=u['password'])).insert()
for key,roles in {'employee_a':['Kandil Requester'],'employee_b':['Kandil Approver'],'manager':['Kandil Recruiter','Kandil Requester'],'manager2':['Kandil Approver','Kandil Requester'],'sector':['Kandil Sector Approver','Kandil Approver']}.items():
    user=frappe.get_doc('User',creds[key]['email'])
    existing={r.role for r in user.roles}
    for role in roles:
        if role not in existing:user.append('roles',{'role':role})
    user.save();frappe.clear_cache(user=user.name)
for designation in ['PILOT Assembly Operator','PILOT Volume Worker']:
    if not frappe.db.exists('Designation',designation):frappe.get_doc(dict(doctype='Designation',designation_name=designation)).insert()
cpath.write_text(json.dumps(creds));cpath.chmod(0o600)
frappe.db.commit();print('Synthetic pilot roles and designations ready. No real accounts changed.');frappe.destroy()
