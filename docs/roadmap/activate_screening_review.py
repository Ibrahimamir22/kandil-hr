"""Enable the verified Screening workflow on preserved synthetic review only."""
import datetime,json,os,subprocess
from pathlib import Path
app=Path(__file__).resolve().parents[2];dev=app.parents[3]
env=dict(os.environ,KANDIL_DEV_WORKSPACE=str(dev/'development'))
base=['docker','compose','-f','deployment/review.compose.yaml']
cmd=base+['exec','-T','web','bench','--site','kandil-review.localhost']
def run(args):
    p=subprocess.run(cmd+args,cwd=app,env=env,capture_output=True,text=True)
    if p.returncode:raise RuntimeError('Review command failed; no private output exposed')
    return p.stdout
def proof():return json.loads(next(x for x in reversed(run(['execute','kandil_hr.candidates.stages.schema_proof']).splitlines()) if x.startswith('{')))
before=proof();assert 'Screening' in before['status_options']
run(['set-config','kandil_candidate_screening_enabled','1'])
after=proof();assert after['screening_enabled']
assert {k:v for k,v in before.items() if k!='screening_enabled'}=={k:v for k,v in after.items() if k!='screening_enabled'}
subprocess.run(base+['restart','web'],cwd=app,env=env,check=True,capture_output=True)
result=dict(checked_at=datetime.datetime.now(datetime.UTC).isoformat(),before=before,after=after,business_records_unchanged=True,seeded_records=False,scope='Preserved synthetic review site only')
(app/'docs/roadmap/evidence/screening-review-activation-2026-10-14.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(review_screening_enabled=True,business_records_unchanged=True,no_records_seeded=True)))
