"""Bounded vacancy read model. Native opening AND request access precede paging.

No business writes: lifecycle, assignment and headcount stay in recruitment.
Counts use the identical query as rows. SQL ranking is checked against the pure
priority function; effective lead eligibility follows the live all-location grant.
"""
from copy import deepcopy

import frappe
from frappe import _
from frappe.database.query import RawCriterion
from frappe.query_builder.functions import Count
from frappe.utils import cint, today
from pypika import Order
from pypika.terms import Case, CustomFunction

from kandil_hr.foundation.clock import today_cairo
from kandil_hr.foundation.security import request_scope
from kandil_hr.foundation.teams import can_manage_team
from kandil_hr.portal.api import authenticated, read_request
from kandil_hr.portal.organization import bounded_text, paging
from kandil_hr.recruitment.history_access import user_permissions
from kandil_hr.recruitment.priority import score

STATES = ('Approved', 'Open', 'Partially Filled', 'On Hold', 'Frozen', 'Filled', 'Closed', 'Cancelled')
ACTIVE = STATES[:5]
RANKED = STATES[:3]
PARENT = 'Kandil Hiring Request'
Coalesce = CustomFunction('COALESCE', ['value', 'fallback'])
DateDiff = CustomFunction('DATEDIFF', ['later', 'earlier'])


def effective_lead_condition():
    """Fixed SQL aliases only; mirrors teams.effective_lead, not viewer access.

    The lead must cover every parent line and the requested position. An expired,
    revoked or partial grant cannot hide an opening from the unassigned queue.
    """
    at = frappe.db.escape(today())
    base = f"""g.user=o.custom_kandil_lead AND g.company=r.company AND g.revoked=0
      AND g.valid_from<={at} AND (g.valid_until IS NULL OR g.valid_until>={at})
      AND (COALESCE(g.department,'')='' OR g.department=r.department)
      AND g.can_manage_recruitment=1"""
    position = f"""(COALESCE(r.requested_position,'')='' OR EXISTS (
      SELECT 1 FROM `tabKandil Position` p WHERE p.name=r.requested_position
      AND p.company=r.company AND p.department=r.department AND EXISTS (
      SELECT 1 FROM `tabKandil Access Grant` g WHERE {base}
      AND (COALESCE(g.branch,'')='' OR g.branch=p.branch))))"""
    scope = f"""{position} AND NOT EXISTS (
      SELECT 1 FROM `tabKandil Request Line` sl LEFT JOIN `tabKandil Capacity` sc ON sc.name=sl.capacity
      WHERE sl.parent=r.name AND sl.parenttype='Kandil Hiring Request' AND sl.parentfield='lines'
      AND (COALESCE(sc.branch,'')='' OR NOT EXISTS (
      SELECT 1 FROM `tabKandil Access Grant` g WHERE {base}
      AND (COALESCE(g.branch,'')='' OR g.branch=sc.branch))))"""
    # Opening rows always have an exact parent line. No empty-line fallback is
    # needed here. Administrator is the documented scope break-glass account.
    return RawCriterion(f"""(EXISTS (SELECT 1 FROM `tabUser` lu WHERE lu.name=o.custom_kandil_lead AND lu.enabled=1)
      AND EXISTS (SELECT 1 FROM `tabHas Role` lr WHERE lr.parent=o.custom_kandil_lead
      AND lr.parenttype='User' AND lr.role='Kandil Recruiter')
      AND (o.custom_kandil_lead='Administrator' OR ({scope})))""")


def ranking(o, r, at):
    classification = Coalesce(CustomFunction('NULLIF', ['value', 'blank'])(r.hr_priority, ''), r.requested_priority)
    age = DateDiff(at, Coalesce(o.custom_kandil_started_on, o.creation))
    due = DateDiff(r.required_by, at)
    base = Case().when(classification == 'Critical', 60).when(classification == 'Important', 40).else_(20)
    age_points = Case().when(age > 60, 40).when(age > 30, 25).when(age > 15, 10).else_(0)
    due_points = Case().when(due < 0, 30).when(due <= 7, 20).when(due <= 30, 10).else_(0)
    pin = Case().when(o.custom_kandil_pin_until >= at, 100).else_(0)
    return Case().when(o.custom_kandil_vacancy_state.isin(RANKED), base + age_points + due_points + pin).else_(0)


