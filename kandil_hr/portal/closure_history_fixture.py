"""CLI-only storage simulation, never an authorized candidate reopening.

Used solely to review history across cycles before the real consent/leadership
workflow exists. Refuses every site/cohort except the active parity fixture.
"""
import uuid
import frappe
from frappe.utils import now_datetime
from kandil_hr.portal.recovery_fixture import cohort
from kandil_hr.candidates import closure, closure_history, activities


def reopen_storage(run_id, application):
    data=cohort(run_id)
    app=frappe.get_doc('Job Applicant',application)
    opening=frappe.get_doc('Job Opening',app.job_title)
    if opening.company!=data['company'] or opening.custom_kandil_request!=data['candidate']['request']:
        raise RuntimeError('Application is outside the active synthetic cohort')
    closure.lock_application(app.name)
    task=frappe.get_doc(closure.DT,closure.existing(app.name,current=True))
    if app.status!='Rejected' or task.company!=data['company']:
        raise RuntimeError('Expected closed synthetic application')
    before=task.as_dict()
    # Raw insertion is intentional: the production controller rejects all
    # inserts until genuine consent and the reviewed command are implemented.
    doc=frappe.get_doc(dict(doctype=closure_history.DT,name='KCR-FIXTURE-'+uuid.uuid4().hex,
        closure=task.name,application=app.name,company=task.company,actor=data['users']['hr']['email'],
        reason='إعادة فتح اصطناعية لاختبار السجل / Synthetic history fixture',target_stage='Screening',
        closure_hash=task.content_hash,consent_evidence='SYNTHETIC STORAGE FIXTURE - NOT CONSENT',
        content_hash=activities.digest(task.name),owner='Administrator',modified_by='Administrator',
        creation=now_datetime(),modified=now_datetime()))
    doc.db_insert()
    frappe.db.set_value('Job Applicant',app.name,'status','Replied')
    if before!=frappe.get_doc(closure.DT,task.name).as_dict():raise RuntimeError('Closure was changed')
    frappe.db.commit()
    return dict(storage_simulation=True,not_authorized_reopening=True,closure_unchanged=True)
