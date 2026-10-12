"""Personal-session JD editing over native immutable revisions and approval rules."""
import json
import math
import re

import frappe
from frappe import _

from kandil_hr.foundation.mutation_access import assert_current_scope
from kandil_hr.foundation.security import has_scope
from kandil_hr.organization import api as domain, jd_rules, revision_import_audit as audit
from kandil_hr.pilot.api import transactional_retry, transition as receipt_transition
from kandil_hr.portal.api import authenticated
from kandil_hr.portal.organization import bounded_text, day, page, paging, position_record
from kandil_hr.portal.structure import version

DT = 'Kandil JD Revision'
ROLES = ('Kandil Recruiter', 'Kandil Sector Approver')
TEXT = ('purpose', 'purpose_ar', 'qualifications', 'qualifications_ar', 'experience', 'experience_ar',
        'technical_skills', 'technical_skills_ar', 'working_conditions', 'working_conditions_ar',
        'certifications', 'certifications_ar', 'responsibilities', 'responsibilities_ar', 'responsibility_reason')
TABLES = {
    'responsibility_rows': ('area', 'description', 'description_ar'),
    'kpis': ('indicator', 'indicator_ar', 'kind', 'weight', 'formula', 'formula_ar', 'frequency'),
    'authorities': ('decision', 'decision_ar', 'authority_level'),
    'competencies': ('competency', 'competency_ar', 'weight', 'measure', 'measure_ar', 'target',
                     'competency_group', 'required_level', 'behavior', 'behavior_ar'),
}
EDITABLE = (*TEXT, 'valid_from', 'job_level', *TABLES)
FIELDS = ['name', 'company', 'department', 'branch', 'position', 'designation', 'revision', 'supersedes',
          'valid_from', 'status', 'owner', 'modified', 'approved_by', 'approved_at']


def deny():
    frappe.throw(_('This job description is unavailable for your role or scope.'), frappe.PermissionError)


def read(name, locked=False):
    name = bounded_text(name)
    company = frappe.db.get_value(DT, name, 'company')
    if not company: deny()
    if locked: domain.lock_company(company)
    doc = frappe.get_doc(DT, name, for_update=locked)
    doc.check_permission('read')
    if not has_scope(frappe.session.user, doc.company, doc.department, doc.branch): deny()
    return doc


def access(doc):
    manage = has_scope(frappe.session.user, doc.company, capability='manage') and doc.has_permission('write')
    return dict(edit=bool(manage and doc.status == 'Draft' and doc.owner == frappe.session.user),
                approve=bool(manage and doc.status == 'Draft' and doc.owner != frappe.session.user
                             and ('Kandil Sector Approver' in frappe.get_roles() or frappe.session.user == 'Administrator')),
                revise=bool(manage and doc.status == 'Approved' and frappe.has_permission(DT, 'create')),
                print=bool(doc.has_permission('print')))


def project(doc):
    values = {key: doc.get(key) for key in (*FIELDS, *TEXT, 'job_level')}
    values.update(modified=str(doc.modified), actions=access(doc),
                  warnings=jd_rules.validate([r.as_dict() for r in doc.responsibility_rows],
                      [r.as_dict() for r in doc.kpis], doc.job_level, doc.responsibility_reason))
    for table, fields in TABLES.items():
        values[table] = [{key: row.get(key) if row.get(key) is not None else (0 if key == 'weight' else '') for key in fields} for row in doc.get(table)]
    # Grade/salary references and raw audit envelopes are deliberately excluded.
    return values


@frappe.whitelist(methods=['GET'])
def listing(position=None, status='', search='', start=0, page_length=20):
    authenticated(); start, limit = paging(start, page_length)
    if not frappe.has_permission(DT, 'read'): return page([], start, limit)
    filters = {}
    if position:
        p = position_record(position)
        filters.update(company=p.company, designation=p.designation)
    if status:
        if status not in ('Draft', 'Approved', 'Rejected'): frappe.throw(_('Unknown job description status.'))
        filters['status'] = status
    term = bounded_text(search)
    query = [[key, 'like', '%'+term+'%'] for key in ('designation', 'name')] if term else None
    return page(frappe.get_list(DT, filters=filters, or_filters=query, fields=FIELDS,
        order_by='modified desc, name', start=start, page_length=limit+1), start, limit)


@frappe.whitelist(methods=['GET'])
def detail(name):
    authenticated(); return project(read(name))


@frappe.whitelist(methods=['GET'])
def positions(search='', start=0, page_length=20):
    authenticated(); start, limit = paging(start, page_length); term = bounded_text(search)
    if not frappe.has_permission(DT, 'create'): return page([], start, limit)
    # Page permission-filtered positions, then annotate management capability.
    rows = frappe.get_list('Kandil Position', filters={'status': 'Active'},
        or_filters=[[k, 'like', '%'+term+'%'] for k in ('name', 'title', 'title_ar', 'designation')] if term else None,
        fields=['name', 'title', 'title_ar', 'company', 'designation'], order_by='name', start=start, page_length=limit+1)
    for row in rows: row['can_create'] = has_scope(frappe.session.user, row.company, capability='manage')
    return page(rows, start, limit)


