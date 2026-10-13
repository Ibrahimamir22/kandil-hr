"""Immutable request attachment bytes and retained recorded Board proof.

Application-level custody, not protection against privileged database/filesystem
administrators. File/current reads share the decision's File row lock; no Company
lock is acquired from the File lifecycle. Replacement means a new attachment.
"""
import frappe
from frappe import _

FIELDS = ('file_url','file_name','content_hash','file_size','is_private','is_folder',
          'attached_to_doctype','attached_to_name','attached_to_field')


def stored(doc):
    if not frappe.conf.get('kandil_parity_enabled') or not doc.name:
        return None
    rows=frappe.db.sql('SELECT name,'+','.join(FIELDS)+' FROM `tabFile` WHERE name=%s FOR UPDATE',
                      (doc.name,),as_dict=True)
    return rows[0] if rows and rows[0].attached_to_doctype=='Kandil Hiring Request' else None


def before_validate(doc, method=None):
    old=stored(doc)
    if old and any((doc.get(k) or '') != (old.get(k) or '') for k in FIELDS):
        frappe.throw(_('Request attachments cannot be replaced or relabelled. Upload a new file.'),frappe.PermissionError)


def before_content_write(doc):
    if stored(doc):
        frappe.throw(_('Request attachment content is immutable. Upload a new file.'),frappe.PermissionError)


def protect_recorded(doc, method=None, *args, **kwargs):
    old=stored(doc)
    if not old:return
    # Native Link checks protect current steps. Retained audit payloads also
    # protect proof after Return/revise replaces the current child-table steps.
    steps=frappe.db.sql("""SELECT name FROM `tabKandil Approval Step`
        WHERE parent=%s AND parenttype='Kandil Hiring Request' AND board_evidence=%s LIMIT 1 FOR UPDATE""",
        (old.attached_to_name,doc.name))
    audits=frappe.db.sql("""SELECT name FROM `tabKandil Command Audit`
        WHERE domain='recruitment' AND operation='decide' AND target_name=%s
        AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.board_evidence'))=%s LIMIT 1 FOR UPDATE""",
        (old.attached_to_name,doc.name))
    if steps or audits:
        frappe.throw(_('Recorded Board evidence must be retained with its decision history.'),frappe.PermissionError)
