"""Candidate-owned APPLY consent service; HTTP access uses the guarded adapter.

Invitation issuance is not consent. A bearer response proves possession of a link,
not verified civil identity. The privacy.portal adapter bounds/rate-limits requests, clears credentials from
framework request capture and serves the separate public UI.
These functions do not send messages, commit transactions or advance a candidate.
"""
from contextlib import contextmanager
import hashlib
import hmac
import json
import re
import uuid

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, get_datetime, now_datetime
from frappe.utils.password import get_encryption_key

from kandil_hr.catalogs.api import digest
from kandil_hr.candidates import identity
from kandil_hr.candidates.intake import text
from kandil_hr.foundation.mutation_access import assert_current_request_scope
from kandil_hr.organization.models import lock_company
from kandil_hr.privacy import notices

INVITATION = 'Kandil Consent Invitation'
ACCEPTANCE = 'Kandil Consent Acceptance'
REVOCATION = 'Kandil Consent Revocation'
PURPOSE = 'APPLY'
LIFETIME_DAYS = 7


@contextmanager
def effect():
    old = frappe.flags.get('kandil_consent_effect')
    frappe.flags.kandil_consent_effect = True
    try:
        yield
    finally:
        frappe.flags.kandil_consent_effect = old


class ImmutableConsentRecord(Document):
    def autoname(self):
        self.name = {INVITATION:'KCI-',ACCEPTANCE:'KCA-',REVOCATION:'KCR-'}[self.doctype] + uuid.uuid4().hex

    def validate(self):
        identity.guard()
        if not self.is_new() or not frappe.flags.get('kandil_consent_effect'):
            self.on_trash()

    def on_trash(self):
        frappe.throw(_('Consent evidence is immutable. Use the reviewed consent workflow.'), frappe.PermissionError)

    def before_rename(self, *args, **kwargs):
        self.on_trash()


class KandilConsentInvitation(ImmutableConsentRecord):
    pass


class KandilConsentAcceptance(ImmutableConsentRecord):
    pass


class KandilConsentRevocation(ImmutableConsentRecord):
    pass


@contextmanager
def atomic():
    point = 'consent_' + uuid.uuid4().hex
    frappe.db.savepoint(point)
    try:
        yield
    except frappe.QueryDeadlockError:
        raise  # Future HTTP adapter retries the whole outer transaction only.
    except Exception:
        frappe.db.rollback(save_point=point)
        frappe.local.document_cache = {}
        raise


def unavailable():
    frappe.throw(_('This consent link is unavailable. Request a new link from recruitment.'), frappe.PermissionError)


def authorize(application):
    """Company -> request -> opening/application/person -> authority; before replay."""
    from kandil_hr.portal.candidates import access, readable_application
    from kandil_hr.recruitment.vacancy_access import check_opening
    identity.guard()
    access()
    first = readable_application(text(application, 140))
    opening_id = first.job_title
    request_id, company = frappe.db.get_value('Job Opening', opening_id, ['custom_kandil_request', 'company'])
    lock_company(company)
    request = frappe.get_doc('Kandil Hiring Request', request_id, for_update=True)
    opening = frappe.get_doc('Job Opening', opening_id, for_update=True)
    app = frappe.get_doc('Job Applicant', first.name, for_update=True)
    check_opening(request, opening)
    if app.job_title != opening.name or company != request.company or not app.custom_kandil_person:
        frappe.throw(_('The application changed. Refresh before issuing consent.'), frappe.PermissionError)
    person = frappe.get_doc(identity.DT, app.custom_kandil_person, for_update=True)
    if person.company != company:
        frappe.throw(_('Candidate company does not match this application.'), frappe.PermissionError)
    settings = frappe.get_doc('Kandil Organization Settings', company, for_update=True)
    roles = assert_current_request_scope(request, required_roles=('Kandil Recruiter',))
    actor = frappe.session.user
    leadership = (settings.hr_approver == actor or
                  (settings.sector_approver == actor and 'Kandil Sector Approver' in roles))
    team = actor == opening.custom_kandil_lead or any(row.user == actor for row in opening.get('custom_kandil_team') or [])
    if actor != 'Administrator' and not (leadership or team):
        frappe.throw(_('You no longer have access to this candidate team.'), frappe.PermissionError)
    for doc in (request, opening, app, person):
        doc.check_permission('read')
    app.check_permission('write')
    return request, opening, app, person


