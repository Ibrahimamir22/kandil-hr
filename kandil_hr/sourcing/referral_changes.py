"""Append-only referral changes and HR-reported bonus decisions.

Attribution locks after any recorded outcome; HR bonus follow-up remains possible.
PAID is a human report, never a payment operation or bank verification.
"""
import json
import uuid
from copy import deepcopy

import frappe
from frappe import _
from frappe.model.document import Document

from kandil_hr.candidates import activities
from kandil_hr.candidates.intake import text
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.recruitment.api import command
from kandil_hr.sourcing import attribution, referrals, sources

DT = 'Kandil Referral Revision'
BONUSES = ('PENDING', 'REVIEW', 'ELIGIBLE', 'NOT_ELIGIBLE', 'PAID')


class KandilReferralRevision(Document):
    def autoname(self):
        self.name = 'KRR-' + uuid.uuid4().hex

    def validate(self):
        attribution.guard()
        if not self.is_new() or not frappe.flags.get('kandil_source_effect'):
            frappe.throw(_('Referral history is immutable.'), frappe.PermissionError)

    def on_trash(self):
        frappe.throw(_('Referral history cannot be deleted or renamed.'), frappe.PermissionError)

    def before_rename(self, *args, **kwargs):
        self.on_trash()


def state(application):
    rows = frappe.db.sql('''SELECT name,sequence,after_json,content_hash FROM `tabKandil Referral Revision`
        WHERE application=%s ORDER BY sequence DESC LIMIT 1 FOR UPDATE''', (application,), as_dict=True)
    if rows:
        r = rows[0]
        return dict(version=r.name, sequence=r.sequence, value=json.loads(r.after_json), hash=r.content_hash)
    original = frappe.db.get_value(referrals.DT, {'application': application}, ['name', 'snapshot_json', 'content_hash'], as_dict=True, for_update=True)
    return dict(version='INTAKE:'+original.name if original else 'EMPTY:'+sources.digest(None),
                sequence=0, value=json.loads(original.snapshot_json) if original else None,
                hash=original.content_hash if original else sources.digest(None))


def claims(company, opening, person, exclude=''):
    # Current reads after the company lock: a repeatable-read snapshot could
    # otherwise miss an attribution committed while this command was waiting.
    names = set()
    for table in (referrals.DT, DT):
        names.update(row[0] for row in frappe.db.sql(
            f"SELECT application FROM `tab{table}` WHERE company=%s AND opening=%s AND person=%s FOR UPDATE",
            (company, opening, person)))
    result = []
    for name in sorted(names):
        if name == exclude:
            continue
        value = state(name)['value']
        if value:
            result.append(value['employee'] or sources.normalized_label(value['employee_name']))
    return result


def authorize(request, payload, bonus=False):
    app = attribution.authorize(request, payload)
    if bonus and not sources.can_edit(request.company):
        frappe.throw(_('Only configured company HR may record bonus decisions.'), frappe.PermissionError)
    return app


def inputs(action, referral, bonus_status, reason):
    if action not in ('SET', 'VOID', 'BONUS'):
        frappe.throw(_('Choose a valid referral action.'))
    why = text(reason, 1000)
    if len(why) < 3:
        frappe.throw(_('Record the reason or reported payment details.'))
    if action == 'SET':
        if not isinstance(referral, dict) or len(json.dumps(referral, ensure_ascii=False)) > 2000:
            frappe.throw(_('Review the referring employee.'))
        if bonus_status:
            frappe.throw(_('Referral changes cannot also decide a bonus.'))
    elif referral is not None:
        frappe.throw(_('This action does not change the referring employee.'))
    if action == 'BONUS' and bonus_status not in BONUSES:
        frappe.throw(_('Choose a valid bonus decision.'))
    if action != 'BONUS' and bonus_status:
        frappe.throw(_('This action does not decide a bonus.'))
    return why


