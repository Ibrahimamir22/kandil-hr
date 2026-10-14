"""Reviewed reuse of a current talent-pool person on a permitted open vacancy.

The source and destination remain separate applications. The immutable event binds
exact membership/consent evidence; nested intake, activity and event are atomic.
"""
from contextlib import contextmanager
import json
import uuid
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.database.query import RawCriterion
from frappe.query_builder.functions import Count
from copy import deepcopy
from pypika import Order
from kandil_hr.candidates import talent_pool, identity, intake, activities, profile
from kandil_hr.privacy import consent, pool
from kandil_hr.catalogs.api import digest
from kandil_hr.portal import candidates
from kandil_hr.portal.organization import paging
from kandil_hr.portal.vacancies import permitted_names
from kandil_hr.foundation.teams import candidate_opening_condition
from kandil_hr.foundation.mutation_access import assert_current_request_scope
from kandil_hr.pilot.api import transactional_retry

DT='Kandil Pool Intake'

@contextmanager
def effect():
    old=frappe.flags.get('kandil_pool_intake_effect');frappe.flags.kandil_pool_intake_effect=True
    try:yield
    finally:frappe.flags.kandil_pool_intake_effect=old

class KandilPoolIntake(Document):
    def autoname(self):self.name='KPI-'+uuid.uuid4().hex
    def validate(self):
        identity.guard()
        if not self.is_new() or not frappe.flags.get('kandil_pool_intake_effect'):self.on_trash()
    def on_trash(self):frappe.throw(_('Pool intake history is immutable. Use the reviewed intake action.'),frappe.PermissionError)
    def before_rename(self,*args,**kwargs):self.on_trash()

def source(application):
    request,opening,app,person=consent.authorize(application)
    member=talent_pool.latest(request.company,person.name);talent_pool.source_access(member,app.name)
    return request,opening,app,person,member

def eligible(request,person,member):
    grant,status=pool.eligibility(request.company,person.name)
    if talent_pool.state(member,grant,status)!='active':
        frappe.throw(_('Current reviewed pool membership and consent are required.'),frappe.PermissionError)
    return grant

def target(company,opening,person):
    o=frappe.qb.DocType('Job Opening');r=frappe.qb.DocType('Kandil Hiring Request')
    visible=(frappe.qb.from_(o).join(r).on(r.name==o.custom_kandil_request).select(o.name)
        .where((o.name==opening)&(r.company==company)&o.name.isin(permitted_names('Job Opening'))&r.name.isin(permitted_names('Kandil Hiring Request'))).limit(1).run())
    if not visible:frappe.throw(_('The destination vacancy is unavailable within your scope.'),frappe.PermissionError)
    request=frappe.get_doc('Kandil Hiring Request',frappe.db.get_value('Job Opening',opening,'custom_kandil_request'),for_update=True)
    request.check_permission('read');assert_current_request_scope(request,required_roles=('Kandil Recruiter',))
    intake.authorize(request,'candidate_intake',dict(opening=opening,person=person.name))
    return request,frappe.get_doc('Job Opening',opening,for_update=True)

def duplicate(person,opening):
    # Integrity check under company lock includes restricted applications but never
    # returns their identifiers, stage, owners or count to the caller.
    return bool(frappe.db.sql('SELECT name FROM `tabJob Applicant` WHERE custom_kandil_person=%s AND job_title=%s AND status != %s LIMIT 1 FOR UPDATE',(person,opening,'Rejected')))

def ready(request,opening,person):
    from kandil_hr.pilot.extensions import pilot_opening
    pilot_opening(opening.name,lock=True)
    if duplicate(person.name,opening.name):
        frappe.throw(_('This candidate cannot be added to the selected vacancy. Ask HR to review existing applications.'))

@frappe.whitelist(methods=['GET'])
def openings(application,search='',start=0,page_length=20):
    request,source_opening,app,person,member=source(intake.text(application,140));eligible(request,person,member)
    offset,limit=paging(start,page_length);term=intake.text(search,140,False)
    o=frappe.qb.DocType('Job Opening');r=frappe.qb.DocType('Kandil Hiring Request')
    q=(frappe.qb.from_(o).join(r).on(r.name==o.custom_kandil_request)
        .where((r.company==request.company)&(r.status=='Approved')&o.custom_kandil_vacancy_state.isin(('Open','Partially Filled')))
        .where(o.name.isin(permitted_names('Job Opening'))&r.name.isin(permitted_names('Kandil Hiring Request')))
        .where(RawCriterion(candidate_opening_condition(frappe.session.user))))
    if term:q=q.where(o.job_title.like(talent_pool.literal(term))|o.name.like(talent_pool.literal(term)))
    total=deepcopy(q).select(Count(o.name).as_('total')).run(as_dict=True)[0].total
    rows=q.select(o.name,o.job_title,r.company).orderby(o.job_title).orderby(o.name).offset(offset).limit(limit).run(as_dict=True)
    return dict(rows=rows,total=total,start=offset,has_more=offset+limit<total)

@frappe.whitelist(methods=['GET'])
def preview(application,opening):
    request,source_opening,app,person,member=source(intake.text(application,140));grant=eligible(request,person,member)
    target_request,destination=target(request.company,intake.text(opening,140),person)
    ready(target_request,destination,person)
    current=profile.normalize(person.profile_json)
    return dict(application=app.name,opening=destination.name,job_title=destination.job_title,company=request.company,
        person_name=current['full_name'],membership=member.name,consent=grant.name,consent_until=str(grant.valid_until),
        application_version=str(app.modified),person_version=str(person.modified),target_version=str(target_request.modified),
        opening_version=str(destination.modified),source_channel='TALENT_POOL')

