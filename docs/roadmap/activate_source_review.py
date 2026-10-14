"""Opt the preserved synthetic review site into controlled sources; no business writes."""
import datetime,json,os,subprocess
from pathlib import Path
app=Path(__file__).resolve().parents[2];workspace=app.parents[2];site='kandil-review.localhost'
config=json.loads((app.parents[1]/'sites'/site/'site_config.json').read_text())
assert config.get('kandil_review_environment') or config.get('review_environment'), 'Review guard required'
assert config.get('mute_emails') and config.get('pause_scheduler'), 'Review delivery guards required'
cmd=['docker','compose','-f','deployment/review.compose.yaml','exec','-T','web','bench','--site',site]
env=dict(os.environ,KANDIL_DEV_WORKSPACE=str(workspace))
def run(args):
 p=subprocess.run(cmd+args,cwd=app,env=env,text=True,capture_output=True)
 if p.returncode:raise RuntimeError('Review activation command failed; output withheld')
 return p.stdout

def proof():return json.loads(next(x for x in reversed(run(['execute','kandil_hr.sourcing.sources.schema_proof']).splitlines()) if x.startswith('{')))
before=proof();run(['set-config','kandil_source_catalog_enabled','1']);after=proof();assert before==after
result=dict(site=site,checked_at=datetime.datetime.now(datetime.UTC).isoformat(),source_catalog_enabled=True,previous_flag=config.get('kandil_source_catalog_enabled'),business_records_unchanged=True,before=before,after=after,limits=['Preserved synthetic review only; no company-data or production activation.'])
(app/'docs/roadmap/evidence/source-catalog-review-activation-2026-10-14.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(site=site,source_catalog_enabled=True,business_records_unchanged=True)))
