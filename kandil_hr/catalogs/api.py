"""Company-scoped, immutable revisions of HR reason and activity lists.

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

DT='Kandil HR List Revision'
DEFAULTS=json.loads(Path(__file__).with_name('defaults_v1.json').read_text())
PROCESSES=DEFAULTS['processes']
LOCKED={'ACTIVITY_TYPE':{'CALL','WHATSAPP','EMAIL','NOTE'},'CANDIDATE_REJECT':{'VACANCY_CANCELLED'},'CANDIDATE_WITHDRAW':{'TRANSFERRED','DUPLICATE'}}
ITEM_FIELDS={'code','label_ar','label_en','requires_note','active','sort_order'}


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()


def locked(process,code):return code=='OTHER' or code in LOCKED.get(process,set())


@contextmanager
def effect():
    old=frappe.flags.get('kandil_catalog_effect');frappe.flags.kandil_catalog_effect=True
    try:yield
    finally:frappe.flags.kandil_catalog_effect=old


class KandilHRListRevision(Document):
    def autoname(self):self.name='KLC-'+self.command_key
    def validate(self):
        guard()
        if not self.is_new() or not frappe.flags.get('kandil_catalog_effect'):
            frappe.throw(_('Use HR list commands; saved revisions cannot be edited.'),frappe.PermissionError)
    def on_trash(self):frappe.throw(_('HR list history cannot be deleted.'),frappe.PermissionError)
    def before_rename(self,*args,**kwargs):self.on_trash()


def access():
    from kandil_hr.portal.candidates import access as candidate_access
    guard();candidate_access()
    if not frappe.db.get_value("User",frappe.session.user,"enabled"):frappe.throw(_("Account disabled."),frappe.PermissionError)


def visible_companies():
    if frappe.session.user=='Administrator':return frappe.get_all('Kandil Organization Settings',pluck='company',order_by='company')
    day=today()
    return sorted({r.company for r in frappe.get_all('Kandil Access Grant',filters={'user':frappe.session.user,'revoked':0,'valid_from':['<=',day]},fields=['company','valid_until']) if not r.valid_until or str(r.valid_until)>=day})


def can_edit(company):
    return bool(frappe.session.user=='Administrator' or (
        frappe.db.get_value('Kandil Organization Settings',company,'hr_approver')==frappe.session.user
        and has_scope(frappe.session.user,company,capability='manage')))


def authorize(company,write=False):
    access()
    if company not in visible_companies():frappe.throw(_('HR lists are outside your company access.'),frappe.PermissionError)
    if write:
        rows=frappe.db.sql('SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE',(company,))
        if not rows:frappe.throw(_('Company unavailable.'),frappe.PermissionError)
        settings=frappe.db.get_value('Kandil Organization Settings',company,'hr_approver',for_update=True)
        assert_current_scope(company,required_roles=('Kandil Recruiter',))
        if frappe.session.user!='Administrator' and settings!=frappe.session.user:
            frappe.throw(_('Only the configured company HR authority can edit these lists.'),frappe.PermissionError)


def state(company,process,current=False):
    if process not in PROCESSES:frappe.throw(_('Choose a valid HR list.'))
    rows=frappe.db.sql('SELECT name,sequence,items_json,after_hash FROM `tabKandil HR List Revision` WHERE company=%s AND list_process=%s ORDER BY sequence DESC LIMIT 1'+(' FOR UPDATE' if current else ''),(company,process),as_dict=True)
    if rows:
        row=rows[0];return dict(version=row.name,sequence=row.sequence,items=json.loads(row.items_json),hash=row.after_hash)
    items=deepcopy(DEFAULTS['items'][process]);sha=digest(items)
    return dict(version='DEFAULTS:'+sha,sequence=0,items=items,hash=sha)


def at_version(company,process,version):
    default=deepcopy(DEFAULTS['items'][process])
    if version=='DEFAULTS:'+digest(default):return default
    row=frappe.db.get_value(DT,version,['company','list_process','items_json'],as_dict=True)
    if not row or row.company!=company or row.list_process!=process:frappe.throw(_('HR list revision is unavailable.'),frappe.PermissionError)
    return json.loads(row.items_json)


@frappe.whitelist(methods=['GET'])
def companies():
    access();return dict(rows=[dict(name=c,can_edit=can_edit(c)) for c in visible_companies()[:100]],processes=PROCESSES)


@frappe.whitelist(methods=['GET'])
def listing(company,process='ACTIVITY_TYPE'):
    company=text(company,140);authorize(company);data=state(company,process)
    return dict(company=company,process=process,version=data['version'],can_edit=can_edit(company),
        items=[dict(r,locked=locked(process,r['code'])) for r in sorted(data['items'],key=lambda r:(r['sort_order'],r['code']))])


def normalized_label(value):
    value=unicodedata.normalize('NFKC',value).casefold()
    value=''.join(c for c in value if unicodedata.category(c)!='Mn' and c!='ـ')
    return value.translate(str.maketrans('أإآى','اااي'))


def normalize(values):
    if not isinstance(values,dict) or set(values)!=ITEM_FIELDS-{'code'}:frappe.throw(_('List item fields are invalid.'))
    ar=' '.join(text(values['label_ar'],160).split());en=' '.join(text(values['label_en'],160,False).split())
    if len(ar)<2:frappe.throw(_('Provide an Arabic label of at least two characters.'))
    if type(values['requires_note']) is not bool or type(values['active']) is not bool:frappe.throw(_('Choose the note and active options.'))
    order=values['sort_order']
    if type(order) is not int or not 0<=order<=9999:frappe.throw(_('Sort order must be an integer from 0 to 9999.'))
    return dict(values,label_ar=ar,label_en=en)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def save(company,process,version,code,values,reason,command_id):
    company=text(company,140);version=text(version,140);code=text(code,80,False);command_id=text(command_id,100);reason=text(reason,1000)
    if len(reason)<3:frappe.throw(_('Give a reason for changing this list.'))
    if process not in PROCESSES:frappe.throw(_('Choose a valid HR list.'))
    if isinstance(values,str):values=frappe.parse_json(values)
    item=normalize(values)
    authorize(company,write=True)
    key=digest([company,frappe.session.user,command_id]);signature=digest(dict(company=company,process=process,version=version,code=code,values=item,reason=reason))
    existing=frappe.db.get_value(DT,{'command_key':key},['name','signature','changed_code'],as_dict=True,for_update=True)
    if existing:
        if existing.signature!=signature:frappe.throw(_('This command ID was already used with different values.'))
        return dict(company=company,process=process,version=existing.name,code=existing.changed_code)
    before=state(company,process,current=True)
    if version!=before['version']:frappe.throw(_('This list changed. Refresh before saving.'),frappe.TimestampMismatchError)
    old=next((r for r in before['items'] if r['code']==code),None)
    if code and not old:frappe.throw(_('The list item no longer exists.'))
    if not code:
        if len(before['items'])>=250:frappe.throw(_('This list has reached its item limit.'))
        if not item['active']:frappe.throw(_('New items must start active.'))
        code='C'+uuid.uuid5(uuid.NAMESPACE_URL,key).hex.upper()
    if not item['active'] and locked(process,code):frappe.throw(_('This built-in item cannot be deactivated.'))
    item=dict(item,code=code)
    if item==old:frappe.throw(_('There are no list changes to save.'))
    others=[r for r in before['items'] if r['code']!=code]
    if any(normalized_label(r['label_ar'])==normalized_label(item['label_ar']) for r in others):frappe.throw(_('This Arabic label already exists in the list.'))
    items=others+[item]
    if not any(r['active'] for r in items):frappe.throw(_('Keep at least one active item.'))
    point='catalog_'+uuid.uuid4().hex;frappe.db.savepoint(point)
    try:
        with effect():
            revision=frappe.get_doc(dict(doctype=DT,company=company,list_process=process,sequence=before['sequence']+1,
                previous_revision=before['version'],before_hash=before['hash'],after_hash=digest(items),items_json=json.dumps(items,ensure_ascii=False),
                actor=frappe.session.user,reason=reason,command_key=key,signature=signature,changed_code=code)).insert(ignore_permissions=True)
        return dict(company=company,process=process,version=revision.name,code=code)
    except frappe.QueryDeadlockError:raise
    except Exception:
        frappe.db.rollback(save_point=point);frappe.local.document_cache={};raise


@frappe.whitelist(methods=['GET'])
def history(company,process,start=0,page_length=10):
    from kandil_hr.portal.organization import paging
    from kandil_hr.recruitment.vacancy_access import identity_labels
    authorize(text(company,140))
    if not can_edit(company):frappe.throw(_('List revision history requires company HR authority.'),frappe.PermissionError)
    if process not in PROCESSES:frappe.throw(_('Choose a valid HR list.'))
    offset,limit=paging(start,page_length)
    rows=frappe.get_all(DT,filters={'company':company,'list_process':process},fields=['name','sequence','actor','reason','creation','changed_code','before_hash','after_hash'],order_by='sequence desc',start=offset,page_length=limit+1)
    more=len(rows)>limit;rows=rows[:limit];labels=identity_labels([r.actor for r in rows])
    for row in rows:row['actor_label']=labels.get(row.pop('actor'))
    return dict(rows=rows,start=offset,has_more=more)
