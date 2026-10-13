"""Native rollback proof for Board adapters, evidence custody and permissions."""
import base64
import hashlib
import json
import sys
import unittest
import uuid
from unittest.mock import patch
from pathlib import Path

import frappe

from kandil_hr.portal import board
from kandil_hr.recruitment import api as commands
from kandil_hr.recruitment.test_authority_audit import TestAuthorityAudit
from kandil_hr.recruitment.test_commands import acting_as


class TestBoardPortal(unittest.TestCase):
    def setUp(self):
        self.a=TestAuthorityAudit();self.addCleanup(self.a.doCleanups);self.a.setUp();self.f=self.a.f

    def request(self):return self.a.reach_board(self.a.request())

    def context(self,name,role='sector'):
        with acting_as(self.f.users[role]):return board.context(name)

    def upload(self,doc,role='sector',**extra):
        raw=('Synthetic private Board proof '+uuid.uuid4().hex).encode()
        args=dict(name=doc.name,filename='proof.txt',content=base64.b64encode(raw).decode(),expected_version=str(doc.modified),command_id=uuid.uuid4().hex)
        args.update(extra)
        with acting_as(self.f.users[role]):result=board.upload(**args)
        proof=frappe.get_doc('File',result['file']);path=Path(proof.get_full_path());self.addCleanup(lambda:path.unlink(missing_ok=True))
        return result,args

    def decide(self,doc,role='chair',**extra):
        args=dict(name=doc.name,decision='Approve',step_id=doc.approval_steps[-1].step_key,
            expected_version=str(doc.modified),command_id=uuid.uuid4().hex,comment='Synthetic Board review')
        args.update(extra)
        with acting_as(self.f.users[role]):return board.decide(**args)

    def test_direct_chair_and_vice_can_approve_without_external_fields(self):
        for role in ('chair','vice'):
            doc=self.request();view=self.context(doc.name,role)
            self.assertTrue(view['actions']['direct']);self.assertFalse(view['actions']['record'])
            self.assertEqual(self.decide(doc,role),dict(name=doc.name,operation='decide'))
            after=self.f.load(doc.name)
            self.assertEqual((after.status,after.approval_steps[-1].actor,after.approval_steps[-1].board_member),('Approved',self.f.users[role],self.f.users[role]))

    def test_no_board_or_upload_action_before_ceo_completes(self):
        doc=self.a.request();self.f.submit(doc.name)
        self.assertFalse(self.context(doc.name)['active'])
        with self.f.rejected():self.decide(self.f.load(doc.name))
        with self.f.rejected(frappe.PermissionError):self.upload(self.f.load(doc.name))
        self.assertEqual(self.f.load(doc.name).status,'Pending')

    def test_recording_requires_member_method_note_and_same_private_proof(self):
        doc=self.request();proof,_=self.upload(doc)
        base=dict(board_member=self.f.users['vice'],board_evidence=proof['file'],on_behalf_method='PHONE',on_behalf_note='Vice approved today; recorded by Sector')
        for bad in ({'board_evidence':None},{'board_member':self.f.users['hr']},{'on_behalf_method':'UNKNOWN'},{'on_behalf_note':''}):
            with self.f.rejected((frappe.ValidationError,frappe.PermissionError)):self.decide(doc,'sector',**(base|bad))
        unrelated=self.request();other,_=self.upload(unrelated)
        with self.f.rejected((frappe.ValidationError,frappe.PermissionError)):self.decide(doc,'sector',**(base|{'board_evidence':other['file']}))
        self.decide(doc,'sector',**base)
        history=self.context(doc.name)['history'][0]
        self.assertEqual((history['member'],history['actor'],history['evidence']['name']),(self.f.users['vice'],self.f.users['sector'],proof['file']))
        self.assertEqual(history['method'],'PHONE')

    def test_direct_member_cannot_record_another_member_or_external_fields(self):
        doc=self.request();proof,_=self.upload(doc)
        for args in ({'board_member':self.f.users['vice'],'board_evidence':proof['file'],'on_behalf_method':'EMAIL','on_behalf_note':'Chair says Vice approved'}, {'on_behalf_method':'PHONE'}):
            with self.f.rejected((frappe.ValidationError,frappe.PermissionError)):self.decide(doc,'chair',**args)

    def test_upload_replay_is_minimal_and_different_payload_reuse_denied(self):
        doc=self.request();result,args=self.upload(doc)
        with acting_as(self.f.users['sector']):self.assertEqual(result,board.upload(**args))
        self.assertEqual(set(result),{'name','file'})
        self.assertEqual(frappe.db.count('File',{'attached_to_doctype':doc.doctype,'attached_to_name':doc.name}),1)
        with acting_as(self.f.users['sector']),self.f.rejected():board.upload(**(args|{'filename':'different.txt'}))

    def test_decision_replay_has_one_effect_and_minimal_result(self):
        doc=self.request();proof,_=self.upload(doc)
        args=dict(board_member=self.f.users['vice'],board_evidence=proof['file'],on_behalf_method='MEETING',on_behalf_note='Vice approved during meeting',command_id=uuid.uuid4().hex)
        first=self.decide(doc,'sector',**args);counts=self.f.counts(doc.name)
        self.assertEqual(first,self.decide(doc,'sector',**args));self.assertEqual(counts,self.f.counts(doc.name))
        self.assertEqual(set(first),{'name','operation'})

    def test_proof_is_local_private_and_frozen_hash_recorded(self):
        doc=self.request();proof,_=self.upload(doc);file=frappe.get_doc('File',proof['file'])
        self.assertTrue(file.is_private);self.assertTrue(file.file_url.startswith('/private/files/'))
        self.decide(doc,'sector',board_member=self.f.users['vice'],board_evidence=file.name,on_behalf_method='PAPER',on_behalf_note='Signed Vice decision recorded')
        rows=frappe.get_all('Kandil Command Audit',filters={'target_name':doc.name,'operation':'decide'},pluck='envelope_json')
        evidence=next(json.loads(r)['authority']['evidence_identity'] for r in rows if 'evidence_identity' in json.loads(r)['authority'])
        content=file.get_content();content=content.encode() if isinstance(content,str) else content
        self.assertEqual(evidence,dict(file=file.name,file_name=file.file_name,size=len(content),sha256=hashlib.sha256(content).hexdigest()))

    def test_audit_refuses_malformed_evidence_identity_atomically(self):
        from kandil_hr.recruitment.command_audit import completed_authority
        doc=self.request();proof,_=self.upload(doc);before=self.f.load(doc.name).as_dict();counts=self.f.counts(doc.name)
        for bad in ({'sha256':'bad'}, {'size':True}, {'size':-1}, {'file':'another-file'}, {'extra':'unreviewed'}, {'file_name':None}):
            def changed(doc,authority):
                value=completed_authority(doc,authority)
                value['evidence_identity'].update(bad)
                return value
            with self.f.rejected(ValueError),patch('kandil_hr.recruitment.command_audit.completed_authority',side_effect=changed):
                self.decide(doc,'chair',board_evidence=proof['file'])
            self.assertEqual(self.f.load(doc.name).as_dict(),before)
            self.assertEqual(self.f.counts(doc.name),counts)

    def test_remote_public_and_folder_proof_are_rejected_natively(self):
        doc=self.request();proof,_=self.upload(doc)
        # Explicit corrupt legacy fixtures, each rolled back before the next.
        for bad in ({'is_private':0},{'file_url':'https://example.invalid/proof.pdf'},{'is_folder':1}):
            with self.f.rejected((frappe.ValidationError,frappe.PermissionError)):
                frappe.db.set_value('File',proof['file'],bad)
                self.f.decide(doc.name,'sector',board_member=self.f.users['vice'],board_evidence=proof['file'],on_behalf_method='EMAIL',on_behalf_note='Legacy bad proof')

    def test_immutable_request_attachment_metadata_and_content(self):
        doc=self.request();proof,_=self.upload(doc);original=frappe.get_doc('File',proof['file']);content=original.get_content()
        for bad in ({'file_name':'renamed.txt'},{'is_private':0},{'attached_to_name':self.a.request().name},{'file_url':'https://example.invalid/proof.txt'}):
            with self.f.rejected((frappe.PermissionError,frappe.ValidationError)),acting_as(self.f.users['sector']):
                file=frappe.get_doc('File',proof['file']);file.update(bad);file.save()
        with self.f.rejected(frappe.PermissionError),acting_as(self.f.users['sector']):
            frappe.get_doc('File',proof['file']).save_file(content=b'Changed after upload',overwrite=True)
        self.assertEqual(frappe.get_doc('File',proof['file']).get_content(),content)

    def test_proof_cannot_be_deleted_after_return_and_request_revision(self):
        doc=self.request();proof,_=self.upload(doc)
        content=frappe.get_doc('File',proof['file']).get_content()
        args=dict(decision='Return',board_member=self.f.users['vice'],board_evidence=proof['file'],on_behalf_method='WHATSAPP',on_behalf_note='Vice requested revised quantities',command_id=uuid.uuid4().hex)
        first=self.decide(doc,'sector',**args)
        self.f.call('requester',commands.revise,doc.name,reason='New request revision')
        self.assertEqual(self.f.load(doc.name).approval_steps,[])
        with self.f.rejected(frappe.PermissionError):
            frappe.delete_doc('File',proof['file'],ignore_permissions=True,force=True)
        self.assertTrue(frappe.db.exists('File',proof['file']))
        self.assertEqual(frappe.get_doc('File',proof['file']).get_content(),content)
        with self.f.rejected(frappe.PermissionError):
            frappe.rename_doc('File',proof['file'],'renamed-proof-'+uuid.uuid4().hex,force=True)
        counts=self.f.counts(doc.name)
        self.assertEqual(self.decide(doc,'sector',**args),first)
        self.assertEqual(self.f.counts(doc.name),counts)
        self.assertEqual(self.f.load(doc.name).status,'Draft')

    def test_current_revocation_disabled_member_and_self_interest_deny_actions(self):
        doc=self.request();proof,_=self.upload(doc)
        for mode in ('disabled','scope','interest'):
            with self.f.rejected(frappe.PermissionError):
                if mode=='disabled':
                    user=frappe.get_doc('User',self.f.users['vice']);user.enabled=0;user.save(ignore_permissions=True)
                elif mode=='scope':
                    grant=frappe.get_doc('Kandil Access Grant',{'user':self.f.users['vice'],'company':self.f.company});grant.revoked=1;grant.save(ignore_permissions=True)
                else:frappe.db.set_value(doc.doctype,doc.name,'beneficiary_user',self.f.users['sector'],update_modified=False)
                self.decide(doc,'sector',board_member=self.f.users['vice'],board_evidence=proof['file'],on_behalf_method='PHONE',on_behalf_note='Check current authority')
        self.assertEqual(self.f.load(doc.name).status,'Pending')

    def test_outsider_guest_and_unqualified_reader_cannot_upload_or_read_proof(self):
        doc=self.request();proof,_=self.upload(doc)
        for role in ('hr','requester','outsider'):
            with self.f.rejected(frappe.PermissionError):self.upload(doc,role)
        with acting_as(self.f.users['outsider']),self.f.rejected(frappe.PermissionError):board.files(doc.name)
        with acting_as(self.f.users['outsider']),self.f.rejected(frappe.PermissionError):frappe.get_doc('File',proof['file']).check_permission('read')
        with acting_as('Guest'),self.f.rejected(frappe.PermissionError):board.context(doc.name)

    def test_files_are_paginated_bound_to_request_and_not_a_directory(self):
        doc=self.request();names={self.upload(doc)[0]['file'] for _ in range(3)}
        other=self.request();self.upload(other)
        with acting_as(self.f.users['sector']):
            a=board.files(doc.name,page_length=2);b=board.files(doc.name,page_length=2,start=a['next_start'])
        self.assertTrue(a['has_more']);self.assertFalse(b['has_more'])
        self.assertEqual({r['name'] for r in a['rows']+b['rows']},names)
        self.assertTrue(all(set(r)=={'name','label','url','size'} for r in a['rows']+b['rows']))

    def test_legacy_remote_attachment_is_not_exposed_in_evidence_picker(self):
        doc=self.request();proof,_=self.upload(doc)
        frappe.db.set_value('File',proof['file'],'file_url','https://example.invalid/proof.pdf')
        with acting_as(self.f.users['sector']):
            self.assertEqual(board.files(doc.name)['rows'],[])

    def test_exact_proof_lookup_checks_request_binding_and_current_reader(self):
        doc=self.request();proof,_=self.upload(doc);other=self.request()
        with acting_as(self.f.users['sector']):
            self.assertEqual(board.proof(doc.name,proof['file'])['name'],proof['file'])
            with self.f.rejected(frappe.PermissionError):board.proof(other.name,proof['file'])
        with acting_as(self.f.users['outsider']),self.f.rejected(frappe.PermissionError):
            board.proof(doc.name,proof['file'])

    def test_bounded_upload_and_decision_metadata_fail_without_mutation(self):
        doc=self.request()
        for filename,content in (('../proof.txt',b'x'),('proof.html',b'<html>'),('proof.txt',b'<script>alert(1)</script>'),('proof.png',b'not png'),('proof.txt',b'\xff'),('proof.txt',b'')):
            with self.f.rejected():self.upload(doc,filename=filename,content=base64.b64encode(content).decode())
        with self.f.rejected():self.upload(doc,content='*invalid*')
        with self.f.rejected():self.upload(doc,content='A'*(4*((board.MAX_BYTES+2)//3)+1))
        self.assertEqual(frappe.db.count('File',{'attached_to_name':doc.name}),0)
        for bad in ({'comment':{}},{'board_member':{}},{'on_behalf_note':'x'*2001},{'expected_version':None},{'step_id':{}},{'decision':[]}):
            with self.f.rejected():self.decide(doc,**bad)
        self.assertEqual(self.f.load(doc.name).status,'Pending')


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestBoardPortal))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
        limits=['Native rollback Board adapter and file-custody tests; browser/HTTP, security assessment and external audit custody remain separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Board portal regression failed')
    return value
