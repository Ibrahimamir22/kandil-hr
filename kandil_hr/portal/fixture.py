"""CLI-only fresh synthetic portal cohort. Credentials remain in private/ at 0600."""

import json
import secrets
import uuid
from pathlib import Path
from contextlib import contextmanager
from unittest.mock import patch

import frappe
from frappe.utils import today
from frappe.utils.password import update_password

from kandil_hr.organization.api import transition
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import insert, persist


def path_for(run_id):
    return Path(frappe.get_site_path("private", f"kandil-portal-{run_id}.json"))


@contextmanager
def local_user_contacts(run_id):
    """CLI synthetic account contact sync runs now, without filling shared queues.

    Other job types/accounts retain their original behavior. This does not run
    workers, delete queued jobs or alter production User hooks.
    """
    guard(run_id)
    original = frappe.enqueue
    def enqueue(method, *args, **kwargs):
        user = kwargs.get('user')
        identity = getattr(user, 'name', '') or ''
        if (method == 'frappe.core.doctype.user.user.create_contact'
                and identity.startswith('portal-' + run_id + '-') and identity.endswith('@example.invalid')):
            kwargs['now'] = True
        return original(method, *args, **kwargs)
    with patch('frappe.enqueue', side_effect=enqueue):
        yield


def prepare(run_id):
    guard(run_id)
    path = path_for(run_id)
    if path.exists():
        raise RuntimeError("Use a fresh portal run ID; existing records are preserved")
    prefix = "PORTAL-" + run_id
    company = insert("Company", company_name="Kandil PORTAL TEST " + run_id,
                     abbr="P" + run_id[:5], default_currency="EGP", country="Egypt").name
    department = insert("Department", department_name="الإنتاج · " + prefix, company=company).name
    designation = insert("Designation", designation_name="فني تشغيل · " + prefix).name
    users = {}
    for key, label, roles in [
        ("requester", "عمر · طالب توظيف", ["Kandil Requester"]),
        ("manager", "أحمد · مدير الإدارة", ["Kandil Approver"]),
        ("hr", "مريم · الموارد البشرية", ["Kandil Recruiter"]),
        ("recruiter", "سلمى · مسؤولة توظيف", ["Kandil Recruiter"]),
        ("sector", "خالد · مدير القطاع", ["Kandil Sector Approver"]),
        ("outsider", "مستخدم خارج النطاق", ["Kandil Requester"]),
    ]:
        email = f"portal-{run_id}-{key}@example.invalid"
        password = secrets.token_urlsafe(28)
        # The CLI guard restricts this to a UUID synthetic parity cohort.
        # Use Frappe's bulk-import path only during test User creation; repeated
        # acceptance runs must not change the site's normal hourly signup limit.
        previous_import = frappe.flags.get("in_import")
        try:
            frappe.flags.in_import = True
            with local_user_contacts(run_id):
                insert("User", email=email, first_name=label, enabled=1, send_welcome_email=0,
                       user_type="System User", language="ar", roles=[{"role": role} for role in roles])
        finally:
            frappe.flags.in_import = previous_import
        update_password(email, password, logout_all_sessions=True)
        users[key] = dict(email=email, password=password)
        if key != "outsider":
            insert("Kandil Access Grant", user=email, company=company, department=department,
                   valid_from=today(), reason="Synthetic connected portal acceptance",
                   can_manage_recruitment=1, can_view_sensitive=0)
    insert("Kandil Organization Settings", company=company,
           hr_approver=users["hr"]["email"], sector_approver=users["sector"]["email"])
    insert("Kandil Recruitment Route", company=company, department=department,
           manager_approver=users["manager"]["email"], hr_approver=users["hr"]["email"],
           exception_approver=users["sector"]["email"], enabled=1, headcount_mode="Block")
    positions, capacities = [], []
    with transition():
        head = insert("Kandil Position", company=company, department=department,
                      designation=designation, position_code=prefix + "-HEAD", title="مدير الإنتاج")
        insert("Kandil Position Hierarchy", company=company, department=department,
               position=head.name, valid_from=today(), authority="Department Approval")
        for label, seats in [("العبور", 30), ("العاشر من رمضان", 30), ("موقع محدود السعة", 1)]:
            branch = insert("Branch", branch=label + " · " + run_id).name
            pos = insert("Kandil Position", company=company, department=department, branch=branch,
                         designation=designation, position_code=prefix + "-" + str(len(positions)),
                         title="فني تشغيل — " + label, structural=seats)
            insert("Kandil Position Hierarchy", company=company, department=department, branch=branch,
                   position=pos.name, parent_position=head.name, valid_from=today(), authority="Department Approval")
            cap = insert("Kandil Capacity", company=company, department=department, branch=branch,
                         designation=designation, position=pos.name, structural=seats)
            positions.append(pos.name)
            capacities.append(cap.name)
    # Employee linking saves the same synthetic User through ERPNext's hook.
    with local_user_contacts(run_id):
        employee = insert("Employee", first_name="Synthetic portal manager", gender="Male",
                          date_of_birth="1990-01-01", date_of_joining=today(), company=company,
                          department=department, user_id=users["manager"]["email"], status="Active")
    insert("Kandil Position Assignment", company=company, department=department, position=head.name,
           employee=employee.name, user=users["manager"]["email"], allocation="Primary", valid_from=today())
    data = dict(run_id=run_id, company=company, department=department, designation=designation,
                positions=positions, capacities=capacities, users=users, requests={})
    persist(path, data)
    frappe.db.commit()
    return dict(run_id=run_id, prepared=True, credentials="private-file-only", accounts=len(users))


