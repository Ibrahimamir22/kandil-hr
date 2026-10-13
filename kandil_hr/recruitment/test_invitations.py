"""Invitation generation/delivery against real authority, without external workers."""
import json
import sys
import unittest
import uuid
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

import frappe

from kandil_hr.foundation import delegation, outbox
from kandil_hr.foundation.clock import test_clock
from kandil_hr.recruitment import api, invitations, sla
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.test_reminder_recipients import TestReminderRecipients


class TestInvitations(unittest.TestCase):
    def setUp(self):
        self.r = TestReminderRecipients()
        self.addCleanup(self.r.doCleanups)
        self.r.setUp()
        self.f = self.r.f

    def rows(self, day='2026-10-12'):
        with test_clock(datetime.fromisoformat(day+'T12:00:00').replace(tzinfo=ZoneInfo('Africa/Cairo'))), patch.object(outbox, 'now_datetime', return_value=datetime.fromisoformat(day+'T12:00:00')):
            return [frappe.get_doc('Kandil Notification Outbox', n)
                for n in invitations.process_request(self.r.base.request.name)['outbox']]

    def delegate_notice(self, rows):
        return next(r for r in rows if r.recipient == self.f.users['delegate'])

    def test_immediate_without_calendar_and_before_sla_delivers_once(self):
        grant = self.r.grant()
        with patch.object(sla, 'company_calendar', side_effect=AssertionError('Invitation must not require SLA calendar')):
            rows = self.rows('2026-10-08')
            self.assertEqual({r.recipient for r in rows}, {self.f.users['manager'], self.f.users['delegate']})
            self.assertEqual([r.name for r in rows], [r.name for r in self.rows('2026-10-08')])
            for row in rows:
                self.assertIn('مطلوب اعتمادك', row.subject)
                self.assertNotIn(grant.name, row.body)
                self.assertEqual(self.r.base.deliver_on(row.name, '2026-10-08'), 'Delivered locally')
                self.assertEqual(self.r.base.deliver_on(row.name, '2026-10-08'), 'Delivered locally')
                self.assertEqual(frappe.db.count('Kandil Mail Capture', {'outbox': row.name}), 1)

    def test_revoked_read_capable_delegate_has_no_receipt(self):
        grant = self.r.grant(); row = self.delegate_notice(self.rows()); self.r.revoke(grant)
        self.assertTrue(frappe.has_permission('Kandil Hiring Request', 'read', doc=self.f.load(self.r.base.request.name), user=row.recipient))
        self.r.suppressed(row.name)

    def test_completed_step_suppresses_old_invitation(self):
        self.r.grant(); rows = self.rows(); self.f.decide(self.r.base.request.name, 'manager')
        for row in rows: self.r.suppressed(row.name)
        fresh = self.rows()
        self.assertEqual({r.recipient for r in fresh}, {self.f.users['hr']})
        self.assertEqual(self.r.base.deliver_on(fresh[0].name), 'Delivered locally')

    def test_future_team_expired_grants_do_not_create_invitations(self):
        grant = self.r.grant(process='TEAM')
        self.assertEqual(len(self.rows()), 1)
        self.r.revoke(grant)
        grant = self.r.grant(from_date='2026-10-14')
        self.assertEqual(len(self.rows('2026-10-12')), 1)
        self.assertEqual(len(self.rows('2026-10-14')), 2)
        row = self.delegate_notice(self.rows('2026-10-14'))
        self.r.suppressed(row.name, '2026-10-31')

    def test_new_grant_after_suppression_but_no_duplicate_after_delivery(self):
        grant = self.r.grant(); old = self.delegate_notice(self.rows()); self.r.revoke(grant)
        self.r.suppressed(old.name)
        grant = self.r.grant(); new = self.delegate_notice(self.rows())
        self.assertNotEqual(new.name, old.name)
        self.assertEqual(self.r.base.deliver_on(new.name), 'Delivered locally')
        self.r.revoke(grant); self.r.grant(); newer = self.delegate_notice(self.rows())
        self.r.suppressed(newer.name)
        self.assertEqual(frappe.db.count('Kandil Mail Capture', {'outbox': new.name}), 1)
        self.assertEqual(self.r.base.deliver_on(new.name), 'Delivered locally')

    def test_ceo_personal_approval_required(self):
        self.r.reach()
        grant = self.r.grant(principal='ceo')
        self.assertEqual(grant.approval_status, 'Pending CEO')
        self.assertEqual(len(self.rows()), 1)
        with acting_as(self.f.users['ceo']):
            delegation.decide(grant.name, 'Approve', 'Synthetic CEO invitation approval', str(grant.modified), uuid.uuid4().hex)
        row = self.delegate_notice(self.rows())
        self.assertEqual(self.r.base.deliver_on(row.name), 'Delivered locally')

    def test_board_uses_frozen_chair_and_vice(self):
        self.r.reach(board=True)
        rows = self.rows()
        self.assertEqual({r.recipient for r in rows}, {self.f.users['chair'], self.f.users['vice']})
        self.assertEqual({basis for r in rows for basis in json.loads(r.delivery_context)['recipient_basis']}, {'principal','board_vice'})
        for row in rows:self.assertEqual(self.r.base.deliver_on(row.name), 'Delivered locally')

    def test_self_interest_and_disabled_principal_excluded(self):
        self.r.grant()
        doc = self.f.load(self.r.base.request.name)
        # Trusted historical beneficiary seed; normal authority checks are exercised.
        frappe.db.set_value(doc.doctype, doc.name, 'beneficiary_user', self.f.users['delegate'], update_modified=False)
        self.assertEqual({r.recipient for r in self.rows()}, {self.f.users['manager']})
        frappe.db.set_value('User', self.f.users['manager'], 'enabled', 0, update_modified=False)
        self.assertEqual(self.rows(), [])

    def test_cancelled_request_has_no_invitation(self):
        self.f.call('requester', api.cancel_request, self.r.base.request.name, reason='Synthetic cancellation')
        self.assertEqual(invitations.process_request(self.r.base.request.name), {'status':'Inactive','outbox':[]})

    def test_context_cannot_disguise_sla_or_requester_as_invitation(self):
        context = json.loads(self.rows()[0].delivery_context)
        for wrong in (context | {'stage':'reminder'}, context | {'recipient_basis':['requester']}, context | {'kind':'unknown'}):
            with self.assertRaises(ValueError):sla.validate_context(wrong)

    def test_hooks_defer_until_commit_and_keep_actor(self):
        with patch.object(frappe, 'enqueue') as enqueue:
            request = self.f.request()
            self.f.submit(request.name)
            calls = [c for c in enqueue.call_args_list if c.args and c.args[0] == invitations.PREFIX+'process_request']
            self.assertEqual(len(calls), 1)
            self.assertTrue(calls[0].kwargs['enqueue_after_commit'])
            self.assertEqual(calls[0].kwargs['name'], request.name)
            self.r.grant()
            grants = [c for c in enqueue.call_args_list if c.args and c.args[0] == invitations.PREFIX+'process_delegation']
            self.assertEqual(len(grants), 1)
            self.assertTrue(grants[0].kwargs['enqueue_after_commit'])
        self.assertEqual(self.f.load(request.name).requested_by, self.f.users['requester'])

    def test_nonworker_business_user_and_http_denied(self):
        with acting_as(self.f.users['sector']), self.assertRaises(frappe.PermissionError):
            invitations.process_request(self.r.base.request.name)
        with patch.object(frappe.local, 'request', object(), create=True), self.assertRaises(frappe.PermissionError):
            invitations.process_request(self.r.base.request.name)


def run():
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestInvitations)
    cases = [t.id() for t in suite]
    result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2).run(suite)
    summary = dict(suite='approval-invitations',tests_run=result.testsRun,failures=len(result.failures),
        errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped and result.testsRun==len(cases)>0,
        cases=cases,fixtures_rolled_back=True)
    if not summary['successful']:
        print(json.dumps(summary));raise AssertionError('Invitation tests failed')
    return summary
