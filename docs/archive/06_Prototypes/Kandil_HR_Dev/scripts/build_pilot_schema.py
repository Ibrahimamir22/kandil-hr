from pathlib import Path
import json
base=Path('development/frappe-bench/apps/kandil_hr/kandil_hr/kandil_hr/doctype');base.mkdir(exist_ok=True)
if (base/'kandil_capacity'/'kandil_capacity.json').exists():
    raise SystemExit('One-time scaffold already exists. Edit versioned schemas instead of regenerating them.')
(base/'__init__.py').touch()
def f(name,kind='Data',options=None,**kw):
    d={'fieldname':name,'label':name.replace('_',' ').title(),'fieldtype':kind,**kw}
    if options:d['options']=options
    return d
def perm(role,write=False,create=False):return dict(role=role,read=1,write=int(write),create=int(create),report=1,export=0,print=1)
roles=['Kandil Requester','Kandil Approver','Kandil Recruiter','Kandil Sector Approver']
def dt(name,fields,permissions=None,child=False,**kw):
    slug=name.lower().replace(' ','_');p=base/slug;p.mkdir(exist_ok=True);(p/'__init__.py').touch()
    d=dict(doctype='DocType',name=name,module='Kandil HR',custom=0,engine='InnoDB',autoname='hash',field_order=[x['fieldname'] for x in fields],fields=fields,permissions=permissions or [],track_changes=1,**kw)
    if child:d.update(istable=1,track_changes=0)
    (p/(slug+'.json')).write_text(json.dumps(d,indent=2)+'\n')
    cls=name.replace(' ','')
    (p/(slug+'.py')).write_text(f'from kandil_hr.pilot.models import {cls}\n')

scope=[f('company','Link','Company',reqd=1,in_list_view=1),f('department','Link','Department',reqd=1,in_list_view=1)]
dt('Kandil Capacity',scope+[f('designation','Link','Designation',reqd=1),f('branch','Link','Branch',reqd=1,in_list_view=1),f('structural','Int',reqd=1,in_list_view=1),f('occupied','Int',default='0',in_list_view=1),f('reserved','Int',read_only=1,default='0',in_list_view=1),f('open_slots','Int',read_only=1,default='0',in_list_view=1),f('available','Int',read_only=1,in_list_view=1)], [perm(r,r=='Kandil Sector Approver',r=='Kandil Sector Approver') for r in roles])
dt('Kandil Recruitment Route',scope+[f('manager_approver','Link','User',reqd=1),f('hr_approver','Link','User',reqd=1),f('exception_approver','Link','User',reqd=1),f('enabled','Check',default='1')],[perm(r,r=='Kandil Sector Approver',r=='Kandil Sector Approver') for r in roles])
dt('Kandil Request Line',[f('capacity','Link','Kandil Capacity',reqd=1,in_list_view=1),f('requested_qty','Int',reqd=1,in_list_view=1),f('approved_qty','Int',read_only=1,in_list_view=1),f('joined_qty','Int',read_only=1,in_list_view=1),f('job_opening','Link','Job Opening',read_only=1,in_list_view=1)],child=True)
dt('Kandil Approval Step',[f('principal','Link','User',reqd=1,in_list_view=1),f('authority','Data',in_list_view=1),f('decision','Select','Pending\nApproved\nRejected',default='Pending',in_list_view=1),f('actor','Link','User',read_only=1),f('decided_at','Datetime',read_only=1),f('comment','Small Text',read_only=1)],child=True)
dt('Kandil Hiring Request',scope+[f('title','Data',reqd=1,in_list_view=1),f('requested_by','Link','User',read_only=1,in_list_view=1),f('status','Select','Draft\nPending\nApproved\nRejected\nCancelled\nFilled',default='Draft',read_only=1,in_list_view=1),f('exception_reason','Small Text'),f('needs_exception','Check',read_only=1),f('lines','Table','Kandil Request Line',reqd=1),f('approval_steps','Table','Kandil Approval Step',read_only=1),f('submitted_snapshot','Code',read_only=1),f('decision_note','Small Text',read_only=1)], [perm('Kandil Requester',True,True),perm('Kandil Approver',False,True),perm('Kandil Recruiter',True,True),perm('Kandil Sector Approver',True,True)],title_field='title',search_fields='title,requested_by,status')
dt('Kandil Delegation',scope+[f('from_user','Link','User',reqd=1),f('to_user','Link','User',reqd=1),f('from_date','Date',reqd=1),f('to_date','Date',reqd=1),f('reason','Small Text',reqd=1),f('revoked','Check',default='0')],[perm('Kandil Sector Approver',True,True),perm('Kandil Approver')])
dt('Kandil Recruitment Event',[f('request','Link','Kandil Hiring Request',reqd=1,in_list_view=1),f('action','Data',reqd=1,in_list_view=1),f('actor','Link','User',reqd=1,in_list_view=1),f('principal','Link','User'),f('note','Small Text'),f('snapshot','Code',read_only=1)],[perm(r) for r in roles])
print('Generated six parent/child recruitment models plus immutable event model.')
