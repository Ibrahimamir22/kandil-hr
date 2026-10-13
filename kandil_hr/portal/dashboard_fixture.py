"""CLI-only scoped dashboard cohort: records beyond both old and new page sizes."""
import json
import uuid
import frappe
from frappe.utils import add_days, today
from kandil_hr.portal import fixture
from kandil_hr.portal.api import save_draft
from kandil_hr.portal.dashboard import summary
from kandil_hr.recruitment import api
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as


def prepare(run_id):
    guard(run_id);fixture.prepare(run_id)
    data=json.loads(fixture.path_for(run_id).read_text());data['dashboard']={'pending':[],'drafts':[]}
    for kind in ('pending','drafts','approved'):
        for index in range(1 if kind=='approved' else 28):
            with acting_as(data['users']['requester']['email']):
                result=save_draft(payload=dict(company=data['company'],department=data['department'],
                    title=f'Dashboard {kind} {index:02d} · لوحة العمل',requested_position=data['positions'][0],
                    need_reason='Expansion',requested_priority='Normal',required_by=add_days(today(),-1) if kind=='pending' and index==0 else None,
                    lines=[dict(capacity=c,requested_qty=1) for c in (data['capacities'][:2] if kind=='approved' else data['capacities'][:1])]),command_id=uuid.uuid4().hex)
                if kind!='drafts':api.submit_request(result['name'],uuid.uuid4().hex,result['modified'])
            if kind=='approved':
                for role in ('manager','hr'):
                    doc=frappe.get_doc('Kandil Hiring Request',result['name']);step=next(s for s in doc.approval_steps if s.decision=='Pending')
                    with acting_as(data['users'][role]['email']):api.decide(doc.name,'Approve',step.step_key,uuid.uuid4().hex,str(doc.modified),comment='Dashboard fixture approval')
                data['dashboard']['approved']=result['name']
            else:data['dashboard'][kind].append(result['name'])
    persist(fixture.path_for(run_id),data);frappe.db.commit()
    return dict(prepared=True,requests=57,pending=28,drafts=28,vacancies=2)


def snapshot(run_id):
    guard(run_id);data=json.loads(fixture.path_for(run_id).read_text());result=fixture.inspect(run_id)
    result['summaries']={}
    for role in ('hr','manager','requester','outsider'):
        with acting_as(data['users'][role]['email']):result['summaries'][role]=summary()
    return result


def revoke_manager(run_id):
    guard(run_id);data=json.loads(fixture.path_for(run_id).read_text())
    if data['company']!=f'Kandil PORTAL TEST {run_id}':raise RuntimeError('Refusing unrelated scope change')
    for name in frappe.get_all('Kandil Access Grant',filters={'user':data['users']['manager']['email'],'company':data['company']},pluck='name'):
        grant=frappe.get_doc('Kandil Access Grant',name);grant.revoked=1;grant.save(ignore_permissions=True)
    frappe.db.commit();return dict(revoked=True)


def cleanup(run_id):
    guard(run_id);return fixture.cleanup(run_id)
