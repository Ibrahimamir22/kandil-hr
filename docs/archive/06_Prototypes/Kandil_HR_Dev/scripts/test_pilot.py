"""End-to-end pilot acceptance using authenticated role accounts and normal HTTP."""
import sys,json,time,datetime,uuid
from concurrent.futures import ThreadPoolExecutor
sys.argv=['helpers','SKIP']
import test_hr_functional as t
api=t.API;hr=t.users['manager'];manager=t.users['manager2'];requester=t.users['employee_a'];delegate=t.users['employee_b'];sector=t.users['sector'];admin=t.admin
prefix='kandil_hr.pilot.api.'
run=str(int(time.time()));results=[];state={};out=t.OUT

def check(name,fn):
    start=time.perf_counter()
    try:
        evidence=fn();results.append({'name':name,'status':'PASS','evidence':evidence,'ms':round((time.perf_counter()-start)*1000,1)})
    except Exception as e:results.append({'name':name,'status':'FAIL','evidence':str(e)})
    (out/'pilot-results.json').write_text(json.dumps(results,indent=2,ensure_ascii=False));(out/'pilot-state.json').write_text(json.dumps(state,indent=2,ensure_ascii=False))
    print(json.dumps(results[-1],ensure_ascii=False),flush=True)

def denied(fn):return t.expected_error(fn,[403,417,409])
def request(title,caps,actor=requester,reason=''):
    return actor.create('Kandil Hiring Request',dict(company=t.F['company'],department=t.F['department'],title='PILOT '+title+' '+run,exception_reason=reason,lines=[dict(capacity=k,requested_qty=v) for k,v in caps]))
def submit(d,actor=requester):return actor.method(prefix+'submit_request',{'name':d['name']})
def approve(d,actor):return actor.method(prefix+'decide',{'name':d['name'],'decision':'Approve','comment':'Synthetic pilot approval'})
def cancel(d,actor=requester):return actor.method(prefix+'cancel_request',{'name':d['name'],'reason':'Synthetic cancellation'})
def cap(name):return sector.get('Kandil Capacity',name)
def counts(name):
    d=cap(name);return {k:d[k] for k in ['structural','occupied','reserved','open_slots','available']}
def setup():
    for label,branch in [('a','TEST Factory A'),('b','TEST Factory B')]:
        key=t.F['company']+'|'+t.F['department']+'|PILOT Assembly Operator|'+branch
        import hashlib
        name='KCAP-'+hashlib.sha256(key.encode()).hexdigest()[:24]
        try:d=sector.get('Kandil Capacity',name)
        except t.APIError as e:
            if e.status!=404:raise
            d=sector.create('Kandil Capacity',dict(company=t.F['company'],department=t.F['department'],designation='PILOT Assembly Operator',branch=branch,structural=10,occupied=0))
        state[label]=d['name']
    import hashlib
    route='KROUTE-'+hashlib.sha256((t.F['company']+'|'+t.F['department']).encode()).hexdigest()[:24]
    try:sector.get('Kandil Recruitment Route',route)
    except t.APIError as e:
        if e.status!=404:raise
        sector.create('Kandil Recruitment Route',dict(company=t.F['company'],department=t.F['department'],manager_approver=t.C['manager2']['email'],hr_approver=t.C['manager']['email'],exception_approver=t.C['sector']['email'],enabled=1))
    return 'Capacity and approval route configured through the Sector role.'
check('P01 Configure capacity and route',setup)

def multiline():
    d=request('Two locations',[(state['a'],2),(state['b'],1)]);state['main']=d['name']
    before={x:counts(state[x]) for x in ['a','b']};d=submit(d)
    assert d['status']=='Pending' and counts(state['a'])['reserved']==before['a']['reserved']+2 and counts(state['b'])['reserved']==before['b']['reserved']+1
    state['baseline']=before
    return {'request':d['name'],'reserved_a':2,'reserved_b':1}
check('P02 Multi-location submit reserves capacity',multiline)
check('P03 Requester cannot self-approve',lambda:denied(lambda:approve({'name':state['main']},requester)))
check('P04 Wrong or out-of-order approver blocked',lambda:denied(lambda:approve({'name':state['main']},hr)))
check('P05 Direct REST status change blocked',lambda:denied(lambda:requester.put('Kandil Hiring Request',state['main'],{'status':'Approved'})))
check('P06 Manual opening bypass blocked',lambda:denied(lambda:hr.create('Job Opening',dict(job_title='PILOT bypass '+run,designation='PILOT Assembly Operator',company=t.F['company'],status='Open',custom_kandil_request=state['main'],custom_kandil_capacity=state['a']))))

