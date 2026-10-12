import os,json
from pathlib import Path
import frappe
os.chdir('/workspace/frappe-bench/sites');frappe.init(site='kandil-test.localhost');frappe.connect();frappe.set_user('Administrator')
rows=[]
for name in frappe.get_all('Kandil Capacity',pluck='name'):
    c=frappe.get_doc('Kandil Capacity',name)
    quantities=frappe.db.sql('''SELECT r.status,l.requested_qty,l.approved_qty,l.joined_qty FROM `tabKandil Request Line` l JOIN `tabKandil Hiring Request` r ON r.name=l.parent WHERE l.capacity=%s''',name,as_dict=True)
    expected_reserved=sum(x.requested_qty for x in quantities if x.status=='Pending')
    expected_open=sum(x.approved_qty-x.joined_qty for x in quantities if x.status=='Approved')
    expected_joined=sum(x.joined_qty for x in quantities)
    actual_employee_count=frappe.db.count('Employee',{'company':c.company,'department':c.department,'designation':c.designation,'branch':c.branch,'custom_kandil_offer':['is','set']})
    ok=c.reserved==expected_reserved and c.open_slots==expected_open and c.occupied==expected_joined==actual_employee_count and c.available==c.structural-c.occupied-c.reserved-c.open_slots
    rows.append(dict(capacity=name,reserved=c.reserved,expected_reserved=expected_reserved,open=c.open_slots,expected_open=expected_open,occupied=c.occupied,joined=expected_joined,employees=actual_employee_count,pass_check=ok))
result={'all_balanced':all(x['pass_check'] for x in rows),'capacities':rows,'total_employees':frappe.db.count('Employee'),'baseline_note':'All pilot capacities in this fixture set started with occupied=0.'}
Path('/workspace/testing/pilot-ledger-audit.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));frappe.destroy()
