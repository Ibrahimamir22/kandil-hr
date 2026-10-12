"""Run inside Bench's Python: inspect migrated synthetic history index and replay backfill.

Raw audit envelopes, job arguments, credentials and database names are never
printed. No workers start, no queue jobs are cancelled, and final SQL rolls back.
"""
import hashlib
import json
import os
import time

import frappe

SITE = 'kandil-parity.localhost'


def verify():
    from kandil_hr.foundation import position_history_index as index
    from kandil_hr.portal import queue_diagnostics
    queue_diagnostics.guard()
    if not frappe.db.exists('Patch Log', {'patch': index.PATCH, 'skipped': 0}):
        raise RuntimeError('Position history patch has not completed')
    started = time.monotonic()
    def audit_digest():
        digest = hashlib.sha256(); cursor = ''; count = 0
        while True:
            rows = frappe.get_all('Kandil Command Audit', filters={'name':['>',cursor]},
                fields=['name','content_hash','envelope_json'],order_by='name',page_length=100)
            if not rows: break
            for row in rows:
                digest.update(json.dumps(dict(row),sort_keys=True).encode()); count += 1
            cursor = rows[-1].name
        return count,digest.hexdigest()
    before = audit_digest()
    replay = index.execute()
    after = audit_digest()
    assert before == after, 'Backfill changed source audit data'
    assert replay['links_created'] == 0, 'Backfill found missing index rows'
    cursor = ''; checked = 0
    while True:
        rows = frappe.get_all('Kandil Command Audit', filters={'name':['>',cursor]},
            fields=['name','company','content_hash','envelope_json'],order_by='name',page_length=100)
        if not rows: break
        for row in rows:
            links = frappe.get_all(index.DT,filters={'audit':row.name},fields=['position','company','source_hash'])
            assert sorted(r.position for r in links) == index.positions(json.loads(row.envelope_json))
            assert all(r.company == row.company and r.source_hash == row.content_hash for r in links)
            checked += len(links)
        cursor = rows[-1].name
    assert checked == frappe.db.count(index.DT), 'Unexpected orphan index rows'
    sample=frappe.get_all(index.DT,fields=['company','position'],page_length=1)
    plan=frappe.db.sql('EXPLAIN SELECT audit FROM `tabKandil Position Audit Link` WHERE company=%s AND position=%s ORDER BY occurred_at DESC,audit DESC LIMIT 21',
                       (sample[0].company,sample[0].position),as_dict=True) if sample else []
    assert not plan or plan[0].key == 'position_history_lookup', 'Position lookup index was not selected'
    return dict(status='PASS',site=SITE,patch_recorded=True,audits=before[0],links=checked,
                idempotent_replay=replay,source_audit_digest_unchanged=before==after,
                query_index=plan[0].key if plan else None,elapsed_seconds=round(time.monotonic()-started,3),
                queue_inventory=queue_diagnostics.inventory(),contact_states=queue_diagnostics.contact_states(),
                limits=['Private synthetic migration/index consistency proof, not a sustained workload or security certification.',
                        'Index DDL was applied by migration. Replay here uses the existing index and rolls back its SQL session.',
                        'Existing queued jobs are inspected only; no worker, cancellation or execution.'])


if __name__ == '__main__':
    os.chdir('/workspace/frappe-bench/sites')
    frappe.init(site=SITE,sites_path='/workspace/frappe-bench/sites');frappe.connect();frappe.set_user('Administrator')
    try: print(json.dumps(verify(),ensure_ascii=False))
    finally: frappe.db.rollback();frappe.destroy()
