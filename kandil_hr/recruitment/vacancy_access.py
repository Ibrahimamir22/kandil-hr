"""Current native vacancy/reference access, including direct command and replay."""
import frappe
from frappe import _
from frappe.database.query import RawCriterion

from kandil_hr.foundation.teams import can_manage_team
from kandil_hr.recruitment.history_access import user_permissions


def identity_labels(ids):
    """Minimal labels in an authorized vacancy context; no User profile access."""
    ids = sorted(set(ids) - {None, ''})
    if not ids:
        return {}
    user = frappe.qb.DocType('User')
    rows = (frappe.qb.from_(user).select(user.name, user.full_name).where(user.name.isin(ids))
            .where(RawCriterion(user_permissions('User', frappe.session.user))).run(as_dict=True))
    return {row.name: row.full_name or row.name for row in rows}


def check_opening(doc, opening):
    opening.check_permission('read')
    line = next((row for row in doc.lines if row.job_opening == opening.name), None)
    if not line or opening.custom_kandil_request != doc.name or opening.custom_kandil_capacity != line.capacity:
        frappe.throw(_('This vacancy does not match the reviewed request and location.'), frappe.PermissionError)
    return line


def check_team_authority(doc, opening, selected=(), current_roles=None):
    check_opening(doc, opening)
    if current_roles is None:
        allowed = 'Kandil Recruiter' in frappe.get_roles() and can_manage_team(doc)
    else:
        # Caller already holds Company/domain/User/grant locks. A cached read
        # hint may predate a waited-for lock; replay needs current authority too.
        settings = frappe.get_doc('Kandil Organization Settings', doc.company, for_update=True)
        user = frappe.session.user
        allowed = user == 'Administrator' or ('Kandil Recruiter' in current_roles and (
            settings.hr_approver == user or (settings.sector_approver == user and 'Kandil Sector Approver' in current_roles)))
    if not allowed:
        frappe.throw(_('Only the configured recruitment authority may change this team.'), frappe.PermissionError)
    refs = set(selected) | {opening.custom_kandil_lead} | {row.user for row in opening.get('custom_kandil_team') or []}
    refs -= {None, ''}
    if refs - identity_labels(refs).keys():
        frappe.throw(_('Some recruiter identities are outside your permissions. The team has not been changed.'), frappe.PermissionError)


def check_command(doc, operation, payload, current_roles):
    """Called inside the existing lock order before receipt replay or new writes.

    Current state/eligibility remains in the domain handler for new commands;
    current resource/reference permission also applies to reading a prior result.
    """
    if operation not in {'vacancy_team', 'bulk_vacancy_team', 'vacancy_state', 'vacancy_pin'}:
        return
    names = [payload['opening']] if operation != 'bulk_vacancy_team' else [
        item['opening_name'] for item in payload['items'] if item['name'] == doc.name]
    for name in sorted(set(names)):
        opening = frappe.get_doc('Job Opening', name, for_update=True)
        if operation in {'vacancy_team', 'bulk_vacancy_team'}:
            check_team_authority(doc, opening, [payload.get('lead'), *(payload.get('members') or [])], current_roles)
        else:
            check_opening(doc, opening)
