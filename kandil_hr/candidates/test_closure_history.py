"""Synthetic history/projection contracts, not acceptance of a reopening command.

Only the test fixture inserts reopening rows directly. No candidate-owned
consent or authorized production transition is implied by these fixtures.
"""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.client import get as client_get
from frappe.utils import now_datetime
from kandil_hr.candidates import closure, closure_history as history, messages, activities
from kandil_hr.candidates.test_closure import TestCandidateClosure
from kandil_hr.portal import candidates
from kandil_hr.recruitment.test_commands import acting_as


class TestClosureHistory(unittest.TestCase):
    def setUp(self):
        self.f = TestCandidateClosure()
        self.addCleanup(self.f.doCleanups)
        self.f.setUp()
        self.name = self.f.name
        self.closed = self.f.call()

    def reopen_fixture(self):
        # Explicit test-only storage setup; never a whitelisted action.
        if not frappe.conf.get('allow_tests') or frappe.local.site != 'kandil-parity.localhost':
            raise RuntimeError('Synthetic parity tests only')
        task = frappe.get_doc(closure.DT, closure.existing(self.name))
        doc = frappe.get_doc(dict(doctype=history.DT, name='KCR-TEST-'+uuid.uuid4().hex,
            closure=task.name, application=self.name, company=task.company,
            actor=self.f.f.f.users['hr'], reason='Synthetic historical reopening reason',
            target_stage='Screening', closure_hash=task.content_hash,
            consent_evidence='SYNTHETIC STORAGE FIXTURE - NOT CONSENT', content_hash=activities.digest(task.name),
            owner='Administrator', modified_by='Administrator', creation=now_datetime(), modified=now_datetime()))
        doc.db_insert()
        # Existing native enum lacks Screening. Replied is a fixture projection
        # only; the future command must implement the actual canonical stage.
        frappe.db.set_value('Job Applicant', self.name, 'status', 'Replied')
        return doc

    def read(self, **kwargs):
        with acting_as(self.f.f.f.users['manager']):
            return history.history(self.name, **kwargs)

    def queue(self, status='all'):
        with acting_as(self.f.f.f.users['manager']):
            return messages.queue(status=status, search=self.name)

    def resolve(self):
        task=frappe.get_doc(closure.DT,closure.existing(self.name))
        with acting_as(self.f.f.f.users['manager']):
            return messages.resolve(self.f.f.request,self.f.f.opening,self.name,
                str(frappe.db.get_value('Job Applicant',self.name,'modified')),task.name,task.content_hash,
                'MANUAL_SENT','Email','Synthetic human-reported message','',uuid.uuid4().hex,
                str(self.f.f.f.load(self.f.f.request).modified))

    def test_current_closure_is_readable_without_raw_document_access(self):
        row=self.read()['rows'][0]
        self.assertTrue(row['current']);self.assertEqual(row['name'],self.closed['closure'])
        self.assertEqual(row['internal_note'],'Private synthetic decision reason')
        self.assertEqual(row['message_status'],'Pending');self.assertIsNone(row['reopening'])
        with acting_as(self.f.f.f.users['manager']),self.f.f.f.rejected(frappe.PermissionError):
            client_get(closure.DT,row['name'])

    def test_pending_message_cancels_without_mutating_original_or_fabricating_resolution(self):
        before=frappe.get_doc(closure.DT,self.closed['closure']).as_dict()
        count=frappe.db.count(messages.DT);self.reopen_fixture()
        row=self.read()['rows'][0]
        self.assertFalse(row['current']);self.assertEqual(row['message_status'],'CANCELLED')
        self.assertIsNone(row['resolution']);self.assertEqual(row['reopening']['target_stage'],'Screening')
        self.assertEqual(before,frappe.get_doc(closure.DT,self.closed['closure']).as_dict())
        self.assertEqual(count,frappe.db.count(messages.DT))
        self.assertEqual(self.queue()['counts'],dict(all=1,pending=0,resolved=0,cancelled=1))

    def test_resolved_message_survives_reopening_as_original_human_report(self):
        result=self.resolve();before=frappe.get_doc(messages.DT,result['resolution']).as_dict()
        self.reopen_fixture();row=self.read()['rows'][0]
        self.assertEqual(row['message_status'],'MANUAL_SENT')
        self.assertEqual(row['resolution']['message_text'],'Synthetic human-reported message')
        self.assertFalse(row['resolution']['provider_verified']);self.assertFalse(row['resolution']['sent_by_system'])
        self.assertEqual(before,frappe.get_doc(messages.DT,result['resolution']).as_dict())
        self.assertEqual(self.queue()['counts'],dict(all=1,pending=0,resolved=1,cancelled=0))

    def test_multiple_cycles_have_unique_tasks_current_decision_and_bounded_history(self):
        first=self.closed['closure'];self.reopen_fixture()
        second=self.f.call(decision='Withdrawn')['closure'];self.reopen_fixture()
        third=self.f.call()['closure']
        self.assertEqual(closure.existing(self.name),third)
        first_page=self.read(page_length=2);second_page=self.read(start=2,page_length=2)
        self.assertEqual(first_page['total'],3);self.assertTrue(first_page['has_more']);self.assertFalse(second_page['has_more'])
        rows=first_page['rows']+second_page['rows']
        self.assertEqual({r['name'] for r in rows},{first,second,third})
        self.assertEqual([r['name'] for r in rows if r['current']],[third])
        q=self.queue();self.assertEqual(q['total'],2);self.assertEqual({r['closure'] for r in q['rows']},{first,third})
        self.assertEqual(q['counts'],dict(all=2,pending=1,resolved=0,cancelled=1))
        self.assertEqual(self.queue('cancelled')['rows'][0]['outcome'],'CANCELLED')
        self.assertEqual(self.queue('pending')['rows'][0]['closure'],third)
        self.assertTrue(all('internal_note' not in r and 'reason' not in r for r in q['rows']))

    def test_old_pending_task_cannot_resolve_after_later_rejection(self):
        old=frappe.get_doc(closure.DT,self.closed['closure']);self.reopen_fixture();self.f.call()
        before=frappe.db.count(messages.DT)
        with acting_as(self.f.f.f.users['manager']),self.assertRaises(frappe.ValidationError):
            messages.resolve(self.f.f.request,self.f.f.opening,self.name,
                str(frappe.db.get_value('Job Applicant',self.name,'modified')),old.name,old.content_hash,
                'NOT_NEEDED','','','Stale task',uuid.uuid4().hex,str(self.f.f.f.load(self.f.f.request).modified))
        self.assertEqual(before,frappe.db.count(messages.DT))

    def test_withdrawal_filter_does_not_leak_previous_closed_stage_after_reopening(self):
        self.reopen_fixture();self.f.call(decision='Withdrawn');self.reopen_fixture()
        with acting_as(self.f.f.f.users['manager']):
            self.assertEqual(candidates.detail(self.name)['application']['status'],'Replied')
            self.assertEqual(candidates.listing(search=self.name,status='Withdrawn')['total'],0)
            self.assertEqual(candidates.listing(search=self.name,status='Replied')['total'],1)
        self.f.call()
        with acting_as(self.f.f.f.users['manager']):
            self.assertEqual(candidates.detail(self.name)['application']['status'],'Rejected')
            self.assertEqual(candidates.listing(search=self.name,status='Withdrawn')['total'],0)
            self.assertEqual(candidates.listing(search=self.name,status='Rejected')['total'],1)

    def test_reopening_schema_has_no_public_insert_update_delete_or_rename(self):
        doc=self.reopen_fixture();before=doc.as_dict()
        with self.f.f.f.rejected(frappe.PermissionError):frappe.copy_doc(doc).insert(ignore_permissions=True)
        with self.f.f.f.rejected(frappe.PermissionError):doc.reason='Tampered';doc.save(ignore_permissions=True)
        with self.f.f.f.rejected(frappe.PermissionError):frappe.delete_doc(history.DT,doc.name,ignore_permissions=True)
        with self.f.f.f.rejected(frappe.PermissionError):frappe.rename_doc(history.DT,doc.name,'Tampered',force=True)
        with acting_as(self.f.f.f.users['manager']),self.f.f.f.rejected(frappe.PermissionError):client_get(history.DT,doc.name)
        self.assertEqual(before,frappe.get_doc(history.DT,doc.name).as_dict())

    def test_unique_reopening_per_closure_and_no_unique_application_constraint(self):
        doc=self.reopen_fixture()
        with self.f.f.f.rejected(frappe.UniqueValidationError):
            clone=frappe.copy_doc(doc);clone.name='KCR-TEST-'+uuid.uuid4().hex;clone.docstatus=0;clone.closure=doc.closure;clone.db_insert()
        self.f.call()  # second real reviewed closure proves removed unique constraint
        self.assertIsNone(frappe.db.get_column_index('tab'+closure.DT,'application',unique=True))
        self.assertTrue(frappe.db.get_column_index('tab'+history.DT,'closure',unique=True))

    def test_native_reopening_guard_still_blocks_current_closure(self):
        self.reopen_fixture();self.f.call()
        with acting_as(self.f.f.f.users['manager']),self.f.f.f.rejected(frappe.PermissionError):
            doc=frappe.get_doc('Job Applicant',self.name);doc.status='Open';doc.save()

    def test_scoped_history_and_revocation_are_checked_on_every_page(self):
        with acting_as(self.f.f.f.users['requester']),self.f.f.f.rejected(frappe.PermissionError):history.history(self.name)
        self.read()
        for name in frappe.get_all('Kandil Access Grant',filters={'user':self.f.f.f.users['manager'],'company':self.f.company},pluck='name'):
            doc=frappe.get_doc('Kandil Access Grant',name);doc.revoked=1;doc.save(ignore_permissions=True)
        with self.f.f.f.rejected(frappe.PermissionError):self.read(start=1)

    def test_unmigrated_site_read_fallback_keeps_existing_closure(self):
        original=frappe.db.table_exists
        with patch.object(frappe.db,'table_exists',side_effect=lambda dt:False if dt==history.DT else original(dt)):
            self.assertEqual(closure.existing(self.name),self.closed['closure'])
            self.assertEqual(self.read()['rows'][0]['message_status'],'Pending')
            self.assertEqual(self.queue()['counts']['pending'],1)

    def test_duplicate_active_closure_fails_closed_in_read_and_projection(self):
        doc=frappe.get_doc(closure.DT,self.closed['closure']);clone=frappe.copy_doc(doc);clone.name='KCC-BAD-'+uuid.uuid4().hex;clone.docstatus=0;clone.db_insert()
        with self.assertRaises(frappe.ValidationError):closure.existing(self.name)
        with self.assertRaises(frappe.ValidationError):history.active_decisions([self.name])

    def test_controller_rejects_second_active_closure_even_without_database_unique(self):
        doc=frappe.copy_doc(frappe.get_doc(closure.DT,self.closed['closure']))
        with closure.effect(),self.f.f.f.rejected(frappe.ValidationError):doc.insert(ignore_permissions=True)


def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestClosureHistory))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,fixtures_rolled_back=True,scope='Storage/history projections only; no public reopening or consent acceptance',failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
