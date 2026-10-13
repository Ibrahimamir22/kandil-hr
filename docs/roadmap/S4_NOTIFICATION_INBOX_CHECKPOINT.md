# S4 notification inbox and current-reference privacy

13 October 2026. Engineering implementation over the custom AR/EN portal. **Engineering verification passed for the inbox slice.** This is the delivered-message inbox slice of S4-04, not completion of reminder scheduling, all event recipients, external email, or the frozen REQ-007 acceptance requirement.

## User behavior

The portal now has Notifications / الإشعارات, a separate unread badge, exact permitted totals, all/unread/read filters, literal subject/body search, stable 25-row pages, refresh, explicit mark-as-read and reference navigation. Opening a hiring-request notification uses the custom request screen. Other supported organization references open the exact native record; account-only alerts have no reference link. Messages render as text, never executable HTML or message-supplied URLs.

Unread totals cover all currently permitted delivered messages, independent of the current search/page. Mark-as-read only sets read=true; repeat and concurrent retries cannot toggle it back or change a hiring decision. Errors clear old displayed content and allow a safe refresh/retry.

## Data and access contract

`portal/notifications.py` joins the existing outbox to its delivered native Notification Log receipt. Both recipients and both reference fields must match. Pending/failed/suppressed events, other recipients and malformed receipt links are excluded before count and pagination. The inbox does not call delivery, start workers, send email or mutate business records.

`foundation/notification_access.py` supplies current-reference conditions for the shared list projection, native Notification Log list/resource permission hooks and the standard notification-feed HTTP override. Supported linked records retain their native role/User Permission and company/department/branch restrictions. Job Opening messages additionally require complete parent request visibility, including child-Link User Permissions. Unknown Kandil reference types fail closed. Reference-less outbox messages are personal informational alerts. Non-Kandil native notifications and preserved sites retain upstream behavior; the opted-in parity flag gates the extra restrictions.

The native feed override removes the upstream HTTP-cache decorator for this HR site while preserving both GET and the native Desk POST feed contract and avoids expanding unrelated User profiles. Responses include a no-store directive. This prevents caching newly served responses; it cannot retract information a person already saw or copied. Refresh/API/native reads after access revocation suppress previously delivered linked content.

Read mutation validates the delivered-receipt query, then locks the domain and current recipient/authorization records before the notification row. Current reference scope, role and relationship checks precede its set-only update. Existing native read-state helper endpoints are not the custom portal mutation path; no new business authority is inferred from a notification.

`permitted_names` now takes an optional explicit user for native permission evaluation; existing callers retain the session-user default. The document-delivery reference adapter reuses its existing captured-scope/JD permission logic. That existing adapter can inspect the recipient's capture metadata while constructing its predicate, so representative large-history timing remains a required S11 measurement, not a performance claim here.

## Evidence

- [Native regression](evidence/s2-regression-52c7b65daffb.json): **49 checks passed**: 13 inbox cases, 3 reference-delivery cases, 1 independent-connection authority-revocation race, 17 dashboard cases and 15 vacancy cases. This covers exact pagination, literal search, read-only state effects, duplicate read actions, recipient isolation, role/grant/date/child-Link restrictions, native list/document privacy, account-only and organization notifications, malformed references and invalid inputs.
- [Final native verification](evidence/s2-regression-02c66abed7ae.json): 13 strengthened inbox cases, 3 delivery cases and the independent-connection authority race passed against the completed permission-query and mutation implementation; the subsequent feed decorator expansion is verified by the final native GET/POST browser checks. The unchanged dashboard/vacancy suites above add 32 cases, giving **49 distinct native cases** across these checkpoints.
- [Final inbox browser acceptance](../portal/evidence/notifications-2e961c76fbbb/results.json): **32 checks passed**, with 30 locally delivered messages across pages, real AR/EN/mobile actions, simultaneous repeat reads, no-store, missing-CSRF denial, another recipient denied, and a revoked request receipt denied through native HTTP even while an account-only alert remains visible. All six cohort users disabled and ledgers zeroed; no JavaScript errors, HTTP 5xx or external requests.
- [Visual review](../portal/evidence/notifications-d447f12d8b6e/visual-review.json): final Arabic mobile and English desktop screenshots inspected.
- [Dashboard browser regression](../portal/evidence/dashboard-5a6eae2a376d/results.json): 34 checks passed after the inbox/badge integration. [Original hiring journey](../portal/evidence/browser-4558a7fb94cf/regression.json): 24 checks passed. These precede the final native predicate grouping and inbox-only timestamp adjustment; the final 32-check inbox run verifies those changes. **90 distinct browser checks across the incremental runs**, not a single simultaneous full-release certification.
- [Pre-compatibility inbox run](../portal/evidence/notifications-d447f12d8b6e/results.json) passed 31 mixed-access checks; the final run adds native Desk POST compatibility. UI source matches the directly reviewed screenshots. This earlier run is not counted twice.
- [Earlier inbox run](../portal/evidence/notifications-d650ee13198b/results.json) passed 31 checks before the mixed-visible/hidden receipt extension; it is retained and not counted twice.