def payload_values(payload):
    values = frappe.parse_json(payload)
    if not isinstance(values, dict) or set(values)-set(EDITABLE) or len(json.dumps(values)) > 160000:
        frappe.throw(_('Only bounded editable job description fields are accepted.'))
    clean = {}
    for key in TEXT:
        value = values.get(key, '')
        if not isinstance(value, str) or len(value) > 12000:
            frappe.throw(_('Each job description text field is limited to 12000 characters.'))
        clean[key] = value
    if not values.get('valid_from'): frappe.throw(_('Choose an effective date for the job description.'))
    clean['valid_from'] = day(values.get('valid_from'))
    clean['job_level'] = bounded_text(values.get('job_level'))
    for table, fields in TABLES.items():
        rows = values.get(table, [])
        if not isinstance(rows, list) or len(rows) > (16 if table == 'responsibility_rows' else 40):
            frappe.throw(_('Job description tables exceed the row limit.'))
        clean[table] = []
        for row in rows:
            if not isinstance(row, dict) or set(row)-set(fields):
                frappe.throw(_('Unsupported job description row field.'))
            output = {}
            for key, value in row.items():
                if key == 'weight':
                    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 100:
                        frappe.throw(_('Weights must be numbers between zero and 100.'))
                elif not isinstance(value, str) or len(value) > 4000:
                    frappe.throw(_('Job description row text is limited to 4000 characters.'))
                output[key] = value
            clean[table].append(output)
    try: jd_rules.validate(clean['responsibility_rows'], clean['kpis'], clean['job_level'], clean['responsibility_reason'])
    except ValueError as exc: frappe.throw(_(str(exc)))
    return clean


def receipt(company, operation, command_id, payload, owner=None):
    if not isinstance(command_id, str) or not re.fullmatch(r'[a-zA-Z0-9-]{16,100}', command_id):
        frappe.throw(_('A unique command ID is required.'))
    for user in sorted({frappe.session.user, owner} - {None}):
        frappe.db.sql('SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE', user)
    assert_current_scope(company, required_roles=('Kandil Sector Approver',) if operation == 'approve' else ROLES)
    key = domain.digest(['portal-jd', frappe.session.user, company, operation, command_id])
    fingerprint = domain.digest(payload)
    rows = frappe.db.sql('SELECT payload_hash,result_json FROM `tabKandil Command Receipt` WHERE name=%s FOR UPDATE', key, as_dict=True)
    if not rows: return key, fingerprint, None
    if rows[0].payload_hash != fingerprint: frappe.throw(_('Command ID was already used with different data.'))
    result = json.loads(rows[0].result_json)
    doc = read(result['name'], locked=True); doc.check_permission('write')
    if doc.company != company: deny()
    return key, fingerprint, result


def store(key, fingerprint, doc):
    result = dict(name=doc.name, modified=str(doc.modified), status=doc.status, revision=doc.revision)
    with receipt_transition():
        frappe.get_doc(dict(doctype='Kandil Command Receipt', dedupe_key=key, actor=frappe.session.user,
            payload_hash=fingerprint, result_json=frappe.as_json(result))).insert(ignore_permissions=True)
    return result


@frappe.whitelist(methods=['POST'])
@transactional_retry
def save(position, payload, command_id, name=None, expected_version=None, supersedes=None):
    authenticated(); p = position_record(position); domain.lock_company(p.company)
    doc = read(name, locked=True) if name else None
    key, fingerprint, prior = receipt(p.company, 'save', command_id,
        [position, payload, name, expected_version, supersedes], doc.owner if doc else None)
    if prior: return prior
    clean = payload_values(payload)
    if doc:
        if not access(doc)['edit'] or doc.position != p.name or (supersedes or '') != (doc.supersedes or ''): deny()
        version(doc, expected_version)
    else:
        if not frappe.has_permission(DT, 'create'): deny()
        if supersedes:
            previous = read(supersedes, locked=True)
            if previous.status != 'Approved' or previous.company != p.company or previous.designation != p.designation: deny()
        doc = frappe.get_doc(dict(doctype=DT, company=p.company, department=p.department, branch=p.branch,
            position=p.name, supersedes=supersedes, status='Draft'))
    before = audit.before(doc) if name else None
    doc.update(clean)
    if name: doc.save()
    else: doc.insert()
    with domain.transition():
        audit.record('portal_save_jd' if name else 'portal_create_jd', doc, expected_version or command_id, clean,
                     before if name else dict(doctype=DT, name=doc.name, record_exists=False), [],
                     dict(name=doc.name, status=doc.status), [])
    return store(key, fingerprint, doc)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def approve(name, expected_version, command_id):
    authenticated(); doc = read(name, locked=True)
    key, fingerprint, prior = receipt(doc.company, 'approve', command_id, [name, expected_version], doc.owner)
    if prior: return prior
    if not access(doc)['approve']: deny()
    version(doc, expected_version)
    domain.approve_revision(DT, name, expected_version)
    return store(key, fingerprint, frappe.get_doc(DT, name, for_update=True))
