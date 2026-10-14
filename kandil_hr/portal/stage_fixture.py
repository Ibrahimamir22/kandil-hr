"""Guarded exact-cohort Screening browser fixture; no public methods or real data."""
import frappe
from frappe.installer import update_site_config
from kandil_hr.portal import consent_fixture, candidate_fixture, fixture
from kandil_hr.candidates import stages, closure_history
from kandil_hr.recruitment.concurrency_fixture import persist


def load(run_id):
    data=consent_fixture.load(run_id)
    if not data.get('screening'):raise RuntimeError('Screening cohort required')
    return data


def prepare(run_id):
    if frappe.conf.get(stages.FLAG):raise RuntimeError('Do not take over an existing Screening lease')
    consent_fixture.prepare(run_id);data=consent_fixture.load(run_id)
    data['screening']=dict(before=frappe.conf.get(stages.FLAG),lease=True)
    persist(fixture.path_for(run_id),data);update_site_config(stages.FLAG,1)
    return dict(prepared=True,screening_lease=True)


def inspect(run_id):
    data=load(run_id);result=consent_fixture.inspect(run_id)
    result['reopenings']=frappe.get_all(closure_history.DT,filters={'company':data['company']},fields=['name','application','closure','target_stage','consent_evidence'])
    return result


def cleanup(run_id):
    data=load(run_id)
    if data['screening']['lease']:
        update_site_config(stages.FLAG,data['screening']['before']);data['screening']['lease']=False;persist(fixture.path_for(run_id),data)
    result=consent_fixture.cleanup(run_id);result['screening_lease_restored']=True;return result
