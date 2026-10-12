#!/usr/bin/env python3
"""Synthetic parity-only HTTP concurrency gate. No credentials are printed.

Run from the Kandil_HR_Dev host after acquiring the shared DB test slot:
python3 development/frappe-bench/apps/kandil_hr/docs/sprints/test_concurrency.py

Creates a dedicated synthetic company through a guarded, non-whitelisted bench
fixture. Credentials are read from its ignored 0600 private manifest, used for
ordinary password login, then scrubbed during cleanup. Each HTTP request opens
its own connection. Existing review records are never selected or modified.
"""
import concurrent.futures
import argparse
import copy
import datetime
import http.cookiejar
import hashlib
import json
from pathlib import Path
import re
import subprocess
import threading
import time
import urllib.error
import urllib.request
import uuid

DEV_ROOT=Path(__file__).resolve().parents[6]
APP=Path(__file__).resolve().parents[2]
BASE='http://localhost:8102'
SITE='kandil-parity.localhost'
FIXTURE='kandil_hr.recruitment.concurrency_fixture'
OUTPUT=APP/'docs/sprints/evidence/concurrency-http-2026-10-12.json'


def bench(action, run_id):
    command=['docker','compose','exec','-T','-w','/workspace/frappe-bench','frappe',
        'bench','--site',SITE,'execute',FIXTURE+'.'+action,'--kwargs',json.dumps({'run_id':run_id})]
    result=subprocess.run(command,cwd=DEV_ROOT,capture_output=True,text=True,timeout=180)
    if result.returncode:
        # Bench traceback can contain fixture local values; never echo it.
        raise RuntimeError('Internal fixture '+action+' failed; inspect locally without exposing credentials')
    lines=[line for line in result.stdout.splitlines() if line.startswith('{')]
    if not lines:raise RuntimeError('Fixture returned no structured evidence')
    return json.loads(lines[-1])


class Actor:
    def __init__(self, credentials):
        jar=http.cookiejar.CookieJar()
        opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        req=urllib.request.Request(BASE+'/api/method/login',data=json.dumps({
            'usr':credentials['email'],'pwd':credentials['password']}).encode(),
            headers={'Content-Type':'application/json'},method='POST')
        with opener.open(req,timeout=60) as response:
            if response.status!=200:raise RuntimeError('Synthetic password login failed')
            response.read()
        with opener.open(BASE+'/api/method/frappe.auth.get_logged_user',timeout=60) as response:
            if json.load(response).get('message')!=credentials['email']:
                raise RuntimeError('Synthetic authenticated identity mismatch')
        with opener.open(BASE+'/desk',timeout=60) as response:html=response.read().decode()
        match=re.search(r'frappe\.csrf_token\s*=\s*["\']([^"\']+)',html)
        if not match:raise RuntimeError('Authenticated Desk did not provide CSRF token')
        cookie_request=urllib.request.Request(BASE+'/api/method/')
        jar.add_cookie_header(cookie_request)
        self.headers={'Content-Type':'application/json','Cookie':cookie_request.get_header('Cookie'),
            'X-Frappe-CSRF-Token':match.group(1),'Accept-Language':'en'}

    def call(self, method, payload, barrier):
        barrier.wait(timeout=30)
        started=time.monotonic()
        request=urllib.request.Request(BASE+'/api/method/'+method,data=json.dumps(payload).encode(),
            headers=dict(self.headers),method='POST')
        try:
            with urllib.request.urlopen(request,timeout=120) as response:
                body=json.load(response);status=response.status
        except urllib.error.HTTPError as error:
            status=error.code
            try:body=json.loads(error.read())
            except Exception:body={}
        return {'status':status,'body':body,'start':started,'end':time.monotonic()}


def batch(actor, method, payloads):
    barrier=threading.Barrier(len(payloads))
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(payloads)) as pool:
        results=list(pool.map(lambda payload:actor.call(method,payload,barrier),payloads))
    events=[event for r in results for event in [(r['start'],1),(r['end'],-1)]]
    active=peak=0
    for _,delta in sorted(events):active+=delta;peak=max(peak,active)
    if peak<2:raise AssertionError('HTTP calls did not overlap')
    return results,peak


def counts_delta(after,before):return {k:after[k]-before[k] for k in before}


def sanitized_batch(results,peak):
    return dict(requests=len(results),peak_inflight_http=peak,
        statuses={str(status):sum(r['status']==status for r in results) for status in sorted({r['status'] for r in results})},
        maximum_seconds=round(max(r['end']-r['start'] for r in results),3),
        server_retries=[r['body'].get('kandil_transaction_retries') for r in results])


