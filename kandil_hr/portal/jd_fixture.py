"""CLI-only JD portal cohort, synthetic accounts retired after browser proof."""
import json
import frappe
from kandil_hr.portal import fixture as base, structure_fixture
from kandil_hr.recruitment.browser_fixture import guard


def prepare(run_id):
    return structure_fixture.prepare(run_id)


def inspect(run_id):
    guard(run_id);data=json.loads(base.path_for(run_id).read_text())
    rows=frappe.get_all('Kandil JD Revision',filters={'company':data['company']},
        fields=['name','position','status','revision','supersedes','valid_from','approved_by'],order_by='creation')
    names=[r.name for r in rows]
    return dict(revisions=rows,audit=frappe.get_all('Kandil Command Audit',filters={'target_name':['in',names]},
        fields=['target_name','operation','actor'],order_by='creation') if names else [])


def cleanup(run_id):
    return structure_fixture.cleanup(run_id)


def revoke_history_reader(run_id):
    """Retire only this synthetic cohort's recruiter grants for revocation proof."""
    guard(run_id);data=json.loads(base.path_for(run_id).read_text())
    for name in frappe.get_all('Kandil Access Grant',filters={'user':data['users']['recruiter']['email'],'company':data['company']},pluck='name'):
        doc=frappe.get_doc('Kandil Access Grant',name);doc.revoked=1;doc.save(ignore_permissions=True)
    frappe.db.commit();return dict(revoked=True)
