"""Rollback-only consent-link revocation; accepted consent is never withdrawn here."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.client import get as client_get
from frappe.utils import add_days, now_datetime
from kandil_hr.privacy import consent as api, portal
from kandil_hr.privacy.test_consent import TestConsent
from kandil_hr.privacy.test_notices import wording
from kandil_hr.recruitment.test_commands import acting_as


class TestRevocation(unittest.TestCase):
    def setUp(self):
        self.c=TestConsent();self.addCleanup(self.c.doCleanups);self.c.setUp()
        self.f=self.c.f;self.app=self.c.app;self.company=self.c.company

    def args(self,row,**changes):
        args=dict(application=self.app,invitation=row['invitation'],reason='Synthetic link shared incorrectly',command_id=uuid.uuid4().hex)
        args.update(changes);return args

    def revoke(self,args,role='hr'):
        with acting_as(self.f.users[role]):return api.revoke(**args)

    def history(self,**changes):
        with acting_as(self.f.users['hr']),patch.object(portal,'enabled',return_value=True):
            return portal.history(self.app,**changes)

    def test_revocation_disables_public_view_acceptance_and_staff_copy_without_business_changes(self):
        row=self.c.issue();token=self.c.reveal(row);payload=self.c.payload(token)
        before=self.c.snapshot();original=frappe.get_doc(api.INVITATION,row['invitation']).as_dict()
        result=self.revoke(self.args(row))
        self.assertFalse(result['consent_withdrawn'])
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError):api.preview(token)
        with self.assertRaises(frappe.PermissionError):self.c.accept(payload)
        with self.assertRaises(frappe.PermissionError):self.c.reveal(row)
        self.assertEqual(before,self.c.snapshot());self.assertEqual(original,frappe.get_doc(api.INVITATION,row['invitation']).as_dict())
        self.assertIsNone(api.acceptance(self.company,self.c.person))
        self.assertNotIn(token,json.dumps(frappe.get_doc(api.REVOCATION,result['revocation']).as_dict(),default=str))

    def test_exact_retry_after_replacement_returns_original_and_changed_retry_fails(self):
        first=self.c.issue();args=self.args(first);result=self.revoke(args)
        second=self.c.issue(self.c.args(expected_invitation=first['invitation']))
        self.assertEqual(result,self.revoke(args));self.assertEqual(frappe.db.count(api.REVOCATION,{'company':self.company}),1)
        with self.assertRaises(frappe.ValidationError):self.revoke(dict(args,reason='Changed reason'))
        with self.assertRaises(frappe.TimestampMismatchError):self.revoke(self.args(first))
        token=self.c.reveal(second);self.assertEqual(self.c.accept(self.c.payload(token)),{'status':'accepted'})

    def test_accepted_consent_cannot_be_revoked_or_rewritten(self):
        row=self.c.issue();token=self.c.reveal(row);payload=self.c.payload(token);self.c.accept(payload)
        before=api.acceptance(self.company,self.c.person).as_dict()
        with self.assertRaises(frappe.ValidationError):self.revoke(self.args(row))
        self.assertEqual(before,api.acceptance(self.company,self.c.person).as_dict())
        self.assertEqual(self.c.accept(payload),{'status':'accepted'})
        self.assertEqual(frappe.db.count(api.REVOCATION,{'company':self.company}),0)

    def test_member_cannot_revoke_another_issuer_but_hr_can_revoke_member_link(self):
        row=self.c.issue()
        with self.assertRaises(frappe.PermissionError):self.revoke(self.args(row),role='manager')
        second=self.c.issue(self.c.args(expected_invitation=row['invitation']),role='manager')
        self.revoke(self.args(second));self.assertIsNotNone(api.revocation(second['invitation']))

    def test_original_issuer_can_revoke_own_link(self):
        row=self.c.issue(role='manager');self.revoke(self.args(row),role='manager')
        self.assertIsNotNone(api.revocation(row['invitation']))

    def test_replay_rechecks_live_grants_roles_and_disabled_accounts(self):
        row=self.c.issue();args=self.args(row);self.revoke(args)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        with self.assertRaises(frappe.PermissionError):self.revoke(args)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',0)
        frappe.db.set_value('User',self.f.users['hr'],'enabled',0)
        with self.assertRaises(frappe.PermissionError):self.revoke(args)
        frappe.db.set_value('User',self.f.users['hr'],'enabled',1)
        frappe.db.sql("DELETE FROM `tabHas Role` WHERE parent=%s AND role='Kandil Recruiter'",self.f.users['hr'])
        with self.assertRaises(frappe.PermissionError):self.revoke(args)

    def test_removed_team_member_cannot_revoke_or_replay(self):
        from kandil_hr.recruitment import vacancies
        row=self.c.issue(role='manager');args=self.args(row);self.revoke(args,role='manager')
        self.f.call('hr',vacancies.assign_team,self.c.n.c.a.f.request,opening_name=self.c.n.c.a.f.opening,
            lead=self.f.users['hr'],members=[],reason='Synthetic team removal')
        with self.assertRaises(frappe.PermissionError):self.revoke(args,role='manager')

    def test_expired_changed_notice_and_paused_vacancy_do_not_prevent_emergency_revocation(self):
        row=self.c.issue();self.c.n.save(active=False,notice_en=wording()['notice_en']+' Revised.')
        frappe.db.set_value('Job Opening',self.c.n.c.a.f.opening,'custom_kandil_vacancy_state','Paused')
        with patch.object(api,'now_datetime',return_value=add_days(now_datetime(),8)):
            self.revoke(self.args(row))
        self.assertIsNotNone(api.revocation(row['invitation']))

    def test_native_read_edit_copy_delete_rename_are_denied(self):
        result=self.revoke(self.args(self.c.issue()));doc=frappe.get_doc(api.REVOCATION,result['revocation']);before=doc.as_dict()
        with acting_as(self.f.users['hr']),self.assertRaises(frappe.PermissionError):client_get(doc.doctype,doc.name)
        with self.f.rejected(frappe.PermissionError):doc.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.copy_doc(doc).insert(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.delete_doc(doc.doctype,doc.name,ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.rename_doc(doc.doctype,doc.name,'Tampered',force=True)
        self.assertEqual(before,frappe.get_doc(doc.doctype,doc.name).as_dict())

    def test_failed_insert_rolls_back_and_link_remains_usable(self):
        row=self.c.issue();token=self.c.reveal(row);args=self.args(row)
        with patch.object(api.KandilConsentRevocation,'after_insert',side_effect=RuntimeError('Synthetic rollback'),create=True),self.assertRaises(RuntimeError):
            self.revoke(args)
        self.assertIsNone(api.revocation(row['invitation']))
        with acting_as('Guest'):self.assertEqual(api.preview(token)['status'],'pending')
        self.revoke(args);self.assertIsNotNone(api.revocation(row['invitation']))

    def test_history_is_paginated_private_and_contains_no_capability(self):
        first=self.c.issue();token=self.c.reveal(first);self.revoke(self.args(first))
        second=self.c.issue(self.c.args(expected_invitation=first['invitation']))
        p1=self.history(page_length=1);p2=self.history(start=1,page_length=1)
        self.assertTrue(p1['has_more']);self.assertFalse(p2['has_more'])
        self.assertEqual(p1['rows'][0]['state'],'pending');self.assertEqual(p2['rows'][0]['state'],'revoked')
        self.assertEqual(p2['rows'][0]['revocation']['reason'],'Synthetic link shared incorrectly')
        for secret in (token,self.f.users['hr'],first['invitation'],second['invitation']):self.assertNotIn(secret,json.dumps([p1,p2]))
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        with self.assertRaises(frappe.PermissionError):self.history()

    def test_history_and_revocation_are_bound_to_selected_application(self):
        first=self.c.issue();identity_fixture=self.c.n.c.a.f;opening=identity_fixture.second_opening()
        person=frappe.get_doc(api.identity.DT,self.c.person)
        other=identity_fixture.create(opening_name=opening,person=self.c.person,person_version=str(person.modified),identity_reason='Synthetic same person')
        second=self.c.issue(self.c.args(application=other['application'],expected_invitation=first['invitation']))
        with self.assertRaises(frappe.PermissionError):self.revoke(self.args(second))
        rows=self.history()['rows'];self.assertEqual(len(rows),1);self.assertEqual(rows[0]['state'],'replaced')
        with acting_as(self.f.users['hr']),patch.object(portal,'enabled',return_value=True):
            context=portal.context(self.app)
        self.assertFalse(context['can_revoke']);self.assertFalse(context['can_reveal'])

    def test_second_revocation_is_not_another_audit_event(self):
        row=self.c.issue();self.revoke(self.args(row))
        with self.assertRaises(frappe.ValidationError):self.revoke(self.args(row))
        self.assertEqual(frappe.db.count(api.REVOCATION,{'company':self.company}),1)
        self.assertNotIn(api.revoke,frappe.whitelisted)


def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestRevocation))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,fixtures_rolled_back=True,scope='Revocation service and history; HTTP concurrency and browser acceptance separate',failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
