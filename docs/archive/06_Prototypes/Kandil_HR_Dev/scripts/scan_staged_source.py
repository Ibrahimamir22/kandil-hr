"""Check both local indexes without displaying credentials or credential values."""
from pathlib import Path
import json
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
secrets = [p.read_bytes().strip() for p in (root / '.secrets').glob('*') if p.is_file()]
credentials = root / 'development/test-credentials.json'
if credentials.exists():
    for account in json.loads(credentials.read_text()).values():
        if isinstance(account, dict) and account.get('password'):
            secrets.append(account['password'].encode())
# Include current parity/recovery credentials without displaying their values.
app = root / 'development/frappe-bench/apps/kandil_hr'
secret_keys = {'password', 'db_password', 'encryption_key', 'api_secret', 'access_token', 'refresh_token'}
def collect(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key in secret_keys and isinstance(child, str):
                secrets.append(child.encode())
            elif isinstance(child, (dict, list)):
                collect(child)
    elif isinstance(value, list):
        for child in value:
            collect(child)
for sites in (root / 'development/frappe-bench/sites', app / 'deployment/.local/workspace/frappe-bench/sites'):
    for pattern in ('*/site_config.json', '*/private/kandil-*.json', '*/private/*credentials*.json'):
        for local in sites.glob(pattern):
            collect(json.loads(local.read_text()))
for name in ('admin_password', 'db_password'):
    local = app / 'deployment/.local' / name
    if local.exists():
        secrets.append(local.read_bytes().strip())
secrets = list({secret for secret in secrets if len(secret) >= 8})
issues = []
for repo in (root, root / 'development/frappe-bench/apps/kandil_hr'):
    files = subprocess.check_output(['git', '-C', str(repo), 'ls-files', '-z']).split(b'\0')
    for raw in filter(None, files):
        name = raw.decode()
        parts = Path(name).parts
        forbidden = any(p in {'.secrets', '.env', 'site_config.json', 'common_site_config.json', 'test-credentials.json', 'parity-credentials.json', 'kandil-review.json', '.local', '__pycache__'} for p in parts)
        forbidden |= name.endswith(('.sql', '.sql.gz', '.backup', '.log', '.pyc'))
        if forbidden:
            issues.append({'repo': repo.name, 'file': name, 'reason': 'runtime or secret filename'})
        content = subprocess.check_output(['git', '-C', str(repo), 'show', ':' + name])
        if any(secret in content for secret in secrets):
            issues.append({'repo': repo.name, 'file': name, 'reason': 'matches a local credential'})
        if re.search(rb'(?m)^-----BEGIN (?:RSA )?PRIVATE KEY-----$', content):
            issues.append({'repo': repo.name, 'file': name, 'reason': 'private key material'})
print(json.dumps({'indexes_scanned': 2, 'issues': issues, 'scope': 'Known local credentials, runtime filenames and private-key markers; not a complete external secret scanning service'}, indent=2))
sys.exit(bool(issues))
