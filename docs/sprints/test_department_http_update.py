#!/usr/bin/env python3
"""Actual native HTTP denial when a requester updates the SAME browser-created unit.

Run only after acquiring the parity DB slot. Reuses the retained, cleaned UUID
browser fixture; temporary exact-unit read scope is revoked and requester disabled
in finally. No business records, finance permission, API keys or public endpoints.
"""

import importlib.util
import json
import subprocess
import threading
from datetime import UTC, datetime
from pathlib import Path

APP = Path(__file__).resolve().parents[2]
DEV = APP.parents[3]
RUN_ID = "b6c847d19e20"
OUTPUT = APP / "docs/sprints/evidence/browser/review-views/department-requester-update-rest.json"
CLI = r'''
import hashlib, json, sys
from pathlib import Path
import frappe
from frappe.utils import today
frappe.init(site="kandil-parity.localhost")
frappe.connect()
frappe.set_user("Administrator")
try:
    assert frappe.local.site == "kandil-parity.localhost"
    assert not getattr(frappe.local,"request",None)
    assert all(frappe.conf.get(k) for k in ("allow_tests","mute_emails","kandil_pilot_enabled","kandil_foundation_enabled","kandil_parity_enabled"))
    run_id="b6c847d19e20"
    source=Path(frappe.get_site_path("private", "kandil-browser-"+run_id+".json"))
    data=json.loads(source.read_text())
    assert data["cleaned"] and data["company"]=="Kandil BROWSER TEST "+run_id
    user=data["users"]["requester"]["email"]
    assert user=="browser-"+run_id+"-requester@example.invalid"
    unit=frappe.db.get_value("Department",{"company":data["company"],"department_name":"BROWSER-"+run_id+"-UNIT"},"name")
    assert unit
    manifest=Path(frappe.get_site_path("private", "unit-http-update-"+run_id+".json"))
    def state():
        doc=frappe.get_doc("Department",unit)
        return hashlib.sha256(json.dumps(doc.as_dict(),sort_keys=True,default=str).encode()).hexdigest()
    action=sys.argv[1]
    if action=="prepare":
        assert not manifest.exists(), "Use a fresh proof manifest or inspect prior cleanup"
        account=frappe.get_doc("User",user)
        assert not account.enabled
        assert set(frappe.get_roles(user)).intersection({"Kandil Sector Approver","System Manager","HR Manager"})==set()
        before=state()
        account.enabled=1
        account.save(ignore_permissions=True)
        grant=frappe.get_doc(dict(doctype="Kandil Access Grant",user=user,company=data["company"],department=unit,
            valid_from=today(),can_manage_recruitment=0,can_view_sensitive=0,
            reason="Synthetic same-unit HTTP denial read scope")).insert(ignore_permissions=True)
        evidence=dict(unit=unit,user=user,grant=grant.name,before_sha256=before,cleaned=False)
        manifest.write_text(json.dumps(evidence))
        manifest.chmod(0o600)
        frappe.db.commit()
        print(json.dumps(dict(unit=unit,before_sha256=before)))
    elif action=="inspect":
        proof=json.loads(manifest.read_text())
        after=state()
        print(json.dumps(dict(unit=unit,before_sha256=proof["before_sha256"],after_sha256=after,
            record_unchanged=proof["before_sha256"]==after)))
    elif action=="cleanup":
        if not manifest.exists():
            print(json.dumps(dict(cleaned=True,prepared=False)))
        else:
            proof=json.loads(manifest.read_text())
            grant=frappe.get_doc("Kandil Access Grant",proof["grant"])
            if not grant.revoked:
                grant.revoked=1
                grant.save(ignore_permissions=True)
            account=frappe.get_doc("User",user)
            if account.enabled:
                account.enabled=0
                account.save(ignore_permissions=True)
            frappe.db.commit()
            proof["cleaned"]=True
            manifest.write_text(json.dumps(proof))
            print(json.dumps(dict(cleaned=True,requester_disabled=not frappe.db.get_value("User",user,"enabled"),
                grant_revoked=bool(frappe.db.get_value("Kandil Access Grant",proof["grant"],"revoked")),
                record_unchanged=state()==proof["before_sha256"],audit_retained=True)))
    else:
        raise RuntimeError("Unknown internal fixture operation")
finally:
    frappe.db.rollback()
    frappe.destroy()
'''


def cli(action):
    result = subprocess.run(
        ["docker", "compose", "exec", "-T", "-w", "/workspace/frappe-bench/sites", "frappe",
         "../env/bin/python", "-c", CLI, action],
        cwd=DEV, capture_output=True, text=True, timeout=90,
    )
    if result.returncode:
        raise RuntimeError("Isolated same-unit fixture operation failed: " + action)
    return json.loads([line for line in result.stdout.splitlines() if line.startswith("{")][-1])


def run():
    spec = importlib.util.spec_from_file_location("kandil_http_actor", APP / "docs/sprints/test_concurrency.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    evidence = {"checked_at": datetime.now(UTC).isoformat(), "case_id": "AT-ORG-007-01", "run_id": RUN_ID}
    try:
        fixture = cli("prepare")
        manifest = json.loads((APP.parents[1] / "sites/kandil-parity.localhost/private" /
                               f"kandil-browser-{RUN_ID}.json").read_text())
        actor = module.Actor(manifest["users"]["requester"])
        read = actor.call("frappe.client.get", {"doctype": "Department", "name": fixture["unit"]}, threading.Barrier(1))
        assert read["status"] == 200 and read["body"]["message"]["name"] == fixture["unit"]
        payload = read["body"]["message"]
        payload["department_name"] += "-UNAUTHORIZED-CHANGE"
        payload["custom_kandil_change_reason"] = "Synthetic same-unit HTTP write denial"
        update = actor.call("frappe.client.save", {"doc": json.dumps(payload)}, threading.Barrier(1))
        evidence.update(authenticated_requester=True, csrf_present=True, same_unit=fixture["unit"],
                        read_status=read["status"], update_method="frappe.client.save", update_status=update["status"],
                        exc_type=update["body"].get("exc_type"), state=cli("inspect"))
        evidence["passed"] = update["status"] == 403 and update["body"].get("exc_type") == "PermissionError" and evidence["state"]["record_unchanged"]
    finally:
        evidence["cleanup"] = cli("cleanup")
        OUTPUT.write_text(json.dumps(evidence, indent=2) + "\n")
    if not evidence.get("passed") or not evidence["cleanup"].get("record_unchanged"):
        raise AssertionError("Same-unit HTTP denial or cleanup proof failed")
    print(json.dumps(evidence))


if __name__ == "__main__":
    run()
