"""Versioned source schema generator; does not connect to a database."""
from pathlib import Path
import json

app=Path(__file__).resolve().parents[1]/'development/frappe-bench/apps/kandil_hr/kandil_hr'
root=app/'kandil_hr/doctype'
def f(name,label,kind='Data',**kw):return dict(fieldname=name,label=label,fieldtype=kind,**kw)
def extend(name,fields):
 p=root/name/(name+'.json');d=json.loads(p.read_text())
 for field in fields:
  old=next((x for x in d['fields'] if x['fieldname']==field['fieldname']),None)
  if old:old.update(field)
  else:d['fields'].append(field);d['field_order'].append(field['fieldname'])
 p.write_text(json.dumps(d,indent=2)+'\n')
extend('kandil_hiring_request',[
 f('status','Status','Select',options='Draft\nPending\nReturned\nApproved\nRejected\nCancelled\nFilled\nApplied',read_only=1,default='Draft',in_list_view=1),
 f('requested_position','Requested Position','Link',options='Kandil Position'),
 f('request_kind','Request Kind','Select',options='New Recruitment\nAmendment',default='New Recruitment',read_only=1),
 f('amends','Amends','Link',options='Kandil Hiring Request',read_only=1),
 f('baseline_modified','Baseline Modified','Data',read_only=1,hidden=1),
 f('revision','Revision','Int',default=1,read_only=1),
 f('need_reason','Need Reason','Select',options='New Position\nReplacement\nTemporary Cover\nExpansion',default='Expansion'),
 f('replacement_employee','Replacement Employee','Link',options='Employee'),
 f('employment_type','Employment Type','Data'),f('required_by','Required By','Date'),
 f('qualifications','Qualifications','Small Text'),f('skills_required','Skills Required','Small Text'),
 f('experience_required','Experience Required','Small Text'),f('working_conditions','Working Conditions','Small Text'),
 f('requested_priority','Requested Priority','Select',options='Normal\nImportant\nCritical',default='Normal'),
 f('hr_priority','HR Priority','Select',options='Normal\nImportant\nCritical',default='Normal',read_only=1),
 f('route_snapshot','Route Snapshot','Code',hidden=1,read_only=1),
])
extend('kandil_request_line',[f('proposed_qty','Proposed Qty','Int',read_only=1),f('reserved_qty','Reserved Qty','Int',read_only=1)])
extend('kandil_capacity',[f('position','Position','Link',options='Kandil Position')])
extend('kandil_approval_step',[
 f('decision','Decision','Select',options='Pending\nApproved\nRejected\nReturned',default='Pending',in_list_view=1),
 f('step_key','Step Key','Data',read_only=1),f('reviewed_snapshot','Reviewed Snapshot','Code',hidden=1,read_only=1),
 f('waiting_since','Waiting Since','Datetime',read_only=1),f('authority_position','Authority Position','Link',options='Kandil Position',read_only=1),
])
extend('kandil_recruitment_route',[
 f('ceo_approver','CEO Approver','Link',options='User'),f('board_approver','Board Approver','Link',options='User'),
 f('headcount_mode','Headcount Mode','Select',options='Warn\nBlock',default='Warn'),
 f('ceo_for_critical','CEO for Critical Requests','Check'),f('board_after_ceo','Board After CEO','Check')])

def create(title,fields,controller,*,table=False,perms=None):
 name=title.lower().replace(' ','_');p=root/name;p.mkdir(exist_ok=True)
 d=dict(doctype='DocType',name=title,module='Kandil HR',custom=0,engine='InnoDB',autoname='hash',
 field_order=[x['fieldname'] for x in fields],fields=fields,permissions=perms or [],track_changes=0)
 if table:d['istable']=1
 (p/(name+'.json')).write_text(json.dumps(d,indent=2)+'\n');(p/'__init__.py').touch()
 (p/(name+'.py')).write_text(controller+'\n')
create('Kandil Command Receipt',[
 f('request','Request','Link',options='Kandil Hiring Request'),f('actor','Actor','Link',options='User'),
 f('payload_hash','Payload Hash'),f('result_json','Result JSON','Code')],
 'from kandil_hr.recruitment.models import KandilCommandReceipt')
create('Kandil Request Revision',[
 f('request','Request','Link',options='Kandil Hiring Request'),f('company','Company','Link',options='Company'),
 f('department','Department','Link',options='Department'),f('revision','Revision','Int'),f('action','Action'),
 f('actor','Actor','Link',options='User'),f('snapshot_json','Snapshot JSON','Code')],
 'from kandil_hr.recruitment.models import KandilRequestRevision',
 perms=[dict(role=r,read=1) for r in ['Kandil Requester','Kandil Approver','Kandil Recruiter','Kandil Sector Approver']])
create('Kandil Recruiter Member',[f('user','User','Link',options='User',reqd=1,in_list_view=1)],
 'from frappe.model.document import Document\nclass KandilRecruiterMember(Document):\n\tpass',table=True)
create('Kandil Authority Rule',[
 f('company','Company','Link',options='Company',reqd=1),f('department','Department','Link',options='Department'),
 f('position','Position','Link',options='Kandil Position'),f('from_date','From Date','Date',reqd=1),
 f('to_date','To Date','Date'),f('enabled','Enabled','Check',default=1),
 f('authority','Authority','Select',options='CEO Approval\nBoard Approval',reqd=1),
 f('principal','Principal','Link',options='User',reqd=1),f('reason','Reason','Small Text',reqd=1)],
 'from kandil_hr.recruitment.models import KandilAuthorityRule',
 perms=[dict(role='System Manager',read=1,write=1,create=1),dict(role='Kandil Sector Approver',read=1)])
print('Recruitment source schemas extended; no runtime mutation')
