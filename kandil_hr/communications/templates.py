"""HR-published plain-text templates with immutable company revisions.

Template preview is read-only and never sends, logs delivery or completes a task.
Only named, allowlisted substitutions are supported; no Jinja or code evaluation.
"""
from contextlib import contextmanager
from copy import deepcopy
import json
from pathlib import Path
import re
import uuid

import frappe
from frappe import _
from frappe.model.document import Document

from kandil_hr.catalogs import api as catalogs
from kandil_hr.candidates.intake import text
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.portal.organization import paging
from kandil_hr.recruitment.models import guard

DT='Kandil Message Template Revision'
PURPOSES=('CONTACT','REJECT','OTHER','INTERVIEW','OFFER','AD')
CONNECTED=('CONTACT','REJECT','OTHER')
BASE={'name','job','company','location','recruiter'}
VARIABLES={p:BASE|extra for p,extra in {'CONTACT':set(),'REJECT':set(),'OTHER':set(),'INTERVIEW':{'date','time','place','interviewer'},'OFFER':{'date','offer_no','salary_table','joining','terms','valid_until'},'AD':{'requirements','apply_link'}}.items()}
FIELDS={'code','language','purpose','title','subject','body','active'}
TOKEN=re.compile(r'\{([A-Za-z_][A-Za-z0-9_]*)\}')
STARTERS=json.loads(Path(__file__).with_name('template_starters_v1.json').read_text())
digest=catalogs.digest


@contextmanager
def effect():
    old=frappe.flags.get('kandil_template_effect');frappe.flags.kandil_template_effect=True
    try:yield
    finally:frappe.flags.kandil_template_effect=old


class KandilMessageTemplateRevision(Document):
    def autoname(self):self.name='KMT-'+self.command_key
    def validate(self):
        guard()
        if not self.is_new() or not frappe.flags.get('kandil_template_effect'):
            frappe.throw(_('Use the template editor; published revisions cannot be changed.'),frappe.PermissionError)
    def on_trash(self):frappe.throw(_('Template history cannot be deleted or renamed.'),frappe.PermissionError)
    def before_rename(self,*args,**kwargs):self.on_trash()


def state(company,current=False):
    rows=frappe.db.sql('SELECT name,sequence,items_json,after_hash FROM `tabKandil Message Template Revision` WHERE company=%s ORDER BY sequence DESC LIMIT 1'+(' FOR UPDATE' if current else ''),(company,),as_dict=True)
    if not rows:return dict(version='EMPTY:'+digest([]),sequence=0,items=[],hash=digest([]))
    r=rows[0];return dict(version=r.name,sequence=r.sequence,items=json.loads(r.items_json),hash=r.after_hash)


def at_version(company,version):
    r=frappe.db.get_value(DT,version,['company','items_json'],as_dict=True)
    if not r or r.company!=company:frappe.throw(_('Template revision is outside this company.'),frappe.PermissionError)
    return json.loads(r.items_json)


def tokens(value,purpose):
    names=set(TOKEN.findall(value))
    if names-VARIABLES[purpose] or '{' in TOKEN.sub('',value) or '}' in TOKEN.sub('',value):
        frappe.throw(_('Use only the listed placeholders with one pair of braces.'))
    return names


def normalize(values):
    if not isinstance(values,dict) or set(values)!=FIELDS:frappe.throw(_('Template fields are invalid.'))
    row={key:text(values[key],limit,required) for key,limit,required in [('code',60,True),('language',2,True),('purpose',20,True),('title',80,True),('subject',150,False),('body',3000,True)]}
    if not re.fullmatch('[A-Z][A-Z0-9_]{1,59}',row['code']) or row['language'] not in ('ar','en') or row['purpose'] not in PURPOSES:
        frappe.throw(_('Choose a valid code, language and purpose.'))
    if len(row['title'])<3 or len(row['body'])<10 or '\n' in row['subject'] or '\r' in row['subject']:
        frappe.throw(_('Provide a title and body; the subject must stay on one line.'))
    if type(values['active']) is not bool:frappe.throw(_('Choose whether HR publishes this template for use.'))
    tokens(row['subject'],row['purpose']);tokens(row['body'],row['purpose'])
    return dict(row,active=values['active'],key=row['code']+'-'+row['language'])


@frappe.whitelist(methods=['GET'])
def companies():
    catalogs.access();return dict(rows=[dict(name=c,can_edit=catalogs.can_edit(c)) for c in catalogs.visible_companies()[:100]],purposes=list(PURPOSES),variables={p:sorted(v) for p,v in VARIABLES.items()},connected=list(CONNECTED))


@frappe.whitelist(methods=['GET'])
def listing(company,search='',start=0,page_length=20):
    company=text(company,140);catalogs.authorize(company);offset,limit=paging(start,page_length);term=text(search,140,False).casefold()
    current=state(company);edit=catalogs.can_edit(company)
    items=[r for r in current['items'] if (edit or r['active']) and (not term or term in (r['title']+' '+r['key']).casefold())]
    items.sort(key=lambda r:r['key']);total=len(items)
    return dict(company=company,version=current['version'],can_edit=edit,items=items[offset:offset+limit],total=total,start=offset,has_more=offset+limit<total,starters=deepcopy(STARTERS) if edit else [])


