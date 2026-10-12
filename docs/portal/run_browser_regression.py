"""Fresh portal browser journey with private manifest and explicit cleanup."""
import datetime
import hashlib
import json
import subprocess
import uuid
from pathlib import Path

APP = Path(__file__).resolve().parents[2]
DEV = APP.parents[3]
SITE = 'kandil-parity.localhost'


def bench(action, run_id):
    run = subprocess.run(['docker','compose','exec','-T','-w','/workspace/frappe-bench','parity-web',
        'bench','--site',SITE,'execute','kandil_hr.portal.fixture.' + action,
        '--kwargs',json.dumps({'run_id':run_id})],cwd=DEV,capture_output=True,text=True,timeout=240)
    if run.returncode:
        log = Path('/tmp') / ('kandil-portal-fixture-' + run_id + '-' + action + '.txt')
        log.touch(mode=0o600)
        log.write_text(run.stdout + '\n' + run.stderr)
        raise RuntimeError('Private portal fixture ' + action + ' failed')
    return json.loads([line for line in run.stdout.splitlines() if line.startswith('{')][-1])


def hashes():
    paths = [*APP.joinpath('kandil_hr').rglob('*.py'), *APP.joinpath('frontend/portal/src').glob('*'),
             APP / 'docs/portal/test_browser.cjs', Path(__file__)]
    return {str(p.relative_to(APP)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths) if p.is_file()}


def main():
    run_id = uuid.uuid4().hex[:12]
    out = APP / 'docs/portal/evidence' / ('browser-' + run_id)
    out.mkdir(parents=True)
    result = dict(run_id=run_id,checked_at=datetime.datetime.now(datetime.UTC).isoformat(),status='FAIL',source_before=hashes())
    private = DEV / 'development/frappe-bench/sites' / SITE / 'private' / ('kandil-portal-' + run_id + '.json')
    try:
        bench('prepare',run_id)
        assert not private.stat().st_mode & 0o077
        log = Path('/tmp') / ('kandil-portal-browser-' + run_id + '.txt')
        log.touch(mode=0o600)
        with log.open('w') as file:
            run = subprocess.run(['node',str(APP/'docs/portal/test_browser.cjs'),run_id],stdout=file,stderr=subprocess.STDOUT,timeout=300)
        browser_result = json.loads((out/'results.json').read_text())
        assert run.returncode == 0 and browser_result['status'] == 'PASS'
        result['state_before_cleanup'] = bench('inspect',run_id)
        result['status'] = 'PASS'
    except Exception as error:
        result['error_type'] = type(error).__name__
    finally:
        if private.exists():
            try:result['cleanup'] = bench('cleanup',run_id)
            except Exception as error:
                result['status'] = 'FAIL'
                result['cleanup'] = dict(cleaned=False,error_type=type(error).__name__)
        result['source_unchanged'] = result['source_before'] == hashes()
        if not result['source_unchanged']:result['status'] = 'FAIL'
        (out/'regression.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(dict(status=result['status'],run_id=run_id,evidence=str(out/'regression.json'))))
    if result['status'] != 'PASS':raise SystemExit(1)

if __name__ == '__main__': main()
