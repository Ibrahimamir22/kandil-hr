"""Personal-session structural review UI adapter; domain commands remain authoritative."""
import json
import re

import frappe
from frappe import _
from frappe.utils import get_datetime

from kandil_hr.foundation.mutation_access import assert_current_scope
from kandil_hr.foundation.security import has_scope
from kandil_hr.organization import api as domain
from kandil_hr.organization.contracts import AUTHORITY_ROLES
from kandil_hr.pilot.api import transactional_retry, transition as receipt_transition
from kandil_hr.portal.api import authenticated
from kandil_hr.portal.organization import bounded_text, day, page, paging, parents

DT = 'Kandil Structure Change'
CREATE_ROLES = ('Kandil Recruiter', 'Kandil Sector Approver', 'Kandil Approver')
WRITE_ROLES = (*CREATE_ROLES, 'Kandil CEO Approver', 'Kandil Board Approver')
FIELDS = ['name', 'company', 'effective_on', 'reason', 'status', 'owner', 'modified']
OP_FIELDS = {
    'Create': {'action', 'draft_key', 'title', 'title_ar', 'department', 'branch', 'designation',
               'authority', 'structural', 'parent_position', 'job_family', 'external_id'},
    'Resize': {'action', 'position', 'structural'},
    'Reparent': {'action', 'position', 'parent_position', 'authority'},
    'Close': {'action', 'position'},
}


def deny():
    frappe.throw(_('This organization change is unavailable for your role or company scope.'), frappe.PermissionError)


def access(company, manage=False):
    if not has_scope(frappe.session.user, company, capability='manage' if manage else 'read'):
        deny()


def read(name, locked=False):
    name = bounded_text(name)
    company = frappe.db.get_value(DT, name, 'company')
    if not company: deny()
    access(company)
    if locked: domain.lock_company(company)
    doc = frappe.get_doc(DT, name, for_update=locked)
    doc.check_permission('read')
    return doc


def version(doc, expected):
    if not expected or get_datetime(doc.modified) != get_datetime(expected):
        frappe.throw(_('This record changed. Reload it before editing.'), frappe.TimestampMismatchError)


def actions(doc):
    manage = has_scope(frappe.session.user, doc.company, capability='manage') and doc.has_permission('write')
    editable = bool(manage and doc.owner == frappe.session.user and doc.status in ('Draft', 'Returned'))
    step = next((s for s in doc.approval_steps if s.decision == 'Pending'), None)
    decide = bool(manage and doc.status == 'Pending' and doc.owner != frappe.session.user and step
                  and step.principal == frappe.session.user and AUTHORITY_ROLES.get(step.authority) in frappe.get_roles())
    return dict(edit=editable, preview=editable, submit=bool(editable and doc.preview_hash), decide=decide,
                step_id=step.step_key if decide else None)


def project(doc):
    values = {key: doc.get(key) for key in FIELDS}
    values['modified'] = str(doc.modified)
    values['operations'] = json.loads(doc.changes_json)
    values['preview_hash'] = doc.preview_hash
    values['steps'] = [{k: s.get(k) for k in ('step_key', 'authority', 'principal', 'decision', 'comment', 'decided_at')}
                       for s in doc.approval_steps]
    route = json.loads(doc.route_snapshot or '{}')
    values['round'] = route.get('round', 0)
    values['history'] = [dict(round=h.get('round'), effective_on=h.get('effective_on'), reason=h.get('reason'),
        operations=h.get('changes'), steps=[{k: s.get(k) for k in ('authority', 'principal', 'decision', 'comment', 'decided_at')}
                                           for s in h.get('steps', [])]) for h in route.get('history', [])]
    values['created_positions'] = json.loads(doc.created_positions_json or '{}')
    frozen=submitted_review(doc)
    values['review'] = frozen if frozen is not None else review_rows(doc)
    values['review_basis'] = 'submitted_snapshot' if frozen is not None else 'current_records'
    values['actions'] = actions(doc)
    return values


@frappe.whitelist(methods=['GET'])
def choices():
    authenticated()
    can_read = bool(frappe.has_permission(DT, 'read'))
    if not can_read: return dict(companies=[], can_create=False)
    # Company names come only from the user's current whole-company grants.
    if frappe.session.user == 'Administrator':
        names = frappe.get_all('Company', pluck='name', limit_page_length=101)
    else:
        names = frappe.get_all('Kandil Access Grant', filters={'user': frappe.session.user, 'revoked': 0},
                               pluck='company', limit_page_length=1001)
    companies = sorted({n for n in names if has_scope(frappe.session.user, n)})
    if len(names) > 1000 or len(companies) > 100:
        frappe.throw(_('Too many company grants. Ask the administrator to review your scope.'))
    return dict(companies=[dict(name=n, can_manage=has_scope(frappe.session.user, n, capability='manage')) for n in companies],
                can_create=bool(frappe.has_permission(DT, 'create')))


