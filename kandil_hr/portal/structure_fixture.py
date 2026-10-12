"""CLI-only structural portal cohort; preserves synthetic history, retires accounts."""
import json

import frappe
from frappe.utils import today

from kandil_hr.portal import fixture as base
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import insert,persist


def prepare(run_id):
    guard(run_id);base.prepare(run_id)
    data=json.loads(base.path_for(run_id).read_text())
    for role in ('manager','hr','sector'):
        insert('Kandil Access Grant',company=data['company'],user=data['users'][role]['email'],valid_from=today(),
               can_manage_recruitment=1,reason='Synthetic company-wide structural authority')
    account=frappe.get_doc('User',data['users']['sector']['email']);account.append('roles',{'role':'Kandil CEO Approver'});account.save(ignore_permissions=True)
    settings=frappe.get_doc('Kandil Organization Settings',data['company']);settings.ceo_approver=account.name;settings.save(ignore_permissions=True)
    data['branch']=frappe.db.get_value('Kandil Position',data['positions'][0],'branch')
    data['today']=today();persist(base.path_for(run_id),data);frappe.db.commit()
    return dict(run_id=run_id,prepared=True,credentials='private-file-only',accounts=6)


def inspect(run_id):
    guard(run_id);data=json.loads(base.path_for(run_id).read_text())
    changes=frappe.get_all('Kandil Structure Change',filters={'company':data['company']},
        fields=['name','status','reason','changes_json','created_positions_json','route_snapshot'],order_by='creation')
    names=[r.name for r in changes]
    return dict(changes=changes,
        capacities=frappe.get_all('Kandil Capacity',filters={'company':data['company']},fields=['name','position','structural','occupied','reserved','open_slots']),
        audit=frappe.get_all('Kandil Command Audit',filters={'target_name':['in',names]},fields=['name','target_name','operation','command_id','actor'],order_by='creation') if names else [])


def cleanup(run_id):
    guard(run_id)
    result=base.cleanup(run_id)
    data=json.loads(base.path_for(run_id).read_text())
    rows=frappe.get_all('Kandil Capacity',filters={'company':data['company']},fields=['occupied','reserved','open_slots'])
    result['all_company_ledgers_zero']=all(not r.occupied and not r.reserved and not r.open_slots for r in rows)
    result['company_ledger_count']=len(rows)
    if not result['all_company_ledgers_zero']:raise RuntimeError('Synthetic structural capacity commitments remain')
    return result
