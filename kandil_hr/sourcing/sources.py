"""Company-scoped source catalogue and immutable application attribution.

Reads use versioned defaults until HR saves its first change. Writes lock Company
before settings, current identity/grants and the previous revision. No native
write access, deletion or outbound communication. Revisions are the audit and
idempotent receipt; this is not externally anchored tamper evidence.
"""
from contextlib import contextmanager
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import unicodedata
import uuid

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import today

from kandil_hr.candidates.intake import text
from kandil_hr.foundation.mutation_access import assert_current_scope
from kandil_hr.foundation.security import has_scope
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.recruitment.models import guard

DT='Kandil Source Revision'
DEFAULTS=json.loads(Path(__file__).with_name('defaults_v1.json').read_text())
KINDS=('JOB_BOARD','SOCIAL','MESSAGING','DIRECT','REFERRAL','AGENCY','INTERNAL','POOL','OTHER')
ITEM_FIELDS={'code','label_ar','label_en','kind','has_link','uses_credits','active','sort_order'}
from kandil_hr.catalogs.api import digest,normalized_label,authorize,can_edit,access,visible_companies


def enabled():return bool(frappe.conf.get('kandil_source_catalog_enabled'))

def locked(code):return code in ('CAREER_PAGE','OTHER')

@contextmanager
def effect():
    old=frappe.flags.get('kandil_source_effect');frappe.flags.kandil_source_effect=True
    try:yield
    finally:frappe.flags.kandil_source_effect=old


class KandilSourceRevision(Document):
    def autoname(self):self.name='KSR-'+self.command_key
    def validate(self):
        guard()
        if not self.is_new() or not frappe.flags.get('kandil_source_effect'):
            frappe.throw(_('Use Source catalog commands; saved revisions cannot be edited.'),frappe.PermissionError)
    def on_trash(self):frappe.throw(_('Source catalog history cannot be deleted.'),frappe.PermissionError)
    def before_rename(self,*args,**kwargs):self.on_trash()


def state(company,current=False):
    rows=frappe.db.sql('SELECT name,sequence,items_json,after_hash FROM `tabKandil Source Revision` WHERE company=%s ORDER BY sequence DESC LIMIT 1'+(' FOR UPDATE' if current else ''),(company,),as_dict=True)
    if rows:
        row=rows[0];return dict(version=row.name,sequence=row.sequence,items=json.loads(row.items_json),hash=row.after_hash)
    items=deepcopy(DEFAULTS);sha=digest(items)
    return dict(version='DEFAULTS:'+sha,sequence=0,items=items,hash=sha)


@frappe.whitelist(methods=['GET'])
def companies():
    access();return dict(rows=[dict(name=c,can_edit=can_edit(c)) for c in visible_companies()[:100]],kinds=KINDS)


@frappe.whitelist(methods=['GET'])
def listing(company):
    company=text(company,140);authorize(company);data=state(company)
    return dict(company=company,version=data['version'],can_edit=can_edit(company),
        items=[dict(r,locked=locked(r['code'])) for r in sorted(data['items'],key=lambda r:(r['sort_order'],r['code']))])


def normalize(values):
    if isinstance(values,str):
        if len(values)>4000:frappe.throw(_('Source definition is too large.'))
        values=frappe.parse_json(values)
    if not isinstance(values,dict) or set(values)!=ITEM_FIELDS-{'code'}:frappe.throw(_('Source fields are invalid.'))
    ar=' '.join(text(values['label_ar'],160).split());en=' '.join(text(values['label_en'],160).split())
    if len(ar)<2 or len(en)<2:frappe.throw(_('Provide source names in both languages.'))
    if values['kind'] not in KINDS:frappe.throw(_('Choose a valid source kind.'))
    if any(type(values[k]) is not bool for k in ('active','has_link','uses_credits')):frappe.throw(_('Choose the source options.'))
    order=values['sort_order']
    if type(order) is not int or not 0<=order<=9999:frappe.throw(_('Sort order must be from 0 to 9999.'))
    return dict(values,label_ar=ar,label_en=en)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def save(company,version,code,values,reason,command_id,is_new=False):
    company=text(company,140);version=text(version,140);code=text(code,20);command_id=text(command_id,100);reason=text(reason,1000)
    if len(reason)<3:frappe.throw(_('Give a reason for changing this list.'))
    if not re.fullmatch(r"[A-Z][A-Z0-9_]{0,19}",code) or type(is_new) is not bool:frappe.throw(_("Use an uppercase source code and a valid new-source choice."))
    item=normalize(values)
    authorize(company,write=True)
    key=digest([company,frappe.session.user,command_id]);signature=digest(dict(company=company,version=version,code=code,values=item,reason=reason,is_new=is_new))
    existing=frappe.db.get_value(DT,{'command_key':key},['name','signature','changed_code'],as_dict=True,for_update=True)
    if existing:
        if existing.signature!=signature:frappe.throw(_('This command ID was already used with different values.'))
        return dict(company=company,version=existing.name,code=existing.changed_code)
    before=state(company,current=True)
    if version!=before['version']:frappe.throw(_('This list changed. Refresh before saving.'),frappe.TimestampMismatchError)
    old=next((r for r in before['items'] if r['code']==code),None)
    if is_new:
        if old:frappe.throw(_('This source code already exists.'))
        if len(before['items'])>=250 or not item['active']:frappe.throw(_('New sources must be active and within the 250-source limit.'))
    elif not old:frappe.throw(_('The source no longer exists.'))
    if old and item['kind']!=old['kind']:frappe.throw(_('Source kind is permanent; create a distinct code for a different kind.'))
    if not item['active'] and locked(code):frappe.throw(_('This built-in source cannot be deactivated.'))
    item=dict(item,code=code)
    if item==old:frappe.throw(_('There are no list changes to save.'))
    others=[r for r in before['items'] if r['code']!=code]
    if any(normalized_label(r['label_ar'])==normalized_label(item['label_ar']) for r in others):frappe.throw(_('This Arabic label already exists in the list.'))
    items=others+[item]
    if not any(r['active'] for r in items):frappe.throw(_('Keep at least one active item.'))
    point='catalog_'+uuid.uuid4().hex;frappe.db.savepoint(point)
    try:
        with effect():
            revision=frappe.get_doc(dict(doctype=DT,company=company,sequence=before['sequence']+1,
                previous_revision=before['version'],before_hash=before['hash'],after_hash=digest(items),items_json=json.dumps(items,ensure_ascii=False),
                actor=frappe.session.user,reason=reason,command_key=key,signature=signature,changed_code=code)).insert(ignore_permissions=True)
        return dict(company=company,version=revision.name,code=code)
    except frappe.QueryDeadlockError:raise
    except Exception:
        frappe.db.rollback(save_point=point);frappe.local.document_cache={};raise


