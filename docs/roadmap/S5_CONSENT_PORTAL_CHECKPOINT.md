# S5 connected candidate consent checkpoint

Date: 2026-10-14. Full scope remains all 98 requirements. The connected issuance/acceptance journey is implemented and tested; CAN-004/S5 and release acceptance remain partial because revocation, withdrawal, retention, talent pool, downstream eligibility and Screening/reopening are unfinished.

## User journey

The candidate workspace has **Candidate privacy and consent / خصوصية المرشح والموافقة**. An authorized recruiter reviews the published employer wording and records a reason before issuing or replacing a seven-day invitation. The current issuer can explicitly copy a private link; issuance sends nothing and records no acceptance. Another issuer cannot retrieve that capability. Expiry, replacement, changed notice and acceptance are visible after refresh.

The separate `/candidate-consent` page presents employer, role, privacy contact, expiry and exact notice in Arabic or English. It uses explicit acceptance and a separate transfer choice only when required by that notice. The page removes its fragment immediately and keeps the capability in memory only. Closing an unchecked page records no consent. The page explains contact options and the evidential limit: a bearer response is not independent identity verification. A staff session cannot use this path to accept for a candidate.

Both issuance and acceptance freeze the attempted payload after an uncertain response and offer the same retry. The backend preserves one acceptance and original notice evidence. A new notice invalidates pending links but does not rewrite recorded acceptance. No candidate stage, headcount, next action or message-delivery outcome changes.

## HTTP and deployment boundary

- `privacy/wsgi.py` rejects wrong methods/content types, missing/foreign Origin, cross-site fetch metadata, query arguments and bodies outside 1–4096 bytes **before Frappe parses the public endpoint body**. The endpoint accepts a JSON envelope with `application/octet-stream`, deliberately keeping its bearer credential out of Frappe's generic JSON/form capture. Unsupported JSON requests must hit this boundary, not the stock parser.
- An unwrapped Frappe server fails closed for this feature, even with the site setting enabled. Consent requires `kandil_candidate_consent_enabled`, candidate identity, the internal transport marker and telemetry disabled. CLI service tests do not set this HTTP marker.
- The public adapter clears cached request bytes, rejects extra fields, catches service errors, rolls back failures and returns generic errors. Unexpected faults log only an error class and random incident identifier, without traceback/payload/message. The page and APIs use no-store, no-referrer, no-sniff and scoped CSP/frame protection.
- Redis counters atomically limit the public endpoint to 120 requests/IP/minute and 3,000/site/minute. The global limit remains relevant behind a proxy; trusted-proxy configuration, shared-IP workload tuning and upstream body/connection controls require production review.
- Link capabilities never belong in query strings, analytics, local/session storage, ordinary receipts or audit text. Explicit clipboard copy is an intentional disclosure to the authorized issuer; the clipboard must be treated as sensitive by the person sharing it.
- Production deployment must use `kandil_hr.privacy.wsgi:application` behind the approved HTTPS proxy, with no request-body logging, query-free access-log formatting and correctly configured trusted proxy headers. The local helper `python -m kandil_hr.privacy.serve --site ...` is restricted to the two named synthetic sites and disables the development debugger. It is not the production deployment recipe or load certification.
- `deployment/consent.parity.compose.yaml` is a tracked overlay for the existing local parity service. It changes only that web process; workers, company-data services and Odoo are untouched.

## Verification

- **49 native checks passed**: `evidence/s2-regression-2f30802522d9.json` (8 transport/error checks, 25 consent service checks, 16 notice regressions), with unchanged Python source, zero skips and rolled-back fixtures.
- **45 connected browser checks passed**: `../portal/evidence/candidate-consent-c1390c2eb2ec/results.json`. Real Guest/HR/recruiter sessions exercised issue/copy, frozen exact retries after lost responses, explicit acceptance/transfer choices, concurrent identical issuance and acceptance, acceptance versus replacement, expiry, changed/unpublished notice, permissions, native access denial and unchanged candidate/capacity snapshots. Forced server failure produced a generic retry; malformed/wrong-format/oversized/cross-origin requests and exhausted quota were rejected. Synthetic capabilities were absent from server console/file logs, Error Log, command receipts/audit and actual monitor records. No browser errors or external requests. Cleanup disabled all six disposable users, cleared fixture capacity ledgers and restored candidate/consent/monitor leases; historical test records remain labelled synthetic.
- Four final screenshots manually inspected: `../portal/evidence/candidate-consent-c1390c2eb2ec/visual-review.json`. Arabic mobile and English desktop wording/controls fit; plaintext markup is displayed literally. Timestamp precision remains a cosmetic follow-up.
- **32 preserved-review browser checks passed**: `../portal/evidence/review-work-1792000308360/results.json`. The existing personal login sees the new empty consent panel in AR/EN; all review business digests stayed unchanged, with no browser errors, 5xx or external requests.
- Review activation evidence: `evidence/consent-review-activation-2026-10-14.json`. Two empty tables were installed, the feature flag enabled, and only the review web process recreated with the guard. No notice/consent/application/account data was seeded or reset. The personal account was not elevated and its password was not changed.
- Build passed. Existing font runtime-resolution and >500 kB bundle advisories remain; these are not load proof. Upstream dependency pins remain unchanged.

Native/browser checks do not constitute independent security, privacy-owner, 1,000+ capacity or production acceptance. No real candidate communication, production wording or legal certification is claimed.

### Failures found and resolved

The first transport unit test incorrectly passed a mock stream through Werkzeug’s test request builder; the boundary is now tested directly for no body reads. Browser runs exposed an unstable accessible textarea label and untranslated status text after language switching; both were fixed. The duplicate-issuance race exposed a real older-snapshot read: after waiting for the Company lock, the receipt key was current but loading its document used a consistent read. The receipt document now uses `for_update=True` as well, preserving authorization and exact replay. The final real concurrent requests passed. Failed/superseded browser runs (`aedd589718fb`, `3d6e1ccb8d89`, `ced0c5fc62e9`, `effccd1c9b4e`, `7a1227af71c4`) retain cleanup evidence; one fixture-command failure completed cleanup and did not recur. Earlier native runs (`6a5988f44007`, `aa5f1aae683c`, `413923b48bf3`) are superseded, not additive totals.

## Review locally

Open `http://kandil-review.localhost:8112/hr-portal` → **Candidates / المرشحون** → a candidate → **Candidate privacy and consent / خصوصية المرشح والموافقة**. The existing personal recruiter sees no issued link because no company notice has been published in that review dataset. Issuance requires the configured full-company HR authority to publish wording first. This checkpoint does not auto-publish a legal or sample policy to make the button appear. Complete synthetic issuance and Guest acceptance are evidenced on the separate disposable parity cohort.

## Remaining work

Explicit emergency link revocation; consent withdrawal, reconsent/retention/purpose and talent-pool controls; candidate document uploads; approved policy consumption by canonical Screening/interview/offer paths and leadership reopening; all remaining S5–S12 requirements. HR/privacy owners still approve actual employer wording and choices. IT still owns production identity/hosting/proxy/logging decisions, independent security, 1,000+ workload, backup/migration/recovery and staged release gates.
