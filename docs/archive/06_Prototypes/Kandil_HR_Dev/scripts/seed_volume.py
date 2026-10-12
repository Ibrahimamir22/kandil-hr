from pathlib import Path
import os,json,time
import frappe
os.chdir('/workspace/frappe-bench/sites');frappe.init(site='kandil-test.localhost');frappe.connect();frappe.set_user('Administrator')
assert frappe.local.site=='kandil-test.localhost'
f=json.loads(Path('/workspace/testing/fixtures.json').read_text());start=time.perf_counter();created=0
existing=set(frappe.get_all('Employee',filters={'designation':'PILOT Volume Worker'},pluck='first_name'))
for i in range(1000):
    name=f'PILOT LOAD {i:04d}'
    if name not in existing:
        frappe.get_doc(dict(doctype='Employee',first_name=name,gender='Male',date_of_birth='1990-01-01',date_of_joining='2026-01-02',company=f['company'],department=f['department'],designation='PILOT Volume Worker',branch=f['branch'],status='Active')).insert()
        created+=1
    if (i+1)%100==0:
        frappe.db.commit();print(json.dumps({'employees_processed':i+1}),flush=True)
frappe.db.commit()
records=frappe.get_all('Employee',filters={'designation':'PILOT Volume Worker'},pluck='name')
result={'synthetic_volume_employees':len(records),'created_this_run':created,'seconds':round(time.perf_counter()-start,2),'employees':records}
Path('/workspace/testing/volume-fixtures.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='employees'}));frappe.destroy()
