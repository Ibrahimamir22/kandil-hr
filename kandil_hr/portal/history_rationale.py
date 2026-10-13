"""Public explanation of the captured route, never a fresh route evaluation."""

from kandil_hr.portal.request_history import deny


def rationale(route):
    if not isinstance(route, dict):
        deny()
    if not route:
        return None
    resolved = route.get('resolved', {})
    policy = route.get('policy', {})
    interests = route.get('interest_snapshot', {})
    if not all(isinstance(v, dict) for v in (resolved, policy, interests)):
        deny()
    skipped = []
    for source, expected, code in ((resolved.get('skipped', []), 'Vacant or no enabled linked user', 'VACANT_AUTHORITY'),
                         (route.get('skipped', []), 'Personal interest: requester, creator, beneficiary or own position', 'PERSONAL_INTEREST')):
        if not isinstance(source, list) or any(not isinstance(r, dict) for r in source):
            deny()
        for row in source:
            # Deliberately authority-level. Excluded users/assignments and old
            # position scopes are not established by these legacy route rows.
            skipped.append(dict(authority=scalar(row, 'authority'), reason=code if row.get('reason') == expected else 'UNRECOGNIZED_CAPTURE'))
    rules = policy.get('authority_rules', [])
    if not isinstance(rules, list) or any(not isinstance(r, dict) for r in rules):
        deny()
    return dict(as_of=scalar(resolved, 'as_of'), interest_checked_on=scalar(interests, 'evaluated_on'),
                skipped=skipped,
                rules=[{k: scalar(row, k) for k in ('authority', 'from_date', 'to_date', 'modified', 'reason')}
                       for row in rules],
                basis='captured_route_policy', identity_scope='authority_level')


def scalar(row, key):
    value = row.get(key)
    if value is not None and not isinstance(value, str):
        deny()
    return value
