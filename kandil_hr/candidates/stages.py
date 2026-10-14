"""Consent-gated Screening and reviewed reopening; no upstream source changes.

Activation is explicit while the portal and migration acceptance are completed.
Historical consent evidence is not a full withdrawal/retention implementation.
"""
from contextlib import contextmanager
import uuid

import frappe
from frappe import _

from kandil_hr.candidates import activities, closure, closure_history, identity, work
from kandil_hr.candidates.intake import text
from kandil_hr.privacy import consent
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.recruitment.api import command

STAGE = 'Screening'
PROTECTED = {'Screening', 'Shortlisted', 'Accepted'}
FLAG = 'kandil_candidate_screening_enabled'


def enabled():
    return identity.enabled() and bool(frappe.conf.get(FLAG))


def guard():
    if not enabled():
        frappe.throw(_('Reviewed candidate screening is not enabled on this site.'), frappe.PermissionError)


def install():
    """Extend the local status metadata without rewriting upstream HRMS files."""
    from kandil_hr.recruitment.models import enabled as recruitment_enabled
    from kandil_hr.pilot.setup import ensure_property_setter
    if not recruitment_enabled():
        return
    values = frappe.get_meta('Job Applicant').get_field('status').options.split('\n')
    if STAGE not in values:
        values.insert(values.index('Replied') + 1, STAGE)
    ensure_property_setter('Job Applicant', 'status', 'options', '\n'.join(values), 'Text')


@contextmanager
def effect():
    old = frappe.flags.get('kandil_candidate_stage_effect')
    frappe.flags.kandil_candidate_stage_effect = True
    try:
        yield
    finally:
        frappe.flags.kandil_candidate_stage_effect = old


def leadership(request):
    from kandil_hr.foundation.mutation_access import current_identity
    roles = current_identity(frappe.session.user)
    if frappe.session.user == 'Administrator':
        return True
    settings = frappe.get_doc('Kandil Organization Settings', request.company, for_update=True)
    return 'Kandil Recruiter' in roles and (
        settings.hr_approver == frappe.session.user or
        (settings.sector_approver == frappe.session.user and 'Kandil Sector Approver' in roles))


def authorize(request, payload, reopen=False):
    guard()
    app = work.authorize(request, payload)
    if reopen and not leadership(request):
        frappe.throw(_('Only configured HR or recruitment leadership may reopen an application.'), frappe.PermissionError)
    return app


def eligibility(app, request):
    """Current locked candidate-owned APPLY evidence, never a recruiter/import note."""
    if not app.custom_kandil_person:
        return None
    person = frappe.get_doc(identity.DT, app.custom_kandil_person, for_update=True)
    if person.company != request.company:
        frappe.throw(_('Candidate identity does not belong to this company.'), frappe.PermissionError)
    record = consent.acceptance(request.company, person.name)
    if not record or record.purpose != consent.PURPOSE or record.evidence_kind != 'Bearer link':
        return None
    return record


def require_consent(app, request):
    record = eligibility(app, request)
    if not record:
        frappe.throw(_('The candidate must accept the privacy notice before screening, interviews or offers.'), frappe.PermissionError)
    return record


def ready(request, app, reopening=False):
    opening = frappe.get_doc('Job Opening', app.job_title, for_update=True)
    if request.status != 'Approved' or opening.custom_kandil_vacancy_state not in ('Open', 'Partially Filled'):
        frappe.throw(_('The vacancy must be active before screening or reopening.'))
    blocker = closure.blockers(app, current=True, include_closed=not reopening)
    if blocker:
        frappe.throw(_('Review the related application workflow before proceeding ({0}).').format(blocker))
    return require_consent(app, request)


def validate_input(reason):
    reason = text(reason, 1000)
    if len(reason) < 3:
        frappe.throw(_('Explain this screening or reopening decision.'))
    return reason


@frappe.whitelist(methods=['POST'])
@transactional_retry
def screen(name, opening_name, application, application_version, reason, command_id, expected_version):
    return execute(False, name, opening_name, application, application_version, reason, command_id, expected_version)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def reopen(name, opening_name, application, application_version, reason, closure_name, closure_hash, command_id, expected_version):
    return execute(True, name, opening_name, application, application_version, reason, command_id, expected_version,
                   text(closure_name, 140), text(closure_hash, 64))


