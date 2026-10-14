"""Create a fresh, persistent synthetic review site. Never overwrite or reset it.

Run only through review.compose.yaml using the existing pinned development bench.
Credentials and failure diagnostics remain in ignored private storage.
"""
import json
import os
from pathlib import Path
import subprocess

BENCH = Path('/workspace/frappe-bench')
SITE = 'kandil-review.localhost'
APP = BENCH / 'apps/kandil_hr'


def run(*args):
    result = subprocess.run(args, cwd=BENCH, capture_output=True, text=True)
    if result.returncode:
        path = APP / 'deployment/.local/review-provision-error.log'
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(result.stdout + '\n' + result.stderr)
        path.chmod(0o600)
        raise RuntimeError('Review provisioning failed; inspect the private diagnostic, do not reset the site')


def main():
    if os.environ.get('KANDIL_REVIEW_CONTAINER') != '1':
        raise RuntimeError('Requires the dedicated review Compose container')
    site = BENCH / 'sites' / SITE
    if site.exists():
        raise RuntimeError('Review site already exists. Preserve it and inspect its state; no overwrite supported')
    run('bench', 'new-site', SITE, '--db-host', 'mariadb',
        '--db-root-password', Path('/run/secrets/db_password').read_text().strip(),
        '--admin-password', Path('/run/secrets/admin_password').read_text().strip(),
        '--mariadb-user-host-login-scope=%')
    config = site / 'site_config.json'
    values = json.loads(config.read_text())
    values.update(mute_emails=1, disable_telemetry=1, pause_scheduler=1, allow_tests=0,
                  kandil_pilot_enabled=1, kandil_foundation_enabled=1, kandil_parity_enabled=1,
                  kandil_candidate_identity_enabled=0, kandil_review_environment=1,
                  host_name='http://kandil-review.localhost:8112')
    config.write_text(json.dumps(values, indent=2) + '\n')
    config.chmod(0o600)
    for app in ('erpnext', 'hrms', 'kandil_hr'):
        run('bench', '--site', SITE, 'install-app', app)
    run('bench', '--site', SITE, 'migrate')
    run('bench', '--site', SITE, 'execute', 'kandil_hr.portal.review_setup.prepare')
    print(json.dumps(dict(site=SITE, ready=True, url='http://kandil-review.localhost:8112/hr-portal',
                          synthetic=True, credentials='private-file-only', automated_tests=False)))


if __name__ == '__main__':
    main()
