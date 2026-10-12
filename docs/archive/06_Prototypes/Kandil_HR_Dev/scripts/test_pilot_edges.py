import sys,json,time,urllib.parse
from concurrent.futures import ThreadPoolExecutor
sys.argv=['helpers','SKIP'];import test_hr_functional as t
state=json.loads((t.OUT/'pilot-state.json').read_text());results=[]
p='kandil_hr.pilot.api.';run=str(int(time.time()))
hr=t.users['manager'];manager=t.users['manager2'];requester=t.users['employee_a'];sector=t.users['sector'];delegate=t.users['employee_b'];admin=t.admin

if __import__('os').environ.get('PILOT_EDGE_ONLY'):
    results=json.loads((t.OUT/'pilot-edge-results.json').read_text())
only=set(__import__('os').environ.get('PILOT_EDGE_ONLY','').split(','))-set([''])
def check(name,fn):
    if only and name.split()[0] not in only:return
    results[:]=[r for r in results if r['name']!=name]
    try:r=fn();results.append({'name':name,'status':'PASS','evidence':r})
    except Exception as e:results.append({'name':name,'status':'FAIL','evidence':str(e)})
    (t.OUT/'pilot-edge-results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results[-1]),flush=True)
def denied(fn):return t.expected_error(fn,[403,417,409])
def make(cap,actor=requester):return actor.create('Kandil Hiring Request',dict(company=t.F['company'],department=t.F['department'],title='PILOT EDGE '+run,lines=[{'capacity':cap,'requested_qty':1}]))
def submit(d,actor=requester):return actor.method(p+'submit_request',{'name':d['name']})
def approve(d,actor):return actor.method(p+'decide',{'name':d['name'],'decision':'Approve','comment':'Synthetic edge test'})
def cancel(d):return requester.method(p+'cancel_request',{'name':d['name'],'reason':'Synthetic edge test complete'})
check('E01 Joined employee assignment cannot be rewritten',lambda:denied(lambda:hr.put('Employee',state['employee'],{'branch':'TEST Factory B'})))
check('E02 Joined employee cannot be deleted',lambda:denied(lambda:hr.call('DELETE','/api/resource/Employee/'+state['employee'])))
check('E03 Native request submission cannot bypass lifecycle',lambda:denied(lambda:requester.submit(make(state['a']))))

def privacy():
    d=make(state['a']);denied(lambda:delegate.get('Kandil Hiring Request',d['name']))
    listing=delegate.call('GET','/api/resource/Kandil%20Hiring%20Request?'+urllib.parse.urlencode({'filters':json.dumps({'name':d['name']})}))['data'];assert not listing
    cancel(d);return 'Unassigned approver cannot read the record directly or via list.'
check('E04 Draft and list privacy',privacy)

def self_step():
    d=submit(make(state['a'],manager),manager)
    assert all(x['principal']!=t.C['manager2']['email'] for x in d['approval_steps'])
    denied(lambda:approve(d,manager));d=approve(d,hr);assert d['status']=='Approved'
    manager.method(p+'cancel_request',{'name':d['name'],'reason':'Synthetic self-step test complete'})
    return 'Requester step skipped and independent HR approval retained.'
check('E05 Requester in route cannot approve their own step',self_step)

def immutable():
    d=sector.get('Kandil Delegation',state['delegation'])
    return denied(lambda:sector.put('Kandil Delegation',d['name'],{'reason':'Replace historical reason'}))
check('E06 Delegation history immutable',immutable)
check('E07 Expired delegation rejected at creation when reversed dates',lambda:denied(lambda:sector.create('Kandil Delegation',dict(company=t.F['company'],department=t.F['department'],from_user=t.C['manager2']['email'],to_user=t.C['employee_b']['email'],from_date='2026-10-12',to_date='2026-10-11',reason='Invalid range'))))

def race():
    branch='PILOT Contention '+run;admin.create('Branch',{'branch':branch})
    cap=sector.create('Kandil Capacity',dict(company=t.F['company'],department=t.F['department'],designation='PILOT Assembly Operator',branch=branch,structural=5,occupied=0))
    requests=[make(cap['name']) for _ in range(20)]
    clients=[t.API(t.C['employee_a']['email'],t.C['employee_a']['password']) for _ in range(20)]
    def act(i):
        try:
            response=clients[i].call('POST','/api/method/'+p+'submit_request',{'name':requests[i]['name']})
            return {'ok':True,'retries':response.get('kandil_transaction_retries',0)}
        except t.APIError as e:return {'ok':False,'http_status':e.status,'error':str(e)}
    with ThreadPoolExecutor(max_workers=20) as pool:observed=list(pool.map(act,range(20)))
    after=sector.get('Kandil Capacity',cap['name'])
    # Always clean up real persisted requests before asserting, preserving the observations.
    for d in requests:cancel(d)
    assert sum(x['ok'] for x in observed)==5 and all(x['ok'] or x['http_status']==417 for x in observed),observed
    assert after['reserved']==5 and sector.get('Kandil Capacity',cap['name'])['reserved']==0
    return {'concurrent_submissions':20,'seats':5,'reserved':5,'correct_capacity_rejections':15,'observations':observed}
check('E08 Twenty simultaneous requests for five seats',race)

def join_race():
    d=submit(make(state['b']));d=approve(d,manager);d=approve(d,hr)
    app=hr.create('Job Applicant',dict(applicant_name='PILOT joining race',phone_number='013'+run[-8:],job_title=d['lines'][0]['job_opening']))
    offer=hr.create('Job Offer',dict(job_applicant=app['name'],offer_date=t.F['today'],designation='PILOT Assembly Operator',company=t.F['company'],status='Accepted'));offer=hr.submit(offer)
    clients=[t.API(t.C['manager']['email'],t.C['manager']['password']) for _ in range(2)]
    before=sector.get('Kandil Capacity',state['b'])
    def act(i):return clients[i].method(p+'record_outcome',dict(offer_name=offer['name'],outcome='Joined',joining_date=t.F['today'],date_of_birth='1995-01-01',gender='Male'))
    with ThreadPoolExecutor(max_workers=2) as pool:r=list(pool.map(act,[0,1]))
    after=sector.get('Kandil Capacity',state['b'])
    assert len({x['employee'] for x in r})==1 and all(x['employee'] for x in r) and hr.count('Employee',{'job_applicant':app['name']})==1
    assert after['occupied']==before['occupied']+1 and after['open_slots']==before['open_slots']-1
    assert requester.get('Kandil Hiring Request',d['name'])['status']=='Filled'
    return {'results':r,'one_employee':True,'request_filled':True}
check('E09 Simultaneous joining is exactly-once and fills request',join_race)
print(json.dumps({'passed':sum(x['status']=='PASS' for x in results),'failed':sum(x['status']=='FAIL' for x in results)}))
