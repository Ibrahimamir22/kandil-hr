"""Ordinary-role indirect attachment boundaries; synthetic rollback fixtures only."""
import io
import json
import sys
import unittest
import uuid
import zipfile
from pathlib import Path

import frappe
from frappe.client import get, get_list
from kandil_hr.recruitment.test_history_access import TestHistoryAccess
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.foundation.files import FileMixin


class TestIndirectFiles(unittest.TestCase):
    def setUp(self):
        self.base=TestHistoryAccess();self.addCleanup(self.base.doCleanups);self.base.setUp();self.f=self.base.f

    def file(self,kind=None,name=None,url=None):
        ident='indirect-'+uuid.uuid4().hex
        doc=frappe.get_doc(dict(doctype='File',name=ident,file_name=ident+'.txt',file_url=url or '/private/files/'+ident+'.txt',
            is_private=1,is_folder=0,attached_to_doctype=kind,attached_to_name=name,owner=self.f.users['requester']))
        with acting_as(self.f.users['requester']):doc.db_insert()
        self.assertEqual(frappe.db.get_value("File",doc.name,"owner"),self.f.users["requester"])
        if kind is None:frappe.db.set_value("File",doc.name,"attached_to_doctype",None)
        if not url:
            path=Path(frappe.get_site_path('private','files',doc.file_name));path.write_text('Synthetic indirect attachment')
            self.addCleanup(path.unlink,missing_ok=True)
        return doc

    def listed(self,file):
        with acting_as(self.f.users['requester']):
            return get_list('File',filters={'name':file.name},fields=['name','file_name','file_url'])

    def allowed(self,file,listed=True):
        # Native File lists exclude child DocTypes without role-level read.
        # Detail/download/zip still use their authorized owning document.
        self.assertEqual(len(self.listed(file)),int(listed))
        with acting_as(self.f.users['requester']):
            self.assertEqual(get('File',file.name)['file_url'],file.file_url)
            self.assertTrue(frappe.get_doc('File',file.name).is_downloadable())
            with zipfile.ZipFile(io.BytesIO(FileMixin.zip_files([file.name]))) as archive:
                self.assertEqual(archive.namelist(),[file.file_name])

    def denied(self,file):
        self.assertEqual(self.listed(file),[])
        with acting_as(self.f.users['requester']):
            with self.f.rejected(frappe.PermissionError):get('File',file.name)
            self.assertFalse(frappe.get_doc('File',file.name).is_downloadable())
            with zipfile.ZipFile(io.BytesIO(FileMixin.zip_files([file.name]))) as archive:
                self.assertEqual(archive.namelist(),[])

    def revoke(self):
        grant=frappe.get_doc('Kandil Access Grant',self.f.grants['requester']);grant.revoked=1;grant.save(ignore_permissions=True)

    def test_file_chain_authorized_then_revoked_metadata_detail_download_zip(self):
        root=self.base.revision_attachment();chain=[];parent=root
        for _ in range(4):
            parent=self.file('File',parent.name);chain.append(parent)
        for file in chain:self.allowed(file)
        self.revoke()
        for file in chain:self.denied(file)

    def test_child_attachment_and_file_child_chain_have_legitimate_access(self):
        line=self.f.load(self.base.name).lines[0]
        child=self.file('Kandil Request Line',line.name);nested=self.file('File',child.name)
        self.allowed(child,listed=False);self.allowed(nested)
        self.revoke();self.denied(child);self.denied(nested)

    def test_malformed_child_parentfield_cannot_be_treated_as_valid_hr_link(self):
        line=self.f.load(self.base.name).lines[0];file=self.file('Kandil Request Line',line.name)
        frappe.db.set_value('Kandil Request Line',line.name,'parentfield','not_a_real_table_field')
        self.denied(file)

    def test_missing_intermediate_and_cycles_fail_closed(self):
        orphan=self.file('File','nonexistent-private-file');self.denied(orphan)
        first=self.file();second=self.file('File',first.name)
        frappe.db.set_value('File',first.name,{'attached_to_doctype':'File','attached_to_name':second.name})
        self.denied(first);self.denied(second)

    def test_over_depth_chain_is_not_reclassified_as_unprotected(self):
        parent=self.base.revision_attachment()
        for _ in range(5):parent=self.file('File',parent.name)
        self.denied(parent)

    def test_parent_native_user_permission_applies_to_child_file(self):
        line=self.f.load(self.base.name).lines[0];file=self.file('Kandil Request Line',line.name)
        self.allowed(file,listed=False)
        other=self.base.base.save()['name']
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Kandil Hiring Request',for_value=other,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester']);self.denied(file)

    def test_legacy_unattached_alias_cannot_bypass_protected_content(self):
        root=self.base.revision_attachment();alias=self.file(url=root.file_url)
        self.allowed(root);self.allowed(alias)
        self.revoke();self.denied(root);self.denied(alias)

    def test_intermediate_file_user_permission_cannot_be_skipped(self):
        root=self.base.revision_attachment();middle=self.file('File',root.name);outer=self.file('File',middle.name)
        self.allowed(outer)
        for item in (middle,outer):
            self.f.insert('User Permission',user=self.f.users['requester'],allow='File',for_value=item.name,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester']);self.denied(outer)

    def test_indirect_report_and_prepared_report_remain_restricted(self):
        report=self.file('Report','Recruitment Analytics');chain=self.file('File',report.name)
        self.denied(report);self.denied(chain)
        prepared=frappe.get_doc(dict(doctype='Prepared Report',name=uuid.uuid4().hex,
            report_name='Recruitment Analytics',status='Completed',filters='{}'))
        prepared.db_insert()
        direct=self.file('Prepared Report',prepared.name);child=self.file('File',direct.name)
        self.denied(direct);self.denied(child)

    def test_ordinary_unattached_private_file_is_not_removed_by_hr_scope(self):
        file=self.file();self.allowed(file);self.revoke();self.allowed(file)


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestIndirectFiles))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
        limits=['Synthetic indirect File/child/legacy-alias metadata, detail, download and zip boundaries; HTTP and production capacity remain separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Indirect attachment checks failed')
    return value
