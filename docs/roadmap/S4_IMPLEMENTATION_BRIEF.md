# S4 — vacancy operations and notifications

The [current-authority reminder checkpoint](S4_REMINDER_RECIPIENTS_CHECKPOINT.md) verifies effective delegates, frozen Board Vice, revocation checks, fixed AR/EN milestone payloads and duplicate prevention across authority changes with 63 native and 20 browser checks. The [event matrix](S4_NOTIFICATION_MATRIX.md) keeps ordinary templates and immediate delegate invitations open. S4 is still in progress.

The [native scheduler checkpoint](S4_SCHEDULER_CHECKPOINT.md) verifies automatic reminders, due retries, disabled-recruiter fallback and worker-restart redrive with 15 integration checks and 35 focused native cases. The deadline/calendar UI has separate verified evidence; complete delivery policy/templates remain open.

The [worker recovery checkpoint](S4_WORKER_RECOVERY_CHECKPOINT.md) verifies real isolated RQ process crashes before/after commit, bounded retries, reasoned operator recovery and revoked-recipient suppression with 35 checks. Scheduled retry/redrive and disabled-recruiter fallback are now covered by the newer scheduler checkpoint; complete templates and candidate-facing ownership acceptance remain open.

13 October 2026. Delivery contract derived from the custom portal and domain commands. The dedicated read model and AR/EN queue are now implemented; queue evidence is in [the vacancy checkpoint](S4_VACANCY_QUEUE_CHECKPOINT.md), and complete-team editing/bulk assignment with paginated recruiter lookup is in [the team checkpoint](S4_TEAM_ASSIGNMENT_CHECKPOINT.md). Reviewed lifecycle/pin controls are recorded in [the lifecycle checkpoint](S4_VACANCY_LIFECYCLE_CHECKPOINT.md). Exact scoped dashboard totals and paginated approvals are recorded in [the dashboard checkpoint](S4_DASHBOARD_CHECKPOINT.md); the [notification inbox checkpoint](S4_NOTIFICATION_INBOX_CHECKPOINT.md) now connects delivered messages with current-reference privacy. Complete ordinary event/template coverage and immediate delegate invitations remain. S3 engineering verification passed separately; HR/IT and production gates remain open.

The [requester-event and reminder checkpoint](S4_NOTIFICATION_EVENTS_CHECKPOINT.md) adds minimal AR/EN amendment/route-skip updates, scoped original-baseline access for submitted amendment reviewers, stale approval-step reminder suppression and event-time inbox ordering. Native scheduled execution now has separate evidence; final event/recipient policy remains open.

## Scope and existing code

The eight frozen delivery IDs are REQ-007, PRI-001 and VAC-001 through VAC-006. Their final acceptance remains tied to the original 98-item register. Recruitment application ownership is shared with S5; S4 must not claim complete candidate ownership acceptance without those workflows.

`recruitment/vacancies.py` already implements transactional team assignment, bulk assignment, reasoned pinning and Open/Hold/Resume/Freeze/Unfreeze/Close transitions. Commands reuse request version and receipt rules and update capacity under locks. `priority.py` supplies explainable score components. `ownership.py` handles disabled-recruiter handoffs. Reuse these commands; do not create a second set of vacancy business rules in the UI.

At the start of S4, `frontend/portal/src/main.tsx` exposed vacancy cards and lead assignment only. The dedicated `VacancyQueue.tsx` now uses `portal/vacancies.py`; the limitations below remain relevant to the old overview and native queue paths. `portal/api.py::overview` derives vacancies and approvals from one page of requests and explicitly reports page counts. `recruitment/vacancies.py::queue` loads every permitted opening, filters/sorts in Python, then slices. Neither is the final searchable, counted queue suitable for the stated scale. The former lead picker stopped at 500 candidates; the custom portal now uses scoped paginated lookup and complete-team review. The custom portal now uses the dedicated dashboard summary and approval query instead of overview; the legacy overview remains explicitly page-scoped for compatibility. The legacy native queue is not the custom portal read model.

## Slice 1 — dedicated vacancy read model and portal

Add a dedicated bounded, scoped vacancy endpoint and React screen. Query approved request lines linked to their exact openings; enforce both native opening and parent request permissions, including every location and native User Permissions, before count and pagination. Do not infer permission from a visible card or returned action hint.

