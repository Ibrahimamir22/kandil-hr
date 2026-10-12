"""Opted-in CLI cohort with CEO role, retained history and terminal-safe cleanup."""
import json
import uuid

import frappe

from kandil_hr.portal import fixture
from kandil_hr.portal.route_preview_fixture import load
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as


def prepare(run_id):
    guard(run_id)
    result=fixture.prepare(run_id)
    data=load(run_id)
    user=frappe.get_doc('User',data['users']['sector']['email'])
    user.append('roles',{'role':'Kandil CEO Approver'})
    with fixture.local_user_contacts(run_id):user.save(ignore_permissions=True)
    settings=frappe.get_doc('Kandil Organization Settings',data['company'])
    settings.ceo_approver=user.name;settings.save(ignore_permissions=True)
    frappe.db.commit()
    return result


def inspect(run_id):
    data=load(run_id)
    result=fixture.inspect(run_id)
    for row in result['requests']:
        doc=frappe.get_doc('Kandil Hiring Request',row.name)
        row['amends']=doc.amends
        row['lines']=[{key:line.get(key) for key in ('name','capacity','requested_qty','proposed_qty','approved_qty','reserved_qty','joined_qty','closed_qty','job_opening')} for line in doc.lines]
    return result


def cleanup(run_id):
    from kandil_hr.recruitment.api import cancel_request
    guard(run_id)
    data=json.loads(fixture.path_for(run_id).read_text())
    if data['company']!='Kandil PORTAL TEST '+run_id:
        raise RuntimeError('Refusing cross-company cleanup')
    if not data.get('cleaned'):
        names=frappe.get_all('Kandil Hiring Request',filters={'company':data['company']},fields=['name','amends'])
        # Cancel active children before their originals; Applied children are
        # historical outcomes and cannot be cancelled through the business API.
        with acting_as(data['users']['hr']['email']):
            for row in sorted(names,key=lambda r:not bool(r.amends)):
                doc=frappe.get_doc('Kandil Hiring Request',row.name)
                if doc.status in ('Draft','Returned','Pending','Approved'):
                    cancel_request(doc.name,uuid.uuid4().hex,str(doc.modified),'Synthetic request operations cleanup')
        if any(row[key] for row in fixture.inspect(run_id)['capacities'] for key in ('reserved','occupied','open_slots')):
            raise RuntimeError('Synthetic ledgers did not reconcile')
        for account in data['users'].values():
            user=frappe.get_doc('User',account['email']);user.enabled=0
            with fixture.local_user_contacts(run_id):user.save(ignore_permissions=True)
        frappe.db.commit()
        data['cleaned']=True
        for account in data['users'].values():account.pop('password',None)
        persist(fixture.path_for(run_id),data)
    if any(frappe.db.get_value('User',a['email'],'enabled') for a in data['users'].values()):
        raise RuntimeError('An account remains enabled')
    if any(row[key] for row in fixture.inspect(run_id)['capacities'] for key in ('reserved','occupied','open_slots')):
        raise RuntimeError('Synthetic ledgers are not zero')
    return dict(run_id=run_id,cleaned=True,accounts_disabled=len(data['users']),all_fixture_ledgers_zero=True,history_retained=True)
