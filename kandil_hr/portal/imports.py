"""Bounded personal-session organization import workflow over native review commands."""
import json
import re

import frappe
from frappe import _

from kandil_hr.foundation.mutation_access import assert_current_scope
from kandil_hr.foundation.security import has_scope
from kandil_hr.organization import api as domain
from kandil_hr.organization.assignment_reconciliation import preview as matches
from kandil_hr.organization.csv_import import CSVImportError, SCHEMAS, parse
from kandil_hr.pilot.api import transactional_retry, transition as receipt_transition
from kandil_hr.portal.api import authenticated
from kandil_hr.portal.organization import bounded_text, page, paging
from kandil_hr.portal.structure import version

DT = 'Kandil Organization Import'
ROLES = ('Kandil Recruiter', 'Kandil Sector Approver')
FIELDS = ['name', 'company', 'import_kind', 'baseline_reference', 'status', 'owner', 'reviewed_by', 'modified']


def deny():
    frappe.throw(_('Organization imports require the appropriate role and whole-company access.'), frappe.PermissionError)


def access(company, manage=False):
    if not frappe.has_permission(DT, 'write' if manage else 'read') or not has_scope(
        frappe.session.user, company, capability='manage' if manage else 'read'
    ): deny()


def read(name, locked=False):
    name = bounded_text(name)
    company = frappe.db.get_value(DT, name, 'company')
    if not company: deny()
    access(company, manage=locked)
    if locked: domain.lock_company(company)
    doc = frappe.get_doc(DT, name, for_update=locked)
    doc.check_permission('write' if locked else 'read')
    return doc


def actions(doc):
    manage = has_scope(frappe.session.user, doc.company, capability='manage') and doc.has_permission('write')
    return dict(edit=bool(manage and doc.status == 'Draft' and doc.owner == frappe.session.user),
                review=bool(manage and doc.status == 'Draft' and doc.owner != frappe.session.user
                            and ('Kandil Sector Approver' in frappe.get_roles() or frappe.session.user == 'Administrator')),
                apply=bool(manage and doc.status == 'Reviewed'))


def project(doc):
    result = {key: doc.get(key) for key in FIELDS}
    result.update(modified=str(doc.modified), digest=doc.digest, row_count=len(json.loads(doc.rows_json or '[]')),
                  actions=actions(doc))
    applied = json.loads(doc.result_json or '{}')
    result['result'] = {key: applied.get(key) for key in ('created', 'unchanged', 'mapped')} if applied else None
    # Do not return raw company snapshots, full source CSV, or audit envelopes.
    reconciliation = applied.get('reconciliation')
    result['reconciliation_at_apply'] = dict(as_of=reconciliation['as_of'], balanced=reconciliation['balanced'],
        positions=len(reconciliation['rows']), unmatched_ledgers=len(reconciliation['unmapped_capacities'])) if reconciliation else None
    return result


@frappe.whitelist(methods=['GET'])
def choices():
    authenticated()
    if not frappe.has_permission(DT, 'read'): return dict(companies=[], can_create=False, schemas={})
    if frappe.session.user == 'Administrator':
        names = frappe.get_all('Company', pluck='name', limit_page_length=1001)
    else:
        names = frappe.get_all('Kandil Access Grant', filters={'user': frappe.session.user, 'revoked': 0},
                               pluck='company', limit_page_length=1001)
    companies = sorted({n for n in names if has_scope(frappe.session.user, n)})
    if len(names) > 1000 or len(companies) > 100:
        frappe.throw(_('Too many company grants. Ask the administrator to review your scope.'))
    return dict(companies=[dict(name=n, can_manage=has_scope(frappe.session.user, n, capability='manage')) for n in companies],
                can_create=bool(frappe.has_permission(DT, 'create')), schemas=SCHEMAS)


@frappe.whitelist(methods=['GET'])
def listing(company=None, status='', start=0, page_length=20):
    authenticated(); start, limit = paging(start, page_length)
    if not frappe.has_permission(DT, 'read'): return page([], start, limit)
    filters = {}
    if company: filters['company'] = bounded_text(company)
    if status:
        if status not in ('Draft', 'Reviewed', 'Applied'): frappe.throw(_('Unknown import status.'))
        filters['status'] = status
    return page(frappe.get_list(DT, filters=filters, fields=FIELDS, order_by='modified desc, name asc',
                               start=start, page_length=limit+1), start, limit)


@frappe.whitelist(methods=['GET'])
def detail(name):
    authenticated(); return project(read(name))


@frappe.whitelist(methods=['POST'])
@transactional_retry
def batch_rows(name, start=0, page_length=30):
    authenticated(); doc = read(name); start, limit = paging(start, page_length)
    domain.lock_company(doc.company)
    doc = frappe.get_doc(DT, doc.name, for_update=True)
    source = json.loads(doc.rows_json or '[]')
    validation_error = None
    try:
        reviewed = domain.import_preview(doc) if doc.status == 'Draft' else json.loads(doc.preview_json or '[]')
    except frappe.ValidationError as exc:
        # A changed baseline must not strand the author outside the draft editor.
        # Authorization errors deliberately propagate; only business validation is shown.
        reviewed = []; validation_error = str(exc)
    result = page([dict(row=i+1, values=source[i], action=reviewed[i]['action'] if i < len(reviewed) else ('Invalid' if validation_error else 'Draft'))
                   for i in range(start, min(len(source), start+limit+1))], start, limit)
    result['total'] = len(source)
    result['validation_error'] = validation_error
    return result