def complete_approval():
    d=approve({'name':state['main']},manager);assert d['status']=='Pending'
    d=approve(d,hr);assert d['status']=='Approved'
    assert len(d['lines'])==2 and all(x['job_opening'] for x in d['lines'])
    state['open_a']=d['lines'][0]['job_opening'];state['open_b']=d['lines'][1]['job_opening']
    assert counts(state['a'])['reserved']==state['baseline']['a']['reserved']
    assert counts(state['a'])['open_slots']==state['baseline']['a']['open_slots']+2
    return {'openings':[x['job_opening'] for x in d['lines']],'a':counts(state['a']),'b':counts(state['b'])}
check('P07 Complete approvals creates an opening per location',complete_approval)

def applicant(key,opening,phone):
    d=hr.create('Job Applicant',dict(applicant_name='مرشح قنديل تجريبي '+key,phone_number=phone,job_title=opening))
    state[key]=d['name'];assert not d.get('email_id');return d
check('P08 Phone-only applicant without fabricated email',lambda:applicant('candidate1',state['open_a'],'010'+run[-8:]))
check('P09 Duplicate phone/application rejected',lambda:denied(lambda:applicant('duplicate',state['open_a'],'010'+run[-8:])))
check('P10 Employee cannot read pilot applicant',lambda:denied(lambda:requester.get('Job Applicant',state['candidate1'])))

def offer(key,candidate):
    d=hr.create('Job Offer',dict(job_applicant=candidate,offer_date=t.F['today'],designation='PILOT Assembly Operator',company=t.F['company'],status='Accepted'))
    d=hr.submit(d);state[key]=d['name'];return d
check('P11 Accepted phone-only offer without creating employee',lambda:{'offer':offer('offer1',state['candidate1'])['name'],'employee_count':hr.count('Employee',{'job_applicant':state['candidate1']})})
check('P12 Employee conversion bypass blocked',lambda:denied(lambda:hr.create('Employee',dict(first_name='PILOT bypass',gender='Male',date_of_birth='1995-01-01',date_of_joining=t.F['today'],company=t.F['company'],status='Active',job_applicant=state['candidate1'],job_offer=state['offer1']))))

def outcome(offer_name,value):return hr.method(prefix+'record_outcome',dict(offer_name=offer_name,outcome=value,reason='Synthetic '+value,joining_date=t.F['today'],date_of_birth='1995-01-01',gender='Male'))
def join():
    before=counts(state['a']);r=outcome(state['offer1'],'Joined');assert r['employee'] and r['onboarding'];state['employee']=r['employee']
    after=counts(state['a']);assert after['occupied']==before['occupied']+1 and after['open_slots']==before['open_slots']-1
    assert requester.get('Kandil Hiring Request',state['main'])['status']=='Approved'
    return {'result':r,'before':before,'after':after}
check('P13 Actual joining creates employee/onboarding and partial fill',join)

def replay():
    before=counts(state['a']);r=outcome(state['offer1'],'Joined');assert r['idempotent'] and r['employee']==state['employee'] and before==counts(state['a']);return r
check('P14 Repeated joining is idempotent',replay)

def noshow():
    candidate=applicant('candidate2',state['open_b'],'011'+run[-8:]);d=offer('offer2',candidate['name'])
    before=counts(state['b']);r=outcome(d['name'],'No Show');assert not r['employee'] and counts(state['b'])==before and hr.count('Employee',{'job_applicant':candidate['name']})==0
    return {'result':r,'vacancy_retained':True}
check('P15 No-show does not create employee or close vacancy',noshow)
check('P16 Joined after final no-show blocked',lambda:denied(lambda:outcome(state['offer2'],'Joined')))

def reject():
    before=counts(state['a']);d=submit(request('Reject',[(state['a'],1)]))
    r=manager.method(prefix+'decide',{'name':d['name'],'decision':'Reject','comment':'Synthetic rejection'});assert r['status']=='Rejected' and counts(state['a'])==before
    return r['name']
check('P17 Rejection releases reservations',reject)

def cancelled():
    before=counts(state['a']);d=submit(request('Cancel pending',[(state['a'],1)]));cancel(d);cancel(d);assert counts(state['a'])==before;return 'Reservation released once.'
check('P18 Pending cancellation releases once',cancelled)

def excess():
    d=request('Missing exception reason',[(state['a'],100)]);before=counts(state['a']);error=denied(lambda:submit(d));assert counts(state['a'])==before
    d=request('Quantity exception',[(state['a'],100)],reason='Synthetic temporary expansion');d=submit(d);assert d['needs_exception']==1 and d['approval_steps'][0]['authority']=='Headcount Exception'
    denied(lambda:approve(d,manager));d=approve(d,sector);assert d['status']=='Pending';cancel(d)
    assert counts(state['a'])==before
    return {'unjustified_rejected':error,'independent_exception_approval_tested':True}
