"""Real HTTP functional checks against the isolated site, using synthetic accounts."""
from pathlib import Path
import json, urllib.request, urllib.parse, urllib.error, http.cookiejar, datetime, sys
from concurrent.futures import ThreadPoolExecutor

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'development/testing'
F=json.loads((OUT/'fixtures.json').read_text())
C=json.loads((ROOT/'development/test-credentials.json').read_text())
STATE=OUT/'functional-state.json'
S=json.loads(STATE.read_text()) if STATE.exists() else {'run':datetime.datetime.now().strftime('%H%M%S')}
RESULTS=OUT/'functional-results.json'
results=json.loads(RESULTS.read_text()) if RESULTS.exists() else []
only=set(sys.argv[1:])
def persist():
    STATE.write_text(json.dumps(S,indent=2,ensure_ascii=False))
    RESULTS.write_text(json.dumps(results,indent=2,ensure_ascii=False))

class APIError(Exception):
    def __init__(self,status,data):
        self.status=status;self.data=data
        super().__init__(f'HTTP {status}: '+str(data.get('exception',data))[:650])
class API:
    def __init__(self,user,password):
        self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.call('POST','/api/method/login',{'usr':user,'pwd':password})
    def call(self,method,path,payload=None):
        data=json.dumps(payload).encode() if payload is not None else None
        req=urllib.request.Request('http://localhost:8101'+path,data=data,method=method,
            headers={'Content-Type':'application/json'})
        try:
            with self.opener.open(req,timeout=60) as r:
                b=r.read();return json.loads(b) if 'json' in r.headers.get('Content-Type','') else b
        except urllib.error.HTTPError as e:
            raw=e.read()
            try:d=json.loads(raw)
            except Exception:d={'exception':raw.decode(errors='replace')[:600]}
            raise APIError(e.code,d) from None
    def get(self,dt,name):return self.call('GET','/api/resource/'+urllib.parse.quote(dt)+'/'+urllib.parse.quote(name))['data']
    def create(self,dt,data):return self.call('POST','/api/resource/'+urllib.parse.quote(dt),data)['data']
    def put(self,dt,name,data):return self.call('PUT','/api/resource/'+urllib.parse.quote(dt)+'/'+urllib.parse.quote(name),data)['data']
    def method(self,path,data):return self.call('POST','/api/method/'+path,data).get('message')
    def submit(self,doc):return self.method('frappe.client.submit',{'doc':json.dumps(doc)})
    def count(self,dt,filters):return len(self.call('GET','/api/resource/'+urllib.parse.quote(dt)+'?'+urllib.parse.urlencode({'filters':json.dumps(filters),'limit_page_length':100}))['data'])

admin=API('Administrator',(ROOT/'.secrets/admin_password').read_text().strip())
users={k:API(v['email'],v['password']) for k,v in C.items()}
hr=users['manager'];other_hr=users['manager2'];employee=users['employee_a']

def create(key,api,dt,data):
    if key not in S:
        S[key]=api.create(dt,data)['name'];persist()
    return api.get(dt,S[key])
def expected_error(fn,statuses,contains=None):
    try:fn()
    except APIError as e:
        assert e.status in statuses,str(e)
        if contains:assert contains.lower() in str(e.data).lower(),str(e)
        return str(e)
    raise AssertionError('Action unexpectedly succeeded')
def case(cid,title,status='PASS'):
    def dec(fn):
        if only and cid not in only:return fn
        if not only and any(r['id']==cid and r['status'] in ['PASS','GAP'] for r in results):return fn
        row={'id':cid,'title':title,'at':datetime.datetime.now().astimezone().isoformat()}
        try:row.update(status=status,evidence=fn())
        except Exception as e:row.update(status='FAIL',evidence=str(e))
        results[:]=[r for r in results if r['id']!=cid];results.append(row);persist()
        print(json.dumps(row,ensure_ascii=False),flush=True)
        return fn
    return dec

