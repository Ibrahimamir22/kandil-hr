"""CLI-only transient-expiry probes scoped to an active synthetic cohort."""
import frappe
from frappe.utils import add_to_date
from kandil_hr.portal.candidate_fixture import load
from kandil_hr.candidates import recovery


def cohort(run_id):
    data=load(run_id)
    if not data['candidate']['lease'] or not frappe.conf.get('kandil_candidate_identity_enabled'):
        raise RuntimeError('Expected active synthetic candidate lease')
    return data


def age_recovery(run_id,name):
    data=cohort(run_id)
    doc=frappe.get_doc(recovery.DT,name,for_update=True)
    if doc.request!=data['candidate']['request'] or doc.actor not in [u['email'] for u in data['users'].values()]:
        raise RuntimeError('Recovery does not belong to this synthetic cohort')
    if doc.status not in ('Pending','Completed'):raise RuntimeError('Expected live recovery envelope')
    frappe.db.set_value(recovery.DT,name,'expires_at',add_to_date(recovery.now_datetime(),seconds=-1))
    frappe.db.commit()
    return dict(aged=True)


def expire_recovery(run_id):
    data=cohort(run_id)
    # Exercise the real bounded cleanup, refusing to touch another cohort.
    outside=frappe.db.sql("""SELECT name FROM `tabKandil Candidate Recovery`
        WHERE status IN ('Pending','Completed') AND request!=%s
        AND COALESCE(expires_at,DATE_ADD(creation,INTERVAL 168 HOUR))<=%s LIMIT 1""",
        (data['candidate']['request'],recovery.now_datetime()))
    if outside:raise RuntimeError('Expired records outside this cohort require separate cleanup')
    result=recovery.expire_pending(500)
    rows=frappe.get_all(recovery.DT,filters={'request':data['candidate']['request']},fields=['name','status','payload_cipher'])
    frappe.db.commit()
    return dict(**result,rows=[dict(name=r.name,status=r.status,has_payload=bool(r.payload_cipher)) for r in rows])


def expire_sessions(run_id):
    data=cohort(run_id)
    from frappe.sessions import clear_sessions
    user=data['users']['recruiter']['email']
    clear_sessions(user=user,force=True)
    frappe.db.commit()
    return dict(sessions_revoked=True,remaining=frappe.db.count('Sessions',{'user':user}))
