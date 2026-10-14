"""Append-only internal candidate activities and separately recorded voids.

No messages are sent. Current native candidate access is checked on every read
and replay. Generic request audits carry content hashes, never activity notes.
"""
from contextlib import contextmanager
from copy import deepcopy
import hashlib
import json
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


def validate_entry(kind,outcome,note):
    if not isinstance(kind,str) or not isinstance(outcome,str) or kind not in TYPES or (outcome and outcome not in OUTCOMES):
        frappe.throw(_('Choose a valid activity type and call outcome.'))
    if kind=='CALL' and not outcome:frappe.throw(_('Choose the call outcome.'))
    if kind!='CALL' and outcome:frappe.throw(_('Call outcomes apply only to calls.'))
    note=text(note,2000,False)
    if kind in ('MEETING','NOTE') and len(note)<3:frappe.throw(_('Describe the discussion or note.'))
    return note


def authorize(request,payload):
    app=work.authorize(request,payload)
    if payload.get('activity'):
        event=frappe.get_doc(DT,payload['activity'],for_update=True)
        if event.application!=app.name or event.company!=request.company:
            frappe.throw(_('Activity is outside this application.'),frappe.PermissionError)
    return app


def can_void(event,request):
    return event.kind in TYPES and (frappe.session.user in ('Administrator',event.actor)
        or frappe.session.user==frappe.db.get_value('Kandil Organization Settings',request.company,'hr_approver'))


def append(app,request,kind,outcome,note,voids=None):
    values=dict(application=app.name,person=app.custom_kandil_person or None,company=request.company,
        actor=frappe.session.user,recorded_at=now_cairo().isoformat(),kind=kind,outcome=outcome,note=note,voids=voids)
    with effect():
        return frappe.get_doc(dict(doctype=DT,**values,content_hash=digest(values))).insert(ignore_permissions=True)


def reviewed(app,version):
    try:
        matches=bool(version) and get_datetime(app.modified)==get_datetime(version)
    except (ValueError,TypeError,OverflowError):
        matches=False
    if not matches:
        frappe.throw(_('Application changed. Refresh it before recording this action.'),frappe.TimestampMismatchError)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def record(name,opening_name,application,application_version,kind,outcome,note,command_id,expected_version):
    identity.guard();note=validate_entry(kind,outcome,note)
    payload=dict(opening=text(opening_name,140),application=text(application,140),application_version=text(application_version,140),
        kind=kind,outcome=outcome,note_hash=digest(note))
    def act(request):
        app=authorize(request,payload);reviewed(app,application_version)
        event=append(app,request,kind,outcome,note)
        return dict(application=app.name,application_version=str(app.modified),activity=event.name,kind=kind,voided=False)
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
        event.actor,event.recorded_at,cancel.name.as_('void_activity'),cancel.actor.as_('void_actor'),cancel.note.as_('void_reason'),cancel.recorded_at.as_('void_at'))
        .orderby(event.creation,order=Order.desc).orderby(event.name,order=Order.desc).limit(limit).offset(offset).run(as_dict=True))
    labels=identity_labels([row.get(k) for row in rows for k in ('actor','void_actor')])
    for row in rows:
        row['can_void']=bool(can_record and row.application==app.name and not row.void_activity and can_void(row,request))
        row['actor_label']=labels.get(row.pop('actor'));row['void_actor_label']=labels.get(row.pop('void_actor'))
        row['other_application']=row.application!=app.name
    return dict(application=app.name,application_version=str(app.modified),request=request.name,opening=app.job_title,
        expected_version=str(request.modified),can_record=can_record,types=TYPES,outcomes=OUTCOMES,
        rows=rows,total=total,start=offset,has_more=offset+limit<total)