def latest(company, person):
    rows = frappe.db.sql('SELECT name FROM `tabKandil Consent Invitation` WHERE company=%s AND person=%s AND purpose=%s ORDER BY sequence DESC LIMIT 1 FOR UPDATE', (company, person, PURPOSE))
    return frappe.get_doc(INVITATION, rows[0][0], for_update=True) if rows else None


def acceptance(company, person):
    """Historical APPLY evidence, not a complete retention/withdrawal eligibility gate."""
    name = frappe.db.get_value(ACCEPTANCE, {'subject_key': digest([company, person, PURPOSE])}, 'name', for_update=True)
    return frappe.get_doc(ACCEPTANCE, name, for_update=True) if name else None


def capability(invitation):
    # Domain-separated MAC over an opaque random invitation name. Only its hash is
    # persisted. Site-key rotation requires a replacement pending invitation.
    message = '\0'.join(('kandil-consent-v1', invitation.name, invitation.company, invitation.person, invitation.purpose))
    return hmac.new(get_encryption_key().encode(), message.encode(), hashlib.sha256).hexdigest()


def token_hash(token):
    if not isinstance(token, str) or not re.fullmatch('[0-9a-f]{64}', token):
        unavailable()
    return hashlib.sha256(token.encode()).hexdigest()


def live_context(request, opening, app, person):
    if (request.status != 'Approved' or opening.custom_kandil_vacancy_state not in ('Open', 'Partially Filled')
            or person.company != request.company or app.custom_kandil_person != person.name
            or app.job_title != opening.name):
        unavailable()


def issue(application, expected_invitation, notice_revision, reason, command_id):
    """Authenticated internal issuer. Response contains NO capability or candidate consent."""
    application = text(application, 140)
    expected_invitation = text(expected_invitation, 140, False)
    notice_revision = text(notice_revision, 140)
    reason = text(reason, 1000)
    command_id = text(command_id, 100)
    if len(reason) < 3:
        frappe.throw(_('Explain issuing or replacing the consent link.'))
    request, opening, app, person = authorize(application)
    key = digest([request.company, frappe.session.user, command_id])
    signature = digest([application, expected_invitation, notice_revision, reason, PURPOSE])
    prior = frappe.db.get_value(INVITATION, {'command_key': key}, ['name', 'signature'], as_dict=True, for_update=True)
    if prior:
        if prior.signature != signature:
            frappe.throw(_('This command was already used for different consent-link details.'))
        # A waiting transaction may retain an older consistent-read snapshot.
        # Load the receipt with a current read after finding its locked key.
        return receipt(frappe.get_doc(INVITATION, prior.name, for_update=True))
    live_context(request, opening, app, person)
    if acceptance(request.company, person.name):
        frappe.throw(_('This person already has candidate-owned APPLY consent evidence.'))
    current = latest(request.company, person.name)
    if expected_invitation != (current.name if current else ''):
        frappe.throw(_('The consent link changed. Refresh before replacing it.'), frappe.TimestampMismatchError)
    notice = notices.published(request.company, current=True)
    if not notice or notice['version'] != notice_revision:
        frappe.throw(_('Review the current published privacy notice before issuing a link.'), frappe.TimestampMismatchError)
    with atomic(), effect():
        doc = frappe.get_doc(dict(doctype=INVITATION, company=request.company, person=person.name,
            application=app.name, request=request.name, actor=frappe.session.user, purpose=PURPOSE,
            sequence=current.sequence + 1 if current else 1, previous_invitation=current.name if current else '',
            notice_revision=notice_revision, notice_hash=notice['content_hash'], expires_at=add_days(now_datetime(), LIFETIME_DAYS),
            command_key=key, signature=signature, reason=reason))
        doc.autoname()
        doc.token_hash = token_hash(capability(doc))
        # Preserve the random name used by capability derivation across insertion.
        doc.insert(ignore_permissions=True, set_name=doc.name)
        return receipt(doc)


