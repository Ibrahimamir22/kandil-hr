"""Synthetic rollback-scoped catalog authority, revision and activity contracts."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch
import frappe
from frappe.client import get as client_get
from kandil_hr.catalogs import api
from kandil_hr.candidates import activities,recovery
from kandil_hr.candidates.test_activities import TestCandidateActivities
from kandil_hr.recruitment.test_commands import acting_as

class TestCatalogs(unittest.TestCase):
    def setUp(self):
        self.a=TestCandidateActivities();self.addCleanup(self.a.doCleanups);self.a.setUp()
        self.fixture=self.a.f.f;self.company=self.fixture.company
        frappe.db.set_value('Kandil Access Grant',self.fixture.grants['hr'],'department',None)

    def list(self,process='ACTIVITY_TYPE',role='hr'):
        with acting_as(self.fixture.users[role]):return api.listing(self.company,process)

    def args(self,code='',process='ACTIVITY_TYPE',**overrides):
        data=self.list(process);old=next((r for r in data['items'] if r['code']==code),None)
        values={k:old[k] for k in api.ITEM_FIELDS-{'code'}} if old else dict(label_ar='مناقشة المدير',label_en='Manager discussion',requires_note=True,active=True,sort_order=60)
        args=dict(company=self.company,process=process,version=data['version'],code=code,values=values,reason='Reviewed company list change',command_id=uuid.uuid4().hex)
        args.update(overrides);return args

    def save(self,args=None,role='hr',**kwargs):
        with acting_as(self.fixture.users[role]):return api.save(**(args or self.args(**kwargs)))

    def test_defaults_are_read_only_and_all_seven_reference_lists_are_available(self):
        before=frappe.db.count(api.DT)
        for process in api.PROCESSES:
            value=self.list(process);self.assertTrue(value['can_edit']);self.assertTrue(value['version'].startswith('DEFAULTS:'));self.assertTrue(value['items'])
        self.assertEqual(frappe.db.count(api.DT),before);self.assertEqual(len(api.PROCESSES),7)
        self.assertFalse(self.list(role='manager')['can_edit'])

    def test_create_exact_replay_and_stable_code_updates(self):
        args=self.args();result=self.save(args);count=frappe.db.count(api.DT)
        self.assertEqual(result,self.save(args));self.assertEqual(count,frappe.db.count(api.DT))
        with self.assertRaises(frappe.ValidationError):self.save(dict(args,reason='Different command'))
        update=self.args(result['code']);update['values']['label_ar']='مناقشة المدير المباشر';changed=self.save(update)
        self.assertEqual(changed['code'],result['code']);self.assertNotEqual(changed['version'],result['version'])
        old=frappe.get_doc(api.DT,result['version']);new=frappe.get_doc(api.DT,changed['version'])
        self.assertEqual(new.previous_revision,old.name);self.assertEqual(new.before_hash,old.after_hash)
        self.assertEqual(new.after_hash,api.digest(json.loads(new.items_json)))
        self.assertEqual(api.at_version(self.company,'ACTIVITY_TYPE',old.name)[-1]['label_ar'],'مناقشة المدير')

    def test_stale_editor_cannot_overwrite_and_failed_insert_has_no_revision(self):
        old=self.args();self.save();before=frappe.db.count(api.DT)
        with self.assertRaises(frappe.TimestampMismatchError):self.save(old)
        with patch.object(api.KandilHRListRevision,'after_insert',side_effect=RuntimeError('Synthetic after-insert failure'),create=True),self.assertRaises(RuntimeError):
            self.save(code='MEETING',values=dict(self.args('MEETING')['values'],label_ar='جلسة عمل'))
        self.assertEqual(before,frappe.db.count(api.DT))

    def test_protected_codes_cannot_be_disabled_and_custom_codes_are_server_owned(self):
        for process,codes in api.LOCKED.items():
            available={r['code'] for r in self.list(process)['items']}
            for code in codes & available:
                args=self.args(code,process);args['values']['active']=False
                with self.assertRaises(frappe.ValidationError):self.save(args)
        args=self.args('OTHER','CANDIDATE_REJECT');args['values']['active']=False
        with self.assertRaises(frappe.ValidationError):self.save(args)
        args=self.args();args['values']['code']='SYSTEM'
        with self.assertRaises(frappe.ValidationError):self.save(args)
        with self.assertRaises(frappe.ValidationError):self.save(code='SYSTEM')

    def test_validation_and_normalized_duplicate_labels(self):
        for change in ({'label_ar':' '},{'label_ar':'أ'},{'label_ar':'x'*161},{'label_en':{}},{'sort_order':True},{'sort_order':-1},{'sort_order':10000},{'active':'false'},{'requires_note':1},{'active':False}):
            args=self.args();args['values'].update(change)
            with self.assertRaises(frappe.ValidationError):self.save(args)
        args=self.args();args['values']['label_ar']='  مَكَالمة  '
        with self.assertRaises(frappe.ValidationError):self.save(args)
        args=self.args();args['values']['label_ar']='  مناقشة   المدير  ';result=self.save(args)
        self.assertEqual(next(r for r in self.list()['items'] if r['code']==result['code'])['label_ar'],'مناقشة المدير')

    def test_company_hr_authority_and_full_company_scope_are_required(self):
        args=self.args()
        frappe.db.set_value('Kandil Access Grant',self.fixture.grants['manager'],'department',None)
        with self.assertRaises(frappe.PermissionError):self.save(args,role='manager')
        frappe.db.set_value('Kandil Access Grant',self.fixture.grants['hr'],'department',self.fixture.department)
        self.assertFalse(self.list()['can_edit'])
        with self.assertRaises(frappe.PermissionError):self.save(args)
        with acting_as(self.fixture.users['requester']),self.assertRaises(frappe.PermissionError):api.listing(self.company)

    def test_native_mutations_and_revision_reads_are_denied(self):
        result=self.save();doc=frappe.get_doc(api.DT,result['version']);original=doc.as_dict()
        with acting_as(self.fixture.users['hr']),self.assertRaises(frappe.PermissionError):client_get(api.DT,doc.name)
        with self.fixture.rejected(frappe.PermissionError):doc.reason='Forged';doc.save(ignore_permissions=True)
        with self.fixture.rejected(frappe.PermissionError):frappe.delete_doc(api.DT,doc.name,ignore_permissions=True)
        with self.fixture.rejected(frappe.PermissionError):frappe.rename_doc(api.DT,doc.name,'Forged',force=True)
        with self.fixture.rejected(frappe.PermissionError):frappe.copy_doc(doc).insert(ignore_permissions=True)
        self.assertEqual(original,frappe.get_doc(api.DT,doc.name).as_dict())

    def test_revision_history_is_company_hr_only_and_paged(self):
        result=self.save();args=self.args(result['code']);args['values']['label_en']='Manager call';self.save(args)
        with acting_as(self.fixture.users['hr']):
            first=api.history(self.company,'ACTIVITY_TYPE',page_length=1);second=api.history(self.company,'ACTIVITY_TYPE',start=1,page_length=1)
        self.assertTrue(first['has_more']);self.assertFalse(second['has_more']);self.assertEqual(first['rows'][0].sequence,2)
        self.assertNotIn('@example.invalid',json.dumps(first,default=str))
        with acting_as(self.fixture.users['manager']),self.assertRaises(frappe.PermissionError):api.history(self.company,'ACTIVITY_TYPE')

    def test_replay_rechecks_revocation_and_current_hr_principal(self):
        args=self.args();self.save(args)
        frappe.db.set_value('Kandil Access Grant',self.fixture.grants['hr'],'can_manage_recruitment',0)
        with self.assertRaises(frappe.PermissionError):self.save(args)
        frappe.db.set_value('Kandil Access Grant',self.fixture.grants['hr'],'can_manage_recruitment',1)
        frappe.db.set_value('Kandil Organization Settings',self.company,'hr_approver',self.fixture.users['manager'])
        with self.assertRaises(frappe.PermissionError):self.save(args)

    def test_custom_activity_note_rule_labels_and_disabled_history(self):
        created=self.save();kind=created['code'];before=self.a.counts()
        with self.assertRaises(frappe.ValidationError):self.a.call(kind=kind,outcome='',note='')
        self.assertEqual(before,self.a.counts())
        args=self.a.args(kind=kind,outcome='',note='مناقشة مع المدير',catalog_version=created['version']);event=self.a.call(args=args)
        changed=self.args(kind);changed['values']['label_ar']='مناقشة معدلة';changed['values']['active']=False;self.save(changed)
        h=self.a.history();self.assertNotIn(kind,h['types']);row=next(r for r in h['rows'] if r['name']==event['activity'])
        self.assertEqual(row['kind_label_ar'],'مناقشة المدير');self.assertTrue(row['can_void'])
        self.assertEqual(event,self.a.call(args=args))
        with self.assertRaises(frappe.ValidationError):self.a.call(kind=kind,outcome='')
        self.a.call('void',args=self.a.void_args(event['activity']))

    def test_catalog_change_rejects_stale_review_without_activity_and_preserves_saved_recovery_labels(self):
        item=self.save();args=self.a.args(kind=item['code'],outcome='',catalog_version=item['version'])
        with acting_as(self.fixture.users['manager']):saved=recovery.prepare('activity',args)
        changed=self.args(item['code']);changed['values']['label_ar']='اسم جديد';self.save(changed);count=self.a.counts()
        with acting_as(self.fixture.users['manager']):
            self.assertEqual(recovery.inspect(saved['name'])['activity_type']['label_ar'],'مناقشة المدير')
            with self.assertRaises(frappe.TimestampMismatchError):recovery.execute(saved['name'])
        self.assertEqual(count,self.a.counts())

    def test_configured_optional_note_is_respected_and_legacy_plain_commands_still_work(self):
        args=self.args('MEETING');args['values']['requires_note']=False;self.save(args)
        event=self.a.call(kind='MEETING',outcome='',note='')
        self.assertEqual(event['kind'],'MEETING')
        self.assertTrue(self.a.call(kind='CALL',outcome='REACHED')['activity'])

    def test_call_note_requirement_and_note_deactivation_policy_are_enforced(self):
        args=self.args('CALL');args['values']['requires_note']=True;self.save(args)
        with self.assertRaises(frappe.ValidationError):self.a.call(kind='CALL',outcome='REACHED',note='')
        self.assertTrue(self.a.call(kind='CALL',outcome='REACHED',note='Required explanation')['activity'])
        args=self.args('NOTE');args['values']['requires_note']=False;self.save(args)
        self.assertTrue(self.a.call(kind='NOTE',outcome='',note='')['activity'])

    def test_company_isolation_and_revision_lookup_scope(self):
        result=self.save()
        with self.assertRaises(frappe.PermissionError):api.at_version('Another company','ACTIVITY_TYPE',result['version'])
        with self.assertRaises(frappe.PermissionError):api.at_version(self.company,'CANDIDATE_REJECT',result['version'])
        with acting_as(self.fixture.users['hr']),self.assertRaises(frappe.PermissionError):api.listing('Another company')


def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestCatalogs))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,fixtures_rolled_back=True,failed_tests=[t.id() for t,_ in result.failures+result.errors]);print(json.dumps(summary));return summary
