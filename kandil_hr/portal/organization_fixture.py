"""CLI-only organization portal cohort with four synthetic legal entities."""
import json

import frappe
from frappe.utils import today

from kandil_hr.organization.api import transition
from kandil_hr.portal import fixture as base
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import insert,persist


def prepare(run_id):
    guard(run_id)
    base.prepare(run_id)
    data=json.loads(base.path_for(run_id).read_text())
    main=frappe.get_doc('Kandil Position',data['positions'][0])
    data['head']=frappe.db.get_value('Kandil Position Hierarchy',{'position':main.name},'parent_position')
    data['as_of']=today()
    # A read-only recruiter has only one branch, while HR keeps department scope.
    user=data['users']['recruiter']['email']
    grant=frappe.get_doc('Kandil Access Grant',{'user':user,'company':data['company']})
    grant.revoked=1;grant.save(ignore_permissions=True)
    insert('Kandil Access Grant',company=data['company'],department=data['department'],branch=main.branch,
           user=user,valid_from=today(),can_manage_recruitment=0,reason='Synthetic branch-only organization viewer')
    assignment=frappe.get_doc('Kandil Position Assignment',{'position':data['head']})
    assignment.valid_until=today();assignment.save(ignore_permissions=True)
    data['foreign_companies']=[];data['foreign_positions']=[]
    with transition():
        for index in range(3):
            company=insert('Company',company_name=f'Kandil ORG TEST {run_id} entity {index+2}',
                           abbr='O'+run_id[:4]+str(index),default_currency='EGP',country='Egypt').name
            department=insert('Department',department_name=f'ORG-{run_id}-{index}',company=company).name
            p=insert('Kandil Position',company=company,department=department,branch=main.branch,
                     designation=main.designation,position_code=f'ORG-{run_id}-FOREIGN-{index}',title=main.title,structural=1)
            data['foreign_companies'].append(company);data['foreign_positions'].append(p.name)
        for index in range(22):
            p=insert('Kandil Position',company=data['company'],department=data['department'],branch=main.branch,
                     designation=main.designation,position_code=f'ORG-{run_id}-ZZ-{index:02}',
                     title=f'Synthetic organization position {index:02}',title_ar=f'منصب تجريبي {index:02}',structural=1)
            if index==21:
                p.status='Closed';p.closed_on=today();p.save(ignore_permissions=True)
                data['closed_position']=p.name;data['closed_code']=p.position_code
    jd=insert('Kandil JD Revision',company=data['company'],department=data['department'],branch=main.branch,
              position=main.name,valid_from=today(),purpose='Synthetic safe operation',purpose_ar='تشغيل آمن تجريبي',
              responsibility_rows=[dict(description=en,description_ar=ar) for en,ar in
                 [('Quality','الجودة'),('Safety','السلامة'),('Reporting','التقارير')]])
    data['jd']=jd.name
    persist(base.path_for(run_id),data)
    frappe.db.commit()
    return dict(run_id=run_id,prepared=True,companies=4,credentials='private-file-only')


def cleanup(run_id):
    guard(run_id)
    return base.cleanup(run_id)
