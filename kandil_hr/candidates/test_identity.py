"""Rollback-scoped ordinary-role identity contracts; no production activation."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.client import get as client_get, get_list as client_list, set_value

from kandil_hr.candidates import identity, intake
from kandil_hr.recruitment import vacancies
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.test_ownership import TestOwnership


class TestCandidateIdentity(unittest.TestCase):
    def setUp(self):
        self.f = TestOwnership(); self.addCleanup(self.f.doCleanups); self.f.setUp()
        self.request, self.opening, self.legacy = self.f.fixture()
        flags = patch.dict(frappe.conf, {'kandil_candidate_identity_enabled': 1})
        flags.start(); self.addCleanup(flags.stop)
        self.data = dict(applicant_name='Synthetic reviewed candidate', email_id='shared@example.invalid',
                         phone_number='010 1234 5678', source_channel='Referral', source_detail='Synthetic intake')

    def create(self, role='manager', **kwargs):
        args = dict(name=self.request, opening_name=self.opening, details=self.data,
                    command_id=uuid.uuid4().hex, expected_version=str(self.f.load(self.request).modified))
        args.update(kwargs)
        with acting_as(self.f.users[role]):
            return intake.create_application(**args)

    def second_opening(self):
        opening = self.f.load(self.request).lines[1].job_opening
        self.f.call('hr', vacancies.assign_team, self.request, opening_name=opening,
                    lead=self.f.users['hr'], members=[self.f.users['manager']], reason='Synthetic shared person')
        self.f.call('hr', vacancies.set_state, self.request, opening_name=opening,
                    action='Open', reason='Synthetic second application')
        return opening

    def counts(self):
        return (frappe.db.count(identity.DT), frappe.db.count('Job Applicant'),
                frappe.db.count('Kandil Command Receipt'), frappe.db.count('Kandil Command Audit'))

    def test_shared_contacts_never_merge_and_application_ids_are_opaque(self):
        first = self.create(); second = self.create()
        self.assertNotEqual(first['person'], second['person'])
        self.assertNotEqual(first['application'], second['application'])
        self.assertTrue(first['application'].startswith('KJA-'))
        self.assertNotIn('shared', first['application'])
        app = frappe.get_doc('Job Applicant', first['application'])
        self.assertEqual(app.email_id, self.data['email_id'])
        self.assertEqual(app.custom_kandil_responsible_user, self.f.users['manager'])
        self.assertEqual(app.custom_kandil_source_channel, 'Referral')

    def test_explicit_person_can_have_distinct_applications(self):
        first = self.create(); opening = self.second_opening()
        second = self.create(opening_name=opening, person=first['person'],
            person_version=first['person_version'], identity_reason='Reviewed explicit same person')
        self.assertEqual(first['person'], second['person'])
        self.assertNotEqual(first['application'], second['application'])

    def test_receipt_replay_and_changed_payload_conflict(self):
        cid = uuid.uuid4().hex; version = str(self.f.load(self.request).modified)
        first = self.create(command_id=cid, expected_version=version); counts = self.counts()
        self.assertEqual(first, self.create(command_id=cid, expected_version=version))
        self.assertEqual(self.counts(), counts)
        with self.f.rejected():
            self.create(command_id=cid, expected_version=version, details=dict(self.data, applicant_name='Changed'))
        self.assertEqual(self.counts(), counts)

    def test_replay_rechecks_current_team_and_grant(self):
        cid = uuid.uuid4().hex; version = str(self.f.load(self.request).modified)
        first = self.create(command_id=cid, expected_version=version)
        self.f.call('hr', vacancies.assign_team, self.request, opening_name=self.opening,
                    lead=self.f.users['hr'], members=[], reason='Synthetic access revocation')
        with self.f.rejected(frappe.PermissionError):
            self.create(command_id=cid, expected_version=version)
        with acting_as(self.f.users['manager']):
            self.assertEqual(client_list(identity.DT, filters={'name': first['person']}), [])
            with self.f.rejected(frappe.PermissionError): client_get(identity.DT, first['person'])

    def test_stale_request_or_person_and_paused_opening_leave_no_rows(self):
        first = self.create(); opening = self.second_opening(); counts = self.counts()
        with self.f.rejected(frappe.TimestampMismatchError):
            self.create(opening_name=opening, person=first['person'], person_version='2000-01-01', identity_reason='Reviewed same person')
        self.assertEqual(self.counts(), counts)
        with self.f.rejected(frappe.TimestampMismatchError): self.create(expected_version='2000-01-01')
        self.assertEqual(self.counts(), counts)
        self.f.call('hr', vacancies.set_state, self.request, opening_name=self.opening,
                    action='Hold', reason='Synthetic paused vacancy')
        counts = self.counts()
        with self.f.rejected(): self.create()
        self.assertEqual(self.counts(), counts)

    def test_explicit_reapplication_is_distinct_not_contact_deduplicated(self):
        first = self.create()
        second = self.create(person=first['person'], person_version=first['person_version'], identity_reason='Reviewed repeat application')
        self.assertEqual(first['person'], second['person'])
        self.assertNotEqual(first['application'], second['application'])
        self.assertNotEqual(frappe.db.get_value('Job Applicant',first['application'],'custom_kandil_application_key'),
                            frappe.db.get_value('Job Applicant',second['application'],'custom_kandil_application_key'))

    def test_bad_intake_and_native_creation_cannot_bypass_command(self):
        for changes in ({'source_channel':''}, {'source_detail':''}, {'email_id':'', 'phone_number':'bad'}, {'email_id':'bad email'}):
            counts = self.counts()
            with self.f.rejected(): self.create(details=dict(self.data, **changes))
            self.assertEqual(self.counts(), counts)
        with acting_as(self.f.users['manager']), self.f.rejected(frappe.PermissionError):
            frappe.get_doc(dict(doctype='Job Applicant', applicant_name='Bypass',
                phone_number='01012345678', job_title=self.opening)).insert()

    def test_person_and_application_identity_immutable_even_if_feature_disabled(self):
        first = self.create()
        for enabled in (1, 0):
            with patch.dict(frappe.conf, {'kandil_candidate_identity_enabled':enabled}):
                with acting_as(self.f.users['manager']), self.f.rejected(frappe.PermissionError):
                    set_value('Job Applicant', first['application'], 'custom_kandil_person', '')
                with self.f.rejected(frappe.PermissionError):
                    person = frappe.get_doc(identity.DT, first['person']); person.save(ignore_permissions=True)
                with self.f.rejected(frappe.PermissionError):
                    frappe.delete_doc(identity.DT, first['person'], ignore_permissions=True)

    def test_duplicate_warnings_are_scoped_minimal_and_non_mutating(self):
        first = self.create(); self.create()
        counts = self.counts()
        with acting_as(self.f.users['manager']):
            result = intake.duplicate_review(self.f.company, phone_number='01012345678')
            self.assertEqual(len(result['rows']), 3)  # Includes readable legacy application.
            self.assertTrue(all(set(row)=={'application','applicant_name','person','person_name'} for row in result['rows']))
            self.assertEqual(intake.duplicate_review('Kandil PARITY TEST B', email_id='shared@example.invalid')['rows'], [])
            self.assertEqual(intake.duplicate_review(self.f.company, applicant_name="' OR 1=1 --")['rows'], [])
        self.assertEqual(self.counts(), counts)
        frappe.db.set_value('Kandil Access Grant', self.f.grants['manager'], 'revoked', 1)
        with acting_as(self.f.users['manager']):
            self.assertEqual(intake.duplicate_review(self.f.company, email_id='shared@example.invalid')['rows'], [])
        self.assertTrue(first['person'])

    def test_requester_cannot_read_person_or_intake(self):
        first = self.create()
        with acting_as(self.f.users['requester']), self.f.rejected(frappe.PermissionError):
            client_get(identity.DT, first['person'])
        with self.f.rejected(frappe.PermissionError): self.create(role='requester')

    def test_audit_failure_rolls_back_person_application_receipt(self):
        counts = self.counts()
        with patch('kandil_hr.foundation.command_audit.record_command', side_effect=RuntimeError('Synthetic audit failure')):
            with self.f.rejected(RuntimeError): self.create()
        self.assertEqual(self.counts(), counts)

    def migration_args(self):
        return dict(name=self.request, opening_name=self.opening, application=self.legacy.name,
                    application_version=str(self.legacy.modified), command_id=uuid.uuid4().hex,
                    expected_version=str(self.f.load(self.request).modified))

    def test_legacy_migration_preserves_id_contact_key_and_offer_link(self):
        old = frappe.get_doc('Job Applicant', self.legacy.name)
        with acting_as(self.f.users['hr']):
            offer = frappe.get_doc(dict(doctype='Job Offer', job_applicant=old.name, applicant_name=old.applicant_name,
                offer_date=frappe.utils.today(), designation=self.f.designation, company=self.f.company, status='Awaiting Response')).insert()
            args = self.migration_args(); result = intake.migrate_application(**args)
            counts = self.counts(); self.assertEqual(result, intake.migrate_application(**args)); self.assertEqual(counts, self.counts())
        current = frappe.get_doc('Job Applicant', old.name)
        for key in ['name','email_id','phone_number','job_title','custom_kandil_application_key']:
            self.assertEqual(current.get(key), old.get(key))
        self.assertEqual(frappe.db.get_value('Job Offer',offer.name,'job_applicant'), old.name)
        self.assertEqual(current.custom_kandil_identity_origin, 'Legacy migration')
        self.assertFalse(current.custom_kandil_source_channel)
        self.assertEqual(frappe.db.get_value(identity.DT,result['person'],'identity_state'),'Unreviewed')

    def test_legacy_migration_requires_hr_and_reviewed_version(self):
        args = self.migration_args(); counts = self.counts()
        with acting_as(self.f.users['manager']), self.f.rejected(frappe.PermissionError): intake.migrate_application(**args)
        with acting_as(self.f.users['hr']), self.f.rejected(frappe.TimestampMismatchError):
            intake.migrate_application(**dict(args, application_version='2000-01-01'))
        self.assertEqual(self.counts(), counts)

    def test_existing_identity_cannot_cross_company_even_for_administrator(self):
        first = self.create()
        # Synthetic corruption probe verifies the invariant independently of scope.
        frappe.db.set_value(identity.DT,first['person'],'company','Kandil PARITY TEST B')
        counts = self.counts()
        with self.f.rejected(frappe.PermissionError):
            intake.create_application(name=self.request, opening_name=self.opening, details=self.data,
                command_id=uuid.uuid4().hex, expected_version=str(self.f.load(self.request).modified),
                person=first['person'], person_version=first['person_version'], identity_reason='Invalid company reuse')
        self.assertEqual(counts,self.counts())

    def test_native_user_permission_restricts_identity_and_duplicate_search(self):
        first = self.create()
        # Restrict applicant IDs to the old visible application. A person link
        # must not bypass the pinned framework User Permission compiler.
        permission = frappe.get_doc(dict(doctype='User Permission', user=self.f.users['manager'],
            allow='Job Applicant', for_value=self.legacy.name, apply_to_all_doctypes=1)).insert(ignore_permissions=True)
        frappe.clear_cache(user=self.f.users['manager'])
        with acting_as(self.f.users['manager']):
            self.assertEqual(client_list(identity.DT,filters={'name':first['person']}),[])
            with self.f.rejected(frappe.PermissionError): client_get(identity.DT,first['person'])
            self.assertEqual(intake.duplicate_review(self.f.company,email_id='shared@example.invalid')['rows'],[])
        # The base fixture rolls this row back and clears cache; no background
        # deletion job is needed for a transaction-local permission fixture.

    def test_forged_source_or_person_and_unapproved_identity_state_are_denied(self):
        first=self.create()
        with acting_as(self.f.users['manager']):
            for field,value in [('custom_kandil_source_channel','Website'),('custom_kandil_source_detail','Forged'),
                                ('custom_kandil_identity_origin','Legacy migration')]:
                with self.f.rejected(frappe.PermissionError): set_value('Job Applicant',first['application'],field,value)
        with self.f.rejected(frappe.PermissionError), identity.effect():
            frappe.get_doc(dict(doctype=identity.DT,company=self.f.company,identity_state='Verified')).insert(ignore_permissions=True)

    def test_identity_audit_has_no_contact_payload_and_captures_both_effects(self):
        result = self.create()
        rows=frappe.get_all('Kandil Command Audit', filters={'operation':'candidate_intake','target_name':self.request}, fields=['*'])
        self.assertEqual(len(rows),1)
        raw=frappe.as_json(rows[0]); self.assertNotIn(self.data['email_id'],raw); self.assertNotIn(self.data['phone_number'],raw)
        self.assertIn(result['person'],raw); self.assertIn(result['application'],raw)


def run(tests=None):
    suite = (unittest.TestSuite(TestCandidateIdentity(name) for name in tests) if tests
             else unittest.defaultTestLoader.loadTestsFromTestCase(TestCandidateIdentity))
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(suite)
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),
                 skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,
                 fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary)); return summary
