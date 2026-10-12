import sys,json,time,math,urllib.parse
from concurrent.futures import ThreadPoolExecutor
sys.argv=['helpers','SKIP']
import test_hr_functional as t
employees=json.loads((t.OUT/'volume-fixtures.json').read_text())['employees'];assert len(employees)>=1000
prefix='kandil_hr.pilot.api.'
workers=10;rows=[];run=str(int(time.time()))
clients=[t.API(t.C['manager']['email'],t.C['manager']['password']) for _ in range(workers)]
start=time.perf_counter()
def lane(i):
    a=clients[i];local=[]
    for j in range(i,600,workers):
        tick=time.perf_counter()
        try:
            if j<300:
                kind='employee_read';r=a.get('Employee',employees[j]);assert r['name']==employees[j]
            elif j<500:
                kind='employee_list';r=a.call('GET','/api/resource/Employee?'+urllib.parse.urlencode({'filters':json.dumps({'company':t.F['company']}),'fields':json.dumps(['name','employee_name','department']),'limit_page_length':20,'limit_start':(j%40)*20}));assert len(r['data'])==20
            else:
                kind='attendance_write';d=a.create('Attendance',dict(employee=employees[j-500],attendance_date=t.F['today'],status='Present',company=t.F['company']));d=a.submit(d);assert d['docstatus']==1
            local.append({'kind':kind,'ok':True,'ms':round((time.perf_counter()-tick)*1000,2)})
        except Exception as e:local.append({'kind':kind,'ok':False,'error':str(e),'ms':round((time.perf_counter()-tick)*1000,2)})
    return local
with ThreadPoolExecutor(max_workers=workers) as pool:rows=[r for group in pool.map(lane,range(workers)) for r in group]
summary={}
for kind in sorted({r['kind'] for r in rows}):
    subset=[r for r in rows if r['kind']==kind];ms=sorted(r['ms'] for r in subset)
    summary[kind]={'operations':len(subset),'passed':sum(r['ok'] for r in subset),'failed':sum(not r['ok'] for r in subset),'p50_ms':ms[len(ms)//2],'p95_ms':ms[math.ceil(len(ms)*.95)-1],'max_ms':max(ms)}
result={'synthetic_employees':len(employees),'workers':workers,'operations':len(rows),'duration_seconds':round(time.perf_counter()-start,2),'metrics':summary,'note':'Local Docker development server; no WAN, payroll, biometric history or 1000 simultaneous users. Each attendance operation includes create and submit HTTP calls.','rows':rows}
(t.OUT/'volume-results.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='rows'},indent=2))
