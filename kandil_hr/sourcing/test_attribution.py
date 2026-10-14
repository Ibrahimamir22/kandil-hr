"""Ordinary-role source correction, permanent outcome lock and recovery contracts."""
import json,sys,unittest,uuid
from unittest.mock import patch
import frappe
from frappe.client import get as client_get
from kandil_hr.sourcing import attribution as api, sources
from kandil_hr.sourcing.test_sources import TestSources
from kandil_hr.candidates import recovery,closure,activities
from kandil_hr.catalogs import api as catalog
from kandil_hr.recruitment.test_commands import acting_as

class TestAttribution(unittest.TestCase):
    def setUp(self):
        self.s=TestSources();self.addCleanup(self.s.doCleanups);self.s.setUp();self.f=self.s.f;self.created=self.s.create();self.name=self.created['application'];self.company=self.s.company
    def context(self):
        with acting_as(self.f.users['manager']):return api.context(self.name)
    def args(self,**changes):
        c=self.context();a=dict(name=c['request'],opening_name=c['opening'],application=self.name,application_version=c['application_version'],expected_version=c['expected_version'],attribution_version=c['attribution_version'],source_code='LINKEDIN',source_version=c['options']['version'],sub_source='Reviewed synthetic campaign',reason='Private correction reason',command_id=uuid.uuid4().hex);a.update(changes);return a
    def call(self,args=None,**changes):
        with acting_as(self.f.users['manager']):return api.correct(**(args or self.args(**changes)))
    def count(self):return tuple(frappe.db.count(dt) for dt in (api.DT,activities.DT,'Kandil Command Receipt','Kandil Command Audit'))
    def close(self,decision='Rejected'):
        app=frappe.get_doc('Job Applicant',self.name);cfg=catalog.state(self.company,closure.PROCESSES[decision])
        with acting_as(self.f.users['manager']):return closure.close(self.s.i.request,self.s.i.opening,self.name,str(app.modified),decision,'OTHER',cfg['version'],'Synthetic close','',uuid.uuid4().hex,str(self.f.load(self.s.i.request).modified))
    def test_corrects_projection_preserves_original_person_and_capacity(self):
        original=frappe.get_doc(sources.ATTRIBUTION,{'application':self.name}).as_dict();person=frappe.get_doc('Kandil Candidate Person',self.created['person']).as_dict();caps=[frappe.get_doc('Kandil Capacity',r.capacity).as_dict() for r in self.f.load(self.s.i.request).lines]
        result=self.call();ctx=self.context();self.assertEqual(ctx['current']['code'],'LINKEDIN');self.assertEqual(ctx['original']['code'],'EMAIL');self.assertEqual(original,frappe.get_doc(sources.ATTRIBUTION,original['name']).as_dict());self.assertEqual(person,frappe.get_doc('Kandil Candidate Person',person['name']).as_dict());self.assertEqual(caps,[frappe.get_doc('Kandil Capacity',r.capacity).as_dict() for r in self.f.load(self.s.i.request).lines]);self.assertEqual(frappe.db.get_value('Job Applicant',self.name,'custom_kandil_source_channel'),'LINKEDIN')
        with acting_as(self.f.users['manager']):
            from kandil_hr.portal.candidates import detail
            self.assertEqual(detail(self.name)['application']['source_snapshot']['source']['code'],'LINKEDIN')
        event=frappe.get_doc(activities.DT,result['activity']);self.assertEqual(event.kind,'SYSTEM');self.assertFalse(event.stage_to)
    def test_exact_retry_and_conflict(self):
        a=self.args();r=self.call(a);before=self.count();self.assertEqual(r,self.call(a));self.assertEqual(before,self.count())
        with self.assertRaises(frappe.ValidationError):self.call(dict(a,reason='Changed reason'))
    def test_stale_versions_and_bad_fields_no_effect(self):
        before=self.count()
        for kwargs in (dict(application_version='2000-01-01'),dict(expected_version='2000-01-01'),dict(source_version='stale'),dict(attribution_version='stale')):
            with self.assertRaises(frappe.TimestampMismatchError):self.call(**kwargs)
        for kwargs in (dict(reason=''),dict(sub_source=''),dict(source_code='FAKE'),dict(source_code='EMAIL',sub_source=self.context()['current']['sub_source'])):
            with self.assertRaises(frappe.ValidationError):self.call(**kwargs)
        self.assertEqual(before,self.count())
    def test_dedicated_target_sources_cannot_be_laundered(self):
        for code in ('REFERRAL','AGENCY','INTERNAL','TALENT_POOL'):
            with self.assertRaises(frappe.PermissionError):self.call(source_code=code)
    def test_special_legacy_source_requires_its_dedicated_workflow(self):
        with patch.dict(frappe.conf,{'kandil_source_catalog_enabled':0}):legacy=self.s.i.create()
        self.name=legacy['application'];self.assertTrue(self.context()['dedicated'])
        with self.assertRaises(frappe.PermissionError):self.call()
    def test_unknown_legacy_values_keep_unverified_original(self):
        with patch.dict(frappe.conf,{'kandil_source_catalog_enabled':0}):legacy=self.s.i.create(details=dict(self.s.i.data,source_channel='Historic fair'))
        self.name=legacy['application'];self.call();c=self.context();self.assertEqual(c['original']['code'],'Historic fair');self.assertFalse(c['original']['recorded']);self.assertIsNone(c['original']['source']);self.assertFalse(frappe.db.exists(sources.ATTRIBUTION,{'application':self.name}))
    def test_closure_locks_new_corrections_but_exact_prior_receipt_survives(self):
        a=self.args();r=self.call(a);self.close();self.assertTrue(self.context()['locked']);self.assertEqual(self.call(a),r)
        with self.assertRaises(frappe.PermissionError):self.call(source_code='FACEBOOK')
    def test_withdrawal_locks(self):
        self.close('Withdrawn');self.assertFalse(self.context()['can_correct'])
        with self.assertRaises(frappe.PermissionError):self.call()
    def test_real_reopening_does_not_unlock_attribution(self):
        from kandil_hr.candidates.test_stages import TestStages
        t=TestStages();self.addCleanup(t.doCleanups)
        with patch.dict(frappe.conf,{'kandil_source_catalog_enabled':0,'kandil_candidate_identity_enabled':0}):t.setUp()
        with patch.dict(frappe.conf,{'kandil_candidate_screening_enabled':1}):
            t.accept();t.close();t.call('reopen')
        with acting_as(t.f.users['hr']):
            ctx=api.context(t.app);self.assertEqual(frappe.db.get_value('Job Applicant',t.app,'status'),'Screening');self.assertTrue(ctx['locked']);self.assertFalse(ctx['can_correct'])
    def test_late_audit_failure_rolls_back_every_effect(self):
        before=self.count();doc=frappe.get_doc('Job Applicant',self.name).as_dict()
        with patch('kandil_hr.foundation.command_audit.record_command',side_effect=RuntimeError('Synthetic audit failure')),self.assertRaises(RuntimeError):self.call()
        self.assertEqual(before,self.count());self.assertEqual(doc,frappe.get_doc('Job Applicant',self.name).as_dict())
    def test_revision_history_native_edit_copy_delete_rename_and_read_denied(self):
        r=self.call();d=frappe.get_doc(api.DT,r['revision'])
        with acting_as(self.f.users['manager']),self.assertRaises(frappe.PermissionError):client_get(api.DT,d.name)
        with self.f.rejected(frappe.PermissionError):d.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.copy_doc(d).insert(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.delete_doc(api.DT,d.name,ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError):frappe.rename_doc(api.DT,d.name,'Tampered',force=True)
        app=frappe.get_doc('Job Applicant',self.name);app.custom_kandil_source_channel='FACEBOOK'
        with self.f.rejected(frappe.PermissionError):app.save(ignore_permissions=True)
    def test_scope_revocation_denies_context_and_completed_replay(self):
        a=self.args();self.call(a);frappe.db.set_value('Kandil Access Grant',self.f.grants['manager'],'revoked',1)
        with self.assertRaises(frappe.PermissionError):self.call(a)
        with self.assertRaises(frappe.PermissionError):self.context()
    def test_private_recovery_and_history_paging(self):
        a=self.args()
        with acting_as(self.f.users['manager']):
            e=recovery.prepare('source',a);inspected=recovery.inspect(e['name']);self.assertEqual(inspected['arguments']['source_code'],'LINKEDIN');r=recovery.execute(e['name']);self.assertEqual(r['status'],'Completed');self.assertEqual(r,recovery.execute(e['name']))
        self.call(source_code='EMAIL');self.call(source_code='FACEBOOK')
        with acting_as(self.f.users['manager']):
            x=api.context(self.name,page_length=2);y=api.context(self.name,start=2,page_length=2)
        self.assertTrue(x['history']['has_more']);self.assertEqual(len(y['history']['rows']),1);self.assertEqual(x['original']['code'],'EMAIL')
        rows=frappe.get_all('Kandil Command Audit',filters={'operation':'candidate_source_correct'},fields=['*']);self.assertNotIn('Private correction reason',json.dumps(rows,default=str))
    def test_catalogue_rename_cannot_relabel_corrected_history(self):
        self.call();before=self.context()['current'];self.s.save(self.s.args('LINKEDIN',label_en='Renamed source',active=False));self.assertEqual(before,self.context()['current'])
        with self.assertRaises(frappe.ValidationError):self.call(sub_source='Changed detail')

def run():
    r=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestAttribution));d=dict(tests_run=r.testsRun,failures=len(r.failures),errors=len(r.errors),skipped=len(r.skipped),successful=r.wasSuccessful() and not r.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in r.failures+r.errors]);print(json.dumps(d));return d