@frappe.whitelist(methods=['POST'])
@transactional_retry
def save(company,version,key,values,reason,command_id):
    company=text(company,140);version=text(version,140);key=text(key,80,False);reason=text(reason,1000);command_id=text(command_id,100)
    if len(reason)<3:frappe.throw(_('Explain the template change.'))
    if isinstance(values,str):values=frappe.parse_json(values)
    row=normalize(values);catalogs.authorize(company,write=True)
    command_key=digest([company,frappe.session.user,command_id]);signature=digest(dict(company=company,version=version,key=key,row=row,reason=reason))
    existing=frappe.db.get_value(DT,{'command_key':command_key},['name','signature','changed_key'],as_dict=True,for_update=True)
    if existing:
        if existing.signature!=signature:frappe.throw(_('Command already used with different template content.'))
        return dict(company=company,version=existing.name,key=existing.changed_key)
    before=state(company,current=True)
    if before['version']!=version:frappe.throw(_('Templates changed. Refresh before saving.'),frappe.TimestampMismatchError)
    old=next((r for r in before['items'] if r['key']==(key or row['key'])),None)
    if key and (not old or row['key']!=key):frappe.throw(_('Template code and language cannot be changed.'))
    if not key and old:frappe.throw(_('This code and language already exist. Edit the existing template.'))
    if not key and len(before['items'])>=250:frappe.throw(_('Template limit reached for this company.'))
    if row==old:frappe.throw(_('No template changes to save.'))
    items=[r for r in before['items'] if r['key']!=row['key']]+[row]
    point='template_'+uuid.uuid4().hex;frappe.db.savepoint(point)
    try:
        with effect():
            doc=frappe.get_doc(dict(doctype=DT,company=company,sequence=before['sequence']+1,previous_revision=before['version'],
                before_hash=before['hash'],after_hash=digest(items),items_json=json.dumps(items,ensure_ascii=False),actor=frappe.session.user,
                reason=reason,command_key=command_key,signature=signature,changed_key=row['key'])).insert(ignore_permissions=True)
        return dict(company=company,version=doc.name,key=row['key'])
    except frappe.QueryDeadlockError:raise
    except Exception:
        frappe.db.rollback(save_point=point);frappe.local.document_cache={};raise


@frappe.whitelist(methods=['GET'])
def history(company,start=0,page_length=10):
    company=text(company,140);catalogs.authorize(company)
    if not catalogs.can_edit(company):frappe.throw(_('Template history requires company HR authority.'),frappe.PermissionError)
    offset,limit=paging(start,page_length)
    rows=frappe.get_all(DT,filters={'company':company},fields=['name','sequence','actor','reason','creation','changed_key'],order_by='sequence desc',start=offset,page_length=limit+1)
    from kandil_hr.recruitment.vacancy_access import identity_labels
    more=len(rows)>limit;rows=rows[:limit];labels=identity_labels([r.actor for r in rows])
    for r in rows:r['actor_label']=labels.get(r.pop('actor'))
    return dict(rows=rows,start=offset,has_more=more)


def application(name):
    from kandil_hr.portal import candidates
    candidates.access();app=candidates.readable_application(text(name,140))
    opening=frappe.get_doc('Job Opening',app.job_title)
    request=frappe.get_doc('Kandil Hiring Request',opening.custom_kandil_request)
    return app,opening,request


@frappe.whitelist(methods=['GET'])
def available(name,language='ar'):
    if language not in ('ar','en'):frappe.throw(_('Choose Arabic or English.'))
    app,opening,request=application(name);current=state(request.company)
    return dict(application=app.name,company=request.company,version=current['version'],rows=[{k:r[k] for k in ('key','title','purpose','language')} for r in current['items'] if r['active'] and r['language']==language and r['purpose'] in CONNECTED])


@frappe.whitelist(methods=['GET'])
def preview(name,key,version):
    app,opening,request=application(name);current=state(request.company)
    if text(version,140)!=current['version']:frappe.throw(_('Templates changed. Refresh and review again.'),frappe.TimestampMismatchError)
    row=next((r for r in current['items'] if r['key']==text(key,80)),None)
    if not row or not row['active'] or row['purpose'] not in CONNECTED:frappe.throw(_('This template is unavailable for candidate messages.'),frappe.PermissionError)
    from kandil_hr.candidates.search import labels
    person=labels([app.custom_kandil_person]).get(app.custom_kandil_person) if app.custom_kandil_person else None
    values=dict(name=person or app.applicant_name or '',job=opening.designation or opening.job_title or '',company=request.company,
        location=opening.get('location') or '',recruiter=frappe.db.get_value('User',frappe.session.user,'full_name') or '')
    # A single replacement pass treats substituted values as literal text.
    required=tokens(row['subject'],row['purpose'])|tokens(row['body'],row['purpose']);missing=sorted(k for k in required if not values.get(k))
    def render(value):return TOKEN.sub(lambda match:values.get(match.group(1)) or '',value)
    subject=render(row['subject']);body=render(row['body'])
    if len(subject)>2000 or len(body)>10000:frappe.throw(_('Rendered message is too long.'))
    return dict(application=app.name,version=current['version'],revision=current['sequence'],key=row['key'],language=row['language'],purpose=row['purpose'],subject=subject,body=body,
        missing=missing,can_copy=not missing,content_hash=digest([current['version'],row['key'],subject,body]),sent_by_system=False)
