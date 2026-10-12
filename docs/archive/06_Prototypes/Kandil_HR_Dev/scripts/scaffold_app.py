"""Use the installed Framework's own generator for the internal app scaffold."""
from pathlib import Path
import frappe
from frappe.utils.boilerplate import _create_app_boilerplate
import subprocess

app = Path('/workspace/frappe-bench/apps/kandil_hr')
hooks = frappe._dict(app_name='kandil_hr', app_title='Kandil HR',
    app_description='Internal Kandil HR workflows and integrations', app_publisher='Kandil',
    app_email='development@example.invalid', app_license='custom',
    create_github_workflow=False, branch_name='main')
_create_app_boilerplate(str(app.parent), hooks, no_git=True)
with (app / 'kandil_hr/hooks.py').open('a') as f:
    f.write('\n# Standard HRMS remains the HR foundation.\nrequired_apps = ["hrms"]\n')
(app / 'license.txt').write_text('Internal development scaffold. Distribution licence has not been selected.\n')
(app / 'README.md').write_text('''# Kandil HR

Internal custom app for Kandil HRMS v16. This is an empty installed scaffold.
The five proof-of-fit workflows have not been implemented yet.

Keep HR business rules here rather than editing Frappe, ERPNext or HRMS core.
The app contact address is an explicit placeholder, not an outgoing mailbox.
No GitHub remote or public publication is configured.
''')
subprocess.run(['git', 'init', '-b', 'main'], cwd=app, check=True)
