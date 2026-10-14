"""Synthetic source catalogue, native authority and immutable intake attribution."""
import json,sys,unittest,uuid
from unittest.mock import patch
import frappe
from frappe.client import get as client_get
from kandil_hr.sourcing import sources as api
from kandil_hr.candidates import intake,recovery
from kandil_hr.candidates.test_identity import TestCandidateIdentity
from kandil_hr.recruitment.test_commands import acting_as

class TestSources(unittest.TestCase):
    def setUp(self):
        self.i=TestCandidateIdentity();self.addCleanup(self.i.doCleanups);self.i.setUp();self.f=self.i.f;self.company=self.f.company
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'department',None)
        flags=patch.dict(frappe.conf,{'kandil_source_catalog_enabled':1});flags.start();self.addCleanup(flags.stop)
    def list(self,role='hr'):
        with acting_as(self.f.users[role]):return api.listing(self.company)
    def args(self,code='EMAIL',**changes):
        d=self.list();row=next(r for r in d['items'] if r['code']==code)
        values={k:row[k] for k in api.ITEM_FIELDS-{'code'}};values.update(changes or dict(label_en='Updated email source'))
        return dict(company=self.company,version=d['version'],code=code,values=values,reason='Synthetic reviewed source',command_id=uuid.uuid4().hex)
    def save(self,args=None,role='hr'):
        with acting_as(self.f.users[role]):return api.save(**(args or self.args()))
    def intake_args(self,code='EMAIL'):
        return dict(name=self.i.request,opening_name=self.i.opening,details=dict(self.i.data,source_channel=code),command_id=uuid.uuid4().hex,expected_version=str(self.f.load(self.i.request).modified),source_version=self.list()['version'])
    def create(self,args=None):
        with acting_as(self.f.users['manager']):return intake.create_application(**(args or self.intake_args()))
    def test_default_thirteen_sources_readonly_and_company_scope(self):
        count=frappe.db.count(api.DT);self.assertEqual(len(self.list()['items']),13);self.assertEqual(frappe.db.count(api.DT),count)
        self.assertFalse(self.list('manager')['can_edit'])
        with self.assertRaises(frappe.PermissionError):self.save(role='manager')
        with acting_as(self.f.users['manager']),self.assertRaises(frappe.PermissionError):api.listing('Other synthetic company')
    def test_revision_exact_retry_conflict_and_hash_chain(self):
        a=self.args();r=self.save(a);self.assertEqual(r,self.save(a))
        with self.assertRaises(frappe.ValidationError):self.save(dict(a,reason='Different retry'))
        with self.assertRaises(frappe.TimestampMismatchError):self.save(dict(a,command_id=uuid.uuid4().hex))
        n=self.save(self.args(label_en='Another label'));old=frappe.get_doc(api.DT,r['version']);new=frappe.get_doc(api.DT,n['version']);self.assertEqual(new.previous_revision,old.name);self.assertEqual(new.before_hash,old.after_hash)
    def test_new_code_and_kind_cannot_repurpose_existing_source(self):
        a=self.args();a.update(code='LOCAL_FAIR',is_new=True);a['values'].update(label_ar='معرض وظائف محلي',label_en='Local fair',kind='DIRECT');self.save(a)
        with self.assertRaises(frappe.ValidationError):self.save(dict(a,version=self.list()['version'],command_id=uuid.uuid4().hex))
        with self.assertRaises(frappe.ValidationError):self.save(self.args('LOCAL_FAIR',kind='AGENCY'))
        for code in ('bad code','email','X'*21):
            with self.assertRaises(frappe.ValidationError):self.save(dict(a,code=code))
    def test_protected_defaults_and_duplicate_labels(self):
        for code in ('CAREER_PAGE','OTHER'):
            with self.assertRaises(frappe.ValidationError):self.save(self.args(code,active=False))
        with self.assertRaises(frappe.ValidationError):self.save(self.args(label_ar='أخرى'))
        with self.assertRaises(frappe.ValidationError):self.save(self.args(uses_credits='true'))
    def test_snapshot_is_immutable_when_catalogue_renamed_or_disabled(self):
        args=self.intake_args();r=self.create(args);before=frappe.get_doc(api.ATTRIBUTION,{'application':r['application']}).as_dict()
        self.save(self.args(label_en='Renamed disabled email',active=False));self.assertEqual(r,self.create(args));self.assertEqual(before,frappe.get_doc(api.ATTRIBUTION,{'application':r['application']}).as_dict())
        with self.assertRaises(frappe.ValidationError):self.create()
    def test_missing_unknown_stale_sources_and_unfinished_kinds_rejected(self):
        args=self.intake_args();before=self.i.counts()
        with self.assertRaises(frappe.TimestampMismatchError):self.create({k:v for k,v in args.items() if k!='source_version'})
        with self.assertRaises(frappe.TimestampMismatchError):self.create(dict(args,source_version='old'))
        with self.assertRaises(frappe.ValidationError):self.create(self.intake_args('FORGED'))
        for code in ('REFERRAL','AGENCY','INTERNAL','TALENT_POOL'):
            with self.assertRaises(frappe.PermissionError):self.create(self.intake_args(code))
        self.assertEqual(before,self.i.counts())
    def test_new_unknown_custom_special_kind_also_requires_dedicated_workflow(self):
        args=self.args();args.update(code='NEW_AGENCY',is_new=True);args['values'].update(label_ar='مكتب جديد',label_en='New agency',kind='AGENCY');self.save(args)
        with self.assertRaises(frappe.PermissionError):self.create(self.intake_args('NEW_AGENCY'))
    def test_legacy_receipt_replays_after_activation_without_invented_snapshot(self):
        args=self.intake_args();args.pop('source_version')
        with patch.dict(frappe.conf,{'kandil_source_catalog_enabled':0}):r=self.create(args)
        self.assertEqual(r,self.create(args));self.assertFalse(frappe.db.exists(api.ATTRIBUTION,{'application':r['application']}))
    def test_source_capture_failure_rolls_back_new_application_and_receipt(self):
        before=self.i.counts();count=frappe.db.count(api.ATTRIBUTION)
        with patch.object(api.KandilApplicationSource,'after_insert',side_effect=RuntimeError('Synthetic source failure'),create=True),self.assertRaises(RuntimeError):self.create()
        self.assertEqual(before,self.i.counts());self.assertEqual(count,frappe.db.count(api.ATTRIBUTION))
    def test_recovery_preserves_selected_source_version(self):
        args=self.intake_args()
        with acting_as(self.f.users['manager']):
            prepared=recovery.prepare('intake',args);result=recovery.execute(prepared['name']);self.assertEqual(result['status'],'Completed')
            row=frappe.db.get_value(api.ATTRIBUTION,{'application':result['result']['application']},'source_version');self.assertEqual(row,args['source_version'])
    def test_revision_and_snapshot_native_mutations_denied(self):
        saved=self.save();created=self.create()
        for kind,name in ((api.DT,saved['version']),(api.ATTRIBUTION,frappe.db.get_value(api.ATTRIBUTION,{'application':created['application']},'name'))):
            doc=frappe.get_doc(kind,name)
            with acting_as(self.f.users['manager']),self.assertRaises(frappe.PermissionError):client_get(kind,name)
            with self.f.rejected(frappe.PermissionError):doc.save(ignore_permissions=True)
            with self.f.rejected(frappe.PermissionError):frappe.copy_doc(doc).insert(ignore_permissions=True)
            with self.f.rejected(frappe.PermissionError):frappe.delete_doc(kind,name,ignore_permissions=True)
            with self.f.rejected(frappe.PermissionError):frappe.rename_doc(kind,name,'Tamper',force=True)
    def test_revoke_hr_denies_replay_and_history(self):
        args=self.args();self.save(args);frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        with self.assertRaises(frappe.PermissionError):self.save(args)
        with acting_as(self.f.users['hr']),self.assertRaises(frappe.PermissionError):api.history(self.company)
    def test_history_paging_and_nonadmin_audit_denial(self):
        for i in range(3):self.save(self.args(label_en='Synthetic email '+str(i)))
        with acting_as(self.f.users['hr']):
            a=api.history(self.company,page_length=2);b=api.history(self.company,start=2,page_length=2)
        self.assertTrue(a['has_more']);self.assertEqual(len(b['rows']),1);self.assertNotEqual(a['rows'][0]['name'],b['rows'][0]['name'])
        with acting_as(self.f.users['manager']),self.assertRaises(frappe.PermissionError):api.history(self.company)
    def test_pool_intake_integrates_catalogue_without_generic_bypass(self):
        from kandil_hr.candidates.test_pool_intake import TestPoolIntake
        t=TestPoolIntake();self.addCleanup(t.doCleanups)
        with patch.dict(frappe.conf,{'kandil_source_catalog_enabled':0,'kandil_candidate_identity_enabled':0}):t.setUp()
        r=t.create();row=frappe.get_doc(api.ATTRIBUTION,{'application':r['application']});self.assertEqual(row.source_code,'TALENT_POOL')

def run():
    r=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestSources));d=dict(tests_run=r.testsRun,failures=len(r.failures),errors=len(r.errors),skipped=len(r.skipped),successful=r.wasSuccessful() and not r.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in r.failures+r.errors]);print(json.dumps(d));return d
