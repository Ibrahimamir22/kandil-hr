"""Reviewed candidate closure; internal reasons never become message text.

The immutable decision distinguishes withdrawal from rejection. HRMS's native
Rejected state is the closed projection for both; no upstream enum is changed.
Live downstream commitments require their domain workflow and cannot be erased
by this first closure increment. Message drafts are saved, never sent.
"""
from contextlib import contextmanager
import uuid

import frappe
from frappe import _
from frappe.model.document import Document

from kandil_hr.candidates import activities, identity, work
from kandil_hr.candidates.intake import text
from kandil_hr.catalogs import api as catalog
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.recruitment.api import command

DT = 'Kandil Candidate Closure'
PROCESSES = {'Rejected': 'CANDIDATE_REJECT', 'Withdrawn': 'CANDIDATE_WITHDRAW'}


@contextmanager
def effect():
    old = frappe.flags.get('kandil_candidate_closure_effect')
    frappe.flags.kandil_candidate_closure_effect = True
    try:
        yield
    finally:
        frappe.flags.kandil_candidate_closure_effect = old


class KandilCandidateClosure(Document):
    def autoname(self):
        self.name = 'KCC-' + uuid.uuid4().hex

    def validate(self):
        identity.guard()
        if not self.is_new() or not frappe.flags.get('kandil_candidate_closure_effect'):
            frappe.throw(_('Use the reviewed closure command; closure records are immutable.'), frappe.PermissionError)

    def on_trash(self):
        frappe.throw(_('Closure history cannot be deleted or renamed.'), frappe.PermissionError)

    def before_rename(self, *args, **kwargs):
        self.on_trash()


def validate_input(decision, reason_code, catalog_version, internal_note, candidate_message):
    if not isinstance(decision, str) or decision not in PROCESSES:
        frappe.throw(_('Choose rejection or withdrawal.'))
    reason_code = text(reason_code, 80)
    catalog_version = text(catalog_version, 140)
    internal_note = text(internal_note, 2000, False)
    candidate_message = text(candidate_message, 2000, False)
    if decision == 'Withdrawn' and candidate_message:
        frappe.throw(_('A withdrawal does not create a rejection-message draft.'))
    return reason_code, catalog_version, internal_note, candidate_message


def existing(application, current=False):
    return frappe.db.get_value(DT, {'application': application}, 'name', for_update=current)


def blockers(app, current=False):
    """Do not collapse accepted/joined or live interview/offer state into closure.

    Company serialization is shared by recruitment mutations. The read-only
    hint is not authorization; execute checks again under the command locks.
    """
    lock = ' FOR UPDATE' if current else ''
    if app.status == 'Rejected' or existing(app.name, current):
        return 'already_closed'
    # HRMS validate() updates a linked Employee Referral without checking its
    # authority here. Source attribution/referral integration must own that
    # separate record; do not introduce an unreviewed side effect in closure.
    if app.get('employee_referral'):
        return 'referral_workflow'
    if frappe.db.sql('SELECT name FROM `tabEmployee` WHERE job_applicant=%s LIMIT 1' + lock, (app.name,)):
        return 'employee_lifecycle'
    offers = frappe.db.sql('SELECT status,custom_kandil_outcome FROM `tabJob Offer` WHERE job_applicant=%s AND docstatus<2 ORDER BY name' + lock, (app.name,), as_dict=True)
    if any(r.custom_kandil_outcome == 'Joined' for r in offers):
        return 'employee_lifecycle'
    if any(r.status == 'Accepted' and r.custom_kandil_outcome not in ('No Show','Withdrawn') for r in offers):
        return 'joining_outcome'
    if app.status == 'Accepted' or any(r.status not in ('Rejected','Cancelled') and r.custom_kandil_outcome not in ('No Show','Withdrawn') for r in offers):
        return 'offer_workflow'
    if frappe.db.sql("SELECT name FROM `tabInterview` WHERE job_applicant=%s AND docstatus<2 AND status IN ('Pending','Under Review') LIMIT 1" + lock, (app.name,)):
        return 'interview_workflow'
    return None


