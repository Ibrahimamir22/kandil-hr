"""Real-role tree contracts on rollback-only synthetic organization records."""
import json
import unittest
from unittest.mock import patch

import frappe
from frappe.utils import add_days, today

from kandil_hr.organization.api import transition
from kandil_hr.portal import organization_tree as tree
from kandil_hr.portal.test_organization import TestOrganizationPortal
from kandil_hr.recruitment.test_commands import acting_as


class TestOrganizationTree(TestOrganizationPortal):
    def tree(self, role='hr', **kwargs):
        with acting_as(self.f.users[role]):
            return tree.nodes(**kwargs)

    def children(self, count):
        names = []
        with transition():
            for index in range(count):
                position = self.f.insert('Kandil Position', company=self.f.company, department=self.f.department,
                    branch=self.branch, designation=self.f.designation,
                    position_code=self.f.prefix + '-C%03d' % index, title='Synthetic tree node %03d' % index)
                self.f.insert('Kandil Position Hierarchy', company=self.f.company, department=self.f.department,
                    branch=self.branch, position=position.name, parent_position=self.parent, valid_from=today())
                names.append(position.name)
        return names

    def test_tree_roots_and_children_cross_candidate_pages(self):
        added = self.children(105)
        # All children sort before the root: reaching an empty bounded scan is
        # not evidence of no roots. Following its cursor reaches the true root.
        with patch.object(tree, 'SCAN_LIMIT', 100):
            first = self.tree()
            self.assertEqual(first['rows'], [])
            self.assertTrue(first['has_more']);self.assertEqual(first['next_start'], 100)
            second = self.tree(start=first['next_start'])
        self.assertEqual([r['name'] for r in second['rows']], [self.parent])
        self.assertFalse(second['has_more'])
        collected, cursor = [], 0
        while True:
            result = self.tree(parent=self.parent, start=cursor, page_length=20)
            collected.extend(r['name'] for r in result['rows'])
            if not result['has_more']:break
            self.assertGreater(result['next_start'],cursor);cursor=result['next_start']
        self.assertEqual(len(collected),107)
        self.assertEqual(set(collected),set(added+self.f.positions))
        self.assertEqual(len(collected),len(set(collected)))

    def test_tree_scope_redacts_parent_and_guessed_anchor(self):
        self.branch_scope()
        roots=self.tree()
        self.assertEqual([r['name'] for r in roots['rows']],[self.f.positions[0]])
        self.assertEqual(roots['rows'][0]['boundary'],'restricted')
        self.assertNotIn(self.parent,json.dumps(roots,default=str))
        for key in ['parent','focus']:
            for name in [self.parent,self.f.positions[1],'nonexistent']:
                with self.assertRaises(frappe.PermissionError):self.tree(**{key:name})
        self.assertEqual(self.tree(company='Foreign invisible company')['rows'],[])

    def test_tree_filters_promote_visible_boundary_and_focus_ignores_filters(self):
        roots=self.tree(branch=self.branch)
        self.assertEqual([r['name'] for r in roots['rows']],[self.f.positions[0]])
        self.assertEqual(roots['rows'][0]['boundary'],'outside_filter')
        search=self.tree(search=self.f.prefix+'-B')
        self.assertEqual([r['name'] for r in search['rows']],[self.f.positions[1]])
        children=self.tree(parent=self.parent,branch=self.branch)
        self.assertEqual([r['name'] for r in children['rows']],[self.f.positions[0]])
        focused=self.tree(focus=self.parent,search='will not match')
        self.assertEqual([r['name'] for r in focused['rows']],[self.parent])
        self.assertEqual(focused['rows'][0]['boundary'],'focus')

    def test_tree_dates_keep_inclusive_episode_and_current_closed_attributes(self):
        name=frappe.db.get_value('Kandil Position Hierarchy',{'position':self.f.positions[0]},'name')
        frappe.db.set_value('Kandil Position Hierarchy',name,'valid_until',today())
        frappe.db.set_value('Kandil Position',self.f.positions[0],{'status':'Closed','closed_on':today()})
        current=self.tree(parent=self.parent)
        self.assertIn(self.f.positions[0],{r['name'] for r in current['rows']})
        tomorrow=self.tree(as_of=add_days(today(),1))
        self.assertIn(self.f.positions[0],{r['name'] for r in tomorrow['rows']})
        self.assertNotIn(self.f.positions[0],{r['name'] for r in self.tree(parent=self.parent,as_of=add_days(today(),1))['rows']})
        yesterday=self.tree(as_of=add_days(today(),-1))
        self.assertEqual(len(yesterday['rows']),3)
        self.assertEqual(next(r for r in yesterday['rows'] if r['name']==self.f.positions[0])['status'],'Closed')
        self.assertEqual(yesterday['attributes_basis'],'current_records')

    def test_tree_ambiguous_episode_is_boundary_not_duplicate_child(self):
        # Deliberately corrupt only rollback fixture SQL, bypassing model guards,
        # to prove defensive reading of overlapping historical episodes.
        other=frappe.db.get_value('Kandil Position Hierarchy',{'position':self.f.positions[1]},'name')
        frappe.db.set_value('Kandil Position Hierarchy',other,'position',self.f.positions[0])
        roots=self.tree()
        record=next(r for r in roots['rows'] if r['name']==self.f.positions[0])
        self.assertEqual(record['boundary'],'ambiguous')
        self.assertNotIn(self.f.positions[0],{r['name'] for r in self.tree(parent=self.parent)['rows']})

    def test_tree_missing_hierarchy_permission_and_no_business_writes(self):
        before=[frappe.as_json(frappe.get_doc('Kandil Capacity',c).as_dict()) for c in self.f.capacities]
        self.assertFalse(self.tree(role='requester')['available'])
        self.assertEqual(self.tree(role='requester')['rows'],[])
        self.tree();self.tree(parent=self.parent);self.tree(focus=self.f.positions[0])
        after=[frappe.as_json(frappe.get_doc('Kandil Capacity',c).as_dict()) for c in self.f.capacities]
        self.assertEqual(before,after)

    def test_tree_auth_revocation_disable_and_guest(self):
        grant=frappe.get_doc('Kandil Access Grant',self.f.grants['hr']);grant.revoked=1;grant.save(ignore_permissions=True)
        self.assertEqual(self.tree()['rows'],[])
        with self.assertRaises(frappe.PermissionError):self.tree(parent=self.parent)
        user=frappe.get_doc('User',self.f.users['hr']);user.enabled=0;user.save(ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):self.tree()
        with acting_as('Guest'),self.assertRaises(frappe.PermissionError):tree.nodes()

    def test_tree_inputs_minimal_projection_and_native_position_permission(self):
        for args in [dict(as_of='2026-02-31'),dict(status='Unknown'),dict(search='x'*141),dict(parent=self.parent,focus=self.parent)]:
            with self.subTest(args=args),self.assertRaises(frappe.ValidationError):self.tree(**args)
        row=self.tree(focus=self.parent)['rows'][0]
        for field in ['salary','grade_band','employee','user','external_id']:self.assertNotIn(field,row)
        # Actual native User Permission restricts Position beyond Kandil grant.
        self.f.insert('User Permission',user=self.f.users['hr'],allow='Kandil Position',for_value=self.f.positions[0],apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['hr'])
        self.assertEqual([r['name'] for r in self.tree()['rows']],[self.f.positions[0]])
        with self.assertRaises(frappe.PermissionError):self.tree(focus=self.parent)


def run():
    from kandil_hr.foundation.concurrency_runner import _guard
    from kandil_hr.foundation.tests_runner import RecordedResult
    _guard()
    names=[n for n in unittest.defaultTestLoader.getTestCaseNames(TestOrganizationTree) if n.startswith('test_tree_')]
    suite=unittest.TestSuite(TestOrganizationTree(n) for n in names)
    result=unittest.TextTestRunner(verbosity=2,resultclass=RecordedResult).run(suite)
    return dict(result='PASS' if result.wasSuccessful() and not result.skipped and result.testsRun==8 else 'FAIL',
                total=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),tests=result.checks,
                limits=['Rollback-only native role tests; browser navigation, operational load and HR acceptance are separate.'])
