"""Read-only legacy identity review; no public mutation or automatic activation."""
from copy import deepcopy
import hashlib
import json
import re

import frappe
from frappe import _
from frappe.database.query import RawCriterion
from frappe.query_builder.functions import Count

from kandil_hr.candidates import identity
from kandil_hr.candidates.profile import normalize
from kandil_hr.candidates.search import application_query, Coalesce
from kandil_hr.portal.api import authenticated
from kandil_hr.portal.organization import bounded_text,paging
from kandil_hr.foundation.security import scope_query


def can_review():
    user=frappe.session.user
    return bool(user=='Administrator' or ('Kandil Recruiter' in frappe.get_roles() and
        frappe.db.exists('Kandil Organization Settings',{'hr_approver':user})))


def access():
    authenticated()
    if not can_review():
        frappe.throw(_('Only the configured HR authority may review legacy identity migration.'),frappe.PermissionError)
    frappe.has_permission('Job Applicant','read',throw=True)


def base():
    q,a,o,r=application_query()
    user=frappe.session.user
    if user!='Administrator':
        settings=frappe.qb.DocType('Kandil Organization Settings')
        q=q.where(r.company.isin(frappe.qb.from_(settings).select(settings.name).where(settings.hr_approver==user)))
    condition=scope_query('Kandil Hiring Request',user,'manage')
    if condition:q=q.where(RawCriterion(condition))
    return q,a,o,r


@frappe.whitelist(methods=['GET'])
def listing(search='',start=0,page_length=20):
    access();offset,limit=paging(start,page_length);q,a,o,r=base()
    q=q.where(Coalesce(a.custom_kandil_person,'')=='')
    term=bounded_text(search)
    if term:
        literal='%'+term.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
        q=q.where(a.applicant_name.like(literal)|a.name.like(literal))
    total=deepcopy(q).select(Count(a.name).as_('total')).run(as_dict=True)[0].total
    rows=(q.select(a.name,a.applicant_name,a.status,o.job_title,r.company)
          .orderby(a.name).limit(limit).offset(offset).run(as_dict=True))
    return dict(rows=rows,total=total,start=offset,has_more=offset+limit<total,read_only=True)


def references(kind,application):
    if not frappe.has_permission(kind,'read'):
        return dict(available=False,rows=[],has_more=False)
    from kandil_hr.portal.vacancies import permitted_names
    d=frappe.qb.DocType(kind)
    rows=(frappe.qb.from_(d).select(d.name).where((d.job_applicant==application)&d.name.isin(permitted_names(kind))).orderby(d.name).limit(6).run(as_dict=True))
    return dict(available=True,rows=[r.name for r in rows[:5]],has_more=len(rows)>5)


@frappe.whitelist(methods=['GET'])
def preview(name):
    access();name=bounded_text(name);q,a,o,r=base()
    if not q.select(a.name).where(a.name==name).limit(1).run():
        frappe.throw(_('Legacy application is unavailable in your current scope.'),frappe.PermissionError)
    app=frappe.get_doc('Job Applicant',name);app.check_permission('read')
    opening=frappe.get_doc('Job Opening',app.job_title);request=frappe.get_doc('Kandil Hiring Request',opening.custom_kandil_request)
    issues=[];proposed=None
    if app.custom_kandil_person:issues.append('already_linked')
    try:
        proposed=normalize(dict(full_name=app.applicant_name or '',email_id=app.email_id or '',phone_number=app.phone_number or ''))
        if not proposed['full_name'] or (not proposed['email_id'] and len(re.sub(r'\D','',proposed['phone_number']))<7):
            issues.append('incomplete_contact')
    except frappe.ValidationError:
        frappe.clear_messages();issues.append('invalid_profile')
    reviewed=dict(application=app.name,application_version=str(app.modified),request=request.name,
                  request_version=str(request.modified),opening=opening.name,company=request.company,
                  person=app.custom_kandil_person or None,proposed_profile=proposed,issues=issues)
    fingerprint=hashlib.sha256(json.dumps(reviewed,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    return dict(**reviewed,preview_hash=fingerprint,read_only=True,mutation_enabled=False,
                intake_mode_enabled=bool(identity.enabled()),
                preserved=dict(application_id=app.name,contact_snapshot=True,application_key=True,
                               source=True,downstream_links=True),
                references={kind:references(kind,app.name) for kind in ('Job Offer','Interview','Employee Onboarding')},
                policy='One new unreviewed person per legacy application; no automatic merging, source invention or consent claim.')
