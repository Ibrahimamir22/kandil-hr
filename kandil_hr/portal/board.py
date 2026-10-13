"""Board decision UI over frozen native authority and private File permissions."""
import base64
import binascii
import hashlib
import json
import re
from pathlib import PurePath

import frappe
from frappe import _
from frappe.utils import get_datetime

from kandil_hr.foundation.mutation_access import assert_current_request_scope
from kandil_hr.foundation.security import request_scope
from kandil_hr.pilot.api import transactional_retry, transition
from kandil_hr.portal.api import authenticated, read_request
from kandil_hr.portal.delegations import identifier, metadata
from kandil_hr.portal.organization import page, paging
from kandil_hr.recruitment import api as commands, authority

MAX_BYTES=10*1024*1024
DT='Kandil Hiring Request'


def active_step(doc):
    step=next((s for s in doc.approval_steps if s.decision=='Pending'),None)
    return step if doc.status=='Pending' and step and step.authority=='Board Approval' else None


def capabilities(doc):
    step=active_step(doc)
    if not step:return dict(direct=False,record=False,upload=False,members=[])
    policy=frappe.parse_json(doc.route_snapshot or '{}').get('policy',{})
    interests=authority.interested_users(doc);user=frappe.session.user
    members=[u for u in (step.principal,policy.get('board_vice_approver')) if u and u not in interests
        and frappe.db.get_value('User',u,'enabled') and 'Kandil Board Approver' in frappe.get_roles(u)
        and request_scope(doc,u,'manage')]
    manage=user not in interests and request_scope(doc,user,'manage')
    direct=bool(manage and user in members)
    record=bool(manage and user==policy.get('exception_approver') and 'Kandil Sector Approver' in frappe.get_roles(user) and members)
    return dict(direct=direct,record=record,upload=bool((direct or record) and doc.has_permission('write')),
                members=[dict(id=u,position='Chairman' if u==step.principal else 'Vice') for u in members])


def file_record(doc, name, locked=False):
    file=frappe.get_doc('File',identifier(name),for_update=locked)
    if not file.is_private or file.is_folder or file.is_remote_file or not (file.file_url or '').startswith('/private/files/') or file.attached_to_doctype!=doc.doctype or file.attached_to_name!=doc.name:
        frappe.throw(_('Board proof must be private and attached to this request.'),frappe.PermissionError)
    file.check_permission('read')
    return dict(name=file.name,label=file.file_name,url=file.file_url,size=file.file_size)


@frappe.whitelist(methods=['GET'])
def context(name):
    authenticated();doc=read_request(identifier(name));step=active_step(doc)
    history=[]
    for s in doc.approval_steps:
        if s.authority!='Board Approval' or s.decision=='Pending':continue
        proof=None
        if s.board_evidence:
            try:proof=file_record(doc,s.board_evidence)
            except (frappe.PermissionError,frappe.DoesNotExistError):frappe.clear_messages()
        history.append(dict(step_id=s.step_key,decision=s.decision,actor=s.actor,member=s.get('board_member'),
            method=s.get('on_behalf_method'),note=s.get('on_behalf_note'),comment=s.comment,decided_at=s.decided_at,
            evidence=proof,evidence_unavailable=bool(s.board_evidence and not proof)))
    return dict(active=bool(step),step_id=step.step_key if step else None,expected_version=str(doc.modified),
        actions=capabilities(doc),methods=list(authority.BOARD_METHODS),max_bytes=MAX_BYTES,history=history)


@frappe.whitelist(methods=['GET'])
def proof(name,evidence):
    authenticated();doc=read_request(identifier(name))
    return file_record(doc,evidence)


@frappe.whitelist(methods=['GET'])
def files(name,start=0,page_length=20):
    authenticated();doc=read_request(identifier(name));start,limit=paging(start,page_length)
    # A request reader may see its permitted attachments; upload/recording
    # authority is independent. Native File scope/owner checks still apply.
    rows=frappe.get_list('File',filters={'attached_to_doctype':DT,'attached_to_name':doc.name,'is_private':1,'is_folder':0},
        fields=['name','file_name','file_url','file_size'],order_by='creation desc,name',start=start,page_length=limit+1)
    result=[]
    for row in rows[:limit]:
        try:result.append(file_record(doc,row.name))
        except (frappe.PermissionError,frappe.DoesNotExistError):frappe.clear_messages()
    return dict(page(result,start,limit),has_more=len(rows)>limit,count_scope='candidate_page')


