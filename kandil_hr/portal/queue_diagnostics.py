"""CLI-only local parity queue inspection; never runs workers or external jobs."""
import hashlib
import json
import re
from collections import Counter

import frappe

PATTERN = re.compile(r'(?:rec-[0-9a-f]{10}-(?:requester|manager|hr|sector)|portal-[0-9a-f]{12}-(?:requester|manager|hr|recruiter|sector|outsider))@example\.invalid')


def guard():
    if frappe.local.site != 'kandil-parity.localhost' or not frappe.conf.get('allow_tests') or not frappe.conf.get('mute_emails'):
        raise RuntimeError('Requires muted isolated parity site')


def collect():
    from frappe.utils.background_jobs import get_queue, get_queue_list
    guard()
    counts, candidates = Counter(), []
    for name in get_queue_list():
        q = get_queue(name)
        for job in q.jobs:
            site, method = job.kwargs.get('site'), job.kwargs.get('method')
            counts[(name, site or 'unknown', str(method))] += 1
            if site != frappe.local.site or method != 'frappe.core.doctype.user.user.create_contact': continue
            user = job.kwargs.get('kwargs', {}).get('user')
            identity = getattr(user, 'name', None) or (user.get('name') if isinstance(user, dict) else '')
            if PATTERN.fullmatch(identity or '') and not frappe.db.exists('User', identity):
                candidates.append(job)
    digest = hashlib.sha256(json.dumps(sorted(j.id for j in candidates)).encode()).hexdigest()
    return counts, candidates, digest


def inventory():
    counts, candidates, digest = collect()
    return dict(queues=[dict(queue=k[0], site=k[1], method=k[2], count=n) for k,n in sorted(counts.items())],
                obsolete_synthetic_contacts=len(candidates), candidate_digest=digest,
                rule='Queued parity User contact job with exact synthetic identity and no existing User; no job arguments returned')


def contact_states():
    from frappe.utils.background_jobs import get_queue, get_queue_list
    guard(); counts=Counter()
    for queue in get_queue_list():
        for job in get_queue(queue).jobs:
            if job.kwargs.get('site') != frappe.local.site or job.kwargs.get('method') != 'frappe.core.doctype.user.user.create_contact':continue
            user=job.kwargs.get('kwargs',{}).get('user')
            identity=getattr(user,'name',None) or (user.get('name') if isinstance(user,dict) else '')
            found=frappe.db.get_value('User',identity,'enabled') if identity else None
            counts[(type(user).__name__,bool(identity),bool(PATTERN.fullmatch(identity or '')),found, bool(identity and identity.endswith('@example.invalid')))]+=1
    return [dict(object_type=k[0],identity_present=k[1],exact_synthetic_pattern=k[2],enabled=k[3],invalid_domain=k[4],count=v) for k,v in counts.items()]
