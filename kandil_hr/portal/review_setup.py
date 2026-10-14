"""One-time CLI bootstrap for the persistent synthetic human-review site.

This is not a test fixture and has no reset/cleanup action. Ordinary permissions
and commands create the requests/applications after explicit initial setup.
"""
import json
import hashlib
import os
import secrets
import uuid
from contextlib import contextmanager
from pathlib import Path

import frappe
from frappe.installer import update_site_config
from frappe.utils import getdate, today
from frappe.utils.password import update_password

SITE = 'kandil-review.localhost'
COMPANY = 'Kandil SYNTHETIC REVIEW'
PERSONAL = 'ibrahimamiir22@gmail.com'


def guard():
    if (frappe.local.site != SITE or os.environ.get('KANDIL_REVIEW_CONTAINER') != '1'
            or not frappe.conf.get('kandil_review_environment') or frappe.conf.get('allow_tests')
            or not frappe.conf.get('mute_emails') or not frappe.conf.get('pause_scheduler')
            or frappe.session.user != 'Administrator' or getattr(frappe.local, 'request', None)):
        raise RuntimeError('Requires the dedicated synthetic review CLI; tests and external email must be disabled')


def persist(path, payload):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(payload, stream, default=str, ensure_ascii=False)


@contextmanager
def actor(user):
    previous = frappe.session.user
    frappe.set_user(user)
    try:
        yield
    finally:
        frappe.set_user(previous)


def insert(doctype, **values):
    return frappe.get_doc(dict(doctype=doctype, **values)).insert()


