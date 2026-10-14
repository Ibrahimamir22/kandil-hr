"""Reviewed application-source corrections; original intake evidence is immutable.

Company/request locks serialize with closure, reopening and catalogue edits.
Any recorded closure permanently locks attribution, including after reopening.
Special-source consumers must update their own terms/referrals, never this path.
"""
import json
import uuid

import frappe
from frappe import _
from frappe.model.document import Document

from kandil_hr.candidates import activities, identity, work
from kandil_hr.candidates.intake import text
from kandil_hr.pilot.api import transactional_retry
from kandil_hr.recruitment.api import command
from kandil_hr.sourcing import sources

DT = 'Kandil Source Correction'
SPECIAL = {'REFERRAL', 'AGENCY', 'INTERNAL', 'POOL'}


class KandilSourceCorrection(Document):
    def autoname(self):
        self.name = 'KSC-' + uuid.uuid4().hex

    def validate(self):
        identity.guard()
        if not self.is_new() or not frappe.flags.get('kandil_source_effect'):
            frappe.throw(_('Use reviewed source corrections; history is immutable.'), frappe.PermissionError)

    def on_trash(self):
        frappe.throw(_('Source corrections cannot be deleted or renamed.'), frappe.PermissionError)

    def before_rename(self, *args, **kwargs):
        self.on_trash()


def guard():
    identity.guard()
    if not sources.enabled():
        frappe.throw(_('Controlled application sources are not enabled.'), frappe.PermissionError)


def authorize(request, payload):
    guard()
    app = work.authorize(request, payload)
    if not app.custom_kandil_person:
        frappe.throw(_('Review the legacy identity before correcting its source.'), frappe.PermissionError)
    person = frappe.get_doc(identity.DT, app.custom_kandil_person, for_update=True)
    if person.company != request.company:
        frappe.throw(_('Application identity is outside this company.'), frappe.PermissionError)
    person.check_permission('read')
    return app


def original(app):
    row = frappe.db.get_value(sources.ATTRIBUTION, {'application': app.name},
        ['source_code', 'source_version', 'source_json', 'sub_source'], as_dict=True, for_update=True)
    if row:
        return dict(code=row.source_code, version=row.source_version, source=json.loads(row.source_json), sub_source=row.sub_source, recorded=True)
    # A legacy value is evidence of the stored value only, not an invented
    # match to a catalogue revision. A human may explicitly correct it later.
    return dict(code=app.custom_kandil_source_channel or '', version=None, source=None,
                sub_source=app.custom_kandil_source_detail or '', recorded=False)


def state(app):
    row = frappe.db.sql('SELECT name,sequence,before_json,after_json,content_hash FROM `tabKandil Source Correction` WHERE application=%s ORDER BY sequence DESC LIMIT 1 FOR UPDATE', (app.name,), as_dict=True)
    if row:
        r = row[0]
        return dict(version=r.name, sequence=r.sequence, value=json.loads(r.after_json), hash=r.content_hash)
    value = original(app)
    return dict(version='INITIAL:' + sources.digest(value), sequence=0, value=value, hash=sources.digest(value))


def outcome_lock(app):
    # Query all closures, not only the current closure: a reopen cannot erase
    # the original outcome or make attribution editable again.
    rows = frappe.db.sql('SELECT name,decision,creation FROM `tabKandil Candidate Closure` WHERE application=%s ORDER BY creation,name LIMIT 1 FOR UPDATE', (app.name,), as_dict=True)
    if rows:
        return dict(reason='outcome_recorded', at=str(rows[0].creation))
    if app.status in ('Rejected', 'Withdrawn', 'Accepted'):
        return dict(reason='outcome_recorded', at=None)
    if frappe.db.sql('SELECT name FROM `tabEmployee` WHERE job_applicant=%s LIMIT 1 FOR UPDATE', (app.name,)):
        return dict(reason='employee_linked', at=None)
    if frappe.db.sql("SELECT name FROM `tabJob Offer` WHERE job_applicant=%s AND (custom_kandil_outcome IN ('Joined','No Show','Withdrawn') OR status='Accepted') LIMIT 1 FOR UPDATE", (app.name,)):
        return dict(reason='offer_outcome', at=None)
    return None


def special(value, company):
    item = value.get('source')
    if item:
        return item['kind'] in SPECIAL
    code = value['code'].upper().replace(' ', '_')
    row = next((r for r in sources.state(company, current=True)['items'] if r['code'] == code), None)
    # Known legacy spellings cannot be laundered into ordinary attribution.
    return code in ('REFERRAL', 'AGENCY', 'INTERNAL', 'TALENT_POOL') or bool(row and row['kind'] in SPECIAL)


def validate_input(source_code, source_version, sub_source, reason):
    code = text(source_code, 20)
    version = text(source_version, 140)
    sub = text(sub_source, 140)
    why = text(reason, 1000)
    if len(why) < 3:
        frappe.throw(_('Explain why this application source needs correction.'))
    return code, version, sub, why


