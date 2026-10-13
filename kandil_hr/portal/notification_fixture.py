"""CLI-only delivered-message cohort; no general worker or external mail."""
import json
import uuid
import frappe
from kandil_hr.foundation import outbox
from kandil_hr.portal import fixture
from kandil_hr.portal.api import save_draft
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as


def prepare(run_id):
    guard(run_id);fixture.prepare(run_id)
    data=json.loads(fixture.path_for(run_id).read_text())
    with acting_as(data['users']['requester']['email']):
        request=save_draft(payload=dict(company=data['company'],department=data['department'],title='Inbox request · طلب تجريبي',requested_position=data['positions'][0],need_reason='Expansion',requested_priority='Normal',lines=[dict(capacity=data['capacities'][0],requested_qty=1)]),command_id=uuid.uuid4().hex)['name']
    data['inbox']={'request':request,'receipts':[]}
    for i in range(29):
        key=outbox.enqueue(uuid.uuid4().hex,data['users']['hr']['email'],f'Update {i:02d} · تحديث',body='متابعة الطلب · Follow up request' if i else '<img src=x onerror="window.inboxInjected=true">',reference_doctype='Kandil Hiring Request',reference_name=request)
        if outbox.deliver(key)!='Delivered locally':raise RuntimeError('Local delivery failed')
        data['inbox']['receipts'].append(frappe.db.get_value('Kandil Notification Outbox',key,'notification_log'))
    account=outbox.enqueue(uuid.uuid4().hex,data['users']['hr']['email'],'Account update · تحديث الحساب')
    if outbox.deliver(account)!='Delivered locally':raise RuntimeError('Account alert delivery failed')
    key=outbox.enqueue(uuid.uuid4().hex,data['users']['requester']['email'],'Other recipient private',reference_doctype='Kandil Hiring Request',reference_name=request)
    outbox.deliver(key);data['inbox']['other']=frappe.db.get_value('Kandil Notification Outbox',key,'notification_log')
    persist(fixture.path_for(run_id),data);frappe.db.commit();return dict(prepared=True,delivered=30)


def revoke(run_id):
    guard(run_id);data=json.loads(fixture.path_for(run_id).read_text())
    if data['company']!=f'Kandil PORTAL TEST {run_id}':raise RuntimeError('Invalid fixture scope')
    # Keep read-only access for HR cleanup on separate helper identity; here revoke HR only.
    grants=frappe.get_all('Kandil Access Grant',filters={'company':data['company'],'user':data['users']['hr']['email']},pluck='name')
    for name in grants:
        grant=frappe.get_doc('Kandil Access Grant',name);grant.revoked=1;grant.save(ignore_permissions=True)
    data['inbox']['revoked_grants']=grants;persist(fixture.path_for(run_id),data);frappe.db.commit();return dict(revoked=True)


def cleanup(run_id):
    guard(run_id);data=json.loads(fixture.path_for(run_id).read_text())
    if data['company']!=f'Kandil PORTAL TEST {run_id}':raise RuntimeError('Invalid cleanup company')
    # Preserve revoked grants. Create a distinct, audited, temporary grant for
    # normal cancellation, then retire it after all fixture accounts are disabled.
    temporary=None
    if data['inbox'].get('revoked_grants') and not data.get('cleaned'):
        from frappe.utils import today
        temporary=frappe.get_doc(dict(doctype='Kandil Access Grant',user=data['users']['hr']['email'],company=data['company'],department=data['department'],valid_from=today(),can_manage_recruitment=1,reason='Exact synthetic notification cohort cleanup')).insert(ignore_permissions=True)
    result=fixture.cleanup(run_id)
    if temporary:
        temporary.revoked=1;temporary.save(ignore_permissions=True);frappe.db.commit()
    return result
