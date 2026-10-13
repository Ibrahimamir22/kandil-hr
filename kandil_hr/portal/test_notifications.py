"""Real ORM inbox boundaries and delivered notification privacy, rollback scoped."""
import json
import unittest
import uuid
from unittest.mock import patch
import frappe
from kandil_hr.foundation import outbox
from kandil_hr.foundation.notification_access import native_permission, get_notification_logs
from kandil_hr.portal import notifications
from kandil_hr.portal.test_api import TestPortalAPI
from kandil_hr.recruitment.test_commands import acting_as


class TestNotifications(unittest.TestCase):
    def setUp(self):
        self.base=TestPortalAPI();self.addCleanup(self.base.doCleanups);self.base.setUp();self.f=self.base.f
        self.request=self.base.save()['name']

    def deliver(self,role='hr',subject='Synthetic inbox',kind='Kandil Hiring Request',name=None,body='Notification body'):
        key=outbox.enqueue(uuid.uuid4().hex,self.f.users[role],subject,body,kind,name or self.request)
        self.assertEqual(outbox.deliver(key),'Delivered locally')
        return frappe.db.get_value('Kandil Notification Outbox',key,'notification_log')

    def listing(self,role='hr',**args):
        with acting_as(self.f.users[role]):return notifications.listing(**args)

    def mark(self,name,role='hr'):
        with acting_as(self.f.users[role]):return notifications.mark_read(name)

    def test_exact_count_page_and_literal_search(self):
        names={self.deliver(subject=f'Inbox {i:02d}') for i in range(29)}
        result=self.listing(page_length=25);self.assertEqual((result['total'],result['unread'],len(result['rows'])),(29,29,25))
        more=self.listing(start=25,page_length=25);self.assertEqual(len(more['rows']),4);self.assertFalse(more['has_more'])
        self.assertEqual({r.name for r in result['rows']+more['rows']},names)
        self.assertEqual(self.listing(search='Inbox 00')['total'],1)
        for search in ("' OR 1=1 --",'%','_'):
            self.assertEqual(self.listing(search=search)['total'],0)
        self.assertEqual(self.listing(start=100)['rows'],[])

    def test_only_delivered_own_receipts_are_visible(self):
        mine=self.deliver();other=self.deliver('requester')
        outbox.enqueue(uuid.uuid4().hex,self.f.users['hr'],'Pending secret',reference_doctype='Kandil Hiring Request',reference_name=self.request)
        result=self.listing();self.assertEqual(result['total'],1);self.assertEqual(result['rows'][0].name,mine)
        self.assertNotIn(other,json.dumps(result,default=str));self.assertNotIn('Pending secret',json.dumps(result,default=str))
        with self.f.rejected(frappe.PermissionError):self.mark(other)
        self.assertEqual(frappe.db.get_value('Notification Log',other,'read'),0)

    def test_mark_is_set_only_idempotent_and_does_not_change_domain(self):
        first=self.deliver();second=self.deliver();before=self.f.counts(self.request)
        self.assertTrue(self.mark(first)['read']);self.assertTrue(self.mark(first)['read'])
        self.assertEqual((self.listing()['total'],self.listing()['unread']),(2,1))
        self.assertEqual([r.name for r in self.listing(state='unread')['rows']],[second])
        self.assertEqual([r.name for r in self.listing(state='read')['rows']],[first])
        self.assertEqual(before,self.f.counts(self.request))

    def test_revocation_hides_content_native_list_document_and_inbox(self):
        name=self.deliver(subject='Private after revoke')
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        self.assertEqual(self.listing()['total'],0);self.assertEqual(self.listing()['unread'],0)
        with acting_as(self.f.users['hr']):
            self.assertFalse(frappe.get_list('Notification Log',filters={'name':name},fields=['name','subject']))
            self.assertFalse(native_permission(frappe.get_doc('Notification Log',name)))
            with self.f.rejected(frappe.PermissionError):frappe.get_doc('Notification Log',name).check_permission('read')
            self.assertNotIn('Private after revoke',json.dumps(get_notification_logs(),default=str))
        with self.f.rejected(frappe.PermissionError):self.mark(name)
        self.assertEqual(frappe.db.get_value('Notification Log',name,'read'),0)

    def test_native_child_permission_precedes_count(self):
        one=self.deliver()
        second=self.base.save(self.base.payload()|dict(requested_position=self.f.positions[1],lines=[dict(capacity=self.f.capacities[1],requested_qty=1)]))['name']
        two=self.deliver(name=second)
        self.f.insert('User Permission',user=self.f.users['hr'],allow='Kandil Capacity',for_value=self.f.capacities[0],apply_to_all_doctypes=0,applicable_for='Kandil Hiring Request');frappe.clear_cache(user=self.f.users['hr'])
        result=self.listing();self.assertEqual(result['total'],1);self.assertEqual(result['rows'][0].name,one)
        self.assertNotIn(two,json.dumps(result,default=str))
        with self.f.rejected(frappe.PermissionError):self.mark(two)
        with acting_as(self.f.users['hr']):
            self.assertTrue(native_permission(frappe.get_doc('Notification Log',one)))
            self.assertFalse(native_permission(frappe.get_doc('Notification Log',two)))
            with self.f.rejected(frappe.PermissionError):frappe.get_doc('Notification Log',two).check_permission('read')
            self.assertEqual(frappe.get_list('Notification Log',filters={'name':['in',[one,two]]},pluck='name'),[one])

    def test_guessed_name_disabled_account_and_guest_fail(self):
        name=self.deliver()
        with self.f.rejected(frappe.PermissionError):self.mark('missing-notification')
        with acting_as('Guest'),self.f.rejected(frappe.PermissionError):notifications.listing()
        frappe.db.set_value('User',self.f.users['hr'],'enabled',0);frappe.clear_cache(user=self.f.users['hr'])
        with self.f.rejected(frappe.PermissionError):self.listing()
        with self.f.rejected(frappe.PermissionError):self.mark(name)

    def test_revoked_role_hides_native_receipt(self):
        name=self.deliver()
        frappe.db.delete('Has Role',{'parent':self.f.users['hr'],'role':'Kandil Recruiter'});frappe.clear_cache(user=self.f.users['hr'])
        with acting_as(self.f.users['hr']):
            self.assertFalse(frappe.get_list('Notification Log',filters={'name':name},pluck='name'))

    def test_receipt_reference_mismatch_is_not_an_inbox_backdoor(self):
        name=self.deliver();frappe.db.set_value('Notification Log',name,'document_name','missing')
        self.assertEqual(self.listing()['total'],0)
        with self.f.rejected(frappe.PermissionError):self.mark(name)

    def test_job_opening_receipt_requires_parent_and_has_safe_request_link(self):
        request,opening,_=self.f.vacancy_fixture();name=self.deliver(kind='Job Opening',name=opening)
        row=next(r for r in self.listing()['rows'] if r.name==name);self.assertEqual(row.request,request)
        self.mark(name)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        self.assertEqual(self.listing()['total'],0)

    def test_organization_receipt_and_sensitive_scope(self):
        name=self.deliver(kind='Kandil Position',name=self.f.positions[0])
        result=self.listing();self.assertEqual(result['total'],1);self.assertIsNone(result['rows'][0].request)
        self.mark(name)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'valid_until','2000-01-01')
        self.assertEqual(self.listing()['total'],0)

    def test_non_kandil_native_alert_unchanged_and_unknown_kandil_fails_closed(self):
        # Pending outbox rows have NULL receipts; they must not turn unrelated
        # notification membership into SQL UNKNOWN and hide native messages.
        outbox.enqueue(uuid.uuid4().hex,self.f.users['hr'],'Still pending',reference_doctype='Kandil Hiring Request',reference_name=self.request)
        for kind,reference in ((None,None),('Department',self.f.department)):
            with patch('frappe.publish_realtime'),patch('frappe.desk.doctype.notification_log.notification_log.is_email_notifications_enabled_for_type',return_value=False):
                native=frappe.get_doc(dict(doctype='Notification Log',for_user=self.f.users['hr'],type='Alert',subject='General alert',document_type=kind,document_name=reference)).insert(ignore_permissions=True)
            with acting_as(self.f.users['hr']):
                self.assertTrue(native_permission(native));self.assertIn(native.name,frappe.get_list('Notification Log',pluck='name'))
        frappe.db.set_value('Notification Log',native.name,{'document_type':'Kandil Unknown Type','document_name':'unknown'})
        with acting_as(self.f.users['hr']):
            self.assertFalse(native_permission(frappe.get_doc('Notification Log',native.name)))
        self.assertEqual(self.listing()['total'],0)

    def test_account_only_alert_has_no_reference_link(self):
        key=outbox.enqueue(uuid.uuid4().hex,self.f.users['hr'],'Account alert')
        self.assertEqual(outbox.deliver(key),'Delivered locally')
        name=frappe.db.get_value('Kandil Notification Outbox',key,'notification_log')
        result=self.listing();self.assertEqual(result['total'],1);self.assertIsNone(result['rows'][0].request)
        self.mark(name);self.assertEqual(self.listing()['unread'],0)

    def test_invalid_filters_are_rejected_and_limit_bounded(self):
        for args in ({'state':'bad'},{'search':{}},{'search':'x'*141}):
            with self.f.rejected():self.listing(**args)
        result=self.listing(start=-3,page_length=10000);self.assertEqual((result['start'],result['page_length']),(0,100))


def run():
    from kandil_hr.foundation.concurrency_runner import _guard
    from kandil_hr.foundation.tests_runner import RecordedResult
    _guard();suite=unittest.defaultTestLoader.loadTestsFromTestCase(TestNotifications)
    assert suite.countTestCases()==13
    result=unittest.TextTestRunner(verbosity=2,resultclass=RecordedResult).run(suite)
    summary=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks)
    if not result.wasSuccessful() or result.skipped:
        error=AssertionError('Notification acceptance failed');error.summary=summary;raise error
    return summary
