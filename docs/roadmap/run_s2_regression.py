"""Serial opt-in synthetic S2 regression; never emits private raw fixture output."""
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
    'kandil_hr.portal.test_delegations.run',
    'kandil_hr.foundation.test_delegation.run',
    'kandil_hr.foundation.test_delegation_audit.run',
    'kandil_hr.portal.test_request_operations.run',
    'kandil_hr.portal.test_route_preview.run',
    'kandil_hr.recruitment.test_commands.run',
    'kandil_hr.recruitment.test_contracts.run',
    'kandil_hr.recruitment.test_corrections.run',
    'kandil_hr.portal.test_request_form.run',
    'kandil_hr.portal.test_position_history.run',
    'kandil_hr.portal.test_organization_tree.run',
    'kandil_hr.portal.test_history.run',
    'kandil_hr.portal.test_document_delivery.run',
    'kandil_hr.organization.test_document_delivery.run',
    'kandil_hr.foundation.test_command_audit.run',
    'kandil_hr.organization.test_revision_import_audit.run',
    'kandil_hr.portal.test_job_descriptions.run',
    'kandil_hr.organization.test_assignment_changes.run',
    'kandil_hr.recruitment.test_joining.run',
    'kandil_hr.recruitment.test_joining_corrections.run',
    'kandil_hr.portal.test_imports.run',
    'kandil_hr.portal.test_structure.run',
    'kandil_hr.portal.test_organization.run',
    'kandil_hr.portal.test_api.run',
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
                  limits=['Serial rollback-scoped native synthetic tests; personal-session HTTP/browser evidence and fixture cleanup are separate.'])
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
        legacy_delegation_ok = (suite == 'kandil_hr.foundation.test_delegation.run' and summary
            and summary.get('discovered', 0) > 0 and summary.get('executed') == summary.get('discovered')
            and all(summary.get(k) == 0 for k in ('failures', 'errors', 'skips')))
        ok = run.returncode == 0 and summary and (summary.get('successful') is True or summary.get('result') == 'PASS' or legacy_delegation_ok)
        result['suites'].append(dict(suite=suite, status='PASS' if ok else 'FAIL', result=summary))
        print(json.dumps(dict(suite=suite, status='PASS' if ok else 'FAIL')), flush=True)
        if not ok:
            # Raw diagnostic material remains local only.
            private = Path('/tmp') / ('kandil-s2-regression-' + result['run_id'] + '.txt')
            private.touch(mode=0o600)
            private.write_text(run.stdout + '\n' + run.stderr)
            break
    result['source_unchanged'] = result['source_before'] == hashes()
    result['status'] = 'PASS' if result['source_unchanged'] and len(result['suites']) == len(selected) and all(s['status'] == 'PASS' for s in result['suites']) else 'FAIL'
    output = APP / 'docs/roadmap/evidence' / ('s2-regression-' + result['run_id'] + '.json')
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(status=result['status'], evidence=str(output))))
    if result['status'] != 'PASS':
        raise SystemExit(1)

if __name__ == '__main__':
    main()
