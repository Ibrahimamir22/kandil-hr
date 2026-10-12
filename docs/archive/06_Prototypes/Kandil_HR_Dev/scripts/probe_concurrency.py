import sys, json, time, statistics
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
label=sys.argv[1];n=int(sys.argv[2]);workers=int(sys.argv[3])
sys.argv=['helpers','SKIP']
import test_hr_functional as t
clients=[t.API(t.C['manager']['email'],t.C['manager']['password']) for _ in range(workers)]
def lane(i):
    rows=[]
    for j in range(i,n,workers):
        start=time.perf_counter()
        try:
            d=clients[i].create('Job Requisition',t.req_data())
            rows.append({'index':j,'ok':True,'name':d['name'],'ms':round((time.perf_counter()-start)*1000,1)})
        except Exception as e:rows.append({'index':j,'ok':False,'error':str(e),'ms':round((time.perf_counter()-start)*1000,1)})
    return rows
start=time.perf_counter()
with ThreadPoolExecutor(max_workers=workers) as pool:rows=[r for group in pool.map(lane,range(workers)) for r in group]
ms=sorted(r['ms'] for r in rows)
result={'label':label,'requests':n,'concurrency':workers,'passed':sum(r['ok'] for r in rows),'failed':sum(not r['ok'] for r in rows),'seconds':round(time.perf_counter()-start,2),'p95_ms':ms[min(len(ms)-1,int(len(ms)*.95))],'unique_saved_names':len({r['name'] for r in rows if r['ok']}),'rows':rows}
p=t.OUT/('concurrency-'+label+'.json');p.write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='rows'}))
