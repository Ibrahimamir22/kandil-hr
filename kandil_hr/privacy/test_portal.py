"""Synthetic transport checks before any site parser sees a bearer body."""
import io
import json
import sys
import unittest
from unittest.mock import Mock, patch
from werkzeug.test import EnvironBuilder, Client
from werkzeug.wrappers import Response, Request
import frappe
from kandil_hr.privacy.wsgi import ConsentBoundary, PUBLIC, MARKER
from kandil_hr.privacy import portal


class TestConsentBoundary(unittest.TestCase):
    def setUp(self):
        self.seen=[]
        def downstream(env,start):
            self.seen.append(env)
            return Response('ok')(env,start)
        self.client=Client(ConsentBoundary(downstream),Response)
    def request(self,**changes):
        args=dict(path=PUBLIC,method='POST',data=b'{"token":"synthetic"}',content_type='application/octet-stream',headers={'Origin':'http://localhost'})
        args.update(changes);return self.client.open(**args)
    def test_valid_envelope_reaches_only_marked_downstream(self):
        self.assertEqual(self.request().status_code,200);self.assertTrue(self.seen[0][MARKER])
    def test_malformed_json_never_reaches_frappe_json_parser(self):
        for content in ('application/json','text/plain','application/x-www-form-urlencoded','multipart/form-data'):
            self.assertEqual(self.request(content_type=content,data='{"token":"test"').status_code,403)
        self.assertFalse(self.seen)
    def test_wrong_methods_origins_queries_and_large_empty_bodies_are_rejected(self):
        for changes in (dict(method='GET'),dict(method='OPTIONS'),dict(headers={}),dict(headers={'Origin':'https://outside.invalid'}),dict(headers={'Origin':'http://localhost','Sec-Fetch-Site':'cross-site'}),dict(query_string='unexpected=1'),dict(data=b'x'*4097),dict(data=b'')):
            self.assertEqual(self.request(**changes).status_code,403)
        self.assertFalse(self.seen)
    def test_rejected_body_is_not_read(self):
        env=EnvironBuilder(path=PUBLIC,method='POST',content_type='application/json',data=b'not json').get_environ()
        stream=Mock();stream.read.side_effect=AssertionError('Body must not be read');env['wsgi.input']=stream
        list(ConsentBoundary(lambda *_: self.fail('Parser reached'))(env,Mock()));stream.read.assert_not_called();self.assertFalse(self.seen)
    def test_unrelated_paths_are_not_restricted_or_marked(self):
        self.assertEqual(self.client.get('/hr-portal').status_code,200);self.assertNotIn(MARKER,self.seen[0])
    def test_feature_is_off_without_transport_marker_even_with_config_flag(self):
        before=getattr(frappe.local,'request',None)
        try:
            frappe.local.request=Request.from_values(path=PUBLIC)
            with patch.dict(frappe.conf,{'kandil_candidate_consent_enabled':1}),patch.object(portal.consent.identity,'enabled',return_value=True),patch.object(frappe,'get_system_settings',return_value=0):
                self.assertFalse(portal.enabled());frappe.local.request.environ[MARKER]=True;self.assertTrue(portal.enabled())
                with patch.object(frappe,'get_system_settings',return_value=1):self.assertFalse(portal.enabled())
        finally:frappe.local.request=before
    def test_service_failure_is_generic_and_raw_body_is_cleared(self):
        from kandil_hr.recruitment.test_commands import acting_as
        before=getattr(frappe.local,'request',None)
        probe='a'*64
        try:
            frappe.local.request=Request.from_values(path=PUBLIC,method='POST',content_type='application/octet-stream',
                headers={'Origin':'http://localhost'},data=json.dumps({'action':'view','token':probe}))
            logger=Mock()
            with acting_as('Guest'),patch.object(portal,'enabled',return_value=True),patch.object(portal,'rate_allow',return_value=True),patch.object(portal.consent,'preview',side_effect=RuntimeError(probe)),patch.object(frappe,'logger',return_value=logger):
                result=portal.respond()
                self.assertEqual(result,{'error':'retry_same_request'})
                self.assertEqual(frappe.local.response['http_status_code'],503)
                self.assertNotIn(probe,str(logger.error.call_args))
                self.assertEqual(frappe.local.request.get_data(),b'')
        finally:
            frappe.local.request=before
            frappe.local.response.pop('http_status_code',None)

    def test_sensitive_responses_have_scoped_headers(self):
        response=Response('ok');portal.headers(Request.from_values(path=PUBLIC),response)
        self.assertIn('no-store',response.headers['Cache-Control']);self.assertEqual(response.headers['Referrer-Policy'],'no-referrer')
        self.assertIn("frame-ancestors 'none'",response.headers['Content-Security-Policy'])
        other=Response('ok');portal.headers(Request.from_values(path='/hr-portal'),other);self.assertNotIn('Content-Security-Policy',other.headers)


def run():
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestConsentBoundary))
    summary=dict(tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful() and not result.skipped,fixtures_rolled_back=True,scope='Transport boundary and activation; browser tests are separate',failed_tests=[t.id() for t,_ in result.failures+result.errors])
    print(json.dumps(summary));return summary