@case('T01','Isolated company and four synthetic employee records')
def t01():
    assert admin.get('Company',F['company'])['default_currency']=='EGP'
    assert admin.count('Employee',{'company':F['company']})>=4
    return 'Egypt / EGP test company and four user-linked employees available through HTTP API.'

@case('T02','Employee can read their own record')
def t02():
    assert employee.get('Employee',F['employees']['employee_a'])['user_id']==C['employee_a']['email']
    return 'Employee A read their own employee record using an ordinary Employee account.'

@case('T03','Employee cannot read another employee record')
def t03():return expected_error(lambda:employee.get('Employee',F['employees']['employee_b']),[403])

def req_data(designation=None):return dict(designation=designation or F['designation'],no_of_positions=1,
    expected_compensation=10000,company=F['company'],department=F['department'],
    requested_by=F['employees']['manager'],posting_date=F['today'],expected_by=F['today'],
    description='Synthetic hiring request '+S['run'],status='Pending')

@case('T04','Hiring manager creates a requisition; self-approval is rejected')
def t04():
    d=create('requisition',hr,'Job Requisition',req_data())
    assert d['owner']==C['manager']['email']
    return expected_error(lambda:hr.method('frappe.model.workflow.apply_workflow',{'doc':json.dumps(d),'action':'TEST Approve'}),[417,403], 'Self approval')

@case('T05','A different HR manager approves the requisition')
def t05():
    d=other_hr.method('frappe.model.workflow.apply_workflow',{'doc':json.dumps(hr.get('Job Requisition',S['requisition'])),'action':'TEST Approve'})
    assert d['workflow_state']=='TEST Approved' and d['status']=='Open & Approved'
    return 'Configured standard workflow moved request to Open & Approved. This does not test Kandil delegation or CEO routing.'

@case('T06','One requisition containing multiple location lines','GAP')
def t06():
    m=admin.get('DocType','Job Requisition');tables=[f['fieldname'] for f in m['fields'] if f['fieldtype'] in ['Table','Table MultiSelect']]
    assert tables==[],tables
    return 'Runtime standard Job Requisition metadata has no child tables for location lines. Exact Kandil multi-location request remains custom work.'

@case('T07','Create an opening linked to the approved requisition')
def t07():
    assert hr.get('Job Requisition',S['requisition'])['status']=='Open & Approved'
    d=create('opening',hr,'Job Opening',dict(job_title='TEST Operator '+S['run'],designation=F['designation'],
        company=F['company'],department=F['department'],location=F['branch'],status='Open',vacancies=1,
        job_requisition=S['requisition'],currency='EGP',prevent_duplicate_applicant=1))
    assert d['job_requisition']==S['requisition']
    return {'opening':d['name'],'requisition':d['job_requisition'],'location':d['location']}

@case('T08','Phone-only applicant fails in standard Frappe','GAP')
def t08():
    return expected_error(lambda:hr.create('Job Applicant',dict(applicant_name='TEST No Email',phone_number='01000000000',job_title=S['opening'])),[417,500],'email')

@case('T09','Create an Arabic-named applicant with email')
def t09():
    d=create('applicant',hr,'Job Applicant',dict(applicant_name='مرشح تجريبي قنديل',email_id='candidate-'+S['run']+'@example.invalid',phone_number='01000000001',job_title=S['opening']))
    assert d['applicant_name']=='مرشح تجريبي قنديل'
    return {'applicant':d['name'],'arabic_name_preserved':True}

@case('T10','Duplicate application to the same opening is rejected')
def t10():
    d=hr.get('Job Applicant',S['applicant'])
    return expected_error(lambda:hr.create('Job Applicant',dict(applicant_name=d['applicant_name'],email_id=d['email_id'],job_title=S['opening'])),[409,417],'already applied')

@case('T11','Ordinary employee cannot read recruitment candidate')
def t11():return expected_error(lambda:employee.get('Job Applicant',S['applicant']),[403])

