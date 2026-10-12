"""CLI-only independent-connection proofs for pending revision interactions.

Dedicated UUID company only. Existing production commands run unmodified with
ordinary synthetic identities. A winner holds Company while a contender creates
an old REPEATABLE-READ snapshot and enters its domain-lock call. Both serialized
orders are tested; this is correctness evidence, not production load testing.
"""
import json
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
from unittest.mock import patch

import frappe

from kandil_hr.foundation import outbox, security
from kandil_hr.foundation.concurrency_runner import _connection, _guard
from kandil_hr.recruitment import api, headcount_http_fixture as fixture
from kandil_hr.recruitment.pending_revision import revise_pending_quantities
from kandil_hr.recruitment.test_commands import acting_as


def pair(company, winner, contender, prepare_contender):
    site, sites_path = frappe.local.site, str(Path(frappe.local.sites_path).resolve())
    held, entering_lock = Event(), Event()

    def first():
        frappe.db.sql('SELECT name FROM `tabCompany` WHERE name=%s FOR UPDATE', (company,))
        connection = frappe.db.sql('SELECT CONNECTION_ID()')[0][0]
        held.set()
        if not entering_lock.wait(20):
            raise RuntimeError('Contender did not enter the Company lock call')
        return dict(connection=connection, result=winner())

    def second():
        if not held.wait(20):
            raise RuntimeError('Winner did not hold Company')
        connection = frappe.db.sql('SELECT CONNECTION_ID()')[0][0]
        isolation = frappe.db.sql('SELECT @@tx_isolation')[0][0]
        prepare_contender()  # establish a real old consistent snapshot
        original_sql = frappe.db.sql
        def observed_sql(query, *args, **kwargs):
            # Observe the call boundary only; preserve actual MariaDB locking.
            if 'FROM `tabCompany`' in str(query) and 'FOR UPDATE' in str(query):
                entering_lock.set()
            return original_sql(query, *args, **kwargs)
        with patch.object(frappe.db, 'sql', side_effect=observed_sql):
            result = contender()
        return dict(connection=connection, isolation=isolation, result=result)

    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(_connection, site, sites_path, first)
        b = pool.submit(_connection, site, sites_path, second)
        results = [a.result(timeout=60), b.result(timeout=60)]
    assert results[0]['connection'] != results[1]['connection']
    assert results[1]['isolation'] == 'REPEATABLE-READ'
    frappe.db.rollback()  # inspect through a fresh root snapshot
    return results


