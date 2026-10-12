"""Serial opt-in synthetic S1 regression; never emits private raw fixture output."""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import subprocess
import uuid

APP = Path(__file__).resolve().parents[2]
DEV = APP.parents[3]
SUITES = (
    'kandil_hr.recruitment.test_pending_revision.run',
    'kandil_hr.recruitment.test_headcount_contract.run',
    'kandil_hr.recruitment.test_contracts.run',
    'kandil_hr.portal.test_api.run',
    'kandil_hr.recruitment.test_commands.run',
    'kandil_hr.recruitment.test_sla.run',
    'kandil_hr.foundation.tests_runner.run',
    'kandil_hr.recruitment.pending_revision_races.run',
)

def hashes():
    return {str(p.relative_to(APP)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((APP / 'kandil_hr').rglob('*.py'))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--suite', action='append', choices=SUITES)
    selected = parser.parse_args().suite or SUITES
    result = dict(run_id=uuid.uuid4().hex[:12], checked_at=datetime.datetime.now(datetime.UTC).isoformat(),
                  site='kandil-parity.localhost', suites=[], source_before=hashes(),
                  limits=['Serial native synthetic suites, including committed UUID race fixtures with cleanup; HTTP/browser evidence is separate.'])
    for suite in selected:
        run = subprocess.run(['docker', 'compose', 'exec', '-T', '-w', '/workspace/frappe-bench',
                              'parity-web', 'bench', '--site', result['site'], 'execute', suite],
                             cwd=DEV, capture_output=True, text=True, timeout=600)
        summary = None
        for line in reversed(run.stdout.splitlines()):
            if line.startswith('{'):
                try:
                    summary = json.loads(line)
                    break
                except ValueError:
                    continue
        ok = run.returncode == 0 and summary and (summary.get('successful') is True or summary.get('result') == 'PASS')
        result['suites'].append(dict(suite=suite, status='PASS' if ok else 'FAIL', result=summary))
        print(json.dumps(dict(suite=suite, status='PASS' if ok else 'FAIL')), flush=True)
        if not ok:
            # Raw diagnostic material remains local only.
            private = Path('/tmp') / ('kandil-s1-regression-' + result['run_id'] + '.txt')
            private.touch(mode=0o600)
            private.write_text(run.stdout + '\n' + run.stderr)
            break
    result['source_unchanged'] = result['source_before'] == hashes()
    result['status'] = 'PASS' if result['source_unchanged'] and len(result['suites']) == len(selected) and all(s['status'] == 'PASS' for s in result['suites']) else 'FAIL'
    output = APP / 'docs/roadmap/evidence' / ('s1-regression-' + result['run_id'] + '.json')
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(status=result['status'], evidence=str(output))))
    if result['status'] != 'PASS':
        raise SystemExit(1)

if __name__ == '__main__':
    main()
