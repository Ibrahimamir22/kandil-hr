"""Append-only internal candidate activities and separately recorded voids.

No messages are sent. Current native candidate access is checked on every read
and replay. Generic request audits carry content hashes, never activity notes.
"""
from contextlib import contextmanager
from copy import deepcopy
import hashlib
import json
import re
import uuid

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.query_builder.functions import Count
from frappe.utils import get_datetime
from pypika import Order

from kandil_hr.candidates import identity, work
from kandil_hr.candidates.intake import text
from kandil_hr.foundation.clock import now_cairo
from kandil_hr.foundation.security import request_scope
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.recruitment.api import command
from kandil_hr.recruitment.vacancy_access import identity_labels

DT = 'Kandil Candidate Activity'
TYPES = ('CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'NOTE')
OUTCOMES = ('REACHED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALL_BACK')


@contextmanager
def effect():
    old=frappe.flags.get('kandil_candidate_activity_effect')
    frappe.flags.kandil_candidate_activity_effect=True
    try:yield
    finally:frappe.flags.kandil_candidate_activity_effect=old


class KandilCandidateActivity(Document):
    def autoname(self):self.name='KAC-'+uuid.uuid4().hex

    def validate(self):
        identity.guard()
        if not self.is_new() or not frappe.flags.get('kandil_candidate_activity_effect'):
            frappe.throw(_('Use candidate activity commands; recorded entries cannot be edited.'),frappe.PermissionError)

    def on_trash(self):frappe.throw(_('Activity history cannot be deleted.'),frappe.PermissionError)
    def before_rename(self,*args,**kwargs):self.on_trash()


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,default=str).encode()).hexdigest()


def validate_entry(kind,outcome,note,definition=None):
    if not isinstance(kind,str) or not isinstance(outcome,str) or not re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}',kind) or kind in ('SYSTEM','STAGE','VOID','MESSAGE') or (outcome and outcome not in OUTCOMES):
        frappe.throw(_('Choose a valid activity type and call outcome.'))
    if kind=='CALL' and not outcome:frappe.throw(_('Choose the call outcome.'))
    if kind!='CALL' and outcome:frappe.throw(_('Call outcomes apply only to calls.'))
    note=text(note,2000,False)
    if (definition['requires_note'] if definition is not None else kind in ('MEETING','NOTE')) and len(note)<3:frappe.throw(_('Describe the discussion or note.'))
    return note


def authorize(request,payload):
    app=work.authorize(request,payload)
    if payload.get('activity'):
        event=frappe.get_doc(DT,payload['activity'],for_update=True)
        if event.application!=app.name or event.company!=request.company:
            frappe.throw(_('Activity is outside this application.'),frappe.PermissionError)
    return app


def can_void(event,request):
    return event.kind not in ('SYSTEM','STAGE','VOID','MESSAGE') and (frappe.session.user in ('Administrator',event.actor)
        or frappe.session.user==frappe.db.get_value('Kandil Organization Settings',request.company,'hr_approver'))


def append(app,request,kind,outcome,note,voids=None,stage=None,labels=None):
    values=dict(application=app.name,person=app.custom_kandil_person or None,company=request.company,
        actor=frappe.session.user,recorded_at=now_cairo().isoformat(),kind=kind,outcome=outcome,note=note,voids=voids)
    if stage:values.update(stage)
    if labels:values.update(labels)
    with effect():
        return frappe.get_doc(dict(doctype=DT,**values,content_hash=digest(values))).insert(ignore_permissions=True)


def reviewed(app,version):
    try:
        matches=bool(version) and get_datetime(app.modified)==get_datetime(version)
    except (ValueError,TypeError,OverflowError):
        matches=False
    if not matches:
        frappe.throw(_('Application changed. Refresh it before recording this action.'),frappe.TimestampMismatchError)


