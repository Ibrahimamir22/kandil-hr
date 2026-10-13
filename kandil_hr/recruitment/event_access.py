"""Native Event access checks the parent and captured references before paging."""
import frappe

from kandil_hr.recruitment.history_access import scalar, user_permissions, readable
from kandil_hr.recruitment.history_schema import condition as shape_condition, fields

DT = "Kandil Recruitment Event"
TABLE = "`tabKandil Recruitment Event`"
SHAPE = {**fields('status'), 'lines': ('array', fields('capacity','requested','approved','joined','opening'))}


def condition(user=None):
    from kandil_hr.recruitment.models import enabled
    from kandil_hr.pilot.permissions import request_query
    user=user or frappe.session.user
    if not enabled() or user=='Guest' or not frappe.db.get_value('User',user,'enabled'):
        return '1=0'
    if user=='Administrator':
        return '1=1'
    raw=f'{TABLE}.snapshot'
    source=f"IF(JSON_VALID({raw}),{raw},'{{}}')"
    parent='`tabKandil Hiring Request`'
    line='event_lines.row_json'
    capacity=scalar(line,'$.capacity');opening=scalar(line,'$.opening')
    checks=[shape_condition(source,SHAPE,False),
        f"JSON_TYPE(JSON_EXTRACT({source},'$.lines'))='ARRAY'",
        f"JSON_LENGTH(JSON_EXTRACT({source},'$.lines'))>0",
        f"{TABLE}.request IN (SELECT name FROM {parent} WHERE ({request_query(user) or '1=1'}) AND ({user_permissions('Kandil Hiring Request',user)}))",
        f"""NOT EXISTS (SELECT 1 FROM JSON_TABLE({source}, '$.lines[*]' COLUMNS (row_json JSON PATH '$')) event_lines
          WHERE NOT EXISTS (SELECT 1 FROM `tabKandil Capacity` INNER JOIN {parent} ON {parent}.name={TABLE}.request
            WHERE `tabKandil Capacity`.name={capacity} AND `tabKandil Capacity`.company={parent}.company
              AND `tabKandil Capacity`.department={parent}.department AND ({readable('Kandil Capacity',user)}))
          OR (COALESCE({opening},'')<>'' AND NOT EXISTS (SELECT 1 FROM `tabJob Opening`
            WHERE `tabJob Opening`.name={opening} AND `tabJob Opening`.custom_kandil_request={TABLE}.request
              AND `tabJob Opening`.custom_kandil_capacity={capacity} AND ({user_permissions('Job Opening',user)}))))"""]
    return ' AND '.join('('+c+')' for c in checks)


def allowed(doc, user=None):
    return bool(frappe.db.sql(f'SELECT 1 FROM {TABLE} WHERE name=%s AND ({condition(user)}) LIMIT 1',(doc.name,)))
