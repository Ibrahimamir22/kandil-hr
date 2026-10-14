"""Versioned company privacy notices; publication is never candidate consent.

No defaults or legal wording are generated. The configured company HR authority
publishes an exact bilingual snapshot. Future candidate-owned acceptance must
reference its immutable revision and hash; recruiter actions cannot accept it.
"""
from contextlib import contextmanager
import json
import uuid

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import validate_email_address

from kandil_hr.catalogs import api as catalogs
from kandil_hr.candidates.intake import text
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.portal.organization import paging
from kandil_hr.recruitment.models import guard

DT = 'Kandil Privacy Notice Revision'
FIELDS = {'employer_ar','employer_en','contact_email','notice_ar','notice_en',
          'transfer_required','transfer_ar','transfer_en','active'}
EMPTY = 'EMPTY:' + catalogs.digest(None)


@contextmanager
def effect():
    before = frappe.flags.get('kandil_privacy_notice_effect')
    frappe.flags.kandil_privacy_notice_effect = True
    try:
        yield
    finally:
        frappe.flags.kandil_privacy_notice_effect = before


class KandilPrivacyNoticeRevision(Document):
    def autoname(self):
        self.name = 'KPN-' + self.command_key

    def validate(self):
        guard()
        if not self.is_new() or not frappe.flags.get('kandil_privacy_notice_effect'):
            frappe.throw(_('Use the notice editor; privacy notice revisions are immutable.'), frappe.PermissionError)

    def on_trash(self):
        frappe.throw(_('Privacy notice history cannot be deleted or renamed.'), frappe.PermissionError)

    def before_rename(self, *args, **kwargs):
        self.on_trash()


def normalize(values):
    if isinstance(values, str):
        if len(values) > 40000:
            frappe.throw(_('The notice is too large.'))
        values = frappe.parse_json(values)
    if not isinstance(values, dict) or set(values) != FIELDS:
        frappe.throw(_('Privacy notice fields are invalid.'))
    for key in ('transfer_required', 'active'):
        if type(values[key]) is not bool:
            frappe.throw(_('Choose explicit publication and transfer options.'))
    row = {key:text(values[key],limit,required) for key,limit,required in (
        ('employer_ar',160,True),('employer_en',160,True),('contact_email',254,True),
        ('notice_ar',12000,True),('notice_en',12000,True),
        ('transfer_ar',2000,values['transfer_required']),('transfer_en',2000,values['transfer_required']))}
    if any(len(row[key]) < 2 or '\n' in row[key] or '\r' in row[key] for key in ('employer_ar','employer_en')):
        frappe.throw(_('Provide employer names on one line in both languages.'))
    email = validate_email_address(row['contact_email'], throw=False)
    if not email or ',' in email or email != row['contact_email'] or '\n' in email or '\r' in email:
        frappe.throw(_('Provide one valid privacy contact email address.'))
    if any(len(row[key]) < 20 for key in ('notice_ar','notice_en')):
        frappe.throw(_('Provide the complete notice in both languages.'))
    if values['transfer_required']:
        if any(len(row[key]) < 20 for key in ('transfer_ar','transfer_en')):
            frappe.throw(_('Provide the separate transfer wording in both languages.'))
    elif row['transfer_ar'] or row['transfer_en']:
        frappe.throw(_('Clear transfer wording when separate transfer acceptance is not required.'))
    return dict(row, transfer_required=values['transfer_required'], active=values['active'])


def state(company, current=False):
    rows = frappe.db.sql('SELECT name,sequence,content_json,content_hash FROM `tabKandil Privacy Notice Revision` WHERE company=%s ORDER BY sequence DESC LIMIT 1'+(' FOR UPDATE' if current else ''), (company,), as_dict=True)
    if not rows:
        return dict(version=EMPTY, sequence=0, notice=None, content_hash=catalogs.digest(None))
    row = rows[0]
    return dict(version=row.name, sequence=row.sequence, notice=json.loads(row.content_json), content_hash=row.content_hash)


