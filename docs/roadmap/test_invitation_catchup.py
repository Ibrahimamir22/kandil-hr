"""Wall-clock invitation catch-up on separate DB/Redis; no shared worker."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import time

APP=Path(__file__).resolve().parents[2];DEV=APP.parents[3]
CONTAINER='kandil-hr-scheduler-rehearsal';SITE='kandil-parity.localhost'
BASE='kandil_hr.foundation.scheduler_rehearsal.'
MODULE='kandil_hr.foundation.invitation_scheduler_rehearsal.'


def hashes():
    paths=[*sorted((APP/'kandil_hr').rglob('*.py')),Path(__file__).resolve()]
    return {str(p.relative_to(APP)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}


def main():
    marker=json.loads((APP/'deployment/.local/workspace/kandil-scheduler-isolation.json').read_text());run=marker['run_id'];assert marker['status']=='ready'
    output=APP/'docs/roadmap/evidence'/('invitation-catchup-'+run+'.json')
    if output.exists():raise RuntimeError('Retain prior attempt; inspect rather than rerun')
    log=Path('/tmp')/('kandil-invitation-catchup-'+run+'.log');log.touch(mode=0o600);log.chmod(0o600)
    result=dict(run_id=run,status='RUNNING',checked_at=datetime.datetime.now(datetime.UTC).isoformat(),source_before=hashes(),checks=[],snapshots={},
        limits=['Separate sandbox DB/Redis; reused retired synthetic site with a fresh cohort. Only invitation/outbox scheduled hooks enabled.',
            'Real wall-clock native enqueue_events_for_site, execute_job and Scheduled Job Log. All interval shortened to 60 seconds on this site only.',
            'Setup deliberately drops event callbacks; no runtime clock or invitation/scheduler implementation mocked.',
            'No external email, browser, production latency/load or HR acceptance. Future-date boundary remains native controlled-date evidence.'])
    processes=[];prepared=False;prepare_attempted=False;armed=False
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
            if any(p.poll() is not None for _,p,_ in processes):raise RuntimeError('Observed scheduler/worker exit before expected effect')
            s=call('inspect')
            if predicate(s):result['snapshots'][label]=s;return s
            time.sleep(3)
        result['snapshots'][label+'_timeout']=s;raise TimeoutError(label)
    def delivered(s):return {r['role'] for r in s['notices'] if r['status']=='Delivered locally'}
    def completions(s):return {m:sum(l['method']==m and l['status']=='Complete' for l in s['logs']) for m in (MODULE.replace('foundation.invitation_scheduler_rehearsal.','recruitment.invitations.')+'process_pending','kandil_hr.foundation.outbox.process_pending')}
    def shared():
        p=subprocess.run(['docker','compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site',SITE,'execute','kandil_hr.foundation.worker_recovery_fixture.shared_queues','--args',json.dumps([run])],cwd=DEV,capture_output=True,text=True,timeout=40)
        if p.returncode:raise RuntimeError('Shared queue observation failed')
        return json.loads(next(l for l in reversed(p.stdout.splitlines()) if l.startswith('{')))
    baseline=shared()
    try:
        prepare_attempted=True
        result['prepare']=call('prepare');prepared=True
        check('Committed pending request and active delegation have no invitation before scheduler',not snapshot('before')['notices'])
        result['arm']=call('arm');armed=True
        check('Production hooks registered as All; isolated interval is 60 seconds',set(result['arm']['frequencies'].values())=={'All'} and result['arm']['interval']==60)
        spawn('scheduler_loop');spawn('worker')
        first=wait_for('first_delivery',lambda s:delivered(s)=={'manager','recruiter'})
        check('Scheduled catch-up generates and delivers principal and delegated invitations',len(first['notices'])==2 and all(r['receipt'] and r['captures']==1 for r in first['notices']))
        check('Inactive request receives no invitation; pending capacity unchanged',all(r['active_reference'] for r in first['notices']) and first['pending_status']=='Pending' and first['cancelled_status']=='Cancelled' and sum(r['reserved'] for r in first['ledgers'])==1)
        check('Native scheduled logs prove generation and outbox delivery',all(n>0 for n in completions(first).values()))
        result['late_grant']=call('late_grant')
        late=wait_for('late_grant_delivery',lambda s:delivered(s)=={'manager','recruiter','hr'} and all(completions(s)[m]>n for m,n in completions(first).items()))
        check('Later committed delegation recovered despite dropped event callback',len(late['notices'])==3 and result['late_grant']['event_callback_dropped'])
        check('Repeated scheduled scans keep one receipt and MIME capture per invitation',all(r['receipt'] and r['captures']==1 for r in late['notices']))
        check('Scheduled hooks have no failed job log',not any(l['status']=='Failed' for l in late['logs']))
        result['status']='PASS'
    except Exception as exc:
        result['status']='FAIL';result['error_type']=type(exc).__name__;print(str(exc),flush=True)
    finally:
        try:
            if armed:call('stop');call('stop_worker')
            for _,p,f in processes:p.wait(timeout=30);f.close()
            if prepare_attempted:
                result['cleanup']=call('cleanup')
                if prepared:check('Accounts retired, grants revoked, capacity zero and scheduler paused',result['cleanup']['accounts_disabled']==6 and result['cleanup']['all_fixture_ledgers_zero'] and result['cleanup']['all_fixture_delegations_revoked'] and result['cleanup']['scheduler_paused'])
            check('Shared review queue membership unchanged',shared()==baseline)
        except Exception as exc:
            result['status']='FAIL';result['cleanup_error_type']=type(exc).__name__;print(str(exc),flush=True)
        result['source_unchanged']=result['source_before']==hashes()
        if not result['source_unchanged']:result['status']='FAIL'
        output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(status=result['status'],evidence=str(output))),flush=True)
    if result['status']!='PASS':raise SystemExit(1)


if __name__=='__main__':main()