check('P19 Quantity exception justified and separately authorized',excess)

def delegation():
    d=submit(request('Delegated approval',[(state['a'],1)]))
    denied(lambda:approve(d,delegate))
    record=sector.create('Kandil Delegation',dict(company=t.F['company'],department=t.F['department'],from_user=t.C['manager2']['email'],to_user=t.C['employee_b']['email'],from_date=t.F['today'],to_date=t.F['today'],reason='Synthetic same-day delegation'))
    state['delegation']=record['name'];d=approve(d,delegate)
    assert d['approval_steps'][0]['actor']==t.C['employee_b']['email'] and d['approval_steps'][0]['principal']==t.C['manager2']['email'];cancel(d)
    sector.put('Kandil Delegation',record['name'],{'revoked':1})
    d=submit(request('Revoked delegate',[(state['a'],1)]));denied(lambda:approve(d,delegate));cancel(d)
    return 'Effective delegate approved; attribution retained; revoked delegate denied.'
check('P20 Effective and revoked delegation',delegation)

def self_delegate():
    d=submit(request('Self via delegation',[(state['a'],1)],actor=delegate),actor=delegate)
    record=sector.create('Kandil Delegation',dict(company=t.F['company'],department=t.F['department'],from_user=t.C['manager2']['email'],to_user=t.C['employee_b']['email'],from_date=t.F['today'],to_date=t.F['today'],reason='Synthetic self-approval attack'))
    error=denied(lambda:approve(d,delegate));cancel(d,delegate);sector.put('Kandil Delegation',record['name'],{'revoked':1});return error
check('P21 Delegation cannot enable self-approval',self_delegate)

check('P22 Capacity-counter tampering blocked',lambda:denied(lambda:sector.put('Kandil Capacity',state['a'],{'reserved':999})))

def audit():
    import urllib.parse
    response=requester.call('GET','/api/resource/Kandil%20Recruitment%20Event?'+urllib.parse.urlencode({'filters':json.dumps({'request':state['main']}),'limit_page_length':100}))['data']
    assert len(response)>=5
    denied(lambda:admin.put('Kandil Recruitment Event',response[0]['name'],{'action':'Forged'}))
    denied(lambda:admin.create('Kandil Recruitment Event',dict(request=state['main'],action='Forged',actor=t.C['manager']['email'])))
    return {'events':len(response),'immutable':True}
check('P23 Audit events exist and reject API forgery',audit)

def race_reservations():
    # New capacity with exactly one seat; two independent requests compete for it.
    branch='PILOT Race '+run
    admin.create('Branch',{'branch':branch})
    c=sector.create('Kandil Capacity',dict(company=t.F['company'],department=t.F['department'],designation='PILOT Assembly Operator',branch=branch,structural=1,occupied=0))
    state['race_capacity']=c['name']
    a=request('Race A',[(c['name'],1)]);b=request('Race B',[(c['name'],1)])
    sessions=[api(t.C['employee_a']['email'],t.C['employee_a']['password']) for _ in range(2)]
    def send(i):
        try:return {'ok':True,'name':sessions[i].method(prefix+'submit_request',{'name':[a,b][i]['name']})['name']}
        except t.APIError as e:return {'ok':False,'status':e.status,'error':str(e)}
    with ThreadPoolExecutor(max_workers=2) as pool:r=list(pool.map(send,[0,1]))
    assert sum(x['ok'] for x in r)==1 and all(x['ok'] or x['status']==417 for x in r),r
    assert counts(c['name'])['reserved']==1
    state['race_observation']=r
    for d in [a,b]:cancel(d)
    assert counts(c['name'])['reserved']==0
    return r
check('P24 Concurrent requests cannot double-reserve a seat',race_reservations)

def finish_cancel():
    before=counts(state['a']);d=cancel({'name':state['main']});after=counts(state['a'])
    assert d['status']=='Cancelled' and after['occupied']==before['occupied'] and after['open_slots']==before['open_slots']-1
    assert hr.get('Job Opening',state['open_a'])['status']=='Closed'
    return {'joined_employee_retained':state['employee'],'remaining_open_slots_released':True}
check('P25 Cancel partially filled request preserves actual joiner',finish_cancel)
check('P26 Applications to cancelled opening blocked',lambda:denied(lambda:applicant('late',state['open_a'],'012'+run[-8:])))
print(json.dumps({'passed':sum(x['status']=='PASS' for x in results),'failed':sum(x['status']=='FAIL' for x in results),'file':str(out/'pilot-results.json')},indent=2))
