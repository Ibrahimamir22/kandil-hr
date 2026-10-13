# S4 — requester events, amendment review and stale approval reminders

13 October 2026. Local synthetic engineering checkpoint. **S4 remains in progress.** This extends the delivered-message inbox; it does not certify complete scheduled operation, external email, HR acceptance, independent security or sustained 1,000-account capacity.

## Changes visible to users

- The original requester receives a minimal Arabic/English notice when either HR or the requester proposes an amendment. HR-owned amendments also notify the original requester on submission, review/decisions, return/revision and cancellation. Notices link to the original request and omit the child's ID, private reason, notes and identities. An unchanged original baseline version is preserved so notification creation cannot invalidate the amendment.
- A skipped unavailable approval position now produces a requester notice. The existing detailed HR notice and frozen route audit remain separate. Repeating a command produces no duplicate event/receipt.
- A submitted amendment reviewer can read its original baseline when they have complete current access to the amendment and original. This is a one-level read relationship, not a new role or grant. Draft amendments, unrelated requests, cross-scope records and restricted parent/child links do not grant access. Returning then revising to a draft removes the relationship until a route is submitted again. Frozen submitted history remains reviewable after a decision within current permissions. Native role and User Permissions, all-location grants, independent decision checks, candidate/file/note privacy and write restrictions remain additional boundaries.
- A queued approval reminder is checked against the locked current request revision, active step identity, principal and waiting-start timestamp before creating a receipt or local mail capture. A completed, advanced or restarted step suppresses its obsolete reminder. Previously delivered receipts remain historical records.
- The custom inbox orders and timestamps messages by **event creation**, with a stable outbox-ID tie-breaker. Delayed/reversed delivery no longer rearranges the business-event chronology. Native Desk's feed retains its upstream receipt ordering.

## Implementation and upgrade contract

The optional `Kandil Notification Outbox.delivery_context` JSON field carries validated server-authored approval context. It is included in the immutable-key payload hash for contextual events; ordinary legacy event hashes remain unchanged. The scheduler uses versioned `approval-sla:v2` keys. New context fields are not browser inputs and no new public scheduler endpoint exists.

Legacy queued reminders with the four fixed English SLA subjects and no context cannot prove their step. On delivery they are suppressed with an explicit reason. The versioned scheduler can generate the current due notice; delivered history is not rewritten, old Failed notices require the existing operator recovery path, and suppressed rows are never revived. A malformed or unknown context fails visibly without a receipt instead of bypassing the guard.

Run the normal site migration before restarting workers on a deployment that adopts this schema. In this development checkpoint only the parity site's outbox DocType was reloaded through `frappe.reload_doc`; no other site's database was migrated and no shared worker was started. Production upgrade/restore rehearsal remains S11.

`recruitment/notifications.py` runs inside existing commands and outbox transactions. The original requester is included in the command's sorted account locks for child amendments. `recruitment/amendment_access.py` supplies the same derived baseline relationship to list and document reads, using the non-recursive direct relationship plus native parent/child Link restrictions. Delivery additionally uses its current locking check. The parent does not acquire a write permission merely because it becomes readable for review. The derived relationship never takes a privileged HR/sector shortcut from the role cache; delivery locks the related child routes and all their principals/Board vice accounts before its globally sorted User/authorization checks. A cached former HR role has a negative delivery test.

## Verified native cases

**134 distinct native cases across the incremental checkpoints below; not one frozen full-release certification.** The final inbox/event/SLA run covers the final event-time ordering change. Earlier relevant suites remain valid for their recorded unchanged implementation paths.

- [Initial broad regression](evidence/s2-regression-e4bc019e5c28.json): 79 checks passed: 10 event cases, 15 SLA cases, 3 current-reference delivery cases, 13 inbox cases, 12 authority cases and 26 request-command cases.
- [Expanded access and history regression](evidence/s2-regression-f505b587e5fd.json): 13 expanded event/baseline cases, 1 independent-connection authority race, 14 portal request-history cases, 21 native history-access cases and 14 historical-reference cases passed. The 13 event cases replace the earlier 10 in the distinct count.
- [Final inbox/event/SLA regression](evidence/s2-regression-5c3df1c5a273.json): 14 inbox cases, 13 event cases and 15 SLA cases passed. The additional inbox case reverses delivery order and verifies the original event timestamps and ordering; earlier 13-case inbox results are not counted twice.