def permitted_names(kind, user=None):
    # Native list compilation does not check child Link User Permissions, while
    # Document.check_permission does. Apply those restrictions BEFORE the count
    # rather than dropping inaccessible rows after pagination.
    from frappe.permissions import get_allowed_docs_for_doctype
    user = user or frappe.session.user
    q = frappe.qb.get_query(kind, fields=['name'], ignore_permissions=False, db_query_compat=True, user=user)
    if user == 'Administrator':
        return q
    parent = frappe.qb.DocType(kind)
    permissions = frappe.permissions.get_user_permissions(user)
    strict = frappe.get_system_settings('apply_strict_user_permissions')
    q = q.where(RawCriterion(user_permissions(kind, user)))
    for table_field in frappe.get_meta(kind).get_table_fields():
        child = frappe.qb.DocType(table_field.options)
        for field in frappe.get_meta(table_field.options).get_link_fields():
            if field.ignore_user_permissions:
                continue
            allowed = get_allowed_docs_for_doctype(permissions.get(field.options, []), kind)
            if not allowed:
                continue
            value = Coalesce(child[field.fieldname], '')
            forbidden = value.notin(allowed)
            if not strict:
                forbidden = forbidden & (value != '')
            bad_parents = frappe.qb.from_(child).select(child.parent).where(
                (child.parenttype == kind) & (child.parentfield == table_field.fieldname) & forbidden)
            q = q.where(parent.name.notin(bad_parents))
    return q


def query(mode, state, search, company, department, branch, at):
    o = frappe.qb.DocType('Job Opening').as_('o')
    r = frappe.qb.DocType(PARENT).as_('r')
    line = frappe.qb.DocType('Kandil Request Line').as_('vl')
    cap = frappe.qb.DocType('Kandil Capacity').as_('vc')
    q = (frappe.qb.from_(o).join(r).on(r.name == o.custom_kandil_request)
         .join(line).on((line.parent == r.name) & (line.job_opening == o.name)
                       & (line.parenttype == PARENT) & (line.parentfield == 'lines'))
         .join(cap).on((cap.name == line.capacity) & (cap.company == r.company) & (cap.department == r.department))
         .where(o.name.isin(permitted_names('Job Opening')) & r.name.isin(permitted_names(PARENT)))
         .where(r.status.isin(('Approved', 'Filled', 'Closed', 'Cancelled'))))
    if state != 'all':
        q = q.where(o.custom_kandil_vacancy_state.isin(ACTIVE if state == 'active' else (state,)))
    else:
        q = q.where(o.custom_kandil_vacancy_state.isin(STATES))
    eligible = effective_lead_condition()
    if mode == 'unassigned':
        q = q.where(~eligible)
    elif mode == 'mine':
        # Role and current all-location scope are additional to read access.
        if 'Kandil Recruiter' not in frappe.get_roles():
            q = q.where(RawCriterion('1=0'))
        else:
            from kandil_hr.foundation.security import scope_query
            permitted_manage = frappe.qb.from_(frappe.qb.DocType(PARENT)).select('name').where(
                RawCriterion(scope_query(PARENT, capability='manage') or '1=1'))
            team_type = frappe.get_meta('Job Opening').get_field('custom_kandil_team').options
            team = frappe.qb.DocType(team_type)
            member_openings = frappe.qb.from_(team).select(team.parent).where(
                (team.user == frappe.session.user) & (team.parenttype == 'Job Opening') & (team.parentfield == 'custom_kandil_team'))
            q = q.where(r.name.isin(permitted_manage) &
                        ((o.custom_kandil_lead == frappe.session.user) | o.name.isin(member_openings)))
    for field, value in ((r.company, company), (r.department, department), (cap.branch, branch)):
        if value:
            q = q.where(field == value)
    if search:
        literal = '%' + search.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        q = q.where(o.name.like(literal) | r.name.like(literal) | r.title.like(literal))
    return q, o, r, cap, line, ranking(o, r, at), eligible