@frappe.whitelist(methods=['POST'])
@transactional_retry
def close(name, opening_name, application, application_version, decision, reason_code,
          catalog_version, internal_note, candidate_message, command_id, expected_version):
    identity.guard()
    reason_code, catalog_version, internal_note, candidate_message = validate_input(
        decision, reason_code, catalog_version, internal_note, candidate_message)
    payload = dict(opening=text(opening_name,140), application=text(application,140),
        application_version=text(application_version,140), decision=decision,
        reason_code=reason_code, catalog_version=catalog_version,
        internal_note_hash=activities.digest(internal_note), candidate_message_hash=activities.digest(candidate_message))

    def act(request):
        from kandil_hr.recruitment import ownership
        app = work.authorize(request, payload)
        activities.reviewed(app, application_version)
        blocker = blockers(app, current=True)
        if blocker:
            frappe.throw(_('Closure is unavailable ({0}). Review the related application workflow.').format(blocker))
        config = catalog.state(request.company, PROCESSES[decision], current=True)
        if config['version'] != catalog_version:
            frappe.throw(_('Reasons changed. Refresh and review this decision.'), frappe.TimestampMismatchError)
        reason = next((r for r in config['items'] if r['code'] == reason_code and r['active']), None)
        if not reason:
            frappe.throw(_('Choose an active reason from the correct list.'))
        if reason['requires_note'] and len(internal_note) < 3:
            frappe.throw(_('Explain the internal reason.'))
        values = dict(application=app.name, company=request.company, actor=frappe.session.user,
            decision=decision, previous_status=app.status, reason_code=reason_code,
            reason_label_ar=reason['label_ar'], reason_label_en=reason['label_en'],
            catalog_version=catalog_version, internal_note=internal_note,
            candidate_message=candidate_message, message_status='Pending' if decision=='Rejected' else 'Not applicable')
        with effect():
            record = frappe.get_doc(dict(doctype=DT, **values, content_hash=activities.digest(values))).insert(ignore_permissions=True)
            app.status = 'Rejected'
            # Closure authority comes from current candidate team scope. Clearing
            # follow-up is a required closure effect, not a new task assignment.
            ownership.store(app, app.custom_kandil_responsible_user, 'Application closed through reviewed candidate decision.',
                'Application closed', next_owner='', task='', due=None)
        stage = activities.append(app, request, 'STAGE', '', '', stage=dict(stage_from=values['previous_status'],stage_to=decision))
        return dict(application=app.name, application_version=str(app.modified), closure=record.name,
            decision=decision, activity=stage.name, message_status=values['message_status'], sent=False)

    return command(name, 'candidate_close', command_id, expected_version, payload, act)


@frappe.whitelist(methods=['GET'])
def context(name):
    from kandil_hr.portal import candidates
    from kandil_hr.portal.organization import bounded_text
    from kandil_hr.foundation.security import request_scope
    from kandil_hr.recruitment.vacancy_access import identity_labels
    candidates.access()
    app = candidates.readable_application(bounded_text(name))
    opening = frappe.get_doc('Job Opening', app.job_title)
    request = frappe.get_doc('Kandil Hiring Request', opening.custom_kandil_request)
    record_name = existing(app.name)
    record = None
    if record_name:
        doc = frappe.get_doc(DT, record_name)
        record = {k:doc.get(k) for k in ('name','decision','reason_code','reason_label_ar','reason_label_en','internal_note','candidate_message','message_status','creation')}
        record['actor_label'] = identity_labels([doc.actor]).get(doc.actor)
        from kandil_hr.candidates.messages import resolution
        done=resolution(doc.name)
        if done:record['message_status']=done.outcome
    blocked = blockers(app)
    can_close = bool(identity.enabled() and app.has_permission('write') and request_scope(request,frappe.session.user,'manage') and not blocked)
    return dict(application=app.name, application_version=str(app.modified), request=request.name,
        opening=opening.name, expected_version=str(request.modified), can_close=can_close,
        blocker=blocked, closure=record,
        catalogs={decision:catalog.state(request.company,process) for decision,process in PROCESSES.items()} if can_close else {})


def validate_applicant(doc, method=None):
    """Native form/API changes cannot bypass or silently reopen a closed decision."""
    from kandil_hr.recruitment.models import enabled
    from kandil_hr.pilot.models import internal
    if not enabled() or doc.is_new():
        return
    old = doc.get_doc_before_save()
    if not old:
        return
    lock_application(doc.name)
    if existing(doc.name, current=True) and doc.status != 'Rejected':
        frappe.throw(_('Reopening requires a reviewed candidate lifecycle command.'),frappe.PermissionError)
    if identity.enabled() and doc.custom_kandil_person and old.status != 'Rejected' and doc.status == 'Rejected' and not (frappe.flags.get('kandil_candidate_closure_effect') or internal()):
        frappe.throw(_('Use the reviewed candidate closure action.'),frappe.PermissionError)


def validate_downstream(doc, method=None):
    """No new/live interview or offer may be attached to a reviewed closed file."""
    from kandil_hr.recruitment.models import enabled
    if enabled() and doc.get('job_applicant'):
        lock_application(doc.job_applicant)
        if existing(doc.job_applicant, current=True):
            frappe.throw(_('This application is closed. Reopen it through a reviewed lifecycle workflow first.'),frappe.PermissionError)


def lock_application(name):
    opening = frappe.db.get_value('Job Applicant',name,'job_title')
    company = frappe.db.get_value('Job Opening',opening,'company') if opening else None
    if company:
        frappe.db.sql('SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE',(company,))
    frappe.db.sql('SELECT name FROM `tabJob Applicant` WHERE name=%s FOR UPDATE',(name,))
