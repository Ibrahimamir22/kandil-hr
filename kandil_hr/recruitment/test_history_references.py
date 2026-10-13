"""Frozen routing reference policy: exact bytes when allowed, scoped denial otherwise."""
import copy
import json
import sys
import unittest
import uuid

import frappe
from frappe.client import get
from kandil_hr.recruitment.test_history_access import TestHistoryAccess
from kandil_hr.recruitment.test_commands import acting_as


class TestHistoryReferences(unittest.TestCase):
    def setUp(self):
        self.base=TestHistoryAccess();self.addCleanup(self.base.doCleanups);self.base.setUp()
        self.f=self.base.f;self.value=json.loads(self.base.revision.snapshot_json)
        self.route=json.loads(self.value['route_snapshot'])

    def store(self):
        self.value['route_snapshot']=json.dumps(self.route)
        self.raw=json.dumps(self.value)
        frappe.db.set_value('Kandil Request Revision',self.base.revision.name,'snapshot_json',self.raw)

    def permission(self,kind,values):
        for value in values:
            self.f.insert('User Permission',user=self.f.users['requester'],allow=kind,for_value=value,apply_to_all_doctypes=1)
        frappe.clear_cache(user=self.f.users['requester'])

    def portal_readable(self):
        from kandil_hr.portal.api import detail
        with acting_as(self.f.users['requester']):self.assertEqual(detail(self.base.name)['request']['name'],self.base.name)

    def legacy_copy(self,kind,name):
        # Guarded synthetic legacy fixture only. No native workflow is bypassed
        # by the user being tested and every row is transactionally rolled back.
        doc=frappe.get_doc(kind,name).as_dict();doc['name']='history-ref-'+uuid.uuid4().hex
        clone=frappe.get_doc(doc);clone.db_insert();return clone

    def actor(self):
        user=self.f.insert('User',email=self.f.prefix.lower()+'-former@example.invalid',first_name='Former synthetic actor',
                           enabled=1,send_welcome_email=0,user_type='System User',roles=[{'role':'Kandil Requester'}])
        return user.name

    def test_original_route_remains_readable_without_assignment_or_rule_profile_access(self):
        self.assertFalse(frappe.has_permission('Kandil Position Assignment','read',user=self.f.users['requester']))
        for role in ('requester','manager','hr'):
            self.assertEqual(self.base.read(role)['snapshot_json'],self.base.revision.snapshot_json)

    def test_history_survives_current_policy_change_ended_assignment_and_disabled_actor(self):
        step=self.route['resolved']['steps'][0]
        frappe.db.set_value('Kandil Recruitment Route',self.f.route.name,'ceo_for_critical',0)
        frappe.db.set_value('Kandil Position Assignment',step['assignment'],'valid_until','2000-01-01')
        frappe.db.set_value('User',step['principal'],'enabled',0)
        self.assertEqual(self.base.read()['snapshot_json'],self.base.revision.snapshot_json)

    def test_skipped_position_respects_native_permissions(self):
        self.route['resolved']['skipped']=[dict(position=self.f.positions[1],authority='Department Approval',reason='Vacant or no enabled linked user')]
        self.store();self.assertEqual(self.base.read()['snapshot_json'],self.raw)
        self.permission('Kandil Position',[self.f.positions[0],self.route['resolved']['steps'][0]['position']])
        self.portal_readable();self.base.denied()

    def test_assignment_reference_respects_native_user_permission(self):
        original=self.route['resolved']['steps'][0]['assignment']
        other=self.legacy_copy('Kandil Position Assignment',original)
        self.permission('Kandil Position Assignment',[other.name])
        self.portal_readable();self.base.denied()

    def test_assignment_must_match_recorded_position_and_principal(self):
        for field,value in [('position',self.f.positions[1]),('principal',self.f.users['hr'])]:
            original=copy.deepcopy(self.route)
            self.route['resolved']['steps'][0][field]=value;self.store();self.base.denied()
            self.route=original

    def test_config_reference_respects_native_user_permission(self):
        other=self.legacy_copy('Kandil Recruitment Route',self.f.route.name)
        self.permission('Kandil Recruitment Route',[other.name]);self.portal_readable();self.base.denied()

    def rule(self):
        # A recorded public rule carries its original values. Read policy must
        # not demand today's principal role or a grant to its full configuration.
        name='history-rule-'+uuid.uuid4().hex
        doc=frappe.get_doc(dict(doctype='Kandil Authority Rule',name=name,company=self.f.company,
                               department=self.f.department,position=self.f.positions[0],principal=self.f.users['manager'],
                               authority='CEO Approval',from_date='2000-01-01',enabled=0))
        doc.db_insert()
        self.route['policy']['authority_rules']=[dict(name=name,modified=str(doc.modified),from_date='2000-01-01',
            to_date=None,authority='CEO Approval',principal=self.f.users['manager'],reason='Recorded synthetic rule')]
        self.store();return doc

    def test_captured_rule_allows_reference_without_configuration_access_but_obeys_user_permission(self):
        rule=self.rule();other=self.legacy_copy('Kandil Authority Rule',rule.name)
        self.assertFalse(frappe.has_permission('Kandil Authority Rule','read',user=self.f.users['requester']))
        self.assertEqual(self.base.read()['snapshot_json'],self.raw)
        self.permission('Kandil Authority Rule',[other.name]);self.portal_readable();self.base.denied()

    def test_rule_cannot_borrow_another_departments_identity(self):
        rule=self.rule();other=self.f.insert('Department',department_name=self.f.prefix+' other rule unit',company=self.f.company)
        frappe.db.set_value('Kandil Authority Rule',rule.name,'department',other.name)
        self.base.denied()

    def test_user_restrictions_cover_root_steps_policy_and_excluded_interests(self):
        actor=self.actor();original=copy.deepcopy(self.value);route=copy.deepcopy(self.route)
        self.permission('User',list(self.f.users.values()))
        self.assertEqual(self.base.read()['snapshot_json'],self.base.revision.snapshot_json)
        for path in ('root','step_actor','board_member','board_vice','policy','resolved','interest','skipped'):
            self.value=copy.deepcopy(original);self.route=copy.deepcopy(route)
            if path=='root':self.value['modified_by']=actor
            elif path=='step_actor':self.value['approval_steps'][0]['actor']=actor
            elif path in ('board_member','board_vice'):self.value['approval_steps'][0][path]=actor
            elif path=='policy':self.route['policy']['board_vice_approver']=actor
            elif path=='resolved':self.route['resolved']['ceo_approver']=actor
            elif path=='interest':self.route['interest_snapshot']['users'].append(actor)
            else:self.route['skipped'].append(dict(principal=actor,position=None,authority='HR Approval',reason='Personal interest: requester, creator, beneficiary or own position'))
            self.store();self.base.denied()

    def test_other_request_cohort_does_not_leak_to_unrelated_requester(self):
        other=self.base.base.save(key='manager')['name'];line=self.f.load(other).lines[0]
        basis=self.route['headcount_basis'][self.f.capacities[0]]
        basis['cohort'][line.name]=dict(committed=2,joined=0,closed=0);self.store()
        # HR can see both requests; requester sees only their own request.
        self.assertEqual(self.base.read('hr')['snapshot_json'],self.raw)
        self.portal_readable();self.base.denied()

    def test_own_cohort_obeys_parent_user_permission(self):
        other=self.base.base.save()['name'];line=self.f.load(other).lines[0]
        self.route['headcount_basis'][self.f.capacities[0]]['cohort'][line.name]=dict(committed=2,joined=0,closed=0)
        self.store();self.assertEqual(self.base.read()['snapshot_json'],self.raw)
        self.permission('Kandil Hiring Request',[self.base.name]);self.portal_readable();self.base.denied()

    def test_cohort_requires_exact_line_capacity(self):
        other=self.base.base.save()['name'];line=self.f.load(other).lines[0]
        self.route['headcount_basis'][self.f.capacities[0]]['cohort'][line.name]=dict(committed=2,joined=0,closed=0)
        self.store();self.assertEqual(self.base.read()['snapshot_json'],self.raw)
        frappe.db.set_value('Kandil Request Line',line.name,'capacity',self.f.capacities[1]);self.base.denied()

    def test_pending_evaluation_links_to_this_captures_line_and_capacity(self):
        line=self.value['lines'][0]
        self.route['pending_quantity_revision']=dict(reason='Recorded',lines=[dict(line=line['name'],capacity=line['capacity'],requested=2)])
        self.store();self.assertEqual(self.base.read()['snapshot_json'],self.raw)
        self.route['pending_quantity_revision']['lines'][0]['capacity']=self.f.capacities[1]
        self.store();self.base.denied()

    def test_unknown_capacity_map_key_cannot_bypass_reference_checks(self):
        self.route['headcount_basis']["unknown' OR 1=1 --"]={'cohort':{}}
        self.store();self.base.denied()


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestHistoryReferences))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
               limits=['Native frozen routing reference access; portal projections, other serialized audit families and indirect files require their own checks.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Historical reference regression failed')
    return value
