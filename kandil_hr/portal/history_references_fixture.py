"""CLI synthetic retained route-reference attachment; personal-session HTTP proof."""
import hashlib
import json

import frappe
from kandil_hr.portal import fixture, history_files_fixture
from kandil_hr.portal.route_preview_fixture import load
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist


def prepare(run_id):
    guard(run_id);result=history_files_fixture.prepare(run_id);data=load(run_id)
    name=data['history_file']['revision']
    value=json.loads(frappe.db.get_value('Kandil Request Revision',name,'snapshot_json'))
    route=json.loads(value['route_snapshot'])
    # Model a retained vacant-authority identity in synthetic immutable history.
    # Current request data is intentionally unchanged to isolate historical access.
    route['resolved']['skipped'].append(dict(position=data['positions'][1],authority='Department Approval',
                                           reason='Vacant or no enabled linked user'))
    value['route_snapshot']=json.dumps(route);raw=json.dumps(value)
    frappe.db.set_value('Kandil Request Revision',name,'snapshot_json',raw)
    data['history_file']['snapshot_sha256']=hashlib.sha256(raw.encode()).hexdigest()
    data['allowed_history_positions']=sorted({value['requested_position'],*[s['position'] for s in route['resolved']['steps'] if s.get('position')]})
    if data['positions'][1] in data['allowed_history_positions']:raise RuntimeError('Fixture needs separate historical authority')
    persist(fixture.path_for(run_id),data);frappe.db.commit();return result


def restrict(run_id):
    guard(run_id);data=load(run_id);user=data['users']['requester']['email']
    for name in data['allowed_history_positions']:
        frappe.get_doc(dict(doctype='User Permission',user=user,allow='Kandil Position',for_value=name,
                           apply_to_all_doctypes=1)).insert(ignore_permissions=True)
    frappe.clear_cache(user=user);frappe.db.commit()
    return dict(restricted_historical_position=True,current_department_grant_unchanged=True)


def inspect(run_id):
    guard(run_id);return history_files_fixture.inspect(run_id)


def cleanup(run_id):
    guard(run_id);return history_files_fixture.cleanup(run_id)
