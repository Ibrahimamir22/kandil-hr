"""Public login shell; every data endpoint independently enforces authorization."""

import json
from pathlib import Path

import frappe

no_cache = 1


def get_context(context):
    from frappe.sessions import get_csrf_token

    from kandil_hr.recruitment.models import guard

    guard()
    context.no_cache = 1
    context.portal_csrf = get_csrf_token()
    path = Path(frappe.get_app_path("kandil_hr", "public", "portal", ".vite", "manifest.json"))
    if not path.exists():
        frappe.throw("Build the HR portal frontend before opening this page.")
    manifest = json.loads(path.read_text())
    entry = next(value for value in manifest.values() if value.get("isEntry"))
    context.portal_js = "/assets/kandil_hr/portal/" + entry["file"]
    context.portal_css = ["/assets/kandil_hr/portal/" + css for css in entry.get("css", [])]