The event matrix exercises ordinary requester/manager/HR/CEO commands, actual outbox delivery and permission-filtered inbox reads. It checks original baseline preservation, command replay, enqueue-failure rollback, private-text exclusion, scope revocation and native list/document parity. The SLA suite retains weekend/holiday/day-2/3/4/5, delayed scheduler, failure isolation, rollback, opt-out and internal-only execution tests, adding current/advanced/completed/restarted-step, legacy/malformed-context and historical-receipt cases.

- [Final authorization and history verification](evidence/s2-regression-00d44c3160a1.json): **96 cases passed** against the final current-role/child-principal-lock source: 14 event/baseline cases, 1 independent authority race, 3 delivery cases, 14 inbox cases, 15 SLA cases, 14 portal history cases, 21 native history-access cases and 14 historical-reference cases. The added event case rejects a cached former HR role; repeated suites are not counted twice. The earlier 12 authority and 26 command cases bring the distinct incremental total to 134.

## Browser evidence

The [20-check ordinary-session amendment journey](../portal/evidence/notification-events-be021ec6e041/results.json), [32-check inbox/privacy regression](../portal/evidence/notifications-be225d3c056d/results.json) and [24-check original hiring journey](../portal/evidence/browser-a9ce6b10fbc7/regression.json) passed after event-time ordering. They cover real local login/CSRF and native HTTP reads, HR-owned amendment submission through independent CEO application, requester notices linking to the original without private child text, stale-reminder suppression, AR mobile/EN desktop inbox actions, native notification privacy and the original hiring flow. **76 browser checks**, with all 19 fixture accounts disabled and all cohort ledgers zero after cleanup. The [visual review](../portal/evidence/notification-events-be021ec6e041/visual-review.json) records actual image inspection. These runs precede the final cached-role/child-principal-lock hardening; the final verification below records its source separately.

Earlier [20-check event run](../portal/evidence/notification-events-281466700714/results.json) and [32-check inbox run](../portal/evidence/notifications-9ce738cd5611/results.json) passed before event-time ordering; they are retained and not added again to the distinct count.

## Final browser verification

After the cached-role and child-principal-lock hardening, the [20-check event/amendment journey](../portal/evidence/notification-events-d7ce4da164c3/results.json), [32-check inbox/privacy journey](../portal/evidence/notifications-c886ea23a778/results.json), and [24-check original hiring journey](../portal/evidence/browser-4660a7efec85/regression.json) all passed against the final source. The final [AR-mobile/EN-desktop visual review](../portal/evidence/notification-events-d7ce4da164c3/visual-review.json) is recorded. All 19 final-cohort accounts were disabled and all capacity commitments reconciled to zero. These 76 checks replace the earlier 76 in the distinct browser count; they are not added twice. This remains local synthetic evidence, not HR acceptance or a production release.

## Diagnostics retained

- [9a17a06e63f0](evidence/s2-regression-9a17a06e63f0.json): SLA passed; 7/8 event cases passed. An HR-authored amendment correctly required an independent CEO absent from the initial fixture. Added a distinct scoped CEO; no interest rule was relaxed.
- [08407bd26b22](evidence/s2-regression-08407bd26b22.json): 9/10 event cases passed. The independent CEO exposed a real baseline-read gap for HR-owned amendments. Implemented the bounded submitted-amendment read relationship and added positive/negative native and browser proof.
- [b53ec78693a9](evidence/s2-regression-b53ec78693a9.json): 12/13 expanded cases passed. A return fixture omitted its mandatory reason. Supplied a synthetic reason and retained the product's validation.

Failed evidence remains failed. Native cohorts roll back; committed browser cohorts are cancelled through ordinary commands, have zero remaining capacity commitments and all synthetic accounts disabled.

## Still open

Complete REQ-007 event/recipient/template review across every exceptional route; current escalation-contact/delegation/Board-recipient policy; suppression/defer behavior when a queued milestone ages into another milestone or delivery falls on a holiday; isolated scheduled execution without a browser visit; worker failure/restart/retry recovery; disabled-recruiter handoff; calendar/deadline UI; and external email configuration/approved recipient proof. Controlled CLI calls and mocked scheduler transaction-boundary tests do not prove an actual scheduled worker.

Automatic rejection is still disabled. Reminder expiry cannot reject a request, release a reservation or change wages. HR must confirm the working calendar, escalation/expiry policy and Arabic terms. All 98 reference IDs, future sprints, independent security/UAT and real-data deployment gates remain intact.