def prepare():
    guard()
    ready = Path(frappe.get_site_path('private', 'kandil-review-ready.json'))
    credentials = Path(frappe.get_site_path('private', 'kandil-review-accounts.json'))
    if ready.exists() or credentials.exists() or frappe.is_setup_complete():
        raise RuntimeError('Review data already exists or initialization was interrupted. Inspect; do not reseed')
    # Preserve the user's existing approved personal login, never a weak fallback.
    old = Path(frappe.local.sites_path) / 'kandil-parity.localhost/private/ibrahim-review-login.json'
    login = json.loads(old.read_text())
    if login.get('email') != PERSONAL or not login.get('password'):
        raise RuntimeError('Expected existing personal review credential; no account changed')
    from frappe.desk.page.setup_wizard.setup_wizard import setup_complete
    year = getdate().year
    setup_complete(dict(language='English', lang='en', country='Egypt', timezone='Africa/Cairo',
                        currency='EGP', company_name=COMPANY, company_abbr='KSR',
                        fy_start_date=f'{year}-01-01', fy_end_date=f'{year}-12-31',
                        chart_of_accounts='Standard', domain='Manufacturing', setup_demo=0,
                        enable_telemetry=0))
    guard()
    department = insert('Department', department_name='الإنتاج · مراجعة وهمية', company=COMPANY).name
    designation = insert('Designation', designation_name='فني تشغيل · مراجعة وهمية').name
    users = {}
    for key, email, label, roles in (
        ('personal', PERSONAL, 'Ibrahim · مراجعة وهمية', ['Kandil Recruiter', 'Kandil Requester']),
        ('manager', 'review-manager@example.invalid', 'مدير الإدارة · مراجعة', ['Kandil Approver']),
        ('hr', 'review-hr@example.invalid', 'الموارد البشرية · مراجعة', ['Kandil Recruiter']),
        ('sector', 'review-ceo@example.invalid', 'اعتماد الإدارة · مراجعة', ['Kandil Sector Approver']),
        ('outsider', 'review-outsider@example.invalid', 'خارج الصلاحيات · مراجعة', ['Kandil Requester']),
    ):
        password = login['password'] if key == 'personal' else secrets.token_urlsafe(28)
        insert('User', email=email, first_name=label, enabled=1, send_welcome_email=0,
               user_type='System User', language='ar', roles=[dict(role=role) for role in roles])
        update_password(email, password, logout_all_sessions=True)
        users[key] = dict(email=email, password=password)
        if key != 'outsider':
            insert('Kandil Access Grant', user=email, company=COMPANY, department=department,
                   valid_from=today(), reason='Persistent synthetic human review only',
                   can_manage_recruitment=1, can_view_sensitive=0)
    insert('Kandil Organization Settings', company=COMPANY,
           hr_approver=users['hr']['email'], sector_approver=users['sector']['email'])
    insert('Kandil Recruitment Route', company=COMPANY, department=department,
           manager_approver=users['manager']['email'], hr_approver=users['hr']['email'],
           exception_approver=users['sector']['email'], enabled=1, headcount_mode='Block')
    from kandil_hr.organization.api import transition
    with transition():
        head = insert('Kandil Position', company=COMPANY, department=department,
                      designation=designation, position_code='REVIEW-HEAD', title='مدير الإنتاج · مراجعة')
        insert('Kandil Position Hierarchy', company=COMPANY, department=department,
               position=head.name, valid_from=today(), authority='Department Approval')
        branch = insert('Branch', branch='العبور · مراجعة وهمية').name
        position = insert('Kandil Position', company=COMPANY, department=department, branch=branch,
                          designation=designation, position_code='REVIEW-OPERATOR',
                          title='فني تشغيل · مراجعة', structural=20).name
        insert('Kandil Position Hierarchy', company=COMPANY, department=department, branch=branch,
               position=position, parent_position=head.name, valid_from=today(), authority='Department Approval')
        capacity = insert('Kandil Capacity', company=COMPANY, department=department, branch=branch,
                          designation=designation, position=position, structural=20).name
        employee = insert('Employee', first_name='Synthetic review manager', gender='Male',
                          date_of_birth='1990-01-01', date_of_joining=today(), company=COMPANY,
                          department=department, user_id=users['manager']['email'], status='Active')
        insert('Kandil Position Assignment', company=COMPANY, department=department,
               position=head.name, employee=employee.name, user=users['manager']['email'],
               allocation='Primary', valid_from=today())
    from kandil_hr.portal.api import save_draft
    from kandil_hr.recruitment import api, vacancies
    requests = {}
    for key, title in (('draft', 'طلب تجريبي قابل للتعديل / Review draft'),
                       ('pending', 'طلب ينتظر الاعتماد / Awaiting approval'),
                       ('approved', 'توظيف فني تشغيل / Operator recruitment')):
        with actor(PERSONAL):
            request = save_draft(payload=dict(company=COMPANY, department=department, title=title,
                                 requested_position=position, need_reason='Expansion', requested_priority='Normal',
                                 lines=[dict(capacity=capacity, requested_qty=2)]), command_id=uuid.uuid4().hex)
            if key != 'draft':
                api.submit_request(request['name'], uuid.uuid4().hex, request['modified'])
        requests[key] = request['name']
    for role in ('manager', 'hr'):
        doc = frappe.get_doc('Kandil Hiring Request', requests['approved'])
        step = next(row for row in doc.approval_steps if row.decision == 'Pending')
        with actor(users[role]['email']):
            api.decide(doc.name, 'Approve', step.step_key, uuid.uuid4().hex, str(doc.modified),
                       comment='Synthetic review example approved through ordinary authority')
    doc.reload()
    opening = doc.lines[0].job_opening
    with actor(users['hr']['email']):
        vacancies.assign_team(doc.name, opening, users['hr']['email'], [PERSONAL],
                              'Persistent synthetic review team', uuid.uuid4().hex, str(doc.modified))
        doc.reload()
        vacancies.set_state(doc.name, opening, 'Open', 'Synthetic recruitment example',
                            uuid.uuid4().hex, str(doc.modified))
        doc.reload()
        legacy = insert('Job Applicant', applicant_name='سجل سابق للمراجعة / Legacy example',
                        phone_number='01012345678', job_title=opening).name
    update_site_config('kandil_candidate_identity_enabled', 1)
    frappe.conf.kandil_candidate_identity_enabled = 1
    from kandil_hr.candidates import intake, recovery
    applications = []
    with actor(PERSONAL):
        for index, name in enumerate(('أحمد · مرشح وهمي', 'منى · مرشحة وهمية', 'Omar · Synthetic candidate')):
            applications.append(intake.create_application(doc.name, opening,
                dict(applicant_name=name, email_id=f'review-candidate-{index}@example.invalid',
                     phone_number='01012345678', source_channel='Referral', source_detail='Synthetic review'),
                uuid.uuid4().hex, str(doc.modified), profile=dict(city='القاهرة', experience_years=index)))
        saved = recovery.prepare('intake', dict(name=doc.name, opening_name=opening,
            expected_version=str(doc.modified), command_id=uuid.uuid4().hex,
            details=dict(applicant_name='طلب محفوظ · مرشح وهمي', email_id='review-pending@example.invalid', phone_number='',
                         source_channel='Referral', source_detail='Prepared example: review before executing'),
            profile=dict(city='القاهرة')))
    manifest = dict(site=SITE, company=COMPANY, department=department, position=position,
                    capacity=capacity, requests=requests, opening=opening, legacy=legacy,
                    applications=applications, recovery=saved['name'], users=users,
                    url='http://kandil-review.localhost:8112/hr-portal', synthetic=True)
    persist(credentials, manifest)
    frappe.db.commit()
    persist(ready, dict(site=SITE, company=COMPANY, synthetic=True, automatic_reset=False))
    return dict(ready=True, company=COMPANY, accounts=len(users), applications=len(applications) + 1,
                credentials='private-file-only', automatic_reset=False)