@frappe.whitelist(methods=['GET'])
def catalog(company, kind, search='', start=0, page_length=30):
    authenticated();access(company)
    if not frappe.has_permission(DT, 'read'): deny()
    start, limit = paging(start, page_length);term=bounded_text(search)
    if kind not in ('department', 'branch', 'designation', 'position'):
        frappe.throw(_('Choose a supported organization reference.'))
    dt = {'department':'Department','branch':'Branch','designation':'Designation','position':'Kandil Position'}[kind]
    filters = {'company': company} if kind in ('department','position') else {}
    if kind == 'position': filters['status']='Active'
    search_fields=('name','position_code','title','title_ar') if kind=='position' else ('name',)
    search_filters=[[field,'like','%'+term+'%'] for field in search_fields] if term else None
    # Whole-company structural readers may choose existing shared Branch/Designation masters.
    rows=frappe.get_list(dt, filters=filters, or_filters=search_filters, fields=['name', 'title', 'title_ar'] if kind=='position' else ['name'],
                        order_by='name', start=start, page_length=limit+1)
    return page([dict(id=r.name,label=r.get('title') or r.name,label_ar=r.get('title_ar')) for r in rows],start,limit)


@frappe.whitelist(methods=['GET'])
def listing(company=None, status='', start=0, page_length=20):
    authenticated();start,limit=paging(start,page_length)
    if not frappe.has_permission(DT, 'read'): return page([],start,limit)
    filters={}
    if company: filters['company']=bounded_text(company)
    if status:
        if status not in ('Draft','Returned','Pending','Approved','Rejected'):frappe.throw(_('Unknown change status.'))
        filters['status']=status
    rows=frappe.get_list(DT, filters=filters, fields=FIELDS, order_by='modified desc, name asc', start=start,page_length=limit+1)
    return page(rows,start,limit)


@frappe.whitelist(methods=['GET'])
def detail(name):
    authenticated()
    return project(read(name))


def payload_values(payload):
    payload=frappe.parse_json(payload)
    if not isinstance(payload,dict) or set(payload)-{'company','effective_on','reason','operations'}:
        frappe.throw(_('Only editable organization change fields are accepted.'))
    company=bounded_text(payload.get('company'))
    reason=payload.get('reason')
    if not company or not isinstance(reason,str) or not 3<=len(reason.strip())<=2000:
        frappe.throw(_('Choose a company and provide a reason of 3 to 2000 characters.'))
    operations=payload.get('operations')
    if not isinstance(operations,list) or not 1<=len(operations)<=200 or len(json.dumps(payload))>100000:
        frappe.throw(_('Provide between one and 200 bounded operations.'))
    for op in operations:
        if not isinstance(op,dict) or op.get('action') not in OP_FIELDS or set(op)-OP_FIELDS[op['action']]:
            frappe.throw(_('Unsupported structure operation or field.'))
        for key,val in op.items():
            if key=='structural':
                if isinstance(val,bool) or not isinstance(val,int) or not 1<=val<=1000000:
                    frappe.throw(_('Seats must be a positive whole number.'))
            elif val is not None and (not isinstance(val,str) or len(val)>140):
                frappe.throw(_('Organization references and labels must be text of at most 140 characters.'))
    return dict(company=company,effective_on=day(payload.get('effective_on')),reason=reason,changes_json=domain.serialized(operations))


def receipt_key(company, operation, command_id, payload):
    if not isinstance(command_id,str) or not re.fullmatch(r'[a-zA-Z0-9-]{16,100}',command_id):
        frappe.throw(_('A unique command ID is required.'))
    return domain.digest(['portal-structure',frappe.session.user,company,operation,command_id]),domain.digest(payload)


def prior_receipt(key, fingerprint, company):
    rows=frappe.db.sql('SELECT payload_hash,result_json FROM `tabKandil Command Receipt` WHERE name=%s FOR UPDATE',key,as_dict=True)
    if not rows:return None
    assert_current_scope(company,required_roles=WRITE_ROLES)
    if rows[0].payload_hash!=fingerprint:frappe.throw(_('Command ID was already used with different data.'))
    result=json.loads(rows[0].result_json)
    # The receipt may have committed while this request waited on Company.
    # A normal metadata lookup can still use the earlier repeatable-read snapshot.
    # Read the receipt target under lock, inside the already-held company mutex.
    target=frappe.get_doc(DT,result['name'],for_update=True)
    if target.company!=company:deny()
    target.check_permission('read')
    target.check_permission('write')
    return result


