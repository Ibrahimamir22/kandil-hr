"""Add empty revocation evidence on the two named isolated synthetic sites only."""
import datetime
import json
import os
from pathlib import Path
import subprocess

APP=Path(__file__).resolve().parents[2]
DEV=APP.parents[3]
DT='Kandil Consent Revocation'
result={'checked_at':datetime.datetime.now(datetime.UTC).isoformat(),'sites':[]}
for site in ('kandil-parity.localhost','kandil-review.localhost'):
    if site=='kandil-parity.localhost':
        cmd=['docker','compose','exec','-T','-w','/workspace/frappe-bench','parity-web'];cwd=DEV;env=None
    else:
        cmd=['docker','compose','-f','deployment/review.compose.yaml','exec','-T','web'];cwd=APP
        env=dict(os.environ,KANDIL_DEV_WORKSPACE=str(DEV/'development'))
    cmd+=['bench','--site',site]
    def run(args):
        x=subprocess.run(cmd+args,cwd=cwd,env=env,capture_output=True,text=True)
        if x.returncode:
            p=Path('/tmp/kandil-revocation-migration-error.txt');p.touch(mode=0o600);p.chmod(0o600);p.write_text(x.stdout+x.stderr)
            raise RuntimeError('Migration failed; private diagnostic retained')
        return x.stdout
    def proof():
        return json.loads(next(x for x in reversed(run(['execute','kandil_hr.privacy.consent.schema_proof']).splitlines()) if x.startswith('{')))
    before=proof()
    run(['reload-doc','kandil_hr','doctype','kandil_consent_revocation'])
    after=proof()
    for table,value in before['tables'].items():
        if table==DT and value is None:assert after['tables'][table]['count']==0
        else:assert after['tables'][table]==value,table
    assert {k:v for k,v in before.items() if k!='tables'}=={k:v for k,v in after.items() if k!='tables'}
    result['sites'].append(dict(site=site,before=before,after=after,existing_records_unchanged=True,no_records_seeded=True))
    print(json.dumps(dict(site=site,existing_records_unchanged=True,no_records_seeded=True)),flush=True)
(APP/'docs/roadmap/evidence/consent-revocation-schema-2026-10-14.json').write_text(json.dumps(result,indent=2)+'\n')
