"""Reviewed referral intake with immutable attribution and no payment effects.

The employee picker exposes only active names/codes/jobs inside the recruiter's
current company scope. It never grants native Employee access. Candidate links
are explicit; contact matching is not employee identity proof.
"""
import json
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import get_datetime

from kandil_hr.candidates.intake import text
from kandil_hr.foundation.clock import now_cairo
from kandil_hr.sourcing import sources, agencies

DT = 'Kandil Referral Submission'


class KandilReferralSubmission(agencies.KandilAgencyRevision):
    def autoname(self):
        self.name = 'KRF-' + sources.digest([self.application])


def policy():
    days = frappe.conf.get('kandil_referral_prior_days', 180)
    relationship = frappe.conf.get('kandil_referral_relationship_required', False)
    if type(days) is not int or not 0 <= days <= 9999 or type(relationship) not in (bool, int) or relationship not in (0, 1):
        frappe.throw(_('Referral policy configuration is invalid.'))
    value = dict(prior_days=days, relationship_required=bool(relationship))
    return dict(value, version=sources.digest(value))


def access(company):
    sources.authorize(company)
    if not sources.enabled():
        frappe.throw(_('Controlled sources are required for referral intake.'), frappe.PermissionError)


def has_master(company):
    # Inactive employees still count: a name-only fallback must not bypass them.
    return bool(frappe.db.sql('SELECT name FROM `tabEmployee` WHERE company=%s LIMIT 1 FOR UPDATE', (company,)))


@frappe.whitelist(methods=['GET'])
def employees(company, query='', after=''):
    company = text(company, 140)
    access(company)
    query = text(query, 140, False)
    after = text(after, 140, False)
    base = dict(has_master=has_master(company), policy=policy(), rows=[], has_more=False, next_after='')
    if len(query) < 2:
        return base
    # Escape wildcards so a typed query is literal; values remain parameterized.
    term = '%' + query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
    rows = frappe.db.sql('''SELECT name,employee_name,designation,modified FROM `tabEmployee`
        WHERE company=%s AND status='Active' AND name>%s
        AND (employee_name LIKE %s OR name=%s) ORDER BY name LIMIT 21''',
        (company, after, term, query), as_dict=True)
    base.update(rows=[dict(name=r.name, label=r.employee_name, job=r.designation or '', version=str(r.modified)) for r in rows[:20]],
                has_more=len(rows)>20, next_after=rows[19].name if len(rows)>20 else '')
    return base


def selected(company, value):
    if not sources.enabled():
        frappe.throw(_('Controlled sources are required for referral intake.'), frappe.PermissionError)
    keys = {'employee', 'employee_version', 'employee_name', 'relationship', 'policy_version'}
    if not isinstance(value, dict) or set(value) != keys:
        frappe.throw(_('Review the referring employee, relationship and policy.'))
    data = {k: text(v, 140 if k != 'relationship' else 60, False) for k, v in value.items()}
    rules = policy()
    if data['policy_version'] != rules['version']:
        frappe.throw(_('Referral policy changed. Refresh and review it.'), frappe.TimestampMismatchError)
    if rules['relationship_required'] and not data['relationship']:
        frappe.throw(_('Record the employee relationship to the candidate.'))
    if data['employee']:
        rows = frappe.db.sql('''SELECT name,employee_name,designation,status,modified FROM `tabEmployee`
            WHERE name=%s AND company=%s FOR UPDATE''', (data['employee'], company), as_dict=True)
        if not rows or rows[0].status != 'Active':
            frappe.throw(_('Select an active referring employee in this company.'), frappe.PermissionError)
        employee = rows[0]
        if str(employee.modified) != data['employee_version']:
            frappe.throw(_('The employee record changed. Review the selection again.'), frappe.TimestampMismatchError)
        # Display names come from the authoritative employee row, never client text.
        employee_id, name, job = employee.name, employee.employee_name, employee.designation or ''
    else:
        if has_master(company):
            frappe.throw(_('Select the referring employee from the employee register.'), frappe.PermissionError)
        name = ' '.join(data['employee_name'].split())
        if len(name) < 3 or data['employee_version']:
            frappe.throw(_('Provide the referring employee name for the empty-register fallback.'))
        employee_id, job = '', ''
    return dict(employee=employee_id, employee_name=name, employee_job=job,
                employee_version=data['employee_version'] if employee_id else '',
                relationship=data['relationship'], policy=rules,
                identity_basis='employee_register' if employee_id else 'empty_register_name_only')