def published(company, current=False):
    """Internal exact-version resolver; no candidate acceptance or fallback notice."""
    value = state(company, current)
    return value if value['notice'] and value['notice']['active'] else None


@frappe.whitelist(methods=['GET'])
def companies():
    catalogs.access()
    return dict(rows=[dict(name=c,can_edit=catalogs.can_edit(c)) for c in catalogs.visible_companies()[:100]])


@frappe.whitelist(methods=['GET'])
def listing(company):
    company = text(company,140)
    catalogs.authorize(company)
    value = state(company)
    edit = catalogs.can_edit(company)
    if not edit and value['notice'] and not value['notice']['active']:
        value = dict(value,notice=None)
    return dict(company=company,can_edit=edit,**value)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def save(company, version, values, reason, command_id):
    company = text(company,140)
    version = text(version,140)
    reason = text(reason,1000)
    command_id = text(command_id,100)
    if len(reason) < 3:
        frappe.throw(_('Explain the notice revision.'))
    row = normalize(values)
    catalogs.authorize(company,write=True)  # Company lock plus current authority before replay.
    key = catalogs.digest([company,frappe.session.user,command_id])
    signature = catalogs.digest(dict(company=company,version=version,values=row,reason=reason))
    existing = frappe.db.get_value(DT,{'command_key':key},['name','sequence','signature'],as_dict=True,for_update=True)
    if existing:
        if existing.signature != signature:
            frappe.throw(_('Command already used with different notice content.'))
        return dict(company=company,version=existing.name,sequence=existing.sequence,candidate_consent_recorded=False)
    before = state(company,current=True)
    if version != before['version']:
        frappe.throw(_('The notice changed. Refresh and review the current revision.'),frappe.TimestampMismatchError)
    if before['notice'] == row:
        frappe.throw(_('No notice changes to save.'))
    point = 'privacy_notice_' + uuid.uuid4().hex
    frappe.db.savepoint(point)
    try:
        with effect():
            doc = frappe.get_doc(dict(doctype=DT,company=company,sequence=before['sequence']+1,
                previous_revision=before['version'],content_json=json.dumps(row,ensure_ascii=False),
                content_hash=catalogs.digest(row),before_hash=before['content_hash'],actor=frappe.session.user,
                reason=reason,command_key=key,signature=signature)).insert(ignore_permissions=True)
        return dict(company=company,version=doc.name,sequence=doc.sequence,candidate_consent_recorded=False)
    except frappe.QueryDeadlockError:
        raise
    except Exception:
        frappe.db.rollback(save_point=point)
        frappe.local.document_cache={}
        raise


def authorize_history(company):
    catalogs.authorize(company)
    if not catalogs.can_edit(company):
        frappe.throw(_('Notice revision history requires full company HR authority.'),frappe.PermissionError)


@frappe.whitelist(methods=['GET'])
def history(company,start=0,page_length=5):
    company=text(company,140)
    authorize_history(company)
    offset,limit=paging(start,page_length)
    rows=frappe.get_all(DT,filters={'company':company},fields=['name','sequence','actor','reason','creation','content_hash'],order_by='sequence desc',start=offset,page_length=limit+1)
    more=len(rows)>limit
    rows=rows[:limit]
    from kandil_hr.recruitment.vacancy_access import identity_labels
    labels=identity_labels([row.actor for row in rows])
    for row in rows:
        row['actor_label']=labels.get(row.pop('actor'))
    return dict(rows=rows,start=offset,has_more=more)


@frappe.whitelist(methods=['GET'])
def revision(company,version):
    company=text(company,140)
    authorize_history(company)
    doc=frappe.get_doc(DT,text(version,140))
    if doc.company != company:
        frappe.throw(_('Notice revision is outside this company.'),frappe.PermissionError)
    return dict(company=company,version=doc.name,sequence=doc.sequence,notice=json.loads(doc.content_json),content_hash=doc.content_hash)