def primary(app, company):
    value = attribution.state(app)['value']
    if value.get('source'):
        return value['source']['kind'] == 'REFERRAL'
    code = value['code'].upper().replace(' ', '_')
    return code == 'REFERRAL' or any(r['code'] == code and r['kind'] == 'REFERRAL' for r in sources.state(company, True)['items'])


@frappe.whitelist(methods=['POST'])
@transactional_retry
def change(name, opening_name, application, application_version, referral_version,
           action, reason, command_id, expected_version, referral=None, bonus_status=''):
    attribution.guard()
    why = inputs(action, referral, bonus_status, reason)
    payload = dict(opening=text(opening_name, 140), application=text(application, 140),
        application_version=text(application_version, 140), referral_version=text(referral_version, 140),
        action=action, bonus_status=bonus_status, reason_hash=sources.digest(why), referral_hash=sources.digest(referral))
    operation = 'candidate_referral_bonus' if action == 'BONUS' else 'candidate_referral_change'

    def act(request):
        app = authorize(request, payload, bonus=action == 'BONUS')
        activities.reviewed(app, application_version)
        before = state(app.name)
        if before['version'] != referral_version:
            frappe.throw(_('Referral history changed. Refresh and review it.'), frappe.TimestampMismatchError)
        if action != 'BONUS' and attribution.outcome_lock(app):
            frappe.throw(_('A recorded outcome permanently locks referral attribution.'), frappe.PermissionError)
        if action == 'BONUS':
            if not before['value']:
                frappe.throw(_('There is no active referral to decide.'))
            if before['value']['bonus_status'] == bonus_status:
                frappe.throw(_('No bonus status change to record.'))
            after = deepcopy(before['value'])
            after.update(bonus_status=bonus_status, eligibility_reason='hr_decision',
                         bonus_note=why,
                         bonus_at=str(frappe.utils.now_datetime()), payment_verified=False)
        elif action == 'VOID':
            if not before['value']:
                frappe.throw(_('There is no active referral to void.'))
            if primary(app, request.company):
                frappe.throw(_('A primary referral cannot be removed while the source is Referral. Use a reviewed source change.'), frappe.PermissionError)
            after = None
        else:
            selection = referrals.selected(request.company, referral)
            after = referrals.classify(app, request.company, selection, primary(app, request.company), exclude=app.name)
            if before['value'] and all(before['value'].get(k) == after.get(k) for k in ('employee', 'employee_name', 'relationship')):
                frappe.throw(_('No referring employee or relationship change to record.'))
        values = dict(company=request.company, application=app.name, opening=app.job_title, person=app.custom_kandil_person,
            sequence=before['sequence']+1, previous_revision=before['version'], before_hash=before['hash'],
            before_json=json.dumps(before['value'], ensure_ascii=False), after_json=json.dumps(after, ensure_ascii=False),
            action=action, actor=frappe.session.user, reason=why)
        with sources.effect():
            revision = frappe.get_doc(dict(doctype=DT, **values, content_hash=sources.digest(values))).insert(ignore_permissions=True)
        # Only neutral activity labels; private bonus notes remain in scoped history.
        activity = activities.append(app, request, 'SYSTEM', '', '', labels=dict(
            kind_label_ar='تحديث سجل ترشيح موظف', kind_label_en='Employee referral record updated'))
        return dict(application=app.name, revision=revision.name, activity=activity.name)

    return command(name, operation, command_id, expected_version, payload, act)


