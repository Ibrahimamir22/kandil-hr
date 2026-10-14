"""Private durable candidate commands; business effects stay in existing commands.

Preparation does not perform a business action. Execution and completion share a
transaction, so a lost response can be recovered by the original actor. Browser
clients need only opaque references, never persisted profiles or service secrets.
"""
import hashlib
import json
import uuid
from contextlib import contextmanager

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils.password import encrypt,decrypt
from frappe.utils import now_datetime, get_datetime, add_to_date

from kandil_hr.candidates import identity,intake,corrections,migration,work,activities
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.portal.api import authenticated
from kandil_hr.foundation.mutation_access import assert_current_request_scope

DT='Kandil Candidate Recovery'
# Temporary retry-buffer lifetime, independent of candidate-record retention.
DEFAULT_RECOVERY_HOURS=168


class CandidateRecoveryExpired(frappe.ValidationError):
    pass


def recovery_hours():
    value=frappe.conf.get('kandil_candidate_recovery_hours',DEFAULT_RECOVERY_HOURS)
    if isinstance(value,bool) or not isinstance(value,int) or not 1<=value<=720:
        frappe.throw(_('Candidate recovery lifetime must be an integer from 1 to 720 hours.'))
    return value


def deadline(doc):
    # Legacy envelopes get a fixed seven days from creation, never an extension
    # from a changing site setting or from a retry updating modified.
    return get_datetime(doc.expires_at) if doc.expires_at else add_to_date(get_datetime(doc.creation),hours=DEFAULT_RECOVERY_HOURS)


def assert_unexpired(doc):
    if doc.status=='Expired' or deadline(doc)<=now_datetime():
        frappe.throw(_('This saved action has expired. Review existing application records before starting another request.'),CandidateRecoveryExpired)
COMMON={'name','opening_name','expected_version','command_id'}
SCHEMAS={
    'intake':(COMMON|{'details'},{'profile','person','person_version','identity_reason'}),
    'correction':(COMMON|{'application','person','person_version','profile','reason'},set()),
    'migration':(COMMON|{'application','application_version','preview_hash','reason'},set()),
    'activity':(COMMON|{'application','application_version','kind','outcome','note'},set()),
    'activity_void':(COMMON|{'application','application_version','activity','reason'},set()),
    'owner':(COMMON|{'application','application_version','owner','reason'},set()),
    'followup':(COMMON|{'application','application_version','owner','reason','task','due'},set()),
}
OPERATIONS={'activity':'candidate_activity_record','activity_void':'candidate_activity_void','intake':'candidate_intake','correction':'candidate_profile_correct','migration':'candidate_identity_migrate','owner':'application_owner','followup':'application_task'}
HANDLERS={'activity':activities.record,'activity_void':activities.void,'intake':intake.create_application,'correction':corrections.correct,'migration':migration.apply_review,'owner':work.change_owner,'followup':work.set_followup}


@contextmanager
def effect():
    old=frappe.flags.get('kandil_recovery_effect');frappe.flags.kandil_recovery_effect=True
    try:yield
    finally:frappe.flags.kandil_recovery_effect=old


class KandilCandidateRecovery(Document):
    def autoname(self):self.name=self.dedupe_key

    def validate(self):
        if not frappe.flags.get('kandil_recovery_effect') or not self.is_new():identity.deny()

    def on_trash(self):identity.deny()
    def before_rename(self,*args,**kwargs):identity.deny()


def guard():
    authenticated();identity.guard()
    if frappe.session.user!='Administrator' and 'Kandil Recruiter' not in frappe.get_roles():
        frappe.throw(_('Candidate recovery is unavailable.'),frappe.PermissionError)


def payload(operation,value):
    if not isinstance(operation,str) or operation not in SCHEMAS:frappe.throw(_('Unsupported candidate recovery operation.'))
    if isinstance(value,str):
        if len(value)>16000:frappe.throw(_('Candidate command is too large.'))
        value=frappe.parse_json(value)
    if not isinstance(value,dict):frappe.throw(_('Provide a candidate command object.'))
    required,optional=SCHEMAS[operation]
    if required-set(value) or set(value)-required-optional:frappe.throw(_('Candidate command fields do not match this operation.'))
    # Reject non-JSON / deeply nested objects and bound the encrypted envelope.
    try:raw=json.dumps(value,sort_keys=True,ensure_ascii=False,allow_nan=False)
    except (TypeError,ValueError):frappe.throw(_('Candidate command contains invalid values.'))
    if len(raw)>16000:frappe.throw(_('Candidate command is too large.'))
    for key in COMMON:
        intake.text(value[key],100 if key=='command_id' else 140)
    for key in ('application','application_version','person','person_version','reason','identity_reason','preview_hash'):
        if key in value and value[key] is not None:
            intake.text(value[key],1000 if key in ('reason','identity_reason') else 140,key!='identity_reason')
    for key in ('details','profile'):
        if key in value and not isinstance(value[key],(dict,str)):
            frappe.throw(_('Candidate details must be a JSON object.'))
    if operation=='activity':activities.validate_entry(value['kind'],value['outcome'],value['note'])
    if operation=='activity_void':intake.text(value['activity'],140)
    if operation in ('owner','followup'):
        intake.text(value['owner'],140,operation=='owner' or bool(value.get('task')))
        if operation=='followup':
            intake.text(value['task'],1000,False)
            if value['due'] is not None:intake.text(value['due'],10,False)
    return value,raw


