"""Versioned basic-profile corrections with immutable, scoped revision evidence.

Person master changes never rewrite historical application contact snapshots.
Full sensitive disclosures, former/internal links and identity merges are separate.
"""
import hashlib
import json
import re
import uuid

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime

from kandil_hr.candidates import identity
from kandil_hr.candidates.profile import normalize, dump
from kandil_hr.candidates.intake import text
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.recruitment.api import command

REVISION = 'Kandil Candidate Profile Revision'


class KandilCandidateProfileRevision(Document):
    def autoname(self):
        self.name = 'KCR-' + uuid.uuid4().hex

    def validate(self):
        identity.guard()
        if not self.is_new() or not frappe.flags.get('kandil_candidate_identity_effect'):
            identity.deny()

    def on_trash(self):
        identity.deny()

    def before_rename(self, *args, **kwargs):
        identity.deny()


def authorize(request, payload):
    from kandil_hr.recruitment.vacancy_access import check_opening
    from kandil_hr.foundation.teams import candidate_access
    identity.guard()
    opening = frappe.get_doc('Job Opening', payload['opening'], for_update=True)
    check_opening(request, opening)
    app = frappe.get_doc('Job Applicant', payload['application'], for_update=True)
    app.check_permission('read')
    if app.job_title != opening.name or app.custom_kandil_person != payload['person'] or not candidate_access(opening, request):
        frappe.throw(_('Profile correction is outside your current candidate scope.'), frappe.PermissionError)
    person = frappe.get_doc(identity.DT, payload['person'], for_update=True)
    person.check_permission('read')
    if person.company != request.company:
        frappe.throw(_('Candidate company does not match this application.'), frappe.PermissionError)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def correct(name, opening_name, application, person, person_version, profile, reason, command_id, expected_version):
    identity.guard()
    person = text(person, 140)
    application = text(application, 140)
    reason = text(reason, 1000)
    if not person_version:
        frappe.throw(_('Review the current profile version before correcting it.'))
    data = normalize(profile)
    if not data['full_name'] or (not data['email_id'] and len(re.sub(r'\D', '', data['phone_number'])) < 7):
        frappe.throw(_('The candidate profile requires a name and contact method.'))
    payload = dict(opening=opening_name, application=application, person=person,
                   person_version=str(person_version), profile_hash=hashlib.sha256(dump(data).encode()).hexdigest(), reason=reason)

    def act(request):
        current = frappe.get_doc(identity.DT, person, for_update=True)
        if get_datetime(current.modified) != get_datetime(person_version):
            frappe.throw(_('Candidate profile changed. Reload and review the latest version.'), frappe.TimestampMismatchError)
        before = normalize(current.profile_json or '{}')
        if before == data:
            frappe.throw(_('There are no profile changes to record.'))
        # Protected service-only write. Native document/resource edits remain denied.
        frappe.db.set_value(identity.DT, person, 'profile_json', dump(data))
        version = str(frappe.db.get_value(identity.DT, person, 'modified', for_update=True))
        content = dict(person=person, application=application, actor=frappe.session.user, reason=reason,
                       before=before, after=data, before_version=str(person_version), after_version=version)
        with identity.effect():
            revision = frappe.get_doc(dict(doctype=REVISION, person=person, application=application,
                company=request.company, actor=frappe.session.user, reason=reason,
                before_version=str(person_version), after_version=version,
                before_json=dump(before), after_json=dump(data),
                content_hash=hashlib.sha256(json.dumps(content, sort_keys=True, ensure_ascii=False).encode()).hexdigest())).insert(ignore_permissions=True)
        return dict(person=person, person_version=version, revision=revision.name, application=application)

    return command(name, 'candidate_profile_correct', command_id, expected_version, payload, act)
