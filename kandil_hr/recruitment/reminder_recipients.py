"""Current approval-reminder audience; no new approval authority is granted.

Caller holds Company/request before discovery and locks all returned accounts in
sorted order before eligibility checks. Delivery checks only its frozen recipient.
SLA defaults remain subject to HR acceptance; ordinary historical updates are separate.
"""
import frappe
from frappe import _
from kandil_hr.foundation.delegation import find_delegation
from kandil_hr.foundation.clock import today_cairo
from kandil_hr.foundation.mutation_access import assert_current_request_scope
from kandil_hr.recruitment.authority import interested_users


def candidates(doc, step, stage):
    result = {}
    def add(user, basis):
        if user:
            result.setdefault(user, set()).add(basis)
    if stage in ('reminder', 'warning', 'expiry'):
        add(step.principal, 'principal')
        if step.authority == 'Board Approval':
            add(step.get('board_vice'), 'board_vice')
        else:
            # Company mutex serializes supported delegation writers. Recheck
            # dates, process, approval and authority after sorted User locks.
            for row in frappe.db.sql('''SELECT name,to_user FROM `tabKandil Delegation`
                WHERE company=%s AND department=%s AND from_user=%s AND revoked=0
                AND approval_status='Active' AND from_date<=%s AND to_date>=%s
                AND COALESCE(NULLIF(process_scope,''),'APPROVALS') IN ('APPROVALS','ALL')
                ORDER BY to_user,name FOR UPDATE''', (doc.company, doc.department, step.principal, today_cairo(), today_cairo()), as_dict=True):
                add(row.to_user, 'delegation:' + row.name)
    if stage in ('escalation', 'expiry'):
        settings = frappe.get_doc('Kandil Organization Settings', doc.company, for_update=True)
        if not settings.hr_approver or not settings.sector_approver:
            frappe.throw(_('Configure company HR and sector contacts before processing approval escalation.'))
        add(settings.hr_approver, 'hr_contact')
        add(settings.sector_approver, 'sector_contact')
    if stage in ('warning', 'expiry'):
        add(doc.requested_by, 'requester')
    return result


def eligible(doc, step, user, bases):
    """Return exact current eligibility bases, never just broad request read access."""
    from kandil_hr.recruitment.api import ROLES
    from kandil_hr.foundation.outbox_access import current_role_read
    accepted = []
    interests = interested_users(doc)
    for basis in sorted(bases):
        try:
            required_role = None
            if basis == 'requester':
                if user != doc.requested_by:
                    continue
                roles = assert_current_request_scope(doc, user=user, capability='read')
            elif basis in ('hr_contact', 'sector_contact'):
                role = 'Kandil Recruiter' if basis == 'hr_contact' else 'Kandil Sector Approver'
                required_role = role
                roles = assert_current_request_scope(doc, user=user, required_roles=(role,))
            else:
                if user in interests:
                    continue
                role = ROLES.get(step.authority)
                if not role:
                    raise ValueError('Unknown approval authority for reminder')
                if basis == 'principal':
                    if user != step.principal:
                        continue
                    required_role = role
                    roles = assert_current_request_scope(doc, user=user, required_roles=(role,))
                elif basis == 'board_vice':
                    if step.authority != 'Board Approval' or user != step.get('board_vice'):
                        continue
                    required_role = 'Kandil Board Approver'
                    roles = assert_current_request_scope(doc, user=user, required_roles=(required_role,))
                elif basis.startswith('delegation:'):
                    if step.authority == 'Board Approval' or step.principal in interests:
                        continue
                    principal_roles = assert_current_request_scope(doc, user=step.principal, required_roles=(role,))
                    if role not in principal_roles:
                        continue
                    required_role = 'Kandil Approver'
                    roles = assert_current_request_scope(doc, user=user, required_roles=('Kandil Approver',))
                    if find_delegation(doc, step.principal, user, process='APPROVALS', current=True) != basis.removeprefix('delegation:'):
                        continue
                else:
                    raise ValueError('Unknown reminder recipient basis')
            if (not required_role or required_role in roles) and current_role_read(doc, user, roles) and frappe.has_permission(doc.doctype, 'read', doc=doc, user=user, ignore_share_permissions=True):
                accepted.append(basis)
        except frappe.PermissionError:
            continue
    return accepted



def milestone_already_delivered(notice, context):
    """One delivered effect per waiting-step/milestone/user across authority versions.

    Caller holds Company/request and recipient locks. Current row reads observe
    a competing delivery after waiting for that mutex, not an earlier RR snapshot.
    Suppressed versions are excluded so a new valid grant can still receive work.
    """
    import json
    from frappe.utils import get_datetime
    from kandil_hr.recruitment.sla import validate_context
    def identity(value):
        validate_context(value)
        return (value['revision'], value['step_key'], value['principal'],
            str(get_datetime(value['waiting_since'])), value['stage'])
    expected = identity(context)
    rows = frappe.db.sql("""SELECT delivery_context FROM `tabKandil Notification Outbox`
        WHERE reference_doctype='Kandil Hiring Request' AND reference_name=%s AND recipient=%s
        AND status='Delivered locally' AND COALESCE(delivery_context,'')!=''
        ORDER BY name FOR UPDATE""", (notice.reference_name, notice.recipient), as_dict=True)
    return any(identity(json.loads(row.delivery_context)) == expected for row in rows)


def delivery_reason(doc, notice, plan):
    import json
    context = json.loads(notice.delivery_context)
    if context['kind'] != 'approval_sla_v3':
        return 'Legacy approval reminder recipient authority must be regenerated'
    step = next((s for s in doc.approval_steps if s.decision == 'Pending'), None)
    if not step:
        return 'Approval reminder step is no longer active'
    current = set(plan.get(notice.recipient, ())) & set(context['recipient_basis'])
    if not current or not eligible(doc, step, notice.recipient, current):
        return 'Approval reminder recipient authority expired or changed'
    if milestone_already_delivered(notice, context):
        return 'Approval milestone already delivered for this recipient'
    return ''
