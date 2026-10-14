"""Versioned agency terms and application-bound ownership evidence.

Records describe reviewed terms; no contracts are signed or payments made.
Company locks serialize the catalogue and all intake ownership checks.
"""
import json,re,uuid,hashlib
from decimal import Decimal,InvalidOperation
from datetime import timedelta
import frappe
from frappe import _
from frappe.model.document import Document
from kandil_hr.candidates.intake import text
from kandil_hr.foundation.clock import now_cairo
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.sourcing import sources

DT='Kandil Agency Revision'
SUBMISSION='Kandil Agency Submission'
FEES=('NONE','FIXED','MONTHS_SALARY','PERCENT_ANNUAL')
FIELDS={'label_ar','label_en','contact_name','phone','email','fee_type','fee_value','currency','guarantee_days','replacement_terms','ownership_days','contract_url','notes','active'}
PRIVATE={'contact_name','phone','email','contract_url','notes'}

class KandilAgencyRevision(Document):
    def autoname(self):self.name='KAR-'+self.command_key
    def validate(self):
        sources.guard()
        if not self.is_new() or not frappe.flags.get('kandil_source_effect'):frappe.throw(_('Agency revisions are immutable.'),frappe.PermissionError)
    def on_trash(self):frappe.throw(_('Agency evidence cannot be deleted or renamed.'),frappe.PermissionError)
    def before_rename(self,*args,**kwargs):self.on_trash()

class KandilAgencySubmission(KandilAgencyRevision):
    def autoname(self):self.name='KASB-'+sources.digest([self.application])


def state(company,current=False):
    rows=frappe.db.sql('SELECT name,sequence,items_json,after_hash FROM `tabKandil Agency Revision` WHERE company=%s ORDER BY sequence DESC LIMIT 1'+(' FOR UPDATE' if current else ''),(company,),as_dict=True)
    if rows:
        r=rows[0];return dict(version=r.name,sequence=r.sequence,items=json.loads(r.items_json),hash=r.after_hash)
    return dict(version='EMPTY:'+sources.digest([]),sequence=0,items=[],hash=sources.digest([]))


def public(item):return {k:v for k,v in item.items() if k not in PRIVATE}


def normalize(value):
    if isinstance(value,str):
        if len(value)>9000:frappe.throw(_('Agency data is too large.'))
        value=frappe.parse_json(value)
    if not isinstance(value,dict) or set(value)!=FIELDS:frappe.throw(_('Agency fields are invalid.'))
    d=dict(value)
    for key,limit in [('label_ar',160),('label_en',160),('contact_name',140),('phone',40),('email',140),('replacement_terms',1000),('contract_url',500),('notes',2000)]:d[key]=text(d[key],limit,key in ('label_ar','label_en'))
    if min(len(d['label_ar']),len(d['label_en']))<2:frappe.throw(_('Provide both agency names.'))
    if d['email'] and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',d['email']):frappe.throw(_('Provide a valid contact email.'))
    if d['contract_url']:
        from urllib.parse import urlsplit
        u=urlsplit(d['contract_url'])
        if u.scheme!='https' or not u.hostname or u.username or u.password:frappe.throw(_('Use an HTTPS contract reference without embedded credentials.'))
    if type(d['active']) is not bool:frappe.throw(_('Choose agency active status.'))
    for key in ('ownership_days','guarantee_days'):
        if type(d[key]) is not int or not 0<=d[key]<=9999:frappe.throw(_('Agency days must be whole numbers from 0 to 9999.'))
    if d['fee_type'] not in FEES:frappe.throw(_('Choose a valid fee basis.'))
    if not isinstance(d['currency'],str) or not re.fullmatch(r'[A-Z]{3}',d['currency']):frappe.throw(_('Enter a three-letter currency code.'))
    amount=text(d['fee_value'],20)
    if not re.fullmatch(r'\d{1,12}(\.\d{1,2})?',amount):frappe.throw(_('Fee value must be a non-negative decimal with at most two decimal places.'))
    number=Decimal(amount)
    if d['fee_type']=='PERCENT_ANNUAL' and number>100:frappe.throw(_('Percentage cannot exceed 100.'))
    if d['fee_type']=='NONE' and number!=0:frappe.throw(_('No fee requires a zero value.'))
    d['fee_value']=format(number.quantize(Decimal('.01')),'f')
    return d


@frappe.whitelist(methods=['GET'])
def listing(company):
    company=text(company,140);sources.authorize(company);s=state(company);edit=sources.can_edit(company)
    return dict(company=company,version=s['version'],can_edit=edit,items=[r if edit else public(r) for r in s['items']],fee_types=FEES)


@frappe.whitelist(methods=['GET'])
def options(company):
    company=text(company,140);sources.authorize(company);s=state(company)
    return dict(version=s['version'],items=[public(r) for r in s['items'] if r['active']])


