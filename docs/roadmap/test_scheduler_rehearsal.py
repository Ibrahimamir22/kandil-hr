"""Native wall-clock scheduled-hook test in the separate Docker sandbox.

Requires deployment/prepare_scheduler_site.py to have provisioned the fresh site.
Retains raw diagnostics privately; never sends mail or starts shared workers.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

APP=Path(__file__).resolve().parents[2]
DEV=APP.parents[3]
CONTAINER='kandil-hr-scheduler-rehearsal'
MODULE='kandil_hr.foundation.scheduler_rehearsal.'
SITE='kandil-parity.localhost'


def hashes():
    paths=[*sorted((APP/'kandil_hr').rglob('*.py')),APP/'deployment/prepare_scheduler_site.py',Path(__file__).resolve()]
    return {str(p.relative_to(APP)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}


def main():
    marker=APP/'deployment/.local/workspace/kandil-scheduler-isolation.json'
    m=json.loads(marker.read_text());run_id=m['run_id'];assert m['status']=='ready'
    evidence=APP/'docs/roadmap/evidence'/('scheduler-rehearsal-'+run_id+'.json')
    if evidence.exists():raise RuntimeError('Existing attempt evidence retained; inspect before rerun')
    log=Path('/tmp')/('kandil-scheduler-rehearsal-'+run_id+'.log')
    log.touch(mode=0o600);log.chmod(0o600)
    result=dict(run_id=run_id,site=SITE,stack='kandil-hr-sandbox',
        checked_at=datetime.datetime.now(datetime.UTC).isoformat(),source_before=hashes(),checks=[],snapshots={},
        limits=['Separate existing sandbox DB/Redis, fresh synthetic site and opt-in marker; no external email or browser activity.',
            'Native enqueue_events_for_site timer and run_scheduled_job/execute_job on real SimpleWorker; global all-sites daemon intentionally not started.',
            'Synthetic seven-day calendar, historical waiting/last-execution values and 75-second retry due time; no mocked wall clock.',
            'Default production 240-second All interval shortened to 60 on the isolated site only; Daily/Hourly hook frequencies retained.',
            'Not production deployment, 1,000-user load, infrastructure disaster recovery or HR policy/UAT acceptance.'])
    processes=[];prepared=False;armed=False
    def command(method,*args):
        return ['docker','exec','-w','/workspace/frappe-bench',CONTAINER,'bench','--site',SITE,'execute',MODULE+method,'--args',json.dumps([run_id,*args])]
    def call(method,*args):
        p=subprocess.run(command(method,*args),capture_output=True,text=True,timeout=180)
        with log.open('a') as f:f.write(method+'\n'+p.stdout+'\n'+p.stderr+'\n')
        if p.returncode:raise RuntimeError(method+' failed; private diagnostics retained')
        for line in reversed(p.stdout.splitlines()):
            if line.startswith('{'):return json.loads(line)
        raise RuntimeError(method+' returned no structured result')
    def check(label,valid):
        result['checks'].append(dict(check=label,status='PASS' if valid else 'FAIL'))
        print(json.dumps(result['checks'][-1]),flush=True)
        if not valid:raise AssertionError(label)
    def spawn(method):
        handle=log.open('a');p=subprocess.Popen(command(method),stdout=handle,stderr=handle)
        processes.append((method,p,handle));return p
    def observed(key):
        value=call('inspect');result['snapshots'][key]=value;return value
    def completed(s,method):
        return sum(row['status']=='Complete' and s['job_methods'][row['scheduled_job_type']]==method for row in s['logs'])
    def wait_for(key,predicate,timeout=240):
        end=time.monotonic()+timeout
        while time.monotonic()<end:
            # Process liveness is checked before every wait, never assumed from a PID file.
            for method,p,_ in processes:
                if p.poll() is not None and (method=='scheduler_loop' or p is active_worker):
                    raise RuntimeError('Active worker terminated before expected result')
            s=call('inspect')
            if predicate(s):result['snapshots'][key]=s;return s
            time.sleep(3)
        result['snapshots'][key+'_timeout']=s
        raise TimeoutError(key+' did not reach its expected native scheduled state')
    def shared():
        p=subprocess.run(['docker','compose','exec','-T','-w','/workspace/frappe-bench','parity-web','bench','--site',SITE,
            'execute','kandil_hr.foundation.worker_recovery_fixture.shared_queues','--args',json.dumps([run_id])],
            cwd=DEV,capture_output=True,text=True,timeout=30)
        if p.returncode:raise RuntimeError('Cannot verify shared development queue snapshot')
        for line in reversed(p.stdout.splitlines()):
            if line.startswith('{'):return json.loads(line)
        raise RuntimeError('Missing shared queue snapshot')
    active_worker=None
    baseline=shared()
    try:
        result['prepare']=call('prepare');prepared=True
        before=observed('before_scheduler')
        check('Prepared pending reminder, delayed retry and missed disable callback',before['reminder_count']==0
            and before['retry']['status']=='Retry' and not before['handoff']['lead_cleared'] and not before['handoff']['owner_cleared'])
        result['arm']=call('arm');armed=True
        check('Installed production hook frequencies retained', sorted(result['arm']['hook_frequencies'].values())==['All','Daily','Hourly'])
        scheduler=spawn('scheduler_loop');active_worker=spawn('worker')
        first=wait_for('first_scheduled_effects',lambda s:s['reminder_count']==4 and s['reminder_receipts']==4
            and s['handoff']['owner_cleared'] and s['handoff']['audits']==1)
        check('Native scheduled daily SLA creates only highest due milestone and delivers all four local notices',
            first['reminder_statuses']==['Delivered locally']*4 and first['reminder_stages']==['expiry']*4 and first['reminder_captures']==4)
        check('Expiry keeps request pending and seats reserved',first['pending_status']=='Pending'
            and sum(x['reserved'] for x in first['ledgers'])==1)
        check('Hourly fallback clears lead, application and next-action owner without guessing a replacement',
            first['handoff']['lead_cleared'] and first['handoff']['next_owner_cleared'] and first['handoff']['state']=='Unassigned')
        check('Native scheduled-job logs prove SLA, delivery and handoff execution',
            all(completed(first,m)>0 for m in result['arm']['hook_frequencies']))
        # Check the actual due timestamp, not elapsed host time. A slow first scan
        # must not be mislabeled as an early-retry proof.
        if first['now'] < first['retry_due']:
            check('Scheduled scan respects future retry timestamp',first['retry']['status']=='Retry' and not first['retry']['receipt'])
        else:
            raise AssertionError('First observation missed early retry window; do not claim early proof')
        due=wait_for('automatic_due_retry',lambda s:s['retry']['status']=='Delivered locally')
        check('Wall-clock due retry delivered by a later scheduled scan',due['now']>=due['retry_due']
            and due['retry']['attempts']==2 and due['retry']['receipt'] and due['retry']['captures']==1)
        call('stop_worker');active_worker.wait(timeout=30)
        check('First worker stopped and terminal state observed',active_worker.returncode==0)
        active_worker=None
        call('queue_during_outage')
        outage=observed('worker_outage')
        check('Outbox message waits while worker is stopped',outage['outage']['status']=='Pending' and not outage['outage']['receipt'])
        active_worker=spawn('worker')
        recovered=wait_for('scheduled_restart_recovery',lambda s:s['outage']['status']=='Delivered locally'
            and all(completed(s,m)>completed(due,m) for m in result['arm']['hook_frequencies']))
        check('Scheduler redrives outstanding message after worker restart',recovered['outage']['attempts']==1
            and recovered['outage']['captures']==1 and recovered['outage']['receipt'])
        check('Repeated scheduled hooks preserve one reminder set and one handoff',recovered['reminder_count']==4
            and recovered['reminder_receipts']==4 and recovered['reminder_captures']==4 and recovered['handoff']==due['handoff'])
        check('Scheduled hooks have no failed job log',not any(row['status']=='Failed' for row in recovered['logs']))
        result['status']='PASS'
    except Exception as exc:
        result['status']='FAIL';result['error_type']=type(exc).__name__;print(str(exc),flush=True)
    finally:
        try:
            if armed:
                call('stop')
                call('stop_worker')
            for method,p,handle in processes:
                p.wait(timeout=30);handle.close()
            if not prepared and (APP/'deployment/.local/workspace/frappe-bench/sites'/SITE/'private'/('kandil-portal-'+run_id+'.json')).exists():
                result['cleanup']=call('retire_failed_prepare')
            if prepared:
                result['cleanup']=call('cleanup')
                check('Retired six accounts, zero capacity commitments and scheduler paused',result['cleanup']['accounts_disabled']==6
                    and result['cleanup']['all_fixture_ledgers_zero'] and result['cleanup']['scheduler_paused'])
            check('Shared development queue membership unchanged',shared()==baseline)
        except Exception as exc:
            result['status']='FAIL';result['cleanup_error_type']=type(exc).__name__;print(str(exc),flush=True)
        result['source_unchanged']=result['source_before']==hashes()
        if not result['source_unchanged']:result['status']='FAIL'
        evidence.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(dict(status=result['status'],checks=len(result['checks']),evidence=str(evidence))),flush=True)
    if result['status']!='PASS':raise SystemExit(1)


if __name__=='__main__':main()
