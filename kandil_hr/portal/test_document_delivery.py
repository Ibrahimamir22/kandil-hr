"""Scoped portal delivery metadata and recipient pagination; synthetic rollback."""
import unittest
import uuid
from unittest.mock import patch

import frappe
from kandil_hr.portal import document_delivery as api
from kandil_hr.portal.test_job_descriptions import TestJobDescriptions
from kandil_hr.organization import document_delivery as domain
from kandil_hr.recruitment.test_commands import acting_as


class TestPortalDelivery(unittest.TestCase):
    def setUp(self):
        base=TestJobDescriptions();self.addCleanup(base.doCleanups);base.setUp();self.base=base;self.f=base.f
        self.draft=base.save();self.jd=base.call('approve',role='sector',name=self.draft['name'],expected_version=self.draft['modified'],command_id=uuid.uuid4().hex)
        self.no_mail=patch('frappe.sendmail',side_effect=AssertionError('No external email allowed'));self.no_mail.start();self.addCleanup(self.no_mail.stop)

    def call(self,method,role='hr',**args):
        with acting_as(self.f.users[role]):return getattr(api,method)(name=self.jd['name'],**args)

    def capture(self):
        with acting_as(self.f.users['hr']),patch('frappe.utils.pdf.get_pdf',return_value=b'%PDF-synthetic-boundary-stub'):
            return domain.capture(self.jd['name'],[self.f.users['sector']],self.jd['modified'],uuid.uuid4().hex)

    def test_modes_and_draft_not_capturable(self):
        result=self.call('capabilities');self.assertTrue(result['can_capture']);self.assertFalse(result['provider_sent']);self.assertEqual(result['delivery_mode'],'local_capture')
        draft=self.base.save()
        with acting_as(self.f.users['hr']):
            self.assertFalse(api.capabilities(draft['name'])['can_capture'])
            with self.assertRaises(frappe.PermissionError):api.recipients(draft['name'])

    def test_recipient_pagination_matches_domain_eligibility(self):
        result=[];start=0
        while True:
            p=self.call('recipients',start=start,page_length=1);self.assertLessEqual(len(p['rows']),1);result.extend(r['user'] for r in p['rows'])
            if not p['has_more']:break
            self.assertGreater(p['next_start'],start);start=p['next_start']
        with acting_as(self.f.users['hr']):expected=domain.recipients(self.jd['name'])
        self.assertEqual(sorted(result),sorted(r['user'] for r in expected));self.assertEqual(len(result),len(set(result)))
        self.assertNotIn(self.f.users['requester'],result)

    def test_search_bounded_and_no_global_users(self):
        self.assertEqual([r['user'] for r in self.call('recipients',search=self.f.users['sector'])['rows']],[self.f.users['sector']])
        self.assertEqual(self.call('recipients',search='Administrator')['rows'],[])
        with self.assertRaises(frappe.ValidationError):self.call('recipients',search='x'*141)

    def test_capture_history_for_sender_and_recipient_only(self):
        result=self.capture();self.assertFalse(result['provider_sent'])
        for role in ('hr','sector'):
            rows=self.call('history',role=role)['rows'];self.assertEqual([r.name for r in rows],result['captures'])
            for key in ('mime_content','content_hash','included_scopes_json','recipient_email'):self.assertNotIn(key,rows[0])
        self.assertEqual(self.call('history',role='manager')['rows'],[])

    def test_requester_cannot_read_or_enumerate(self):
        for method in ('capabilities','recipients','history'):
            with self.subTest(method=method),self.assertRaises(frappe.PermissionError):self.call(method,role='requester')

    def test_revocation_hides_capture_and_download(self):
        result=self.capture()
        for name in frappe.get_all('Kandil Access Grant',filters={'user':self.f.users['sector']},pluck='name'):
            grant=frappe.get_doc('Kandil Access Grant',name);grant.revoked=1;grant.save(ignore_permissions=True)
        self.assertNotIn(self.f.users['sector'],[r['user'] for r in self.call('recipients')['rows']])
        with self.assertRaises(frappe.PermissionError):self.call('history',role='sector')
        with acting_as(self.f.users['sector']),self.assertRaises(frappe.PermissionError):domain.download(result['captures'][0])

    def test_pdf_is_a_private_attachment_with_unicode_filename(self):
        from kandil_hr.organization import documents
        with acting_as(self.f.users['hr']),patch('frappe.utils.pdf.get_pdf',return_value=b'%PDF-header-test'):
            response=documents.download_pdf(self.jd['name'],language='ar',kind='worker')
        self.assertEqual(response.mimetype,'application/pdf')
        self.assertTrue(response.headers['Content-Disposition'].startswith("attachment; filename*=UTF-8''"))
        self.assertIn('%D8',response.headers['Content-Disposition'])
        self.assertIn('no-store',response.headers['Cache-Control'])
        self.assertEqual(response.data,b'%PDF-header-test')

    def test_guest_and_disabled_users_rejected(self):
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError):api.capabilities(self.jd['name'])
        u=frappe.get_doc('User',self.f.users['hr']);u.enabled=0;u.save(ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):self.call('history')


def run():
    from kandil_hr.foundation.concurrency_runner import _guard
    from kandil_hr.foundation.tests_runner import RecordedResult
    _guard();suite=unittest.defaultTestLoader.loadTestsFromTestCase(TestPortalDelivery)
    result=unittest.TextTestRunner(verbosity=2,resultclass=RecordedResult).run(suite)
    return dict(result='PASS' if result.wasSuccessful() and not result.skipped and result.testsRun==8 else 'FAIL',total=result.testsRun,
        failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),tests=result.checks,
        limits=['Synthetic rollback; PDF stub only for access-boundary cases. Actual PDF/browser proof separate.'])
