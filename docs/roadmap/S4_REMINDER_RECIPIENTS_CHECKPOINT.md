# S4 — current-authority approval reminders

13 October 2026. **S4 remains in progress.** Scheduled approval follow-up now includes valid delegates and the frozen Board Vice, with authority checked again before local delivery. No external email is sent.

## Behavior

- Day-2 reminders and day-4 warnings reach the active principal and effective APPROVALS/ALL delegates. Board steps use the frozen Chair and Vice instead of ordinary delegation. Day-3 escalation uses current configured HR/Sector contacts. Advisory expiry combines these audiences and the requester. Required roles, scope, dates, CEO approval and self-interest rules remain enforced.
- Delivery is bound to the request revision, step, principal, waiting timestamp, milestone and exact recipient authority. Broad independent recruiter read access does not preserve a revoked delegate's actionable reminder.
- Suppressed notices stay suppressed. A fresh valid delegation creates a distinct pending instruction. A restarted waiting timestamp also has a distinct identity. One person receives a milestone only once even when multiple authority bases overlap or change; already-delivered history is preserved.
- Subjects and minimal bodies contain fixed Arabic and English text, stable across retries and actor locale. No private decision reason or delegation identifier appears in the message. Expiry explicitly says automatic rejection is disabled.
- Undelivered legacy v2 reminders are suppressed and regenerated as v3 by the normal scheduler. Historical delivered receipts remain unchanged. Shared-site workers were not started or backlog flushed.

## Verification

- [Final focused native run](evidence/s2-regression-dc1dd380c7f0.json): **63 checks passed** — 27 SLA/calendar cases, 18 recipient cases, 3 current-access delivery cases, 1 independent-connection principal-disable scenario and 14 requester-event cases. Includes multiple eligibility bases, two pending authority versions, waiting restart, revoked/read-capable delegates, CEO approval and frozen Board membership. Source remained unchanged during the run.
- [Earlier broader native run](evidence/s2-regression-c735994eb0e7.json): **89 checks passed**, including 17 Board and 10 delegation cases. This predates the final delivered-milestone deduplication guard; the final focused run covers that guard.
- [Final browser run](../portal/evidence/reminder-recipients-c768f22a9c58/results.json): **20 checks passed** with ordinary requester, Sector, delegate, HR, CEO, Board Vice and outsider sessions. Revoked delegated notices were suppressed despite independent read access; a fresh grant delivered once and supported a real approval. The frozen Vice received a reminder and completed the Board decision. All nine synthetic accounts were disabled, grants revoked and fixture ledgers reconciled to zero.
- [Visual review](../portal/evidence/reminder-recipients-c768f22a9c58/visual-review.json): AR mobile RTL and EN desktop captures inspected; no clipped content observed. Mixed-direction text wraps on mobile; final HR wording and broader localization acceptance remain open.
- Native and browser source fingerprints match for the changed production modules. No frontend build change was needed.

An earlier failed native run is retained in [944696eb584b](evidence/s2-regression-944696eb584b.json): the test expected the wrong existing CEO status label; correcting the assertion to `Pending CEO` resolved it. The earlier [88-check run](evidence/s2-regression-673a5aeb33b0.json) and [browser journey](../portal/evidence/reminder-recipients-88d23d484ed1/results.json) remain historical evidence, not final-source proof.

## Limits and next work

These are synthetic tests with ordinary-role browser sessions and exact-cohort local delivery. Browser setup controls the waiting date and invokes queue/delivery directly; it does not prove timed scheduling of v3. The previous isolated scheduler checkpoint remains separate evidence at its recorded source. No new simultaneous two-delivery test or sustained capacity claim is made for the authority-version guard.

The [notification matrix](S4_NOTIFICATION_MATRIX.md) keeps the remaining work explicit: fixed bilingual ordinary-event templates, human-readable skipped-route HR messages, immediate current-authority-bound delegate invitations, complete event coverage and S5 candidate ownership. HR calendar/recipient/wording acceptance, external email, independent security, 1,000+ account capacity, migration and production rollout remain open. All 98 frozen requirements remain unchanged.