def inspect():
    """Read-only preservation evidence, with no credentials or record payloads."""
    guard()
    if not Path(frappe.get_site_path('private', 'kandil-review-ready.json')).exists():
        raise RuntimeError('Review initialization is not complete')
    tables = {}
    for doctype in ('Company', 'Kandil Hiring Request', 'Kandil Capacity', 'Job Opening',
                    'Kandil Candidate Person', 'Job Applicant', 'Kandil Candidate Recovery',
                    'Kandil Access Grant', 'Kandil Position', 'Kandil Position Assignment',
                    'Kandil Command Audit', 'Kandil Candidate Activity', 'Kandil HR List Revision', 'Kandil Candidate Closure', 'Kandil Candidate Message Resolution', 'Kandil Message Template Revision', 'Kandil Candidate Reopening', 'Kandil Privacy Notice Revision'):
        documents = [frappe.get_doc(doctype, name).as_dict() for name in
                     frappe.get_all(doctype, pluck='name', order_by='name asc')]
        tables[doctype] = dict(count=len(documents), sha256=hashlib.sha256(
            json.dumps(documents, sort_keys=True, default=str).encode()).hexdigest())
    return dict(site=SITE, tables=tables, candidate_mode=bool(frappe.conf.get('kandil_candidate_identity_enabled')),
                tests_disabled=not bool(frappe.conf.get('allow_tests')), email_muted=bool(frappe.conf.get('mute_emails')),
                scheduler_paused=bool(frappe.conf.get('pause_scheduler')),
                companies_synthetic=frappe.get_all('Company', pluck='name') == [COMPANY],
                personal_enabled=bool(frappe.db.get_value('User', PERSONAL, 'enabled')))


def repair_prepared_example():
    """One-time correction of the original synthetic seed's missing empty phone.

    Preserve completed/user-changed examples. Retire the exact old envelope via
    its normal command; never rewrite an encrypted envelope or a business row.
    """
    guard()
    path = Path(frappe.get_site_path('private', 'kandil-review-accounts.json'))
    manifest = json.loads(path.read_text())
    name = manifest['recovery']
    from kandil_hr.candidates import recovery
    doc = frappe.get_doc(recovery.DT, name)
    if doc.actor != PERSONAL or doc.operation != 'intake':
        raise RuntimeError('Unexpected review example; no automatic repair')
    if doc.status != 'Pending':
        return dict(changed=False, reason='Preserved non-pending example')
    before = inspect()
    with actor(PERSONAL):
        original = recovery.inspect(name)['arguments']
        details = original['details']
        if 'phone_number' in details:
            return dict(changed=False, reason='Contact schema already complete')
        if (set(details) != {'applicant_name','email_id','source_channel','source_detail'}
                or details['email_id'] != 'review-pending@example.invalid'
                or original['name'] != manifest['requests']['approved']
                or original['opening_name'] != manifest['opening']):
            raise RuntimeError('Review example differs from the original seed; preserve and inspect')
        recovery.cancel(name)
        replacement = recovery.prepare('intake', dict(original, command_id=uuid.uuid4().hex,
                                                      details=dict(details, phone_number='')))
    after = inspect()
    for kind in before['tables']:
        if kind != recovery.DT and before['tables'][kind] != after['tables'][kind]:
            raise RuntimeError('Repair changed business data; transaction must roll back')
    manifest['recovery'] = replacement['name']
    temporary = path.with_name('review-repair-' + uuid.uuid4().hex + '.json')
    persist(temporary, manifest)
    frappe.db.commit()
    os.replace(temporary, path)
    return dict(changed=True, original_cancelled=True, replacement_pending=True,
                business_rows_unchanged=True, original_reviewed_version_preserved=True)
