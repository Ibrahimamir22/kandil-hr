"""CLI-only personal-session assignment cohort; retains synthetic review history."""
import json

import frappe
from frappe.utils import add_days

from kandil_hr.portal import fixture as base
from kandil_hr.portal import structure_fixture
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import insert, persist


def prepare(run_id):
    guard(run_id)
    structure_fixture.prepare(run_id)
    data=json.loads(base.path_for(run_id).read_text())
    # An HR author and a separate configured HR reviewer; no production role changes.
    author=frappe.get_doc('User',data['users']['manager']['email'])
    author.append('roles',{'role':'Kandil Recruiter'})
    with base.local_user_contacts(run_id): author.save(ignore_permissions=True)
    frappe.db.delete('User Permission',{'user':author.name,'allow':'Employee'})
    frappe.clear_cache(user=author.name)
    employee=insert('Employee',first_name='Synthetic reviewed employee '+run_id,gender='Male',
        date_of_birth='1990-01-01',date_of_joining=data['today'],company=data['company'],department=data['department'],status='Active')
    data['employee']=employee.name
    data['assign_on']=str(add_days(data['today'],2))
    data['move_on']=str(add_days(data['today'],4))
    data['end_on']=str(add_days(data['today'],6))
    persist(base.path_for(run_id),data);frappe.db.commit()
    return dict(prepared=True,run_id=run_id,accounts=6,credentials='private-file-only')


def inspect(run_id):
    guard(run_id)
    data=json.loads(base.path_for(run_id).read_text())
    return {**structure_fixture.inspect(run_id),'assignments':frappe.get_all('Kandil Position Assignment',
        filters={'company':data['company'],'employee':data['employee']},
        fields=['name','employee','position','allocation','valid_from','valid_until'],order_by='valid_from')}


def cleanup(run_id):
    return {**structure_fixture.cleanup(run_id),
            'retained_future_assignments':'Synthetic future episodes retained in their isolated test company; zero counts are current-date only.'}
