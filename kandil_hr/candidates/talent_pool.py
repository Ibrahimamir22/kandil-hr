"""Reviewed talent-pool membership and scoped, consent-current discovery.

Membership references its exact POOL grant. A replacement grant never silently
reactivates an old membership. Source-application permissions precede projections.
"""
from contextlib import contextmanager
from copy import deepcopy
import json
import re
import uuid
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.query_builder.functions import Count
from frappe.utils import getdate
from pypika import Order
from pypika.terms import Criterion
from kandil_hr.candidates import identity, profile, activities, search
from kandil_hr.candidates.intake import text
from kandil_hr.privacy import consent, pool
from kandil_hr.portal import candidates
from kandil_hr.portal.organization import paging
from kandil_hr.portal.vacancies import permitted_names
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.catalogs.api import digest

DT='Kandil Talent Pool Event'

@contextmanager
def effect():
    old=frappe.flags.get('kandil_talent_pool_effect');frappe.flags.kandil_talent_pool_effect=True
    try:yield
    finally:frappe.flags.kandil_talent_pool_effect=old

class KandilTalentPoolEvent(Document):
    def autoname(self):self.name='KTP-'+uuid.uuid4().hex
    def validate(self):
        identity.guard()
        if not self.is_new() or not frappe.flags.get('kandil_talent_pool_effect'):self.on_trash()
    def on_trash(self):frappe.throw(_('Talent-pool history is immutable. Use the reviewed membership action.'),frappe.PermissionError)
    def before_rename(self,*args,**kwargs):self.on_trash()

def latest(company,person):
    rows=frappe.db.sql('SELECT name FROM `tabKandil Talent Pool Event` WHERE company=%s AND person=%s ORDER BY sequence DESC LIMIT 1 FOR UPDATE',(company,person))
    return frappe.get_doc(DT,rows[0][0],for_update=True) if rows else None

def source_access(row,application):
    if row and row.application!=application:
        consent.authorize(row.application)  # No hidden source notes or update through another visible application.

def family_values(company):
    values=set()
    for dt in ('Kandil Organization Code','Kandil Position'):
        d=frappe.qb.DocType(dt)
        q=frappe.qb.from_(d).select(d.job_family).distinct().where((d.company==company)&d.name.isin(permitted_names(dt)))
        if dt=='Kandil Organization Code':q=q.where(d.entity_type=='Job')
        values.update(str(r.job_family).strip() for r in q.run(as_dict=True) if r.job_family and str(r.job_family).strip())
    return sorted(values)

def normalized_tags(values):
    if isinstance(values,str):
        if len(values)>2000:frappe.throw(_('Too many pool tags.'))
        values=frappe.parse_json(values)
    if not isinstance(values,list) or len(values)>10:frappe.throw(_('Choose at most ten pool tags.'))
    result=[]
    for value in values:
        item=re.sub(r'\s+',' ',text(value,80)).strip()
        if ',' in item or '،' in item:frappe.throw(_('Enter each tag separately without commas.'))
        if item.casefold() not in {t.casefold() for t in result}:result.append(item)
    return result

def suggestion(request,opening,person):
    p=profile.normalize(json.loads(person.profile_json or '{}'));families=family_values(request.company)
    family=''
    if request.requested_position:
        pos=frappe.get_doc('Kandil Position',request.requested_position)
        if pos.has_permission('read') and pos.job_family in families:family=pos.job_family
    tags=[]
    for raw in (opening.job_title,p['specialization'],p['education'],p['governorate']):
        item=re.sub(r'[,،\s]+',' ',raw or '').strip()[:80]
        if item and item.casefold() not in {t.casefold() for t in tags}:tags.append(item)
    return dict(category=family,tags=tags[:6]),families

def state(row,grant,status):
    if not row:return 'none'
    if row.action=='REMOVE':return 'removed'
    if status!='active':return 'consent_'+status
    return 'active' if row.consent_event==grant.name else 'consent_changed'

def projection(row):
    return dict(event=row.name,action=row.action,category=row.category or '',tags=json.loads(row.tags_json or '[]'),note=row.note or '',reason=row.reason,sequence=row.sequence) if row else None

@frappe.whitelist(methods=['GET'])
def context(application):
    if not identity.enabled():return dict(enabled=False)
    request,opening,app,person=consent.authorize(application)
    row=latest(request.company,person.name);source_access(row,app.name)
    grant,status=pool.eligibility(request.company,person.name)
    suggested,families=suggestion(request,opening,person)
    return dict(enabled=True,state=state(row,grant,status),current=projection(row),expected_event=row.name if row else '',
        expected_consent=grant.name if grant else '',application_version=str(app.modified),person_version=str(person.modified),
        can_put=status=='active',can_remove=bool(row and row.action=='PUT'),consent_state=status,
        valid_until=str(grant.valid_until) if grant and grant.valid_until else None,suggestion=suggested,categories=families)

