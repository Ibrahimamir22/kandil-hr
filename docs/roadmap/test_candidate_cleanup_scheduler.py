"""Native scheduled recovery cleanup, bounded batches and worker restart on separate DB/Redis."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import time

APP=Path(__file__).resolve().parents[2];DEV=APP.parents[3]
CONTAINER='kandil-hr-scheduler-rehearsal';SITE='kandil-parity.localhost'
BASE='kandil_hr.foundation.scheduler_rehearsal.'
MODULE='kandil_hr.candidates.recovery_rehearsal.'


def hashes():
    paths=[*sorted((APP/'kandil_hr').rglob('*.py')),Path(__file__).resolve()]
    return {str(p.relative_to(APP)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}


def main():
    marker=json.loads((APP/'deployment/.local/workspace/kandil-scheduler-isolation.json').read_text());run=marker['run_id'];assert marker['status']=='ready'
    output=APP/'docs/roadmap/evidence'/('candidate-cleanup-scheduler-'+run+'.json')
    if output.exists():raise RuntimeError('Retain prior attempt; inspect rather than rerun')
    log=Path('/tmp')/('kandil-candidate-cleanup-scheduler-'+run+'.log');log.touch(mode=0o600);log.chmod(0o600)
    result=dict(run_id=run,status='RUNNING',checked_at=datetime.datetime.now(datetime.UTC).isoformat(),source_before=hashes(),checks=[],snapshots={},
        limits=['Separate sandbox DB/Redis; fresh synthetic cohort; only the production Hourly cleanup hook enabled.',
            'Native enqueue_events_for_site, execute_job and Scheduled Job Log; no production cleanup implementation or clock mocked.',
            '106 envelopes aged during fixture setup; last_execution explicitly made due for repeat batches, not an hour-long cadence proof.',
            'Real graceful worker outage/restart; no process crash or database outage injected. No shared workers or external email.',
            'Not production latency/load, privacy-policy acceptance or full HR/UAT.'])
    processes=[];prepared=False;prepare_attempted=False;armed=False;active_worker=None
    def command(method):
        module=BASE if method in ('scheduler_loop','worker','stop','stop_worker') else MODULE
        return ['docker','exec','-w','/workspace/frappe-bench',CONTAINER,'bench','--site',SITE,'execute',module+method,'--args',json.dumps([run])]
    def call(method):
        p=subprocess.run(command(method),capture_output=True,text=True,timeout=180)
        with log.open('a') as f:f.write(method+'\n'+p.stdout+'\n'+p.stderr+'\n')
        if p.returncode:raise RuntimeError(method+' failed; private diagnostic retained')
        for line in reversed(p.stdout.splitlines()):
            if line.startswith('{'):return json.loads(line)
        raise RuntimeError('Missing structured '+method+' result')
    def check(label,value):
        result['checks'].append(dict(check=label,status='PASS' if value else 'FAIL'));print(json.dumps(result['checks'][-1]),flush=True)
        if not value:raise AssertionError(label)
    def spawn(method):
        f=log.open('a');p=subprocess.Popen(command(method),stdout=f,stderr=f);processes.append((method,p,f));return p
    def snapshot(label):
        s=call('inspect');result['snapshots'][label]=s;return s
    def wait_for(label,predicate,timeout=240):
        end=time.monotonic()+timeout
        while time.monotonic()<end:
            if any(p.poll() is not None for method,p,_ in processes if method=='scheduler_loop' or p is active_worker):raise RuntimeError('Observed active scheduler/worker exit before expected effect')
            s=call('inspect')
            if predicate(s):result['snapshots'][label]=s;return s
            time.sleep(3)
        result['snapshots'][label+'_timeout']=s;raise TimeoutError(label)
    def shared():
        p=subprocess.run(['docker','compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site',SITE,'execute','kandil_hr.foundation.worker_recovery_fixture.shared_queues','--args',json.dumps([run])],cwd=DEV,capture_output=True,text=True,timeout=40)
        if p.returncode:raise RuntimeError('Shared queue observation failed')
        return json.loads(next(l for l in reversed(p.stdout.splitlines()) if l.startswith('{')))
    baseline=shared()
    try:
        prepare_attempted=True;result['prepare']=call('prepare');prepared=True
        before=snapshot('before')
        check('106 due envelopes and one future copy exist with candidate mode disabled',before['expired_total']==106 and before['payloads_remaining']==106 and before['future_preserved'] and not before['candidate_mode_enabled'])
        result['arm']=call('arm');armed=True
        check('Production Hourly hook is the isolated scheduled target',result['arm']['frequency']=='Hourly')
        spawn('scheduler_loop');active_worker=spawn('worker')
        first=wait_for('first_batch',lambda x:x['complete_logs']>=1 and x['erased']==100)
        check('First native scheduled execution removes only its default 100-row batch',first['payloads_remaining']==6 and first['future_preserved'] and first['business_unchanged'])
        call('stop_worker');active_worker.wait(timeout=30)
        check('Worker stop is observed before creating an overdue retry',active_worker.returncode==0);active_worker=None
        call('make_due');queued=wait_for('worker_outage',lambda x:x['queued']>0)
        check('Scheduler queues outstanding cleanup while worker is absent',queued['erased']==100 and queued['payloads_remaining']==6 and queued['business_unchanged'])
        active_worker=spawn('worker')
        recovered=wait_for('restart_batch',lambda x:x['complete_logs']>=2 and x['erased']==106)
        check('Restarted worker clears remaining expired copies and preserves future copy',recovered['payloads_remaining']==0 and recovered['future_preserved'] and recovered['business_unchanged'])
        call('make_due');repeated=wait_for('repeated_scan',lambda x:x['complete_logs']>=3)
        check('Repeated scheduled cleanup preserves exact business rows and original tombstones',repeated['erased']==106 and repeated['business_unchanged'] and repeated['future_preserved'])
        check('No scheduled cleanup failures and candidate mode remains disabled',not repeated['failed_logs'] and not repeated['candidate_mode_enabled'])
        result['status']='PASS'
    except Exception as exc:
        result['status']='FAIL';result['error_type']=type(exc).__name__;print(str(exc),flush=True)
    finally:
        try:
            if armed:call('stop');call('stop_worker')
            for _,p,f in processes:p.wait(timeout=30);f.close()
            if prepare_attempted:
                result['cleanup']=call('cleanup')
                if prepared:check('Accounts retired, capacity zero and scheduler paused',result['cleanup']['accounts_disabled']==6 and result['cleanup']['all_fixture_ledgers_zero'] and result['cleanup']['scheduler_paused'])
            check('Shared review queue membership unchanged',shared()==baseline)
        except Exception as exc:
            result['status']='FAIL';result['cleanup_error_type']=type(exc).__name__;print(str(exc),flush=True)
        result['source_unchanged']=result['source_before']==hashes()
        if not result['source_unchanged']:result['status']='FAIL'
        output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(status=result['status'],evidence=str(output))),flush=True)
    if result['status']!='PASS':raise SystemExit(1)


if __name__=='__main__':main()
