"""Scoped, read-only recruiter work queue; counts and rows share native scope.

Reference: candTasks_ next/fresh branches. Rejection-message, duplicate-review,
knockout and ad-close work have separate workflow prerequisites, not fake rows.
"""
from copy import deepcopy

import frappe
from frappe import _
from frappe.query_builder.functions import Count, Sum
from pypika.terms import Case

from kandil_hr.foundation.clock import today_cairo
from kandil_hr.portal import candidates
from kandil_hr.portal.organization import paging
from kandil_hr.portal.vacancies import Coalesce
from kandil_hr.recruitment.vacancy_access import identity_labels
from kandil_hr.candidates.search import labels

BUCKETS = ('all', 'overdue', 'today', 'upcoming', 'unplanned')


def predicates(a, o, at, mode):
    owner = Coalesce(a.custom_kandil_responsible_user, '')
    next_owner = Coalesce(a.custom_kandil_next_action_owner, '')
    due = a.custom_kandil_next_action_due
    scheduled = due.isnotnull()
    fresh = (a.status == 'Open') & due.isnull() & o.custom_kandil_vacancy_state.isin(
        ('Approved', 'Open', 'Partially Filled', 'On Hold', 'Frozen'))
    if mode == 'mine':
        me = frappe.session.user
        assigned = (owner == me) | ((owner == '') & (o.custom_kandil_lead == me))
        scheduled &= (next_owner == me) | ((next_owner == '') & assigned)
        # The native candidate scope already requires team membership or explicit
        # HR authority. Unassigned fresh applications remain discoverable there.
        fresh &= (owner == me) | (owner == '')
    return dict(overdue=scheduled & (due < at), today=scheduled & (due == at),
                upcoming=scheduled & (due > at), unplanned=fresh)


def live_condition(a):
    # Match ownership.live: Accepted is still active until actual joining; one
    # cancelled offer must not hide another active one. NULL links cannot poison
    # NOT IN, and an empty outcome is an active offer.
    offer = frappe.qb.DocType('Job Offer')
    offers = frappe.qb.from_(offer).select(offer.job_applicant).where(
        (offer.docstatus < 2) & offer.job_applicant.isnotnull())
    active_offers = deepcopy(offers).where(
        Coalesce(offer.custom_kandil_outcome, '').notin(('Joined', 'No Show', 'Withdrawn')))
    return (a.status != 'Rejected') & (a.name.notin(offers) | a.name.isin(active_offers))


@frappe.whitelist(methods=['GET'])
def listing(mode='mine', bucket='all', search='', start=0, page_length=20):
    candidates.access()
    if mode not in ('mine', 'scope') or bucket not in BUCKETS:
        frappe.throw(_('Choose a valid work queue and due filter.'))
    offset, limit = paging(start, page_length)
    at = today_cairo().isoformat()
    query, a, o, r = candidates.base()
    query = candidates.filters(query, a, o, r, search=search).where(live_condition(a))
    buckets = predicates(a, o, at, mode)
    eligible = buckets['overdue'] | buckets['today'] | buckets['upcoming'] | buckets['unplanned']
    query = query.where(eligible)
    aggregate = deepcopy(query).select(Count(a.name).as_('all'), *[
        Sum(Case().when(test, 1).else_(0)).as_(key) for key, test in buckets.items()
    ]).run(as_dict=True)[0]
    counts = {key: int(aggregate.get(key) or 0) for key in BUCKETS}
    if bucket != 'all':
        query = query.where(buckets[bucket])
    rank = Case().when(buckets['overdue'], 0).when(buckets['today'], 1).when(buckets['upcoming'], 2).else_(3)
    rows = (query.select(a.name, a.applicant_name, a.custom_kandil_person.as_('person'), a.status,
        a.custom_kandil_responsible_user.as_('owner'), a.custom_kandil_next_action_owner.as_('next_owner'),
        a.custom_kandil_next_action.as_('task'), a.custom_kandil_next_action_due.as_('due'), a.creation,
        o.job_title, o.custom_kandil_vacancy_state.as_('vacancy_state'), r.company)
        .orderby(rank).orderby(a.custom_kandil_next_action_due).orderby(a.creation).orderby(a.name)
        .limit(limit).offset(offset).run(as_dict=True))
    users = identity_labels([row.get(key) for row in rows for key in ('owner', 'next_owner')])
    names = labels([row.person for row in rows])
    for row in rows:
        row['person_name'] = names.get(row.pop('person'))
        row['owner_label'] = users.get(row.pop('owner'))
        row['next_owner_label'] = users.get(row.pop('next_owner'))
        date = str(row.due) if row.due else None
        row['bucket'] = 'unplanned' if not date else 'overdue' if date < at else 'today' if date == at else 'upcoming'
    return dict(rows=rows, counts=counts, total=counts[bucket], start=offset,
                page_length=limit, has_more=offset + limit < counts[bucket], as_of=at,
                mode=mode, bucket=bucket)
