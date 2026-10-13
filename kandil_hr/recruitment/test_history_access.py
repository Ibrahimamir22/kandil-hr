"""Native raw revision list/detail security, using ordinary roles and SQL rollback."""
import json
import sys
import unittest

import frappe
from frappe.client import get, get_list
from kandil_hr.portal.test_api import TestPortalAPI
from kandil_hr.recruitment import api
from kandil_hr.recruitment.test_commands import acting_as


class TestHistoryAccess(unittest.TestCase):
    def setUp(self):
        self.base=TestPortalAPI();self.addCleanup(self.base.doCleanups);self.base.setUp();self.f=self.base.f
        self.name=self.base.save()['name'];self.f.submit(self.name)
        self.revision=frappe.get_all('Kandil Request Revision',filters={'request':self.name},fields=['name','snapshot_json'])[0]

    def listing(self,role='requester'):
        with acting_as(self.f.users[role]):
            return get_list('Kandil Request Revision',fields=['name','snapshot_json'],filters={'request':self.name})

    def read(self,role='requester'):
        with acting_as(self.f.users[role]):return get('Kandil Request Revision',self.revision.name)

    def denied(self,role='requester'):
        self.assertEqual(self.listing(role),[])
        with self.f.rejected(frappe.PermissionError):self.read(role)

    def test_safe_original_bytes_remain_readable_to_requester_manager_hr(self):
        for role in ('requester','manager','hr'):
            self.assertEqual(self.read(role)['snapshot_json'],self.revision.snapshot_json)
            self.assertEqual(self.listing(role)[0].snapshot_json,self.revision.snapshot_json)

    def test_return_revise_resubmit_keeps_authorized_original_bytes(self):
        self.f.decide(self.name,'manager',decision='Return',comment='Clarify')
        self.f.call('requester',api.revise,self.name,reason='Clarified')
        with acting_as(self.f.users['requester']):
            doc=self.f.load(self.name);doc.lines[0].requested_qty=3;doc.save()
        self.f.submit(self.name)
        self.assertEqual(self.read()['snapshot_json'],self.revision.snapshot_json)

    def test_old_department_metadata_is_not_inherited_from_current_request(self):
        # Simulate legacy data whose latest request no longer carries old scope.
        other=self.f.insert('Department',department_name=self.f.prefix+' previous',company=self.f.company).name
        value=json.loads(self.revision.snapshot_json);value['department']=other
        frappe.db.set_value('Kandil Request Revision',self.revision.name,{'department':other,'snapshot_json':json.dumps(value)})
        self.denied()

    def test_narrow_branch_cannot_read_unredacted_legacy_snapshot(self):
        self.base.replace_requester_grant(branch=frappe.db.get_value('Kandil Capacity',self.f.capacities[0],'branch'))
        # The current request remains usable through safe projected endpoints.
        from kandil_hr.portal import api as portal
        with acting_as(self.f.users['requester']):self.assertEqual(portal.detail(self.name)['request']['name'],self.name)
        self.denied()

    def test_position_user_permission_applies_inside_snapshot(self):
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Kandil Position',for_value=self.f.positions[1],apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester']);self.denied()

    def test_restricted_historical_capacity_not_current_lines_denied(self):
        value=json.loads(self.revision.snapshot_json);value['lines'][0]['capacity']=self.f.capacities[1]
        frappe.db.set_value('Kandil Request Revision',self.revision.name,'snapshot_json',json.dumps(value))
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Kandil Capacity',for_value=self.f.capacities[0],apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester']);self.denied()

    def test_replacement_identity_requires_current_reference_permission(self):
        employee=frappe.db.get_value('Employee',{'user_id':self.f.users['manager']},'name')
        value=json.loads(self.revision.snapshot_json);value['replacement_employee']=employee
        frappe.db.set_value('Kandil Request Revision',self.revision.name,'snapshot_json',json.dumps(value))
        self.assertEqual(json.loads(self.read()['snapshot_json'])['replacement_employee'],employee)
        self.base.replace_requester_grant(can_manage_recruitment=0,can_view_sensitive=0)
        self.denied()

    def test_replacement_employee_user_permission_is_enforced(self):
        employee=frappe.db.get_value('Employee',{'user_id':self.f.users['manager']},'name')
        other=self.f.insert('Employee',first_name='Another synthetic identity',gender='Male',date_of_birth='1990-01-01',date_of_joining='2020-01-01',company=self.f.company,department=self.f.department,status='Active').name
        value=json.loads(self.revision.snapshot_json);value['replacement_employee']=employee
        frappe.db.set_value('Kandil Request Revision',self.revision.name,'snapshot_json',json.dumps(value))
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Employee',for_value=other,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester']);self.denied()

    def test_corrupt_or_unknown_private_snapshot_fields_fail_closed(self):
        values=['not json',json.dumps(json.loads(self.revision.snapshot_json)|{'private_salary':'DO NOT EXPOSE'})]
        child=json.loads(self.revision.snapshot_json);child['lines'][0]['private_salary']='DO NOT EXPOSE';values.append(json.dumps(child))
        for value in values:
            frappe.db.set_value('Kandil Request Revision',self.revision.name,'snapshot_json',value)
            self.denied()

    def test_revocation_immediate_on_list_and_detail(self):
        grant=frappe.get_doc('Kandil Access Grant',self.f.grants['requester']);grant.revoked=1;grant.save(ignore_permissions=True)
        self.denied()

    def revision_attachment(self):
        from pathlib import Path
        import uuid
        prefix = 'synthetic-history-file-' + uuid.uuid4().hex
        # Revision writes are deliberately prohibited. Model a retained legacy
        # attachment through a fixture-only DB insert, never a public API.
        file = frappe.get_doc(dict(doctype='File', name=prefix,
            file_name=prefix+'.txt', file_url='/private/files/'+prefix+'.txt',
            is_private=1, is_folder=0, attached_to_doctype='Kandil Request Revision',
            attached_to_name=self.revision.name, owner=self.f.users['requester']))
        with acting_as(self.f.users['requester']):file.db_insert()
        self.assertEqual(frappe.db.get_value("File",file.name,"owner"),self.f.users["requester"])
        path = Path(frappe.get_site_path('private', 'files', file.file_name))
        path.write_text('Synthetic immutable review attachment')
        self.addCleanup(path.unlink, missing_ok=True)
        return file

    def file_listing(self, file, role='requester'):
        with acting_as(self.f.users[role]):
            return get_list('File', fields=['name','file_name','file_url'], filters={'name':file.name})

    def test_safe_revision_file_metadata_and_download_remain_readable(self):
        file = self.revision_attachment()
        with acting_as(self.f.users['requester']):
            self.assertTrue(frappe.get_doc('File',file.name).is_downloadable())
            self.assertEqual(get('File',file.name)['file_url'],file.file_url)
        self.assertEqual(self.file_listing(file)[0].file_url,file.file_url)

    def test_revision_attachment_listing_cannot_outlive_historical_scope(self):
        from kandil_hr.portal import api as portal
        file = self.revision_attachment()
        self.base.replace_requester_grant(branch=frappe.db.get_value('Kandil Capacity',self.f.capacities[0],'branch'))
        with acting_as(self.f.users['requester']):
            self.assertEqual(portal.detail(self.name)['request']['name'],self.name)
            self.assertFalse(frappe.get_doc('File',file.name).is_downloadable())
            with self.f.rejected(frappe.PermissionError):get('File',file.name)
        # Native File ownership must not reveal name or URL after the revision
        # is no longer readable, even though the live request is still usable.
        self.assertEqual(self.file_listing(file),[])

    def test_revision_attachment_listing_respects_reference_user_permissions(self):
        file = self.revision_attachment()
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Kandil Position',for_value=self.f.positions[1],apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester'])
        self.assertEqual(self.file_listing(file),[])

    def test_revision_attachment_applies_parent_revision_user_permission(self):
        file = self.revision_attachment()
        self.f.decide(self.name,'manager',decision='Approve',comment='Reviewed')
        other=frappe.get_all('Kandil Request Revision',filters={'request':self.name,'name':['!=',self.revision.name]},pluck='name')[0]
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Kandil Request Revision',for_value=other,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester'])
        self.assertEqual(self.file_listing(file),[])

    def test_native_history_exports_require_export_permission(self):
        from frappe.core.doctype.data_export.exporter import export_data
        for role in ('requester','manager','hr'):
            with acting_as(self.f.users[role]), self.f.rejected(frappe.PermissionError):
                export_data(doctype='Kandil Request Revision',with_data=True,
                    select_columns={'Kandil Request Revision':['name','snapshot_json']},
                    filters={'request':self.name})

    def test_native_history_report_query_uses_same_revision_guard(self):
        from frappe.desk.reportview import execute
        with acting_as(self.f.users['requester']):
            rows = execute('Kandil Request Revision',fields=['name','snapshot_json'],filters={'request':self.name})
        self.assertEqual(rows[0].snapshot_json,self.revision.snapshot_json)
        value=json.loads(self.revision.snapshot_json);value['private_hr_note']='Never shared'
        frappe.db.set_value('Kandil Request Revision',self.revision.name,'snapshot_json',json.dumps(value))
        with acting_as(self.f.users['requester']):
            self.assertEqual(execute('Kandil Request Revision',fields=['name','snapshot_json'],filters={'request':self.name}),[])

    def assert_no_embedded_history(self, value):
        self.assertFalse(value.get('submitted_snapshot'))
        self.assertFalse(value.get('route_snapshot'))
        self.assertTrue(all(not row.get('reviewed_snapshot') for row in value.get('approval_steps', [])))

    def test_request_reads_hide_nested_history_without_changing_stored_bytes(self):
        from frappe.api.v1 import read_doc
        from frappe.api.v2 import read_doc as read_doc_v2
        self.f.decide(self.name, 'manager', decision='Approve', comment='Reviewed')
        before = self.f.load(self.name).as_dict()
        self.assertTrue(before.submitted_snapshot)
        self.assertTrue(before.route_snapshot)
        self.assertTrue(before.approval_steps[0].reviewed_snapshot)
        for role in ('requester', 'manager', 'hr'):
            with acting_as(self.f.users[role]):
                self.assert_no_embedded_history(get('Kandil Hiring Request', self.name))
                v1 = read_doc('Kandil Hiring Request', self.name)
                self.assert_no_embedded_history(v1.as_dict() if hasattr(v1, 'as_dict') else v1)
                self.assert_no_embedded_history(read_doc_v2('Kandil Hiring Request', self.name))
        self.assertEqual(self.f.load(self.name).as_dict(), before)

    def test_native_query_cannot_select_nested_history_fields(self):
        from frappe.desk.reportview import execute
        with acting_as(self.f.users['requester']):
            for query in (get_list, execute):
                for field in ('submitted_snapshot', 'route_snapshot', 'approval_steps.reviewed_snapshot'):
                    try:
                        rows = query('Kandil Hiring Request', fields=['name', field], filters={'name':self.name})
                    except frappe.PermissionError:
                        frappe.clear_messages()
                        continue
                    # The pinned list compiler may omit an inaccessible field
                    # rather than reject the whole query. Both must reveal no value.
                    for row in rows:
                        self.assertEqual(set(row), {'name'}, (query.__name__, field, tuple(row)))

    def test_command_and_replay_hide_history_but_receipt_retains_original(self):
        import uuid
        command_id = uuid.uuid4().hex
        version = str(self.f.load(self.name).modified)
        values = dict(command_id=command_id, expected_version=version, decision='Return', comment='Clarify', step_id=self.f.load(self.name).approval_steps[0].step_key)
        result = self.f.call('manager', api.decide, self.name, **values)
        self.assert_no_embedded_history(result)
        replay = self.f.call('manager', api.decide, self.name, **values)
        self.assertEqual(api.dump(result), api.dump(replay))
        receipt = frappe.get_all('Kandil Command Receipt', filters={'request':self.name, 'actor':self.f.users['manager']}, pluck='result_json')[0]
        stored = json.loads(receipt)
        self.assertTrue(stored['submitted_snapshot'])
        self.assertTrue(stored['route_snapshot'])
        self.assertTrue(stored['approval_steps'][0]['reviewed_snapshot'])
        self.assertEqual(self.f.load(self.name).submitted_snapshot, stored['submitted_snapshot'])

    def test_native_submitted_save_cannot_echo_or_erase_history(self):
        from frappe.client import save
        before = self.f.load(self.name).as_dict()
        with acting_as(self.f.users['requester']):
            value = get('Kandil Hiring Request', self.name)
            value['title'] += ' native edit'
            with self.f.rejected(frappe.PermissionError):save(json.dumps(value, default=str))
        self.assertEqual(self.f.load(self.name).as_dict(), before)

    def test_raw_revision_read_has_no_mutation(self):
        before=self.f.counts(self.name);self.read();self.listing()
        self.assertEqual(self.f.counts(self.name),before)
        self.assertEqual(frappe.db.get_value('Kandil Request Revision',self.revision.name,'snapshot_json'),self.revision.snapshot_json)


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestHistoryAccess))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
        limits=['Native raw Request Revision scope, embedded snapshots, revision attachment metadata/download and report-builder/export guard checks. Nested raw route/reference disclosure and personal-session HTTP coverage remain separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Native history access failed')
    return value