def visible_team(opening):
    """Only contextual identity labels, never complete User profiles.

    Native User Permissions can hide a historical member. Disable the legacy
    replace-team action in that case so redaction cannot silently delete them.
    """
    ids = {m.user for m in opening.get('custom_kandil_team') or [] if m.user}
    if opening.custom_kandil_lead:
        ids.add(opening.custom_kandil_lead)
    if not ids:
        return {}, False
    user = frappe.qb.DocType('User')
    rows = (frappe.qb.from_(user).select(user.name, user.full_name).where(user.name.isin(sorted(ids)))
            .where(RawCriterion(user_permissions('User', frappe.session.user))).run(as_dict=True))
    labels = {row.name: row.full_name or row.name for row in rows}
    return labels, len(labels) != len(ids)


@frappe.whitelist(methods=['GET'])
def listing(mode='scope', state='active', search='', company='', department='', branch='', start=0, page_length=25):
    authenticated()
    if not isinstance(mode, str) or mode not in ('scope', 'mine', 'unassigned'):
        frappe.throw(_('Choose a valid vacancy view.'))
    if not isinstance(state, str) or state not in ('active', 'all', *STATES):
        frappe.throw(_('Choose a valid vacancy state.'))
    search, company, department, branch = map(bounded_text, (search, company, department, branch))
    start, limit = paging(start, page_length)
    at = str(today_cairo())
    q, o, r, cap, line, rank, eligible = query(mode, state, search, company, department, branch, at)
    total = cint(deepcopy(q).select(Count(o.name).as_('total')).run(as_dict=True)[0].total)
    page = (q.select(o.name, rank.as_('rank'), Case().when(eligible, 1).else_(0).as_('has_lead'))
            .orderby(rank, order=Order.desc).orderby(o.name).limit(limit).offset(start).run(as_dict=True))
    rows = []
    for item in page:
        opening = frappe.get_doc('Job Opening', item.name)
        opening.check_permission('read')
        doc = read_request(opening.custom_kandil_request)
        line = next(l for l in doc.lines if l.job_opening == opening.name)
        branch_name = frappe.db.get_value('Kandil Capacity', line.capacity, 'branch')
        priority = score(doc.hr_priority or doc.requested_priority, opening.custom_kandil_started_on or opening.creation,
                         doc.required_by, opening.custom_kandil_pin_until, at, opening.custom_kandil_vacancy_state in RANKED)
        if priority['score'] != item.rank:
            raise RuntimeError('Vacancy priority query and domain calculation disagree')
        labels, restricted = visible_team(opening)
        lead = opening.custom_kandil_lead if item.has_lead else None
        rows.append(dict(name=opening.name, request=doc.name, title=doc.title, company=doc.company,
            department=doc.department, branch=branch_name, state=opening.custom_kandil_vacancy_state,
            requested=cint(line.requested_qty), quantity=cint(line.approved_qty), joined=cint(line.joined_qty),
            closed=cint(line.closed_qty), remaining=max(0, cint(line.approved_qty)-cint(line.joined_qty)-cint(line.closed_qty)),
            expected_version=str(doc.modified), priority=priority, required_by=str(doc.required_by) if doc.required_by else None,
            requested_priority=doc.requested_priority, hr_priority=doc.hr_priority or None,
            pin_until=str(opening.custom_kandil_pin_until) if opening.custom_kandil_pin_until else None,
            unassigned=not bool(item.has_lead), lead=lead if lead in labels else None, lead_name=labels.get(lead),
            team_restricted=restricted, members=[m.user for m in opening.get('custom_kandil_team') or [] if m.user in labels],
            can_assign=doc.status=='Approved' and opening.custom_kandil_vacancy_state in ACTIVE and not restricted
                and 'Kandil Recruiter' in frappe.get_roles() and can_manage_team(doc),
            can_manage=doc.status=='Approved' and opening.custom_kandil_vacancy_state in ACTIVE and 'Kandil Recruiter' in frappe.get_roles() and request_scope(doc, capability='manage')))
    return dict(rows=rows, total=total, start=start, page_length=limit, next_start=start+limit,
                has_more=start+limit<total, count_scope='permission_filtered_matching_vacancies', as_of=at,
                mode=mode, state=state, states=list(STATES))