@case('T12','Schedule an interview and submit scored feedback')
def t12():
    d=create('interview',hr,'Interview',dict(job_applicant=S['applicant'],interview_type=F['interview_type'],
        scheduled_on=F['today'],from_time='09:00:00',to_time='09:30:00',status='Pending',
        interview_details=[{'interviewer':C['manager']['email']}]))
    feedback=create('feedback',hr,'Interview Feedback',dict(interview=d['name'],interviewer=C['manager']['email'],
        interview_type=F['interview_type'],job_applicant=S['applicant'],result='Cleared',feedback='Synthetic assessment only',
        skill_assessment=[{'skill':F['skill'],'rating':0.8}]))
    if feedback['docstatus']==0:feedback=hr.submit(feedback)
    assert feedback['docstatus']==1
    d=hr.get('Interview',d['name']);assert float(d['average_rating'])>0
    return {'interview':d['name'],'feedback':feedback['name'],'average_rating':d['average_rating']}

@case('T13','Accepted offer does not automatically create an employee')
def t13():
    d=create('offer',hr,'Job Offer',dict(job_applicant=S['applicant'],offer_date=F['today'],designation=F['designation'],
        company=F['company'],status='Accepted'))
    if d['docstatus']==0:d=hr.submit(d)
    assert hr.count('Employee',{'job_applicant':S['applicant']})==0
    assert hr.get('Job Applicant',S['applicant'])['status']=='Accepted'
    return {'offer':d['name'],'employee_count_before_joining_conversion':0}

@case('T14','Convert a hired candidate into an employee')
def t14():
    if 'joined_employee' not in S:
        d=hr.method('hrms.hr.doctype.job_offer.job_offer.make_employee',{'source_name':S['offer']})
        for k in ['name','__islocal','__unsaved']:d.pop(k,None)
        d.update(gender='Male',date_of_birth='1995-01-01',date_of_joining=F['today'],company=F['company'],
                 status='Active',designation=F['designation'],department=F['department'],job_applicant=S['applicant'])
        create('joined_employee',hr,'Employee',d)
    d=hr.get('Employee',S['joined_employee']);assert d['job_applicant']==S['applicant']
    return {'employee':d['name'],'job_offer':d['job_offer'],'note':'Standard explicit conversion tested; Kandil reservation/no-show behavior not implemented.'}

@case('T15','Onboarding generates an assigned task')
def t15():
    d=create('onboarding',hr,'Employee Onboarding',dict(job_offer=S['offer'],job_applicant=S['applicant'],
        employee=S['joined_employee'],employee_name='مرشح تجريبي قنديل',company=F['company'],
        date_of_joining=F['today'],boarding_begins_on=F['today'],notify_users=0,
        activities=[dict(activity_name='TEST Issue employee badge',user=C['manager']['email'],begin_on=0,duration=1)]))
    if d['docstatus']==0:d=hr.submit(d)
    d=hr.get('Employee Onboarding',d['name']);tasks=[x['task'] for x in d['activities'] if x.get('task')]
    assert tasks and d.get('project')
    return {'onboarding':d['name'],'project':d['project'],'tasks':tasks}

@case('T16','Employee requests two leave days; HR approves and balance becomes eight')
def t16():
    day=datetime.date.fromisoformat(F['today'])+datetime.timedelta(days=1)
    S['leave_from']=str(day);persist()
    d=create('leave',employee,'Leave Application',dict(employee=F['employees']['employee_a'],leave_type=F['leave_type'],
        company=F['company'],from_date=str(day),to_date=str(day+datetime.timedelta(days=1)),
        status='Open',leave_approver=C['manager']['email'],description='TEST leave request'))
    if d['docstatus']==0:
        d=hr.put('Leave Application',d['name'],{'status':'Approved'});hr.submit(d)
    balance=employee.method('hrms.hr.doctype.leave_application.leave_application.get_leave_balance_on',
        dict(employee=F['employees']['employee_a'],leave_type=F['leave_type'],date=F['today'],
             to_date=f"{F['year']}-12-31",consider_all_leaves_in_the_allocation_period=True))
    assert float(balance)==8,balance
    return {'application':d['name'],'starting_allocation':10,'days_used':2,'remaining':balance}