def execute(reopening, name, opening_name, application, application_version, reason, command_id, expected_version,
            closure_name=None, closure_hash=None):
    guard()
    reason = validate_input(reason)
    payload = dict(opening=text(opening_name, 140), application=text(application, 140),
                   application_version=text(application_version, 140), reason_hash=activities.digest(reason))
    if reopening:
        payload.update(closure=closure_name, closure_hash=closure_hash)

    def act(request):
        app = authorize(request, payload, reopen=reopening)
        activities.reviewed(app, application_version)
        old = app.status
        active = closure.existing(app.name, current=True)
        if reopening:
            if old != 'Rejected' or not active or active != closure_name:
                frappe.throw(_('The reviewed closure is no longer current.'), frappe.TimestampMismatchError)
            closed = frappe.get_doc(closure.DT, active, for_update=True)
            if closed.company != request.company or closed.content_hash != closure_hash or closed.decision not in ('Rejected', 'Withdrawn'):
                frappe.throw(_('The closure changed. Refresh and review it.'), frappe.TimestampMismatchError)
        elif old not in ('Open', 'Replied') or active:
            frappe.throw(_('Only a new or contacted application can enter screening through this action.'))
        accepted = ready(request, app, reopening)
        with effect():
            event = None
            if reopening:
                values = dict(closure=closed.name, application=app.name, company=request.company,
                    actor=frappe.session.user, reason=reason, target_stage=STAGE,
                    closure_hash=closed.content_hash, consent_evidence=accepted.name)
                event = frappe.get_doc(dict(doctype=closure_history.DT, name='KRO-'+uuid.uuid4().hex,
                    **values, content_hash=activities.digest(values))).insert(ignore_permissions=True)
            app.status = STAGE
            app.save(ignore_permissions=True)
            activity = activities.append(app, request, 'STAGE', '', reason,
                stage=dict(stage_from=closed.decision if reopening else old, stage_to=STAGE))
        return dict(application=app.name, application_version=str(app.modified), stage=STAGE,
            reopening=event.name if event else None, closure=closure_name, activity=activity.name,
            consent_evidence=accepted.name, sent=False)

    return command(name, 'candidate_reopen' if reopening else 'candidate_screen', command_id,
                   expected_version, payload, act)


@frappe.whitelist(methods=['GET'])
def context(name):
    if not enabled():
        return dict(enabled=False)
    request, opening, app, person = consent.authorize(name)
    active = closure.existing(app.name, current=True)
    closed = frappe.get_doc(closure.DT, active, for_update=True) if active else None
    accepted = eligibility(app, request)
    blocker = closure.blockers(app, current=True, include_closed=False)
    live = request.status == 'Approved' and opening.custom_kandil_vacancy_state in ('Open', 'Partially Filled')
    can_reopen = bool(closed and app.status == 'Rejected' and leadership(request))
    return dict(enabled=True, application=app.name, application_version=str(app.modified),
        request=request.name, opening=opening.name, expected_version=str(request.modified),
        status=app.status, consent_recorded=bool(accepted), vacancy_active=live, blocker=blocker,
        closure=closed.name if closed else None, closure_hash=closed.content_hash if closed else None,
        can_screen=bool(not active and app.status in ('Open', 'Replied') and live and accepted and not blocker),
        can_reopen=bool(can_reopen and live and accepted and not blocker))


def validate_applicant(doc, method=None):
    """Native saves/imports cannot invent Screening or bypass candidate consent."""
    from kandil_hr.recruitment.models import enabled as recruitment_enabled
    if not recruitment_enabled():
        return
    old = doc.get_doc_before_save()
    from kandil_hr.pilot.models import internal
    if old and old.status == STAGE and doc.status != STAGE and not internal():
        frappe.throw(_('Use a reviewed candidate workflow to leave Screening.'), frappe.PermissionError)
    entering = doc.status == STAGE and (doc.is_new() or not old or old.status != STAGE)
    if entering and (not enabled() or not frappe.flags.get('kandil_candidate_stage_effect')):
        frappe.throw(_('Use the reviewed Screening or reopening action.'), frappe.PermissionError)
    if enabled() and doc.status in PROTECTED:
        from kandil_hr.organization.models import lock_company
        lock_company(frappe.db.get_value('Job Opening', doc.job_title, 'company'))
        closure.lock_application(doc.name)
        opening = frappe.get_doc('Job Opening', doc.job_title, for_update=True)
        request = frappe.get_doc('Kandil Hiring Request', opening.custom_kandil_request, for_update=True)
        require_consent(doc, request)


def validate_downstream(doc, method=None):
    if not enabled() or not doc.get('job_applicant'):
        return
    closure.lock_application(doc.job_applicant)
    app = frappe.get_doc('Job Applicant', doc.job_applicant, for_update=True)
    opening = frappe.get_doc('Job Opening', app.job_title, for_update=True)
    request = frappe.get_doc('Kandil Hiring Request', opening.custom_kandil_request, for_update=True)
    require_consent(app, request)


def schema_proof():
    """CLI-only schema evidence on muted isolated sites; no private payload output."""
    import hashlib
    import json
    proof = consent.schema_proof()
    rows = frappe.get_all('Kandil Candidate Recovery', fields=['*'], order_by='name asc', limit_page_length=0)
    proof['tables']['Kandil Candidate Recovery'] = dict(count=len(rows), sha256=hashlib.sha256(json.dumps(rows, sort_keys=True, default=str).encode()).hexdigest())
    proof['status_options'] = frappe.get_meta('Job Applicant').get_field('status').options.split('\n')
    proof['screening_enabled'] = bool(frappe.conf.get(FLAG))
    return proof
