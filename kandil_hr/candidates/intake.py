"""Reviewed recruiter intake and explicit conservative legacy binding.

Company/request/opening locks and command receipts are inherited from recruitment.
Identity linking never grants access to the person's other applications.
"""
import hashlib
import re

import frappe
from frappe import _
from frappe.utils import get_datetime

from kandil_hr.candidates import identity
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.recruitment.api import command, dump


def text(value, maximum, required=True):
    if not isinstance(value, str) or len(value.strip()) > maximum or (required and not value.strip()):
        frappe.throw(_('Enter valid bounded candidate details.'))
    return value.strip()


def authorize(request, operation, payload):
    """Run before receipt replay, after command's current role/grant locks."""
    from kandil_hr.recruitment.vacancy_access import check_opening
    from kandil_hr.foundation.teams import candidate_access
    identity.guard()
    opening = frappe.get_doc('Job Opening', payload['opening'], for_update=True)
    check_opening(request, opening)
    if not candidate_access(opening, request) or not frappe.has_permission('Job Applicant', 'create'):
        frappe.throw(_('This candidate intake is outside your recruitment permissions.'), frappe.PermissionError)
    probe = frappe.get_doc(dict(doctype='Job Applicant', job_title=opening.name))
    probe.check_permission('create')
    if operation == 'candidate_identity_migrate':
        from kandil_hr.recruitment.ownership import current_manager
        if not current_manager(request):
            frappe.throw(_('Only the configured HR authority may review legacy identity.'), frappe.PermissionError)
        app = frappe.get_doc('Job Applicant', payload['application'], for_update=True)
        if app.job_title != opening.name:
            frappe.throw(_('The application is not in this reviewed vacancy.'), frappe.PermissionError)
        app.check_permission('read')
    person_name = payload.get('person')
    if person_name:
        person = frappe.get_doc(identity.DT, person_name, for_update=True)
        person.check_permission('read')
        if person.company != request.company:
            frappe.throw(_('The selected identity belongs to another company.'), frappe.PermissionError)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def create_application(name, opening_name, details, command_id, expected_version,
                       person=None, person_version=None, identity_reason='', profile=None):
    identity.guard()
    if isinstance(details, str) and len(details) > 4000:
        frappe.throw(_('Candidate details are too large.'))
    details = frappe.parse_json(details)
    keys = {'applicant_name', 'email_id', 'phone_number', 'source_channel', 'source_detail'}
    if not isinstance(details, dict) or set(details) != keys:
        frappe.throw(_('Provide name, contacts and reviewed application source.'))
    data = {key: text(details[key], 140, key not in ('email_id', 'phone_number')) for key in keys}
    if not data['email_id'] and len(re.sub(r'\D', '', data['phone_number'])) < 7:
        frappe.throw(_('Provide a valid contact phone or email.'))
    from kandil_hr.candidates.profile import normalize
    if isinstance(profile, str) and len(profile) > 8000:
        frappe.throw(_('Candidate profile is too large.'))
    extra = frappe.parse_json(profile or '{}')
    if not isinstance(extra,dict) or set(extra) & {'full_name','email_id','phone_number'}:
        frappe.throw(_('Name and contact values come from the application details.'))
    if person and extra:
        frappe.throw(_('Existing person profiles are not overwritten by a new application.'))
    person_profile = normalize(dict(extra, full_name=data['applicant_name'], email_id=data['email_id'], phone_number=data['phone_number']))
    person = text(person, 140) if person else None
    reason = text(identity_reason, 1000) if person else ''
    if person and not person_version:
        frappe.throw(_('Review the existing candidate identity before reusing it.'))
    payload = dict(opening=opening_name, profile_hash=hashlib.sha256(dump(person_profile).encode()).hexdigest(), details_hash=hashlib.sha256(dump(data).encode()).hexdigest(),
                   person=person, person_version=str(person_version) if person else None,
                   identity_reason=reason)

    def act(request):
        from kandil_hr.pilot.extensions import pilot_opening
        pilot_opening(opening_name, lock=True)
        candidate = frappe.get_doc(identity.DT, person, for_update=True) if person else identity.new_person(request.company, person_profile)
        if person and get_datetime(candidate.modified) != get_datetime(person_version):
            frappe.throw(_('Candidate identity changed. Review it again.'), frappe.TimestampMismatchError)
        with identity.effect():
            app = frappe.get_doc(dict(doctype='Job Applicant', job_title=opening_name,
                applicant_name=data['applicant_name'], email_id=data['email_id'] or None,
                phone_number=data['phone_number'] or None, custom_kandil_person=candidate.name,
                custom_kandil_identity_origin='Reviewed intake',
                custom_kandil_source_channel=data['source_channel'],
                custom_kandil_source_detail=data['source_detail'])).insert()
        return dict(application=app.name, person=candidate.name, application_version=str(app.modified),
                    person_version=str(candidate.modified))

    return command(name, 'candidate_intake', command_id, expected_version, payload, act)


