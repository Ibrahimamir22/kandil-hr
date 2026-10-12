"""Run from the Mac to check local login without printing or storing session secrets."""
from pathlib import Path
import http.cookiejar
import urllib.request
import urllib.parse
import json

root = Path(__file__).resolve().parents[1]
base = 'http://localhost:8100'
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
with opener.open(base+'/login', timeout=30) as response:
    assert response.status == 200
    print('PASS: login page responds')
data = urllib.parse.urlencode({'usr': 'Administrator', 'pwd': (root/'.secrets/admin_password').read_text().strip()}).encode()
with opener.open(urllib.request.Request(base+'/api/method/login', data=data), timeout=30) as response:
    result = json.load(response)
    assert result.get('message') == 'Logged In', 'Login did not succeed'
    print('PASS: Administrator login')
with opener.open(base+'/api/method/frappe.auth.get_logged_user', timeout=30) as response:
    assert json.load(response)['message'] == 'Administrator'
    print('PASS: authenticated session')
for doctype in ['Employee', 'Job Applicant', 'Job Requisition', 'Leave Application', 'Salary Slip']:
    with opener.open(base+'/api/resource/DocType/'+urllib.parse.quote(doctype), timeout=30) as response:
        assert json.load(response)['data']['name'] == doctype
        print('PASS: installed model '+doctype)
print('These are installation checks. They do not validate the five Kandil workflows.')
