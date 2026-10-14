"""Install empty notice schema on the two explicit synthetic sites only."""
import subprocess,os,json,datetime
from pathlib import Path
app=Path(__file__).resolve().parents[2];dev=app.parents[3]
result={'checked_at':datetime.datetime.now(datetime.UTC).isoformat(),'sites':[]}
for site in ('kandil-parity.localhost','kandil-review.localhost'):
 env=os.environ.copy()
 if site=='kandil-parity.localhost':cmd=['docker','compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site',site];cwd=dev
 else:
  env['KANDIL_DEV_WORKSPACE']=str(dev/'development');cmd=['docker','compose','-f','deployment/review.compose.yaml','exec','-T','web','bench','--site',site];cwd=app
 def run(args):
  x=subprocess.run(cmd+args,cwd=cwd,env=env,capture_output=True,text=True)
  if x.returncode:
   p=Path('/tmp/kandil-notice-migration-error.txt');p.touch(mode=0o600);p.chmod(0o600);p.write_text(x.stdout+x.stderr);raise RuntimeError('Private migration diagnostic saved')
  return x.stdout
 def proof():return json.loads(next(x for x in reversed(run(['execute','kandil_hr.candidates.closure_history.schema_proof']).splitlines()) if x.startswith('{')))
 before=proof();run(['reload-doc','kandil_hr','doctype','kandil_privacy_notice_revision']);after=proof();assert before==after
 count=int(run(['execute','frappe.db.count','--args','["Kandil Privacy Notice Revision"]']).strip() or '0');assert count==0
 result['sites'].append(dict(site=site,before=before,after=after,business_records_unchanged=True,notice_revisions=0))
 print(json.dumps({'site':site,'records_unchanged':True,'no_notices_seeded':True}),flush=True)
(app/'docs/roadmap/evidence/privacy-notice-schema-2026-10-14.json').write_text(json.dumps(result,indent=2)+'\n')
