"""Explicit schema-only upgrade for the two isolated synthetic sites; never seeds records."""
import subprocess,json,os,datetime
from pathlib import Path
app=Path(__file__).resolve().parents[2]
dev=app.parents[3]
result={'checked_at':datetime.datetime.now(datetime.UTC).isoformat(),'sites':[]}
for site in ['kandil-parity.localhost','kandil-review.localhost']:
 env=os.environ.copy()
 if site=='kandil-parity.localhost':
  cmd=['docker','compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site',site];cwd=dev
 else:
  env['KANDIL_DEV_WORKSPACE']=str(dev/'development');cmd=['docker','compose','-f','deployment/review.compose.yaml','exec','-T','web','bench','--site',site];cwd=app
 def run(args):
  x=subprocess.run(cmd+args,cwd=cwd,env=env,capture_output=True,text=True)
  if x.returncode:
   private=Path('/tmp/kandil-history-migration-error.txt');private.touch(mode=0o600,exist_ok=True);private.chmod(0o600);private.write_text(x.stdout+x.stderr);raise RuntimeError('See private migration diagnostic')
  return x.stdout
 def proof():
  raw=run(['execute','kandil_hr.candidates.closure_history.schema_proof'])
  return json.loads(next(x for x in reversed(raw.splitlines()) if x.startswith('{')))
 before=proof()
 run(['reload-doc','kandil_hr','doctype','kandil_candidate_reopening'])
 run(['reload-doc','kandil_hr','doctype','kandil_candidate_closure'])
 after=proof()
 assert all(after['tables'][k]==v for k,v in before['tables'].items() if v is not None),(site,'Row changes')
 assert not after['application_unique'] and after['reopening_unique']
 # Repeating normal schema sync must preserve data and the index state.
 run(['reload-doc','kandil_hr','doctype','kandil_candidate_closure'])
 repeated=proof();assert repeated==after
 result['sites'].append(dict(before=before,after=after,repeat_unchanged=True,existing_business_rows_unchanged=True))
 print(json.dumps({'site':site,'existing_rows_unchanged':True,'reopening_unique':True,'application_unique':False}),flush=True)
path=app/'docs/roadmap/evidence/candidate-history-schema-2026-10-14.json';path.write_text(json.dumps(result,indent=2)+'\n')
