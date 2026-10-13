"""Read-only post-rehearsal retirement verifier in the separate sandbox container."""
import json
import os
from pathlib import Path

import frappe

BASE=Path('/workspace/frappe-bench')
MARKER=BASE.parent/'kandil-scheduler-isolation.json'
if not MARKER.exists() or not Path('/opt/kandil-source/deployment/compose.yaml').exists():
    raise RuntimeError('Separate scheduler sandbox required')
m=json.loads(MARKER.read_text());assert m['isolated_stack']=='kandil-hr-sandbox'
os.chdir(BASE/'sites')
frappe.init('kandil-parity.localhost');frappe.connect();frappe.set_user('Administrator')
try:
    assert frappe.conf.pause_scheduler and frappe.conf.mute_emails
    assert not frappe.db.get_single_value('System Settings','enable_scheduler')
    cohorts=[]
    for path in sorted(Path(frappe.get_site_path('private')).glob('kandil-portal-*.json')):
        d=json.loads(path.read_text())
        assert d['company']=='Kandil PORTAL TEST '+d['run_id'] and d['cleaned']
        assert all('password' not in a for a in d['users'].values())
        assert all(not frappe.db.get_value('User',a['email'],'enabled') for a in d['users'].values())
        assert all(not any(frappe.db.get_value('Kandil Capacity',c,['reserved','occupied','open_slots'])) for c in d['capacities'])
        cohorts.append(dict(run_id=d['run_id'],accounts_disabled=len(d['users']),ledgers_zero=True,private_passwords_removed=True))
    from rq import Worker
    from frappe.utils.background_jobs import get_redis_conn
    live=[]
    for w in Worker.all(connection=get_redis_conn()):
        if w.name.startswith('kandil-scheduled-') and w.pid:
            try:os.kill(w.pid,0)
            except ProcessLookupError:pass
            else:live.append(w.name)
    assert not live
    outgoing=frappe.db.count('Email Account',dict(enable_outgoing=1))
    sent=frappe.db.count('Email Queue',dict(status='Sent'))
    assert outgoing==sent==0
    print(json.dumps(dict(status='PASS',site=frappe.local.site,cohorts=cohorts,
        scheduler_paused=True,enable_scheduler=False,live_rehearsal_workers=0,
        outgoing_accounts=outgoing,sent_email_queue_rows=sent)))
finally:frappe.destroy()
