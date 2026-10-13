"""Requester event coverage through real commands, local receipts and inbox reads."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.utils import now_datetime

from kandil_hr.foundation import outbox
from kandil_hr.organization.api import transition as organization_transition
from kandil_hr.portal.notifications import listing
from kandil_hr.recruitment import api, corrections, notifications
from kandil_hr.recruitment.test_commands import TestRecruitmentCommands, acting_as


class TestNotificationEvents(unittest.TestCase):
    def setUp(self):
        self.f = TestRecruitmentCommands()
        self.addCleanup(self.f.doCleanups)
        self.f.setUp()
        self.request = self.f.request()

    def notices(self, name=None):
        return frappe.get_all('Kandil Notification Outbox', filters={
            'reference_doctype': 'Kandil Hiring Request', 'reference_name': name or self.request.name,
            'recipient': self.f.users['requester'],
        }, fields=['name', 'body', 'subject', 'notification_log', 'status'])

    def check_event(self, action, label, *, parent=None):
        before = {r.name for r in self.notices(parent)}
        action()
        added = [r for r in self.notices(parent) if r.name not in before]
        self.assertTrue(added, label)
        for row in added:
            self.assertIn(label, row.subject + row.body)
            self.assertNotIn('PRIVATE_REASON', row.body)
            self.assertEqual(outbox.deliver(row.name), 'Delivered locally')
            receipt = frappe.db.get_value('Kandil Notification Outbox', row.name, 'notification_log')
            self.assertEqual(outbox.deliver(row.name), 'Delivered locally')
            self.assertEqual(frappe.db.get_value('Kandil Notification Outbox', row.name, 'notification_log'), receipt)
            with acting_as(self.f.users['requester']):
                visible = listing(search=label, page_length=100)
            self.assertIn(receipt, {r.name for r in visible['rows']})
        return added

    def approved(self):
        self.f.submit(self.request.name)
        self.f.approve_all(self.request.name)

    def test_submission_approvals_hr_review_and_correction_reach_requester(self):
        self.check_event(lambda: self.f.submit(self.request.name), 'Submitted')
        self.check_event(lambda: self.f.decide(self.request.name, 'manager'), 'Approve')
        self.check_event(lambda: self.f.call('hr', api.review, self.request.name,
            quantities={}, priority='Normal', reason='PRIVATE_REASON HR review'), 'HR review')
        self.check_event(lambda: self.f.decide(self.request.name, 'hr'), 'Approve')
        self.check_event(lambda: self.f.call('hr', corrections.correct_approved, self.request.name,
            fields={'skills_required': 'Updated synthetic requirement'}, reason='PRIVATE_REASON correction'), 'HR correction')

    def test_return_revision_rejection_and_cancel_are_delivered(self):
        self.f.submit(self.request.name)
        self.check_event(lambda: self.f.decide(self.request.name, 'manager', decision='Return', comment='PRIVATE_REASON return'), 'Return')
        self.check_event(lambda: self.f.call('requester', api.revise, self.request.name, reason='PRIVATE_REASON revision'), 'Revised')
        self.f.submit(self.request.name)
        self.check_event(lambda: self.f.decide(self.request.name, 'manager', decision='Reject', comment='PRIVATE_REASON reject'), 'Reject')
        self.request = self.f.request()
        self.f.submit(self.request.name)
        self.check_event(lambda: self.f.call('requester', api.cancel_request, self.request.name, reason='PRIVATE_REASON cancel'), 'Cancelled')

    def test_hr_amendment_creation_preserves_original_version_and_replay(self):
        self.approved()
        original = self.f.load(self.request.name)
        key = uuid.uuid4().hex
        args = dict(reason='PRIVATE_REASON amendment', command_id=key, expected_version=str(original.modified))
        created = {}
        def create():
            created.update(self.f.call('hr', api.amend, original.name, **args))
        added = self.check_event(create, 'Amendment proposed')
        self.assertEqual(len(added), 1)
        self.assertNotIn(created['name'], added[0].body)
        self.assertEqual(str(self.f.load(original.name).modified), str(original.modified))
        before = self.notices()
        self.assertEqual(self.f.call('hr', api.amend, original.name, **args), created)
        self.assertEqual(self.notices(), before)
        self.f.ledger((0, 0), (2, 1))

    def configure_ceo(self):
        from frappe.utils import today
        user = self.f.prefix.lower() + '-ceo@example.invalid'
        self.f.users['ceo'] = user
        self.f.insert('User', email=user, first_name='Synthetic CEO', enabled=1, send_welcome_email=0,
            user_type='System User', roles=[dict(role='Kandil CEO Approver')])
        self.f.insert('Kandil Access Grant', user=user, company=self.f.company, department=self.f.department,
            valid_from=today(), can_manage_recruitment=1, reason='Synthetic independent amendment authority')
        settings = frappe.get_doc('Kandil Organization Settings', self.f.company)
        settings.ceo_approver = user
        settings.save()
        self.f.route.ceo_approver = user
        self.f.route.save()

    def test_hr_owned_amendment_steps_notify_original_requester_without_child_content(self):
        self.configure_ceo()
        self.approved()
        child = self.f.call('hr', api.amend, self.request.name, reason='PRIVATE_REASON amendment')['name']
        self.assertEqual(self.f.load(child).requested_by, self.f.users['hr'])
        self.check_event(lambda: self.f.call('hr', api.submit_request, child), 'Amendment submitted')
        self.check_event(lambda: self.f.decide(child, 'manager', decision='Return', comment='PRIVATE_REASON return'), 'Amendment returned')
        self.check_event(lambda: self.f.call('hr', api.revise, child, reason='PRIVATE_REASON revision'), 'Amendment draft revised')
        self.check_event(lambda: self.f.call('hr', api.submit_request, child), 'Amendment submitted')
        self.check_event(lambda: self.f.decide(child, 'manager', decision='Reject', comment='PRIVATE_REASON reject'), 'Amendment rejected')
        for notice in self.notices():
            self.assertNotIn(child, notice.body)
            self.assertNotIn('PRIVATE_REASON', notice.body)

    def test_hr_amendment_approval_application_reaches_original_requester(self):
        self.configure_ceo()
        self.approved()
        child = self.f.call('hr', api.amend, self.request.name, reason='PRIVATE_REASON amendment')['name']
        self.f.call('hr', api.submit_request, child)
        self.check_event(lambda: self.f.decide(child, 'manager'), 'Amendment approval recorded')
        # Final approval also produces the parent's distinct "Amendment applied" event.
        before = {r.name for r in self.notices()}
        self.f.decide(child, 'ceo')
        added = [r for r in self.notices() if r.name not in before]
        self.assertEqual(len(added), 2)
        for notice in added:
            self.assertEqual(outbox.deliver(notice.name), 'Delivered locally')
            self.assertNotIn(child, notice.body)
            self.assertNotIn('PRIVATE_REASON', notice.body)
        self.assertEqual(self.f.load(child).status, 'Applied')
        self.f.ledger((0, 0), (2, 1))

    def test_hr_amendment_cancel_notifies_original_requester(self):
        self.approved()
        child = self.f.call('hr', api.amend, self.request.name, reason='PRIVATE_REASON amendment')['name']
        self.check_event(lambda: self.f.call('hr', api.cancel_request, child, reason='PRIVATE_REASON cancel'), 'Amendment cancelled')
        self.f.ledger((0, 0), (2, 1))

    def baseline_access(self, expected):
        parent = self.f.load(self.request.name)
        user = self.f.users['ceo']
        self.assertEqual(bool(frappe.has_permission(parent.doctype, 'read', doc=parent, user=user)), expected)
        with acting_as(user):
            names = frappe.get_list(parent.doctype, pluck='name', page_length=100)
            self.assertEqual(parent.name in names, expected)
        return parent

    def submitted_hr_amendment(self):
        self.configure_ceo()
        self.approved()
        child = self.f.call('hr', api.amend, self.request.name, reason='PRIVATE_REASON amendment')['name']
        self.f.call('hr', api.submit_request, child)
        return child

    def test_baseline_read_requires_submitted_child_and_grants_no_write_or_unrelated_access(self):
        self.configure_ceo()
        self.approved()
        self.baseline_access(False)
        child = self.f.call('hr', api.amend, self.request.name, reason='PRIVATE_REASON amendment')['name']
        self.baseline_access(False)
        self.f.call('hr', api.submit_request, child)
        parent = self.baseline_access(True)
        self.assertFalse(frappe.has_permission(parent.doctype, 'write', doc=parent, user=self.f.users['ceo']))
        unrelated = self.f.request((1, 1))
        with acting_as(self.f.users['ceo']):
            self.assertNotIn(unrelated.name, frappe.get_list(parent.doctype, pluck='name', page_length=100))
            with self.f.rejected(frappe.PermissionError):
                unrelated.check_permission('read')
        self.f.call('manager', api.decide, child, decision='Return', comment='PRIVATE_REASON return', step_id=self.f.load(child).approval_steps[0].step_key)
        self.f.call('hr', api.revise, child, reason='PRIVATE_REASON restart')
        self.baseline_access(False)

    def test_child_link_user_permissions_block_derived_baseline_access(self):
        self.submitted_hr_amendment()
        self.baseline_access(True)
        # The original's requester/manager/HR references are permitted. Only the
        # amendment's additional CEO approval-row identity is disallowed.
        for key in ('requester', 'manager', 'hr'):
            self.f.insert('User Permission', user=self.f.users['ceo'], allow='User',
                for_value=self.f.users[key], apply_to_all_doctypes=0, applicable_for='Kandil Hiring Request')
        frappe.clear_cache(user=self.f.users['ceo'])
        self.baseline_access(False)

    def test_current_scope_revocation_blocks_baseline_and_its_queued_notice(self):
        self.submitted_hr_amendment()
        parent = self.baseline_access(True)
        notice = outbox.enqueue(uuid.uuid4().hex, self.f.users['ceo'], 'Baseline review',
            reference_doctype=parent.doctype, reference_name=parent.name)
        self.assertEqual(outbox.deliver(notice), 'Delivered locally')
        pending = outbox.enqueue(uuid.uuid4().hex, self.f.users['ceo'], 'Baseline review again',
            reference_doctype=parent.doctype, reference_name=parent.name)
        grant = frappe.get_doc('Kandil Access Grant', {'user': self.f.users['ceo'], 'company': self.f.company})
        grant.revoked = 1
        grant.save()
        self.baseline_access(False)
        self.assertEqual(outbox.deliver(pending), 'Suppressed')
        self.assertFalse(frappe.db.get_value('Kandil Notification Outbox', pending, 'notification_log'))

    def test_cached_former_hr_role_does_not_create_delivery_relationship(self):
        from frappe.utils import today
        self.submitted_hr_amendment()
        user = self.f.prefix.lower() + '-observer@example.invalid'
        self.f.insert('User', email=user, first_name='Synthetic observer', enabled=1,
            send_welcome_email=0, user_type='System User', roles=[dict(role='Kandil Requester')])
        self.f.insert('Kandil Access Grant', user=user, company=self.f.company,
            department=self.f.department, valid_from=today(), can_manage_recruitment=0,
            reason='Synthetic read scope without request relationship')
        notice = outbox.enqueue(uuid.uuid4().hex, user, 'Must not disclose baseline',
            reference_doctype='Kandil Hiring Request', reference_name=self.request.name)
        get_roles = frappe.get_roles
        def cached_roles(name=None, *args, **kwargs):
            roles = get_roles(name, *args, **kwargs)
            return roles + ['Kandil Recruiter'] if name == user else roles
        with patch.object(frappe, 'get_roles', side_effect=cached_roles):
            self.assertEqual(outbox.deliver(notice), 'Suppressed')
        self.assertFalse(frappe.db.get_value('Kandil Notification Outbox', notice, 'notification_log'))
        self.assertFalse(frappe.db.exists('Kandil Mail Capture', {'outbox': notice}))

    def test_requester_amendment_creation_is_not_silent(self):
        self.approved()
        self.check_event(lambda: self.f.call('requester', api.amend, self.request.name, reason='PRIVATE_REASON amendment'), 'Amendment proposed')

    def test_amendment_notification_failure_rolls_back_child_and_command(self):
        self.approved()
        counts = self.f.counts(self.request.name)
        with self.f.rejected(RuntimeError), patch.object(notifications, 'enqueue', side_effect=RuntimeError('Synthetic enqueue failure')):
            self.f.call('hr', api.amend, self.request.name, reason='PRIVATE_REASON failure')
        self.assertEqual(counts, self.f.counts(self.request.name))
        self.assertFalse(frappe.db.exists('Kandil Hiring Request', {'amends': self.request.name}))
        self.f.ledger((0, 0), (2, 1))

    def test_vacant_position_notice_is_minimal_visible_and_deduplicated(self):
        assignment = frappe.get_doc('Kandil Position Assignment', {'user': self.f.users['manager']})
        with organization_transition():
            assignment.is_voided = 1
            assignment.void_reason = 'Synthetic vacant head'
            assignment.voided_by = frappe.session.user
            assignment.voided_on = now_datetime()
            assignment.save()
        args = dict(command_id=uuid.uuid4().hex, expected_version=str(self.request.modified))
        self.f.submit(self.request.name, **args)
        notices = [r for r in self.notices() if r.subject.startswith('Approval route updated')]
        self.assertEqual(len(notices), 1)
        self.assertNotIn(assignment.position, notices[0].body)
        self.assertNotIn(self.f.users['manager'], notices[0].body)
        self.assertIn('تم تجاوز', notices[0].body)
        self.assertEqual(outbox.deliver(notices[0].name), 'Delivered locally')
        before = self.notices()
        self.f.submit(self.request.name, **args)
        self.assertEqual(self.notices(), before)
        with acting_as(self.f.users['requester']):
            self.assertEqual(listing(search='Approval route updated')['total'], 1)

    def test_revoked_original_requester_cannot_receive_hr_amendment_notice(self):
        self.approved()
        self.f.call('hr', api.amend, self.request.name, reason='PRIVATE_REASON amendment')
        grant = frappe.get_doc('Kandil Access Grant', self.f.grants['requester'])
        grant.revoked = 1
        grant.save()
        notice = next(r for r in self.notices() if 'Amendment proposed' in r.subject)
        self.assertEqual(outbox.deliver(notice.name), 'Suppressed')
        self.assertFalse(frappe.db.get_value('Kandil Notification Outbox', notice.name, 'notification_log'))


def run():
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestNotificationEvents)
    cases = [t.id() for t in suite]
    result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2).run(suite)
    summary = dict(suite='recruitment-notification-events', tests_run=result.testsRun,
        failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped),
        successful=result.wasSuccessful() and not result.skipped and result.testsRun == len(cases) > 0,
        fixtures_rolled_back=True, cases=cases)
    if not summary['successful']:
        print(json.dumps(summary)); raise AssertionError('Notification event suite failed')
    return summary
