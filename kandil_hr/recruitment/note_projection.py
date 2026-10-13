"""Public explanations for audit notes; never return encoded audit payloads.

The original note remains immutable and private. New derived fields and command
responses expose only a textual reason, or the unchanged ordinary plain text.
"""
import json


def shared_note(value):
    if not isinstance(value, str):
        return ""
    text = value.lstrip()
    if not text.startswith(("{", "[", '\"')):
        return value
    try:
        parsed = json.loads(value)
    except (ValueError, TypeError):
        return ""
    if not isinstance(parsed, dict):
        return ""
    reason = parsed.get("reason")
    return reason if isinstance(reason, str) and len(reason) <= 10000 else ""


def execute():
    """Backfill only new display fields, without touching raw audit bytes/dates.

    Keyset batches make this idempotent and avoid loading an entire HR archive.
    Model sync must run first. No grants, events or external side effects.
    """
    import frappe
    from kandil_hr.recruitment.models import enabled
    if not enabled():
        return
    for kind, raw, public in (("Kandil Hiring Request", "decision_note", "decision_reason"),
                              ("Kandil Recruitment Event", "note", "public_note")):
        last = ""
        while True:
            rows = frappe.get_all(kind, filters={"name": [">", last]},
                                  fields=["name", raw, public], order_by="name asc", limit_page_length=200)
            if not rows:
                break
            for row in rows:
                display = shared_note(row.get(raw))
                if row.get(public) != display:
                    frappe.db.set_value(kind, row.name, public, display, update_modified=False)
            last = rows[-1].name
