"""Isolated agency catalogue and real intake ownership checks."""
import json,sys,unittest,uuid
from datetime import timedelta
from unittest.mock import patch
import frappe
from frappe.client import get as client_get
from kandil_hr.sourcing import agencies as api,sources
from kandil_hr.sourcing.test_sources import TestSources
from kandil_hr.candidates import intake,recovery
from kandil_hr.recruitment.test_commands import acting_as

class TestAgencies(unittest.TestCase):
    def setUp(self):
        self.s=TestSources();self.addCleanup(self.s.doCleanups);self.s.setUp();self.f=self.s.f;self.company=self.s.company
    def values(self,**changes):
        d=dict(label_ar='مكتب اصطناعي',label_en='Synthetic agency',contact_name='Private contact',phone='01012345678',email='agency@example.invalid',fee_type='FIXED',fee_value='1000',currency='EGP',guarantee_days=30,replacement_terms='Replacement subject to recorded agreement',ownership_days=90,contract_url='https://example.invalid/contract',notes='Private HR contract notes',active=True);d.update(changes);return d
    def args(self,code='SYNTHETIC',is_new=True,**changes):return dict(company=self.company,version=api.state(self.company)['version'],code=code,values=self.values(**changes),reason='Reviewed synthetic agency terms',command_id=uuid.uuid4().hex,is_new=is_new)
    def save(self,args=None):
        with acting_as(self.f.users['hr']):return api.save(**(args or self.args()))
    def create_args(self,code='SYNTHETIC',**changes):
        args=self.s.intake_args('AGENCY');args['agency']=dict(code=code,version=api.state(self.company)['version']);args.update(changes);return args
    def create(self,args=None):
        with acting_as(self.f.users['manager']):return intake.create_application(**(args or self.create_args()))
    def test_empty_catalogue_no_invented_agencies(self):
        with acting_as(self.f.users['manager']):self.assertEqual(api.options(self.company)['items'],[])
        with self.assertRaises(frappe.ValidationError):self.create()
    def test_bilingual_terms_exact_retry_conflict_stale_and_duplicate(self):
        a=self.args();r=self.save(a);self.assertEqual(r,self.save(a))
        with self.assertRaises(frappe.ValidationError):self.save(dict(a,reason='Different reason'))
        with self.assertRaises(frappe.TimestampMismatchError):self.save(dict(a,command_id=uuid.uuid4().hex))
        with self.assertRaises(frappe.ValidationError):self.save(self.args(code='DUPLICATE'))
    def test_financial_days_url_and_field_validation(self):
        for kwargs in [dict(fee_type='UNKNOWN'),dict(fee_value='-1'),dict(fee_value='nan'),dict(fee_value='1.001'),dict(fee_type='PERCENT_ANNUAL',fee_value='101'),dict(fee_type='NONE',fee_value='1'),dict(ownership_days=-1),dict(guarantee_days=True),dict(active='true'),dict(currency=''),dict(contract_url='javascript:alert(1)'),dict(contract_url='https://user:pass@example.invalid'),dict(email='bad')]:
            with self.assertRaises(frappe.ValidationError):self.save(self.args(**kwargs))
    def test_role_and_company_scope_and_private_contacts(self):
        self.save()
        with acting_as(self.f.users['manager']):
            x=api.listing(self.company);self.assertFalse(x['can_edit']);self.assertFalse(api.PRIVATE & set(x['items'][0]))
            with self.assertRaises(frappe.PermissionError):api.save(**self.args())
            with self.assertRaises(frappe.PermissionError):api.history(self.company)
            with self.assertRaises(frappe.PermissionError):api.listing('Outside company')
    def test_agency_required_only_on_agency_source(self):
        self.save()
        with self.assertRaises(frappe.PermissionError):self.s.create(self.s.intake_args('AGENCY'))
        a=self.create_args();a['details']['source_channel']='EMAIL'
        with self.assertRaises(frappe.ValidationError):self.create(a)
        a=self.create_args();a['agency']['code']='UNKNOWN'
        with self.assertRaises(frappe.ValidationError):self.create(a)
    def test_intake_snapshots_terms_and_original_source(self):
        self.save();r=self.create();doc=frappe.get_doc(api.SUBMISSION,{'application':r['application']});self.assertEqual(doc.person,r['person']);self.assertEqual(doc.agency_code,'SYNTHETIC');self.assertEqual(json.loads(doc.terms_json)['fee_value'],'1000.00');self.assertEqual((doc.ownership_until-doc.ownership_from).days,90)
        with acting_as(self.f.users['manager']):view=api.application(r['application'])
        self.assertTrue(view['submission']['active']);self.assertFalse(api.PRIVATE & set(view['submission']['terms']));self.assertEqual(frappe.db.get_value(sources.ATTRIBUTION,{'application':r['application']},'source_code'),'AGENCY')
    def test_rename_terms_deactivation_preserve_history_and_prior_receipt(self):
        self.save();a=self.create_args();r=self.create(a);old=frappe.get_doc(api.SUBMISSION,{'application':r['application']}).as_dict();self.save(self.args(is_new=False,label_en='Changed agency',fee_value='5000',active=False));self.assertEqual(r,self.create(a));self.assertEqual(old,frappe.get_doc(api.SUBMISSION,old['name']).as_dict())
        with self.assertRaises(frappe.ValidationError):self.create()
    def test_stale_terms_cannot_submit(self):
        self.save();args=self.create_args();self.save(self.args(is_new=False,fee_value='2000'))
        with self.assertRaises(frappe.TimestampMismatchError):self.create(args)
    def test_other_agency_denied_same_agency_allowed_for_reviewed_same_person(self):
        self.save();self.save(self.args(code='SECOND',label_ar='المكتب الثاني',label_en='Second agency'));first=self.create();opening=self.s.i.second_opening();person=frappe.get_doc('Kandil Candidate Person',first['person']);a=self.create_args('SECOND',opening_name=opening,person=person.name,person_version=str(person.modified),identity_reason='Explicit same person')
        with self.assertRaises(frappe.PermissionError):self.create(a)
        a['agency']['code']='SYNTHETIC';r=self.create(a);self.assertEqual(first['person'],r['person']);self.assertNotEqual(first['application'],r['application'])
    def test_ownership_end_day_is_inclusive_then_other_agency_allowed(self):
        self.save(self.args(ownership_days=0));self.save(self.args(code='SECOND',label_ar='المكتب الثاني',label_en='Second agency'));r=self.create();opening=self.s.i.second_opening();a=self.create_args('SECOND',opening_name=opening,person=r['person'],person_version=r['person_version'],identity_reason='Reviewed known candidate')
        with self.assertRaises(frappe.PermissionError):self.create(a)
        tomorrow=api.now_cairo()+timedelta(days=1)
        with patch.object(api,'now_cairo',return_value=tomorrow):self.assertTrue(self.create(a)['application'])
    def test_nonagency_intake_surfaces_review_notice_without_other_application_data(self):
        self.save();r=self.create();opening=self.s.i.second_opening();a=self.s.intake_args('EMAIL');a.update(opening_name=opening,person=r['person'],person_version=r['person_version'],identity_reason='Reviewed known person');new=self.s.create(a)
        with acting_as(self.f.users['manager']):v=api.application(new['application'])
        self.assertTrue(v['review_required']);self.assertIsNone(v['submission']);self.assertNotIn(r['application'],json.dumps(v))
    def test_native_evidence_mutations_denied_and_recovery_exact(self):
        saved=self.save();a=self.create_args()
        with acting_as(self.f.users['manager']):
            e=recovery.prepare('intake',a);r=recovery.execute(e['name']);self.assertEqual(r,recovery.execute(e['name']))
        for dt,name in [(api.DT,saved['version']),(api.SUBMISSION,frappe.db.get_value(api.SUBMISSION,{'application':r['result']['application']},'name'))]:
            d=frappe.get_doc(dt,name)
            with acting_as(self.f.users['manager']),self.assertRaises(frappe.PermissionError):client_get(dt,name)
            with self.f.rejected(frappe.PermissionError):d.save(ignore_permissions=True)
            with self.f.rejected(frappe.PermissionError):frappe.copy_doc(d).insert(ignore_permissions=True)
            with self.f.rejected(frappe.PermissionError):frappe.delete_doc(dt,name,ignore_permissions=True)
            with self.f.rejected(frappe.PermissionError):frappe.rename_doc(dt,name,'Tamper',force=True)
    def test_late_failure_rolls_back_person_source_submission_and_receipt(self):
        self.save();before=self.s.i.counts();counts=(frappe.db.count(api.SUBMISSION),frappe.db.count(sources.ATTRIBUTION))
        with patch.object(api.KandilAgencySubmission,'after_insert',side_effect=RuntimeError('Synthetic late failure'),create=True),self.assertRaises(RuntimeError):self.create()
        self.assertEqual(before,self.s.i.counts());self.assertEqual(counts,(frappe.db.count(api.SUBMISSION),frappe.db.count(sources.ATTRIBUTION)))
    def test_revocation_before_catalogue_and_intake_receipt_replay(self):
        a=self.args();self.save(a);args=self.create_args();self.create(args)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        with self.assertRaises(frappe.PermissionError):self.save(a)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['manager'],'revoked',1)
        with self.assertRaises(frappe.PermissionError):self.create(args)

def run():
    r=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestAgencies));d=dict(tests_run=r.testsRun,failures=len(r.failures),errors=len(r.errors),skipped=len(r.skipped),successful=r.wasSuccessful() and not r.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in r.failures+r.errors]);print(json.dumps(d));return d
