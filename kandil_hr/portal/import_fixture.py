"""CLI-only synthetic import cohort; accounts retired, reviewed history retained."""
import json

import frappe
from frappe.utils import today, add_days

from kandil_hr.portal import fixture as portal
from kandil_hr.portal import structure_fixture as base
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import insert, persist


def prepare(run_id):
    guard(run_id);base.prepare(run_id)
    data=json.loads(portal.path_for(run_id).read_text())
    employee=insert('Employee',first_name='Synthetic import cohort '+run_id,gender='Male',date_of_birth='1990-01-01',
        date_of_joining=add_days(today(),-10),company=data['company'],department=data['department'],status='Active')
    data.update(employee=employee.name,yesterday=add_days(today(),-1),past=add_days(today(),-5))
    persist(portal.path_for(run_id),data);frappe.db.commit()
    return dict(run_id=run_id,prepared=True,accounts=6,credentials='private-file-only')


def inspect(run_id):
    guard(run_id);data=json.loads(portal.path_for(run_id).read_text())
    batches=frappe.get_all('Kandil Organization Import',filters={'company':data['company']},fields=['name','status','import_kind','baseline_reference','reviewed_by'])
    return dict(batches=batches,
        imported_positions=frappe.get_all('Kandil Position',filters={'company':data['company'],'position_code':['like','IMPORT-'+run_id+'%']},fields=['name','structural']),
        assignments=frappe.get_all('Kandil Position Assignment',filters={'employee':data['employee']},fields=['name','position','valid_from','valid_until']),
        audit=frappe.get_all('Kandil Command Audit',filters={'target_name':['in',[b.name for b in batches]]},fields=['target_name','operation','actor']) if batches else [])


def cleanup(run_id):
    guard(run_id);return base.cleanup(run_id)