def store_receipt(key, fingerprint, result):
    with receipt_transition():
        frappe.get_doc(dict(doctype='Kandil Command Receipt',dedupe_key=key,actor=frappe.session.user,
                            payload_hash=fingerprint,result_json=frappe.as_json(result))).insert(ignore_permissions=True)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def save(payload, command_id, name=None, expected_version=None):
    authenticated();values=payload_values(payload);company=values['company'];access(company,manage=True)
    if name and frappe.db.get_value(DT,name,'company') != company:deny()
    domain.lock_company(company)
    key,fingerprint=receipt_key(company,'save',command_id,[name,expected_version,values])
    prior=prior_receipt(key,fingerprint,company)
    if prior:return prior
    doc=read(name,locked=True) if name else frappe.new_doc(DT)
    if name:
        if doc.company!=company:deny()
        if not actions(doc)['edit']:deny()
        version(doc,expected_version)
    elif not frappe.has_permission(DT,'create'):deny()
    doc.update(values)
    # Validate against current locked business records without saving a position.
    domain.planned_hierarchy(doc,domain.structure_state(company))
    doc.save() if name else doc.insert()
    result=dict(name=doc.name,modified=str(doc.modified),status=doc.status)
    store_receipt(key,fingerprint,result)
    return result


@frappe.whitelist(methods=['POST'])
@transactional_retry
def preview(name, expected_version, command_id):
    authenticated();doc=read(name,locked=True);access(doc.company,manage=True)
    key,fingerprint=receipt_key(doc.company,'preview',command_id,[name,expected_version])
    prior=prior_receipt(key,fingerprint,doc.company)
    if prior:return prior
    version(doc,expected_version)
    result=domain.preview_structure(name)
    doc.reload()
    # No company-wide assignment/person/user snapshot crosses the portal boundary.
    result=dict(name=doc.name,modified=str(doc.modified),preview_hash=result['preview_hash'],status=doc.status,
                review=review_rows(doc))
    store_receipt(key,fingerprint,result)
    return result



def submitted_review(doc):
    """Expose only position before-values from the matching immutable submit audit.

    Native command audit is private; this adapter has already checked the change's
    whole-company read permission. No raw envelope, employee or assignment is sent.
    """
    rows=frappe.get_all('Kandil Command Audit',filters={'target_doctype':DT,'target_name':doc.name,
        'company':doc.company,'operation':'submit'},fields=['envelope_json'],order_by='creation desc',page_length=1)
    if not rows:return None
    envelope=json.loads(rows[0].envelope_json)
    after=envelope.get('after',{})
    if (after.get('changes_json')!=doc.changes_json or str(after.get('effective_on'))!=str(doc.effective_on)
        or (doc.preview_hash and after.get('preview_hash')!=doc.preview_hash)):
        return None
    records=envelope.get('related_before',[])
    positions={p['name']:p for p in records if p.get('doctype')=='Kandil Position' and p.get('company')==doc.company}
    result=[]
    at=str(doc.effective_on)
    for op in json.loads(doc.changes_json):
        old=None
        if op.get('position'):
            p=positions.get(op['position'])
            if not p:return None
            edges=[r for r in records if r.get('doctype')=='Kandil Position Hierarchy' and r.get('position')==op['position']
                   and str(r.get('valid_from'))<=at and (not r.get('valid_until') or str(r['valid_until'])>=at)]
            old={key:p.get(key) for key in ('title','title_ar','structural','status')}
            old['parent_position']=edges[0].get('parent_position') if len(edges)==1 else None
        result.append(dict(operation=op,before=old))
    return result


def review_rows(doc):
    rows=[]
    ids=[op['position'] for op in json.loads(doc.changes_json) if op.get('position')]
    hierarchy=parents(ids,str(doc.effective_on))
    for op in json.loads(doc.changes_json):
        old=None
        if op.get('position'):
            p=frappe.get_doc('Kandil Position',op['position'])
            p.check_permission('read')
            if p.company!=doc.company:deny()
            edge=hierarchy.get(p.name)
            old=dict(title=p.title,title_ar=p.title_ar,structural=p.structural,status=p.status,
                     parent_position=(edge.get('parent') or {}).get('name') if edge else None)
        rows.append(dict(operation=op,before=old))
    return rows


@frappe.whitelist(methods=['POST'])
@transactional_retry
def submit(name, preview_hash, command_id, expected_version):
    authenticated();doc=read(name,locked=True)
    result=domain.submit_structure(name,preview_hash,command_id,expected_version)
    assert_current_scope(doc.company,required_roles=WRITE_ROLES)
    return result


@frappe.whitelist(methods=['POST'])
@transactional_retry
def decide(name, preview_hash, decision, step_id, command_id, expected_version, comment=''):
    authenticated();doc=read(name,locked=True)
    if not isinstance(comment,str) or len(comment)>2000:frappe.throw(_('Decision comments must contain at most 2000 characters.'))
    result=domain.decide_structure(name,preview_hash,decision,step_id,command_id,expected_version,comment)
    assert_current_scope(doc.company,required_roles=WRITE_ROLES)
    return result
