"""Saved-version navigation and exact submitted/pre-decision comparison."""
import json
import sys
import unittest

import frappe

from kandil_hr.portal import request_revisions as revisions
from kandil_hr.portal import request_history as history
from kandil_hr.portal.test_api import TestPortalAPI
from kandil_hr.recruitment import api
from kandil_hr.recruitment.test_commands import acting_as


class TestRequestRevisions(unittest.TestCase):
    def setUp(self):
        self.base = TestPortalAPI()
        self.addCleanup(self.base.doCleanups)
        self.base.setUp()
        self.f = self.base.f
        self.name = self.base.save()['name']
        self.f.submit(self.name)
        self.original = frappe.get_all(revisions.DT, filters={'request': self.name}, fields=['name', 'snapshot_json'])[0]

    def read(self, revision_id=None):
        with acting_as(self.f.users['requester']):
            return revisions.revision(self.name, revision_id or self.original.name)

    def listing(self, **kwargs):
        with acting_as(self.f.users['requester']):
            return revisions.revisions(self.name, **kwargs)

    def event(self, operation):
        return frappe.get_all(history.AUDIT, filters={'target_name': self.name, 'operation': operation},
                              fields=['name', 'envelope_json'], order_by='creation desc')[0]

    def compare(self, event_id, revision_id=None):
        with acting_as(self.f.users['requester']):
            return revisions.compare(self.name, revision_id or self.original.name, event_id)

    def test_saved_submission_uses_exact_recorded_branch(self):
        value = self.read()
        self.assertEqual(value['location_source'], 'exact_command_capture')
        self.assertEqual(value['snapshot']['location_capture'], 'complete')
        self.assertEqual(value['snapshot']['revision'], 1)
        branch = frappe.db.get_value('Kandil Capacity', self.f.capacities[0], 'branch')
        self.assertEqual(value['snapshot']['position_branch'], branch)
        self.base.replace_requester_grant(branch=branch)
        self.assertEqual(self.read(), value)

    def test_multiple_actions_in_one_revision_have_distinct_saved_records(self):
        self.f.decide(self.name, 'manager')
        rows = self.listing()['rows']
        self.assertEqual(len(rows), 2)
        self.assertEqual({r['revision'] for r in rows}, {1})
        self.assertEqual(len({r['name'] for r in rows}), 2)
        self.assertIn('Submitted', {r['action'] for r in rows})

    def test_amendment_creation_preserves_original_approved_saved_version(self):
        self.f.approve_all(self.name)
        saved=frappe.get_all(revisions.DT,filters={'request':self.name},fields=['name','snapshot_json'],order_by='creation desc')[0]
        original=self.read(saved.name)
        self.assertEqual(original['snapshot']['status'],'Approved')
        for index in range(2):
            child=self.f.call('requester',api.amend,self.name,reason='Revision navigation regression')['name']
            self.assertEqual(self.read(saved.name),original)
            self.assertIn(saved.name,{r['name'] for r in self.listing()['rows']})
            self.f.call('requester',api.cancel_request,child,reason='Withdraw synthetic amendment')
        self.assertEqual(frappe.db.get_value(revisions.DT,saved.name,'snapshot_json'),saved.snapshot_json)

    def test_original_submission_versus_actual_hr_reviewed_quantities(self):
        self.f.decide(self.name, 'manager')
        self.f.call('hr', api.review, self.name, quantities={self.f.load(self.name).lines[0].name: 1}, priority='Normal', reason='One needed')
        self.f.decide(self.name, 'hr', comment='Reviewed one seat')
        result = self.compare(self.event('decide').name)
        self.assertEqual(result['before']['lines'][0]['requested_qty'], 2)
        self.assertEqual(result['before']['lines'][0]['proposed_qty'], 2)
        self.assertEqual(result['after']['lines'][0]['requested_qty'], 2)
        self.assertEqual(result['after']['lines'][0]['proposed_qty'], 1)
        self.assertEqual(result['after']['approval_steps'][-1]['decision'], 'Pending')
        self.assertEqual(result['outcome'], 'Approved')
        self.assertEqual(result['decision'], 'Approved')
        self.assertTrue(result['same_revision'])

    def test_return_revise_keeps_old_snapshot_and_cross_revision_label(self):
        old = self.read()
        self.f.decide(self.name, 'manager', decision='Return', comment='Clarify')
        self.f.call('requester', api.revise, self.name, reason='Clarified')
        with acting_as(self.f.users['requester']):
            doc = self.f.load(self.name); doc.title = 'A revised title'; doc.save()
        self.f.submit(self.name); self.f.decide(self.name, 'manager')
        self.assertEqual(self.read(), old)
        result = self.compare(self.event('decide').name)
        self.assertFalse(result['same_revision'])
        self.assertEqual(result['before']['revision'], 1)
        self.assertEqual(result['after']['revision'], 2)
        self.assertEqual(result['after']['title'], 'A revised title')

    def test_record_ids_bound_to_request_and_non_decisions_rejected(self):
        other = self.base.save()['name']; self.f.submit(other)
        alien = frappe.get_all(revisions.DT, filters={'request': other}, pluck='name')[0]
        with self.f.rejected(frappe.PermissionError): self.read(alien)
        with self.f.rejected(frappe.PermissionError): self.read('nonexistent-revision')
        with self.f.rejected(frappe.PermissionError): self.compare(self.event('submit').name)
        alien_event = frappe.get_all(history.AUDIT, filters={'target_name': other}, pluck='name')[0]
        with self.f.rejected(frappe.PermissionError): self.compare(alien_event)

    def test_missing_exact_capture_stays_partial_never_uses_current_branch(self):
        row = self.event('submit'); value = json.loads(row.envelope_json)
        value['after']['title'] = 'Similar timestamp is not an exact capture'
        frappe.db.set_value(history.AUDIT, row.name, 'envelope_json', json.dumps(value))
        result = self.read()
        self.assertEqual(result['location_source'], 'legacy_uncaptured')
        self.assertIsNone(result['snapshot']['position_branch'])
        self.assertEqual(result['snapshot']['location_capture'], 'partial')
        self.base.replace_requester_grant(branch=frappe.db.get_value('Kandil Capacity', self.f.capacities[0], 'branch'))
        with self.f.rejected(frappe.PermissionError): self.read()
        self.assertEqual(self.listing()['rows'], [])

    def test_historical_scope_and_current_user_permission_both_apply(self):
        other_branch = frappe.db.get_value('Kandil Capacity', self.f.capacities[1], 'branch')
        frappe.db.set_value('Kandil Position', self.f.positions[0], 'branch', other_branch)
        frappe.db.set_value('Kandil Capacity', self.f.capacities[0], 'branch', other_branch)
        self.base.replace_requester_grant(branch=other_branch)
        with self.f.rejected(frappe.PermissionError): self.read()
        self.assertEqual(self.listing()['rows'], [])
        self.base.replace_requester_grant(branch='')
        self.f.insert('User Permission', user=self.f.users['requester'], allow='Kandil Position', for_value=self.f.positions[1], apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester'])
        with self.f.rejected(frappe.PermissionError): self.read()

    def test_revoked_access_and_guest_fail_closed(self):
        grant = frappe.get_doc('Kandil Access Grant', self.f.grants['requester']); grant.revoked=1; grant.save(ignore_permissions=True)
        with self.f.rejected(frappe.PermissionError): self.read()
        with self.f.rejected(frappe.PermissionError): self.listing()
        with acting_as('Guest'), self.f.rejected(frappe.PermissionError): revisions.revisions(self.name)

    def test_malformed_or_mismatched_revision_is_not_returned(self):
        original = json.loads(self.original.snapshot_json)
        for value in ('invalid json', '[]', json.dumps(original | {'revision': 99}), json.dumps(original | {'name':'another-request'})):
            frappe.db.set_value(revisions.DT, self.original.name, 'snapshot_json', value)
            with self.f.rejected(frappe.PermissionError): self.read()
            self.assertEqual(self.listing()['rows'], [])

    def test_restricted_references_and_private_fields_do_not_escape_projection(self):
        value = json.loads(self.original.snapshot_json)
        employee = frappe.db.get_value('Employee', {'user_id': self.f.users['manager']}, 'name')
        value['replacement_employee'] = employee
        value['private_salary'] = 'NEVER EXPOSE'
        frappe.db.set_value(revisions.DT, self.original.name, 'snapshot_json', json.dumps(value))
        self.base.replace_requester_grant(can_manage_recruitment=0, can_view_sensitive=0)
        result = self.read()
        self.assertTrue(result['snapshot']['replacement_restricted'])
        self.assertNotIn(employee, json.dumps(result, default=str))
        self.assertNotIn('NEVER EXPOSE', json.dumps(result, default=str))
        for key in ('snapshot_json','envelope_json','submitted_snapshot','reviewed_snapshot','route_snapshot'):
            self.assertNotIn('"'+key+'"', json.dumps(result, default=str))

    def test_broken_nested_capture_is_denied_without_server_error(self):
        original = json.loads(self.original.snapshot_json)
        for change in ({'route_snapshot': 'not-json'}, {'route_snapshot': '{"policy":42}'}, {'lines': [42]}, {'approval_steps': [42]}):
            frappe.db.set_value(revisions.DT, self.original.name, 'snapshot_json', json.dumps(original | change))
            with self.f.rejected(frappe.PermissionError): self.read()
            self.assertEqual(self.listing()['rows'], [])

    def test_ordinary_manager_and_hr_can_browse_permitted_saved_versions(self):
        for role in ('manager', 'hr'):
            with acting_as(self.f.users[role]):
                result = revisions.revision(self.name, self.original.name)
                self.assertEqual(result['snapshot']['revision'], 1)
                self.assertEqual(revisions.revisions(self.name)['rows'][0]['name'], self.original.name)

    def test_history_lookup_indexes_are_installed(self):
        for kind, index, expected in (
            ('Kandil Command Audit', 'request_command_history', ['target_doctype', 'target_name', 'company', 'occurred_at', 'name']),
            ('Kandil Request Revision', 'request_saved_history', ['request', 'company', 'creation', 'name']),
        ):
            rows = frappe.db.sql(f"SHOW INDEX FROM `tab{kind}`", as_dict=True)
            columns = [r.Column_name for r in sorted(rows, key=lambda r:r.Seq_in_index) if r.Key_name == index]
            self.assertEqual(columns, expected)

    def test_pagination_and_no_read_mutation(self):
        self.f.decide(self.name, 'manager', decision='Return', comment='Clarify')
        first = self.listing(page_length=1); second = self.listing(start=first['next_start'], page_length=1)
        self.assertTrue(first['has_more']); self.assertFalse(second['has_more'])
        self.assertEqual(len({r['name'] for r in first['rows']+second['rows']}), 2)
        self.assertEqual(self.listing(page_length=999)['next_start'], 100)
        before = self.f.counts(self.name)
        self.read(); self.compare(self.event('decide').name)
        self.assertEqual(self.f.counts(self.name), before)
        self.assertEqual(frappe.db.get_value(revisions.DT, self.original.name, 'snapshot_json'), self.original.snapshot_json)


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site != 'kandil-parity.localhost' or frappe.session.user != 'Administrator' or getattr(frappe.local, 'request', None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    result = unittest.TextTestRunner(stream=sys.stderr, verbosity=2, resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestRequestRevisions))
    value = dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL', total=result.testsRun, checks=result.checks,
                 limits=['Synthetic native adapter checks; actual AR/EN browser and broader authority-history acceptance are separate.'])
    print(json.dumps(value))
    if value['result'] != 'PASS': raise AssertionError('Request revision adapter failed')
    return value