def proposed(company, import_kind, csv_text, baseline_reference=''):
    company = bounded_text(company); baseline_reference = bounded_text(baseline_reference)
    access(company, manage=True); domain.lock_company(company)
    if not isinstance(import_kind, str) or import_kind not in SCHEMAS:
        frappe.throw(_('Select a supported organization import kind.'))
    try: rows = parse(csv_text, import_kind)
    except CSVImportError as exc: frappe.throw(_(str(exc)))
    doc = frappe.get_doc(dict(doctype=DT, company=company, import_kind=import_kind,
        baseline_reference=baseline_reference, rows_json=domain.serialized(rows)))
    reconciliation = matches(doc) if import_kind == 'Assignments' else None
    valid = not reconciliation or reconciliation['valid']
    preview = domain.import_preview(doc) if valid else []
    return doc, reconciliation, preview, bool(valid)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def validate_csv(company, import_kind, csv_text, baseline_reference='', name=None, expected_version=None):
    authenticated()
    if name:
        existing = read(name, locked=True)
        if not actions(existing)['edit'] or existing.company != company or existing.import_kind != import_kind: deny()
        version(existing, expected_version)
    elif not frappe.has_permission(DT, 'create'): deny()
    doc, reconciliation, preview, valid = proposed(company, import_kind, csv_text, baseline_reference)
    source = json.loads(doc.rows_json)
    return dict(valid=valid, digest=domain.import_digest(doc), row_count=len(source),
        rows=[dict(row=i+1, values=row, action=preview[i]['action'] if valid else
                   ('Unmatched' if reconciliation['rows'][i]['unmatched'] else 'Matched')) for i, row in enumerate(source)],
        reconciliation=reconciliation, limits=dict(max_rows=1000, max_bytes=1048576))


def receipt(company, operation, command_id, payload):
    if not isinstance(command_id, str) or not re.fullmatch(r'[a-zA-Z0-9-]{16,100}', command_id):
        frappe.throw(_('A unique command ID is required.'))
    assert_current_scope(company, required_roles=('Kandil Sector Approver',) if operation == 'review' else ROLES)
    key = domain.digest(['portal-import', frappe.session.user, company, operation, command_id])
    fingerprint = domain.digest(payload)
    rows = frappe.db.sql('SELECT payload_hash,result_json FROM `tabKandil Command Receipt` WHERE name=%s FOR UPDATE', key, as_dict=True)
    if not rows: return key, fingerprint, None
    if rows[0].payload_hash != fingerprint: frappe.throw(_('Command ID was already used with different data.'))
    result = json.loads(rows[0].result_json)
    doc = frappe.get_doc(DT, result['name'], for_update=True)
    if doc.company != company: deny()
    doc.check_permission('read'); doc.check_permission('write')
    return key, fingerprint, result


def store(key, fingerprint, doc):
    result = dict(name=doc.name, modified=str(doc.modified), status=doc.status)
    with receipt_transition():
        frappe.get_doc(dict(doctype='Kandil Command Receipt', dedupe_key=key, actor=frappe.session.user,
            payload_hash=fingerprint, result_json=frappe.as_json(result))).insert(ignore_permissions=True)
    return result


@frappe.whitelist(methods=['POST'])
@transactional_retry
def save(company, import_kind, csv_text, validated_digest, command_id, baseline_reference='', name=None, expected_version=None):
    authenticated(); access(company, manage=True); domain.lock_company(company)
    # Raw text stays in memory; a content hash is the receipt fingerprint input.
    key, fingerprint, prior = receipt(company, 'save', command_id,
        [name, expected_version, import_kind, domain.digest(csv_text), baseline_reference, validated_digest])
    if prior: return prior
    if name:
        doc = read(name, locked=True)
        if not actions(doc)['edit'] or doc.company != company or doc.import_kind != import_kind: deny()
        version(doc, expected_version)
    elif not frappe.has_permission(DT, 'create'): deny()
    proposed_doc, reconciliation, preview, valid = proposed(company, import_kind, csv_text, baseline_reference)
    if not valid: frappe.throw(_('Resolve unmatched employee and position references before saving.'))
    if domain.import_digest(proposed_doc) != validated_digest:
        frappe.throw(_('CSV or baseline reference changed. Validate it again before saving.'))
    if name:
        doc.rows_json = proposed_doc.rows_json; doc.baseline_reference = proposed_doc.baseline_reference; doc.save()
    else:
        doc = proposed_doc; doc.insert()
    return store(key, fingerprint, doc)


def decide(name, expected_version, command_id, operation, reviewed_digest=None):
    authenticated(); doc = read(name, locked=True)
    key, fingerprint, prior = receipt(doc.company, operation, command_id, [name, expected_version, reviewed_digest])
    if prior: return prior
    if not actions(doc)[operation]: deny()
    version(doc, expected_version)
    if operation == 'review': domain.review_import(name, expected_version)
    else: domain.apply_import(name, reviewed_digest)
    return store(key, fingerprint, frappe.get_doc(DT, name, for_update=True))


@frappe.whitelist(methods=['POST'])
@transactional_retry
def review(name, expected_version, command_id):
    return decide(name, expected_version, command_id, 'review')


@frappe.whitelist(methods=['POST'])
@transactional_retry
def apply(name, expected_version, reviewed_digest, command_id):
    return decide(name, expected_version, command_id, 'apply', reviewed_digest)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def occupancy(company, start=0, page_length=30):
    authenticated(); access(company); start, limit = paging(start, page_length)
    # The native comparison locks current records and does not repair any ledger.
    report = domain.reconcile(company)
    result = page(report['rows'][start:start+limit+1], start, limit)
    result.update(as_of=report['as_of'], balanced=report['balanced'], total=len(report['rows']),
                  unmapped_ledger_count=len(report['unmapped_capacities']))
    return result
