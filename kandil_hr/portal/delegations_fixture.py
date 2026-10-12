"""CLI-only delegation cohort; never modifies review accounts or real companies."""
import json
import uuid

import frappe

from kandil_hr.portal import fixture, delegations
from kandil_hr.portal.route_preview_fixture import load
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.test_commands import acting_as


def prepare(run_id):
    guard(run_id)
    result=fixture.prepare(run_id)
    data=load(run_id)
    for key,role in (('manager','Kandil CEO Approver'),('recruiter','Kandil Approver')):
        user=frappe.get_doc('User',data['users'][key]['email'])
        user.append('roles',{'role':role})
        with fixture.local_user_contacts(run_id):user.save(ignore_permissions=True)
    settings=frappe.get_doc('Kandil Organization Settings',data['company'])
    settings.ceo_approver=data['users']['manager']['email'];settings.save(ignore_permissions=True)
    frappe.db.commit()
    return result


def cleanup(run_id):
    guard(run_id)
    data=json.loads(fixture.path_for(run_id).read_text())
    if data['company']!='Kandil PORTAL TEST '+run_id:raise RuntimeError('Refusing cross-company cleanup')
    if not data.get('cleaned'):
        names=frappe.get_all(delegations.DT,filters={'company':data['company'],'revoked':0},pluck='name')
        with acting_as(data['users']['sector']['email']):
            for name in names:
                doc=frappe.get_doc(delegations.DT,name)
                delegations.execute(name,'revoke',{'reason':'Synthetic delegation cohort cleanup'},str(doc.modified),uuid.uuid4().hex)
        frappe.db.commit()
    result=fixture.cleanup(run_id)
    if frappe.db.count(delegations.DT,{'company':data['company'],'revoked':0}):raise RuntimeError('Active fixture grant remains')
    return dict(result,all_fixture_delegations_revoked=True)
