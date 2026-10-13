"""Bounded team review and candidate directory for one reviewed vacancy batch.

Read endpoints accept POST bodies to avoid long bulk IDs in GET URLs. Mutations
continue through recruitment.vacancies.assign_team / bulk_assign, with one command
identity and reviewed parent version. No service account, second team or ledger.
"""
import json
from copy import deepcopy

import frappe
from frappe import _
from frappe.database.query import RawCriterion
from frappe.query_builder.functions import Count
from frappe.utils import get_datetime, today, cint
from pypika.terms import ExistsCriterion

from kandil_hr.portal.api import authenticated, read_request
from kandil_hr.portal.organization import bounded_text, paging
from kandil_hr.portal.vacancies import ACTIVE, Coalesce
from kandil_hr.recruitment.history_access import user_permissions
from kandil_hr.recruitment.vacancy_access import check_team_authority, identity_labels


def parse_items(items):
    if isinstance(items, str) and len(items) > 40000:
        frappe.throw(_('The vacancy selection is too large.'))
    items = frappe.parse_json(items)
    if not isinstance(items, list) or not 1 <= len(items) <= 50:
        frappe.throw(_('Select between one and fifty vacancies.'))
    seen, versions = set(), {}
    for item in items:
        if (not isinstance(item, dict) or set(item) != {'name', 'opening_name', 'expected_version'}
                or any(not isinstance(v, str) or not v or len(v) > 140 for v in item.values())):
            frappe.throw(_('Every vacancy requires its request and reviewed version.'))
        if item['opening_name'] in seen:
            frappe.throw(_('Select each vacancy only once.'))
        seen.add(item['opening_name'])
        if item['name'] in versions and versions[item['name']] != item['expected_version']:
            frappe.throw(_('Vacancies from the same request need the same reviewed version.'))
        versions[item['name']] = item['expected_version']
    return items


def selection(items):
    authenticated()
    docs, selected = {}, []
    for item in parse_items(items):
        if item['name'] not in docs:
            docs[item['name']] = read_request(item['name'])
        doc = docs[item['name']]
        opening = frappe.get_doc('Job Opening', item['opening_name'])
        check_team_authority(doc, opening)
        if get_datetime(doc.modified) != get_datetime(item['expected_version']):
            frappe.throw(_('This selection changed. Refresh vacancies and review it again.'), frappe.TimestampMismatchError)
        if doc.status != 'Approved' or opening.custom_kandil_vacancy_state not in ACTIVE:
            frappe.throw(_('Only active or paused vacancies can have their team changed.'))
        selected.append((doc, opening))
    return list(docs.values()), selected


def recruiter_query(docs, search=''):
    user = frappe.qb.DocType('User')
    role = frappe.qb.DocType('Has Role')
    grant = frappe.qb.DocType('Kandil Access Grant')
    roles = frappe.qb.from_(role).select(role.parent).where((role.parenttype == 'User') & (role.role == 'Kandil Recruiter'))
    q = (frappe.qb.from_(user).where((user.enabled == 1) & user.name.notin(('Guest', 'Administrator'))
         & user.name.isin(roles)).where(RawCriterion(user_permissions('User', frappe.session.user))))
    dimensions = set()
    for doc in docs:
        if doc.requested_position:
            position = frappe.db.get_value('Kandil Position', doc.requested_position, ['company','department','branch'], as_dict=True)
            if not position or position.company != doc.company or position.department != doc.department:
                frappe.throw(_('The requested position does not match this request.'), frappe.PermissionError)
            dimensions.add((doc.company, doc.department, position.branch or ''))
        for line in doc.lines:
            capacity = frappe.db.get_value('Kandil Capacity', line.capacity, ['company','department','branch'], as_dict=True)
            if not capacity or capacity.company != doc.company or capacity.department != doc.department or not capacity.branch:
                frappe.throw(_('A request location is unavailable.'), frappe.PermissionError)
            dimensions.add((doc.company, doc.department, capacity.branch))
    for company, department, branch in sorted(dimensions):
        eligible = frappe.qb.from_(grant).select(grant.name).where(
            (grant.user == user.name) & (grant.company == company) & (grant.revoked == 0)
            & (grant.valid_from <= today()) & (grant.valid_until.isnull() | (grant.valid_until >= today()))
            & (grant.can_manage_recruitment == 1)
            & ((Coalesce(grant.department, '') == '') | (grant.department == department))
            & ((Coalesce(grant.branch, '') == '') | (grant.branch == branch)))
        q = q.where(ExistsCriterion(eligible))
    if search:
        literal = '%' + search.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        q = q.where(user.name.like(literal) | user.full_name.like(literal))
    return q, user


def projected_directory(docs, search='', start=0, page_length=25):
    term = bounded_text(search); start, limit = paging(start, page_length)
    q, user = recruiter_query(docs, term)
    total = cint(deepcopy(q).select(Count(user.name).as_('total')).run(as_dict=True)[0].total)
    rows = (q.select(user.name.as_('id'), Coalesce(user.full_name, user.name).as_('label'))
            .orderby(user.full_name).orderby(user.name).limit(limit).offset(start).run(as_dict=True))
    return dict(rows=rows,total=total,start=start,page_length=limit,next_start=start+limit,has_more=start+limit<total)


@frappe.whitelist(methods=['POST'])
def recruiters(items, search='', start=0, page_length=25):
    docs, _ = selection(items)
    return projected_directory(docs,search,start,page_length)


@frappe.whitelist(methods=['POST'])
def review(items):
    docs, selected = selection(items)
    ids = {opening.custom_kandil_lead for _,opening in selected} | {
        member.user for _,opening in selected for member in opening.get('custom_kandil_team') or []}
    ids -= {None,''}
    labels = identity_labels(ids)
    q,user = recruiter_query(docs)
    eligible = {r.name for r in q.select(user.name).where(user.name.isin(sorted(ids))).run(as_dict=True)} if ids else set()
    rows=[]
    for doc,opening in selected:
        line=next(l for l in doc.lines if l.job_opening==opening.name)
        current=list(dict.fromkeys([opening.custom_kandil_lead,*[m.user for m in opening.get('custom_kandil_team') or []]]))
        rows.append(dict(name=doc.name,opening_name=opening.name,expected_version=str(doc.modified),title=doc.title,
            branch=frappe.db.get_value('Kandil Capacity',line.capacity,'branch'),state=opening.custom_kandil_vacancy_state,
            lead=opening.custom_kandil_lead or None,
            members=[dict(id=value,label=labels[value],eligible_for_batch=value in eligible) for value in current if value]))
    return dict(rows=rows,selection_count=len(rows),replacement_mode='replace_complete_team',max_selection=50)