@frappe.whitelist(methods=['POST'])
@transactional_retry
def correct(name, opening_name, application, application_version, attribution_version,
            source_code, source_version, sub_source, reason, command_id, expected_version):
    guard()
    code, catalog_version, sub, why = validate_input(source_code, source_version, sub_source, reason)
    payload = dict(opening=text(opening_name, 140), application=text(application, 140),
        application_version=text(application_version, 140), attribution_version=text(attribution_version, 140),
        source_code=code, source_version=catalog_version, sub_source_hash=sources.digest(sub), reason_hash=sources.digest(why))

    def act(request):
        app = authorize(request, payload)
        activities.reviewed(app, application_version)
        before = state(app)
        if before['version'] != attribution_version:
            frappe.throw(_('Source attribution changed. Refresh and review it.'), frappe.TimestampMismatchError)
        if outcome_lock(app):
            frappe.throw(_('An outcome is recorded. Source attribution is permanently locked.'), frappe.PermissionError)
        if special(before['value'], request.company) or app.get('employee_referral'):
            frappe.throw(_('Use the dedicated referral, agency, internal or pool attribution workflow.'), frappe.PermissionError)
        selection = sources.selected(request.company, code, catalog_version)
        if before['value']['code'] == code and before['value']['sub_source'] == sub:
            frappe.throw(_('There is no source or sub-source change to record.'))
        after = dict(code=code, version=selection['version'], source=selection['item'], sub_source=sub, recorded=True)
        values = dict(company=request.company, application=app.name, person=app.custom_kandil_person,
            actor=frappe.session.user, reason=why, sequence=before['sequence']+1,
            previous_revision=before['version'], before_hash=before['hash'],
            before_json=json.dumps(before['value'], ensure_ascii=False), after_json=json.dumps(after, ensure_ascii=False))
        with sources.effect():
            revision = frappe.get_doc(dict(doctype=DT, **values, content_hash=sources.digest(values))).insert(ignore_permissions=True)
        # Only these projections change. Native edits remain unconditionally
        # denied by identity.validate_applicant; no broad mutation flag is added.
        frappe.db.set_value('Job Applicant', app.name, dict(custom_kandil_source_channel=code, custom_kandil_source_detail=sub))
        app.reload()
        activity = activities.append(app, request, 'SYSTEM', '', why,
            labels=dict(kind_label_ar='تصحيح مصدر الترشح', kind_label_en='Application source correction'))
        return dict(application=app.name, application_version=str(app.modified), revision=revision.name,
                    source_code=code, activity=activity.name)

    return command(name, 'candidate_source_correct', command_id, expected_version, payload, act)


@frappe.whitelist(methods=['GET'])
def context(name, start=0, page_length=10):
    from kandil_hr.portal.candidates import access
    access()
    if not sources.enabled():
        return dict(enabled=False)
    guard()
    from kandil_hr.privacy.consent import authorize as scoped
    from kandil_hr.portal.organization import paging
    from kandil_hr.recruitment.vacancy_access import identity_labels
    request, opening, app, person = scoped(name)
    authorize(request, dict(opening=opening.name, application=app.name))
    current = state(app)
    locked = outcome_lock(app)
    dedicated = special(current['value'], request.company) or bool(app.get('employee_referral'))
    offset, limit = paging(start, page_length)
    # Locking reads see the latest committed correction after Company lock.
    rows = frappe.db.sql('SELECT name,actor,reason,creation,before_json,after_json FROM `tabKandil Source Correction` WHERE application=%s ORDER BY sequence DESC LIMIT %s OFFSET %s FOR UPDATE', (app.name, limit+1, offset), as_dict=True)
    more = len(rows)>limit
    rows = rows[:limit]
    labels = identity_labels([r.actor for r in rows])
    return dict(enabled=True, application=app.name, application_version=str(app.modified), request=request.name,
        opening=opening.name, expected_version=str(request.modified), attribution_version=current['version'],
        current=current['value'], original=original_from_history(app), locked=locked,
        dedicated=bool(dedicated), can_correct=not locked and not dedicated,
        options=sources.options(request.company), history=dict(start=offset,has_more=more,rows=[dict(name=r.name,
            actor=labels.get(r.actor), reason=r.reason, at=str(r.creation), before=json.loads(r.before_json), after=json.loads(r.after_json)) for r in rows]))


def original_from_history(app):
    row = frappe.db.sql('SELECT before_json FROM `tabKandil Source Correction` WHERE application=%s ORDER BY sequence LIMIT 1 FOR UPDATE', (app.name,))
    return json.loads(row[0][0]) if row else original(app)


def effective_snapshot(app):
    if not frappe.db.table_exists(DT):
        return None
    row = frappe.db.get_value(DT, {'application':app.name}, 'after_json', order_by='sequence desc')
    if not row:
        return None
    value = json.loads(row)
    return dict(version=value['version'], source=value['source'], sub_source=value['sub_source'])


def schema_proof():
    import hashlib
    proof = sources.schema_proof()
    if not frappe.db.table_exists(DT):
        proof['tables'][DT] = None
    else:
        rows = frappe.get_all(DT,fields=['*'],order_by='name asc',limit_page_length=0)
        proof['tables'][DT] = dict(count=len(rows),sha256=hashlib.sha256(json.dumps(rows,sort_keys=True,default=str).encode()).hexdigest())
    return proof