def inspect(run_id):
    guard(run_id)
    data = json.loads(path_for(run_id).read_text())
    return dict(
        run_id=run_id,
        requests=frappe.get_all("Kandil Hiring Request", filters={"company": data["company"]},
            fields=["name", "title", "status", "revision", "modified"], order_by="creation asc"),
        capacities=[{k: frappe.get_doc("Kandil Capacity", name).get(k)
                     for k in ("name", "structural", "occupied", "reserved", "open_slots", "available")}
                    for name in data["capacities"]],
        openings=frappe.get_all("Job Opening", filters={"company": data["company"]},
            fields=["name", "custom_kandil_request", "custom_kandil_capacity", "custom_kandil_lead", "vacancies"]),
    )


def cleanup(run_id):
    """Retire only this synthetic cohort, retaining its business/audit history."""
    from kandil_hr.recruitment import api
    from kandil_hr.recruitment.test_commands import acting_as

    guard(run_id)
    data = json.loads(path_for(run_id).read_text())
    if data['company'] != 'Kandil PORTAL TEST ' + run_id:
        raise RuntimeError('Refusing cross-company portal cleanup')
    if not data.get('cleaned'):
        names = frappe.get_all('Kandil Hiring Request', filters={'company': data['company']}, pluck='name')
        with acting_as(data['users']['hr']['email']):
            for name in names:
                doc = frappe.get_doc('Kandil Hiring Request', name)
                if doc.status != 'Cancelled':
                    api.cancel_request(name, uuid.uuid4().hex, str(doc.modified),
                                       'Synthetic portal regression complete; history retained')
        for account in data['users'].values():
            user = frappe.get_doc('User', account['email'])
            user.enabled = 0
            with local_user_contacts(run_id):
                user.save(ignore_permissions=True)
        frappe.db.commit()
        data['cleaned'] = True
        for account in data['users'].values(): account.pop('password', None)
        persist(path_for(run_id), data)
    if any(frappe.db.get_value('User', account['email'], 'enabled') for account in data['users'].values()):
        raise RuntimeError('Synthetic portal cleanup left an enabled account')
    state = inspect(run_id)
    if any(row[k] for row in state['capacities'] for k in ('reserved', 'occupied', 'open_slots')):
        raise RuntimeError('Portal cleanup did not reconcile capacity')
    return dict(run_id=run_id, cleaned=True, accounts_disabled=len(data['users']),
                all_fixture_ledgers_zero=True, history_retained=True)


def verify_absent(run_id):
    """Read-only proof for an aborted, uncommitted synthetic preparation."""
    guard(run_id)
    counts = dict(users=frappe.db.count('User', {'name': ['like', 'portal-' + run_id + '-%']}),
                  companies=frappe.db.count('Company', {'name': 'Kandil PORTAL TEST ' + run_id}))
    return dict(run_id=run_id, absent=not any(counts.values()) and not path_for(run_id).exists(),
                counts=counts, manifest_exists=path_for(run_id).exists())