@frappe.whitelist(methods=['POST'])
@transactional_retry
def save(company,version,code,values,reason,command_id,is_new=False):
    company=text(company,140);version=text(version,140);code=text(code,30);reason=text(reason,1000);command_id=text(command_id,100)
    if len(reason)<3 or type(is_new) is not bool or not re.fullmatch(r'[A-Z][A-Z0-9_]{0,29}',code):frappe.throw(_('Review the agency code and change reason.'))
    item=normalize(values);sources.authorize(company,write=True)
    key=sources.digest([company,frappe.session.user,command_id]);signature=sources.digest([version,code,item,reason,is_new])
    old=frappe.db.get_value(DT,{'command_key':key},['name','signature'],as_dict=True,for_update=True)
    if old:
        if old.signature!=signature:frappe.throw(_('This command ID has different values.'))
        return dict(company=company,version=old.name,code=code)
    before=state(company,True)
    if before['version']!=version:frappe.throw(_('Agency terms changed. Refresh and review them.'),frappe.TimestampMismatchError)
    existing=next((r for r in before['items'] if r['code']==code),None)
    if is_new and (existing or len(before['items'])>=250 or not item['active']):frappe.throw(_('New agencies require a unique code, active status and room in the 250-agency catalogue.'))
    if not is_new and not existing:frappe.throw(_('Agency no longer exists.'))
    item=dict(item,code=code);others=[r for r in before['items'] if r['code']!=code]
    if existing==item:frappe.throw(_('No agency changes to save.'))
    if any(sources.normalized_label(r['label_ar'])==sources.normalized_label(item['label_ar']) for r in others):frappe.throw(_('An agency with this Arabic name already exists.'))
    items=others+[item];point='agency_'+uuid.uuid4().hex;frappe.db.savepoint(point)
    try:
        with sources.effect():
            row=frappe.get_doc(dict(doctype=DT,company=company,sequence=before['sequence']+1,previous_revision=before['version'],before_hash=before['hash'],after_hash=sources.digest(items),items_json=json.dumps(items,ensure_ascii=False),actor=frappe.session.user,reason=reason,command_key=key,signature=signature,changed_code=code)).insert(ignore_permissions=True)
        return dict(company=company,version=row.name,code=code)
    except frappe.QueryDeadlockError:raise
    except Exception:
        frappe.db.rollback(save_point=point);frappe.local.document_cache={};raise


@frappe.whitelist(methods=['GET'])
def history(company,start=0,page_length=10):
    from kandil_hr.portal.organization import paging
    from kandil_hr.recruitment.vacancy_access import identity_labels
    company=text(company,140);sources.authorize(company)
    if not sources.can_edit(company):frappe.throw(_('Agency revisions require company HR authority.'),frappe.PermissionError)
    offset,limit=paging(start,page_length);rows=frappe.get_all(DT,filters={'company':company},fields=['name','sequence','actor','reason','creation','changed_code'],order_by='sequence desc',start=offset,page_length=limit+1);more=len(rows)>limit;rows=rows[:limit];labels=identity_labels([r.actor for r in rows])
    for r in rows:r['actor_label']=labels.get(r.pop('actor'))
    return dict(rows=rows,has_more=more,start=offset)


def selected(company,agency):
    if not sources.enabled():frappe.throw(_('Controlled sources are required for agency intake.'),frappe.PermissionError)
    if not isinstance(agency,dict) or set(agency)!={'code','version'}:frappe.throw(_('Review the agency and its exact terms revision.'))
    code=text(agency['code'],30);version=text(agency['version'],140);s=state(company,True)
    if version!=s['version']:frappe.throw(_('Agency terms changed. Refresh and review them.'),frappe.TimestampMismatchError)
    item=next((r for r in s['items'] if r['code']==code and r['active']),None)
    if not item:frappe.throw(_('Choose an active agency.'))
    return dict(version=s['version'],terms=public(item))


def claims(company,person):
    return frappe.db.sql('SELECT agency_code,ownership_until FROM `tabKandil Agency Submission` WHERE company=%s AND person=%s AND ownership_until>=%s ORDER BY ownership_until DESC FOR UPDATE',(company,person,now_cairo().date()),as_dict=True)


def require_ownership(company,person,code):
    if any(r.agency_code!=code for r in claims(company,person)):
        # Do not disclose hidden applications, dates or another team's agency.
        frappe.throw(_('An active agency ownership claim needs HR review before another agency can submit this person.'),frappe.PermissionError)


def capture(app,company,selection):
    start=now_cairo().date();end=start+timedelta(days=selection['terms']['ownership_days'])
    values=dict(company=company,application=app.name,person=app.custom_kandil_person,agency_code=selection['terms']['code'],agency_version=selection['version'],terms_json=json.dumps(selection['terms'],ensure_ascii=False),ownership_from=str(start),ownership_until=str(end))
    with sources.effect():return frappe.get_doc(dict(doctype=SUBMISSION,**values,content_hash=sources.digest(values))).insert(ignore_permissions=True)


@frappe.whitelist(methods=['GET'])
def application(name):
    from kandil_hr.privacy.consent import authorize
    request,opening,app,person=authorize(name)
    row=frappe.db.get_value(SUBMISSION,{'application':app.name},['terms_json','ownership_from','ownership_until'],as_dict=True,for_update=True)
    active=claims(request.company,person.name)
    return dict(submission=dict(terms=json.loads(row.terms_json),ownership_from=str(row.ownership_from),ownership_until=str(row.ownership_until),active=str(row.ownership_until)>=str(now_cairo().date())) if row else None,review_required=bool(active and not row),policy='Recorded terms only; no payment or contract acceptance.')


def schema_proof():
    from kandil_hr.sourcing.attribution import schema_proof as existing
    p=existing()
    for dt in (DT,SUBMISSION):
        if not frappe.db.table_exists(dt):p['tables'][dt]=None
        else:
            rows=frappe.get_all(dt,fields=['*'],order_by='name asc',limit_page_length=0);p['tables'][dt]=dict(count=len(rows),sha256=hashlib.sha256(json.dumps(rows,sort_keys=True,default=str).encode()).hexdigest())
    return p