def run():
    _guard()
    run_id = uuid.uuid4().hex[:12]
    checks = []
    data = None
    cleanup = None
    failure = None
    try:
        fixture.prepare(run_id)
        data = fixture.load(run_id)
        company = data['company']
        requester = data['users']['requester']['email']
        manager = data['users']['manager']['email']
        before_mail = frappe.db.count('Email Queue')

        def request(key):
            return frappe.get_doc('Kandil Hiring Request', data['headcount_requests'][key])

        def revision(doc):
            with acting_as(requester):
                return revise_pending_quantities(doc.name, uuid.uuid4().hex, str(doc.modified),
                    {row.name: 3 for row in doc.lines}, 'Synthetic independent race revision')['revision']

        def approval(doc):
            with acting_as(manager):
                step = next(row for row in doc.approval_steps if row.decision == 'Pending')
                return api.decide(doc.name, 'Approve', step.step_key, uuid.uuid4().hex,
                    str(doc.modified), comment='Synthetic concurrent decision')['revision']

        def stale(action):
            try:
                action()
            except frappe.TimestampMismatchError:
                return 'stale'
            raise AssertionError('Old reviewed version was accepted')

        for key, revision_first in [('browser_success_en', True), ('browser_success_ar', False)]:
            doc = request(key)
            before = fixture.inspect(run_id)['requests'][key]
            first = (lambda: revision(doc)) if revision_first else (lambda: approval(doc))
            second = (lambda: stale(lambda: approval(doc))) if revision_first else (lambda: stale(lambda: revision(doc)))
            def old_snapshot():
                assert frappe.db.get_value(doc.doctype, doc.name, 'modified') == doc.modified
            frappe.db.rollback()
            result = pair(company, first, second, old_snapshot)
            assert result[1]['result'] == 'stale'
            current = request(key)
            cap = frappe.get_doc('Kandil Capacity', current.lines[0].capacity)
            assert cap.reserved == (3 if revision_first else 2)
            assert cap.open_slots == cap.occupied == 0
            assert current.revision == (2 if revision_first else 1)
            assert current.approval_steps[0].decision == ('Pending' if revision_first else 'Approved')
            if revision_first:
                assert {r.step_key for r in current.approval_steps}.isdisjoint({r.step_key for r in doc.approval_steps})
            counts = fixture.inspect(run_id)['requests'][key]['counts']
            for kind in ('Kandil Command Receipt', 'Kandil Command Audit'):
                assert counts[kind] == before['counts'][kind] + 1
            checks.append(dict(name='revision_then_approval' if revision_first else 'approval_then_revision',
                status='PASS', connections=2, stale_contender=True, reserved=cap.reserved))

        # Positive old authorization must not survive revocation committed while
        # the requester waits for the business mutex.
        doc = request('replay')
        grant_name = frappe.db.get_value('Kandil Access Grant', {'company': company, 'user': requester}, 'name')
        before = fixture.inspect(run_id)
        def revoke():
            grant = frappe.get_doc('Kandil Access Grant', grant_name)
            grant.revoked = 1
            grant.save(ignore_permissions=True)
            return 'revoked'
        def old_authorization():
            assert security.request_scope(frappe.get_doc(doc.doctype, doc.name), requester, 'manage')
        def denied_revision():
            try:
                revision(doc)
            except frappe.PermissionError:
                return 'permission_denied'
            raise AssertionError('Revoked requester revised quantities')
        frappe.db.rollback()
        result = pair(company, revoke, denied_revision, old_authorization)
        assert result[1]['result'] == 'permission_denied'
        after = fixture.inspect(run_id)
        assert after['requests'] == before['requests'] and after['capacities'] == before['capacities']
        grant = frappe.copy_doc(frappe.get_doc('Kandil Access Grant', grant_name))
        grant.revoked = 0
        grant.reason = 'Fresh synthetic grant after completed revocation proof'
        grant.insert(ignore_permissions=True)
        frappe.db.commit()
        checks.append(dict(name='grant_revocation_after_old_authorized_snapshot', status='PASS', connections=2,
            business_state_unchanged=True))

        # Delivery starts from a Pending snapshot, then waits for the revision.
        # Current row/authorization must see suppression, not deliver old content.
        doc = request('browser_denied_en')
        notice = frappe.db.get_value('Kandil Notification Outbox', {
            'reference_name': doc.name, 'recipient': manager, 'status': 'Pending'}, 'name')
        assert notice
        def old_notice():
            assert frappe.db.get_value('Kandil Notification Outbox', notice, 'status') == 'Pending'
        frappe.db.rollback()
        result = pair(company, lambda: revision(doc), lambda: outbox.deliver(notice), old_notice)
        assert result[1]['result'] == 'Suppressed'
        row = frappe.get_doc('Kandil Notification Outbox', notice)
        assert not row.notification_log and row.status == 'Suppressed'
        assert row.last_error == 'Superseded by pending quantity revision'
        checks.append(dict(name='old_notification_delivery_waits_for_revision_and_suppresses', status='PASS', connections=2,
            notification_created=False))
        assert frappe.db.count('Email Queue') == before_mail
        checks.append(dict(name='no_external_email_queue_effect', status='PASS'))
    except Exception as error:
        frame = traceback.extract_tb(error.__traceback__)[-1]
        failure = dict(error_type=type(error).__name__, file=Path(frame.filename).name, line=frame.lineno)
    finally:
        frappe.db.rollback()
        frappe.set_user('Administrator')
        if data is not None:
            cleanup = fixture.cleanup(run_id)
    return dict(result='FAIL' if failure else 'PASS', run_id=run_id, tests=checks, total=len(checks), cleanup=cleanup, failure=failure,
        limits=['Independent native connections; separate HTTP evidence covers authentication/CSRF.',
                'SQL wrapper observes the Company lock call only; no lock or business outcome is mocked.',
                'Both selected serialization orders are proven; not exhaustive scheduling or load certification.'])
