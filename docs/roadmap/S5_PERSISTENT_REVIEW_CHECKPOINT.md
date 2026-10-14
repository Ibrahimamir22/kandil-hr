# S5 persistent synthetic review

14 October 2026. Local engineering checkpoint; S5 and the full 98-requirement goal remain in progress.

The custom portal is now available at **http://kandil-review.localhost:8112/hr-portal** with persistent examples and candidate mode enabled. [Testing instructions](../portal/PERSISTENT_REVIEW.md) cover personal/approval roles, Arabic/English, candidate intake/corrections, legacy review and unfinished actions. No real HR data was imported.

The new Compose project has its own database, Redis services, network and persistent volumes. It shares the installed pinned development bench and app source; this is not production filesystem isolation. A dedicated hostname keeps browser sessions separate from the `localhost:8102` parity portal. The 8100 company-data site and 8101 older pilot were not changed.

The guarded one-time bootstrap created one synthetic company, a department/position structure, five scoped accounts, three hiring examples (draft/pending/approved), one open vacancy, three person-linked candidates, one legacy candidate and one prepared recovery action. Request approvals and candidate creation use ordinary role-authorized commands after initial organization setup. The personal review account preserves its existing private password and remains a recruiter/requester, not Administrator or the configured HR migration approver. Credentials stay in mode-0600 ignored private files.

## Verification

- [22 review checks passed](../portal/evidence/persistent-review-1403a1066629/results.json): personal sign-in, synthetic label, enabled candidate intake, person detail, pending recovery needing explicit review, configured HR migration capability, out-of-scope denial and Arabic RTL/mobile. English desktop and Arabic mobile candidate captures were visually inspected: cards, labels, controls and pagination fit their viewports. User-entered names/source values may be bilingual; this is not complete Arabic language acceptance.
- Both candidate fixture preparation and cleanup explicitly refused the review site before mutation. Review sets `allow_tests=0`; existing exact-parity fixture guards were not widened.
- The harness ran the real [63-check candidate regression](../portal/evidence/candidates-906740e7d36e/results.json) on 8102 while the persistent review session remained open. All checks passed, six test accounts were retired, fixture capacity reconciled to zero and its temporary candidate flag was restored.
- Before/after hashes and counts matched for review company, requests, capacities, openings, people, applications, recovery envelopes, grants, positions/assignments and command audit. Review activation, account enablement and session survived the independent regression and parity web restart. This establishes preservation for that actual run, not a promise that arbitrary future development cannot break shared code.
- [Infrastructure evidence](../portal/evidence/persistent-review-1403a1066629/infrastructure.json) confirms distinct database identifiers, networks, services/volumes and loopback-only port 8112. Review candidate mode is on; parity mode is restored off. No shared worker was started or backlog drained.
- The first review-harness attempt stopped at an expected rejection assertion because Frappe printed its trace on a different stream than assumed. [That failed result is retained](../portal/evidence/persistent-review-9ccd1f2deef0/results.json). The assertion now checks the actual captured output; the full rerun passed. No permissions were relaxed to fix the harness.

## Operating boundary

`deployment/review.py` provides provision/start/stop/status commands for this installed development bench. Provision refuses existing or partial sites instead of overwriting them; stopping retains database and queue volumes. There is no automated review-data reset. The older account/site is preserved.

Background workers and scheduler are **not running** in this review stack. Consequently scheduled reminders, outbox delivery and automatic expired-buffer cleanup are not active here, even though their separate native rehearsals have passed. Synchronous recovery expiry remains enforced. Outgoing email is muted. This review checkpoint is not a production deployment or standalone arbitrary-server installer.

## Next

Continue S5 candidate ownership, follow-up, rejection/activity and recruiter handoff, alongside the remaining full-profile, sourcing/import, private-file and consent requirements. Keep this human-review environment usable and retain explicit fixture isolation. S6–S12, HR/IT policy decisions, independent security review, sustained 1,000+ account capacity, real-role HR UAT and production release gates remain open. The individual position-change route remains HR + CEO; Odoo and other company modules remain outside this HR goal.
