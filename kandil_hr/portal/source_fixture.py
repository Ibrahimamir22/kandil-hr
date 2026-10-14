"""CLI-only source-catalogue lease for an exact disposable candidate cohort."""
import frappe
from frappe.installer import update_site_config
from kandil_hr.portal import catalog_fixture,candidate_fixture,fixture
from kandil_hr.recruitment.concurrency_fixture import persist
FLAG='kandil_source_catalog_enabled'


def prepare(run_id):
    if frappe.conf.get(FLAG):raise RuntimeError('Do not take over an existing source-catalogue lease')
    catalog_fixture.prepare(run_id);candidate_fixture.enable(run_id);data=candidate_fixture.load(run_id)
    data['sources']=dict(before=frappe.conf.get(FLAG),lease=True)
    persist(fixture.path_for(run_id),data);update_site_config(FLAG,1)
    return dict(prepared=True,source_lease=True)


def cleanup(run_id):
    data=candidate_fixture.load(run_id)
    if data.get('sources',{}).get('lease'):
        update_site_config(FLAG,data['sources']['before']);data['sources']['lease']=False;persist(fixture.path_for(run_id),data)
    result=candidate_fixture.cleanup(run_id);result['source_lease_restored']=True;return result