def source_hashes():
    roots=['recruitment','pilot','foundation','organization']
    paths=[p for root in roots for p in (APP/'kandil_hr'/root).glob('*.py')
        if not p.name.startswith('test_') and not p.stem.endswith('_tests')]
    return {str(p.relative_to(APP)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}


def main():
    run_id=uuid.uuid4().hex[:12]
    previous=json.loads(OUTPUT.read_text()) if OUTPUT.exists() else None
    evidence=dict(run_id=run_id,site=SITE,checked_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        status='RUNNING',checks=[],source_hashes_before=source_hashes(),limits=['Local short HTTP batch, not production load certification',
        'Ordinary password login and CSRF session requests; no API-key bypass',
        'Synthetic isolated company; immutable cancelled audit retained'])
    prepared=False
    try:
        bench('prepare',run_id);prepared=True
        manifest=DEV_ROOT/'development/frappe-bench/sites'/SITE/'private'/f'kandil-concurrency-{run_id}.json'
        if manifest.stat().st_mode & 0o077:raise AssertionError('Private credential file permissions too broad')
        data=json.loads(manifest.read_text())
        actors={key:Actor(data['users'][key]) for key in ['requester','manager','hr']}
        before=bench('inspect',run_id)
        payloads=[dict(name=r['name'],command_id=uuid.uuid4().hex,expected_version=r['modified']) for r in data['requests']]
        results,peak=batch(actors['requester'],'kandil_hr.recruitment.api.submit_request',payloads)
        successes=[r for r in results if r['status']==200]
        denied=[r for r in results if r['status']==417 and 'Headcount blocking is enabled' in json.dumps(r['body'])]
        after=bench('inspect',run_id)
        assert len(successes)==5 and len(denied)==15, 'Expected five reservations and fifteen controlled BLOCK denials'
        assert after['ledger']==dict(structural=5,occupied=0,reserved=5,open_slots=0,available=0), 'Reservation ledger mismatch'
        assert sum(r['status']=='Pending' for r in after['requests'])==5, 'Pending count mismatch'
        assert sum(r['status']=='Draft' for r in after['requests'])==15, 'Denied requests mutated'
        assert counts_delta(after['counts'],before['counts'])['Kandil Command Receipt']==5, 'Denied commands left receipts'
        evidence['checks'].append(dict(name='20 submissions contend for five BLOCK seats',status='PASS',
            **sanitized_batch(results,peak),ledger=after['ledger']))
        selected=next(r['name'] for r in after['requests'] if r['status']=='Pending')
        for actor,expected_pending,expected_openings in [('manager',1,0),('hr',0,1)]:
            before=bench('inspect',run_id)
            doc=next(r for r in before['requests'] if r['name']==selected)
            step=next(s for s in doc['steps'] if s['decision']=='Pending')
            payload=dict(name=selected,decision='Approve',step_id=step['key'],
                command_id=uuid.uuid4().hex,expected_version=doc['modified'])
            results,peak=batch(actors[actor],'kandil_hr.recruitment.api.decide',[copy.deepcopy(payload) for _ in range(20)])
            if not all(r['status']==200 for r in results):
                evidence['checks'].append(dict(name=f'Concurrent {actor} approval diagnostics',status='FAIL',
                    **sanitized_batch(results,peak),error_types=sorted({str(r['body'].get('exc_type')) for r in results if r['status']!=200}),
                    errors=sorted({str(r['body'].get('exception',''))[:220] for r in results if r['status']!=200})))
            assert all(r['status']==200 for r in results), 'Concurrent approval replay returned an HTTP error'
            bodies=[json.dumps(r['body']['message'],sort_keys=True) for r in results]
            assert len(set(bodies))==1,'Same command returned divergent approval outcomes'
            after=bench('inspect',run_id);doc=next(r for r in after['requests'] if r['name']==selected)
            assert sum(s['decision']=='Pending' for s in doc['steps'])==expected_pending,'Approval advanced more than once'
            delta=counts_delta(after['counts'],before['counts'])
            assert delta['Kandil Command Receipt']==1 and delta['Kandil Request Revision']==1 and delta['Kandil Recruitment Event']==1,'Concurrent approval duplicated effects'
            assert after['counts']['Job Opening']==expected_openings,'Unexpected duplicate opening'
            assert delta['Kandil Notification Outbox']==(2 if actor=='manager' else 1),'Concurrent approval duplicated notifications'
            if actor=='hr':assert after['ledger']==dict(structural=5,occupied=0,reserved=4,open_slots=1,available=0),'Finalization ledger mismatch'
            evidence['checks'].append(dict(name=f'20 identical concurrent {actor} approvals advance once',status='PASS',
                **sanitized_batch(results,peak),effect_delta=delta,ledger=after['ledger']))
        evidence['status']='PASS'
    except Exception as exc:
        evidence['status']='FAIL'
        # Only our bounded assertion/diagnostic messages, never HTTP bodies or passwords.
        evidence['failure_type']=type(exc).__name__
        if isinstance(exc,(AssertionError,RuntimeError)):evidence['failure']=str(exc)[:240]
    finally:
        if prepared:
            try:
                cleanup=bench('cleanup',run_id)
                evidence['cleanup']={key:cleanup[key] for key in ['ledger','audit_retained','accounts_disabled']}
            except Exception as exc:
                evidence['status']='FAIL';evidence['cleanup_error']=type(exc).__name__
        evidence['finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        evidence['source_hashes_after']=source_hashes()
        evidence['source_unchanged_during_run']=evidence['source_hashes_before']==evidence['source_hashes_after']
        OUTPUT.parent.mkdir(parents=True,exist_ok=True)
        if previous:evidence['previous_execution']=previous
        OUTPUT.write_text(json.dumps(evidence,indent=2)+'\n')
        print(json.dumps({k:v for k,v in evidence.items() if k not in ['previous_execution','source_hashes_before','source_hashes_after']},indent=2))
    return 0 if evidence['status']=='PASS' else 1


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=OUTPUT)
    OUTPUT=parser.parse_args().output
    raise SystemExit(main())