def transition_input(move_to_contacted=False,next_action=None):
    from kandil_hr.recruitment import ownership
    if not isinstance(move_to_contacted,bool):frappe.throw(_('Choose whether to mark this contact.'))
    if next_action is None:return move_to_contacted,None
    if not isinstance(next_action,dict) or next_action.get('mode') not in ('set','clear'):
        frappe.throw(_('Choose a valid follow-up change.'))
    if next_action['mode']=='clear':
        if set(next_action)!={'mode'}:frappe.throw(_('Clearing a follow-up must not include replacement values.'))
        return move_to_contacted,dict(mode='clear')
    if set(next_action)!={'mode','task','due','owner'}:frappe.throw(_('Provide the follow-up, date and responsible recruiter.'))
    task=text(next_action['task'],1000);due=ownership.validate_followup_values(task,next_action['due'])
    return move_to_contacted,dict(mode='set',task=task,due=due,owner=text(next_action['owner'],140))


@frappe.whitelist(methods=['POST'])
@transactional_retry
def record(name,opening_name,application,application_version,kind,outcome,note,command_id,expected_version,
           move_to_contacted=False,next_action=None,catalog_version=None):
    identity.guard();note=text(note,2000,False);validate_entry(kind,outcome,note,definition={'requires_note':False})
    if catalog_version is not None:catalog_version=text(catalog_version,140)
    move,next_action=transition_input(move_to_contacted,next_action)
    payload=dict(opening=text(opening_name,140),application=text(application,140),application_version=text(application_version,140),
        kind=kind,outcome=outcome,note_hash=digest(note))
    # Preserve the signature of previously saved plain-activity receipts.
    if move or next_action is not None:payload.update(move_to_contacted=move,next_action_hash=digest(next_action))
    if catalog_version is not None:payload['catalog_version']=catalog_version
    def act(request):
        from kandil_hr.recruitment import ownership
        app=authorize(request,payload);reviewed(app,application_version)
        from kandil_hr.catalogs import api as catalog
        configured=catalog.state(request.company,'ACTIVITY_TYPE',current=True)
        if catalog_version is not None and configured['version']!=catalog_version:
            frappe.throw(_('Activity types changed. Refresh and review the activity.'),frappe.TimestampMismatchError)
        definition=next((r for r in configured['items'] if r['code']==kind and r['active']),None)
        if definition is None:frappe.throw(_('This activity type is inactive or unavailable.'))
        validate_entry(kind,outcome,note,definition)
        opening=frappe.get_doc('Job Opening',app.job_title,for_update=True)
        reached=kind!='NOTE' and (kind!='CALL' or outcome in ('REACHED','CALL_BACK'))
        moved=bool(move and reached and app.status=='Open')
        if moved or next_action is not None:ownership.assert_active_application(app,opening,request)
        if next_action is not None:
            ownership.authorize_application(app,opening,request)
            if next_action['mode']=='set':ownership.require_owner(next_action['owner'],opening,request)
        event=append(app,request,kind,outcome,note,labels=dict(kind_label_ar=definition['label_ar'],kind_label_en=definition['label_en'],catalog_version=configured['version']))
        if moved:app.status='Replied'
        if next_action is not None:
            clear=next_action['mode']=='clear'
            # Internal effect under this single command transaction. Never invoke
            # a nested transaction-retry decorator after an activity was written.
            ownership.store(app,app.custom_kandil_responsible_user,'Updated with a recorded candidate activity.',
                'Next action updated',next_owner='' if clear else next_action['owner'],
                task='' if clear else next_action['task'],due=None if clear else next_action['due'])
        stage_event=None
        if moved:
            if next_action is None:app.save(ignore_permissions=True)
            stage_event=append(app,request,'STAGE','','',stage=dict(stage_from='Open',stage_to='Replied',source_activity=event.name))
        return dict(application=app.name,application_version=str(app.modified),activity=event.name,kind=kind,voided=False,
            moved=moved,stage_activity=stage_event.name if stage_event else None,followup_applied=next_action is not None)
    return command(name,'candidate_activity_record',command_id,expected_version,payload,act)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def void(name,opening_name,application,application_version,activity,reason,command_id,expected_version):
    identity.guard();reason=text(reason,1000)
    if len(reason)<3:frappe.throw(_('Give the reason for voiding this entry.'))
    payload=dict(opening=text(opening_name,140),application=text(application,140),application_version=text(application_version,140),
        activity=text(activity,140),reason_hash=digest(reason))
    def act(request):
        app=authorize(request,payload);reviewed(app,application_version)
        original=frappe.get_doc(DT,activity,for_update=True)
        if not can_void(original,request):frappe.throw(_('Only the author or configured HR authority can void a user activity.'),frappe.PermissionError)
        if frappe.db.get_value(DT,{'voids':activity},'name',for_update=True):
            frappe.throw(_('This activity has already been voided. Refresh its history.'))
        event=append(app,request,'VOID','',reason,activity)
        return dict(application=app.name,application_version=str(app.modified),activity=activity,void_activity=event.name,voided=True)
    return command(name,'candidate_activity_void',command_id,expected_version,payload,act)


