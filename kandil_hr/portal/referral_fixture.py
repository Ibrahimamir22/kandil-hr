"""Disposable agency-style cohort plus two active referral employees."""
import frappe
from kandil_hr.portal import agency_fixture,candidate_fixture,fixture
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.concurrency_fixture import persist

def prepare(run_id):
    agency_fixture.prepare(run_id)
    data=candidate_fixture.load(run_id)
    data['referral_employees']=[]
    with acting_as('Administrator'):
        for label in ('First','Second'):
            employee=frappe.get_doc(dict(doctype='Employee',first_name='Synthetic '+label+' Referrer '+run_id,company=data['company'],gender='Male',date_of_birth='1990-01-01',date_of_joining='2020-01-01',status='Active')).insert(ignore_permissions=True)
            data['referral_employees'].append(dict(name=employee.name,label=employee.employee_name,version=str(employee.modified)))
    persist(fixture.path_for(run_id),data)
    frappe.db.commit()
    return dict(prepared=True,employees=2)

def cleanup(run_id):
    data=candidate_fixture.load(run_id)
    for row in data.get('referral_employees',[]):
        if frappe.db.get_value('Employee',row['name'],'company')!=data['company']:
            raise RuntimeError('Refuse cross-company employee cleanup')
        frappe.db.set_value('Employee',row['name'],'status','Inactive')
    frappe.db.commit()
    result=agency_fixture.cleanup(run_id)
    result['referral_employees_inactive']=len(data.get('referral_employees',[]))
    return result
