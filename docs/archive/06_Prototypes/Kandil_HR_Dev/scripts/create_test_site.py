from pathlib import Path
import subprocess
import json

bench=Path('/workspace/frappe-bench')
site='kandil-test.localhost'
def run(*args):
    result=subprocess.run(args,cwd=bench)
    if result.returncode: raise RuntimeError(f'{args[0]} {args[1]} failed: {result.returncode}')
if not (bench/'sites'/site/'site_config.json').exists():
    run('bench','new-site',site,'--db-root-password',Path('/run/secrets/db_password').read_text().strip(),
        '--admin-password',Path('/run/secrets/admin_password').read_text().strip(),'--mariadb-user-host-login-scope=%')
for key,value in [('mute_emails','1'),('disable_telemetry','1'),('host_name','http://localhost:8101'),('socketio_port','9101')]:
    run('bench','--site',site,'set-config',key,value)
installed=subprocess.check_output(['bench','--site',site,'list-apps','--format','json'],cwd=bench,text=True)
for app in ['erpnext','hrms','kandil_hr']:
    if app not in installed:run('bench','--site',site,'install-app',app)
print('Isolated test site installed; company setup and functional checks pending.')
