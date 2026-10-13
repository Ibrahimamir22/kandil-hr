"""Authorize references inside frozen routes without granting full-record reads.

People, routing config/rules and assignment IDs are shared only in the readable
request's audit context. Their native User Permissions still apply. Positions
and capacities require their existing role and scope read boundary. No current
role, active-assignment date or policy value replaces a recorded historical fact.
"""
import frappe

from kandil_hr.foundation.security import scope_query
from kandil_hr.recruitment.history_access import TABLE, scalar, readable, user_permissions


def optional(value, predicate):
    return f"(COALESCE({value},'')='' OR ({predicate}))"


def user_reference(value, user):
    # Disabled former actors remain valid historical identities. This permits
    # the captured identifier, not a User profile, roles, contact data or edits.
    return optional(value, f"EXISTS (SELECT 1 FROM `tabUser` WHERE `tabUser`.name={value} AND ({user_permissions('User',user)}))")


def position_reference(value, user):
    return optional(value, f"EXISTS (SELECT 1 FROM `tabKandil Position` WHERE `tabKandil Position`.name={value} AND `tabKandil Position`.company={TABLE}.company AND ({readable('Kandil Position',user)}))")


def every_array(source, path, alias, predicate):
    return f"NOT EXISTS (SELECT 1 FROM JSON_TABLE({source}, '{path}[*]' COLUMNS (row_json JSON PATH '$')) {alias} WHERE NOT COALESCE(({predicate}),0))"


def identities(source, user):
    parts=[user_reference(scalar(source,'$.'+key),user) for key in
           ('requested_by','beneficiary_user','owner','modified_by')]
    row='history_identity_steps.row_json'
    parts.append(every_array(source,'$.approval_steps','history_identity_steps',
        ' AND '.join(user_reference(scalar(row,'$.'+key),user) for key in ('principal','actor','board_vice','board_member'))))
    return ' AND '.join('('+p+')' for p in parts)


def condition(source, user):
    from kandil_hr.pilot.permissions import request_query
    value=scalar(source,'$.route_snapshot')
    route=f"IF(JSON_VALID({value}),{value},'{{}}')"
    parts=[]
    resolved=scalar(route,'$.resolved.position')
    parts.append(optional(resolved,f"{resolved}={scalar(source,'$.requested_position')} AND ({position_reference(resolved,user)})"))
    for path in ('$.config','$.policy.config'):
        config=scalar(route,path);table='`tabKandil Recruitment Route`'
        parts.append(optional(config,f"EXISTS (SELECT 1 FROM {table} WHERE {table}.name={config} AND {table}.company={TABLE}.company AND {table}.department={TABLE}.department AND ({user_permissions('Kandil Recruitment Route',user)}))"))
    for path in ('resolved','policy'):
        for key in ('hr_approver','exception_approver','ceo_approver','board_approver','board_vice_approver'):
            parts.append(user_reference(scalar(route,f'$.{path}.{key}'),user))
    parts.append(every_array(route,'$.interest_snapshot.users','history_interest_users',
                            user_reference("NULLIF(JSON_UNQUOTE(history_interest_users.row_json),'null')",user)))
    # These references have different purposes; never infer the original chain
    # from today's active assignments or settings while answering a history read.
    for path,alias in (('$.resolved.steps','history_route_steps'),('$.resolved.skipped','history_route_skips'),('$.skipped','history_interest_skips')):
        row=alias+'.row_json';position=scalar(row,'$.position')
        checks=[position_reference(position,user),user_reference(scalar(row,'$.principal'),user)]
        if path=='$.resolved.steps':
            assignment=scalar(row,'$.assignment');table='`tabKandil Position Assignment`'
            checks.append(optional(assignment,f"EXISTS (SELECT 1 FROM {table} WHERE {table}.name={assignment} AND {table}.company={TABLE}.company AND {table}.position={position} AND {table}.user={scalar(row,'$.principal')} AND ({scope_query('Kandil Position Assignment',user) or '1=1'}) AND ({user_permissions('Kandil Position Assignment',user)}))"))
        parts.append(every_array(route,path,alias,' AND '.join('('+p+')' for p in checks)))
    rule='history_authority_rules.row_json';rule_id=scalar(rule,'$.name');table='`tabKandil Authority Rule`'
    parts.append(every_array(route,'$.policy.authority_rules','history_authority_rules',
        f"({user_reference(scalar(rule,'$.principal'),user)}) AND EXISTS (SELECT 1 FROM {table} WHERE {table}.name={rule_id} AND {table}.company={TABLE}.company AND (COALESCE({table}.department,'')='' OR {table}.department={TABLE}.department) AND (COALESCE({table}.position,'')='' OR {table}.position={scalar(source,'$.requested_position')}) AND ({user_permissions('Kandil Authority Rule',user)}))"))
    # Own pending lines are matched to this capture, not mutable current children.
    pending='history_pending_lines.row_json'
    parts.append(every_array(route,'$.pending_quantity_revision.lines','history_pending_lines',
        f"EXISTS (SELECT 1 FROM JSON_TABLE({source}, '$.lines[*]' COLUMNS (row_json JSON PATH '$')) history_pending_own WHERE {scalar('history_pending_own.row_json','$.name')}={scalar(pending,'$.line')} AND {scalar('history_pending_own.row_json','$.capacity')}={scalar(pending,'$.capacity')})"))
    # Basis keys disclose capacity IDs, and cohort keys disclose OTHER request
    # line IDs. Authorize the other request as well as its exact line/capacity.
    basis=f"JSON_EXTRACT({route}, '$.headcount_basis')"
    captured=f"JSON_EXTRACT({basis}, CONCAT('$.',JSON_QUOTE(history_basis.k)))"
    cohort=f"JSON_EXTRACT({captured}, '$.cohort')"
    parts.append(f"""NOT EXISTS (SELECT 1 FROM JSON_TABLE(COALESCE(JSON_KEYS({basis}),'[]'), '$[*]' COLUMNS (k VARCHAR(512) PATH '$')) history_basis
      WHERE NOT EXISTS (SELECT 1 FROM JSON_TABLE({source}, '$.lines[*]' COLUMNS (row_json JSON PATH '$')) history_basis_own
        WHERE {scalar('history_basis_own.row_json','$.capacity')}=history_basis.k)
      OR NOT EXISTS (SELECT 1 FROM `tabKandil Capacity` WHERE `tabKandil Capacity`.name=history_basis.k AND ({readable('Kandil Capacity',user)}))
      OR EXISTS (SELECT 1 FROM JSON_TABLE(COALESCE(JSON_KEYS({cohort}),'[]'), '$[*]' COLUMNS (k VARCHAR(512) PATH '$')) history_cohort
        WHERE NOT EXISTS (SELECT 1 FROM `tabKandil Request Line` INNER JOIN `tabKandil Hiring Request`
          ON `tabKandil Hiring Request`.name=`tabKandil Request Line`.parent
          WHERE `tabKandil Request Line`.name=history_cohort.k AND `tabKandil Request Line`.parenttype='Kandil Hiring Request'
            AND `tabKandil Request Line`.parentfield='lines' AND `tabKandil Request Line`.capacity=history_basis.k
            AND `tabKandil Hiring Request`.company={TABLE}.company
            AND ({request_query(user) or '1=1'}) AND ({user_permissions('Kandil Hiring Request',user)}))))""")
    return ' AND '.join('('+p+')' for p in parts)
