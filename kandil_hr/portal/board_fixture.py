"""CLI-only Board browser cohort with independent CEO, Chair and Vice."""
import secrets

import frappe
from frappe.utils import today
from frappe.utils.password import update_password

from kandil_hr.portal import fixture
from kandil_hr.portal.route_preview_fixture import load
from kandil_hr.portal.request_operations_fixture import cleanup
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import insert, persist


def prepare(run_id):
    guard(run_id)
    fixture.prepare(run_id)
    data=load(run_id)
    for key,role in (('ceo','Kandil CEO Approver'),('chair','Kandil Board Approver'),('vice','Kandil Board Approver')):
        email=f'portal-{run_id}-{key}@example.invalid'
        password=secrets.token_urlsafe(28)
        previous=frappe.flags.get('in_import')
        try:
            frappe.flags.in_import=True
            with fixture.local_user_contacts(run_id):
                insert('User',email=email,first_name='Synthetic '+key,enabled=1,send_welcome_email=0,
                       user_type='System User',language='ar',roles=[{'role':role}])
        finally:
            frappe.flags.in_import=previous
        update_password(email,password,logout_all_sessions=True)
        data['users'][key]=dict(email=email,password=password)
        insert('Kandil Access Grant',user=email,company=data['company'],department=data['department'],
               valid_from=today(),can_manage_recruitment=1,reason='Synthetic Board browser acceptance')
    settings=frappe.get_doc('Kandil Organization Settings',data['company'])
    settings.ceo_approver=data['users']['ceo']['email']
    settings.board_approver=data['users']['chair']['email']
    settings.board_vice_approver=data['users']['vice']['email']
    settings.save(ignore_permissions=True)
    route=frappe.get_doc('Kandil Recruitment Route',{'company':data['company'],'department':data['department']})
    route.ceo_approver=settings.ceo_approver;route.board_approver=settings.board_approver
    route.board_after_ceo=1;route.ceo_for_critical=1;route.save(ignore_permissions=True)
    persist(fixture.path_for(run_id),data)
    frappe.db.commit()
    return dict(run_id=run_id,prepared=True,accounts=len(data['users']),credentials='private-file-only')
