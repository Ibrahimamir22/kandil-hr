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
    'kandil_hr.organization.test_occupancy.run',
    'kandil_hr.recruitment.test_commands.run',
    'kandil_hr.recruitment.test_contracts.run',
    'kandil_hr.recruitment.test_corrections.run',
    'kandil_hr.recruitment.test_joining.run',
    'kandil_hr.recruitment.test_sla.run',
    'kandil_hr.recruitment.test_privacy.run',
    'kandil_hr.foundation.test_payroll_boundary.run',
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--compose-dir', type=Path, default=APP.parents[3])
    parser.add_argument('--output', type=Path, default=APP / 'docs/sprints/evidence/followup-checkpoint-2026-10-12.json')
    parser.add_argument('--modules', nargs='+', default=DEFAULT_MODULES)
    args = parser.parse_args()
    if any(not m.startswith('kandil_hr.') or not m.endswith('.run') for m in args.modules):
        raise SystemExit('Only explicit Kandil test runner modules are accepted.')
    before = hashes()
    report = dict(site='kandil-parity.localhost', started_at=datetime.now(timezone.utc).isoformat(),
                  source_hashes_before=before, suites=[], status='RUNNING')
    for module in args.modules:
        cmd = ['docker', 'compose', 'exec', '-T', '-w', '/workspace/frappe-bench', 'frappe',
               'bench', '--site', 'kandil-parity.localhost', 'execute', module]
        process = subprocess.run(cmd, cwd=args.compose_dir, capture_output=True, text=True)
        result = result_from(process.stdout)
        ok = process.returncode == 0 and result is not None
        if result and (result.get('successful') is False or result.get('status') == 'FAIL'):
            ok = False
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
