"""Preserve the dedicated synthetic review site while enabling the consent UI."""
import datetime,json,os,subprocess
from pathlib import Path
app=Path(__file__).resolve().parents[2]
env=dict(os.environ,KANDIL_DEV_WORKSPACE=str(app.parents[2]))
cmd=['docker','compose','-f','deployment/review.compose.yaml','exec','-T','web','bench','--site','kandil-review.localhost']
def run(args):
    result=subprocess.run(cmd+args,cwd=app,env=env,capture_output=True,text=True,check=False)
    if result.returncode:
        p=Path('/tmp/kandil-consent-review-error.txt');p.touch(mode=0o600);p.chmod(0o600);p.write_text(result.stdout+result.stderr)
        raise RuntimeError('Review activation diagnostic saved privately')
    return result.stdout
def inspect():return json.loads(next(x for x in reversed(run(['execute','kandil_hr.portal.review_setup.inspect']).splitlines()) if x.startswith('{')))
before=inspect()
for slug in ('kandil_consent_invitation','kandil_consent_acceptance'):run(['reload-doc','kandil_hr','doctype',slug])
after=inspect()
for dt,value in before['tables'].items():
    if value is not None:assert after['tables'][dt]==value
    else:assert after['tables'][dt]['count']==0
activation=json.loads(next(x for x in reversed(run(['execute','kandil_hr.portal.review_setup.enable_consent_review']).splitlines()) if x.startswith('{')))
assert after==inspect()
result=dict(checked_at=datetime.datetime.now(datetime.UTC).isoformat(),before=before,after=after,activation=activation)
(app/'docs/roadmap/evidence/consent-review-activation-2026-10-14.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'preserved':True,'consent_flag_enabled':True,'notice_and_consent_records_seeded':False}))