@frappe.whitelist(methods=['GET'])
def context(name, start=0, page_length=10):
    from kandil_hr.privacy.consent import authorize as scoped
    from kandil_hr.portal.organization import paging
    from kandil_hr.recruitment.vacancy_access import identity_labels
    request, opening, app, person = scoped(name)
    authorize(request, dict(opening=opening.name, application=app.name))
    current = state(app.name)
    offset, limit = paging(start, page_length)
    rows = frappe.db.sql('''SELECT name,action,actor,reason,creation,before_json,after_json FROM `tabKandil Referral Revision`
        WHERE application=%s ORDER BY sequence DESC LIMIT %s OFFSET %s FOR UPDATE''', (app.name, limit+1, offset), as_dict=True)
    more, rows = len(rows)>limit, rows[:limit]
    labels = identity_labels([r.actor for r in rows])
    return dict(application=app.name, application_version=str(app.modified), request=request.name, opening=opening.name,
                company=request.company, expected_version=str(request.modified), current=current,
                locked=bool(attribution.outcome_lock(app)), primary=primary(app, request.company),
                can_bonus=sources.can_edit(request.company), bonus_statuses=BONUSES,
                history=dict(start=offset, has_more=more, rows=[dict(name=r.name, action=r.action, actor=labels.get(r.actor),
                    reason=r.reason, at=str(r.creation), before=json.loads(r.before_json), after=json.loads(r.after_json)) for r in rows]))


def schema_proof():
    import hashlib
    proof = referrals.schema_proof()
    rows = frappe.get_all(DT, fields=['*'], order_by='name asc', limit_page_length=0) if frappe.db.table_exists(DT) else None
    proof['tables'][DT] = None if rows is None else dict(count=len(rows), sha256=hashlib.sha256(json.dumps(rows, sort_keys=True, default=str).encode()).hexdigest())
    return proof


@frappe.whitelist(methods=['GET'])
def listing(status='', search='', start=0, page_length=20):
    """Server-wide counts and pages share the exact native candidate scope."""
    from frappe.query_builder.functions import Count, Max, Sum
    from pypika.terms import Case
    from pypika import CustomFunction, Order
    from kandil_hr.portal import candidates
    from kandil_hr.portal.organization import paging
    from kandil_hr.portal.vacancies import Coalesce
    from kandil_hr.candidates.search import labels
    candidates.access()
    attribution.guard()
    if status and status not in BONUSES:
        frappe.throw(_('Choose a valid referral status.'))
    offset, limit = paging(start, page_length)
    q, app, opening, request = candidates.base()
    q = candidates.filters(q, app, opening, request, search=search)
    original = frappe.qb.DocType(referrals.DT)
    revision = frappe.qb.DocType(DT)
    newest = frappe.qb.DocType(DT).as_('newest_referral')
    last = frappe.qb.from_(newest).select(Max(newest.sequence)).where(newest.application == app.name)
    q = q.left_join(original).on(original.application == app.name).left_join(revision).on(
        (revision.application == app.name) & (revision.sequence == last))
    value = Coalesce(revision.after_json, original.snapshot_json)
    q = q.where(value.isnotnull() & (value != 'null'))
    unquote = CustomFunction('JSON_UNQUOTE', ['value'])
    extract = CustomFunction('JSON_EXTRACT', ['value', 'path'])
    decision = unquote(extract(value, '$.bonus_status'))
    aggregate = deepcopy(q).select(Count(app.name).as_('all'), *[
        Sum(Case().when(decision == item, 1).else_(0)).as_(item) for item in BONUSES]).run(as_dict=True)[0]
    counts = {key: int(aggregate.get(key) or 0) for key in ('all', *BONUSES)}
    if status:
        q = q.where(decision == status)
    rows = q.select(app.name, app.applicant_name, app.custom_kandil_person.as_('person'), app.status,
                    opening.job_title, request.company, value.as_('referral_json')).orderby(app.creation, order=Order.desc).orderby(app.name).limit(limit).offset(offset).run(as_dict=True)
    names = labels([r.person for r in rows])
    for row in rows:
        details = json.loads(row.pop('referral_json'))
        row.update(person_name=names.get(row.pop('person')), employee=details['employee'],
                   employee_name=details['employee_name'], relationship=details['relationship'],
                   kind=details['kind'], bonus_status=details['bonus_status'])
    total = counts[status or 'all']
    return dict(rows=rows, counts=counts, total=total, start=offset, has_more=offset+limit<total)
