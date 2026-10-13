# S4 — reference-aligned team assignment notifications

13 October 2026. **60 native and 37 browser checks passed.** Final English desktop and Arabic mobile screenshots were visually reviewed. S4 engineering continues into S5 shared candidate/ownership clauses; HR and release acceptance remain open.

## Reference and changes

Inspected clean reference commit `7824be24292c4743b4005e14e2df540786cfe167`: `src/Vacancies.gs::vacancyAssign_` (lines 189–231) treats a lead/support role change as a new assignment and excludes the actor from their own alert. `vacancyAssignMany_` (lines 236–279) groups assignment notifications per person across the batch. This was a concrete implementation gap, not an undefined policy question.

- Single-vacancy assignment now notifies newly added members and retained members whose lead/support role changed, excluding the actor. The bilingual body accurately says the assignment changed rather than claiming every recipient was newly added. Removal alone is not a fresh assignment event.
- Reviewed bulk assignment retains the same all-or-nothing domain commands, parent versions, team eligibility, locks, audit trail and idempotent receipts. It collects changed recipients and queues one fixed bilingual summary per recipient for the complete batch.
- A failed summary enqueue rolls back the entire batch, including team changes and receipts. Identical concurrent HTTP commands and delivery retries cannot produce duplicate assignment summaries or local receipts.
- The bulk summary is an account-only historical alert with no company, vacancy/candidate identifiers, counts, reasons or file links. It directs the recipient to the current permission-checked vacancy queue. This avoids putting a mixed set of business references into a body that might outlive access to some of them. Single-vacancy notices retain their existing scoped Job Opening reference. Disabled-account suppression and recipient-only inbox access remain unchanged.
- Requester updates and application-owner messages are separate event families; they are not silently removed by grouping team-assignment notices. Existing stored messages are not rewritten. No external email is sent.

## Evidence

- [Final native run](evidence/s2-regression-22b204bb8c4f.json): **60 passed** — 20 team/directory cases, 26 recruitment commands, 11 ownership cases and 3 outbox-access cases. Includes new role-only, actor exclusion, batch consolidation, replay, actual local receipt, revoked-scope privacy and enqueue-failure rollback checks.
- [First native run](evidence/s2-regression-002c3a62ff24.json) retained: team and command cases passed; one ownership assertion still expected HR's self-notification. It now explicitly asserts that actor alert is absent, verifies the other team member's alert, and retains bilingual/private-data/delivery/replay assertions. The corrected full run passed.
- [Initial browser attempt](../portal/evidence/vacancy-teams-d9fc01e09a9c/results.json) retained: assignment, concurrent batching and receipt checks passed before a navigation locator timed out. The actual accessible link included its unread badge; the harness now accepts that suffix. All 36 accounts were retired and capacity reconciled.
- [Functional browser pass](../portal/evidence/vacancy-teams-34db7c2612d1/results.json): **35 passed**, including ordinary AR/EN team edits, directory paging, actual bulk requests, two simultaneous identical commands, one summary per new recipient, repeated delivery and both recipient inboxes. The Arabic screenshot was captured during the drawer-close animation; final capture waits for animations and verifies viewport fit. Repeated runs are not added to unique case totals.

- [Final browser run](../portal/evidence/vacancy-teams-0b33c81000ba/results.json): **37 passed**, including settled EN/AR viewport assertions. All 36 synthetic accounts retired; all fixture capacity ledgers reconciled to zero. [Visual review](../portal/evidence/vacancy-teams-0b33c81000ba/visual-review.json) confirms readable summaries and closed mobile navigation. Source remained unchanged during the run.

## S5 handoff and remaining acceptance

The reference also supports recruiter-to-recruiter `MOVE_ALL`, preserving lead/support roles while transferring candidate ownership and next actions. The current selected-vacancy team replacement does not satisfy that workflow. It remains explicit under VAC-005 and the [S5 implementation contract](S5_IMPLEMENTATION_BRIEF.md), alongside separate person/application identity, sourcing, private files, consent, imports and follow-up.

The all-or-nothing 50-opening operation and generic summary are documented design choices; they do not prove the reference's separate all-work transfer or a production workload. HR template/recipient/calendar acceptance, live email, identity/MFA, independent audit custody/security, sustained 1,000+ account capacity/recovery, hosting, migration and production rollout remain open. All 98 reference IDs are preserved.
