"""Opaque company identity with application-derived access, never contact matching.

The basic person profile holds no salary, national ID, private note or hidden-application count.
Activation is explicit until the candidate portal and migration review are ready.
"""
from contextlib import contextmanager
import uuid

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from kandil_hr.recruitment.models import enabled as parity_enabled

DT = 'Kandil Candidate Person'
FIELDS = ('custom_kandil_person', 'custom_kandil_identity_origin',
          'custom_kandil_source_channel', 'custom_kandil_source_detail')


def enabled():
    return parity_enabled() and bool(frappe.conf.get('kandil_candidate_identity_enabled'))


def guard():
    if not enabled():
        frappe.throw(_('Candidate identity intake is not enabled on this site.'), frappe.PermissionError)


def install():
    if not parity_enabled():
        return
    create_custom_fields({'Job Applicant': [
        dict(fieldname=FIELDS[0], label='Candidate Person', fieldtype='Link', options=DT,
             read_only=1, no_copy=1, search_index=1),
        dict(fieldname=FIELDS[1], label='Identity Origin', fieldtype='Select',
             options='\nReviewed intake\nLegacy migration', read_only=1, no_copy=1),
        dict(fieldname=FIELDS[2], label='Application Source Channel', fieldtype='Data', read_only=1, no_copy=1),
        dict(fieldname=FIELDS[3], label='Application Source Detail', fieldtype='Data', read_only=1, no_copy=1),
    ]})


@contextmanager
def effect():
    old = frappe.flags.get('kandil_candidate_identity_effect')
    frappe.flags.kandil_candidate_identity_effect = True
    try:
        yield
    finally:
        frappe.flags.kandil_candidate_identity_effect = old


def deny():
    frappe.throw(_('Use the reviewed candidate identity commands.'), frappe.PermissionError)


class KandilCandidatePerson(Document):
    def autoname(self):
        self.name = 'KCP-' + uuid.uuid4().hex

    def validate(self):
        guard()
        if not frappe.flags.get('kandil_candidate_identity_effect') or not self.is_new():
            deny()
        if self.identity_state != 'Unreviewed':
            deny()
        from kandil_hr.candidates.profile import dump
        self.profile_json = dump(frappe.parse_json(self.profile_json or '{}'))

    def on_trash(self):
        deny()

    def before_rename(self, *args, **kwargs):
        deny()


def new_person(company, profile=None):
    with effect():
        return frappe.get_doc(dict(doctype=DT, company=company, identity_state='Unreviewed', profile_json=frappe.as_json(profile or {}))).insert(ignore_permissions=True)


def applicant_condition(user=None):
    """Include native role and User Permission filters, not just Kandil scope."""
    from kandil_hr.foundation.security import hr_query
    from kandil_hr.recruitment.history_access import user_permissions
    user = user or frappe.session.user
    if not parity_enabled() or user == 'Guest' or not frappe.db.get_value('User', user, 'enabled'):
        return '1=0'
    if not frappe.has_permission('Job Applicant', 'read', user=user):
        return '1=0'
    return f"({hr_query('Job Applicant', user) or '1=1'}) AND ({user_permissions('Job Applicant', user)})"


def query(user=None):
    user = user or frappe.session.user
    if not parity_enabled():
        return '1=0'
    if user == 'Administrator':
        return '1=1'
    return f"`tab{DT}`.name IN (SELECT custom_kandil_person FROM `tabJob Applicant` WHERE {applicant_condition(user)})"


def permission(doc, user=None, ptype=None):
    if ptype not in (None, 'read', 'select', 'report', 'print', 'export') or not doc.name:
        return False
    return bool(frappe.db.sql(f"SELECT name FROM `tab{DT}` WHERE name=%s AND ({query(user)}) LIMIT 1", (doc.name,)))


def validate_applicant(doc):
    old = doc.get_doc_before_save()
    if not parity_enabled():
        return
    # Protect installed references even after the intake switch is disabled.
    if old:
        if any((doc.get(k) or '') != (old.get(k) or '') for k in FIELDS):
            deny()
        return
    if not enabled():
        if any(doc.get(k) for k in FIELDS):
            deny()
        return
    if not frappe.flags.get('kandil_candidate_identity_effect'):
        deny()
    person = frappe.get_doc(DT, doc.custom_kandil_person, for_update=True)
    company = frappe.db.get_value('Job Opening', doc.job_title, 'company')
    if person.company != company or not doc.custom_kandil_source_channel or not doc.custom_kandil_source_detail:
        deny()
    if doc.custom_kandil_identity_origin != 'Reviewed intake':
        deny()
