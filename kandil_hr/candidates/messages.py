"""Candidate rejection-message work. Records human reports; never sends messages."""
from contextlib import contextmanager
from copy import deepcopy
import uuid

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.query_builder.functions import Count, Sum
from pypika.terms import Case

from kandil_hr.candidates import activities, closure, identity, work
from kandil_hr.candidates.intake import text
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.recruitment.api import command

DT='Kandil Candidate Message Resolution'
OUTCOMES=('MANUAL_SENT','NOT_NEEDED')
CHANNELS=('WhatsApp','Email','Other')


@contextmanager
def effect():
    before=frappe.flags.get('kandil_candidate_message_effect')
    frappe.flags.kandil_candidate_message_effect=True
    try:yield
    finally:frappe.flags.kandil_candidate_message_effect=before


class KandilCandidateMessageResolution(Document):
    def autoname(self):self.name='KCM-'+uuid.uuid4().hex
    def validate(self):
        identity.guard()
        if not self.is_new() or not frappe.flags.get('kandil_candidate_message_effect'):
            frappe.throw(_('Use the reviewed message-task command; recorded outcomes cannot be edited.'),frappe.PermissionError)
    def on_trash(self):frappe.throw(_('Message-task history cannot be deleted or renamed.'),frappe.PermissionError)
    def before_rename(self,*args,**kwargs):self.on_trash()


def validate_input(outcome,channel,message_text,note):
    if not isinstance(outcome,str) or outcome not in OUTCOMES:
        frappe.throw(_('Choose a manual sending report or Not needed.'))
    channel=text(channel,30,False);message_text=text(message_text,2000,False);note=text(note,1000,False)
    if outcome=='MANUAL_SENT':
        if channel not in CHANNELS or len(message_text)<3:
            frappe.throw(_('Select the channel and record the message you sent manually.'))
    elif channel or message_text or len(note)<3:
        frappe.throw(_('Explain why no message is needed; do not include a sending channel or message.'))
    return channel,message_text,note


def resolution(closure_name,current=False):
    name=frappe.db.get_value(DT,{'closure':closure_name},'name',for_update=current)
    return frappe.get_doc(DT,name,for_update=current) if name else None


def authorize(request,payload):
    app=work.authorize(request,payload)
    task=frappe.get_doc(closure.DT,payload['closure'],for_update=True)
    if task.application!=app.name or task.company!=request.company:
        frappe.throw(_('The message task does not belong to this application.'),frappe.PermissionError)
    return app,task


@frappe.whitelist(methods=['POST'])
@transactional_retry
def resolve(name,opening_name,application,application_version,closure_name,closure_hash,
            outcome,channel,message_text,note,command_id,expected_version):
    identity.guard();channel,message_text,note=validate_input(outcome,channel,message_text,note)
    name=text(name,140);command_id=text(command_id,100);expected_version=text(expected_version,140)
    payload=dict(opening=text(opening_name,140),application=text(application,140),application_version=text(application_version,140),
        closure=text(closure_name,140),closure_hash=text(closure_hash,140),outcome=outcome,channel=channel,
        message_text_hash=activities.digest(message_text),note_hash=activities.digest(note))
    def act(request):
        app,task=authorize(request,payload);activities.reviewed(app,application_version)
        if task.content_hash!=closure_hash:frappe.throw(_('The reviewed closure does not match this task.'),frappe.TimestampMismatchError)
        if app.status!='Rejected' or task.decision!='Rejected' or task.message_status!='Pending' or closure.existing(app.name,current=True)!=task.name:
            frappe.throw(_('This application has no pending rejection-message task.'))
        if resolution(task.name,current=True):frappe.throw(_('The message task is already resolved. Refresh its history.'))
        values=dict(closure=task.name,application=app.name,company=request.company,actor=frappe.session.user,
            outcome=outcome,channel=channel,message_text=message_text,note=note,closure_hash=closure_hash,
            provider_verified=0,sent_by_system=0)
        with effect():doc=frappe.get_doc(dict(doctype=DT,**values,content_hash=activities.digest(values))).insert(ignore_permissions=True)
        event=activities.append(app,request,'MESSAGE',outcome,'',links=dict(message_resolution=doc.name))
        return dict(application=app.name,application_version=str(app.modified),closure=task.name,resolution=doc.name,
            activity=event.name,outcome=outcome,provider_verified=False,sent_by_system=False)
    return command(name,'candidate_message_resolve',command_id,expected_version,payload,act)


