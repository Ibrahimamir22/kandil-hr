"""Authorize declared structured shared notes without rewriting frozen bytes.

Full correction captures are checked by history_access. Vacancy/team notes have
an explicit, separate schema; unknown JSON is withheld from raw revision reads.
The projected history still exposes only note_projection.shared_note's reason.
"""
import frappe

from kandil_hr.recruitment.history_access import TABLE, scalar, user_permissions
from kandil_hr.recruitment.history_references import optional, user_reference, every_array
from kandil_hr.recruitment.history_schema import fields, condition as shape_condition

VACANCY_FIELDS = ('name', 'custom_kandil_vacancy_state', 'custom_kandil_lead',
    'custom_kandil_pin_until', 'custom_kandil_pin_reason', 'custom_kandil_priority_score',
    'status', 'custom_kandil_started_on', 'custom_kandil_before_pause',
    'custom_kandil_before_freeze', 'requested_priority', 'hr_priority')
TEAM_FIELDS = ('user', 'name', 'doctype', 'parent', 'parenttype', 'parentfield',
               'idx', 'creation', 'modified', 'owner', 'modified_by', 'docstatus')
VACANCY = {**fields(*VACANCY_FIELDS), 'custom_kandil_team': ('array', fields(*TEAM_FIELDS))}
INVOCATION = {**fields('command', 'origin', 'actor', 'principal', 'executor', 'invocation_id', 'at'),
              'payload': fields('user', 'actor', 'reason')}
NOTE = {**fields('reason', 'initiated_by'), 'before': VACANCY, 'after': VACANCY, 'invocation': INVOCATION}
JOIN_COUNTS = ('request_status','vacancy_state','joined','occupied','open_slots','reserved','structural')
JOIN_NOTE = {'reason': None, 'before': fields(*JOIN_COUNTS,'employee','assignment','onboarding','offer'),
             'after': fields(*JOIN_COUNTS,'assignment_voided','employee_status','onboarding_voided')}
UNKNOWN_ACTOR = 'Internal scheduler (original actor unavailable)'


def actor_reference(value, user):
    # A literal system provenance label is not an invented human identity.
    return f"({value}={frappe.db.escape(UNKNOWN_ACTOR)} OR ({user_reference(value,user)}))"


def vacancy_condition(value, source, user, alias):
    opening=scalar(value,'$.name')
    row=alias+'.row_json'
    parts=[f"JSON_TYPE({value})='OBJECT'",
        f"EXISTS (SELECT 1 FROM `tabJob Opening` WHERE `tabJob Opening`.name={opening} AND `tabJob Opening`.company={TABLE}.company AND `tabJob Opening`.custom_kandil_request={TABLE}.request AND ({user_permissions('Job Opening',user)}))",
        f"EXISTS (SELECT 1 FROM JSON_TABLE({source}, '$.lines[*]' COLUMNS (row_json JSON PATH '$')) note_opening_lines WHERE {scalar('note_opening_lines.row_json','$.job_opening')}={opening})",
        user_reference(scalar(value,'$.custom_kandil_lead'),user)]
    team=[user_reference(scalar(row,'$.'+key),user) for key in ('user','owner','modified_by')]
    for key,expected in [('doctype',"'Kandil Recruiter Member'"),('parenttype',"'Job Opening'"),('parentfield',"'custom_kandil_team'"),('parent',opening)]:
        actual=scalar(row,'$.'+key);team.append(optional(actual,f'{actual}={expected}'))
    parts.append(every_array(value,'$.custom_kandil_team',alias,' AND '.join('('+p+')' for p in team)))
    return ' AND '.join('('+p+')' for p in parts)