@frappe.whitelist(methods=['POST'])
def decide(name,decision,step_id,expected_version,command_id,comment='',board_evidence=None,
           board_member=None,on_behalf_method=None,on_behalf_note=None):
    authenticated();identifier(name);identifier(step_id);metadata(command_id,expected_version)
    if expected_version is None:frappe.throw(_('A valid reviewed record version is required.'))
    if not isinstance(decision,str) or decision not in ('Approve','Reject','Return'):
        frappe.throw(_('Choose Approve, Reject or Return.'))
    for value,limit in ((comment,2000),(on_behalf_note,2000),(on_behalf_method,20),(board_member,140),(board_evidence,140)):
        if value is not None and (not isinstance(value,str) or len(value)>limit):
            frappe.throw(_('Board decision fields exceed the supported text limits.'))
    if not isinstance(comment,str):frappe.throw(_('Enter a valid decision comment.'))
    doc=read_request(name)
    # Identify the reviewed Board step even on exact receipt retry after success.
    # Current authority/version/receipt semantics remain native command rules.
    seen=any(s.step_key==step_id and s.authority=='Board Approval' for s in doc.approval_steps)
    if not seen:
        key=hashlib.sha256(f'{frappe.session.user}|{name}|{command_id}'.encode()).hexdigest()
        prior=frappe.db.get_value('Kandil Command Receipt',key,'result_json')
        seen=bool(prior and any(s.get('step_key')==step_id and s.get('authority')=='Board Approval'
                               for s in json.loads(prior).get('approval_steps',[])))
    if not seen:frappe.throw(_('Choose a Board approval step for this action.'))
    result=commands.decide(name,decision,step_id,command_id,expected_version,comment,
        board_evidence=board_evidence,board_member=board_member,on_behalf_method=on_behalf_method,on_behalf_note=on_behalf_note)
    return dict(name=result['name'],operation='decide')


def upload_bytes(filename,content):
    if not isinstance(filename,str) or not 1<=len(filename)<=160 or '/' in filename or '\\' in filename or any(ord(c)<32 for c in filename):
        frappe.throw(_('Choose a simple evidence filename of up to 160 characters.'))
    if not isinstance(content,str) or len(content)>((MAX_BYTES+2)//3)*4:
        frappe.throw(_('Evidence must be a file of at most 10 MB.'))
    try: raw=base64.b64decode(content,validate=True)
    except (ValueError,binascii.Error):frappe.throw(_('Evidence content must be valid base64.'))
    if not raw or len(raw)>MAX_BYTES:frappe.throw(_('Evidence must be a file of at most 10 MB.'))
    suffix=PurePath(filename).suffix.lower()
    valid=(suffix=='.pdf' and raw.startswith(b'%PDF-')) or (suffix=='.png' and raw.startswith(b'\x89PNG\r\n\x1a\n')) or (suffix in ('.jpg','.jpeg') and raw.startswith(b'\xff\xd8\xff'))
    if suffix=='.txt':
        try: text=raw.decode('utf-8');valid='\x00' not in text and not re.search(r'<\s*(?:script|html|svg|iframe)\b',text,re.I)
        except UnicodeDecodeError:valid=False
    if not valid:frappe.throw(_('Upload a PDF, PNG, JPEG or UTF-8 text file matching its extension.'))
    return raw


@frappe.whitelist(methods=['POST'])
@transactional_retry
def upload(name,filename,content,expected_version,command_id):
    authenticated();identifier(name);metadata(command_id,expected_version)
    if expected_version is None:frappe.throw(_('A valid reviewed record version is required.'))
    raw=upload_bytes(filename,content)
    company=frappe.db.get_value(DT,name,'company')
    frappe.db.sql('SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE',(company,))
    doc=read_request(name,for_update=True)
    if doc.requested_position:frappe.db.sql('SELECT name FROM `tabKandil Position` WHERE name=%s FOR UPDATE',(doc.requested_position,))
    for capacity in sorted({s.capacity for s in doc.lines}):
        frappe.db.sql('SELECT name FROM `tabKandil Capacity` WHERE name=%s FOR UPDATE',(capacity,))
    users={frappe.session.user,doc.requested_by}|{s.principal for s in doc.approval_steps if s.principal}|{s.get('board_vice') for s in doc.approval_steps if s.get('board_vice')}
    for user in sorted(users):frappe.db.sql('SELECT name FROM `tabUser` WHERE name=%s FOR UPDATE',(user,))
    assert_current_request_scope(doc,required_roles=('Kandil Sector Approver','Kandil Board Approver'))
    doc.check_permission('write')
    key=hashlib.sha256(f'board-upload|{frappe.session.user}|{name}|{command_id}'.encode()).hexdigest()
    fingerprint=hashlib.sha256(frappe.as_json([filename,hashlib.sha256(raw).hexdigest(),expected_version]).encode()).hexdigest()
    receipts=frappe.db.sql('SELECT payload_hash,result_json FROM `tabKandil Command Receipt` WHERE name=%s FOR UPDATE',(key,),as_dict=True)
    if receipts:
        if receipts[0].payload_hash!=fingerprint:frappe.throw(_('Command ID was already used with different data.'))
        # The receipt is a current/locking read. Use the same visibility for
        # its File: another request may have inserted it after this HTTP
        # transaction's initial Company lookup established a snapshot.
        result=json.loads(receipts[0].result_json);file_record(doc,result['file'],locked=True);return result
    if get_datetime(doc.modified)!=get_datetime(expected_version):
        frappe.throw(_('This request changed. Reload before uploading evidence.'),frappe.TimestampMismatchError)
    if not capabilities(doc)['upload']:frappe.throw(_('You cannot upload evidence for the current Board step.'),frappe.PermissionError)
    proof=frappe.get_doc(dict(doctype='File',file_name=filename,is_private=1,attached_to_doctype=DT,attached_to_name=name,content=raw)).insert()
    result=dict(file=proof.name,name=name)
    with transition():
        frappe.get_doc(dict(doctype='Kandil Command Receipt',dedupe_key=key,actor=frappe.session.user,payload_hash=fingerprint,result_json=frappe.as_json(result))).insert(ignore_permissions=True)
    return result