@transactional_retry
def migrate_application(name, opening_name, application, application_version, command_id, expected_version, preview_hash=None, reason=None):
    """Non-whitelisted migration primitive; caller must review explicit IDs/versions.

    A fresh unreviewed person per legacy application; contacts never drive linking.
    No rename, contact rewrite, source invention or consent claim.
    """
    identity.guard()
    payload = dict(opening=opening_name, application=application, application_version=str(application_version))
    if preview_hash is not None:
        payload.update(preview_hash=preview_hash,reason=text(reason,1000))

    def act(request):
        app = frappe.get_doc('Job Applicant', application, for_update=True)
        if not application_version or get_datetime(app.modified) != get_datetime(application_version):
            frappe.throw(_('Legacy application changed. Review it again.'), frappe.TimestampMismatchError)
        if app.custom_kandil_person:
            frappe.throw(_('This application already has a candidate identity.'))
        from kandil_hr.candidates.migration import review_state,preserved_hash
        reviewed,current_hash=review_state(app,request,frappe.get_doc('Job Opening',opening_name,for_update=True))
        if preview_hash is not None and current_hash!=preview_hash:
            frappe.throw(_('Legacy preview changed. Reload and review it again.'),frappe.TimestampMismatchError)
        if reviewed['issues']:
            frappe.throw(_('Resolve the legacy profile issues before migration.'))
        before=preserved_hash(app,request)
        person = identity.new_person(request.company, reviewed['proposed_profile'])
        frappe.db.set_value('Job Applicant', app.name, {
            'custom_kandil_person': person.name, 'custom_kandil_identity_origin': 'Legacy migration'})
        current=frappe.get_doc('Job Applicant',app.name,for_update=True)
        after=preserved_hash(current,frappe.get_doc(request.doctype,request.name,for_update=True))
        if before!=after:
            frappe.throw(_('Legacy migration reconciliation failed. No changes were saved.'))
        return dict(application=app.name, person=person.name,
                    application_version=str(current.modified),person_version=str(person.modified),
                    reconciliation=dict(preserved=True,before_hash=before,after_hash=after))

    return command(name, 'candidate_identity_migrate', command_id, expected_version, payload, act)


@frappe.whitelist(methods=['POST'])
def duplicate_review(company, email_id='', phone_number='', applicant_name='', after=''):
    """Exact normalized contact/name warnings from current profiles and application snapshots.

    No hidden counts, automatic linking, national IDs or other application history.
    Twenty matches plus a visible-scope continuation hint, not a global identity search.
    """
    from kandil_hr.portal.api import authenticated
    identity.guard()
    authenticated()
    if 'Kandil Recruiter' not in frappe.get_roles() and frappe.session.user != 'Administrator':
        frappe.throw(_('Candidate review requires a recruiter account.'), frappe.PermissionError)
    company = text(company, 140)
    email = text(email_id, 140, False).lower()
    phone = re.sub(r'[^0-9+]', '', text(phone_number, 140, False))
    name = text(applicant_name, 140, False).lower()
    if not email and len(re.sub(r'\D', '', phone)) < 7 and len(name) < 3:
        frappe.throw(_('Provide a contact or full name to review possible duplicates.'))
    from kandil_hr.candidates.search import duplicate_rows
    after = text(after, 140, False)
    rows = duplicate_rows(company, email, phone if len(re.sub(r'\D', '', phone)) >= 7 else '',
                          name if len(name) >= 3 else '', after)
    return dict(rows=rows[:20], has_more=len(rows)>20, next_after=rows[19].application if len(rows)>20 else None,
                policy='Review possible matches; contacts never merge or select a person automatically.')