Return minimal request/position/location labels, requested/approved/joined/closed/remaining quantities, active state, authorized lead/team identities, expected parent version, priority components and allowed actions. Separate active, paused/frozen and terminal states. Search and filters must be server-side: own team, unassigned, state, company/department/branch and request text. Return total for the exact filter and stable ordering with a unique tie-breaker. Priority ordering must match the pure reference function at date boundaries and pin expiry; pinning requires a reason and expiry.

Implement bounded recruiter lookup that validates the whole request scope and enabled recruitment role. Preserve restricted historical identities without treating them as current eligible choices. Include empty, loading, permission-denied and stale-version states in AR/EN, RTL, keyboard and mobile layouts.

**Proof:** several pages with mixed permitted/forbidden and multi-location records; exact count/no gaps; live revocation; guessed opening/request pairs; large recruiter directory; priority ties/date boundaries/pin expiry; requested versus approved values and partial-fill arithmetic; no list-induced writes.

## Slice 2 — team and lifecycle operations

Connect existing assign_team, bulk_assign, pin and set_state contracts. Keep one owner for a candidate application in S5, with a visible lead and multiple vacancy team members here. Review selected locations and expected versions before bulk confirmation. An uncertain response retries the same command; a changed payload cannot reuse that identity. Bulk selection cannot bypass scope or state checks for any selected parent.

Expose open, pause/resume, freeze/unfreeze and reasoned close according to the domain state machine. Display which commitments remain after each action. Parent cancellation uses the request command. Unresolved candidate disposition, actual joiners and existing headcount must remain protected; never reduce capacity merely because a screen hides a row.

**Proof:** positive actions and denied wrong-role/state/scope cases, duplicate commands, simultaneous conflicting writes, stale multi-parent bulk rollback, partial fills, pause/freeze restoration, final vacancy closure and parent reconciliation. AR/EN browser tests must exercise real commands, not only mocked cards.

## Slice 3 — company-wide counts and action inbox

Replace overview's page-derived totals with independent scoped aggregate queries. Keep request-register permissions and exact count behavior. The dashboard must distinguish requests awaiting the viewer, vacancies needing assignment and overdue actions. Global search means all records within the user's permission scope, with explicit pagination; candidate search remains S5.

Reuse the notification outbox and provide an in-app inbox with stable paging, exact unread count, authorized reference links and idempotent read actions. Suppress content when the account or referenced record is no longer permitted. Notifications for every request decision/edit need recipient and event coverage, including skipped authority and HR corrections, not just successful email enqueue calls.

**Proof:** records outside the first request page affect counts correctly; counts and queue reconcile; no cross-company or stale-notification disclosure; disabled users and revoked references; repeated mark-read and notification delivery have one effect.

## Slice 4 — scheduled delivery and failure recovery

`recruitment/sla.py` already defines Cairo business-day milestones and advisory expiry. `foundation/outbox.py` delivers local Notification Logs only. It does not send email. Keep that distinction visible. PD-05 automatic rejection remains disabled pending HR confirmation and complete scheduler semantics; do not silently turn an expiry notice into a business rejection.

Verify milestones with controlled Cairo time, weekends, holidays, late execution, deduplication, changed/revoked authority, failed retries and disabled-recruiter handoff. Prove an isolated scheduled execution runs without a browser visit. Use a dedicated synthetic queue/cohort or isolated scheduler environment; do not start a general worker against accumulated shared-site jobs. Retain failure diagnostics without private payloads. Email templates can be inspected in local capture; an external provider and real recipients require their separate approved setup.

## Delivery order and exit

1. Read-model contract, exact scoped queries and queue tests.
2. AR/EN queue and team/lifecycle actions with ordinary-account browser proof.
3. Server-wide dashboard counts and notification inbox.
4. Isolated scheduled execution, failure/restart recovery and local email-template capture.
5. Reconcile all eight frozen IDs, affected S3 regressions, ledgers and stored audit history; publish source and evidence to GitHub.

Shared database tests run serially. No upstream Frappe/HRMS changes, Odoo integration, external messaging or real employee data are part of these slices. S11 must measure sustained representative 1,000+ account load and recovery; correctness at a few records does not prove that capacity.
