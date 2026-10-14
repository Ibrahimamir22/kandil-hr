"""Separate immutable talent-pool policy; no seeded wording or retention default."""
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

DT = 'Kandil Pool Policy Revision'
FIELDS = {'notice_ar','notice_en','months','active'}
EMPTY = 'EMPTY:' + catalogs.digest(None)


@contextmanager
def effect():
    before = frappe.flags.get('kandil_pool_policy_effect')
    frappe.flags.kandil_pool_policy_effect = True
    try:
        yield
    finally:
        frappe.flags.kandil_pool_policy_effect = before


class KandilPoolPolicyRevision(Document):
    def autoname(self):
        self.name = 'KPP-' + self.command_key

    def validate(self):
        guard()
        if not self.is_new() or not frappe.flags.get('kandil_pool_policy_effect'):
            frappe.throw(_('Use the pool policy editor; talent-pool policy revisions are immutable.'), frappe.PermissionError)

    def on_trash(self):
        frappe.throw(_('Talent-pool policy history cannot be deleted or renamed.'), frappe.PermissionError)

    def before_rename(self, *args, **kwargs):
        self.on_trash()


def normalize(values):
    if isinstance(values,str):
        if len(values)>24000:frappe.throw(_('The pool policy is too large.'))
        values=frappe.parse_json(values)
    if not isinstance(values,dict) or set(values)!=FIELDS:
        frappe.throw(_('Pool policy fields are invalid.'))
    if type(values['active']) is not bool or type(values['months']) is not int or not 1<=values['months']<=120:
        frappe.throw(_('Choose publication and a whole retention period from 1 to 120 months.'))
    row={k:text(values[k],10000) for k in ('notice_ar','notice_en')}
    if any(len(v)<20 for v in row.values()):
        frappe.throw(_('Provide reviewed talent-pool wording in both languages.'))
    return dict(row,months=values['months'],active=values['active'])


def state(company, current=False):
    rows = frappe.db.sql('SELECT name,sequence,content_json,content_hash FROM `tabKandil Pool Policy Revision` WHERE company=%s ORDER BY sequence DESC LIMIT 1'+(' FOR UPDATE' if current else ''), (company,), as_dict=True)
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
        frappe.throw(_('Explain the pool policy revision.'))
    row = normalize(values)
    catalogs.authorize(company,write=True)  # Company lock plus current authority before replay.
    key = catalogs.digest([company,frappe.session.user,command_id])
    signature = catalogs.digest(dict(company=company,version=version,values=row,reason=reason))
    existing = frappe.db.get_value(DT,{'command_key':key},['name','sequence','signature'],as_dict=True,for_update=True)
    if existing:
        if existing.signature != signature:
            frappe.throw(_('Command already used with different pool policy content.'))
        return dict(company=company,version=existing.name,sequence=existing.sequence,candidate_consent_recorded=False)
    before = state(company,current=True)
    if version != before['version']:
        frappe.throw(_('The notice changed. Refresh and review the current revision.'),frappe.TimestampMismatchError)
    if before['notice'] == row:
        frappe.throw(_('No pool policy changes to save.'))
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
