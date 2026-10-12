"""Guarded CLI-only reporting-tree cohort; no HTTP fixture endpoints."""
import json

import frappe
from frappe.utils import add_days

from kandil_hr.organization.api import transition
from kandil_hr.portal import fixture as base, organization_fixture
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import insert, persist


def prepare(run_id):
    guard(run_id)
    organization_fixture.prepare(run_id)
    data=json.loads(base.path_for(run_id).read_text())
    main=frappe.get_doc('Kandil Position',data['positions'][0])
    extras=frappe.get_all('Kandil Position',filters={'company':data['company'],'position_code':['like',f'ORG-{run_id}-ZZ-%']},
                         fields=['name','position_code'],order_by='position_code',page_length=30)
    if len(extras)!=22:raise RuntimeError('Unexpected tree fixture position count')
    with transition():
        for index,row in enumerate(extras):
            insert('Kandil Position Hierarchy',company=data['company'],department=data['department'],branch=main.branch,
                   position=row.name,parent_position=data['head'],valid_from=data['as_of'],
                   valid_until=data['as_of'] if index==0 else None)
        data['tomorrow']=add_days(data['as_of'],1)
        insert('Kandil Position Hierarchy',company=data['company'],department=data['department'],branch=main.branch,
               position=extras[0].name,parent_position=main.name,valid_from=data['tomorrow'])
        data['moving_node']=extras[0].name;data['deep_anchor']=extras[20].name;data['deep_nodes']=[]
        parent=data['deep_anchor']
        for index in range(3):
            row=insert('Kandil Position',company=data['company'],department=data['department'],branch=main.branch,
                designation=main.designation,position_code=f'TREE-{run_id}-DEEP-{index}',
                title=f'Synthetic reporting level {index+1}',title_ar=f'مستوى تبعية تجريبي {index+1}',structural=1)
            insert('Kandil Position Hierarchy',company=data['company'],department=data['department'],branch=main.branch,
                   position=row.name,parent_position=parent,valid_from=data['as_of'])
            data['deep_nodes'].append(row.name);parent=row.name
    data['direct_reports']=len(extras)+len(data['positions'])
    persist(base.path_for(run_id),data);frappe.db.commit()
    return dict(run_id=run_id,prepared=True,companies=4,direct_reports=data['direct_reports'],depth=5)


def revoke(run_id):
    guard(run_id)
    data=json.loads(base.path_for(run_id).read_text())
    if data['company']!='Kandil PORTAL TEST '+run_id:raise RuntimeError('Wrong synthetic cohort')
    for name in frappe.get_all('Kandil Access Grant',filters={'user':data['users']['hr']['email'],'company':data['company']},pluck='name'):
        row=frappe.get_doc('Kandil Access Grant',name);row.revoked=1;row.save(ignore_permissions=True)
    frappe.db.commit()
    return dict(revoked=True)


def cleanup(run_id):
    guard(run_id)
    return base.cleanup(run_id)
