"""Real scoped delegate/Board reminder authority, captured locally and rolled back."""
import json
import sys
import unittest
import uuid
import frappe
from frappe.utils import today
from kandil_hr.foundation import delegation, outbox
from kandil_hr.recruitment import sla
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.test_sla import TestApprovalSLA


class TestReminderRecipients(unittest.TestCase):
    def setUp(self):
        self.base = TestApprovalSLA()
        self.addCleanup(self.base.doCleanups)
        self.base.setUp()
        self.f = self.base.fixture

    def actor(self, key, roles):
        email = self.f.prefix.lower() + '-' + key + '@example.invalid'
        self.f.users[key] = email
        self.f.insert('User', email=email, first_name=key, enabled=1, send_welcome_email=0,
            user_type='System User', roles=[dict(role=r) for r in roles])
        self.f.grants[key] = self.f.insert('Kandil Access Grant', user=email, company=self.f.company,
            department=self.f.department, valid_from=today(), can_manage_recruitment=1,
            reason='Synthetic reminder authority').name
        return email

    def grant(self, process='APPROVALS', principal='manager', **extra):
        if 'delegate' not in self.f.users:
            self.actor('delegate', ['Kandil Approver', 'Kandil Recruiter'])
        values = dict(doctype='Kandil Delegation', company=self.f.company, department=self.f.department,
            from_user=self.f.users[principal], to_user=self.f.users['delegate'], from_date='2026-10-08',
            to_date='2026-10-30', process_scope=process, reason='Synthetic reminder delegation') | extra
        with acting_as(self.f.users['sector']):
            return frappe.get_doc(values).insert()

    def revoke(self, grant):
        with acting_as(self.f.users['sector']):
            grant.reload(); grant.revoked = 1; grant.revocation_reason = 'Synthetic delegation revocation'; grant.save()

    def rows(self, day='2026-10-12'):
        return [frappe.get_doc('Kandil Notification Outbox', n) for n in self.base.process_on(day)['outbox']]

    def for_user(self, rows, key):
        return next(row for row in rows if row.recipient == self.f.users[key])

    def suppressed(self, name, day='2026-10-12'):
        self.assertEqual(self.base.deliver_on(name, day), 'Suppressed')
        self.assertFalse(frappe.db.exists('Kandil Mail Capture', {'outbox':name}))
        self.assertFalse(frappe.db.get_value('Kandil Notification Outbox', name, 'notification_log'))

    def reach(self, board=False):
        self.actor('ceo', ['Kandil CEO Approver'])
        settings = frappe.get_doc('Kandil Organization Settings', self.f.company)
        settings.ceo_approver = self.f.users['ceo']
        if board:
            self.actor('chair', ['Kandil Board Approver'])
            self.actor('vice', ['Kandil Board Approver'])
            settings.board_approver = self.f.users['chair']; settings.board_vice_approver = self.f.users['vice']
            self.f.route.board_approver = self.f.users['chair']; self.f.route.board_after_ceo = 1
        settings.save()
        self.f.route.ceo_approver = self.f.users['ceo']; self.f.route.ceo_for_critical = 1; self.f.route.save()
        doc = self.f.request((1,))
        with acting_as(self.f.users['requester']):
            doc.requested_priority = 'Critical'; doc.save()
        self.f.submit(doc.name)
        for role in (('manager','hr','ceo') if board else ('manager','hr')):
            self.f.decide(doc.name, role)
        self.base.request = doc
        self.base.set_waiting_start()
        return self.f.load(doc.name)

    def test_active_delegate_and_principal_receive_bilingual_idempotent_notice(self):
        grant = self.grant()
        rows = self.rows()
        self.assertEqual({r.recipient for r in rows}, {self.f.users['manager'], self.f.users['delegate']})
        self.assertEqual([r.name for r in rows], [r.name for r in self.rows()])
        delegated = self.for_user(rows, 'delegate')
        self.assertEqual(json.loads(delegated.delivery_context)['recipient_basis'], ['delegation:' + grant.name])
        for r in rows:
            self.assertIn('تذكير بالاعتماد', r.subject)
            self.assertNotIn(grant.name, r.body)
            self.assertEqual(self.base.deliver_on(r.name), 'Delivered locally')
            self.assertEqual(self.base.deliver_on(r.name), 'Delivered locally')
            self.assertEqual(frappe.db.count('Kandil Mail Capture', {'outbox':r.name}), 1)

    def test_team_only_and_future_delegations_do_not_receive_approval_reminders(self):
        self.grant(process='TEAM')
        self.assertEqual({r.recipient for r in self.rows()}, {self.f.users['manager']})

    def test_future_approval_delegation_is_excluded(self):
        self.grant(from_date='2026-10-14')
        self.assertEqual({r.recipient for r in self.rows()}, {self.f.users['manager']})

    def test_revoked_delegate_suppressed_even_with_independent_recruiter_read(self):
        grant = self.grant(); row = self.for_user(self.rows(), 'delegate'); self.revoke(grant)
        self.assertTrue(frappe.has_permission('Kandil Hiring Request','read',doc=self.f.load(self.base.request.name),user=row.recipient))
        self.suppressed(row.name)

    def test_new_delegation_version_has_new_notice_without_reviving_old(self):
        grant = self.grant(); old = self.for_user(self.rows(), 'delegate'); self.revoke(grant); self.suppressed(old.name)
        fresh = self.grant(); new = self.for_user(self.rows(), 'delegate')
        self.assertNotEqual(new.name, old.name)
        self.assertEqual(json.loads(new.delivery_context)['recipient_basis'], ['delegation:' + fresh.name])
        self.assertEqual(self.base.deliver_on(new.name), 'Delivered locally')
        self.suppressed(old.name)

    def test_expired_delegation_suppressed_even_for_same_expiry_stage(self):
        self.grant(to_date='2026-10-15')
        row = self.for_user(self.rows('2026-10-15'), 'delegate')
        self.suppressed(row.name, '2026-10-18')

    def test_lost_approver_role_suppressed_despite_remaining_recruiter_role(self):
        row = self.for_user(self.rows(), 'manager')
        user = frappe.get_doc('User', row.recipient);user.set('roles',[r for r in user.roles if r.role != 'Kandil Approver']);user.save()
        self.suppressed(row.name)

    def test_replaced_escalation_contact_suppressed_even_if_old_user_can_read(self):
        row = self.for_user(self.rows('2026-10-13'), 'hr')
        replacement = self.actor('newhr', ['Kandil Recruiter'])
        settings = frappe.get_doc('Kandil Organization Settings', self.f.company);settings.hr_approver = replacement;settings.save()
        self.suppressed(row.name, '2026-10-13')
        fresh = self.for_user(self.rows('2026-10-13'), 'newhr')
        self.assertEqual(self.base.deliver_on(fresh.name, '2026-10-13'), 'Delivered locally')

    def test_board_chair_and_frozen_vice_are_both_notified(self):
        self.reach(board=True)
        rows = self.rows()
        self.assertEqual({r.recipient for r in rows}, {self.f.users['chair'],self.f.users['vice']})
        for row in rows:self.assertEqual(self.base.deliver_on(row.name), 'Delivered locally')

    def test_board_cannot_be_replaced_by_ordinary_delegation(self):
        self.reach(board=True);self.actor('delegate', ['Kandil Approver','Kandil Recruiter'])
        # Corrupt imported metadata must not bypass the Board prohibition.
        with delegation.effect():
            grant = self.grant(principal='manager')
        frappe.db.set_value('Kandil Delegation', grant.name, 'from_user', self.f.users['chair'])
        self.assertNotIn(self.f.users['delegate'], {r.recipient for r in self.rows()})

    def test_ceo_delegate_requires_personal_ceo_approval(self):
        self.reach();grant = self.grant(principal='ceo')
        self.assertEqual(grant.approval_status, 'Pending CEO')
        self.assertNotIn(self.f.users['delegate'], {r.recipient for r in self.rows()})
        with acting_as(self.f.users['ceo']):
            delegation.decide(name=grant.name, decision='Approve', reason='Synthetic CEO authorization', command_id=uuid.uuid4().hex, expected_version=str(grant.modified))
        row = self.for_user(self.rows(), 'delegate')
        self.assertEqual(self.base.deliver_on(row.name), 'Delivered locally')

    def test_interested_delegate_is_not_an_action_recipient(self):
        self.grant()
        frappe.db.set_value('Kandil Hiring Request', self.base.request.name, 'beneficiary_user', self.f.users['delegate'])
        self.assertNotIn(self.f.users['delegate'], {r.recipient for r in self.rows()})

    def test_frozen_board_vice_survives_later_settings_change(self):
        self.reach(board=True)
        new = self.actor('newvice', ['Kandil Board Approver'])
        settings = frappe.get_doc('Kandil Organization Settings', self.f.company)
        settings.board_vice_approver = new;settings.save()
        recipients = {r.recipient for r in self.rows()}
        self.assertIn(self.f.users['vice'], recipients)
        self.assertNotIn(new, recipients)

    def test_disabled_board_vice_is_not_queued(self):
        self.reach(board=True)
        frappe.db.set_value('User', self.f.users['vice'], 'enabled', 0)
        self.assertEqual({r.recipient for r in self.rows()}, {self.f.users['chair']})

    def test_multiple_current_bases_produce_one_notice_and_preserve_valid_contact(self):
        grant = self.grant()
        settings = frappe.get_doc('Kandil Organization Settings', self.f.company)
        settings.hr_approver = self.f.users['delegate'];settings.save()
        rows = self.rows('2026-10-15')
        matched = [r for r in rows if r.recipient == self.f.users['delegate']]
        self.assertEqual(len(matched), 1)
        self.assertEqual(json.loads(matched[0].delivery_context)['recipient_basis'], ['delegation:'+grant.name, 'hr_contact'])
        self.revoke(grant)
        self.assertEqual(self.base.deliver_on(matched[0].name, '2026-10-15'), 'Delivered locally')
        repeat = self.for_user(self.rows('2026-10-15'), 'delegate')
        self.assertNotEqual(repeat.name, matched[0].name)
        self.suppressed(repeat.name, '2026-10-15')
        self.assertEqual(frappe.db.count('Kandil Mail Capture', {'outbox':matched[0].name}), 1)



    def test_two_pending_authority_variants_deliver_only_one_receipt(self):
        grant = self.grant()
        settings = frappe.get_doc('Kandil Organization Settings', self.f.company)
        settings.hr_approver = self.f.users['delegate'];settings.save()
        old = self.for_user(self.rows('2026-10-15'), 'delegate')
        self.revoke(grant)
        new = self.for_user(self.rows('2026-10-15'), 'delegate')
        self.assertNotEqual(old.name, new.name)
        self.assertEqual(self.base.deliver_on(new.name, '2026-10-15'), 'Delivered locally')
        self.suppressed(old.name, '2026-10-15')
        self.assertEqual(self.base.deliver_on(new.name, '2026-10-15'), 'Delivered locally')


    def test_changed_waiting_date_regenerates_same_stage_without_key_collision(self):
        old = self.for_user(self.rows('2026-10-20'), 'manager')
        doc = self.f.load(self.base.request.name)
        step = next(s for s in doc.approval_steps if s.decision == 'Pending')
        frappe.db.set_value('Kandil Approval Step', step.name, 'waiting_since', '2026-10-07 12:00:00', update_modified=False)
        new = self.for_user(self.rows('2026-10-20'), 'manager')
        self.assertNotEqual(old.name, new.name)
        self.suppressed(old.name, '2026-10-20')
        self.assertEqual(self.base.deliver_on(new.name, '2026-10-20'), 'Delivered locally')
        self.assertEqual(new.name, self.for_user(self.rows('2026-10-20'), 'manager').name)


    def test_legacy_pending_context_suppressed_and_new_context_regenerated(self):
        row = self.rows()[0]; context = json.loads(row.delivery_context)
        old = {k:v for k,v in context.items() if k != 'recipient_basis'};old['kind'] = 'approval_sla_v2'
        name = outbox.enqueue('legacy-'+uuid.uuid4().hex, row.recipient, 'Approval reminder', 'Legacy',row.reference_doctype,row.reference_name,delivery_context=old)
        self.suppressed(name, '2026-10-20')
        self.assertEqual(self.base.deliver_on(row.name), 'Delivered locally')


def run():
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestReminderRecipients)
    cases = [test.id() for test in suite]
    result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2).run(suite)
    value = dict(suite='reminder-recipients', tests_run=result.testsRun, failures=len(result.failures),
        errors=len(result.errors), skipped=len(result.skipped), successful=result.wasSuccessful() and not result.skipped and result.testsRun==len(cases)>0, cases=cases, fixtures_rolled_back=True)
    if not value['successful']:
        print(json.dumps(value));raise AssertionError('Reminder recipient suite failed')
    return value