def authorize(operation,args):
    """Company-first order, then current role/scope and native reference access.

    Preparation/review can be stale; only existing business handlers decide
    versions and eligibility. Current authorization is mandatory even on replay.
    """
    company=frappe.db.get_value('Kandil Hiring Request',args['name'],'company')
    frappe.db.sql('SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE',(company,))
    request=frappe.get_doc('Kandil Hiring Request',args['name'],for_update=True)
    request.check_permission('read')
    # Let existing candidate authorization retain its opening/application/person
    # scope. Company serialization keeps its domain/User order compatible here.
    assert_current_request_scope(request,required_roles=('Kandil Recruiter',))
    context=dict(args,opening=args['opening_name'])
    if operation in ('activity','activity_void'):activities.authorize(request,context)
    elif operation in ('owner','followup'):work.authorize(request,context)
    elif operation=='correction':corrections.authorize(request,context)
    else:intake.authorize(request,OPERATIONS[operation],context)
    return request


def owned(name,lock=False):
    if not isinstance(name,str) or len(name)>140:frappe.throw(_('Candidate recovery is unavailable.'),frappe.PermissionError)
    # After waiting for a company lock, a retry must see a concurrently
    # committed envelope instead of the transaction's older snapshot.
    found=frappe.db.get_value(DT,{'name':name,'actor':frappe.session.user},'name',for_update=lock)
    if not found:frappe.throw(_('Candidate recovery is unavailable.'),frappe.PermissionError)
    return frappe.get_doc(DT,name,for_update=lock)


def decode(doc):
    assert_unexpired(doc)
    if not doc.payload_cipher:frappe.throw(_('This command is closed and its recovery payload removed.'))
    args=frappe.parse_json(decrypt(doc.payload_cipher))
    validated,raw=payload(doc.operation,args)
    if hashlib.sha256(raw.encode()).hexdigest()!=doc.payload_hash:
        frappe.throw(_('Recovery payload integrity check failed.'))
    return args


def projection(doc):
    return dict(name=doc.name,operation=doc.operation,status=doc.status,created=str(doc.creation),expires_at=str(deadline(doc)))


@frappe.whitelist(methods=['POST'])
@transactional_retry
def prepare(operation,arguments):
    guard();args,raw=payload(operation,arguments);request=authorize(operation,args)
    key='KRC-'+hashlib.sha256(f'{frappe.session.user}|{args["command_id"]}'.encode()).hexdigest()
    digest=hashlib.sha256(raw.encode()).hexdigest()
    existing=frappe.db.get_value(DT,key,['operation','payload_hash'],as_dict=True,for_update=True)
    if existing:
        if existing.operation!=operation or existing.payload_hash!=digest:
            frappe.throw(_('This command ID already has different recovery data.'))
        return projection(owned(key,lock=True))
    with effect():
        doc=frappe.get_doc(dict(doctype=DT,dedupe_key=key,actor=frappe.session.user,request=request.name,
            operation=operation,payload_hash=digest,payload_cipher=encrypt(raw),status='Pending',
            expires_at=add_to_date(now_datetime(),hours=recovery_hours()))).insert(ignore_permissions=True)
    return projection(doc)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def inspect(name):
    # POST because authorization takes current locks; never a public cacheable GET.
    guard();doc=owned(name);args=decode(doc);authorize(doc.operation,args)
    doc=owned(name,lock=True);args=decode(doc)
    return dict(**projection(doc),arguments=args)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def execute(name):
    guard();doc=owned(name);args=decode(doc);authorize(doc.operation,args)
    doc=owned(name,lock=True);args=decode(doc)
    point='recovery_'+uuid.uuid4().hex
    callbacks=[(getattr(frappe.db,k),len(getattr(frappe.db,k))) for k in ('before_commit','after_commit','before_rollback','after_rollback')]
    frappe.db.savepoint(point)
    try:
        result=HANDLERS[doc.operation](**args)
        # Existing receipt, business effect, audit and this marker commit together.
        frappe.db.set_value(DT,doc.name,'status','Completed')
        return dict(**projection(frappe.get_doc(DT,doc.name)),result=result)
    except frappe.QueryDeadlockError:
        raise  # transactional_retry performs the complete transaction rollback.
    except Exception:
        frappe.db.rollback(save_point=point)
        for manager,length in callbacks:manager.truncate(length)
        frappe.local.document_cache={}
        raise



