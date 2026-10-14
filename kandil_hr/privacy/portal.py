"""Consent HTTP boundary. Raw bearer input bypasses Frappe's JSON/form capture.

Public requests carry a small UTF-8 JSON envelope with application/octet-stream,
not application/json: Frappe's generic error telemetry must not capture credentials.
The adapter consumes/clears the cached body and catches service errors without
logging exception text/locals. Feature activation also requires telemetry off.
"""
import json
import time
import uuid

import frappe
from frappe.utils import get_datetime, now_datetime

from kandil_hr.privacy import consent, notices
from kandil_hr.pilot.api import transactional_retry

PREFIX = '/api/method/kandil_hr.privacy.portal.'
PAGE = '/candidate-consent'
RATE_SCRIPT = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n"


def enabled():
    return bool(getattr(frappe.local,'request',None) and frappe.local.request.environ.get('kandil.consent.transport_checked')
                and consent.identity.enabled() and frappe.conf.get('kandil_candidate_consent_enabled')
                and not frappe.get_system_settings('enable_telemetry'))


def headers(request=None, response=None):
    request = request or frappe.local.request
    if not response or not (request.path == PAGE or request.path.startswith(PREFIX)):
        return
    response.headers.update({'Cache-Control':'no-store, private, max-age=0', 'Pragma':'no-cache',
        'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY',
        'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"})


def rate_bucket(label):
    # Windowed counters are atomic; identifiers are site-scoped and IP is hashed.
    return frappe.cache.make_key('kandil-consent:'+label+':'+str(int(time.time())//60))


def rate_allow():
    keys = [(rate_bucket('site'),3000), (rate_bucket('ip:'+consent.digest(frappe.local.request_ip)),120)]
    return all(int(frappe.cache.eval(RATE_SCRIPT,1,key,120)) <= limit for key,limit in keys)


def fail(status, code):
    frappe.local.response['http_status_code'] = status
    frappe.local.message_log = []
    frappe.local.response.pop('exc',None)
    frappe.local.response.pop('exception',None)
    return dict(error=code)


@frappe.whitelist(allow_guest=True, methods=['POST'])
def respond():
    """No bearer parameter in the RPC argument dictionary or URL."""
    secret_payload = None
    try:
        request = frappe.local.request
        # Clear Frappe's previously cached raw bytes even for rejected requests.
        secret_body = request.get_data(cache=False)
        request._cached_data = b''
        request._cached_json = ({},{})
        if not enabled():
            return fail(404,'unavailable')
        if (request.path != PREFIX+'respond' or request.mimetype != 'application/octet-stream' or request.args or request.form
                or not request.content_length or request.content_length > 4096
                or len(secret_body) > 4096
                or request.headers.get('Origin') != request.host_url.rstrip('/')
                or request.headers.get('Sec-Fetch-Site','same-origin') != 'same-origin'):
            return fail(403,'unavailable')
        if not rate_allow():
            return fail(429,'rate_limited')
        if frappe.session.user != 'Guest':
            return fail(403,'staff_session')
        secret_payload = json.loads(secret_body)
        secret_body = b''
        if not isinstance(secret_payload,dict):
            return fail(403,'unavailable')
        action = secret_payload.pop('action',None)
        fields = {'token'} if action == 'view' else {'token','notice_revision','notice_hash','accepted','transfer_accepted'}
        if action not in ('view','accept') or set(secret_payload) != fields:
            return fail(403,'unavailable')
        return execute_public(action,secret_payload)
    except (frappe.PermissionError,frappe.ValidationError,json.JSONDecodeError,UnicodeDecodeError):
        frappe.db.rollback()
        return fail(403,'unavailable')
    except Exception as error:
        # No traceback, payload, exception message, token or person in logs.
        frappe.db.rollback()
        frappe.logger('kandil_consent',with_more_info=False).error('Consent request failed; type=%s incident=%s',type(error).__name__,uuid.uuid4().hex)
        return fail(503,'retry_same_request')
    finally:
        if isinstance(secret_payload,dict):
            secret_payload.clear()
        if frappe.local.request:
            frappe.local.request._cached_data = b''
            frappe.local.request._cached_json = ({},{})


@transactional_retry
def execute_public(action, secret_payload):
    return consent.preview(**secret_payload) if action == 'view' else consent.accept(**secret_payload)


def guard():
    if not enabled():
        frappe.throw(frappe._('Candidate consent is not enabled.'),frappe.PermissionError)


@frappe.whitelist(methods=['GET'])
def context(application):
    if not enabled():
        return dict(enabled=False)
    request, opening, app, person = consent.authorize(application)
    current = consent.latest(request.company,person.name)
    record = consent.acceptance(request.company,person.name)
    notice = notices.published(request.company,current=True)
    state = 'none'
    if record:
        state='accepted'
    elif current:
        state='pending'
        if get_datetime(current.expires_at) <= now_datetime(): state='expired'
        elif not notice or notice['version'] != current.notice_revision: state='notice_changed'
    live = request.status == 'Approved' and opening.custom_kandil_vacancy_state in ('Open','Partially Filled')
    return dict(enabled=True,state=state,expected_invitation=current.name if current else '',
        notice=notice,expires_at=str(current.expires_at) if current else None,
        can_issue=bool(notice and live and not record),
        can_reveal=bool(state=='pending' and live and current.actor==frappe.session.user and current.application==app.name),
        accepted_at=str(record.accepted_at) if record else None,
        accepted_notice=record.notice_revision if record else None,
        evidence_kind=record.evidence_kind if record else None)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def issue(application, expected_invitation, notice_revision, reason, command_id):
    guard()
    return consent.issue(application,expected_invitation,notice_revision,reason,command_id)


@frappe.whitelist(methods=['POST'])
@transactional_retry
def reveal(application, invitation):
    guard()
    return dict(token=consent.reveal(application,invitation))