## Diagnostics retained

- [d31c45df785b](evidence/s2-regression-d31c45df785b.json): 9/12 inbox cases passed. Three native permission tests exposed a percent-formatting conflict in the composed SQL LIKE prefix. The managed-type predicate now uses a fixed LEFT comparison; permission expectations are unchanged.
- [eb59a8685374](evidence/s2-regression-eb59a8685374.json): all 13 inbox and 3 delivery cases passed, then the older independent authority fixture hit the shared 650-job queue limit while creating a synthetic user contact. Its exact UUID contact setup now runs synchronously; no shared worker was started, no old job was removed, and the concurrency assertion was preserved and passed on the final run.
- [ec4868277c54](../portal/evidence/notifications-ec4868277c54/results.json): 21 browser checks passed before an overly exact cache-header assertion. The server returned `no-store,no-cache,must-revalidate,max-age=0`; the final harness parses directives and still requires no-store. No product relaxation was needed. Cohort cleanup completed.

- [7344b599029d](../portal/evidence/notifications-7344b599029d/results.json): all 31 browser assertions passed, but cleanup correctly rejected restoring an immutable revoked grant. The fixture now creates a separate audited cleanup grant, cancels through the normal command, disables all six accounts and revokes that temporary grant. [Recovery](../portal/evidence/notifications-7344b599029d/cleanup-recovery.json) verified zero capacity ledgers and retained original grant history. The run remains diagnostic rather than being relabelled PASS.

The final native preservation case also includes an undelivered outbox row with a NULL receipt and an unrelated Department notification. The managed-receipt subquery excludes NULL/blank IDs so SQL three-valued membership cannot accidentally hide unrelated native notifications. This was found during source review; the tightened case is retained. Timestamp display was trimmed to seconds and isolated for Arabic direction after screenshot review.

- [f9eace6203f8](evidence/s2-regression-f9eace6203f8.json) and [c9a76fac885a](evidence/s2-regression-c9a76fac885a.json): 12/13 native cases passed; a second otherwise-visible native alert exposed missing grouping around the permission hook’s complete OR predicate. A named-record check could accidentally match another permitted row. The predicate is now grouped and table-qualified, and the strengthened child-Link case asserts that a hidden receipt remains denied while another receipt is visible.
- [6cfd071eb003](evidence/s2-regression-6cfd071eb003.json): all 13 strengthened inbox cases and 3 delivery cases passed; the repeatedly invoked legacy authority fixture then hit the normal signup throttle. Its exact synthetic User inserts now temporarily use the existing import path, restoring the flag immediately. Signup policy and counters are not relaxed or reset for ordinary users.

## Still open

S4-04 remains in progress: request/decision/edit recipient coverage, business-calendar deadlines and scheduled reminders remain. S4-05 retry/restart recovery, isolated scheduler execution, disabled-recruiter handoff coverage and local template/event review remain. Existing local captures are not external email receipts. HR terminology/policy/UAT, identity/email provider configuration, independent security assessment, sustained 1,000+ account workload, recovery rehearsal and production rollout remain separate gates. All 98 reference IDs and their acceptance definitions are unchanged.