@frappe.whitelist(methods=['POST'])
@transactional_retry
def acknowledge(name):
    guard();doc=owned(name)
    if doc.status=='Acknowledged':return dict(acknowledged=True)
    args=decode(doc);authorize(doc.operation,args);doc=owned(name,lock=True)
    if doc.status=='Acknowledged':return dict(acknowledged=True)
    if doc.status!='Completed':frappe.throw(_('Resolve the command before acknowledging it.'))
    frappe.db.set_value(DT,doc.name,dict(status='Acknowledged',payload_cipher=''))
    return dict(acknowledged=True)


@frappe.whitelist(methods=['GET'])
def pending(start=0,page_length=20):
    guard()
    from kandil_hr.portal.organization import paging
    offset,limit=paging(start,page_length)
    # Actor-owned minimal index only; details/effects always reauthorize. No
    # contact, profile, company or application IDs are exposed by the index.
    rows=frappe.db.sql('''SELECT name, operation, status, creation, expires_at
        FROM `tabKandil Candidate Recovery` WHERE actor=%s AND status IN ('Pending','Completed')
        AND COALESCE(expires_at, DATE_ADD(creation, INTERVAL 168 HOUR)) > %s
        ORDER BY creation DESC, name DESC LIMIT %s OFFSET %s''',
        (frappe.session.user,now_datetime(),limit+1,offset),as_dict=True)
    return dict(rows=[projection(r) for r in rows[:limit]],start=offset,has_more=len(rows)>limit,next_start=offset+limit if len(rows)>limit else None)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def cancel(name):
    """Cancel an unexecuted recovery envelope, never undo a business effect."""
    guard();doc=owned(name)
    if doc.status=='Cancelled':return dict(cancelled=True)
    args=decode(doc);authorize(doc.operation,args);doc=owned(name,lock=True)
    if doc.status=='Cancelled':return dict(cancelled=True)
    receipt=hashlib.sha256(f'{frappe.session.user}|{args["name"]}|{args["command_id"]}'.encode()).hexdigest()
    if doc.status!='Pending' or frappe.db.get_value('Kandil Command Receipt',receipt,'name',for_update=True):
        frappe.throw(_('This action has completed. Recover its result instead of cancelling it.'))
    frappe.db.set_value(DT,doc.name,dict(status='Cancelled',payload_cipher=''))
    return dict(cancelled=True)


@transactional_retry
def expire_pending(batch_size=100):
    """Bounded server-only cleanup; never decrypt or execute business commands.

    The caller owns commit/rollback (scheduler job or bench). Row-only locks
    cannot invert the company -> request -> recovery order of execution. After
    waiting, recheck the deadline/status with a current locking read. Preserve
    tombstones and business receipts so the original ID can never be reused.
    This runs even when candidate mode is disabled or an actor loses access.
    """
    if frappe.session.user!='Administrator':
        frappe.throw(_('Candidate recovery cleanup requires server administration.'),frappe.PermissionError)
    if isinstance(batch_size,bool) or not isinstance(batch_size,int) or not 1<=batch_size<=500:
        frappe.throw(_('Cleanup batch size must be an integer from 1 to 500.'))
    candidates=frappe.db.sql("""SELECT name FROM `tabKandil Candidate Recovery`
        WHERE status IN ('Pending','Completed')
        AND COALESCE(expires_at, DATE_ADD(creation, INTERVAL 168 HOUR)) <= %s
        ORDER BY creation, name LIMIT %s""",(now_datetime(),batch_size),as_dict=True)
    expired=0
    for row in candidates:
        doc=frappe.get_doc(DT,row.name,for_update=True)
        if doc.status not in ('Pending','Completed') or deadline(doc)>now_datetime():continue
        frappe.db.set_value(DT,doc.name,dict(status='Expired',payload_cipher=''))
        expired+=1
    # Counts only: never log payloads, actor identities, request IDs or keys.
    return dict(examined=len(candidates),expired=expired,batch_size=batch_size)
