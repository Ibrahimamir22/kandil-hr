"""Candidate workspace adapters; existing ownership commands own all effects."""
import json

import frappe
from frappe import _

from kandil_hr.candidates import identity
from kandil_hr.recruitment import ownership
from kandil_hr.recruitment.vacancy_access import check_opening, identity_labels
from kandil_hr.foundation.teams import candidate_access


def authorize(request, payload):
    """Current read/write scope on preparation and replay, not cached UI hints.

    An original owner may recover their completed handoff while still on the
    team. Only the domain handler authorizes a new handoff/follow-up effect.
    """
    opening = frappe.get_doc('Job Opening', payload['opening'], for_update=True)
    check_opening(request, opening)
    app = frappe.get_doc('Job Applicant', payload['application'], for_update=True)
    if app.job_title != opening.name or not candidate_access(opening, request):
        frappe.throw(_('Application work is outside your current recruitment scope.'), frappe.PermissionError)
    app.check_permission('read')
    app.check_permission('write')
    return app


def execute(operation, name, opening_name, application, application_version,
            expected_version, command_id, owner, reason, task=None, due=None):
    # Called by durable recovery after Company/request scope locks. Validate the
    # supplied references; the native command checks versions and fresh authority.
    identity.guard()
    request = frappe.get_doc('Kandil Hiring Request', name, for_update=True)
    authorize(request, dict(opening=opening_name, application=application))
    args = dict(name=application, owner=owner, reason=reason, command_id=command_id,
                expected_version=expected_version, application_version=application_version)
    if operation == 'owner':
        result = ownership.assign_application(**args)
    else:
        result = ownership.set_next_action(**args, task=task, due=due)
    return dict(application=result['name'], application_version=result['modified'],
                owner=result['owner'], next_action_owner=result['next_action_owner'],
                ownership_state=result['ownership_state'])


def change_owner(**args):
    return execute('owner', **args)


def set_followup(**args):
    return execute('followup', **args)


@frappe.whitelist(methods=['GET'])
def context(name, start=0, page_length=10):
    from kandil_hr.portal.candidates import access, readable_application
    from kandil_hr.portal.organization import bounded_text, paging
    access()
    app = readable_application(bounded_text(name))
    offset, limit = paging(start, page_length)
    hints = ownership.actions(app.name)
    history = json.loads(app.custom_kandil_ownership_history or '[]')
    selected = list(reversed(history))[offset:offset + limit]
    references = [app.custom_kandil_responsible_user, app.custom_kandil_next_action_owner]
    references += [row['user'] for row in hints.get('owners', [])]
    for row in selected:
        references.append(row.get('actor'))
        for state in ('before', 'after'):
            references += [(row.get(state) or {}).get(field) for field in
                           ('custom_kandil_responsible_user', 'custom_kandil_next_action_owner')]
    labels = identity_labels(references)

    def project(state):
        return dict(owner=labels.get(state.get('custom_kandil_responsible_user')),
                    next_owner=labels.get(state.get('custom_kandil_next_action_owner')),
                    task=state.get('custom_kandil_next_action') or '',
                    due=state.get('custom_kandil_next_action_due') or None)

    return dict(application=app.name, application_version=str(app.modified),
                request=frappe.db.get_value('Job Opening', app.job_title, 'custom_kandil_request'),
                opening=app.job_title, expected_version=hints.get('expected_version'),
                can_manage=bool(identity.enabled() and hints.get('can_manage')),
                owners=[row for row in hints.get('owners', []) if row['user'] in labels],
                owner=app.custom_kandil_responsible_user if app.custom_kandil_responsible_user in labels else None,
                next_owner=app.custom_kandil_next_action_owner if app.custom_kandil_next_action_owner in labels else None,
                task=app.custom_kandil_next_action or '', due=app.custom_kandil_next_action_due,
                history=dict(rows=[dict(action=row.get('action'), reason=row.get('reason'),
                    actor=labels.get(row.get('actor')), at=row.get('at'),
                    before=project(row.get('before') or {}), after=project(row.get('after') or {})) for row in selected],
                    total=len(history), start=offset, has_more=offset + limit < len(history)))
