"""Actual independent RQ processes on one synthetic queue; no general scheduler.

Run from the app with Python 3. Exact private fault cohorts are retained and
retired; raw output stays outside Git. No credentials are read by this runner.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import uuid

APP = Path(__file__).resolve().parents[2]
DEV = APP.parents[3]
PREFIX = 'kandil_hr.foundation.worker_recovery_fixture.'


def hashes():
    return {str(p.relative_to(APP)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((APP / 'kandil_hr').rglob('*.py'))}


def main():
    run_id = uuid.uuid4().hex[:12]
    result = dict(run_id=run_id, checked_at=datetime.datetime.now(datetime.UTC).isoformat(),
        site='kandil-parity.localhost', source_before=hashes(), checks=[], snapshots={},
        limits=['Isolated SimpleWorker uses real Frappe execute_job and production process_one; no general worker or Frappe scheduler started.',
                'Retry due timestamps are moved only on exact test rows; no automatic timed retry or scheduled SLA claim.',
                'Local Notification Log and mail capture only; no external email, production capacity or UAT.'])
    log = Path('/tmp') / ('kandil-worker-recovery-' + run_id + '.log')
    fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(fd)

    def call(method, *args, exit_code=0):
        run = subprocess.run(['docker', 'compose', 'exec', '-T', '-w', '/workspace/frappe-bench',
            'parity-web', 'bench', '--site', result['site'], 'execute', PREFIX + method,
            '--args', json.dumps([run_id, *args])], cwd=DEV, capture_output=True, text=True, timeout=90)
        with log.open('a') as handle:
            handle.write(method + '\n' + run.stdout + '\n' + run.stderr + '\n')
        if run.returncode != exit_code:
            raise AssertionError(f'{method}: expected process exit {exit_code}, got {run.returncode}; private diagnostic {log}')
        if exit_code:
            return dict(exit_code=run.returncode)
        for line in reversed(run.stdout.splitlines()):
            if line.startswith('{'):
                return json.loads(line)
        raise AssertionError(f'No structured result: {method}')

    def check(title, valid):
        result['checks'].append(dict(check=title, status='PASS' if valid else 'FAIL'))
        print(json.dumps(result['checks'][-1]), flush=True)
        if not valid:
            raise AssertionError(title)

    def snapshot(key):
        value = call('inspect')
        result['snapshots'][key] = value
        check(key + ': unrelated queue membership unchanged', value['shared_queues_unchanged'])
        return value

    def work(label, mode='normal', expected_exit=0):
        call('enqueue', label, mode)
        return call('work', exit_code=expected_exit)

    prepared = False
    try:
        result['prepare'] = call('prepare')
        prepared = True
        work('before_commit', 'before_commit', 91)
        s = snapshot('death_before_commit')
        r = s['notices']['before_commit']
        check('Actual process died after receipt writes, before commit', s['marker']['point'] == 'before_commit' and s['marker']['writes_created'])
        check('Database rolls back all effects after process death', r['status'] == 'Pending' and r['attempts'] == 0 and r['receipt_count'] == r['capture_count'] == 0)
        work('before_commit')
        r = snapshot('restart_before_commit')['notices']['before_commit']
        check('New worker recovers due row exactly once', r['status'] == 'Delivered locally' and r['attempts'] == r['receipt_count'] == r['capture_count'] == 1)
        work('after_commit', 'after_commit', 92)
        s = snapshot('death_after_commit')
        r = s['notices']['after_commit']
        check('Committed delivery survives process death before queue acknowledgement', s['marker']['point'] == 'after_commit' and r['status'] == 'Delivered locally' and r['receipt_count'] == r['capture_count'] == 1)
        work('after_commit')
        r = snapshot('restart_after_commit')['notices']['after_commit']
        check('Replayed acknowledged-late job cannot duplicate effects', r['attempts'] == r['receipt_count'] == r['capture_count'] == 1)
        # Failure in the same worker must not prevent the next independent job.
        call('enqueue', 'retry', 'fail')
        call('enqueue', 'healthy')
        call('work')
        s = snapshot('recoverable_failure')
        r = s['notices']['retry']
        check('Thrown post-write failure rolls back effects and records sanitized Retry', r['status'] == 'Retry' and r['attempts'] == 1 and r['receipt_count'] == r['capture_count'] == 0 and r['last_error'] == 'Local notification creation failed: RuntimeError')
        check('Worker continues to unrelated healthy test job', s['notices']['healthy']['status'] == 'Delivered locally')
        work('retry')
        r = snapshot('backoff')['notices']['retry']
        check('Early retry honors backoff without consuming attempt', r['status'] == 'Retry' and r['attempts'] == 1 and r['receipt_count'] == r['capture_count'] == 0)
        call('make_due', 'retry')
        work('retry')
        r = snapshot('retry_success')['notices']['retry']
        check('Due retry succeeds once', r['status'] == 'Delivered locally' and r['attempts'] == 2 and r['receipt_count'] == r['capture_count'] == 1)
        for attempt in range(1, 6):
            if attempt > 1:
                call('make_due', 'exhaust')
            work('exhaust', 'fail')
            r = snapshot('exhaust_' + str(attempt))['notices']['exhaust']
            check('Bounded attempt ' + str(attempt), r['attempts'] == attempt and r['status'] == ('Failed' if attempt == 5 else 'Retry') and r['receipt_count'] == r['capture_count'] == 0)
        work('exhaust')
        r = snapshot('terminal_failed')['notices']['exhaust']
        check('Failed terminal row cannot be silently redelivered', r['status'] == 'Failed' and r['attempts'] == 5)
        call('retry_failed')
        work('exhaust')
        r = snapshot('operator_recovery')['notices']['exhaust']
        check('Reasoned operator recovery delivers one receipt', r['status'] == 'Delivered locally' and r['manual_retries'] == 1 and r['attempts'] == r['receipt_count'] == r['capture_count'] == 1)
        work('revoked', 'fail')
        call('revoke')
        call('make_due', 'revoked')
        work('revoked')
        r = snapshot('revoked_before_retry')['notices']['revoked']
        check('Retry rechecks current access and suppresses revoked recipient', r['status'] == 'Suppressed' and r['receipt_count'] == r['capture_count'] == 0)
        work('revoked')
        r = snapshot('terminal_suppressed')['notices']['revoked']
        check('Suppression is terminal on replay', r['status'] == 'Suppressed' and r['attempts'] == 2 and r['receipt_count'] == r['capture_count'] == 0)
        result['status'] = 'PASS'
    except Exception as exc:
        result['status'] = 'FAIL'
        result['error_type'] = type(exc).__name__
        print(str(exc), flush=True)
    finally:
        if prepared:
            try:
                result['cleanup'] = call('cleanup')
                check('Cohort retired, queue empty and unrelated queues preserved', result['cleanup']['accounts_disabled'] == 6
                    and result['cleanup']['all_fixture_ledgers_zero'] and result['cleanup']['private_queue_empty']
                    and result['cleanup']['shared_queues_unchanged'])
            except Exception as exc:
                result['status'] = 'FAIL'
                result['cleanup_error_type'] = type(exc).__name__
                print(str(exc), flush=True)
        result['source_unchanged'] = result['source_before'] == hashes()
        if not result['source_unchanged']:
            result['status'] = 'FAIL'
        output = APP / 'docs/roadmap/evidence' / ('worker-recovery-' + run_id + '.json')
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(dict(status=result['status'], checks=len(result['checks']), evidence=str(output))), flush=True)
    if result['status'] != 'PASS':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