def receipt(doc):
    return dict(invitation=doc.name, notice_revision=doc.notice_revision, expires_at=str(doc.expires_at), candidate_consent_recorded=False)


def pending(doc):
    current = latest(doc.company, doc.person)
    notice = notices.published(doc.company, current=True)
    if (revocation(doc.name) or not current or current.name != doc.name or get_datetime(doc.expires_at) <= now_datetime()
            or not notice or notice['version'] != doc.notice_revision or notice['content_hash'] != doc.notice_hash):
        unavailable()
    request = frappe.get_doc('Kandil Hiring Request', doc.request, for_update=True)
    app = frappe.get_doc('Job Applicant', doc.application, for_update=True)
    opening = frappe.get_doc('Job Opening', app.job_title, for_update=True)
    person = frappe.get_doc(identity.DT, doc.person, for_update=True)
    if request.company != doc.company or opening.custom_kandil_request != request.name:
        unavailable()
    live_context(request, opening, app, person)
    return notice, app, opening


def reveal(application, invitation):
    """Original issuer with current scope only; HTTP adapter returns no-store."""
    request, _, _, person = authorize(application)
    doc = frappe.get_doc(INVITATION, text(invitation, 140), for_update=True)
    if (doc.application != application or doc.company != request.company or doc.person != person.name
            or doc.actor != frappe.session.user or acceptance(doc.company, doc.person)):
        unavailable()
    pending(doc)
    token = capability(doc)
    if not hmac.compare_digest(token_hash(token), doc.token_hash):
        unavailable()  # Site encryption key changed: replace the pending link.
    return token


def resolve(token):
    identity.guard()
    if frappe.session.user != 'Guest':
        unavailable()  # Staff UI must never record candidate acceptance on behalf.
    hashed = token_hash(token)
    row = frappe.db.get_value(INVITATION, {'token_hash': hashed}, ['name', 'company'], as_dict=True)
    if not row:
        unavailable()
    lock_company(row.company)
    doc = frappe.get_doc(INVITATION, row.name, for_update=True)
    if not hmac.compare_digest(doc.token_hash, hashed):
        unavailable()
    return doc


def preview(token):
    doc = resolve(token)
    recorded = acceptance(doc.company, doc.person)
    if recorded:
        if recorded.invitation != doc.name:
            unavailable()
        return dict(status='accepted')
    notice, app, opening = pending(doc)
    # No email, phone, internal IDs, private history, compensation or CV.
    return dict(status='pending', first_name=(app.applicant_name or '').split(' ')[0][:100],
        job_title=opening.job_title, notice_revision=notice['version'], notice_hash=notice['content_hash'],
        notice=notice['notice'], expires_at=str(doc.expires_at))


def accept(token, notice_revision, notice_hash, accepted, transfer_accepted):
    """Single-use, exact-version response; exposed only through the guarded adapter."""
    if type(accepted) is not bool or not accepted or type(transfer_accepted) is not bool:
        unavailable()
    if not isinstance(notice_revision, str) or len(notice_revision) > 140 or not isinstance(notice_hash, str) or len(notice_hash) != 64:
        unavailable()
    doc = resolve(token)
    signature = digest([doc.name, notice_revision, notice_hash, accepted, transfer_accepted, PURPOSE])
    recorded = acceptance(doc.company, doc.person)
    if recorded:
        if recorded.invitation != doc.name or recorded.acceptance_hash != signature:
            unavailable()
        return dict(status='accepted')  # Exact retry, even after expiry or notice publication.
    notice, _, _ = pending(doc)
    if (notice_revision != doc.notice_revision or notice_hash != doc.notice_hash
            or transfer_accepted != notice['notice']['transfer_required']):
        unavailable()
    with atomic(), effect():
        frappe.get_doc(dict(doctype=ACCEPTANCE, company=doc.company, person=doc.person, application=doc.application,
            invitation=doc.name, purpose=PURPOSE, subject_key=digest([doc.company, doc.person, PURPOSE]),
            notice_revision=doc.notice_revision, notice_hash=doc.notice_hash, accepted_at=now_datetime(),
            transfer_accepted=int(transfer_accepted), acceptance_hash=signature, evidence_kind='Bearer link')).insert(ignore_permissions=True)
        return dict(status='accepted')


