"""CLI synthetic vacancy note and retained file, for personal-session HTTP proof."""
import hashlib
import json
import uuid

import frappe
from kandil_hr.portal import fixture, history_files_fixture
from kandil_hr.portal.route_preview_fixture import load
from kandil_hr.recruitment import api, vacancies
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as


def prepare(run_id):
    guard(run_id);result=history_files_fixture.prepare(run_id);data=load(run_id)
    name=data['history_file']['request']
    for _ in range(10):
        doc=frappe.get_doc('Kandil Hiring Request',name)
        if doc.status=='Approved':break
        step=next(s for s in doc.approval_steps if s.decision=='Pending')
        if step.principal not in {v['email'] for v in data['users'].values()}:
            raise RuntimeError('Unexpected non-fixture approval principal')
        with acting_as(step.principal):
            api.decide(name=name,decision='Approve',step_id=step.step_key,command_id=uuid.uuid4().hex,expected_version=str(doc.modified),comment='Synthetic note fixture')
    else:raise RuntimeError('Fixture approvals did not terminate')
    with acting_as(data['users']['hr']['email']):
        vacancies.assign_team(name,doc.lines[0].job_opening,data['users']['hr']['email'],[],
            'Synthetic shared team change',uuid.uuid4().hex,str(doc.modified))
    revision=frappe.get_all('Kandil Request Revision',filters={'request':name,'action':'Recruiter team changed'},
        fields=['name','snapshot_json'])[0]
    value=json.loads(revision.snapshot_json);note=json.loads(value['decision_note'])
    # Model a former team member in retained history. Current team/request and
    # credentials are unchanged; only the guarded synthetic old note is edited.
    note['before']['custom_kandil_team']=[{'user':data['users']['outsider']['email']}]
    value['decision_note']=json.dumps(note);raw=json.dumps(value)
    frappe.db.set_value('Kandil Request Revision',revision.name,'snapshot_json',raw)
    frappe.db.set_value('File',data['history_file']['file'],'attached_to_name',revision.name)
    data['history_file'].update(revision=revision.name,snapshot_sha256=hashlib.sha256(raw.encode()).hexdigest())
    persist(fixture.path_for(run_id),data);frappe.db.commit();return result


def restrict(run_id):
    guard(run_id);data=load(run_id);user=data['users']['requester']['email']
    for key,account in data['users'].items():
        if key=='outsider':continue
        frappe.get_doc(dict(doctype='User Permission',user=user,allow='User',for_value=account['email'],
                           apply_to_all_doctypes=1)).insert(ignore_permissions=True)
    frappe.clear_cache(user=user);frappe.db.commit()
    return dict(restricted_historical_team_identity=True,current_department_grant_unchanged=True)


def inspect(run_id):
    guard(run_id);return history_files_fixture.inspect(run_id)


def cleanup(run_id):
    guard(run_id);return history_files_fixture.cleanup(run_id)
