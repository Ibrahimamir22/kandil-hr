"""Initialize the local-only HR development site. No production data or integrations."""
from pathlib import Path
import subprocess
import json
import os

base = Path('/workspace')
bench = base / 'frappe-bench'
site = 'kandil.localhost'

def run(*args, cwd=bench, **kwargs):
    result = subprocess.run(args, cwd=cwd, check=False, **kwargs)
    if result.returncode:
        # Do not include secret-bearing command arguments in exception output.
        raise RuntimeError(f'{args[0]} {args[1]} failed (exit {result.returncode}); inspect preceding output')

if not (bench / 'apps/frappe').exists():
    run('bench', 'init', '--skip-redis-config-generation', '--frappe-branch', 'version-16',
        '--python', '/home/frappe/.pyenv/shims/python3', 'frappe-bench', cwd=base)

config = bench / 'sites/common_site_config.json'
settings = json.loads(config.read_text())
settings.update(db_host='mariadb', redis_cache='redis://redis-cache:6379',
                redis_queue='redis://redis-queue:6379', redis_socketio='redis://redis-queue:6379',
                socketio_port=9100, developer_mode=1, serve_default_site=True)
config.write_text(json.dumps(settings, indent=2)+'\n')

for app in ['erpnext', 'hrms']:
    if not (bench / 'apps' / app).exists():
        run('bench', 'get-app', '--branch', 'version-16', f'https://github.com/frappe/{app}.git')

if not (bench / 'sites' / site / 'site_config.json').exists():
    run('bench', 'new-site', site, '--db-root-password', Path('/run/secrets/db_password').read_text().strip(),
        '--admin-password', Path('/run/secrets/admin_password').read_text().strip(),
        '--mariadb-user-host-login-scope=%')

installed = subprocess.check_output(['bench', '--site', site, 'list-apps', '--format', 'json'], cwd=bench, text=True)
for app in ['erpnext', 'hrms']:
    if app not in installed:
        run('bench', '--site', site, 'install-app', app)

run('bench', 'use', site)
run('bench', '--site', site, 'set-config', 'developer_mode', '1')
run('bench', '--site', site, 'set-config', 'mute_emails', '1')
run('bench', '--site', site, 'set-config', 'host_name', 'http://localhost:8100')
run('bench', '--site', site, 'clear-cache')

if not (bench / 'apps/kandil_hr/kandil_hr/hooks.py').exists():
    run(str(bench / 'env/bin/python'), '/opt/kandil/scaffold_app.py')
run('bench', 'pip', 'install', '-e', 'apps/kandil_hr')
apps_file = bench / 'sites/apps.txt'
apps = apps_file.read_text().splitlines()
if 'kandil_hr' not in apps:
    apps_file.write_text('\n'.join(apps + ['kandil_hr'])+'\n')
installed = subprocess.check_output(['bench', '--site', site, 'list-apps', '--format', 'json'], cwd=bench, text=True)
if 'kandil_hr' not in installed:
    run('bench', '--site', site, 'install-app', 'kandil_hr')
run('bench', 'build', '--app', 'kandil_hr')
run('bench', '--site', site, 'clear-cache')
(bench / '.kandil-ready').touch()
print('Kandil HR development site ready at http://localhost:8100')
