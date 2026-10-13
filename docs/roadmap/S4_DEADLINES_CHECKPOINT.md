# S4 — approval dates and calendar-aware queued reminders

13 October 2026. **S4 remains in progress.** The custom portal now displays the current approval step's follow-up dates in Arabic and English. Queued reminders use the same company calendar before local delivery. Expiry remains advisory: no automatic rejection, reservation release or payroll action.

## Behavior delivered

- Request detail includes waiting-start date, elapsed working days, day-2 reminder, day-3 escalation, day-4 warning and day-5 advisory expiry. The server calculates dates in Cairo, excluding the start date and configured weekends/holidays. The panel labels the policy as awaiting HR confirmation, highlights the currently due stage and shows non-working-day guidance.
- A queued earlier milestone is suppressed when a later milestone is due, even if the request is still pending at the same approval step. Existing revision/step/principal/waiting-date identity checks remain.
- A current milestone waits through weekends, holidays or a calendar change that postpones its date. Postponement preserves Pending/Retry status and attempt count, creates no receipt/capture and stores the next attempt in the site's timezone. Technical failures still use bounded retry backoff.
- If a calendar correction brings the same milestone forward, the internal scheduler wakes the existing calendar-deferred row when due. Its stable event key is preserved. Routine replay does not reset technical retry backoff or revive terminal outcomes.
- Current calendar reads occur after the company/domain locks and before recipient locks. Revoked-recipient suppression takes precedence over calendar configuration errors. Already-delivered history does not depend on later calendar availability.
- The GET-only deadline endpoint first checks authenticated account and request access. Responses use no-store and contain no calendar identifiers, holiday descriptions or recipient lists. Invalid/missing/ambiguous calendar configuration produces a generic unavailable state. Refresh clears previous data; an unauthorized response cannot retain dates in this panel.

The panel is a read-only projection of configured policy, not a new calendar editor or a promise that a particular reminder has been delivered. Calendar administration remains in the restricted native forms. The displayed dates and the existing recipient policy still require HR confirmation.

## Verification

| Evidence | Result and boundary |
|---|---|
| [Native regression](evidence/s2-regression-497a08f76775.json) | **45 checks passed:** 27 SLA/calendar/projection/access cases, 3 current-reference delivery cases, 1 independent-connection principal-disable case and 14 requester-event cases. Includes weekend deferral, calendar correction, obsolete milestone suppression, retry preservation, UTC conversion, no receipt on error, privacy and unchanged pending reservations. |
| [Deadline HTTP/browser](../portal/evidence/deadlines-26dfb4cf6875/results.json) | **20 checks passed:** real requester/outsider sessions, guest and POST rejection, no-store, unchanged request state, four milestones, AR mobile RTL/EN desktop, current-stage label, no overflow, unavailable calendar and revoked-session refresh. Source hashes retained. |
| [Original hiring regression](../portal/evidence/browser-9bc7ebc0c81c/regression.json) | **24 browser checks passed:** existing submit/approval/revision, vacancy assignment, mobile denial/input retention, logout and scope separation. Synthetic cohort retired with zero capacity commitments. |
| Frontend build | TypeScript and Vite build passed; compiled portal assets included. The existing runtime-served Arabic-font paths produce Vite resolution notices; actual browser captures render the font. |
| [Visual review](../portal/evidence/deadlines-26dfb4cf6875/visual-review.json) | Final Arabic mobile and English desktop full-page captures inspected. Four readable date cards, advisory text, refreshed-state handling and direction/layout verified within this focused scope. |

The native runner verifies unchanged Python source during execution. The browser evidence fingerprints the relevant endpoint, calendar, notification and frontend code. The original journey has its own full Python/frontend source snapshot. Mutating suites ran serially on synthetic sites; company-data site 8100, shared worker backlog, upstream pins and external email were not changed. Only the 8102 web service was restarted to load updated code.

The earlier [native attempt](evidence/s2-regression-141811bbf337.json) failed one new assertion: its expected ledger represented approved open slots instead of still-pending reserved seats. The assertion was corrected to require the intended reserved state; production behavior was not weakened.

The first [browser attempt](../portal/evidence/deadlines-e8bbf58453ae/results.json) encountered stale imported Python in the no-reload web process. Restarting the specific test web service resolved it. The next [attempt](../portal/evidence/deadlines-c5c17e8dbae8/results.json) asserted the refreshed state before React rendered the response. The harness now waits for both response and unavailable-state text. The subsequent [20-check pass](../portal/evidence/deadlines-21b61c7f548e/results.json) had cropped screenshots partly obscured by the responsive navigation animation; the final run captures full pages after animations settle. Failed results remain failed and all four deadline cohorts were retired with six disabled users and zero capacity commitments each.

## Review locally

Open `http://localhost:8102/hr-portal`, sign in with your personal test account and open an accessible hiring request. The **Approval follow-up dates / مواعيد متابعة الاعتماد** panel is below the hiring details and before the decision timeline. A draft/completed request shows no pending step; a pending request without exactly one valid company calendar shows an unavailable message. Do not change a real company's calendar merely to make the demonstration appear complete.

## Still open and next

S4-04 and S4-05 stay **in progress**. Reconcile the full event/recipient/template matrix, current delegation and Board-recipient semantics, remaining searchable organization selectors and S5 candidate-facing ownership. The earlier isolated scheduler/recovery evidence remains at its own source checkpoint; this increment has not rerun the timed worker rehearsal or proven concurrent calendar editing by administrators.

HR must confirm business calendars, escalation/recipient rules, templates and Arabic terminology. External email remains unconfigured. All 98 frozen requirements, S5–S12, identity/MFA decisions, independent security review, sustained 1,000+ account workload/recovery, HR/IT UAT, hosting and production rollout remain open. This checkpoint does not certify production readiness.
