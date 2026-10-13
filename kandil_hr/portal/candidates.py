"""Bounded application and person projections; no compensation or file exposure."""
from copy import deepcopy
import json

import frappe
from frappe import _
from frappe.query_builder.functions import Count
from pypika import Order
from frappe.database.query import RawCriterion

from kandil_hr.candidates import identity
from kandil_hr.candidates.profile import normalize
from kandil_hr.portal.api import authenticated
from kandil_hr.portal.organization import bounded_text, paging
from kandil_hr.portal.vacancies import permitted_names
from kandil_hr.foundation.teams import candidate_opening_condition
from kandil_hr.recruitment.vacancy_access import identity_labels

STATES=('Open','Replied','Shortlisted','Rejected','Hold','Accepted')


def access():
    authenticated()
    if frappe.session.user!='Administrator' and 'Kandil Recruiter' not in frappe.get_roles():
        frappe.throw(_('Candidate access requires a recruitment role.'),frappe.PermissionError)
    frappe.has_permission('Job Applicant','read',throw=True)


def base():
    a=frappe.qb.DocType('Job Applicant');o=frappe.qb.DocType('Job Opening');r=frappe.qb.DocType('Kandil Hiring Request')
    q=(frappe.qb.from_(a).join(o).on(a.job_title==o.name).join(r).on(o.custom_kandil_request==r.name)
       .where(a.name.isin(permitted_names('Job Applicant')) & o.name.isin(permitted_names('Job Opening'))
              & r.name.isin(permitted_names('Kandil Hiring Request'))))
    return q,a,o,r


def filters(q,a,o,r,search='',status='',opening='',person=''):
    if status:
        if status not in STATES: frappe.throw(_('Unknown candidate application status.'))
        q=q.where(a.status==status)
    if opening:q=q.where(o.name==bounded_text(opening))
    if person:q=q.where(a.custom_kandil_person==bounded_text(person))
    term=bounded_text(search)
    if term:
        literal='%'+term.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
        q=q.where(a.applicant_name.like(literal)|a.name.like(literal)|a.email_id.like(literal)|a.phone_number.like(literal))
    return q


@frappe.whitelist(methods=['GET'])
def listing(search='',status='',opening='',person='',start=0,page_length=25):
    access();offset,limit=paging(start,page_length)
    q,a,o,r=base();q=filters(q,a,o,r,search,status,opening,person)
    total=deepcopy(q).select(Count(a.name).as_('total')).run(as_dict=True)[0].total
    rows=(q.select(a.name,a.applicant_name,a.status,a.custom_kandil_person.as_('person'),a.modified,
        a.custom_kandil_source_channel.as_('source'),a.custom_kandil_responsible_user.as_('recruiter'),
        o.name.as_('opening'),o.job_title.as_('job_title'),r.company)
        .orderby(a.modified,order=Order.desc).orderby(a.name).limit(limit).offset(offset).run(as_dict=True))
    labels=identity_labels([x.recruiter for x in rows])
    for row in rows:
        row['recruiter_label']=labels.get(row.pop('recruiter'),_('Unassigned or restricted'))
    return dict(rows=rows,total=total,start=offset,page_length=limit,has_more=offset+limit<total,
                intake_enabled=bool(identity.enabled()))


def readable_application(name):
    q,a,o,r=base()
    if not q.select(a.name).where(a.name==name).limit(1).run():
        frappe.throw(_('Application is unavailable in your current scope.'),frappe.PermissionError)
    app=frappe.get_doc('Job Applicant',name);app.check_permission('read')
    return app


@frappe.whitelist(methods=['GET'])
def detail(name):
    access();app=readable_application(bounded_text(name))
    opening=frappe.get_doc('Job Opening',app.job_title);request=frappe.get_doc('Kandil Hiring Request',opening.custom_kandil_request)
    labels=identity_labels([app.custom_kandil_responsible_user,app.custom_kandil_next_action_owner])
    result=dict(name=app.name,applicant_name=app.applicant_name,email_id=app.email_id,phone_number=app.phone_number,
        status=app.status,modified=str(app.modified),person=app.custom_kandil_person,
        source=app.custom_kandil_source_channel,source_detail=app.custom_kandil_source_detail,
        identity_origin=app.custom_kandil_identity_origin,opening=opening.name,job_title=opening.job_title,
        company=request.company,recruiter=labels.get(app.custom_kandil_responsible_user),
        next_action=app.custom_kandil_next_action,next_action_due=app.custom_kandil_next_action_due,
        next_action_owner=labels.get(app.custom_kandil_next_action_owner))
    candidate=person_detail(app.custom_kandil_person) if app.custom_kandil_person else None
    return dict(application=result,person=candidate)


def person_detail(name):
    q,a,o,r=base()
    if not q.select(a.name).where(a.custom_kandil_person==name).limit(1).run():
        frappe.throw(_('Candidate identity is unavailable in your current scope.'),frappe.PermissionError)
    person=frappe.get_doc(identity.DT,name);person.check_permission('read')
    return dict(name=person.name,company=person.company,modified=str(person.modified),
                identity_state=person.identity_state,profile=normalize(json.loads(person.profile_json or '{}')))


@frappe.whitelist(methods=['GET'])
def person(name):
    access();return person_detail(bounded_text(name))


@frappe.whitelist(methods=['GET'])
def openings(search='',start=0,page_length=25):
    access();identity.guard();offset,limit=paging(start,page_length)
    o=frappe.qb.DocType('Job Opening');r=frappe.qb.DocType('Kandil Hiring Request')
    q=(frappe.qb.from_(o).join(r).on(o.custom_kandil_request==r.name)
       .where(o.name.isin(permitted_names('Job Opening'))&r.name.isin(permitted_names('Kandil Hiring Request')))
       .where((r.status=='Approved')&o.custom_kandil_vacancy_state.isin(('Open','Partially Filled')))
       .where(RawCriterion(candidate_opening_condition(frappe.session.user))))
    term=bounded_text(search)
    if term:
        literal='%'+term.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
        q=q.where(o.job_title.like(literal)|o.name.like(literal))
    total=deepcopy(q).select(Count(o.name).as_('total')).run(as_dict=True)[0].total
    rows=(q.select(o.name,o.job_title,r.name.as_('request'),r.modified.as_('expected_version'),r.company)
          .orderby(o.job_title).orderby(o.name).limit(limit).offset(offset).run(as_dict=True))
    return dict(rows=rows,total=total,start=offset,has_more=offset+limit<total)
