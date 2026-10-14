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
            out=Path('/tmp/kandil-screening-migration-error.txt');out.touch(mode=0o600);out.chmod(0o600);out.write_text(p.stdout+p.stderr);raise RuntimeError('Private migration diagnostic saved')
        return p.stdout
    def proof():return json.loads(next(line for line in reversed(run(['execute','kandil_hr.candidates.stages.schema_proof']).splitlines()) if line.startswith('{')))
    before=proof();run(['reload-doc','kandil_hr','doctype','kandil_candidate_recovery']);run(['execute','kandil_hr.candidates.stages.install']);after=proof()
    expected=list(before['status_options'])
    if 'Screening' not in expected:expected.insert(expected.index('Replied')+1,'Screening')
    assert after['status_options']==expected
    assert {k:v for k,v in before.items() if k!='status_options'}=={k:v for k,v in after.items() if k!='status_options'}
    run(['execute','kandil_hr.candidates.stages.install']);assert proof()==after
    result['sites'].append(dict(site=site,before=before,after=after,business_records_unchanged=True,repeat_unchanged=True))
    print(json.dumps(dict(site=site,business_records_unchanged=True,screening_activated=False)),flush=True)
(app/'docs/roadmap/evidence/screening-schema-2026-10-14.json').write_text(json.dumps(result,indent=2)+'\n')
