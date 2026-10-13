"""Native unredacted revision access, distinct from the portal's safe projections.

A raw JSON record cannot redact one historical reference. Require complete
historical department scope, current reference permissions and the explicit
shared schema. SQL conditions apply before list pagination; direct reads use
that identical condition. No revision bytes or existing grants are rewritten.
"""
import frappe
from frappe.model.db_query import DatabaseQuery

from kandil_hr.foundation.security import scope_query
from kandil_hr.recruitment.privacy import LINE_FIELDS, REQUEST_FIELDS, STEP_FIELDS

DT = 'Kandil Request Revision'
TABLE = '`tabKandil Request Revision`'


def user_permissions(kind, user):
    # Use the pinned native link/User Permission compiler without broadening
    # role rights or using an ignore-permissions list of candidate records.
    query = DatabaseQuery(kind, user=user)
    query.match_conditions = []; query.match_filters = []
    query.add_user_permissions(frappe.permissions.get_user_permissions(user))
    return ' AND '.join('('+c+')' for c in query.match_conditions) or '1=1'


def readable(kind, user):
    if not frappe.has_permission(kind, 'read', user=user): return '1=0'
    return f"({user_permissions(kind,user)}) AND ({scope_query(kind,user) or '1=1'})"


def scalar(source, path):
    # Paths and SQL identifiers here originate in source constants only.
    return f"NULLIF(JSON_UNQUOTE(JSON_EXTRACT({source}, '{path}')), 'null')"


def keys_allowed(source, keys, alias):
    allowed = ','.join(frappe.db.escape(k) for k in keys)
    return f"NOT EXISTS (SELECT 1 FROM JSON_TABLE(COALESCE(JSON_KEYS({source}),'[]'), '$[*]' COLUMNS (k VARCHAR(140) PATH '$')) {alias} WHERE {alias}.k NOT IN ({allowed}))"


def employee_condition(value, user):
    table = '`tabEmployee`'
    scope = scope_query('Employee', user, 'manage') or '1=1'
    roles = frappe.get_roles(user)
    identity = f'({scope})' if {'Kandil Requester','Kandil Recruiter','Kandil Sector Approver'}.intersection(roles) else '1=0'
    profile = '1=0'
    if frappe.has_permission('Employee', 'read', user=user):
        from kandil_hr.foundation.security import hr_query
        profile = hr_query('Employee', user) or '1=1'
    return f"(COALESCE({value},'')='' OR EXISTS (SELECT 1 FROM {table} WHERE {table}.name={value} AND ({user_permissions('Employee',user)}) AND (({identity}) OR ({profile}))))"


def condition(user=None):
    from kandil_hr.recruitment.models import enabled
    user = user or frappe.session.user
    if not enabled() or user=='Guest' or not frappe.db.get_value('User',user,'enabled'): return '1=0'
    if user=='Administrator': return '1=1'  # documented break-glass account
    raw=f'{TABLE}.snapshot_json'
    source=f"IF(JSON_VALID({raw}),{raw},'{{}}')"
    return f"({capture_condition(source, user)}) AND ({correction_condition(source, user)})"


