"""Schema only: isolated parity and review, no workflow activation or record seeding."""
import datetime,json,os,subprocess
from pathlib import Path
app=Path(__file__).resolve().parents[2];dev=app.parents[3]
result=dict(checked_at=datetime.datetime.now(datetime.UTC).isoformat(),sites=[])
for site in ('kandil-parity.localhost','kandil-review.localhost'):
    env=dict(os.environ,KANDIL_DEV_WORKSPACE=str(dev/'development'))
    if site=='kandil-parity.localhost':cmd=['docker','compose','exec','-T','-w','/workspace/frappe-bench','parity-web'];cwd=dev
    else:cmd=['docker','compose','-f','deployment/review.compose.yaml','exec','-T','web'];cwd=app
    cmd+=['bench','--site',site]
    def run(args):
        p=subprocess.run(cmd+args,cwd=cwd,env=env,text=True,capture_output=True)
        if p.returncode:
            out=Path('/tmp/kandil-talent-pool-migration-error.txt');out.touch(mode=0o600);out.chmod(0o600);out.write_text(p.stdout+p.stderr);raise RuntimeError('Private migration diagnostic saved')
        return p.stdout
    def proof():return json.loads(next(line for line in reversed(run(['execute','kandil_hr.candidates.talent_pool.schema_proof']).splitlines()) if line.startswith('{')))
    before=proof()
    for doc in ('kandil_talent_pool_event',):run(['reload-doc','kandil_hr','doctype',doc])
    after=proof()
    for key,value in before['tables'].items():
        if value is not None:assert after['tables'][key]==value
        else:assert after['tables'][key]['count']==0
    assert {k:v for k,v in before.items() if k!='tables'}=={k:v for k,v in after.items() if k!='tables'}
    for doc in ('kandil_talent_pool_event',):run(['reload-doc','kandil_hr','doctype',doc])
    assert proof()==after
    result['sites'].append(dict(site=site,before=before,after=after,business_records_unchanged=True,repeat_unchanged=True))
    print(json.dumps(dict(site=site,business_records_unchanged=True,no_policy_seeded=True)),flush=True)
(app/'docs/roadmap/evidence/talent-pool-schema-2026-10-14.json').write_text(json.dumps(result,indent=2)+'\n')
