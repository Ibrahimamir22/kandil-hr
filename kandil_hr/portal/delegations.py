"""Bounded personal-session delegation projections and atomic portal commands.

The native model owns authority validation. Receipts hold only record identifiers;
private audit envelopes and internal decision/revision keys never reach clients.
"""
import hashlib
import json
import re

import frappe
from frappe import _
from frappe.utils import get_datetime

from kandil_hr.foundation import delegation as domain, delegation_audit
from kandil_hr.foundation.clock import today_cairo
from kandil_hr.foundation.mutation_access import assert_current_scope
from kandil_hr.foundation.security import has_scope
from kandil_hr.pilot.api import transactional_retry, transition
from kandil_hr.portal.api import authenticated
from kandil_hr.portal.organization import bounded_text, day, page, paging

DT = 'Kandil Delegation'
FIELDS = ('name', 'company', 'department', 'from_user', 'to_user', 'from_date', 'to_date',
          'reason', 'process_scope', 'supersedes', 'delegation_version', 'approval_status',
          'approved_by', 'approved_on', 'decision_reason', 'revoked', 'revocation_reason', 'modified')
CREATE_FIELDS = {'company', 'department', 'from_user', 'to_user', 'from_date', 'to_date', 'reason', 'process_scope'}
ADMIN_ROLE = ('Kandil Sector Approver',)


def deny():
    frappe.throw(_('This delegation is unavailable for your current role or scope.'), frappe.PermissionError)


