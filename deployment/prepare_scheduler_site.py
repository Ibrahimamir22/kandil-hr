"""Provision one fresh scheduler-only site inside the separate Docker sandbox.

Run with the sandbox Bench Python. Never overwrites a site or touches the main
Bench. Secrets and installation diagnostics stay in ignored local storage.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

BASE = Path('/workspace')
BENCH = BASE / 'frappe-bench'
SOURCE = Path('/opt/kandil-source')
SITE = 'kandil-parity.localhost'
MARKER = BASE / 'kandil-scheduler-isolation.json'


def run(*args):
    p = subprocess.run(args, cwd=BENCH, capture_output=True, text=True)
    if p.returncode:
        path = BASE / 'scheduler-provision-error.log'
        path.touch(mode=0o600)
        path.write_text(p.stdout + '\n' + p.stderr)
        path.chmod(0o600)
        raise RuntimeError('Scheduler site provisioning failed; private diagnostics retained')
    return p.stdout


def main():
    # This mount and existing empty sandbox site distinguish the independent
    # deployment stack from the operational 8100/8101/8102 Bench.
    if not SOURCE.exists() or not (BENCH/'sites/kandil-sandbox.localhost/site_config.json').exists():
        raise RuntimeError('Requires the separate deployment sandbox mount')
    if MARKER.exists() or (BENCH/'sites'/SITE).exists():
        raise RuntimeError('Scheduler rehearsal already exists; inspect instead of overwriting')
    run_id = uuid.uuid4().hex[:12]
    MARKER.touch(mode=0o600)
    MARKER.write_text(json.dumps(dict(run_id=run_id, site=SITE, status='provisioning')))
    MARKER.chmod(0o600)
    run('bench', 'new-site', SITE, '--db-root-password', Path('/run/secrets/db_password').read_text().strip(),
        '--admin-password', Path('/run/secrets/admin_password').read_text().strip(), '--mariadb-user-host-login-scope=%')
    config = BENCH/'sites'/SITE/'site_config.json'
    values = json.loads(config.read_text())
    values.update(mute_emails=1, disable_telemetry=1, pause_scheduler=1, allow_tests=1,
        kandil_pilot_enabled=1, kandil_foundation_enabled=1, kandil_parity_enabled=1,
        kandil_scheduler_rehearsal=run_id)
    config.write_text(json.dumps(values, indent=2)+'\n');config.chmod(0o600)
    for app in ('erpnext','hrms','kandil_hr'):
        run('bench','--site',SITE,'install-app',app)
    run('bench','--site',SITE,'migrate')
    run(str(BENCH/'env/bin/python'),str(SOURCE/'deployment/seed_parity.py'))
    manifest=dict(run_id=run_id,site=SITE,status='ready',isolated_stack='kandil-hr-sandbox')
    MARKER.write_text(json.dumps(manifest));MARKER.chmod(0o600)
    print(json.dumps(manifest))


if __name__ == '__main__':
    main()