@frappe.whitelist(methods=['POST'])
@transactional_retry
def create(application,opening,membership,consent_event,application_version,person_version,target_version,opening_version,reason,confirmed,command_id):
    application=intake.text(application,140);opening=intake.text(opening,140);membership=intake.text(membership,140);consent_event=intake.text(consent_event,140)
    application_version=intake.text(application_version,140);person_version=intake.text(person_version,140);target_version=intake.text(target_version,140);opening_version=intake.text(opening_version,140)
    reason=intake.text(reason,1000);command_id=intake.text(command_id,100)
    if confirmed is not True or len(reason)<3:frappe.throw(_('Review and explain the new application.'))
    request,source_opening,app,person,member=source(application)
    destination_request,destination=target(request.company,opening,person)
    key=digest([request.company,frappe.session.user,command_id]);signature=digest([application,opening,membership,consent_event,application_version,person_version,target_version,opening_version,reason,confirmed])
    prior=frappe.db.get_value(DT,{'command_key':key},['name','signature','target_application'],as_dict=True,for_update=True)
    if prior:
        if prior.signature!=signature:frappe.throw(_('This pool intake command was used with different details.'))
        readable_result(prior.target_application,destination_request,destination,person)
        return receipt(frappe.get_doc(DT,prior.name,for_update=True))
    grant=eligible(request,person,member)
    if membership!=member.name or consent_event!=grant.name:frappe.throw(_('Pool membership or consent changed. Review again.'),frappe.TimestampMismatchError)
    for doc,version in ((app,application_version),(person,person_version),(destination_request,target_version),(destination,opening_version)):activities.reviewed(doc,version)
    ready(destination_request,destination,person)
    current=profile.normalize(person.profile_json)
    with consent.atomic(),effect():
        # Only the outer command may retry a whole transaction; an inner retry
        # would discard the source locks and eligibility checks.
        created=intake._create_application(name=destination_request.name,opening_name=opening,
            details=dict(applicant_name=current['full_name'],email_id=current['email_id'],phone_number=current['phone_number'],source_channel='TALENT_POOL',source_detail='Reviewed talent pool'),
            command_id='pool-'+key,expected_version=target_version,person=person.name,person_version=person_version,identity_reason='Reviewed existing talent-pool candidate')
        added=frappe.get_doc('Job Applicant',created['application'],for_update=True)
        readable_result(added.name,destination_request,destination,person)
        activity=activities.append(added,destination_request,'SYSTEM','',_('Added from the talent pool after recruiter review.'))
        values=dict(company=request.company,person=person.name,source_application=app.name,target_application=added.name,opening=opening,
            membership=member.name,consent_event=grant.name,actor=frappe.session.user,reason=reason,activity=activity.name,
            source_version=application_version,person_version=person_version,target_version=target_version,opening_version=opening_version)
        event=frappe.get_doc(dict(doctype=DT,**values,command_key=key,signature=signature,content_hash=digest(values))).insert(ignore_permissions=True)
        return receipt(event)

def readable_result(name,request,opening,person):
    # A simultaneous retry may predate the commit in its consistent-read
    # snapshot. Native list subqueries retain that snapshot even when the outer
    # SELECT uses FOR UPDATE. Authorize the current document instead, including
    # its native role, own/link/child User Permissions and HR permission hook.
    # Source/target authority and company locks were acquired before this call.
    doc=frappe.get_doc('Job Applicant',name,for_update=True)
    if doc.job_title!=opening.name or doc.custom_kandil_person!=person.name or opening.custom_kandil_request!=request.name or person.company!=request.company:
        frappe.throw(_('The created application is unavailable within your current scope.'),frappe.PermissionError)
    for linked in (request,opening,person,doc):linked.check_permission('read')
    return doc

def receipt(row):return dict(event=row.name,application=row.target_application,source_channel='TALENT_POOL',sent=False)

@frappe.whitelist(methods=['GET'])
def history(application,start=0,page_length=5):
    request,source_opening,app,person,member=source(intake.text(application,140));offset,limit=paging(start,page_length)
    q,a,o,r=candidates.base();visible=q.select(a.name);e=frappe.qb.DocType(DT)
    rows=(frappe.qb.from_(e).select(e.name,e.target_application,e.opening,e.reason,e.actor,e.creation)
        .where((e.company==request.company)&(e.person==person.name)&(e.source_application==app.name)&e.source_application.isin(visible)&e.target_application.isin(visible))
        .orderby(e.creation,order=Order.desc).orderby(e.name).offset(offset).limit(limit+1).run(as_dict=True))
    from kandil_hr.recruitment.vacancy_access import identity_labels
    labels=identity_labels([r.actor for r in rows[:limit]])
    for row in rows[:limit]:row['actor_label']=labels.get(row.pop('actor'));row['job_title']=frappe.db.get_value('Job Opening',row.pop('opening'),'job_title')
    return dict(rows=rows[:limit],start=offset,has_more=len(rows)>limit)

def schema_proof():
    import hashlib
    proof=talent_pool.schema_proof()
    if not frappe.db.table_exists(DT):proof['tables'][DT]=None
    else:
        rows=frappe.get_all(DT,fields=['*'],order_by='name asc',limit_page_length=0)
        proof['tables'][DT]=dict(count=len(rows),sha256=hashlib.sha256(json.dumps(rows,sort_keys=True,default=str).encode()).hexdigest())
    return proof