def identifier(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 140:
        frappe.throw(_('Choose a valid delegation reference.'))
    return value


def read(name, locked=False):
    name = identifier(name)
    if locked:
        doc = domain.lock_context(name)
    else:
        if not frappe.db.exists(DT, name): deny()
        doc = frappe.get_doc(DT, name)
    doc.check_permission('read')
    if not has_scope(frappe.session.user, doc.company, doc.department): deny()
    return doc


def capabilities(doc):
    user = frappe.session.user
    roles = frappe.get_roles(user)
    manage = has_scope(user, doc.company, doc.department, capability='manage')
    administer = manage and 'Kandil Sector Approver' in roles and doc.has_permission('write')
    ceo = frappe.db.get_value('Kandil Organization Settings', doc.company, 'ceo_approver')
    return dict(revise=bool(administer and not doc.revoked and user != doc.to_user),
                revoke=bool(administer and not doc.revoked),
                decide=bool(manage and not doc.revoked and doc.approval_status == 'Pending CEO'
                    and user == ceo == doc.from_user and user != doc.to_user and 'Kandil CEO Approver' in roles))


def project(doc):
    value = {key: doc.get(key) for key in FIELDS}
    value['modified'] = str(doc.modified)
    # This is an as-of hint, not authority for a later command. The request
    # command still checks its own scope, personal interests and current locks.
    context = frappe._dict(company=doc.company, department=doc.department, requested_by=None)
    scoped = all(has_scope(u, doc.company, doc.department, capability='manage') for u in (doc.from_user, doc.to_user))
    value['effective_processes'] = [p for p in ('APPROVALS', 'TEAM') if scoped
        and domain.find_delegation(context, doc.from_user, doc.to_user, process=p) == doc.name]
    value['as_of'] = str(today_cairo())
    value['actions'] = capabilities(doc)
    return value


@frappe.whitelist(methods=['GET'])
def listing(company=None, department=None, status='', search='', start=0, page_length=25):
    authenticated()
    start, limit = paging(start, page_length)
    filters = {}
    for key, value in (('company', company), ('department', department)):
        if value: filters[key] = bounded_text(value)
    if status:
        if not isinstance(status, str) or status not in ('Active', 'Pending CEO', 'Rejected', 'Revoked'):
            frappe.throw(_('Choose a valid delegation approval status.'))
        filters['approval_status'] = status
    term = bounded_text(search)
    rows = frappe.get_list(DT, filters=filters,
        or_filters=[[k, 'like', '%' + term + '%'] for k in ('name', 'from_user', 'to_user')] if term else None,
        fields=list(FIELDS), order_by='creation desc, name desc', start=start, page_length=limit + 1)
    return page(rows, start, limit, as_of=str(today_cairo()),
                can_create=bool(frappe.has_permission(DT, 'create') and 'Kandil Sector Approver' in frappe.get_roles()))


@frappe.whitelist(methods=['GET'])
def detail(name):
    authenticated()
    return project(read(name))


@frappe.whitelist(methods=['GET'])
def people(company, department, kind, search='', start=0, page_length=20):
    """Limited authority directory; no permission to read User profiles implied."""
    authenticated(); identifier(company); identifier(department)
    if kind not in ('principal', 'delegate'): frappe.throw(_('Choose a delegation participant type.'))
    if ('Kandil Sector Approver' not in frappe.get_roles()
            or not frappe.has_permission(DT, 'create')
            or not has_scope(frappe.session.user, company, department, capability='manage')): deny()
    if frappe.db.get_value('Department', department, 'company') != company: deny()
    start, limit = paging(start, page_length); term = bounded_text(search)
    role = ("EXISTS (SELECT 1 FROM `tabHas Role` r WHERE r.parent=u.name AND r.parenttype='User' AND r.role='Kandil Approver')"
            if kind == 'delegate' else
            "NOT EXISTS (SELECT 1 FROM `tabHas Role` r WHERE r.parent=u.name AND r.parenttype='User' AND r.role='Kandil Board Approver')")
    rows = frappe.db.sql("""SELECT u.name AS id, COALESCE(NULLIF(u.full_name,''),u.name) AS label
        FROM `tabUser` u WHERE u.enabled=1 AND u.name NOT IN ('Guest','Administrator')
        AND (%(kind)s!='delegate' OR u.name!=%(actor)s)
        AND (u.name LIKE %(term)s OR u.full_name LIKE %(term)s)
        AND EXISTS (SELECT 1 FROM `tabKandil Access Grant` g WHERE g.user=u.name AND g.company=%(company)s
            AND g.revoked=0 AND g.can_manage_recruitment=1
            AND (IFNULL(g.department,'')='' OR g.department=%(department)s) AND IFNULL(g.branch,'')=''
            AND g.valid_from<=%(day)s AND (g.valid_until IS NULL OR g.valid_until>=%(day)s)) AND """ + role +
        ' ORDER BY u.full_name,u.name LIMIT %(limit)s OFFSET %(start)s',
        dict(kind=kind,actor=frappe.session.user,company=company,department=department,day=str(today_cairo()),
             term='%'+term+'%',limit=limit+1,start=start), as_dict=True)
    return page(rows,start,limit)


def values(payload, allowed, required):
    if isinstance(payload, str):
        if len(payload) > 12000: frappe.throw(_('Delegation input is too large.'))
        try: payload = json.loads(payload)
        except (ValueError, TypeError): frappe.throw(_('Enter valid delegation fields.'))
    if not isinstance(payload, dict) or set(payload) - allowed or not required <= set(payload):
        frappe.throw(_('Only the selected delegation action fields are accepted.'))
    result = dict(payload)
    for key, value in result.items():
        if not isinstance(value, str) or len(value) > (2000 if key == 'reason' else 140):
            frappe.throw(_('Delegation fields must contain bounded text values.'))
    if 'reason' in result and len(result['reason'].strip()) < 3:
        frappe.throw(_('Enter a reason between 3 and 2000 characters.'))
    for key in ('from_date', 'to_date'):
        if key in result:
            if not result[key]: frappe.throw(_('Both delegation dates are required.'))
            result[key] = day(result[key])
    if 'process_scope' in result and result['process_scope'] not in domain.PROCESSES:
        frappe.throw(_('Select an explicit delegation process.'))
    for key in ('company', 'department', 'from_user', 'to_user'):
        if key in result: identifier(result[key])
    return result


def metadata(command_id, expected_version=None):
    if not isinstance(command_id, str) or not re.fullmatch(r'[a-zA-Z0-9-]{16,100}', command_id):
        frappe.throw(_('A valid command identifier is required.'))
    if expected_version is not None:
        if not isinstance(expected_version, str) or not 1 <= len(expected_version) <= 40:
            frappe.throw(_('A valid reviewed record version is required.'))
        try: get_datetime(expected_version)
        except (TypeError, ValueError, OverflowError):
            frappe.throw(_('A valid reviewed record version is required.'))


def receipt(company, operation, command_id, payload):
    # Identity is scoped to actor/company/operation. The company mutex prevents
    # two create requests from both observing absence before inserting.
    key = domain.digest('portal-delegation', frappe.session.user, company, operation, command_id)
    fingerprint = hashlib.sha256(frappe.as_json(payload).encode()).hexdigest()
    rows = frappe.db.sql('SELECT payload_hash,result_json FROM `tabKandil Command Receipt` WHERE name=%s FOR UPDATE',
                         (key,), as_dict=True)
    if not rows: return key, fingerprint, None
    if rows[0].payload_hash != fingerprint: frappe.throw(_('Command ID was already used with different data.'))
    result = json.loads(rows[0].result_json)
    target = frappe.get_doc(DT, result['name'], for_update=True)
    if target.company != company: deny()
    target.check_permission('read')
    assert_current_scope(company, target.department, required_roles=ADMIN_ROLE)
    target.check_permission('write')
    return key, fingerprint, result


def store_receipt(key, fingerprint, result):
    with transition():
        frappe.get_doc(dict(doctype='Kandil Command Receipt', dedupe_key=key, actor=frappe.session.user,
            payload_hash=fingerprint, result_json=frappe.as_json(result))).insert(ignore_permissions=True)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def create(payload, command_id):
    authenticated(); metadata(command_id)
    data = values(payload, CREATE_FIELDS, CREATE_FIELDS)
    frappe.db.sql('SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE', (data['company'],))
    for user in sorted({data['from_user'], data['to_user'], frappe.session.user}):
        frappe.db.sql('SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE', (user,))
    assert_current_scope(data['company'], data['department'], required_roles=ADMIN_ROLE)
    if not frappe.has_permission(DT, 'create'): deny()
    key, fingerprint, prior = receipt(data['company'], 'create', command_id, data)
    if prior: return prior
    with delegation_audit.endpoint():
        doc = frappe.get_doc(dict(doctype=DT, **data)).insert()
        before = dict(doctype=DT, name=doc.name, record_exists=False)
        delegation_audit.record('create', doc, before, dict(payload=data, command_id=command_id), command_id, 'absent', key)
    result = dict(name=doc.name, operation='create')
    store_receipt(key, fingerprint, result)
    return result


@frappe.whitelist(methods=['POST'])
@transactional_retry
def execute(name, operation, payload, expected_version, command_id):
    authenticated(); identifier(name); metadata(command_id, expected_version)
    if expected_version is None: frappe.throw(_('A valid reviewed record version is required.'))
    fields = {'revise': {'process_scope', 'from_date', 'to_date', 'reason'},
              'revoke': {'reason'}, 'decide': {'decision', 'reason'}}
    if not isinstance(operation, str) or operation not in fields: frappe.throw(_('Unknown delegation action.'))
    data = values(payload, fields[operation], fields[operation])
    doc = read(name, locked=True)
    if operation in ('revise', 'decide'):
        result = getattr(domain, operation)(name=name, expected_version=expected_version, command_id=command_id, **data)
        return dict(name=result['name'], operation=operation)
    assert_current_scope(doc.company, doc.department, required_roles=ADMIN_ROLE)
    doc.check_permission('write')
    full_payload = dict(name=name, expected_version=expected_version, **data)
    key, fingerprint, prior = receipt(doc.company, operation, command_id, full_payload)
    if prior: return prior
    if doc.revoked or get_datetime(doc.modified) != get_datetime(expected_version):
        frappe.throw(_('This delegation changed. Reload before revoking.'), frappe.TimestampMismatchError)
    before = delegation_audit.project(doc)
    with delegation_audit.endpoint():
        doc.revoked = 1
        doc.revocation_reason = data['reason']
        doc.save()
        delegation_audit.record('revoke', doc, before, dict(full_payload, command_id=command_id), command_id, expected_version, key)
    result = dict(name=doc.name, operation=operation)
    store_receipt(key, fingerprint, result)
    return result
