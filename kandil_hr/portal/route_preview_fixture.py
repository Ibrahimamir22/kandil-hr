"""Guarded CLI-only preview scenarios for one disposable personal-role cohort."""
import json
import frappe
from kandil_hr.portal import fixture
from kandil_hr.recruitment.browser_fixture import guard


def load(run_id):
    guard(run_id)
    data=json.loads(fixture.path_for(run_id).read_text())
    if data['company']!='Kandil PORTAL TEST '+run_id or data.get('cleaned'):
        raise RuntimeError('An active matching synthetic cohort is required')
    return data


def prepare(run_id):
    guard(run_id);return fixture.prepare(run_id)


def configure(run_id, scenario):
    data=load(run_id)
    if scenario not in ('block','warn','missing','revoked'):
        raise ValueError('Unknown synthetic scenario')
    route=frappe.get_doc('Kandil Recruitment Route',{'company':data['company'],'department':data['department']})
    route.enabled=0 if scenario=='missing' else 1
    route.headcount_mode='Warn' if scenario=='warn' else 'Block'
    route.save(ignore_permissions=True)
    if scenario=='revoked':
        for name in frappe.get_all('Kandil Access Grant',filters={'company':data['company'],'user':data['users']['requester']['email'],'revoked':0},pluck='name'):
            grant=frappe.get_doc('Kandil Access Grant',name);grant.revoked=1;grant.save(ignore_permissions=True)
    frappe.db.commit()
    return dict(run_id=run_id,scenario=scenario)


def inspect(run_id):
    data=load(run_id)
    # No unrelated data or account credentials enter browser evidence.
    requests=frappe.get_all('Kandil Hiring Request',filters={'company':data['company']},pluck='name')
    return fixture.inspect(run_id)|dict(counts={dt:frappe.db.count(dt,{'company':data['company']})
        for dt in ('Kandil Hiring Request','Kandil Request Revision')},
        events=frappe.db.count('Kandil Recruitment Event',{'request':['in',requests]}) if requests else 0,
        outbox=frappe.db.count('Kandil Notification Outbox',{'recipient':['in',[a['email'] for a in data['users'].values()]]}))


def cleanup(run_id):
    guard(run_id);return fixture.cleanup(run_id)
