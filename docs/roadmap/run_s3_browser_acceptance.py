"""Serial synthetic S3 browser workflows with retained per-suite evidence.

Each existing harness owns its cohort and cleanup. A failure stops the sequence;
never restart a timed-out or interrupted cohort without inspecting its state.
This verifies engineering workflows, not HR sign-off or production capacity.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import uuid

APP = Path(__file__).resolve().parents[2]
EVIDENCE = APP / 'docs/portal/evidence'
SUITES = {
    'structure': ('test_structure.cjs', 'structure-', 'results.json'),
    'assignments': ('test_assignments.cjs', 'history-assignments-', 'results.json'),
    'form': ('test_request_form.cjs', 'request-form-', 'results.json'),
    'preview': ('test_route_preview.cjs', 'route-preview-', 'results.json'),
    'operations': ('test_request_operations.cjs', 'request-operations-', 'results.json'),
    'delegations': ('test_delegations.cjs', 'delegations-', 'results.json'),
    'board': ('test_board.cjs', 'board-', 'results.json'),
    'history': ('test_history_workflows.cjs', 'history-workflows-', 'results.json'),
    'pending': ('test_pending_revision.cjs', 'pending-', 'results.json'),
    'journey': ('run_browser_regression.py', 'browser-', 'regression.json'),
}


def hashes():
    paths = [*APP.joinpath('kandil_hr').rglob('*.py'),
             *APP.joinpath('frontend/portal/src').glob('*'),
             APP / 'kandil_hr/public/portal/portal.js', Path(__file__),
             *[APP / 'docs/portal' / spec[0] for spec in SUITES.values()]]
    return {str(p.relative_to(APP)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(paths) if p.is_file()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--suite', action='append', choices=SUITES)
    selected = parser.parse_args().suite or list(SUITES)
    run_id = uuid.uuid4().hex[:12]
    result = dict(run_id=run_id, checked_at=datetime.datetime.now(datetime.UTC).isoformat(),
                  source_before=hashes(), suites=[], status='RUNNING',
                  limits=['Synthetic personal-role browser workflows; no external email, production data or capacity certification.'])
    output = APP / 'docs/roadmap/evidence' / ('s3-browser-acceptance-'+run_id+'.json')
    for name in selected:
        script, prefix, filename = SUITES[name]
        before = set(EVIDENCE.glob(prefix+'*'))
        log = Path('/tmp') / ('kandil-s3-browser-'+run_id+'-'+name+'.txt')
        log.touch(mode=0o600)
        print(json.dumps(dict(suite=name, status='RUNNING')), flush=True)
        with log.open('w') as stream:
            completed = subprocess.run(['python3' if script.endswith('.py') else 'node',
                str(APP / 'docs/portal' / script)], cwd=APP,
                stdout=stream, stderr=subprocess.STDOUT)
        created = set(EVIDENCE.glob(prefix+'*')) - before
        record = dict(suite=name, status='FAIL', exit_code=completed.returncode)
        if len(created) == 1:
            path = created.pop() / filename
            record['evidence'] = str(path.relative_to(APP))
            if path.exists():
                evidence = json.loads(path.read_text())
                checks = evidence.get('checks')
                if name == 'journey' and (path.parent / 'results.json').exists():
                    checks = json.loads((path.parent / 'results.json').read_text()).get('checks')
                record['checks'] = len(checks or [])
                record['cleanup'] = evidence.get('cleanup')
                if (completed.returncode == 0 and evidence.get('status') == 'PASS'
                        and record['cleanup'] and record['cleanup'].get('cleaned')
                        and checks and all(c.get('status') == 'PASS' for c in checks)):
                    record['status'] = 'PASS'
        result['suites'].append(record)
        result['source_unchanged'] = result['source_before'] == hashes()
        output.write_text(json.dumps(result, indent=2)+'\n')
        print(json.dumps(record), flush=True)
        if record['status'] != 'PASS' or not result['source_unchanged']:
            break
    result['status'] = ('PASS' if len(result['suites']) == len(selected)
        and all(s['status'] == 'PASS' for s in result['suites']) and result['source_unchanged'] else 'FAIL')
    output.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(dict(status=result['status'], evidence=str(output.relative_to(APP)))), flush=True)
    if result['status'] != 'PASS':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
