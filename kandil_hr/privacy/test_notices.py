"""Synthetic company publication; no legal approval or candidate consent claim."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.client import get as client_get
from kandil_hr.catalogs.test_catalogs import TestCatalogs
from kandil_hr.privacy import notices as api
from kandil_hr.recruitment.test_commands import acting_as


def wording(**changes):
    values=dict(employer_ar='جهة عمل اصطناعية للاختبار فقط',employer_en='Synthetic employer for tests only',
        contact_email='privacy@example.invalid',notice_ar='إشعار اصطناعي للاختبار فقط؛ ليس صياغة قانونية أو طلب موافقة حقيقي.',
        notice_en='Synthetic test notice only; this is not legal wording or a real consent request.',
        transfer_required=True,transfer_ar='صياغة نقل اصطناعية للاختبار فقط ولا تعني وجود نقل حقيقي للبيانات.',
        transfer_en='Synthetic transfer wording for tests only, not a claim about actual data transfers.',active=True)
    values.update(changes)
    return values


class TestNotices(unittest.TestCase):
    def setUp(self):
        self.c=TestCatalogs();self.addCleanup(self.c.doCleanups);self.c.setUp()
        self.f=self.c.fixture;self.company=self.c.company;self.application=self.c.a.name
    def listing(self,role='hr'):
        with acting_as(self.f.users[role]):return api.listing(self.company)
    def args(self,**changes):
        return dict(company=self.company,version=self.listing()['version'],values=wording(**changes),reason='Synthetic privacy-owner review',command_id=uuid.uuid4().hex)
    def save(self,args=None,role='hr',**changes):
        args=args or self.args(**changes)
        with acting_as(self.f.users[role]):return api.save(**args)
    def snapshot(self):
        app=frappe.get_doc('Job Applicant',self.application)
        return app.as_dict(),frappe.get_doc('Kandil Candidate Person',app.custom_kandil_person).as_dict()
    def test_no_seeded_notice_or_inferred_consent(self):
        before=self.snapshot();count=frappe.db.count(api.DT)
        for role in ('hr','manager'):
            d=self.listing(role);self.assertIsNone(d['notice']);self.assertEqual(d['sequence'],0)
        self.assertIsNone(api.published(self.company));self.assertEqual(before,self.snapshot());self.assertEqual(count,frappe.db.count(api.DT))
    def test_bilingual_publication_is_exact_immutable_snapshot_not_candidate_acceptance(self):
        before=self.snapshot();args=self.args();r=self.save(args)
        self.assertFalse(r['candidate_consent_recorded']);d=self.listing('manager');self.assertEqual(d['notice'],args['values'])
        self.assertEqual(d['sequence'],1);self.assertEqual(d['content_hash'],api.catalogs.digest(args['values']))
        self.assertEqual(before,self.snapshot());self.assertEqual(api.published(self.company)['version'],r['version'])
    def test_draft_is_visible_to_hr_only_and_unpublish_keeps_history(self):
        first=self.save();second=self.save(active=False)
        self.assertFalse(self.listing()['notice']['active']);self.assertIsNone(self.listing('manager')['notice']);self.assertIsNone(api.published(self.company))
        with acting_as(self.f.users['hr']):
            old=api.revision(self.company,first['version']);self.assertTrue(old['notice']['active']);self.assertEqual(old['sequence'],1)
            self.assertEqual([r['sequence'] for r in api.history(self.company)['rows']],[2,1])
        self.assertEqual(frappe.get_doc(api.DT,second['version']).previous_revision,first['version'])
    def test_exact_retry_returns_original_revision_even_after_later_edit(self):
        args=self.args();first=self.save(args);self.save(notice_ar=wording()['notice_ar']+' نسخة معدلة.')
        before=frappe.db.count(api.DT);self.assertEqual(first,self.save(args));self.assertEqual(before,frappe.db.count(api.DT))
        with self.assertRaises(frappe.ValidationError):self.save(dict(args,reason='Changed retry'))
    def test_stale_revision_and_no_changes_are_rejected(self):
        stale=self.args();self.save()
        with self.assertRaises(frappe.TimestampMismatchError):self.save(dict(stale,command_id=uuid.uuid4().hex))
        with self.assertRaises(frappe.ValidationError):self.save()
        self.assertEqual(frappe.db.count(api.DT,{'company':self.company}),1)
    def test_only_current_full_company_hr_can_publish(self):
        args=self.args()
        with self.assertRaises(frappe.PermissionError):self.save(args,role='manager')
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'department',self.f.department)
        with self.assertRaises(frappe.PermissionError):self.save(args)
    def test_revoked_authority_cannot_retry_or_read_historical_wording(self):
        args=self.args();r=self.save(args)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        with self.assertRaises(frappe.PermissionError):self.save(args)
        with acting_as(self.f.users['hr']),self.assertRaises(frappe.PermissionError):api.revision(self.company,r['version'])
    def test_recruiter_cannot_read_draft_history_or_native_document(self):
        r=self.save(active=False)
        with acting_as(self.f.users['manager']):
            with self.assertRaises(frappe.PermissionError):api.history(self.company)
            with self.assertRaises(frappe.PermissionError):api.revision(self.company,r['version'])
            with self.assertRaises(frappe.PermissionError):client_get(api.DT,r['version'])
    def test_requester_guest_and_cross_company_are_denied(self):
        self.save()
        with acting_as(self.f.users['requester']),self.assertRaises(frappe.PermissionError):api.listing(self.company)
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError):api.listing(self.company)
        with acting_as(self.f.users['hr']),self.assertRaises(frappe.PermissionError):api.listing('Unrelated company')
    def test_validation_requires_two_languages_one_email_and_explicit_booleans(self):
        for changes in [dict(notice_ar=''),dict(notice_en='short'),dict(employer_ar='a'),dict(employer_en='Line\nOther'),dict(contact_email='invalid'),dict(contact_email='a@example.invalid, b@example.invalid'),dict(contact_email='Name <a@example.invalid>'),dict(contact_email='a@example.invalid\nb@example.invalid'),dict(active=1),dict(transfer_required='true'),dict(transfer_ar='short'),dict(transfer_en=''),dict(notice_en='a'*12001)]:
            with self.assertRaises(frappe.ValidationError):self.save(**changes)
        self.assertEqual(frappe.db.count(api.DT,{'company':self.company}),0)
    def test_extra_consent_or_unknown_fields_are_never_accepted(self):
        for extra in ('candidate_accepted','accept_on_behalf','company','unknown'):
            args=self.args();args['values'][extra]=True
            with self.assertRaises(frappe.ValidationError):self.save(args)
        with self.assertRaises(frappe.ValidationError):api.normalize('x'*40001)
    def test_transfer_wording_is_required_together_or_explicitly_absent(self):
        with self.assertRaises(frappe.ValidationError):self.save(transfer_required=False)
        r=self.save(transfer_required=False,transfer_ar='',transfer_en='')
        self.assertFalse(api.published(self.company)['notice']['transfer_required'])
        with acting_as(self.f.users['hr']):self.assertFalse(api.revision(self.company,r['version'])['notice']['transfer_en'])
    def test_markup_is_preserved_as_plain_text_without_execution_or_interpolation(self):
        text='<script>window.syntheticBad=1</script> {name} is literal test wording'
        self.save(notice_en=text);self.assertEqual(self.listing('manager')['notice']['notice_en'],text)
    def test_history_is_bounded_and_exact_previous_text_survives(self):
        first=self.save()
        for i in range(6):self.save(notice_en=wording()['notice_en']+' Revision '+str(i))
        with acting_as(self.f.users['hr']):
            a=api.history(self.company,page_length=5);b=api.history(self.company,start=5,page_length=5)
            self.assertTrue(a['has_more']);self.assertFalse(b['has_more']);self.assertEqual(len(a['rows'])+len(b['rows']),7)
            self.assertEqual(api.revision(self.company,first['version'])['notice'],wording())
    def test_native_edit_copy_delete_rename_are_denied(self):
        r=self.save();doc=frappe.get_doc(api.DT,r['version']);before=doc.as_dict()
        with self.f.rejected(frappe.PermissionError):doc.reason='Tampered';doc.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.copy_doc(doc).insert(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.delete_doc(api.DT,doc.name,ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.rename_doc(api.DT,doc.name,'Tampered',force=True)
        self.assertEqual(before,frappe.get_doc(api.DT,doc.name).as_dict())
    def test_failed_insert_rolls_back_without_outer_savepoint(self):
        before=self.snapshot()
        with patch.object(api.KandilPrivacyNoticeRevision,'after_insert',side_effect=RuntimeError('Synthetic failure'),create=True),self.assertRaises(RuntimeError):self.save()
        self.assertEqual(frappe.db.count(api.DT,{'company':self.company}),0);self.assertEqual(before,self.snapshot())


def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestNotices))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,fixtures_rolled_back=True,scope='Notice publishing only, not candidate-owned consent or legal approval',failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