@frappe.whitelist(methods=['GET'])
def history(company,start=0,page_length=10):
    from kandil_hr.portal.organization import paging
    from kandil_hr.recruitment.vacancy_access import identity_labels
    authorize(text(company,140))
    if not can_edit(company):frappe.throw(_('List revision history requires company HR authority.'),frappe.PermissionError)
    offset,limit=paging(start,page_length)
    rows=frappe.get_all(DT,filters={'company':company},fields=['name','sequence','actor','reason','creation','changed_code','before_hash','after_hash'],order_by='sequence desc',start=offset,page_length=limit+1)
    more=len(rows)>limit;rows=rows[:limit];labels=identity_labels([r.actor for r in rows])
    for row in rows:row['actor_label']=labels.get(row.pop('actor'))
    return dict(rows=rows,start=offset,has_more=more)


@frappe.whitelist(methods=['GET'])
def options(company):
    company=text(company,140);authorize(company)
    if not enabled():return dict(enabled=False,version=None,items=[])
    value=state(company)
    return dict(enabled=True,version=value['version'],items=[dict(r,manual_allowed=r['kind'] not in ('REFERRAL','AGENCY','INTERNAL','POOL')) for r in value['items'] if r['active']])


def selected(company,code,version):
    """Called inside the intake's Company/authority locks, only for new writes."""
    value=state(company,current=True)
    internal=bool(frappe.flags.get('kandil_pool_intake_effect'))
    if not internal and (not version or version!=value['version']):
        frappe.throw(_('The source list changed. Reload and review the source.'),frappe.TimestampMismatchError)
    item=next((r for r in value['items'] if r['code']==code and r['active']),None)
    if not item:frappe.throw(_('Choose an active recruitment source.'))
    if item['kind'] in ('REFERRAL','AGENCY','INTERNAL','POOL') and not (internal and code=='TALENT_POOL' and item['kind']=='POOL'):
        frappe.throw(_('This source requires its dedicated attribution workflow; ordinary intake cannot substitute for it.'),frappe.PermissionError)
    return dict(version=value['version'],item=item)


ATTRIBUTION='Kandil Application Source'
class KandilApplicationSource(Document):
    def autoname(self):self.name='KAS-'+digest([self.application])
    def validate(self):
        guard()
        if not self.is_new() or not frappe.flags.get('kandil_source_effect'):
            frappe.throw(_('Application source evidence is immutable.'),frappe.PermissionError)
    def on_trash(self):frappe.throw(_('Application source evidence cannot be deleted or renamed.'),frappe.PermissionError)
    def before_rename(self,*args,**kwargs):self.on_trash()


def capture(app,company,selection):
    values=dict(company=company,application=app.name,person=app.custom_kandil_person,
        source_code=selection['item']['code'],source_version=selection['version'],
        source_json=json.dumps(selection['item'],ensure_ascii=False),sub_source=app.custom_kandil_source_detail)
    with effect():return frappe.get_doc(dict(doctype=ATTRIBUTION,**values,content_hash=digest(values))).insert(ignore_permissions=True)


def application_snapshot(app):
    # Caller must authorize the application; never serve arbitrary source rows.
    app.check_permission('read')
    row=frappe.db.get_value(ATTRIBUTION,{'application':app.name},['source_version','source_json','sub_source'],as_dict=True)
    return dict(version=row.source_version,source=json.loads(row.source_json),sub_source=row.sub_source) if row else None


def schema_proof():
    from kandil_hr.candidates.pool_intake import schema_proof as existing
    proof=existing()
    for kind in (DT,ATTRIBUTION):
        if not frappe.db.table_exists(kind):proof['tables'][kind]=None
        else:
            rows=frappe.get_all(kind,fields=['*'],order_by='name asc',limit_page_length=0)
            proof['tables'][kind]=dict(count=len(rows),sha256=hashlib.sha256(json.dumps(rows,sort_keys=True,default=str).encode()).hexdigest())
    return proof