def joining_condition(source, note, user):
    """Retained joining-reversal provenance is private unless every link is readable."""
    from kandil_hr.foundation.security import hr_query, scope_query
    refs={key:scalar(note,'$.before.'+key) for key in ('employee','assignment','onboarding','offer')}
    parts=[f"{TABLE}.action='Joining voided'",shape_condition(note,JOIN_NOTE,False),
           f"JSON_TYPE(JSON_EXTRACT({note},'$.before'))='OBJECT'",
           f"JSON_TYPE(JSON_EXTRACT({note},'$.after'))='OBJECT'",
           f"JSON_TYPE(JSON_EXTRACT({note},'$.reason'))='STRING'"]
    dimensions={
        'Employee': ('employee',f"`tabEmployee`.company={TABLE}.company AND `tabEmployee`.custom_kandil_offer={refs['offer']}"),
        'Kandil Position Assignment': ('assignment',f"`tabKandil Position Assignment`.company={TABLE}.company AND `tabKandil Position Assignment`.employee={refs['employee']} AND `tabKandil Position Assignment`.position={scalar(source,'$.requested_position')}"),
        'Employee Onboarding': ('onboarding',f"`tabEmployee Onboarding`.employee={refs['employee']} AND `tabEmployee Onboarding`.job_offer={refs['offer']}"),
        'Job Offer': ('offer',f"`tabJob Offer`.custom_kandil_assignment={refs['assignment']} AND `tabJob Offer`.job_applicant IN (SELECT name FROM `tabJob Applicant` WHERE job_title IN (SELECT name FROM `tabJob Opening` WHERE custom_kandil_request={TABLE}.request))"),
    }
    for kind,(key,match) in dimensions.items():
        if not frappe.has_permission(kind,'read',user=user):
            parts.append('1=0');continue
        scope=scope_query(kind,user) if kind=='Kandil Position Assignment' else hr_query(kind,user)
        parts.append(f"EXISTS (SELECT 1 FROM `tab{kind}` WHERE `tab{kind}`.name={refs[key]} AND ({match}) AND ({scope or '1=1'}) AND ({user_permissions(kind,user)}))")
    return ' AND '.join('('+p+')' for p in parts)


def condition(source, user, is_correction):
    value=scalar(source,'$.decision_note')
    note=f"IF(JSON_VALID({value}),{value},'{{}}')"
    # Plain comments keep their original bytes. JSON-looking malformed notes,
    # arrays and unrecognized objects cannot smuggle structured payloads through.
    structured=f"(LEFT(LTRIM(COALESCE({value},'')),1) IN ('{{','[') OR (JSON_VALID({value}) AND JSON_TYPE({note}) IN ('OBJECT','ARRAY')))"
    parts=[shape_condition(note,NOTE,False), f"JSON_TYPE(JSON_EXTRACT({note},'$.reason'))='STRING'",
        actor_reference(scalar(note,'$.initiated_by'),user)]
    for key in ('before','after'):
        parts.append(vacancy_condition(f"JSON_EXTRACT({note}, '$.{key}')",source,user,'note_team_'+key))
    parts.append(f"{scalar(note,'$.before.name')}={scalar(note,'$.after.name')}")
    invocation=f"JSON_EXTRACT({note},'$.invocation')"
    checks=[f"{scalar(invocation,'$.command')}='kandil_hr.recruitment.ownership.handoff_disabled_user'",
            f"{scalar(invocation,'$.origin')}='system_invocation'",
            f"{scalar(invocation,'$.executor')}='Administrator'"]
    for key in ('actor','principal','payload.actor'):
        checks.append(actor_reference(scalar(invocation,'$.'+key),user))
    checks.append(user_reference(scalar(invocation,'$.payload.user'),user))
    parts.append(f"(COALESCE(JSON_TYPE({invocation}),'NULL')='NULL' OR ("+' AND '.join('('+p+')' for p in checks)+'))')
    vacancy = ' AND '.join('('+p+')' for p in parts)
    return f"(COALESCE(({is_correction}),0) OR COALESCE({value},'')='' OR NOT ({structured}) OR (JSON_VALID({value}) AND (({vacancy}) OR ({joining_condition(source,note,user)}))))"
