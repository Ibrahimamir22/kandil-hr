"""Permission-checked lifecycle and pin review. Commands remain in recruitment."""
import frappe
from frappe import _
from frappe.utils import cint
from kandil_hr.foundation.clock import today_cairo
from kandil_hr.foundation.security import request_scope
from kandil_hr.foundation.teams import effective_lead
from kandil_hr.portal.api import authenticated, read_request
from kandil_hr.recruitment.guards import has_unresolved_candidates
from kandil_hr.recruitment.priority import score
from kandil_hr.recruitment.vacancies import ACTIVE, lifecycle_targets
from kandil_hr.recruitment.vacancy_access import check_opening


@frappe.whitelist(methods=['GET'])
def context(name, opening_name):
    authenticated()
    doc = read_request(name)
    opening = frappe.get_doc('Job Opening', opening_name)
    line = check_opening(doc, opening)
    if 'Kandil Recruiter' not in frappe.get_roles() or not request_scope(doc, capability='manage'):
        frappe.throw(_('Only authorized HR recruiters may manage vacancies.'), frappe.PermissionError)
    can_manage = doc.status == 'Approved' and opening.custom_kandil_vacancy_state in ACTIVE
    targets = lifecycle_targets(opening) if can_manage else {}
    lead_ready = bool(effective_lead(opening))
    blocked = has_unresolved_candidates(opening.name) if can_manage else False
    remaining = cint(line.approved_qty)-cint(line.joined_qty)-cint(line.closed_qty)
    actions = []
    for action,target in targets.items():
        closing = action in ('Close','Cancel')
        allowed = not ((action == 'Open' and not lead_ready) or (closing and (blocked or remaining < 0)))
        actions.append(dict(action=action,target=target,allowed=allowed,
            blocked_by='lead_required' if action=='Open' and not lead_ready else
                'unresolved_candidates' if closing and blocked else 'quantities' if closing and remaining<0 else None,
            releases=max(0,remaining) if closing else 0,
            closes_parent=closing and all(l.name==line.name or cint(l.joined_qty)+cint(l.closed_qty)>=cint(l.approved_qty) for l in doc.lines)))
    day=str(today_cairo())
    return dict(name=doc.name,opening_name=opening.name,expected_version=str(doc.modified),title=doc.title,
        company=doc.company,department=doc.department,branch=frappe.db.get_value('Kandil Capacity',line.capacity,'branch'),
        state=opening.custom_kandil_vacancy_state,parent_status=doc.status,approved=cint(line.approved_qty),
        joined=cint(line.joined_qty),closed=cint(line.closed_qty),remaining=max(0,remaining),
        lead_ready=lead_ready,unresolved_candidates=blocked,actions=actions,can_pin=can_manage,
        pin_until=str(opening.custom_kandil_pin_until) if opening.custom_kandil_pin_until else None,
        pin_reason=opening.custom_kandil_pin_reason or '',as_of=day,
        priority=score(doc.hr_priority or doc.requested_priority,opening.custom_kandil_started_on or opening.creation,
            doc.required_by,opening.custom_kandil_pin_until,day,opening.custom_kandil_vacancy_state in ('Approved','Open','Partially Filled')))
