"""Synthetic fixtures on kandil-test.localhost only; never runs on the main site."""
from pathlib import Path
import json, secrets, datetime, os
import frappe

site='kandil-test.localhost'
os.chdir('/workspace/frappe-bench/sites')
frappe.init(site=site,sites_path='/workspace/frappe-bench/sites')
frappe.connect();frappe.set_user('Administrator')
assert frappe.local.site==site
out=Path('/workspace/testing');out.mkdir(exist_ok=True)
company='Kandil TEST ONLY'
today=datetime.date.today();year=today.year
def ensure(dt, filters, data):
    name=frappe.db.exists(dt,filters)
    if name:return frappe.get_doc(dt,name)
    return frappe.get_doc(dict(doctype=dt,**data)).insert()

if not frappe.is_setup_complete():
    from frappe.desk.page.setup_wizard.setup_wizard import setup_complete
    setup_complete(dict(language='English',lang='en',country='Egypt',timezone='Africa/Cairo',
        currency='EGP',company_name=company,company_abbr='KTEST',
        fy_start_date=f'{year}-01-01',fy_end_date=f'{year}-12-31',
        chart_of_accounts='Standard',domain='Manufacturing',setup_demo=0,enable_telemetry=0))
    frappe.db.commit()
assert frappe.db.exists('Company',company)
frappe.db.set_single_value('System Settings','enable_telemetry',0)

department=ensure('Department',{'department_name':'TEST HR Operations','company':company},
    dict(department_name='TEST HR Operations',company=company,is_group=0)).name
designation=ensure('Designation','TEST Production Operator',dict(designation_name='TEST Production Operator')).name
headcount_designation=ensure('Designation','TEST Capacity Seat',dict(designation_name='TEST Capacity Seat')).name
branch=ensure('Branch','TEST Factory A',dict(branch='TEST Factory A')).name
ensure('Branch','TEST Factory B',dict(branch='TEST Factory B'))
holiday=ensure('Holiday List',f'TEST Calendar {year}',dict(holiday_list_name=f'TEST Calendar {year}',
    from_date=f'{year}-01-01',to_date=f'{year}-12-31',holidays=[{'holiday_date':f'{year}-01-01','description':'Synthetic holiday'}]))
if not frappe.db.exists('Holiday List Assignment',{'applicable_for':'Company','assigned_to':company,'docstatus':1}):
    frappe.get_doc(dict(doctype='Holiday List Assignment',holiday_list=holiday.name,applicable_for='Company',
        assigned_to=company,from_date=f'{year}-01-01')).insert().submit()

credentials_path=Path('/workspace/test-credentials.json')
credentials=json.loads(credentials_path.read_text()) if credentials_path.exists() else {}
for key,roles in [('manager',['HR Manager','HR User','Leave Approver','Interviewer']),
                  ('manager2',['HR Manager','HR User','Leave Approver','Interviewer']),
                  ('employee_a',['Employee']),('employee_b',['Employee'])]:
    email=f'kandil-test-{key}@example.invalid'
    if key not in credentials:credentials[key]={'email':email,'password':secrets.token_urlsafe(24)}
    ensure('User',email,dict(email=email,first_name='TEST '+key,enabled=1,user_type='System User',
        send_welcome_email=0,new_password=credentials[key]['password'],roles=[{'role':r} for r in roles]))
credentials_path.write_text(json.dumps(credentials));credentials_path.chmod(0o600)
employees={}
for key in credentials:
    e=ensure('Employee',{'user_id':credentials[key]['email']},dict(first_name='TEST '+key,gender='Male',
        date_of_birth='1990-01-01',date_of_joining=f'{year}-01-02',status='Active',company=company,
        department=department,designation=designation,branch=branch,user_id=credentials[key]['email'],
        personal_email=credentials[key]['email'],create_user_permission=0 if key.startswith("manager") else 1,
        leave_approver=credentials['manager']['email']))
    employees[key]=e.name
leave_type=ensure('Leave Type','TEST Annual Leave',dict(leave_type_name='TEST Annual Leave',
    allow_negative=0,include_holiday=0,max_leaves_allowed=30)).name
for key in ['employee_a','employee_b']:
    if not frappe.db.exists('Leave Allocation',{'employee':employees[key],'leave_type':leave_type,'docstatus':1}):
        frappe.get_doc(dict(doctype='Leave Allocation',employee=employees[key],leave_type=leave_type,
            from_date=f'{year}-01-01',to_date=f'{year}-12-31',new_leaves_allocated=10,company=company)).insert().submit()
skill=ensure('Skill','TEST Safety Knowledge',dict(skill_name='TEST Safety Knowledge')).name
interview_type=ensure('Interview Type','TEST Production Interview',dict(interview_type_name='TEST Production Interview',
    expected_skill_set=[{'skill':skill}],interviewers=[{'interviewer':credentials['manager']['email']}])).name

# Standard workflow configuration, confined to the test site; no custom application logic.
for state in ['TEST Requested','TEST Approved']:
    ensure('Workflow State',state,dict(workflow_state_name=state))
ensure('Workflow Action Master','TEST Approve',dict(workflow_action_name='TEST Approve'))
ensure('Workflow','TEST Requisition Approval',dict(workflow_name='TEST Requisition Approval',
    document_type='Job Requisition',is_active=1,send_email_alert=0,workflow_state_field='workflow_state',
    states=[dict(state='TEST Requested',doc_status='0',allow_edit='HR Manager',update_field='status',update_value='Pending'),
            dict(state='TEST Approved',doc_status='0',allow_edit='HR Manager',update_field='status',update_value='Open & Approved')],
    transitions=[dict(state='TEST Requested',action='TEST Approve',next_state='TEST Approved',allowed='HR Manager',allow_self_approval=0)]))
frappe.db.commit()
manifest=dict(site=site,company=company,department=department,designation=designation,
    headcount_designation=headcount_designation,branch=branch,leave_type=leave_type,employees=employees,
    interview_type=interview_type,skill=skill,today=str(today),year=year)
(out/'fixtures.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps(manifest,indent=2))
frappe.destroy()
