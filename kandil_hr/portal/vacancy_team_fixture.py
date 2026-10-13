"""CLI-only team-editor cohort; normal Frappe users, scoped grants and cleanup."""
import json
import secrets
import frappe
from frappe.utils import today
from frappe.utils.password import update_password
from kandil_hr.portal import fixture, vacancy_fixture
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import insert, persist


def prepare(run_id):
    guard(run_id)
    vacancy_fixture.prepare(run_id)
    data=json.loads(fixture.path_for(run_id).read_text())
    previous=frappe.flags.get('in_import')
    try:
        frappe.flags.in_import=True
        for index in range(30):
            key=f'directory-{index:02}'
            email=f'portal-{run_id}-{key}@example.invalid'
            password=secrets.token_urlsafe(28)
            with fixture.local_user_contacts(run_id):
                insert('User',email=email,first_name=f'Recruiter {index:02} · مسؤول توظيف',enabled=1,
                       send_welcome_email=0,user_type='System User',roles=[{'role':'Kandil Recruiter'}])
            update_password(email,password,logout_all_sessions=True)
            insert('Kandil Access Grant',user=email,company=data['company'],department=data['department'],
                   valid_from=today(),can_manage_recruitment=1,can_view_sensitive=0,
                   reason='Synthetic paginated recruiter directory browser review')
            data['users'][key]=dict(email=email,password=password)
        persist(fixture.path_for(run_id),data)
        frappe.db.commit()
    finally:
        frappe.flags.in_import=previous
    return dict(prepared=True,accounts=len(data['users']),vacancies=len(data['queue_names']))


def snapshot(run_id):
    guard(run_id);data=json.loads(fixture.path_for(run_id).read_text())
    assert data['company']==f'Kandil PORTAL TEST {run_id}'
    return dict(
        summaries=summaries(run_id),
        capacities=fixture.inspect(run_id)['capacities'],
        openings=[dict(name=name,lead=frappe.db.get_value('Job Opening',name,'custom_kandil_lead'),
            members=[row.user for row in frappe.get_doc('Job Opening',name).custom_kandil_team]) for name in data['queue_names']],
        requests=[dict(name=name,modified=str(frappe.db.get_value('Kandil Hiring Request',name,'modified')))
                  for name in data['queue_requests']])


def cleanup(run_id):
    guard(run_id);return fixture.cleanup(run_id)


def summaries(run_id):
    guard(run_id);data=json.loads(fixture.path_for(run_id).read_text())
    assert data['company']==f'Kandil PORTAL TEST {run_id}'
    roles={v['email']:k for k,v in data['users'].items()}
    rows=frappe.get_all('Kandil Notification Outbox',filters={'recipient':['in',list(roles)],
        'subject':'Recruitment assignments updated / تم تحديث إسنادات التوظيف'},
        fields=['name','recipient','reference_name','reference_doctype','status','notification_log'],order_by='name')
    return [dict(name=r.name,role=roles[r.recipient],reference=bool(r.reference_name or r.reference_doctype),
                 status=r.status,receipt=r.notification_log) for r in rows]


def deliver_summaries(run_id):
    from kandil_hr.foundation import outbox
    rows=summaries(run_id)
    for row in rows:outbox.deliver(row['name'])
    frappe.db.commit()
    return dict(rows=summaries(run_id))