@frappe.whitelist(methods=['POST'])
@transactional_retry
def record(application,expected_event,expected_consent,application_version,person_version,action,category,tags,note,reason,confirmed,command_id):
    application=text(application,140);expected_event=text(expected_event,140,False);expected_consent=text(expected_consent,140,False)
    application_version=text(application_version,140);person_version=text(person_version,140)
    action=text(action,10);category=text(category,140,False);tags=normalized_tags(tags);note=text(note,500,False);reason=text(reason,1000);command_id=text(command_id,100)
    if action not in ('PUT','REMOVE') or confirmed is not True or len(reason)<3:frappe.throw(_('Review the membership change and explain it.'))
    request,opening,app,person=consent.authorize(application)
    row=latest(request.company,person.name);source_access(row,app.name)
    key=digest([request.company,frappe.session.user,command_id])
    signature=digest([application,expected_event,expected_consent,application_version,person_version,action,category,tags,note,reason,confirmed])
    prior=frappe.db.get_value(DT,{'command_key':key},['name','signature','application'],as_dict=True,for_update=True)
    if prior:
        if prior.signature!=signature:frappe.throw(_('This membership command was used with different details.'))
        source_access(prior,app.name)
        return receipt(frappe.get_doc(DT,prior.name,for_update=True))
    activities.reviewed(app,application_version);activities.reviewed(person,person_version)
    grant,status=pool.eligibility(request.company,person.name)
    if expected_event!=(row.name if row else '') or expected_consent!=(grant.name if grant else ''):
        frappe.throw(_('Membership or consent changed. Refresh and review again.'),frappe.TimestampMismatchError)
    if action=='PUT':
        if status!='active':frappe.throw(_('Current talent-pool consent is required.'),frappe.PermissionError)
        if category and category not in family_values(request.company):frappe.throw(_('Choose an available company job family.'))
        if row and row.action=='PUT' and row.consent_event==grant.name and row.category==category and json.loads(row.tags_json or '[]')==tags and (row.note or '')==note:
            frappe.throw(_('No membership changes to save.'))
    else:
        if not row or row.action!='PUT':frappe.throw(_('There is no membership to remove.'))
        if category or tags or note:frappe.throw(_('Removal must not overwrite the recorded category, tags or note.'))
    with consent.atomic(),effect():
        activity=activities.append(app,request,'SYSTEM','',_('Talent-pool membership added or updated.') if action=='PUT' else _('Talent-pool membership removed.'))
        values=dict(company=request.company,person=person.name,application=app.name,actor=frappe.session.user,
            sequence=row.sequence+1 if row else 1,previous_event=row.name if row else '',action=action,
            category=category if action=='PUT' else row.category,tags_json=json.dumps(tags if action=='PUT' else json.loads(row.tags_json or '[]'),ensure_ascii=False),
            note=note if action=='PUT' else row.note,reason=reason,consent_event=grant.name if grant else '',activity=activity.name)
        event=frappe.get_doc(dict(doctype=DT,**values,command_key=key,signature=signature,content_hash=digest(values))).insert(ignore_permissions=True)
        return receipt(event)

def receipt(row):return dict(event=row.name,action=row.action,sequence=row.sequence,activity=row.activity,sent=False)

def active_query():
    q,a,o,r=candidates.base()
    m=frappe.qb.DocType(DT);newer=frappe.qb.DocType(DT).as_('newer_pool_membership')
    c=frappe.qb.DocType(pool.DT);later=frappe.qb.DocType(pool.DT).as_('newer_pool_consent');p=frappe.qb.DocType(identity.DT)
    q=(q.join(m).on((m.application==a.name)&(m.company==r.company)&(m.person==a.custom_kandil_person))
       .left_join(newer).on((newer.company==m.company)&(newer.person==m.person)&(newer.sequence>m.sequence))
       .join(c).on((c.name==m.consent_event)&(c.company==m.company)&(c.person==m.person))
       .left_join(later).on((later.company==c.company)&(later.person==c.person)&(later.sequence>c.sequence))
       .join(p).on((p.name==m.person)&(p.company==m.company))
       .where(p.name.isin(permitted_names(identity.DT)))
       .where(newer.name.isnull()&later.name.isnull()&(m.action=='PUT')&(c.decision=='GRANT')&(c.valid_until>=getdate(pool.today()))))
    return q,m,p,c,a,o,r

