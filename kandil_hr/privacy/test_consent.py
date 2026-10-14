"""Rollback-only synthetic consent service tests; no public endpoint or real links."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.client import get as client_get
from frappe.utils import add_days, now_datetime

from kandil_hr.privacy import consent as api, notices
from kandil_hr.privacy.test_notices import TestNotices, wording
from kandil_hr.recruitment.test_commands import acting_as


class TestConsent(unittest.TestCase):
    def setUp(self):
        self.n = TestNotices(); self.addCleanup(self.n.doCleanups); self.n.setUp()
        self.f = self.n.f; self.company = self.n.company; self.app = self.n.application
        self.notice = self.n.save()
        self.person = frappe.db.get_value('Job Applicant', self.app, 'custom_kandil_person')

    def args(self, **changes):
        args = dict(application=self.app, expected_invitation='', notice_revision=self.notice['version'],
                    reason='Synthetic consent invitation, no external delivery', command_id=uuid.uuid4().hex)
        args.update(changes); return args

    def issue(self, args=None, role='hr'):
        with acting_as(self.f.users[role]): return api.issue(**(args or self.args()))

    def reveal(self, row, role='hr'):
        with acting_as(self.f.users[role]): return api.reveal(self.app, row['invitation'])

    def payload(self, token, **changes):
        with acting_as('Guest'): view = api.preview(token)
        args = dict(token=token, notice_revision=view['notice_revision'], notice_hash=view['notice_hash'],
                    accepted=True, transfer_accepted=view['notice']['transfer_required'])
        args.update(changes); return args

    def accept(self, args):
        with acting_as('Guest'): return api.accept(**args)

    def snapshot(self):
        return self.n.snapshot(), frappe.get_doc('Kandil Hiring Request',self.n.c.a.f.request).as_dict()

    def test_issue_and_reveal_never_records_consent_or_changes_application(self):
        before = self.snapshot(); row = self.issue(); token = self.reveal(row)
        self.assertFalse(row['candidate_consent_recorded']); self.assertNotIn(token,json.dumps(row))
        self.assertEqual(len(token),64); self.assertEqual(frappe.db.count(api.ACCEPTANCE,{'company':self.company}),0)
        self.assertEqual(before,self.snapshot())
        doc=frappe.get_doc(api.INVITATION,row['invitation'])
        self.assertEqual(doc.token_hash,api.token_hash(token)); self.assertNotIn(token,json.dumps(doc.as_dict(),default=str))

    def test_candidate_acceptance_binds_exact_wording_and_separate_transfer(self):
        before=self.snapshot(); row=self.issue(); token=self.reveal(row); args=self.payload(token)
        self.assertEqual(self.accept(args),{'status':'accepted'})
        recorded=api.acceptance(self.company,self.person)
        self.assertEqual(recorded.notice_revision,self.notice['version']); self.assertEqual(recorded.notice_hash,args['notice_hash'])
        self.assertEqual(recorded.owner,'Guest'); self.assertEqual(recorded.evidence_kind,'Bearer link')
        self.assertEqual(recorded.transfer_accepted,1); self.assertEqual(recorded.application,self.app)
        self.assertEqual(before,self.snapshot())
        with acting_as('Guest'): self.assertEqual(api.preview(token),{'status':'accepted'})

    def test_public_projection_is_minimal_and_plain_text(self):
        self.notice=self.n.save(notice_en=wording()['notice_en']+' <script>literal test text</script>')
        token=self.reveal(self.issue())
        with acting_as('Guest'): value=api.preview(token)
        self.assertEqual(set(value),{'status','first_name','job_title','notice_revision','notice_hash','notice','expires_at'})
        self.assertEqual(value['notice'],notices.published(self.company)['notice'])
        self.assertNotIn(self.app,json.dumps(value)); self.assertNotIn(self.person,json.dumps(value))

    def test_exact_issue_retry_returns_original_without_raw_token_even_after_replacement(self):
        args=self.args(); first=self.issue(args); second=self.issue(self.args(expected_invitation=first['invitation']))
        self.assertEqual(first,self.issue(args)); self.assertNotEqual(first['invitation'],second['invitation'])
        self.assertEqual(frappe.db.count(api.INVITATION,{'company':self.company}),2)
        with self.assertRaises(frappe.ValidationError): self.issue(dict(args,reason='Different retry'))

    def test_replacement_invalidates_old_link_and_stale_issuer_cannot_replace(self):
        first=self.issue(); old=self.reveal(first); second=self.issue(self.args(expected_invitation=first['invitation']))
        token=self.reveal(second)
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError): api.preview(old)
        with self.assertRaises(frappe.PermissionError): self.reveal(first)
        with self.assertRaises(frappe.TimestampMismatchError): self.issue()
        self.assertEqual(self.accept(self.payload(token)),{'status':'accepted'})

    def test_expiry_at_boundary_denies_unaccepted_link(self):
        row=self.issue(); token=self.reveal(row); args=self.payload(token)
        when=frappe.get_doc(api.INVITATION,row['invitation']).expires_at
        with patch.object(api,'now_datetime',return_value=when):
            with acting_as('Guest'),self.assertRaises(frappe.PermissionError): api.preview(token)
            with self.assertRaises(frappe.PermissionError): self.accept(args)
        self.assertEqual(frappe.db.count(api.ACCEPTANCE,{'company':self.company}),0)

    def test_exact_acceptance_retry_survives_expiry_and_new_notice_without_rewriting_evidence(self):
        row=self.issue(); token=self.reveal(row); args=self.payload(token); self.accept(args)
        before=api.acceptance(self.company,self.person).as_dict()
        self.n.save(notice_en=wording()['notice_en']+' Updated test wording.')
        with patch.object(api,'now_datetime',return_value=add_days(now_datetime(),8)):
            self.assertEqual(self.accept(args),{'status':'accepted'})
        self.assertEqual(before,api.acceptance(self.company,self.person).as_dict())
        self.assertEqual(frappe.db.count(api.ACCEPTANCE,{'company':self.company}),1)
        with self.assertRaises(frappe.PermissionError): self.accept(dict(args,transfer_accepted=False))
        with self.assertRaises(frappe.ValidationError): self.issue(self.args(expected_invitation=row['invitation']))
        with self.assertRaises(frappe.PermissionError): self.reveal(row)

    def test_changed_or_unpublished_notice_invalidates_pending_link(self):
        row=self.issue(); token=self.reveal(row); args=self.payload(token)
        self.notice=self.n.save(notice_en=wording()['notice_en']+' Revised.')
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError): api.preview(token)
        with self.assertRaises(frappe.PermissionError): self.accept(args)
        replacement=self.issue(self.args(expected_invitation=row['invitation'])); token2=self.reveal(replacement)
        self.n.save(active=False,notice_en=wording()['notice_en']+' Revised.')
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError): api.preview(token2)

    def test_issue_requires_current_published_revision(self):
        with self.assertRaises(frappe.TimestampMismatchError): self.issue(self.args(notice_revision='unreviewed'))
        self.notice=self.n.save(active=False)
        with self.assertRaises(frappe.TimestampMismatchError): self.issue()
        self.assertEqual(frappe.db.count(api.INVITATION,{'company':self.company}),0)

    def test_explicit_acceptance_and_exact_version_hash_are_required(self):
        row=self.issue(); token=self.reveal(row); args=self.payload(token)
        for change in [dict(accepted=False),dict(accepted=1),dict(accepted='true'),dict(transfer_accepted=1),dict(transfer_accepted=False),dict(notice_revision='wrong'),dict(notice_hash='0'*64)]:
            with self.assertRaises(frappe.PermissionError): self.accept(dict(args,**change))
        self.assertEqual(frappe.db.count(api.ACCEPTANCE,{'company':self.company}),0)

    def test_no_transfer_acceptance_is_inferred_when_not_required(self):
        self.notice=self.n.save(transfer_required=False,transfer_ar='',transfer_en='')
        token=self.reveal(self.issue()); args=self.payload(token)
        with self.assertRaises(frappe.PermissionError): self.accept(dict(args,transfer_accepted=True))
        self.accept(args); self.assertEqual(api.acceptance(self.company,self.person).transfer_accepted,0)

    def test_staff_and_imports_cannot_accept_on_behalf(self):
        token=self.reveal(self.issue()); args=self.payload(token)
        for role in ('hr','manager','requester'):
            with acting_as(self.f.users[role]),self.assertRaises(frappe.PermissionError): api.accept(**args)
        with acting_as('Administrator'),self.assertRaises(frappe.PermissionError): api.accept(**args)
        self.assertEqual(frappe.db.count(api.ACCEPTANCE,{'company':self.company}),0)

    def test_disabled_or_revoked_issuer_cannot_replay_or_reveal(self):
        args=self.args(); row=self.issue(args)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        with self.assertRaises(frappe.PermissionError): self.issue(args)
        with self.assertRaises(frappe.PermissionError): self.reveal(row)

    def test_only_original_current_issuer_can_reveal(self):
        row=self.issue()
        with self.assertRaises(frappe.PermissionError): self.reveal(row,'manager')
        with self.assertRaises(frappe.PermissionError): self.issue(role='requester')
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError): api.issue(**self.args())

    def test_native_crud_is_denied_for_invitations_and_acceptance(self):
        row=self.issue(); token=self.reveal(row); self.accept(self.payload(token))
        docs=[frappe.get_doc(api.INVITATION,row['invitation']),api.acceptance(self.company,self.person)]
        for doc in docs:
            before=doc.as_dict()
            with acting_as(self.f.users['hr']),self.assertRaises(frappe.PermissionError): client_get(doc.doctype,doc.name)
            with self.f.rejected(frappe.PermissionError): doc.save(ignore_permissions=True)
            with self.f.rejected(frappe.PermissionError): frappe.copy_doc(doc).insert(ignore_permissions=True)
            with self.f.rejected(frappe.PermissionError): frappe.delete_doc(doc.doctype,doc.name,ignore_permissions=True)
            with self.f.rejected(frappe.PermissionError): frappe.rename_doc(doc.doctype,doc.name,'Tampered',force=True)
            self.assertEqual(before,frappe.get_doc(doc.doctype,doc.name).as_dict())

    def test_failed_issue_and_accept_insert_roll_back_without_fake_evidence(self):
        with patch.object(api.KandilConsentInvitation,'after_insert',side_effect=RuntimeError('Synthetic insert failure'),create=True),self.assertRaises(RuntimeError): self.issue()
        self.assertEqual(frappe.db.count(api.INVITATION,{'company':self.company}),0)
        row=self.issue(); token=self.reveal(row); args=self.payload(token)
        with patch.object(api.KandilConsentAcceptance,'after_insert',side_effect=RuntimeError('Synthetic acceptance failure'),create=True),self.assertRaises(RuntimeError): self.accept(args)
        self.assertEqual(frappe.db.count(api.ACCEPTANCE,{'company':self.company}),0)
        self.assertEqual(self.accept(args),{'status':'accepted'})

    def test_unknown_malformed_replaced_expired_tokens_share_generic_denial(self):
        row=self.issue(); valid=self.reveal(row)
        messages=[]
        for token in (None,{},'short','A'*64,'0'*64):
            with acting_as('Guest'):
                try: api.preview(token)
                except frappe.PermissionError as e: messages.append(str(e))
                else: self.fail('Invalid token accepted')
        self.issue(self.args(expected_invitation=row['invitation']))
        with acting_as('Guest'):
            try: api.preview(valid)
            except frappe.PermissionError as e: messages.append(str(e))
        self.assertEqual(len(set(messages)),1)

    def test_site_key_rotation_requires_new_pending_link(self):
        row=self.issue(); token=self.reveal(row)
        with patch.object(api,'get_encryption_key',return_value='synthetic replacement key'):
            with self.assertRaises(frappe.PermissionError): self.reveal(row)
            replacement=self.issue(self.args(expected_invitation=row['invitation']))
            self.assertNotEqual(self.reveal(replacement),token)
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError): api.preview(token)

    def test_feature_disabled_and_closed_vacancy_fail_closed(self):
        row=self.issue(); token=self.reveal(row)
        with patch.object(api.identity,'enabled',return_value=False):
            with acting_as('Guest'),self.assertRaises(frappe.PermissionError): api.preview(token)
        opening=frappe.db.get_value('Job Applicant',self.app,'job_title')
        frappe.db.set_value('Job Opening',opening,'custom_kandil_vacancy_state','Closed')
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError): api.preview(token)
        with self.assertRaises(frappe.PermissionError): self.issue(self.args(expected_invitation=row['invitation']))

    def test_current_disabled_account_and_removed_role_deny_cached_replay(self):
        args=self.args(); row=self.issue(args)
        frappe.db.set_value('User',self.f.users['hr'],'enabled',0)
        with self.assertRaises(frappe.PermissionError): self.issue(args)
        with self.assertRaises(frappe.PermissionError): self.reveal(row)
        frappe.db.set_value('User',self.f.users['hr'],'enabled',1)
        frappe.db.sql("DELETE FROM `tabHas Role` WHERE parent=%s AND role='Kandil Recruiter'",self.f.users['hr'])
        with self.assertRaises(frappe.PermissionError): self.issue(args)
        with self.assertRaises(frappe.PermissionError): self.reveal(row)

    def test_member_can_issue_but_loses_replay_and_reveal_after_team_removal(self):
        from kandil_hr.recruitment import vacancies
        args=self.args(); row=self.issue(args,role='manager')
        token=self.reveal(row,role='manager'); self.assertEqual(len(token),64)
        self.f.call('hr',vacancies.assign_team,self.n.c.a.f.request,opening_name=self.n.c.a.f.opening,
                    lead=self.f.users['hr'],members=[],reason='Synthetic team removal')
        with self.assertRaises(frappe.PermissionError): self.issue(args,role='manager')
        with self.assertRaises(frappe.PermissionError): self.reveal(row,role='manager')

    def test_contact_match_does_not_share_consent_with_another_person(self):
        token=self.reveal(self.issue()); self.accept(self.payload(token))
        other=self.n.c.a.f.create()
        self.assertNotEqual(other['person'],self.person)
        row=self.issue(self.args(application=other['application']))
        self.assertFalse(row['candidate_consent_recorded'])
        self.assertIsNone(api.acceptance(self.company,other['person']))

    def test_one_person_multiple_applications_share_apply_purpose_but_never_reveal_other_application(self):
        first=self.issue(); old=self.reveal(first)
        identity_fixture=self.n.c.a.f
        opening=identity_fixture.second_opening()
        person=frappe.get_doc(api.identity.DT,self.person)
        other=identity_fixture.create(opening_name=opening,person=self.person,
                    person_version=str(person.modified),identity_reason='Synthetic explicit same-person review')
        with self.assertRaises(frappe.TimestampMismatchError): self.issue(self.args(application=other['application']))
        second=self.issue(self.args(application=other['application'],expected_invitation=first['invitation']))
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError): api.preview(old)
        with self.assertRaises(frappe.PermissionError): self.reveal(second)
        with acting_as(self.f.users['hr']): token=api.reveal(other['application'],second['invitation'])
        self.accept(self.payload(token))
        self.assertEqual(api.acceptance(self.company,self.person).application,other['application'])
        with self.assertRaises(frappe.ValidationError): self.issue(self.args(expected_invitation=second['invitation']))

    def test_invitation_cannot_follow_a_changed_person_binding(self):
        row=self.issue(); token=self.reveal(row); args=self.payload(token)
        other=self.n.c.a.f.create()
        frappe.db.set_value('Job Applicant',self.app,'custom_kandil_person',other['person'])
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError): api.preview(token)
        with self.assertRaises(frappe.PermissionError): self.accept(args)
        with self.assertRaises(frappe.PermissionError): self.reveal(row)
        self.assertEqual(frappe.db.count(api.ACCEPTANCE,{'company':self.company}),0)

    def test_core_methods_are_not_publicly_whitelisted(self):
        for fn in (api.issue,api.reveal,api.accept,api.preview):
            self.assertNotIn(fn,frappe.whitelisted)


def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestConsent))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,fixtures_rolled_back=True,scope='Internal consent service, not public HTTP or UI acceptance',failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
