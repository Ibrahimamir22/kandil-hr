"""Purpose-specific, immutable recruiter-recorded talent-pool consent.

This records the person's reported choice, not independent identity verification.
No grant is inferred from APPLY consent. Expiry is checked at use time. Pool search,
matching and automated removal are separate consumers of eligibility().
"""
from contextlib import contextmanager
import json
import uuid
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_months, getdate, today
from kandil_hr.candidates import identity
from kandil_hr.candidates.intake import text
from kandil_hr.privacy import consent, pool_policy
from kandil_hr.catalogs.api import digest
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.portal.organization import paging

DT='Kandil Pool Consent Event'
CHANNELS={'PHONE','EMAIL','WHATSAPP','IN_PERSON','PAPER'}

@contextmanager
def effect():
    old=frappe.flags.get('kandil_pool_consent_effect');frappe.flags.kandil_pool_consent_effect=True
    try:yield
    finally:frappe.flags.kandil_pool_consent_effect=old

class KandilPoolConsentEvent(Document):
    def autoname(self):self.name='KPC-'+uuid.uuid4().hex
    def validate(self):
        identity.guard()
        if not self.is_new() or not frappe.flags.get('kandil_pool_consent_effect'):self.on_trash()
    def on_trash(self):frappe.throw(_('Pool consent history is immutable. Use the reviewed action.'),frappe.PermissionError)
    def before_rename(self,*args,**kwargs):self.on_trash()

def latest(company,person):
    rows=frappe.db.sql('SELECT name FROM `tabKandil Pool Consent Event` WHERE company=%s AND person=%s ORDER BY sequence DESC LIMIT 1 FOR UPDATE',(company,person))
    return frappe.get_doc(DT,rows[0][0],for_update=True) if rows else None

def eligibility(company,person):
    """Internal caller must hold Company lock; no public or guessed-person API."""
    current=latest(company,person)
    state='none' if not current else 'withdrawn' if current.decision=='WITHDRAW' else 'active' if getdate(current.valid_until)>=getdate(today()) else 'expired'
    return current,state

def receipt(row):
    return dict(event=row.name,sequence=row.sequence,decision=row.decision,valid_until=str(row.valid_until) if row.valid_until else None,evidence_kind='Recruiter record',application_consent_changed=False,sent=False)

@frappe.whitelist(methods=['GET'])
def context(application):
    if not identity.enabled():return dict(enabled=False)
    request,opening,app,person=consent.authorize(application)
    row,state=eligibility(request.company,person.name)
    policy=pool_policy.published(request.company,current=True)
    return dict(enabled=True,state=state,expected_event=row.name if row else '',policy=policy,
        grant_until=str(add_months(getdate(today()),policy['notice']['months'])) if policy else None,
        valid_until=str(row.valid_until) if row and row.valid_until else None,
        can_grant=bool(policy and state!='active'),can_withdraw=state!='withdrawn',
        evidence_kind='Recruiter record' if row else None)

@frappe.whitelist(methods=['POST'])
@transactional_retry
def record(application,expected_event,decision,policy_revision,expected_until,channel,evidence_note,confirmed,command_id):
    application=text(application,140);expected_event=text(expected_event,140,False)
    policy_revision=text(policy_revision,140,False);expected_until=text(expected_until,10,False)
    decision=text(decision,10);channel=text(channel,20);evidence_note=text(evidence_note,1000);command_id=text(command_id,100)
    if decision not in ('GRANT','WITHDRAW') or channel not in CHANNELS or confirmed is not True or len(evidence_note)<3:
        frappe.throw(_('Review the candidate choice, channel and evidence before recording pool consent.'))
    request,opening,app,person=consent.authorize(application)
    key=digest([request.company,frappe.session.user,command_id])
    signature=digest([application,expected_event,decision,policy_revision,expected_until,channel,evidence_note,confirmed])
    prior=frappe.db.get_value(DT,{'command_key':key},['name','signature'],as_dict=True,for_update=True)
    if prior:
        if prior.signature!=signature:frappe.throw(_('This command was already used with different pool-consent details.'))
        return receipt(frappe.get_doc(DT,prior.name,for_update=True))
    current,state=eligibility(request.company,person.name)
    if expected_event!=(current.name if current else ''):
        frappe.throw(_('Pool consent changed. Refresh and review the latest choice.'),frappe.TimestampMismatchError)
    policy=None;until=None
    if decision=='GRANT':
        policy=pool_policy.published(request.company,current=True)
        if not policy or policy['version']!=policy_revision:
            frappe.throw(_('Review the current published pool policy.'),frappe.TimestampMismatchError)
        until=str(add_months(getdate(today()),policy['notice']['months']))
        if expected_until!=until:frappe.throw(_('The consent expiry changed. Review the date again.'),frappe.TimestampMismatchError)
        if state=='active':frappe.throw(_('Current pool consent is still active.'))
    else:
        if policy_revision or expected_until:frappe.throw(_('Withdrawal must not include a new policy or expiry.'))
        if state=='withdrawn':frappe.throw(_('Pool consent is already withdrawn.'))
    with consent.atomic(),effect():
        values=dict(company=request.company,person=person.name,application=app.name,actor=frappe.session.user,
            sequence=current.sequence+1 if current else 1,previous_event=current.name if current else '',decision=decision,
            policy_revision=policy['version'] if policy else '',policy_hash=policy['content_hash'] if policy else '',
            valid_until=until,channel=channel,evidence_note=evidence_note,evidence_kind='Recruiter record')
        row=frappe.get_doc(dict(doctype=DT,**values,command_key=key,signature=signature,content_hash=digest(values))).insert(ignore_permissions=True)
        return receipt(row)

@frappe.whitelist(methods=['GET'])
def history(application,start=0,page_length=5):
    request,opening,app,person=consent.authorize(application)
    offset,limit=paging(start,page_length)
    rows=frappe.db.sql('''SELECT name,sequence,decision,valid_until,channel,evidence_note,evidence_kind,actor,creation,policy_revision
        FROM `tabKandil Pool Consent Event` WHERE company=%s AND person=%s
        ORDER BY sequence DESC LIMIT %s OFFSET %s FOR UPDATE''',(request.company,person.name,limit+1,offset),as_dict=True)
    more=len(rows)>limit;rows=rows[:limit]
    from kandil_hr.recruitment.vacancy_access import identity_labels
    labels=identity_labels([r.actor for r in rows])
    for row in rows:
        row['actor_label']=labels.get(row.pop('actor'));row.pop('name')
    return dict(rows=rows,start=offset,has_more=more)

def schema_proof():
    import hashlib
    from kandil_hr.candidates.stages import schema_proof as prior
    proof=prior()
    for dt in (pool_policy.DT,DT):
        if not frappe.db.table_exists(dt):proof['tables'][dt]=None
        else:
            rows=frappe.get_all(dt,fields=['*'],order_by='name asc',limit_page_length=0)
            proof['tables'][dt]=dict(count=len(rows),sha256=hashlib.sha256(json.dumps(rows,sort_keys=True,default=str).encode()).hexdigest())
    return proof