def profile_field(p,key):
    if key not in ('full_name','phone_number','email_id','specialization','governorate','education'):raise ValueError('Unsupported pool search field')
    return search.JSONUnquote(search.JSONExtract(search.If(search.JSONValid(p.profile_json),p.profile_json,'{}'),'$.'+key))

def literal(value):return '%'+value.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'

@frappe.whitelist(methods=['GET'])
def listing(search_text='',category='',tag='',start=0,page_length=20):
    identity.guard();candidates.access();offset,limit=paging(start,page_length)
    term=text(search_text,140,False);category=text(category,140,False);tag=text(tag,80,False)
    q,m,p,c,a,o,r=active_query()
    if term:q=q.where(Criterion.any([profile_field(p,k).like(literal(term)) for k in ('full_name','phone_number','email_id','specialization','governorate','education')]+[m.tags_json.like(literal(term)),m.note.like(literal(term))]))
    if tag:q=q.where(m.tags_json.like(literal(tag)))
    facets=deepcopy(q).select(m.category,Count(m.name).as_('count')).groupby(m.category).orderby(m.category).run(as_dict=True)
    if category:q=q.where(m.category==category)
    total=deepcopy(q).select(Count(m.name).as_('total')).run(as_dict=True)[0].total
    rows=(q.select(m.name.as_('event'),a.name.as_('application'),r.company,o.job_title,m.category,m.tags_json,m.note,m.creation,c.valid_until,
        p.name.as_('_person'),profile_field(p,'full_name').as_('full_name'),profile_field(p,'specialization').as_('specialization'),profile_field(p,'governorate').as_('governorate'))
        .orderby(m.creation,order=Order.desc).orderby(m.name).limit(limit).offset(offset).run(as_dict=True))
    last=latest_applications([row['_person'] for row in rows])
    for row in rows:
        row['tags']=json.loads(row.pop('tags_json') or '[]');row['latest_application']=last.get(row.pop('_person'))
    return dict(rows=rows,total=total,categories=facets,start=offset,page_length=limit,has_more=offset+limit<total,as_of=str(pool.today()))

def latest_applications(people):
    """One batch, latest creation within native permission scope, stable ID tie-break."""
    if not people:return {}
    from pypika.analytics import RowNumber
    from kandil_hr.candidates.closure_history import active_decisions
    q,a,o,r=candidates.base()
    ranked=(q.select(a.custom_kandil_person.as_('person'),a.name.as_('application'),a.status,o.job_title,a.creation.as_('applied_at'),
        RowNumber().over(a.custom_kandil_person).orderby(a.creation,order=Order.desc).orderby(a.name,order=Order.desc).as_('row_rank'))
        .where(a.custom_kandil_person.isin(people)).as_('ranked_pool_applications'))
    rows=frappe.qb.from_(ranked).select(ranked.star).where(ranked.row_rank==1).run(as_dict=True)
    decisions=active_decisions([r.application for r in rows]);result={}
    for row in rows:
        person=row.pop('person');row.pop('row_rank');row['status']=decisions.get(row.application,row.status);result[person]=row
    return result

@frappe.whitelist(methods=['GET'])
def history(application,start=0,page_length=5):
    request,opening,app,person=consent.authorize(application)
    source_access(latest(request.company,person.name),app.name)
    offset,limit=paging(start,page_length);q,a,o,r=candidates.base();visible=q.select(a.name)
    m=frappe.qb.DocType(DT)
    rows=(frappe.qb.from_(m).select(m.sequence,m.action,m.category,m.tags_json,m.note,m.reason,m.actor,m.creation)
          .where((m.company==request.company)&(m.person==person.name)&m.application.isin(visible))
          .orderby(m.sequence,order=Order.desc).limit(limit+1).offset(offset).run(as_dict=True))
    more=len(rows)>limit;rows=rows[:limit]
    from kandil_hr.recruitment.vacancy_access import identity_labels
    labels=identity_labels([row.actor for row in rows])
    for row in rows:row['actor_label']=labels.get(row.pop('actor'));row['tags']=json.loads(row.pop('tags_json') or '[]')
    return dict(rows=rows,start=offset,has_more=more)

def schema_proof():
    import hashlib
    proof=pool.schema_proof()
    if not frappe.db.table_exists(DT):proof['tables'][DT]=None
    else:
        rows=frappe.get_all(DT,fields=['*'],order_by='name asc',limit_page_length=0)
        proof['tables'][DT]=dict(count=len(rows),sha256=hashlib.sha256(json.dumps(rows,sort_keys=True,default=str).encode()).hexdigest())
    return proof
