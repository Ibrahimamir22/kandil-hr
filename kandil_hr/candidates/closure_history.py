"""Append-only closure cycles and current-state projections.

This checkpoint provides history reads, not permission to reopen a candidate.
Reopening insertion deliberately remains disabled until the candidate-owned
consent and reviewed leadership command can create the complete transaction.
Tests insert synthetic event rows directly to exercise repeated cycles.
"""
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.query_builder.functions import Count
from pypika import Order

DT = 'Kandil Candidate Reopening'
CLOSURE = 'Kandil Candidate Closure'


class KandilCandidateReopening(Document):
    def validate(self):
        frappe.throw(_('Reopening requires the candidate-consent and reviewed leadership workflow.'), frappe.PermissionError)

    def on_trash(self):
        frappe.throw(_('Candidate decision history cannot be deleted or renamed.'), frappe.PermissionError)

    def before_rename(self, *args, **kwargs):
        self.on_trash()


def active_query():
    """Compatible with older sites sharing source but not yet migrated.

    No event table means the previous one-closure model. This read fallback
    neither installs schema nor enables candidate mutations on another site.
    """
    c = frappe.qb.DocType(CLOSURE)
    q = frappe.qb.from_(c)
    if frappe.db.table_exists(DT):
        r = frappe.qb.DocType(DT)
        q = q.left_join(r).on(r.closure == c.name).where(r.name.isnull())
    return q, c


def active(application, current=False):
    q, c = active_query()
    q = q.select(c.name).where(c.application == application).limit(2)
    rows = (q.for_update() if current else q).run()
    if len(rows) > 1:
        # Do not pick an arbitrary closure when history is inconsistent.
        frappe.throw(_('Application decision history needs administrator review.'))
    return rows[0][0] if rows else None


def active_decisions(applications):
    if not applications:
        return {}
    q, c = active_query()
    rows = q.select(c.application, c.decision).where(c.application.isin(applications)).run(as_dict=True)
    result = {}
    for row in rows:
        if row.application in result:
            frappe.throw(_('Application decision history needs administrator review.'))
        result[row.application] = row.decision
    return result


def reopened(closure, current=False):
    if not frappe.db.table_exists(DT):
        return None
    name = frappe.db.get_value(DT, {'closure': closure}, 'name', for_update=current)
    return frappe.get_doc(DT, name, for_update=current) if name else None


@frappe.whitelist(methods=['GET'])
def history(name, start=0, page_length=5):
    """Private, bounded history through current candidate access on every read."""
    from kandil_hr.portal import candidates
    from kandil_hr.portal.organization import bounded_text, paging
    from kandil_hr.recruitment.vacancy_access import identity_labels
    from kandil_hr.candidates import messages
    candidates.access()
    app = candidates.readable_application(bounded_text(name))
    offset, limit = paging(start, page_length)
    c = frappe.qb.DocType(CLOSURE)
    q = frappe.qb.from_(c).where(c.application == app.name)
    total = q.select(Count(c.name)).run()[0][0]
    rows = q.select(c.star).orderby(c.creation, order=Order.desc).orderby(c.name).limit(limit).offset(offset).run(as_dict=True)
    current = active(app.name)
    results = []
    for row in rows:
        done = messages.resolution(row.name)
        event = reopened(row.name)
        labels = identity_labels([row.actor] + ([event.actor] if event else []))
        status = done.outcome if done else 'CANCELLED' if event and row.message_status == 'Pending' else row.message_status
        results.append(dict(
            name=row.name, decision=row.decision, current=row.name == current,
            reason_code=row.reason_code, reason_label_ar=row.reason_label_ar, reason_label_en=row.reason_label_en,
            internal_note=row.internal_note, candidate_message=row.candidate_message,
            recorded_at=str(row.creation), actor_label=labels.get(row.actor),
            message_status=status, resolution=messages.projection(done) if done else None,
            reopening=dict(name=event.name, reason=event.reason, recorded_at=str(event.creation),
                           target_stage=event.target_stage, actor_label=labels.get(event.actor)) if event else None))
    return dict(application=app.name, rows=results, total=total, start=offset,
                page_length=limit, has_more=offset + limit < total)


def schema_proof():
    """CLI-only synthetic schema-upgrade evidence; no row contents returned."""
    import hashlib
    import json
    if (frappe.local.site not in ('kandil-parity.localhost', 'kandil-review.localhost')
            or frappe.session.user != 'Administrator' or getattr(frappe.local, 'request', None)
            or not frappe.conf.get('mute_emails')
            or not (frappe.conf.get('pause_scheduler') or frappe.conf.get('allow_tests'))):
        raise RuntimeError('Isolated muted synthetic CLI sites only')
    tables = {}
    for dt in (CLOSURE, DT, 'Kandil Candidate Message Resolution', 'Job Applicant',
               'Kandil Candidate Activity', 'Kandil Capacity', 'Kandil Command Audit'):
        if not frappe.db.table_exists(dt):
            tables[dt] = None
            continue
        rows = frappe.get_all(dt, fields=['*'], order_by='name asc', limit_page_length=0)
        tables[dt] = dict(count=len(rows), sha256=hashlib.sha256(
            json.dumps(rows, sort_keys=True, default=str).encode()).hexdigest())
    return dict(site=frappe.local.site, tables=tables,
                application_unique=bool(frappe.db.get_column_index('tab'+CLOSURE, 'application', unique=True)),
                reopening_unique=bool(frappe.db.get_column_index('tab'+DT, 'closure', unique=True)) if frappe.db.table_exists(DT) else None)