def capture_condition(source, user):
    """Authorize one complete capture, including captures inside corrections."""
    from kandil_hr.pilot.permissions import request_query
    position=scalar(source,'$.requested_position')
    employee=scalar(source,'$.replacement_employee')
    # The metadata was captured with the old revision. Since native raw JSON
    # lacks reliably captured position branches on legacy rows, branch-only
    # grants cannot prove full historical scope. The portal permits scoped,
    # projected modern captures with recorded branches instead.
    from kandil_hr.recruitment.history_schema import condition as shape_condition
    parts=[shape_condition(source), scope_query(DT,user) or '1=1',
        f"{TABLE}.request IN (SELECT name FROM `tabKandil Hiring Request` WHERE ({request_query(user) or '1=1'}) AND ({user_permissions('Kandil Hiring Request',user)}))",
        f"JSON_TYPE({source})='OBJECT'",
        f"{scalar(source,'$.doctype')}='Kandil Hiring Request'",
        f"{scalar(source,'$.name')}={TABLE}.request",
        f"{scalar(source,'$.company')}={TABLE}.company",
        f"{scalar(source,'$.department')}={TABLE}.department",
        keys_allowed(source,(*REQUEST_FIELDS,'lines','approval_steps'),'history_keys'),
        f"EXISTS (SELECT 1 FROM `tabKandil Position` WHERE `tabKandil Position`.name={position} AND ({readable('Kandil Position',user)}))",
        employee_condition(employee,user),
        f"JSON_TYPE(JSON_EXTRACT({source},'$.lines'))='ARRAY'",
        f"JSON_LENGTH(JSON_EXTRACT({source},'$.lines'))>0",
        f"JSON_TYPE(JSON_EXTRACT({source},'$.approval_steps'))='ARRAY'",
    ]
    amendment=scalar(source,'$.amends')
    parts.append(f"(COALESCE({amendment},'')='' OR EXISTS (SELECT 1 FROM `tabKandil Hiring Request` WHERE `tabKandil Hiring Request`.name={amendment} AND `tabKandil Hiring Request`.company={TABLE}.company AND ({request_query(user) or '1=1'}) AND ({user_permissions('Kandil Hiring Request',user)})))")
    # Capacity dimensions are immutable through supported native writes. Access
    # to every current reference is still checked, independently of old scope.
    line='history_lines.row_json';capacity=scalar(line,'$.capacity')
    parts.append(f"""NOT EXISTS (SELECT 1 FROM JSON_TABLE({source}, '$.lines[*]' COLUMNS (row_json JSON PATH '$')) history_lines
        WHERE NOT ({keys_allowed(line,LINE_FIELDS,'history_line_keys')}) OR NOT EXISTS
        (SELECT 1 FROM `tabKandil Capacity` WHERE `tabKandil Capacity`.name={capacity}
          AND `tabKandil Capacity`.company={TABLE}.company AND `tabKandil Capacity`.department={TABLE}.department
          AND ({readable('Kandil Capacity',user)})))""")
    opening=scalar('history_openings.row_json','$.job_opening')
    # A captured opening ID is shared in its authorized request context; this
    # does not grant access to the opening's candidate or other record data.
    parts.append(f"""NOT EXISTS (SELECT 1 FROM JSON_TABLE({source}, '$.lines[*]' COLUMNS (row_json JSON PATH '$')) history_openings
        WHERE COALESCE({opening},'')<>'' AND NOT EXISTS
        (SELECT 1 FROM `tabJob Opening` WHERE `tabJob Opening`.name={opening}
          AND `tabJob Opening`.company={TABLE}.company AND `tabJob Opening`.custom_kandil_request={TABLE}.request
          AND `tabJob Opening`.custom_kandil_capacity={scalar('history_openings.row_json','$.capacity')}
          AND ({user_permissions('Job Opening',user)})))""")
    proof=scalar('history_proofs.row_json','$.board_evidence')
    parts.append(f"""NOT EXISTS (SELECT 1 FROM JSON_TABLE({source}, '$.approval_steps[*]' COLUMNS (row_json JSON PATH '$')) history_proofs
        WHERE COALESCE({proof},'')<>'' AND NOT EXISTS
        (SELECT 1 FROM `tabFile` WHERE `tabFile`.name={proof} AND `tabFile`.is_private=1 AND `tabFile`.is_folder=0
          AND LEFT(`tabFile`.file_url,15)='/private/files/'
          AND `tabFile`.attached_to_doctype='Kandil Hiring Request' AND `tabFile`.attached_to_name={TABLE}.request
          AND ({user_permissions('File',user)})))""")
    step='history_steps.row_json';authority_position=scalar(step,'$.authority_position')
    parts.append(f"""NOT EXISTS (SELECT 1 FROM JSON_TABLE({source}, '$.approval_steps[*]' COLUMNS (row_json JSON PATH '$')) history_steps
        WHERE NOT ({keys_allowed(step,STEP_FIELDS,'history_step_keys')}) OR
        (COALESCE({authority_position},'')<>'' AND NOT EXISTS
          (SELECT 1 FROM `tabKandil Position` WHERE `tabKandil Position`.name={authority_position} AND ({readable('Kandil Position',user)}))))""")
    from kandil_hr.recruitment.history_references import condition as route_references, identities
    parts.extend((identities(source,user), route_references(source,user)))
    return ' AND '.join('('+p+')' for p in parts)


def correction_condition(source, user):
    """An HR correction contains two full captures inside an encoded note.

    Authorize both without rewriting original bytes. Nested correction notes
    are not emitted by the writer and are rejected, avoiding recursive payloads.
    """
    value=scalar(source, '$.decision_note')
    note=f"IF(JSON_VALID({value}),{value},'{{}}')"
    captures=[f"JSON_EXTRACT({note}, '$.{key}')" for key in ('before','after')]
    signatures=[f"JSON_CONTAINS_PATH({item}, 'one', '$.doctype', '$.lines', '$.route_snapshot', '$.requested_position')" for item in captures]
    is_correction=f"({TABLE}.action='HR correction' OR COALESCE(({signatures[0]}),0) OR COALESCE(({signatures[1]}),0))"
    checks=[f"JSON_VALID({value})",f"JSON_TYPE({note})='OBJECT'",
            keys_allowed(note,('reason','before','after'),'correction_keys'),
            f"JSON_TYPE(JSON_EXTRACT({note}, '$.reason'))='STRING'"]
    for item in captures:
        checks.append(capture_condition(item,user))
        checks.append(f"COALESCE({scalar(item,'$.decision_note')},'')=''")
    return f"(NOT {is_correction} OR ("+' AND '.join('('+c+')' for c in checks)+'))'


def allowed(doc, user=None):
    return bool(frappe.db.sql(f'SELECT 1 FROM {TABLE} WHERE name=%s AND ({condition(user)}) LIMIT 1',(doc.name,)))
