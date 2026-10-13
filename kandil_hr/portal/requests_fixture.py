"""CLI-only request register cohort, larger than one browser page."""
import uuid
from copy import deepcopy

import frappe
from kandil_hr.portal import fixture, api
from kandil_hr.portal.route_preview_fixture import load
from kandil_hr.portal.request_operations_fixture import cleanup
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment import api as commands
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.browser_fixture import guard


def prepare(run_id):
    guard(run_id);fixture.prepare(run_id);data=load(run_id)
    values=dict(company=data['company'],department=data['department'],requested_position=data['positions'][0],
                need_reason='Expansion',requested_priority='Normal',lines=[dict(capacity=data['capacities'][0],requested_qty=1)])
    names=[]
    for i in range(27):
        with acting_as(data['users']['requester']['email']):
            title=('قديم 100%_ needle '+run_id) if i==0 else ('REGISTER '+run_id+' '+str(i))
            row=api.save_draft(deepcopy(values)|{'title':title},uuid.uuid4().hex);names.append(row['name'])
            if i==26:commands.submit_request(row['name'],uuid.uuid4().hex,row['modified'])
    own=[]
    for i in range(2):
        with acting_as(data['users']['hr']['email']):
            own.append(api.save_draft(deepcopy(values)|{'title':'HR own '+run_id+' '+str(i)},uuid.uuid4().hex)['name'])
    data['register']=dict(needle=names[0],pending=names[-1],requester=names,hr=own)
    persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(run_id=run_id,prepared=True,accounts=6,requests=29,credentials='private-file-only')


def revoke(run_id):
    data=load(run_id)
    for name in frappe.get_all('Kandil Access Grant',filters={'company':data['company'],'user':data['users']['requester']['email'],'revoked':0},pluck='name'):
        doc=frappe.get_doc('Kandil Access Grant',name);doc.revoked=1;doc.save(ignore_permissions=True)
    frappe.db.commit()
    return dict(run_id=run_id,requester_revoked=True)
