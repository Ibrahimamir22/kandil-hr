"""CLI-only catalog authority extension for an exact synthetic candidate cohort."""
import frappe
from frappe.utils import today
from kandil_hr.portal import candidate_fixture


def prepare(run_id):
    candidate_fixture.prepare(run_id)
    data=candidate_fixture.load(run_id)
    grants=frappe.get_all('Kandil Access Grant',filters={'user':data['users']['hr']['email'],'company':data['company']},pluck='name')
    if len(grants)!=1:raise RuntimeError('Expected one synthetic HR grant')
    frappe.get_doc(dict(doctype='Kandil Access Grant',user=data['users']['hr']['email'],company=data['company'],valid_from=today(),can_manage_recruitment=1,reason='Synthetic company HR catalog authority')).insert(ignore_permissions=True)
    frappe.db.commit();return dict(prepared=True,company_hr_grant=True)


def revoke_hr(run_id):
    data=candidate_fixture.load(run_id)
    for name in frappe.get_all('Kandil Access Grant',filters={'user':data['users']['hr']['email'],'company':data['company']},pluck='name'):
        doc=frappe.get_doc('Kandil Access Grant',name);doc.revoked=1;doc.save(ignore_permissions=True)
    frappe.db.commit();return dict(revoked=True)


def restore_hr(run_id):
    # Create a new scoped cleanup grant if this disposable cohort's HR grants
    # were revoked. Old grants remain revoked; review accounts are untouched.
    data=candidate_fixture.load(run_id)
    if not frappe.db.exists('Kandil Access Grant',{'user':data['users']['hr']['email'],'company':data['company'],'revoked':0}):
        frappe.get_doc(dict(doctype='Kandil Access Grant',user=data['users']['hr']['email'],company=data['company'],department=data['department'],valid_from=today(),can_manage_recruitment=1,reason='Synthetic cleanup after catalog revocation test')).insert(ignore_permissions=True)
    frappe.db.commit();return dict(restored_for_cleanup=True)
