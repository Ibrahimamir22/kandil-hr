"""Synthetic rollback tests for separate pool policy and recruiter evidence."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch
import frappe
from frappe.client import get as client_get
from kandil_hr.privacy import pool as api, pool_policy as policy, consent
from kandil_hr.privacy.test_consent import TestConsent
from kandil_hr.recruitment.test_commands import acting_as

def wording(**changes):
    values=dict(notice_ar='صياغة اصطناعية لقاعدة المرشحين للاختبار فقط وليست سياسة قانونية.',notice_en='Synthetic talent-pool wording for tests only; not an actual employer policy.',months=12,active=True)
    values.update(changes);return values

class TestPool(unittest.TestCase):
    def setUp(self):
        self.c=TestConsent();self.addCleanup(self.c.doCleanups);self.c.setUp()
        self.f=self.c.f;self.app=self.c.app;self.company=self.c.company;self.person=self.c.person
    def policy_args(self,**changes):
        return dict(company=self.company,version=policy.state(self.company)['version'],values=wording(**changes),reason='Synthetic HR approval of pool wording',command_id=uuid.uuid4().hex)
    def publish(self,args=None,role='hr',**changes):
        with acting_as(self.f.users[role]):return policy.save(**(args or self.policy_args(**changes)))
    def context(self,role='hr',application=None):
        with acting_as(self.f.users[role]):return api.context(application or self.app)
    def args(self,decision='GRANT',**changes):
        ctx=self.context();args=dict(application=self.app,expected_event=ctx['expected_event'],decision=decision,
            policy_revision=ctx['policy']['version'] if decision=='GRANT' and ctx['policy'] else '',expected_until=ctx['grant_until'] if decision=='GRANT' else '',
            channel='PHONE',evidence_note='Synthetic candidate reported this choice on the recorded channel',confirmed=True,command_id=uuid.uuid4().hex)
        args.update(changes);return args
    def record(self,args=None,role='hr'):
        with acting_as(self.f.users[role]):return api.record(**(args or self.args()))
    def history(self,**args):
        with acting_as(self.f.users['hr']):return api.history(self.app,**args)

    def test_no_implicit_policy_or_pool_consent_from_apply(self):
        ctx=self.context();self.assertEqual(ctx['state'],'none');self.assertFalse(ctx['can_grant']);self.assertIsNone(ctx['policy'])
        row=self.c.issue();token=self.c.reveal(row);self.c.accept(self.c.payload(token))
        self.assertEqual(self.context()['state'],'none')
        with self.assertRaises(frappe.ValidationError):self.record()

    def test_policy_requires_company_hr_authority_and_current_revision(self):
        args=self.policy_args()
        with self.assertRaises(frappe.PermissionError):self.publish(args,role='manager')
        first=self.publish(args);self.assertEqual(self.publish(args),first)
        with self.assertRaises(frappe.ValidationError):self.publish(dict(args,reason='Different retry'))
        with self.assertRaises(frappe.TimestampMismatchError):self.publish(dict(args,command_id=uuid.uuid4().hex))
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        with self.assertRaises(frappe.PermissionError):self.publish(args)

    def test_policy_strict_fields_and_no_invented_default(self):
        for values in [wording(months=0),wording(months=True),wording(months=121),wording(months='12'),wording(active='Y'),wording(notice_ar='short'),dict(wording(),extra=True)]:
            with self.assertRaises(frappe.ValidationError):policy.normalize(values)
        self.assertEqual(policy.normalize(wording())['months'],12)

    def test_grant_records_exact_policy_and_expiry_without_apply_or_business_changes(self):
        published=self.publish();before=self.c.snapshot()
        with patch.object(api,'today',return_value='2028-02-29'):
            args=self.args();self.assertEqual(args['expected_until'],'2029-02-28');result=self.record(args)
            self.assertEqual(self.context()['state'],'active')
        row=frappe.get_doc(api.DT,result['event'])
        self.assertEqual(row.policy_revision,published['version']);self.assertEqual(row.policy_hash,policy.state(self.company)['content_hash'])
        self.assertEqual(row.evidence_kind,'Recruiter record');self.assertEqual(row.actor,self.f.users['hr'])
        self.assertIsNone(consent.acceptance(self.company,self.person));self.assertFalse(result['application_consent_changed']);self.assertFalse(result['sent'])
        self.assertEqual(before,self.c.snapshot())

    def test_withdrawal_preserves_apply_and_prior_pool_evidence(self):
        self.publish();row=self.c.issue();token=self.c.reveal(row);self.c.accept(self.c.payload(token));accepted=consent.acceptance(self.company,self.person).as_dict()
        grant=self.record();original=frappe.get_doc(api.DT,grant['event']).as_dict();before=self.c.snapshot()
        withdrawal=self.record(self.args('WITHDRAW'));self.assertEqual(self.context()['state'],'withdrawn')
        self.assertEqual(original,frappe.get_doc(api.DT,grant['event']).as_dict());self.assertEqual(accepted,consent.acceptance(self.company,self.person).as_dict())
        self.assertEqual(before,self.c.snapshot());self.assertNotEqual(withdrawal['event'],grant['event'])

    def test_withdrawal_is_allowed_before_any_grant_and_without_live_policy(self):
        self.record(self.args('WITHDRAW'));self.assertEqual(self.context()['state'],'withdrawn')
        with self.assertRaises(frappe.ValidationError):self.record(self.args('WITHDRAW'))
        self.publish();self.record();self.publish(active=False);self.record(self.args('WITHDRAW'))
        self.assertEqual(self.context()['state'],'withdrawn');self.assertFalse(self.context()['can_grant'])

    def test_expiry_is_checked_without_scheduler_and_renewal_requires_new_evidence(self):
        self.publish(months=1)
        with patch.object(api,'today',return_value='2026-01-31'):self.record()
        with patch.object(api,'today',return_value='2026-02-28'):self.assertEqual(self.context()['state'],'active')
        with patch.object(api,'today',return_value='2026-03-01'):
            self.assertEqual(self.context()['state'],'expired');self.record();self.assertEqual(self.context()['state'],'active')
        self.assertEqual(frappe.db.count(api.DT,{'company':self.company}),2)

    def test_policy_revision_or_midnight_change_requires_review(self):
        self.publish();args=self.args();self.publish(months=6)
        with self.assertRaises(frappe.TimestampMismatchError):self.record(args)
        with patch.object(api,'today',return_value='2026-01-31'):args=self.args()
        with patch.object(api,'today',return_value='2026-02-01'),self.assertRaises(frappe.TimestampMismatchError):self.record(args)

    def test_unpublished_policy_does_not_rewrite_existing_grant(self):
        self.publish();grant=self.record();self.publish(active=False)
        ctx=self.context();self.assertEqual(ctx['state'],'active');self.assertEqual(ctx['valid_until'],grant['valid_until']);self.assertTrue(ctx['can_withdraw'])

    def test_exact_retry_and_stale_choice_cannot_duplicate_or_revive_consent(self):
        self.publish();args=self.args();result=self.record(args);self.record(self.args('WITHDRAW'))
        self.assertEqual(result,self.record(args));self.assertEqual(self.context()['state'],'withdrawn')
        with self.assertRaises(frappe.ValidationError):self.record(dict(args,evidence_note='Changed retry'))
        with self.assertRaises(frappe.TimestampMismatchError):self.record(dict(args,command_id=uuid.uuid4().hex))
        self.record();self.assertEqual(self.context()['state'],'active');self.assertEqual(frappe.db.count(api.DT,{'company':self.company}),3)

    def test_explicit_confirmation_channel_and_evidence_are_required(self):
        self.publish()
        for changes in [dict(confirmed=False),dict(confirmed='true'),dict(channel='IMPORT'),dict(evidence_note='x'),dict(decision='ACCEPT')]:
            with self.assertRaises(frappe.ValidationError):self.record(self.args(**changes))
        self.assertEqual(frappe.db.count(api.DT,{'company':self.company}),0)

    def test_replay_reads_current_account_role_and_access(self):
        self.publish();args=self.args();self.record(args)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        with self.assertRaises(frappe.PermissionError):self.record(args)
        with self.assertRaises(frappe.PermissionError):self.context()
        with self.assertRaises(frappe.PermissionError):self.history()
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',0)
        frappe.db.set_value('User',self.f.users['hr'],'enabled',0)
        with self.assertRaises(frappe.PermissionError):self.record(args)

    def test_person_consent_shared_across_authorized_applications(self):
        self.publish();grant=self.record();base=self.c.n.c.a.f;opening=base.second_opening();person=frappe.get_doc(consent.identity.DT,self.person)
        second=base.create(opening_name=opening,person=self.person,person_version=str(person.modified),identity_reason='Synthetic same person')
        ctx=self.context(application=second['application']);self.assertEqual(ctx['expected_event'],grant['event'])
        args=self.args('WITHDRAW',application=second['application']);self.record(args);self.assertEqual(self.context()['state'],'withdrawn')

    def test_history_pagination_hides_internal_application_and_command_ids(self):
        self.publish();grant=self.record();self.record(self.args('WITHDRAW'));first=self.history(page_length=1);second=self.history(start=1,page_length=1)
        self.assertTrue(first['has_more']);self.assertFalse(second['has_more']);self.assertEqual(first['rows'][0]['decision'],'WITHDRAW')
        for secret in (self.app,self.person,grant['event'],self.f.users['hr']):self.assertNotIn(secret,json.dumps([first,second],default=str))

    def test_native_events_and_policy_cannot_be_read_changed_copied_deleted_or_renamed(self):
        p=self.publish();e=self.record()
        for dt,name in [(policy.DT,p['version']),(api.DT,e['event'])]:
            doc=frappe.get_doc(dt,name)
            with acting_as(self.f.users['manager']),self.assertRaises(frappe.PermissionError):client_get(dt,name)
            with self.f.rejected(frappe.PermissionError):doc.save(ignore_permissions=True)
            with self.f.rejected(frappe.PermissionError):frappe.copy_doc(doc).insert(ignore_permissions=True)
            with self.f.rejected(frappe.PermissionError):frappe.delete_doc(dt,name,ignore_permissions=True)
            with self.f.rejected(frappe.PermissionError):frappe.rename_doc(dt,name,'Tampered',force=True)

    def test_insert_failure_rolls_back_and_can_retry(self):
        self.publish();args=self.args();before=self.c.snapshot()
        with patch.object(api.KandilPoolConsentEvent,'after_insert',side_effect=RuntimeError('Synthetic failure'),create=True),self.assertRaises(RuntimeError):self.record(args)
        self.assertEqual(self.context()['state'],'none');self.assertEqual(before,self.c.snapshot());self.record(args)

    def test_no_guest_or_unassigned_user_access(self):
        self.publish()
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError):api.context(self.app)
        with self.assertRaises(frappe.PermissionError):self.context(role='requester')
        self.record(role='manager');self.assertEqual(self.context()['state'],'active')

def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestPool))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
