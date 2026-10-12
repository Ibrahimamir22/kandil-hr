#!/usr/bin/env python3
"""Serial native gates on the existing isolated parity site; no production targets.

Use only when the shared parity DB test slot is free and application source is
frozen. The caller authorizes Docker access. Failures preserve diagnostic evidence
and never become passed baseline cases automatically.
"""
import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

APP = Path(__file__).resolve().parents[2]
DEFAULT_MODULES = [
    'kandil_hr.organization.integration_tests.run',
    'kandil_hr.organization.test_occupancy.run',
    'kandil_hr.recruitment.test_commands.run',
    'kandil_hr.recruitment.test_contracts.run',
    'kandil_hr.recruitment.test_corrections.run',
    'kandil_hr.recruitment.test_joining.run',
    'kandil_hr.recruitment.test_completion.run',
    'kandil_hr.recruitment.test_joining_corrections.run',
    'kandil_hr.recruitment.test_ownership.run',
    'kandil_hr.recruitment.test_ownership_callbacks.run',
    'kandil_hr.recruitment.test_review_views.run',
    'kandil_hr.recruitment.test_acceptance.run',
    'kandil_hr.recruitment.test_authority_audit.run',
    'kandil_hr.foundation.test_delegation_schema.run',
    'kandil_hr.foundation.test_delegation.run',
    'kandil_hr.foundation.tests_runner.run',
    'kandil_hr.recruitment.test_sla.run',
    'kandil_hr.recruitment.test_privacy.run',
    'kandil_hr.foundation.test_payroll_boundary.run',
    'kandil_hr.foundation.test_command_audit.run',
    'kandil_hr.recruitment.test_command_audit.run',
    'kandil_hr.recruitment.test_headcount_contract.run',
    'kandil_hr.organization.test_document_delivery.run',
]


def hashes():
    return {str(p.relative_to(APP)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((APP / 'kandil_hr').rglob('*'))
            if p.is_file() and p.suffix in {'.py', '.json', '.js', '.csv', '.html', '.css'}}


def result_from(output):
    for line in reversed(output.splitlines()):
        try:
            value = json.loads(line)
            if isinstance(value, dict):
                return value
        except json.JSONDecodeError:
            pass
    return None



def valid_result(result):
    """Accept only explicit positive execution counts with no reported failures."""
    if not isinstance(result, dict):
        return False
    if result.get('successful') is False:
        return False
    for key in ('status', 'result'):
        if key in result and result[key] != 'PASS':
            return False
    for key in ('failures', 'errors', 'skipped', 'skips'):
        if key in result and result[key] != 0:
            return False
    count_keys = ('executed', 'tests_run', 'total', 'passed', 'discovered')
    counts = [result[key] for key in count_keys if key in result]
    if 'tests' in result:
        tests = result['tests']
        if isinstance(tests, list):
            if not tests or any(not isinstance(item, dict) or item.get('status') != 'PASS' for item in tests):
                return False
            counts.append(len(tests))
        else:
            counts.append(tests)
    if not counts or any(type(count) is not int or count <= 0 for count in counts):
        return False
    if 'executed' in result and 'discovered' in result and result['executed'] != result['discovered']:
        return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--compose-dir', type=Path, default=APP.parents[3])
    parser.add_argument('--output', type=Path, default=APP / 'docs/sprints/evidence/followup-checkpoint-2026-10-12.json')
    parser.add_argument('--modules', nargs='+', default=DEFAULT_MODULES)
    parser.add_argument('--resume-from', type=Path)
    args = parser.parse_args()
    if any(not m.startswith('kandil_hr.') or not m.endswith('.run') for m in args.modules):
        raise SystemExit('Only explicit Kandil test runner modules are accepted.')
    before = hashes()
    report = dict(site='kandil-parity.localhost', started_at=datetime.now(timezone.utc).isoformat(),
                  source_hashes_before=before, suites=[], status='RUNNING')
    completed = 0
    if args.resume_from:
        previous = json.loads(args.resume_from.read_text())
        if (previous.get('site') != report['site']
                or previous.get('source_hashes_before') != before
                or previous.get('source_hashes_after') != before
                or previous.get('source_unchanged_during_run') is not True
                or args.output.resolve() == args.resume_from.resolve()):
            raise SystemExit('Resume requires unchanged application source, correct site, and a new output file.')
        for item in previous.get('suites', []):
            if item.get('status') != 'PASS':
                break
            result = item.get('result')
            if (completed >= len(args.modules) or item.get('module') != args.modules[completed]
                    or item.get('exit_code') != 0 or not valid_result(result)):
                raise SystemExit('Resume successful prefix does not match the requested suite order.')
            report['suites'].append(item)
            completed += 1
        report.update(resumed_from=str(args.resume_from), retained_suites=completed,
                      original_started_at=previous.get('started_at'),
                      resume_note='Retained successful prefix on identical application source; remaining suites executed after bounded synthetic queue maintenance.')
        print(json.dumps(dict(resuming=True, retained_suites=completed)), flush=True)
    for module in args.modules[completed:]:
        cmd = ['docker', 'compose', 'exec', '-T', '-w', '/workspace/frappe-bench', 'frappe',
               'bench', '--site', 'kandil-parity.localhost', 'execute', module]
        process = subprocess.run(cmd, cwd=args.compose_dir, capture_output=True, text=True)
        result = result_from(process.stdout)
        ok = process.returncode == 0 and valid_result(result)
        item = dict(module=module, exit_code=process.returncode, status='PASS' if ok else 'FAIL', result=result)
        if not ok:
            item['diagnostics'] = (process.stderr + '\n' + process.stdout)[-18000:]
        report['suites'].append(item)
        args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
        print(json.dumps(dict(module=module, status=item['status'])), flush=True)
        if not ok:
            break
    report['source_hashes_after'] = hashes()
    report['source_unchanged_during_run'] = report['source_hashes_after'] == before
    report['finished_at'] = datetime.now(timezone.utc).isoformat()
    report['status'] = 'PASS' if all(s['status']=='PASS' for s in report['suites']) and len(report['suites']) == len(args.modules) and report['source_unchanged_during_run'] else 'FAIL'
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(dict(status=report['status'], suites=len(report['suites']), source_unchanged=report['source_unchanged_during_run'])), flush=True)
    raise SystemExit(0 if report['status']=='PASS' else 1)


if __name__ == '__main__':
    main()
