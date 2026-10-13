"""Scoped team review/directory and direct-command permission regressions."""
import json
import sys
import unittest
import uuid
from unittest.mock import patch

import frappe
from frappe.utils import today, add_days

from kandil_hr.portal import vacancy_teams
from kandil_hr.portal.test_vacancies import TestVacancies
from kandil_hr.recruitment import vacancies as commands
from kandil_hr.recruitment.test_commands import acting_as


class TestVacancyTeams(unittest.TestCase):
    def setUp(self):
        self.base=TestVacancies();self.addCleanup(self.base.doCleanups);self.base.setUp();self.f=self.base.f
        self.doc=self.base.create(both=True)

    def items(self,doc=None):
        doc=doc or self.f.load(self.doc.name)
        return [dict(name=doc.name,opening_name=l.job_opening,expected_version=str(doc.modified)) for l in doc.lines]

    def call(self,method,role='hr',**args):
        args.setdefault('items',self.items())
        with acting_as(self.f.users[role]):return getattr(vacancy_teams,method)(**args)

    def assignment(self,items=None,**changes):
        args=dict(items=items or self.items(),lead=self.f.users['manager'],members=[self.f.users['hr']],reason='Synthetic team review',command_id=uuid.uuid4().hex)
        args.update(changes)
        with acting_as(self.f.users['hr']):return commands.bulk_assign(**args)

    def test_review_exact_location_versions_and_minimal_directory(self):
        review=self.call('review');self.assertEqual(review['selection_count'],2)
        self.assertEqual({r['opening_name'] for r in review['rows']},{l.job_opening for l in self.doc.lines})
        self.assertTrue(all(not r['members'] and r['expected_version']==str(self.doc.modified) for r in review['rows']))
        result=self.call('recruiters',page_length=1)
        self.assertEqual((result['total'],len(result['rows']),result['has_more']),(2,1,True))
        self.assertEqual(set(result['rows'][0]),{'id','label'})
        second=self.call('recruiters',start=1,page_length=1)
        self.assertNotEqual(result['rows'][0]['id'],second['rows'][0]['id'])
        self.assertEqual(self.call('recruiters',search=self.f.users['manager'])['rows'][0]['id'],self.f.users['manager'])
        self.assertEqual(self.call('recruiters',search="' OR 1=1 --")['total'],0)

    def test_team_editor_retains_unqualified_historical_identity_with_warning(self):
        self.assignment()
        frappe.db.set_value('Kandil Access Grant',self.f.grants['manager'],'revoked',1)
        review=self.call('review')
        for row in review['rows']:
            person=next(p for p in row['members'] if p['id']==self.f.users['manager'])
            self.assertFalse(person['eligible_for_batch']);self.assertEqual(row['lead'],self.f.users['manager'])
        self.assertEqual(self.call('recruiters')['total'],1)

    def test_unqualified_expired_partial_and_disabled_not_in_directory(self):
        grant=self.f.grants['manager']
        for changes in ({'valid_until':add_days(today(),-1)}, {'valid_until':None,'valid_from':add_days(today(),1)},
                        {'valid_from':today(),'can_manage_recruitment':0},
                        {'can_manage_recruitment':1,'branch':frappe.db.get_value('Kandil Capacity',self.f.capacities[0],'branch')}):
            frappe.db.set_value('Kandil Access Grant',grant,changes)
            self.assertEqual(self.call('recruiters')['total'],1)
        frappe.db.set_value('Kandil Access Grant',grant,{'branch':None})
        account=frappe.get_doc('User',self.f.users['manager']);account.enabled=0;account.save(ignore_permissions=True)
        self.assertEqual(self.call('recruiters')['total'],1)
        account.enabled=1;account.set('roles',[r for r in account.roles if r.role!='Kandil Recruiter']);account.save(ignore_permissions=True)
        self.assertEqual(self.call('recruiters')['total'],1)

    def test_multi_request_directory_requires_common_eligible_scope(self):
        other=self.base.create('Other',position=1)
        items=self.items()+self.items(other)
        self.assertEqual(self.call('recruiters',items=items)['total'],2)
        frappe.db.set_value('Kandil Access Grant',self.f.grants['manager'],'branch',frappe.db.get_value('Kandil Capacity',self.f.capacities[0],'branch'))
        result=self.call('recruiters',items=items);self.assertEqual(result['total'],1)
        self.assertEqual(result['rows'][0]['id'],self.f.users['hr'])

    def test_stale_batch_review_denied_without_writes(self):
        old=self.items();self.assignment();before=self.f.counts(self.doc.name)
        for method in ('review','recruiters'):
            with self.f.rejected(frappe.TimestampMismatchError):self.call(method,items=old)
        self.assertEqual(self.f.counts(self.doc.name),before)

    def test_non_authority_cannot_enumerate_recruiters_or_review(self):
        for method in ('review','recruiters'):
            with self.f.rejected(frappe.PermissionError):self.call(method,role='manager')

    def test_guessed_pair_closed_and_revoked_actor_denied(self):
        other=self.base.create('Other')
        invalid=[self.items()[0]|{'opening_name':other.lines[0].job_opening}]
        with self.f.rejected(frappe.PermissionError):self.call('review',items=invalid)
        self.f.call('hr',commands.set_state,self.doc.name,opening_name=self.doc.lines[0].job_opening,action='Close',reason='Close one synthetic location')
        with self.f.rejected():self.call('recruiters')
        frappe.db.set_value('Kandil Access Grant',self.f.grants['hr'],'revoked',1)
        with self.f.rejected(frappe.PermissionError):self.call('review')

    def test_native_opening_restriction_blocks_review_and_direct_command(self):
        self.f.insert('User Permission',user=self.f.users['hr'],allow='Job Opening',for_value=self.doc.lines[0].job_opening,
            apply_to_all_doctypes=0,applicable_for='Job Opening');frappe.clear_cache(user=self.f.users['hr'])
        before=self.f.counts(self.doc.name)
        with self.f.rejected(frappe.PermissionError):self.call('review')
        with self.f.rejected(frappe.PermissionError):self.assignment()
        self.assertEqual(before,self.f.counts(self.doc.name))
        self.assertFalse(frappe.get_doc('Job Opening',self.doc.lines[0].job_opening).custom_kandil_lead)

    def test_native_identity_restriction_filters_and_denies_guessed_write(self):
        self.f.insert('User Permission',user=self.f.users['hr'],allow='User',for_value=self.f.users['hr'],
            apply_to_all_doctypes=0,applicable_for='User');frappe.clear_cache(user=self.f.users['hr'])
        result=self.call('recruiters');self.assertEqual(result['total'],1)
        self.assertNotIn(self.f.users['manager'],json.dumps(result))
        before=self.f.counts(self.doc.name)
        with self.f.rejected(frappe.PermissionError):self.assignment()
        self.assertEqual(before,self.f.counts(self.doc.name))

    def test_hidden_existing_member_cannot_be_silently_removed(self):
        self.assignment()
        self.f.insert('User Permission',user=self.f.users['hr'],allow='User',for_value=self.f.users['hr'],
            apply_to_all_doctypes=0,applicable_for='User');frappe.clear_cache(user=self.f.users['hr'])
        with self.f.rejected(frappe.PermissionError):self.call('review')
        with self.f.rejected(frappe.PermissionError):self.assignment(lead=self.f.users['hr'],members=[])
        self.assertEqual(frappe.get_doc('Job Opening',self.doc.lines[0].job_opening).custom_kandil_lead,self.f.users['manager'])

    def test_bulk_replay_exactly_once_and_changed_payload_denied(self):
        items=self.items();key=uuid.uuid4().hex
        first=self.assignment(items,command_id=key);counts=self.f.counts(self.doc.name)
        replay=self.assignment(items,command_id=key)
        self.assertEqual(json.dumps(first,default=str,sort_keys=True),json.dumps(replay,default=str,sort_keys=True))
        self.assertEqual(counts,self.f.counts(self.doc.name))
        for line in self.doc.lines:
            opening=frappe.get_doc('Job Opening',line.job_opening)
            self.assertEqual([r.user for r in opening.custom_kandil_team],[self.f.users['manager'],self.f.users['hr']])
        with self.f.rejected():self.assignment(items,command_id=key,members=[])

    def test_replay_rechecks_native_opening_and_current_authority(self):
        items=self.items();key=uuid.uuid4().hex;self.assignment(items,command_id=key)
        self.f.insert('User Permission',user=self.f.users['hr'],allow='Job Opening',for_value=self.doc.lines[0].job_opening,
            apply_to_all_doctypes=0,applicable_for='Job Opening');frappe.clear_cache(user=self.f.users['hr'])
        with self.f.rejected(frappe.PermissionError):self.assignment(items,command_id=key)
        # Rollback-scoped fixture reset, not a business deletion. Avoid scheduling
        # unrelated dynamic-link cleanup into the shared synthetic job queue.
        frappe.db.delete('User Permission', {'user': self.f.users['hr']})
        frappe.clear_cache(user=self.f.users['hr'])
        frappe.db.set_value('Kandil Organization Settings',self.f.company,'hr_approver',self.f.users['manager'])
        # A stale read-model hint cannot authorize a command receipt replay.
        with patch('kandil_hr.recruitment.vacancy_access.can_manage_team',return_value=True):
            with self.f.rejected(frappe.PermissionError):self.assignment(items,command_id=key)

    def test_stale_later_parent_rolls_back_entire_bulk(self):
        other=self.base.create('Second batch')
        first,second=sorted([self.f.load(self.doc.name),other],key=lambda d:d.name)
        items=self.items(first)+self.items(second)
        self.assignment(self.items(second),lead=self.f.users['hr'],members=[])
        before=self.f.counts(first.name)
        with self.f.rejected(frappe.TimestampMismatchError):self.assignment(items)
        self.assertEqual(before,self.f.counts(first.name))
        self.assertTrue(all(not frappe.get_doc('Job Opening',l.job_opening).custom_kandil_lead for l in first.lines))

    def test_invalid_batch_input_and_directory_bounds(self):
        item=self.items()[0]
        for items in ([],{},[item]*51,[item,item],[item|{'unexpected':1}],[item|{'expected_version':{}}],
                      [item,self.items()[1]|{'expected_version':'different'}]):
            with self.f.rejected():self.call('review',items=items)
        with self.f.rejected():self.call('recruiters',search={})
        result=self.call('recruiters',page_length=9999,start=-1)
        self.assertEqual((result['page_length'],result['start']),(100,0))

    def batch_notices(self):
        return frappe.get_all('Kandil Notification Outbox',filters={'recipient':self.f.users['manager'],
            'subject':'Recruitment assignments updated / تم تحديث إسنادات التوظيف'},
            fields=['name','recipient','subject','body','reference_doctype','reference_name','notification_log','status'])

    def test_batch_has_one_private_safe_summary_per_recipient_and_replay(self):
        from kandil_hr.foundation import outbox
        second=self.base.create(both=True)
        items=self.items()+self.items(second);key=uuid.uuid4().hex
        self.assignment(items,command_id=key,reason='PRIVATE_TEAM_REASON')
        rows=self.batch_notices();self.assertEqual(len(rows),1)
        row=rows[0]
        self.assertFalse(row.reference_doctype);self.assertFalse(row.reference_name)
        for value in (self.doc.name,second.name,self.f.company,self.f.department,'PRIVATE_TEAM_REASON'):
            self.assertNotIn(value,row.body)
        self.assertRegex(row.body,r'[\u0600-\u06ff]')
        self.assertEqual(frappe.db.count('Kandil Notification Outbox',{'recipient':self.f.users['hr'],
            'subject':row.subject}),0) # actor is excluded
        self.assertEqual(frappe.db.count('Kandil Notification Outbox',{'recipient':self.f.users['manager'],
            'subject':'Vacancy assigned / تم إسناد شاغر إليك'}),0)
        self.assertEqual(outbox.deliver(row.name),'Delivered locally')
        receipt=frappe.db.get_value('Kandil Notification Outbox',row.name,'notification_log')
        self.assertTrue(receipt)
        self.assignment(items,command_id=key,reason='PRIVATE_TEAM_REASON')
        self.assertEqual(len(self.batch_notices()),1)
        self.assertEqual(outbox.deliver(row.name),'Delivered locally')
        self.assertEqual(frappe.db.get_value('Kandil Notification Outbox',row.name,'notification_log'),receipt)

    def test_role_only_change_notifies_once_and_unchanged_team_does_not(self):
        self.assignment();self.assertEqual(len(self.batch_notices()),1)
        self.assignment();self.assertEqual(len(self.batch_notices()),1)
        self.assignment(lead=self.f.users['hr'],members=[self.f.users['manager']])
        self.assertEqual(len(self.batch_notices()),2) # manager remains but becomes support
        self.assignment(lead=self.f.users['hr'],members=[])
        self.assertEqual(len(self.batch_notices()),2) # removal alone is not a new assignment

    def test_single_role_change_keeps_scoped_reference(self):
        opening=self.doc.lines[0].job_opening
        self.f.call('hr',commands.assign_team,self.doc.name,opening_name=opening,
            lead=self.f.users['manager'],members=[self.f.users['hr']],reason='Synthetic initial team')
        self.f.call('hr',commands.assign_team,self.doc.name,opening_name=opening,
            lead=self.f.users['hr'],members=[self.f.users['manager']],reason='Synthetic role swap')
        rows=frappe.get_all('Kandil Notification Outbox',filters={'recipient':self.f.users['manager'],
            'subject':'Vacancy assigned / تم إسناد شاغر إليك'},fields=['reference_doctype','reference_name','body'])
        self.assertEqual(len(rows),2)
        self.assertTrue(all(r.reference_doctype=='Job Opening' and r.reference_name==opening for r in rows))
        self.assertTrue(all('assignment was updated' in r.body for r in rows))

    def test_batch_summary_enqueue_failure_rolls_back_all_assignments(self):
        from kandil_hr.foundation import outbox
        original=outbox.enqueue
        before=self.f.counts(self.doc.name)
        def fail_summary(key,*args,**kwargs):
            if key.startswith('vacancy-team-batch:'):raise RuntimeError('Synthetic summary outage')
            return original(key,*args,**kwargs)
        with patch.object(outbox,'enqueue',side_effect=fail_summary),self.assertRaises(RuntimeError):self.assignment()
        self.assertEqual(self.f.counts(self.doc.name),before)
        self.assertEqual(self.batch_notices(),[])
        self.assertTrue(all(not frappe.db.get_value('Job Opening',l.job_opening,'custom_kandil_lead') for l in self.doc.lines))

    def test_generic_batch_summary_carries_no_business_reference_after_revocation(self):
        from kandil_hr.foundation import outbox
        self.assignment();row=self.batch_notices()[0]
        frappe.db.set_value('Kandil Access Grant',self.f.grants['manager'],'revoked',1)
        # Historical account-only alert discloses no company, count or object.
        self.assertFalse(row.reference_name);self.assertNotIn(self.doc.name,row.body)
        with acting_as(self.f.users['manager']):
            from kandil_hr.portal.vacancies import listing
            self.assertEqual(listing()['total'],0)
        user=frappe.get_doc('User',self.f.users['manager']);user.enabled=0;user.save(ignore_permissions=True)
        self.assertEqual(outbox.deliver(row.name),'Suppressed')

    def test_more_than_500_eligible_identities_are_counted_and_searchable(self):
        # Direct synthetic directory fixtures avoid password/Contact hooks; these
        # are not login accounts or proof of account provisioning/load capacity.
        names=[f'{self.f.prefix.lower()}-directory-{i:04}@example.invalid' for i in range(505)]
        frappe.db.bulk_insert('User',['name','email','first_name','full_name','enabled','user_type'],
            [(n,n,'Directory',f'Directory {i:04}',1,'System User') for i,n in enumerate(names)])
        frappe.db.bulk_insert('Has Role',['name','parent','parenttype','parentfield','role'],
            [(uuid.uuid4().hex,n,'User','roles','Kandil Recruiter') for n in names])
        frappe.db.bulk_insert('Kandil Access Grant',['name','user','company','department','valid_from','can_manage_recruitment','revoked'],
            [(uuid.uuid4().hex,n,self.f.company,self.f.department,today(),1,0) for n in names])
        result=self.call('recruiters',search='Directory',page_length=100,start=500)
        self.assertEqual((result['total'],len(result['rows']),result['has_more']),(505,5,False))
        self.assertEqual(self.call('recruiters',search='Directory 0504')['rows'][0]['id'],names[-1])
        self.assertEqual(self.call('recruiters',search='Directory 05%')['total'],0)


def run():
    from kandil_hr.foundation.tests_runner import RecordedResult
    if frappe.local.site!='kandil-parity.localhost' or frappe.session.user!='Administrator' or getattr(frappe.local,'request',None) or not frappe.conf.get('allow_tests'):
        raise RuntimeError('Requires isolated opted-in parity CLI')
    result=unittest.TextTestRunner(stream=sys.stderr,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestVacancyTeams))
    value=dict(result='PASS' if result.wasSuccessful() and not result.skipped else 'FAIL',total=result.testsRun,checks=result.checks,
        limits=['Rollback native team/directory and direct-command tests; HTTP concurrency, browser and production scale are separate.'])
    print(json.dumps(value))
    if value['result']!='PASS':raise AssertionError('Vacancy team regression failed')
    return value
