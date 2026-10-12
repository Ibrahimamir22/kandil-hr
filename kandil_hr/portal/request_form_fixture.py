"""Guarded synthetic form cohort; no profile/role permission expansion."""
import json
import frappe
from frappe.utils import today
from kandil_hr.portal import fixture
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import insert,persist


def prepare(run_id):
    guard(run_id);fixture.prepare(run_id)
    data=json.loads(fixture.path_for(run_id).read_text())
    employee=insert('Employee',first_name='Synthetic replacement / موظف تجريبي',company=data['company'],department=data['department'],
        branch=frappe.db.get_value('Kandil Position',data['positions'][0],'branch'),status='Active',gender='Male',date_of_birth='1990-01-01',date_of_joining=today())
    data['replacement']=employee.name
    persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(prepared=True,run_id=run_id,accounts=6)


def cleanup(run_id):
    guard(run_id);return fixture.cleanup(run_id)
