"""Install empty consent schemas on the isolated parity site only."""
import subprocess,json,datetime
from pathlib import Path
app=Path(__file__).resolve().parents[2];dev=app.parents[3]
result={'checked_at':datetime.datetime.now(datetime.UTC).isoformat(),'sites':[]}
for site in ('kandil-parity.localhost',):
 cmd=['docker','compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site',site];cwd=dev
 def run(args):
  x=subprocess.run(cmd+args,cwd=cwd,capture_output=True,text=True)
  if x.returncode:
   p=Path('/tmp/kandil-consent-migration-error.txt');p.touch(mode=0o600);p.chmod(0o600);p.write_text(x.stdout+x.stderr);raise RuntimeError('Private migration diagnostic saved')
  return x.stdout
 def proof():return json.loads(next(x for x in reversed(run(['execute','kandil_hr.candidates.closure_history.schema_proof']).splitlines()) if x.startswith('{')))
 before=proof()
 for slug in ('kandil_consent_invitation','kandil_consent_acceptance'):run(['reload-doc','kandil_hr','doctype',slug])
 after=proof();assert before==after
 counts={dt:int(run(['execute','frappe.db.count','--args',json.dumps([dt])]).strip() or '0') for dt in ('Kandil Consent Invitation','Kandil Consent Acceptance')}
 assert all(n==0 for n in counts.values())
 result['sites'].append(dict(site=site,before=before,after=after,business_records_unchanged=True,consent_records=counts))
 print(json.dumps({'site':site,'records_unchanged':True,'no_consent_seeded':True}),flush=True)
(app/'docs/roadmap/evidence/consent-service-schema-2026-10-14.json').write_text(json.dumps(result,indent=2)+'\n')