def projection(doc):
    from kandil_hr.recruitment.vacancy_access import identity_labels
    return dict(name=doc.name,outcome=doc.outcome,channel=doc.channel,message_text=doc.message_text,note=doc.note,
        recorded_at=str(doc.creation),actor_label=identity_labels([doc.actor]).get(doc.actor),provider_verified=False,sent_by_system=False)


@frappe.whitelist(methods=['GET'])
def context(name):
    from kandil_hr.portal import candidates
    from kandil_hr.portal.organization import bounded_text
    from kandil_hr.foundation.security import request_scope
    candidates.access();app=candidates.readable_application(bounded_text(name))
    request=frappe.get_doc('Kandil Hiring Request',frappe.db.get_value('Job Opening',app.job_title,'custom_kandil_request'))
    task_name=closure.existing(app.name);task=frappe.get_doc(closure.DT,task_name) if task_name else None
    done=resolution(task_name) if task_name else None
    pending=bool(task and task.decision=='Rejected' and task.message_status=='Pending' and app.status=='Rejected' and not done)
    return dict(application=app.name,application_version=str(app.modified),request=request.name,opening=app.job_title,
        expected_version=str(request.modified),pending=pending,
        can_resolve=bool(identity.enabled() and pending and app.has_permission('write') and request_scope(request,frappe.session.user,'manage')),
        task=dict(name=task.name,content_hash=task.content_hash,draft=task.candidate_message or '') if task and task.decision=='Rejected' else None,
        resolution=projection(done) if done else None,channels=CHANNELS)


@frappe.whitelist(methods=['GET'])
def queue(status='pending',search='',start=0,page_length=20):
    from kandil_hr.portal import candidates
    from kandil_hr.portal.organization import paging
    from kandil_hr.candidates.search import labels
    candidates.access();offset,limit=paging(start,page_length)
    if status not in ('pending','resolved','cancelled','all'):frappe.throw(_('Choose a valid message-task filter.'))
    q,a,o,r=candidates.base();q=candidates.filters(q,a,o,r,search=search)
    c=frappe.qb.DocType(closure.DT);m=frappe.qb.DocType(DT)
    q=q.join(c).on(c.application==a.name).left_join(m).on(m.closure==c.name).where(c.decision=='Rejected')
    from kandil_hr.candidates.closure_history import DT as reopening_type
    if frappe.db.table_exists(reopening_type):
        reopened=frappe.qb.DocType(reopening_type)
        q=q.left_join(reopened).on(reopened.closure==c.name)
        cancelled=m.name.isnull()&reopened.name.isnotnull()
        pending=m.name.isnull()&reopened.name.isnull()&(a.status=='Rejected')
    else:
        cancelled=m.name.isnull()&m.name.isnotnull()
        pending=m.name.isnull()&(a.status=='Rejected')
    resolved=m.name.isnotnull()
    # A historical result stays visible after reopening; a pending task is
    # cancelled by the reopening event, never a fabricated human resolution.
    conditions={'pending':pending,'resolved':resolved,'cancelled':cancelled}
    q=q.where(pending|resolved|cancelled)
    counts=deepcopy(q).select(Count(c.name).as_('all'),*[Sum(Case().when(condition,1).else_(0)).as_(key) for key,condition in conditions.items()]).run(as_dict=True)[0]
    counts={key:int(counts.get(key) or 0) for key in ('all',*conditions)}
    if status!='all':q=q.where(conditions[status])
    rows=(q.select(a.name,c.name.as_('closure'),a.applicant_name,a.custom_kandil_person.as_('person'),o.job_title,r.company,c.creation.as_('closed_at'),Case().when(cancelled,'CANCELLED').else_(m.outcome).as_('outcome'))
        .orderby(c.creation).orderby(c.name).limit(limit).offset(offset).run(as_dict=True))
    names=labels([x.person for x in rows])
    for row in rows:row['person_name']=names.get(row.pop('person'))
    return dict(rows=rows,counts=counts,total=counts[status],start=offset,page_length=limit,has_more=offset+limit<counts[status])
