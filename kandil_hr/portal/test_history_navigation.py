"""Frozen route explanations, amendment navigation and authority history."""
import json
import sys
import unittest

import frappe
from kandil_hr.foundation.clock import today_cairo
from kandil_hr.portal import request_history as history, request_links as links
from kandil_hr.portal.history_rationale import rationale
from kandil_hr.portal import request_revisions as revisions
from kandil_hr.recruitment import api
from kandil_hr.recruitment.test_authority_audit import TestAuthorityAudit
from kandil_hr.recruitment.test_commands import acting_as


class TestHistoryNavigation(unittest.TestCase):
    def setUp(self):
        self.a=TestAuthorityAudit(); self.addCleanup(self.a.doCleanups); self.a.setUp(); self.f=self.a.f

    def related(self, name, role='requester', **kwargs):
        with acting_as(self.f.users[role]): return links.related(name, **kwargs)

    def event(self, name, operation='submit', actor=None, role='requester'):
        filters={'target_name':name,'operation':operation}
        if actor: filters['actor']=self.f.users[actor]
        key=frappe.get_all(history.AUDIT,filters=filters,pluck='name',order_by='creation desc')[0]
        with acting_as(self.f.users[role]): return history.event(name,key)

    def approved(self):
        doc=self.a.request(board=False); self.f.submit(doc.name); self.f.approve_all(doc.name); return doc.name

    def amendment(self, name):
        return self.f.call('requester',api.amend,name,reason='Updated staffing need')['name']

    def test_original_and_amendment_navigation_uses_current_records(self):
        name=self.approved(); child=self.amendment(name)
        parent=self.related(name); amended=self.related(child)
        self.assertIsNone(parent['parent']); self.assertFalse(parent['parent_restricted'])
        self.assertEqual(parent['amendments'][0]['name'],child)
        self.assertEqual(amended['parent']['name'],name)
        self.assertEqual(amended['parent']['status'],'Approved')
        self.assertEqual(set(parent['amendments'][0]),set(links.FIELDS))
        self.assertEqual(self.related(name,page_length=999)['next_start'],100)

    def test_inaccessible_parent_identifier_and_title_are_not_returned(self):
        name=self.approved(); child=self.amendment(name)
        other=self.f.insert('Department',department_name=self.f.prefix+' hidden parent',company=self.f.company).name
        frappe.db.set_value(links.DT,name,'department',other)
        result=self.related(child)
        self.assertIsNone(result['parent']); self.assertTrue(result['parent_restricted'])
        self.assertNotIn(name,json.dumps(result,default=str))
        self.assertNotIn(self.f.load(name).title,json.dumps(result,default=str))

    def test_outside_scope_guest_and_revocation_deny_navigation(self):
        name=self.approved(); self.amendment(name)
        with self.f.rejected(frappe.PermissionError): self.related(name,'outsider')
        with acting_as('Guest'),self.f.rejected(frappe.PermissionError): links.related(name)
        grant=frappe.get_doc('Kandil Access Grant',self.f.grants['requester']);grant.revoked=1;grant.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError): self.related(name)

    def test_link_pages_and_reads_preserve_effects(self):
        name=self.approved(); first=self.amendment(name)
        self.f.call('requester',api.cancel_request,first,reason='Withdraw draft')
        second=self.amendment(name)
        before=self.f.counts(name)
        page=self.related(name,page_length=1); next_page=self.related(name,start=page['next_start'],page_length=1)
        self.assertTrue(page['has_more']); self.assertFalse(next_page['has_more'])
        self.assertEqual({page['amendments'][0]['name'],next_page['amendments'][0]['name']},{first,second})
        self.assertEqual(self.f.counts(name),before)

    def test_personal_interest_reason_is_frozen_without_excluded_identities(self):
        doc=self.a.request(board=False)
        with acting_as(self.f.users['requester']):
            doc.beneficiary_user=self.f.users['manager']; doc.save()
        self.f.submit(doc.name)
        value=self.event(doc.name)['after']['rationale']
        self.assertIn(dict(authority='Department Approval',reason='PERSONAL_INTEREST'),value['skipped'])
        self.assertEqual(value['interest_checked_on'],str(today_cairo()))
        self.assertNotIn(self.f.users['manager'],json.dumps(value))
        self.assertNotIn('users',json.dumps(value)); self.assertNotIn('assignment',json.dumps(value))
        self.f.route.ceo_for_critical=0;self.f.route.save()
        self.assertEqual(self.event(doc.name)['after']['rationale'],value)

    def test_dated_rule_reason_and_dates_are_original_not_current_policy(self):
        rule=self.f.insert('Kandil Authority Rule',company=self.f.company,department=self.f.department,
                           authority='CEO Approval',principal=self.f.users['ceo'],from_date=today_cairo(),enabled=1,reason='Original special review')
        doc=self.a.request(board=False);self.f.submit(doc.name)
        value=self.event(doc.name)['after']['rationale']
        self.assertEqual(value['rules'][0]['reason'],'Original special review')
        self.assertEqual(value['rules'][0]['from_date'],str(today_cairo()))
        rule.reason='Different current rule';rule.save(ignore_permissions=True)
        self.assertEqual(self.event(doc.name)['after']['rationale'],value)
        self.assertNotIn(rule.name,json.dumps(value));self.assertNotIn(self.f.users['ceo'],json.dumps(value))

    def test_unknown_and_malformed_skip_capture_is_not_relabelled(self):
        self.assertIsNone(rationale({}))
        value=rationale({'resolved':{'skipped':[{'authority':'Department Approval','reason':'Future reason','principal':'hidden'}]}})
        self.assertEqual(value['skipped'][0]['reason'],'UNRECOGNIZED_CAPTURE')
        self.assertNotIn('hidden',json.dumps(value))
        for route in ([],{'resolved':[]},{'skipped':[42]},{'policy':{'authority_rules':42}},
                      {'policy':{'authority_rules':[{'reason':{'hidden':'value'}}]}},
                      {'skipped':[{'authority':{'hidden':'identity'}}]},{'interest_snapshot':[42]}):
            with self.f.rejected(frappe.PermissionError):rationale(route)

    def test_delegated_decision_retains_actor_separately_from_principal(self):
        with acting_as(self.f.users['sector']):
            frappe.get_doc(dict(doctype='Kandil Delegation',company=self.f.company,department=self.f.department,
                from_user=self.f.users['manager'],to_user=self.f.users['delegate'],from_date=today_cairo(),to_date=today_cairo(),
                process_scope='APPROVALS',reason='Independent delegate')).insert()
        doc=self.a.request(board=False);self.f.submit(doc.name);self.f.decide(doc.name,'delegate')
        value=self.event(doc.name,'decide','delegate')
        self.assertEqual(value['event']['actor'],self.f.users['delegate'])
        self.assertEqual(value['event']['principal'],self.f.users['manager'])
        self.assertEqual(value['before']['approval_steps'][0]['decision'],'Pending')
        self.assertEqual(value['after']['approval_steps'][0]['actor'],self.f.users['delegate'])

    def test_ceo_and_external_board_decision_history_preserves_proof(self):
        doc=self.a.reach_board(self.a.request())
        ceo=self.event(doc.name,'decide','ceo',role='ceo')
        self.assertEqual(ceo['after']['approval_steps'][-2]['decision'],'Approved')
        proof=self.a.proof(doc)
        self.f.decide(doc.name,'sector',board_member=self.f.users['vice'],board_evidence=proof.name,
                      on_behalf_method='MEETING',on_behalf_note='Vice reviewed the recorded request')
        value=self.event(doc.name,'decide','sector',role='chair')
        self.assertEqual(value['event']['actor'],self.f.users['sector'])
        self.assertEqual(value['event']['principal'],self.f.users['vice'])
        step=value['after']['approval_steps'][-1]
        self.assertEqual(step['board_member'],self.f.users['vice']);self.assertEqual(step['proof']['name'],proof.name)
        submitted=frappe.get_all('Kandil Request Revision',filters={'request':doc.name,'action':'Submitted'},pluck='name')[0]
        with acting_as(self.f.users['chair']):
            compare=revisions.compare(doc.name,submitted,value['event']['name'])
        self.assertEqual(compare['decision'],'Approved');self.assertEqual(compare['event']['principal'],self.f.users['vice'])

    def test_approver_capacity_read_keeps_role_and_location_boundaries(self):
        from kandil_hr.foundation.approver_capacity_access import execute
        execute(); execute()  # migration is idempotent
        for role in ('ceo','chair','vice'):
            with acting_as(self.f.users[role]):
                cap=frappe.get_doc('Kandil Capacity',self.f.capacities[0])
                self.assertTrue(cap.has_permission('read'))
                for permission in ('write','create','delete','export'):
                    self.assertFalse(cap.has_permission(permission),(role,permission))
                self.assertEqual(len(frappe.get_list('Kandil Capacity',filters={'company':self.f.company})),2)
            grant=frappe.get_doc('Kandil Access Grant',{'user':self.f.users[role],'company':self.f.company})
            grant.revoked=1;grant.save(ignore_permissions=True)
            grant=self.f.insert('Kandil Access Grant',user=self.f.users[role],company=self.f.company,
                department=self.f.department,branch=frappe.db.get_value('Kandil Capacity',self.f.capacities[0],'branch'),
                valid_from=today_cairo(),can_manage_recruitment=1,reason='Narrowed synthetic scope')
            with acting_as(self.f.users[role]):
                self.assertFalse(frappe.get_doc('Kandil Capacity',self.f.capacities[1]).has_permission('read'))
                self.assertEqual(len(frappe.get_list('Kandil Capacity',filters={'company':self.f.company})),1)
            grant.revoked=1;grant.save(ignore_permissions=True)
            with acting_as(self.f.users[role]):
                self.assertFalse(cap.has_permission('read'))
                self.assertEqual(frappe.get_list('Kandil Capacity',filters={'company':self.f.company}),[])

    def test_board_history_obeys_native_user_permissions(self):
        doc=self.a.reach_board(self.a.request())
        with acting_as(self.f.users['chair']):
            self.assertTrue(history.events(doc.name)['rows'])
        self.f.insert('User Permission',user=self.f.users['chair'],allow='Kandil Capacity',
                      for_value=self.f.capacities[0],apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['chair'])
        with acting_as(self.f.users['chair']),self.f.rejected(frappe.PermissionError):
            history.events(doc.name)


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestHistoryNavigation))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
               limits=['Native synthetic route/navigation and authority history checks; browser authority coverage and full S3 acceptance remain separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('History navigation failed')
    return value