@case('T17','Leave request exceeding remaining balance is rejected')
def t17():
    day=datetime.date.fromisoformat(F['today'])+datetime.timedelta(days=5)
    return expected_error(lambda:employee.create('Leave Application',dict(employee=F['employees']['employee_a'],leave_type=F['leave_type'],
        company=F['company'],from_date=str(day),to_date=str(day+datetime.timedelta(days=8)),status='Open',
        leave_approver=C['manager']['email'])),[417],'balance')

@case('T18','Record attendance and reject a duplicate day')
def t18():
    day=str(datetime.date.fromisoformat(F['today'])-datetime.timedelta(days=2))
    payload=dict(employee=F['employees']['employee_a'],attendance_date=day,status='Present',company=F['company'])
    d=create('attendance',hr,'Attendance',payload)
    if d['docstatus']==0:hr.submit(d)
    error=expected_error(lambda:hr.create('Attendance',payload),[417],'already marked')
    return {'attendance':d['name'],'duplicate_rejected':error,'scope':'Manual attendance only; not BioTime synchronization.'}

@case('T19','Two pending requests can be created against one planned vacancy','GAP')
def t19():
    plan=create('staffing_plan',hr,'Staffing Plan',dict(name='TEST Capacity Plan '+S['run'],company=F['company'],from_date=f"{F['year']}-01-01",to_date=f"{F['year']}-12-31",
        staffing_details=[dict(designation=F['headcount_designation'],vacancies=1,estimated_cost_per_position=10000)]))
    if plan['docstatus']==0:hr.submit(plan)
    requests=[]
    for i in range(2):
        d=create('pending_capacity_'+str(i),hr,'Job Requisition',req_data(F['headcount_designation']))
        assert d['status']=='Pending'
        requests.append(d['name'])
    assert len(set(requests))==2
    plan=hr.get('Staffing Plan',S['staffing_plan'])
    assert plan['staffing_details'][0]['vacancies']==1
    return {'requests':requests,'planned_vacancies':1,
        'note':'Both pending requests saved. No Kandil reservation ledger is installed. This is a fit gap, not a claim that standard requisitions are defective.'}

@case('T20','Generate offer PDF')
def t20():
    params=urllib.parse.urlencode({'doctype':'Job Offer','name':S['offer'],'format':'Standard','no_letterhead':1})
    pdf=hr.call('GET','/api/method/frappe.utils.print_format.download_pdf?'+params)
    assert isinstance(pdf,bytes) and pdf.startswith(b'%PDF'),str(type(pdf))
    (OUT/'TEST-offer.pdf').write_bytes(pdf)
    return {'bytes':len(pdf),'note':'PDF generation only; contract legality and Arabic typography not certified.'}

@case('T21','Employee cannot query another employee leave balance')
def t21():
    return expected_error(lambda:employee.method('hrms.hr.doctype.leave_application.leave_application.get_leave_balance_on',
        dict(employee=F['employees']['employee_b'],leave_type=F['leave_type'],date=F['today'])),[403])

@case('T22','Concurrent requisition submissions without retry')
def t22():
    if 'concurrency_observation' not in S:
        def send(i):
            try:
                data=req_data(F['headcount_designation'])
                data['requested_by']=F['employees']['manager' if i==0 else 'manager2']
                d=[hr,other_hr][i].create('Job Requisition',data)
                return {'name':d['name'],'status':'saved'}
            except APIError as e:return {'status':'error','error':str(e)}
        with ThreadPoolExecutor(max_workers=2) as pool:
            S['concurrency_observation']=list(pool.map(send,[0,1]))
        persist()
    observation=S['concurrency_observation']
    assert all(x['status']=='saved' for x in observation),json.dumps(observation)
    return {'submissions':observation,'scope':'Two simultaneous submissions only; earlier same-account attempts returned database conflicts. Not a load test.'}

print(json.dumps({'summary':{k:sum(r['status']==k for r in results) for k in ['PASS','GAP','FAIL']},'results':str(RESULTS)},indent=2))
