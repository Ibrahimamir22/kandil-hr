"""Exact-cohort CLI-only consent HTTP fixtures. No public fixture methods."""
import json
from pathlib import Path

import frappe
from frappe.installer import update_site_config
from frappe.utils import add_days, now_datetime
from kandil_hr.portal import candidate_fixture, catalog_fixture, fixture
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.privacy import consent, notices


def load(run_id):
    data=candidate_fixture.load(run_id)
    if not data.get('consent'):
        raise RuntimeError('Consent cohort required')
    return data


def prepare(run_id):
    if frappe.conf.get('kandil_candidate_consent_enabled'):
        raise RuntimeError('Consent already enabled; do not take over another lease')
    if frappe.get_system_settings('enable_telemetry'):
        raise RuntimeError('Telemetry must be off for synthetic credential testing')
    catalog_fixture.prepare(run_id)
    data=candidate_fixture.load(run_id)
    data['consent']=dict(before=frappe.conf.get('kandil_candidate_consent_enabled'),monitor=frappe.conf.get('monitor'),lease=True)
    persist(fixture.path_for(run_id),data)
    candidate_fixture.enable(run_id)
    update_site_config('kandil_candidate_consent_enabled',1)
    update_site_config('monitor',1)
    return dict(prepared=True,consent_lease=True)


def application(data,name):
    if frappe.db.get_value('Job Applicant',name,'job_title')!=data['candidate']['opening']:
        raise RuntimeError('Application outside synthetic cohort')
    return name


def expire(run_id,name):
    data=load(run_id);application(data,name)
    for row in frappe.get_all(consent.INVITATION,filters={'application':name},pluck='name'):
        frappe.db.set_value(consent.INVITATION,row,'expires_at',add_days(now_datetime(),-1))
    frappe.db.commit();return dict(expired=True)


def corrupt_notice(run_id):
    data=load(run_id)
    if data['consent'].get('notice_backup'):raise RuntimeError('Restore previous fault first')
    notice=notices.state(data['company'])
    doc=frappe.get_doc(notices.DT,notice['version'])
    data['consent']['notice_backup']=dict(name=doc.name,content_json=doc.content_json)
    persist(fixture.path_for(run_id),data)
    frappe.db.set_value(notices.DT,doc.name,'content_json','{"synthetic_missing_field": true}')
    frappe.db.commit();return dict(synthetic_fault=True)


def restore_notice(run_id):
    data=load(run_id);backup=data['consent'].pop('notice_backup',None)
    if backup:
        frappe.db.set_value(notices.DT,backup['name'],'content_json',backup['content_json'])
        frappe.db.commit();persist(fixture.path_for(run_id),data)
    return dict(restored=True)


def quota(run_id,action):
    from kandil_hr.privacy.portal import rate_bucket
    data=load(run_id)
    if action=='exhaust':
        key=rate_bucket('site');data['consent']['rate_key']=key.decode();data['consent']['rate_before']=int(frappe.cache.get(key) or 0)
        persist(fixture.path_for(run_id),data);frappe.cache.setex(key,120,4000)
    elif action=='restore':
        key=data['consent'].pop('rate_key',None);before=data['consent'].pop('rate_before',None)
        if key:frappe.cache.setex(key,120,before)
        persist(fixture.path_for(run_id),data)
    else:raise RuntimeError('Unsupported synthetic quota action')
    return dict(quota_action=action)


def inspect(run_id):
    data=load(run_id)
    return dict(snapshot=candidate_fixture.snapshot(run_id),
        invitations=frappe.get_all(consent.INVITATION,filters={'company':data['company']},fields=['name','application','person','notice_revision','sequence']),
        acceptances=frappe.get_all(consent.ACCEPTANCE,filters={'company':data['company']},fields=['name','application','person','invitation','notice_revision','transfer_accepted','evidence_kind']))


def credential_scan(run_id):
    data=load(run_id);tokens=data['consent'].get('probe_tokens',[])
    if not tokens or any(not isinstance(t,str) or len(t)!=64 for t in tokens):raise RuntimeError('Private synthetic probes required')
    sources={}
    for folder in (Path(frappe.utils.get_bench_path())/'logs',Path(frappe.get_site_path('logs'))):
        for path in folder.glob('*.log*'):
            if path.is_file():sources[str(path)]=path.read_text(errors='replace')
    for dt in ('Error Log','Kandil Command Receipt','Kandil Command Audit'):
        sources[dt]=json.dumps(frappe.get_all(dt,fields=['*'],limit_page_length=0),default=str)
    monitor=frappe.cache.lrange('monitor-transactions',0,-1)
    sources['monitor']='\n'.join(x.decode() if isinstance(x,bytes) else str(x) for x in monitor)
    matches=[name for name,value in sources.items() if any(t in value for t in tokens)]
    return dict(probes=len(tokens),sources=len(sources),matches=matches,monitor_observed='kandil_hr.privacy.portal.respond' in sources['monitor'])


def cleanup(run_id):
    data=load(run_id)
    restore_notice(run_id);quota(run_id,'restore');data=load(run_id)
    if data['consent']['lease']:
        update_site_config('kandil_candidate_consent_enabled',data['consent']['before'])
        update_site_config('monitor',data['consent']['monitor'])
        data['consent']['lease']=False;persist(fixture.path_for(run_id),data)
    catalog_fixture.restore_hr(run_id)
    result=candidate_fixture.cleanup(run_id)
    result['consent_lease_restored']=True
    return result
