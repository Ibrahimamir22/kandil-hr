"""Synthetic rollback tests for versioned template publishing and safe preview."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.client import get as client_get
from kandil_hr.catalogs.test_catalogs import TestCatalogs
from kandil_hr.communications import templates as api
from kandil_hr.recruitment.test_commands import acting_as

class TestTemplates(unittest.TestCase):
    def setUp(self):
        self.c=TestCatalogs();self.addCleanup(self.c.doCleanups);self.c.setUp()
        self.f=self.c.fixture;self.company=self.c.company;self.app=self.c.a.name
    def listing(self,role='hr',**kwargs):
        with acting_as(self.f.users[role]):return api.listing(self.company,**kwargs)
    def args(self,key='',**changes):
        current=self.listing();old=next((x for x in current['items'] if x['key']==key),None)
        values={k:old[k] for k in api.FIELDS} if old else dict(api.STARTERS[1],active=True)
        values.update(changes)
        return dict(company=self.company,version=current['version'],key=key,values=values,reason='Synthetic HR publication review',command_id=uuid.uuid4().hex)
    def save(self,args=None,role='hr',**changes):
        args=args or self.args(**changes)
        with acting_as(self.f.users[role]):return api.save(**args)
    def preview(self,saved,role='manager',**changes):
        args=dict(name=self.app,key=saved['key'],version=saved['version']);args.update(changes)
        with acting_as(self.f.users[role]):return api.preview(**args)
    def test_starters_are_unpublished_and_reads_do_not_seed(self):
        before=frappe.db.count(api.DT);d=self.listing();self.assertEqual(d['items'],[]);self.assertEqual(len(d['starters']),6);self.assertTrue(all(not r['active'] for r in d['starters']))
        self.assertFalse(self.listing('manager')['can_edit']);self.assertEqual(self.listing('manager')['starters'],[])
        self.assertEqual(before,frappe.db.count(api.DT))
    def test_hr_publishes_with_immutable_revision_and_exact_retry(self):
        args=self.args();r=self.save(args);before=frappe.db.count(api.DT);self.assertEqual(r,self.save(args));self.assertEqual(before,frappe.db.count(api.DT))
        changed=self.args(r['key'],body='Updated greeting for {name} at {company}.');new=self.save(changed)
        self.assertNotEqual(r['version'],new['version']);self.assertEqual(api.at_version(self.company,r['version'])[0]['body'],args['values']['body'])
        self.assertEqual(frappe.get_doc(api.DT,new['version']).previous_revision,r['version'])
        with self.assertRaises(frappe.ValidationError):self.save(dict(args,reason='Forged same command'))
    def test_stale_edit_duplicate_and_code_language_change_rejected(self):
        stale=self.args(code='SECOND');r=self.save()
        with self.assertRaises(frappe.TimestampMismatchError):self.save(stale)
        with self.assertRaises(frappe.ValidationError):self.save()
        with self.assertRaises(frappe.ValidationError):self.save(self.args(r['key'],language='ar'))
    def test_company_hr_and_full_scope_required(self):
        args=self.args()
        with self.assertRaises(frappe.PermissionError):self.save(args,role='manager')
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'department',self.f.department)
        with self.assertRaises(frappe.PermissionError):self.save(args)
    def test_invalid_fields_markup_expressions_and_subject_newlines(self):
        for changes in [dict(code='ab cd'),dict(language='fr'),dict(purpose='UNKNOWN'),dict(title='x'),dict(body='short'),dict(active='true'),dict(subject='hello\nBcc: x'),dict(body='Hello {{name}}'),dict(body='Hello {salary}'),dict(body='Hello {name.__class__}'),dict(body='Hello {name!r}')]:
            with self.assertRaises(frappe.ValidationError):self.save(**changes)
        self.assertEqual(frappe.db.count(api.DT,{'company':self.company}),0)
    def test_preview_uses_scoped_values_without_writing(self):
        r=self.save(body='Hello {name}: {job} at {company}, {location}; {recruiter}')
        before=frappe.get_doc('Job Applicant',self.app).as_dict();d=self.preview(r);self.assertTrue(d['can_copy']);self.assertEqual(d['revision'],1);self.assertFalse(d['sent_by_system']);self.assertFalse(d['missing']);self.assertIn(self.company,d['body']);self.assertNotIn('{name}',d['body']);self.assertEqual(before,frappe.get_doc('Job Applicant',self.app).as_dict())
    def test_plaintext_and_substituted_braces_are_not_reinterpreted(self):
        r=self.save(body='<script>alert(1)</script> Hello {name}')
        with patch('kandil_hr.candidates.search.labels',return_value={frappe.get_doc('Job Applicant',self.app).custom_kandil_person:'Person {company}'}):
            d=self.preview(r);self.assertIn('Person {company}',d['body']);self.assertTrue(d['body'].startswith('<script>'))
    def test_missing_location_prevents_copy(self):
        r=self.save(body='Hello {name}, location {location}.');opening=frappe.get_doc('Job Applicant',self.app).job_title
        frappe.db.set_value('Job Opening',opening,'location','');d=self.preview(r);self.assertFalse(d['can_copy']);self.assertEqual(d['missing'],['location'])
    def test_deactivation_removes_option_and_denies_stale_preview(self):
        r=self.save();self.save(self.args(r['key'],active=False));self.assertEqual(self.listing('manager')['items'],[])
        with self.assertRaises(frappe.TimestampMismatchError):self.preview(r)
        with acting_as(self.f.users['manager']):self.assertEqual(api.available(self.app,'en')['rows'],[])
        with self.assertRaises(frappe.PermissionError):self.preview(dict(r,version=self.listing()['version']))
    def test_all_purposes_validate_their_own_tokens_but_future_consumers_are_not_exposed(self):
        for purpose,placeholder in [('INTERVIEW','{date} at {time} in {place} with {interviewer}'),('OFFER','{salary_table} {joining} {offer_no} {valid_until} {terms}'),('AD','{requirements} {apply_link}')]:
            r=self.save(code=purpose,purpose=purpose,body='Hello '+placeholder)
            with self.assertRaises(frappe.PermissionError):self.preview(r)
        with acting_as(self.f.users['manager']):self.assertEqual(api.available(self.app,'en')['rows'],[])
    def test_cross_application_and_company_history_access_denied(self):
        r=self.save()
        with self.assertRaises(frappe.PermissionError):self.preview(r,role='requester')
        with self.assertRaises(frappe.PermissionError):api.at_version('Other company',r['version'])
        with acting_as(self.f.users['manager']),self.assertRaises(frappe.PermissionError):api.history(self.company)
    def test_revocation_denies_old_command_replay_and_preview(self):
        args=self.args();r=self.save(args)
        for role in ('hr','manager'):
            frappe.db.set_value('Kandil Access Grant',self.f.grants[role],'revoked',1)
        with self.assertRaises(frappe.PermissionError):self.save(args)
        with self.assertRaises(frappe.PermissionError):self.preview(r)
    def test_revision_insert_failure_rolls_back(self):
        with patch.object(api.KandilMessageTemplateRevision,'after_insert',side_effect=RuntimeError('Synthetic insert error'),create=True),self.assertRaises(RuntimeError):self.save()
        self.assertEqual(frappe.db.count(api.DT,{'company':self.company}),0)
    def test_native_crud_cannot_override_template_history(self):
        r=self.save();doc=frappe.get_doc(api.DT,r['version']);before=doc.as_dict()
        with acting_as(self.f.users['hr']),self.f.rejected(frappe.PermissionError):client_get(api.DT,doc.name)
        with self.f.rejected(frappe.PermissionError):doc.reason='Forged';doc.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.copy_doc(doc).insert(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.delete_doc(api.DT,doc.name,ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.rename_doc(api.DT,doc.name,'Forged',force=True)
        self.assertEqual(before,frappe.get_doc(api.DT,doc.name).as_dict())
    def test_lists_pages_history_and_language_are_explicit(self):
        for i in range(4):self.save(code='ACK'+str(i),language='ar' if i%2 else 'en')
        d=self.listing(page_length=3);self.assertEqual(d['total'],4);self.assertTrue(d['has_more']);self.assertEqual(len(self.listing(start=3,page_length=3)['items']),1)
        self.assertEqual(self.listing(search='ACK2')['total'],1)
        with acting_as(self.f.users['hr']):self.assertEqual(len(api.history(self.company,page_length=2)['rows']),2)
        with acting_as(self.f.users['manager']):
            self.assertEqual(len(api.available(self.app,'en')['rows']),2)
            with self.assertRaises(frappe.ValidationError):api.available(self.app,'fr')


def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestTemplates))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
