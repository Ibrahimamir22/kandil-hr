"""Explicit nested raw-history shape, compiled into pre-pagination SQL.

This validates shape, not authorization of every nested identity. Values remain
in their original immutable row; a raw response cannot silently redact fields.
"""
from itertools import count

from kandil_hr.recruitment.privacy import REQUEST_FIELDS, LINE_FIELDS, STEP_FIELDS

SCALAR = None

def fields(*names):
    return {name: SCALAR for name in names}

ROUTE = {
    **fields('config'),
    'resolved': {**fields('position','as_of','structure_revision','exception_approver','ceo_approver','board_approver'),
        'steps': ('array', fields('position','principal','authority','assignment')),
        'skipped': ('array', fields('position','reason','authority'))},
    'skipped': ('array', fields('principal','authority','position','reason')),
    'policy': {**fields('headcount_mode','ceo_for_critical','board_after_ceo','hr_approver','exception_approver',
        'ceo_approver','board_approver','board_vice_approver','config','config_modified','evaluated_on'),
        'authority_rules': ('array', fields('name','modified','from_date','to_date','authority','principal','reason'))},
    'interest_snapshot': {**fields('evaluated_on'), 'users': ('array',SCALAR)},
    'headcount_basis': ('map', {**fields('occupied','structural','other_commitments','additional','unmatched_commitments'),
        'cohort': ('map',fields('committed','joined','closed'))}),
    'pending_quantity_revision': {**fields('reason'), 'lines': ('array', fields('line','capacity','requested',
        'own_reserved','available','effective_available','delta','excess','occupied','structural',
        'open_slots','reserved','occupancy_basis','occupancy_as_of'))},
}
SNAPSHOT = {**fields(*REQUEST_FIELDS), 'lines': ('array',fields(*LINE_FIELDS)),
            'approval_steps': ('array',fields(*STEP_FIELDS))}


def condition(source):
    from kandil_hr.recruitment.history_access import keys_allowed, scalar
    aliases=count()

    def compile_shape(value, shape, nullable=True):
        alias='history_shape_'+str(next(aliases))
        if shape is SCALAR:
            # Shared fields may contain strings/numbers/booleans/null, never an
            # arbitrary nested object hidden under an otherwise allowed key.
            return f"COALESCE(JSON_TYPE({value}),'NULL') NOT IN ('OBJECT','ARRAY')"
        if isinstance(shape,dict):
            parts=[f"JSON_TYPE({value})='OBJECT'",keys_allowed(value,shape,alias)]
            for key, child in shape.items():
                parts.append(compile_shape(f"JSON_EXTRACT({value}, '$.{key}')",child))
            valid=' AND '.join('('+p+')' for p in parts)
        else:
            kind,child=shape
            if kind=='array':
                inner=compile_shape(alias+'.row_json',child,False)
                valid=f"JSON_TYPE({value})='ARRAY' AND NOT EXISTS (SELECT 1 FROM JSON_TABLE({value}, '$[*]' COLUMNS (row_json JSON PATH '$')) {alias} WHERE NOT COALESCE(({inner}),0))"
            else:
                # JSON_QUOTE escapes the stored key as data. No stored key is
                # interpolated into executable SQL or treated as a JSON path.
                item=f"JSON_EXTRACT({value}, CONCAT('$.',JSON_QUOTE({alias}.k)))"
                inner=compile_shape(item,child,False)
                valid=f"JSON_TYPE({value})='OBJECT' AND NOT EXISTS (SELECT 1 FROM JSON_TABLE(COALESCE(JSON_KEYS({value}),'[]'), '$[*]' COLUMNS (k VARCHAR(512) PATH '$')) {alias} WHERE LENGTH({alias}.k)>140 OR NOT COALESCE(({inner}),0))"
        if nullable:
            return f"(COALESCE(JSON_TYPE({value}),'NULL')='NULL' OR ({valid}))"
        return '('+valid+')'

    route_value=scalar(source,'$.route_snapshot')
    route=f"IF(JSON_VALID({route_value}),{route_value},'{{}}')"
    return f"({compile_shape(source,SNAPSHOT,False)}) AND (COALESCE({route_value},'')='' OR (JSON_TYPE(JSON_EXTRACT({source},'$.route_snapshot'))='STRING' AND JSON_VALID({route_value}) AND {compile_shape(route,ROUTE,False)}))"
