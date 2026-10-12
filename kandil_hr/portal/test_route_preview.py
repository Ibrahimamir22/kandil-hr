"""Ordinary-role preview contract against the real submission resolver."""
import copy
import json
import re
import unittest
from datetime import timedelta
from unittest.mock import patch

import frappe
from frappe.utils import getdate

from kandil_hr.foundation.clock import today_cairo
from kandil_hr.portal import route_preview
from kandil_hr.portal.test_api import TestPortalAPI
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.test_contracts import TestRecruitmentContracts


class TestRoutePreview(unittest.TestCase):
    def setUp(self):
        self.base = TestPortalAPI(); self.addCleanup(self.base.doCleanups); self.base.setUp(); self.f = self.base.f
        self.contract = TestRecruitmentContracts(); self.contract.f = self.f

    def state(self):
        return dict(counts={dt:frappe.db.count(dt) for dt in ('Kandil Hiring Request','Kandil Approval Step',
            'Kandil Command Receipt','Kandil Request Revision','Kandil Recruitment Event','Kandil Security Event',
            'Kandil Notification Outbox','Job Opening')},
            capacities=[frappe.as_json(frappe.get_doc('Kandil Capacity',n).as_dict()) for n in self.f.capacities],
            requests=[frappe.as_json(self.f.load(n).as_dict()) for n in frappe.get_all('Kandil Hiring Request',filters={'company':self.f.company},pluck='name')])

    def preview(self, payload=None, role='requester', **kwargs):
        before=self.state();writes=[];original=frappe.db.sql
        def sql(query,*args,**kw):
            if re.match(r'\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b',str(query),re.I):writes.append(str(query).split()[0])
            return original(query,*args,**kw)
        with acting_as(self.f.users.get(role,role)),patch.object(frappe.db,'sql',side_effect=sql),patch.object(frappe.db,'commit',side_effect=AssertionError('Preview must not commit')):
            result=route_preview.evaluate(copy.deepcopy(payload if payload is not None else self.base.payload()),**kwargs)
        self.assertEqual(writes,[]);self.assertEqual(self.state(),before)
        return result

    def test_new_multilocation_preview_has_no_effects_and_matches_submission(self):
        payload=self.base.payload();payload['lines'].append(dict(capacity=self.f.capacities[1],requested_qty=3))
        preview=self.preview(payload);self.assertTrue(preview['ready']);self.assertEqual(len(preview['rows']),2)
        saved=self.base.save(copy.deepcopy(payload));self.f.submit(saved['name']);doc=self.f.load(saved['name'])
        self.assertEqual([(s['principal'],s['authority']) for s in preview['steps']],[(s.principal,s.authority) for s in doc.approval_steps])
        self.assertEqual([r['incremental_demand'] for r in preview['rows']],[r.reserved_qty for r in doc.lines])

    def test_saved_unsaved_edits_stale_version_and_ownership(self):
        saved=self.base.save();payload=self.base.payload();payload['lines'][0]['requested_qty']=3
        preview=self.preview(payload,name=saved['name'],expected_version=saved['modified'])
        self.assertEqual(preview['rows'][0]['requested'],3);self.assertEqual(self.f.load(saved['name']).lines[0].requested_qty,2)
        with self.f.rejected(frappe.TimestampMismatchError):self.preview(payload,name=saved['name'],expected_version='2000-01-01')
        with self.f.rejected(frappe.PermissionError):self.preview(payload,role='hr',name=saved['name'],expected_version=saved['modified'])
        self.f.submit(saved['name'])
        with self.f.rejected(frappe.PermissionError):self.preview(payload,name=saved['name'],expected_version=str(self.f.load(saved['name']).modified))

    def test_block_warn_reason_and_independent_exception(self):
        self.contract.configure(1);payload=self.base.payload()
        self.contract.mode('Block');blocked=self.preview(payload);self.assertFalse(blocked['ready'])
        self.assertIn('HEADCOUNT_BLOCKED',[r['code'] for r in blocked['issues']])
        self.contract.mode('Warn');missing=self.preview(payload);self.assertIn('HEADCOUNT_REASON_REQUIRED',[r['code'] for r in missing['issues']])
        payload['exception_reason']='Independent justified extra seat';valid=self.preview(payload)
        self.assertTrue(valid['ready']);self.assertEqual(valid['steps'][0]['authority'],'Headcount Exception')
        self.assertEqual(valid['steps'][0]['principal'],self.f.users['sector'])

    def test_current_occupancy_deducts_reservations_and_openings_without_refresh(self):
        self.contract.configure(10,occupied=3)
        opened=self.f.request((2,));self.f.submit(opened.name);self.f.approve_all(opened.name)
        reserved=self.f.request((1,));self.f.submit(reserved.name)
        row=self.preview()['rows'][0]
        self.assertEqual((row['structural'],row['occupied'],row['open_slots'],row['reserved'],row['available']),(10,3,2,1,4))

    def test_unresolved_imported_occupancy_blocks_without_refreshing_ledger(self):
        frappe.db.set_value('Kandil Capacity',self.f.capacities[0],{'occupied':3,'occupancy_basis':'Legacy Baseline'})
        preview=self.preview();self.assertFalse(preview['ready']);self.assertTrue(preview['rows'][0]['unresolved'])
        self.assertIn('OCCUPANCY_UNRESOLVED',[r['code'] for r in preview['issues']])

    def test_vacant_manager_level_is_explained(self):
        frappe.db.set_value('User',self.f.users['manager'],'enabled',0);frappe.clear_cache(user=self.f.users['manager'])
        preview=self.preview();self.assertTrue(preview['ready']);self.assertEqual([r['authority'] for r in preview['steps']],['HR Approval'])
        self.assertEqual(preview['skipped'][0]['reason'],'VACANT_AUTHORITY')

    def test_hr_personal_interest_requires_independent_ceo(self):
        self.contract.ceo();preview=self.preview(role='hr');self.assertTrue(preview['ready'])
        self.assertIn('CEO Approval',[s['authority'] for s in preview['steps']]);self.assertNotIn(self.f.users['hr'],[s['principal'] for s in preview['steps']])
        self.assertTrue(any(s['reason']=='PERSONAL_INTEREST' and s['authority']=='HR Approval' for s in preview['skipped']))
        self.assertTrue(all('principal' not in s for s in preview['skipped']))

    def test_missing_or_disabled_ceo_fails_closed(self):
        preview=self.preview(role='hr');self.assertFalse(preview['ready']);self.assertEqual(preview['steps'],[])
        self.assertEqual(preview['issues'][0]['code'],'ROUTE_CONFIGURATION')
        ceo=self.contract.ceo();frappe.db.set_value('User',ceo,'enabled',0);frappe.clear_cache(user=ceo)
        disabled=self.preview(role='hr');self.assertFalse(disabled['ready']);self.assertEqual(disabled['steps'],[])

    def test_dated_authority_rule_effective_boundary(self):
        ceo=self.contract.ceo();at=getdate(today_cairo())
        rule=self.f.insert('Kandil Authority Rule',company=self.f.company,department=self.f.department,authority='CEO Approval',principal=ceo,
            from_date=at+timedelta(days=1),reason='Synthetic dated route',enabled=1)
        self.assertNotIn('CEO Approval',[s['authority'] for s in self.preview()['steps']])
        rule.from_date=at;rule.to_date=at;rule.save(ignore_permissions=True)
        self.assertIn('CEO Approval',[s['authority'] for s in self.preview()['steps']])
        rule.from_date=at-timedelta(days=2);rule.to_date=at-timedelta(days=1);rule.save(ignore_permissions=True)
        self.assertNotIn('CEO Approval',[s['authority'] for s in self.preview()['steps']])

    def test_scope_revocation_native_reference_permission_and_guest(self):
        self.assertTrue(self.preview()['ready']);self.base.replace_requester_grant(can_manage_recruitment=0)
        with self.f.rejected(frappe.PermissionError):self.preview()
        with self.f.rejected(frappe.PermissionError):self.preview(role='Guest')
        self.base.replace_requester_grant(can_manage_recruitment=1)
        self.f.insert('User Permission',user=self.f.users['requester'],allow='Kandil Position',for_value=self.f.positions[1],apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester'])
        with self.f.rejected(frappe.PermissionError):self.preview()

    def test_cross_branch_and_payload_forgery_denied(self):
        self.base.replace_requester_grant(branch=frappe.db.get_value('Kandil Capacity',self.f.capacities[0],'branch'))
        payload=self.base.payload();payload['lines'].append(dict(capacity=self.f.capacities[1],requested_qty=1))
        with self.f.rejected(frappe.PermissionError):self.preview(payload)
        for extra in ({'requested_by':self.f.users['hr']},{'route_snapshot':'{}'},{'status':'Approved'},{'title':None}):
            with self.f.rejected():self.preview(self.base.payload()|extra)

    def test_stale_preview_cannot_authorize_later_shortage(self):
        payload=self.base.payload();self.assertTrue(self.preview(payload)['ready'])
        self.contract.configure(1);self.contract.mode('Block')
        saved=self.base.save(copy.deepcopy(payload));before=self.f.counts(saved['name'])
        denied=self.f.submit(saved['name']);self.assertEqual(denied['outcome'],'denied')
        self.assertEqual(self.f.counts(saved['name']),before);self.assertEqual(self.f.load(saved['name']).status,'Draft')
        self.f.ledger((0,0),(0,0))

    def test_required_approver_revocation_is_an_actionable_route_blocker(self):
        self.assertTrue(self.preview()['ready'])
        grant=frappe.get_doc('Kandil Access Grant',self.f.grants['manager']);grant.revoked=1;grant.save(ignore_permissions=True)
        result=self.preview();self.assertFalse(result['ready']);self.assertEqual(result['steps'],[])
        self.assertIn('ROUTE_CONFIGURATION',[r['code'] for r in result['issues']])

    def test_amendment_counts_only_increment_above_approved_parent(self):
        from kandil_hr.recruitment import api
        self.contract.configure(3)
        parent=self.f.request((2,));self.f.submit(parent.name);self.f.approve_all(parent.name)
        amended=self.f.call('requester',api.amend,parent.name,reason='One additional seat')
        doc=self.f.load(amended['name']);payload=self.base.payload();payload['lines'][0]['requested_qty']=3
        row=self.preview(payload,name=doc.name,expected_version=str(doc.modified))['rows'][0]
        self.assertEqual((row['requested'],row['incremental_demand'],row['available'],row['shortage']),(3,1,1,0))

    def test_critical_ceo_then_board_route_matches_frozen_submission(self):
        ceo=self.contract.ceo()
        board=self.f.insert('User',email=self.f.prefix.lower()+'-chair@example.invalid',first_name='Synthetic Board',
            enabled=1,send_welcome_email=0,user_type='System User',roles=[dict(role='Kandil Board Approver')]).name
        self.f.insert('Kandil Access Grant',user=board,company=self.f.company,department=self.f.department,
            valid_from=today_cairo(),can_manage_recruitment=1,reason='Synthetic Board preview')
        settings=frappe.get_doc('Kandil Organization Settings',self.f.company);settings.board_approver=board;settings.save(ignore_permissions=True)
        self.f.route.ceo_approver=ceo;self.f.route.board_approver=board;self.f.route.ceo_for_critical=1;self.f.route.board_after_ceo=1;self.f.route.save(ignore_permissions=True)
        payload=self.base.payload()|{'requested_priority':'Critical'};preview=self.preview(payload)
        self.assertEqual([s['authority'] for s in preview['steps']][-2:],['CEO Approval','Board Approval'])
        saved=self.base.save(copy.deepcopy(payload));self.f.submit(saved['name']);doc=self.f.load(saved['name'])
        self.assertEqual([(s['principal'],s['authority']) for s in preview['steps']],[(s.principal,s.authority) for s in doc.approval_steps])


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    import sys
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires opted-in parity CLI')
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(TestRoutePreview)
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(suite)
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
               limits=['Rollback-scoped synthetic native tests; browser/HTTP and full S3 acceptance are separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Route preview regression failed')
    return value
