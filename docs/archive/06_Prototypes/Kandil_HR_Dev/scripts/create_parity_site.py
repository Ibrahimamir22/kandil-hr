"""Create the new disposable parity site; never recreate or reset another site."""
from pathlib import Path
import json
import subprocess

bench = Path('/workspace/frappe-bench')
site = 'kandil-parity.localhost'

def run(*args):
    result = subprocess.run(args, cwd=bench, capture_output=True, text=True)
    if result.returncode:
        # Command arguments contain passwords during bootstrap: do not print them.
        print(result.stdout[-1500:])
        print(result.stderr[-1500:])
        raise RuntimeError('Parity bootstrap operation failed')

if not (bench / 'sites' / site / 'site_config.json').exists():
    run('bench', 'new-site', site,
        '--db-root-password', Path('/run/secrets/db_password').read_text().strip(),
        '--admin-password', Path('/run/secrets/admin_password').read_text().strip(),
        '--mariadb-user-host-login-scope=%')
for key, value in [('mute_emails','1'), ('disable_telemetry','1'),
                   ('host_name','http://localhost:8102'), ('socketio_port','9102')]:
    run('bench','--site',site,'set-config',key,value)
installed = subprocess.check_output(['bench','--site',site,'list-apps','--format','json'],cwd=bench,text=True)
for app in ['erpnext','hrms']:
    if app not in installed:
        run('bench','--site',site,'install-app',app)
print(json.dumps({'site':site,'status':'Base HR installed; custom app migration is a separate step'}))