def revocation(invitation):
    return frappe.db.get_value(REVOCATION,{'invitation':invitation},
        ['name','actor','reason','creation'],as_dict=True,for_update=True)


def revocation_authority(request, invitation):
    """Current issuer or configured HR/sector leadership; never native read grants."""
    from kandil_hr.foundation.mutation_access import current_identity
    roles=current_identity(frappe.session.user)
    if frappe.session.user=='Administrator':return True
    if 'Kandil Recruiter' not in roles:return False
    settings=frappe.get_doc('Kandil Organization Settings',request.company,for_update=True)
    return bool(invitation.actor==frappe.session.user or settings.hr_approver==frappe.session.user
        or (settings.sector_approver==frappe.session.user and 'Kandil Sector Approver' in roles))


def revoke(application, invitation, reason, command_id):
    """Disable a current unaccepted link without replacement or consent withdrawal."""
    application=text(application,140);invitation=text(invitation,140)
    reason=text(reason,1000);command_id=text(command_id,100)
    if len(reason)<3:frappe.throw(_('Explain why this invitation must be revoked.'))
    request,opening,app,person=authorize(application)
    doc=frappe.get_doc(INVITATION,invitation,for_update=True)
    if (doc.application!=app.name or doc.company!=request.company or doc.person!=person.name
            or not revocation_authority(request,doc)):
        frappe.throw(_('Only the current issuer or recruitment leadership may revoke this link.'),frappe.PermissionError)
    key=digest([request.company,frappe.session.user,command_id])
    signature=digest([application,invitation,reason])
    prior=frappe.db.get_value(REVOCATION,{'command_key':key},['name','signature'],as_dict=True,for_update=True)
    if prior:
        if prior.signature!=signature:frappe.throw(_('This revocation command was used with different details.'))
        return dict(invitation=invitation,revocation=prior.name,consent_withdrawn=False)
    if acceptance(doc.company,doc.person):
        frappe.throw(_('Acceptance is already recorded. Revoking a pending link cannot withdraw consent.'))
    current=latest(doc.company,doc.person)
    if not current or current.name!=invitation:
        frappe.throw(_('This invitation was replaced. Refresh before revoking the current link.'),frappe.TimestampMismatchError)
    if revocation(invitation):
        frappe.throw(_('This invitation is already revoked. Refresh its history.'))
    with atomic(),effect():
        event=frappe.get_doc(dict(doctype=REVOCATION,company=doc.company,person=doc.person,
            application=app.name,invitation=doc.name,actor=frappe.session.user,reason=reason,
            command_key=key,signature=signature,notice_revision=doc.notice_revision)).insert(ignore_permissions=True)
        return dict(invitation=invitation,revocation=event.name,consent_withdrawn=False)


def schema_proof():
    """CLI-only muted synthetic sites; hashes rather than record payloads."""
    from kandil_hr.candidates.closure_history import schema_proof as foundation_proof
    proof=foundation_proof()  # Enforces exact site, Administrator, CLI and muted/test gates.
    for dt in (notices.DT,INVITATION,ACCEPTANCE,REVOCATION):
        if not frappe.db.table_exists(dt):proof['tables'][dt]=None
        else:
            rows=frappe.get_all(dt,fields=['*'],order_by='name asc',limit_page_length=0)
            proof['tables'][dt]=dict(count=len(rows),sha256=hashlib.sha256(json.dumps(rows,sort_keys=True,default=str).encode()).hexdigest())
    return proof