@frappe.whitelist(methods=['GET'])
def listing(name,start=0,page_length=10):
    from kandil_hr.portal import candidates
    from kandil_hr.portal.organization import bounded_text,paging
    candidates.access();app=candidates.readable_application(bounded_text(name));offset,limit=paging(start,page_length)
    request=frappe.get_doc('Kandil Hiring Request',frappe.db.get_value('Job Opening',app.job_title,'custom_kandil_request'))
    can_record=bool(identity.enabled() and app.has_permission('write') and request_scope(request,frappe.session.user,'manage'))
    readable,a,o,r=candidates.base()
    readable=readable.where(a.custom_kandil_person==app.custom_kandil_person) if app.custom_kandil_person else readable.where(a.name==app.name)
    event=frappe.qb.DocType(DT);cancel=frappe.qb.DocType(DT).as_('activity_void')
    q=frappe.qb.from_(event).where((event.kind!='VOID')&event.application.isin(readable.select(a.name)))
    total=deepcopy(q).select(Count(event.name).as_('total')).run(as_dict=True)[0].total
    rows=(q.left_join(cancel).on(cancel.voids==event.name).select(event.name,event.application,event.kind,event.outcome,event.note,
        event.actor,event.recorded_at,event.stage_from,event.stage_to,event.source_activity,event.kind_label_ar,event.kind_label_en,event.catalog_version,cancel.name.as_('void_activity'),cancel.actor.as_('void_actor'),cancel.note.as_('void_reason'),cancel.recorded_at.as_('void_at'))
        .orderby(event.creation,order=Order.desc).orderby(event.name,order=Order.desc).limit(limit).offset(offset).run(as_dict=True))
    labels=identity_labels([row.get(k) for row in rows for k in ('actor','void_actor')])
    for row in rows:
        row['can_void']=bool(can_record and row.application==app.name and not row.void_activity and can_void(row,request))
        row['actor_label']=labels.get(row.pop('actor'));row['void_actor_label']=labels.get(row.pop('void_actor'))
        row['other_application']=row.application!=app.name
    from kandil_hr.recruitment import ownership
    from kandil_hr.catalogs import api as catalog
    configured=catalog.state(request.company,'ACTIVITY_TYPE')
    definitions=sorted([r for r in configured['items'] if r['active']],key=lambda r:(r['sort_order'],r['code']))
    hints=ownership.actions(app.name)
    can_followup=bool(can_record and hints.get('can_manage'))
    owners=hints.get('owners',[]) if can_followup else []
    next_owner=app.custom_kandil_next_action_owner or app.custom_kandil_responsible_user
    return dict(application=app.name,application_version=str(app.modified),request=request.name,opening=app.job_title,
        expected_version=str(request.modified),can_record=can_record,types=[r['code'] for r in definitions],type_definitions=definitions,catalog_version=configured['version'],outcomes=OUTCOMES,
        status=app.status,can_followup=can_followup,owners=owners,
        next_action=dict(task=app.custom_kandil_next_action or '',due=app.custom_kandil_next_action_due,owner=next_owner if next_owner in {r['user'] for r in owners} else None),
        rows=rows,total=total,start=offset,has_more=offset+limit<total)
