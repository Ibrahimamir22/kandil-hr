"""CLI-only fresh synthetic portal cohort. Credentials remain in private/ at 0600."""

import json
import secrets
import uuid
from pathlib import Path

import frappe
from frappe.utils import today
from frappe.utils.password import update_password

from kandil_hr.organization.api import transition
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import insert, persist


def path_for(run_id):
    return Path(frappe.get_site_path("private", f"kandil-portal-{run_id}.json"))


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
        insert("User", email=email, first_name=label, enabled=1, send_welcome_email=0,
               user_type="System User", language="ar", roles=[{"role": role} for role in roles])
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
