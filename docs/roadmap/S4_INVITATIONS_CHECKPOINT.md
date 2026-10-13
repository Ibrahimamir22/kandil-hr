# S4 — event-triggered approval invitations

13 October 2026. **S4 remains in progress.** Authorized request and delegation changes now schedule invitation generation after their transaction commits. Invitations are separate from historical requester updates and business-day reminders.

## Behavior and boundaries

- A Pending request save schedules a short-queue job. Creation of an active APPROVALS/ALL delegation, or personal CEO approval changing it to Active, also schedules a job for matching pending requests. Future-dated grants are excluded until effective. Revocation never revives a suppressed message.
- The worker reads the latest committed request and current authority under Company/request/account locks. Jobs for a step that already advanced generate only the currently active audience; inactive requests produce no invitation. Duplicate jobs converge on one outbox identity.
- The active principal and valid approved delegates receive a fixed bilingual invitation; Board steps use the frozen Chair and Vice. TEAM-only, expired, future, revoked, disabled and self-interested authority cannot authorize delivery. CEO delegation still requires the CEO's personal approval.
- `approval_invitation_v1` binds request revision, step, principal, waiting timestamp and recipient authority. It has a distinct invitation stage and cannot be disguised as an SLA reminder or requester/HR-contact message. It reuses current-authority and cross-version delivered-effect deduplication.
- Invitations do not wait for day-2 reminders or require the business calendar. Generation is asynchronous after commit, not a zero-latency promise. **Local delivery follows the existing outbox worker schedule**, including retry/backoff and current access checks. General shared workers remain stopped in the review environment.
- The scheduler hook includes a catch-up scan for missed jobs and newly effective grants. Its timed execution and deployment-scale scan performance are still unverified at this checkpoint. The scan handles each request in a separate transaction and records sanitized failures.
- Background entry points reject HTTP and ordinary non-worker calls. Actual Frappe jobs can run as their initiating user without changing HTTP session identity; every recipient is independently rechecked. Job parameters carry record identifiers, not private notes or authority grants.

## Evidence

| Evidence | Result |
|---|---|
| [Final native regression](evidence/s2-regression-39fb3bccac8d.json) | **86 passed:** 12 invitation, 18 reminder-recipient, 27 SLA/calendar, 10 delegation, 3 outbox-access and 16 requester-event cases. Includes before-SLA/calendar-independent delivery, current-role/revocation checks, CEO and Board authority, future effective date, terminal replay, context rejection and after-commit hook wiring. |
| [HTTP + real RQ worker + browser](../portal/evidence/invitations-ab814b475cd6/results.json) | **23 passed:** normal HTTP actions produced real Frappe post-commit jobs; exact cohort jobs were transferred to a private queue and executed with SimpleWorker/execute_job. Generation was not manually substituted. Unrelated short-queue jobs were preserved. Exact local outbox delivery was invoked separately by CLI. Delegate revocation/regrant, actual delegate/Board decisions, outsider exclusion and bilingual inbox passed. |
| [Visual review](../portal/evidence/invitations-ab814b475cd6/visual-review.json) | AR mobile RTL and EN desktop inspected; both message languages and actions fit. |
| Cleanup | Nine test accounts disabled, grants revoked, fixture capacity balances zero, exact invitation jobs retired and private queue empty. No external email, general worker or shared backlog flush. |

The initial [native attempt](evidence/s2-regression-291593c76e6d.json) used a backdated delivery clock but the real queue timestamp, so notices correctly remained Pending. Aligning both test clocks resolved the harness mismatch; the final run passed. Native and browser fingerprints match the changed production modules. The browser-only worker fixture was added after the native run and has its own recorded fingerprint.

## Next work and acceptance

Reconcile the eight frozen S4 IDs against the [event matrix](S4_NOTIFICATION_MATRIX.md); verify periodic invitation catch-up in an isolated scheduler environment, finish remaining event-policy and selector gaps, and continue S5 candidate ownership/workspace. Template, calendar and recipient policy remain subject to HR acceptance. External email, independent security, sustained 1,000+ account capacity/recovery, migration, hosting and rollout remain open. All 98 frozen requirements remain tracked.