def check_person(company, opening, person, selection):
    # The existing Employee -> Job Applicant -> Person relation is authoritative.
    # Missing links are not resolved by phone/name matching.
    employees = frappe.db.sql('''SELECT e.name,e.status FROM `tabEmployee` e
        INNER JOIN `tabJob Applicant` a ON a.name=e.job_applicant
        WHERE e.company=%s AND a.custom_kandil_person=%s FOR UPDATE''', (company, person), as_dict=True)
    if selection['employee'] and any(e.name == selection['employee'] for e in employees):
        frappe.throw(_('An employee cannot refer themselves.'), frappe.PermissionError)
    key = selection['employee'] or sources.normalized_label(selection['employee_name'])
    prior = frappe.db.sql('''SELECT referrer_key FROM `tabKandil Referral Submission`
        WHERE company=%s AND opening=%s AND person=%s FOR UPDATE''', (company, opening, person), as_dict=True)
    if any(r.referrer_key != key for r in prior):
        frappe.throw(_('An earlier referral for this person and vacancy requires HR review.'), frappe.PermissionError)
    return any(e.status == 'Active' for e in employees)


def capture(app, company, selection, primary):
    internal = check_person(company, app.job_title, app.custom_kandil_person, selection)
    since = now_cairo().date() - timedelta(days=selection['policy']['prior_days'])
    known = bool(frappe.db.sql('''SELECT a.name FROM `tabJob Applicant` a
        INNER JOIN `tabJob Opening` o ON o.name=a.job_title
        WHERE o.company=%s AND a.custom_kandil_person=%s AND a.name!=%s
        AND a.creation>=%s AND a.creation<%s LIMIT 1 FOR UPDATE''',
        (company, app.custom_kandil_person, app.name, since, get_datetime(app.creation))))
    status, reason = ('NOT_ELIGIBLE', 'internal_candidate') if internal else (
        ('REVIEW', 'influencing_source') if not primary else (
        ('REVIEW', 'recent_application') if known else ('PENDING', 'awaiting_hr_decision')))
    snapshot = dict(selection, kind='PRIMARY' if primary else 'INFLUENCING',
                    bonus_status=status, eligibility_reason=reason,
                    internal_identity='linked_active_employee' if internal else 'no_linked_active_employee')
    values = dict(company=company, application=app.name, opening=app.job_title, person=app.custom_kandil_person,
                  employee=selection['employee'] or None,
                  referrer_key=selection['employee'] or sources.normalized_label(selection['employee_name']),
                  snapshot_json=json.dumps(snapshot, ensure_ascii=False), actor=frappe.session.user)
    with sources.effect():
        return frappe.get_doc(dict(doctype=DT, **values, content_hash=sources.digest(values))).insert(ignore_permissions=True)


@frappe.whitelist(methods=['GET'])
def application(name):
    from kandil_hr.privacy.consent import authorize
    from kandil_hr.sourcing.attribution import outcome_lock
    request, opening, app, person = authorize(name)
    row = frappe.db.get_value(DT, {'application': app.name}, ['snapshot_json', 'creation'], as_dict=True, for_update=True)
    return dict(submission=dict(json.loads(row.snapshot_json), recorded_at=str(row.creation)) if row else None,
                locked=bool(outcome_lock(app)), policy='Initial referral evidence only; no bonus approval or payment.')


def schema_proof():
    import hashlib
    proof = agencies.schema_proof()
    rows = frappe.get_all(DT, fields=['*'], order_by='name asc', limit_page_length=0) if frappe.db.table_exists(DT) else None
    proof['tables'][DT] = None if rows is None else dict(count=len(rows), sha256=hashlib.sha256(json.dumps(rows, sort_keys=True, default=str).encode()).hexdigest())
    return proof
