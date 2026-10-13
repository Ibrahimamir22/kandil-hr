# S4 — fixed bilingual event messages

13 October 2026. **S4 remains in progress.** New historical request, vacancy-team and application-assignment notifications use fixed Arabic and English text. Stored notification history is unchanged; external email remains disabled.

## Implemented behavior

- Request submission, individual approval, return, rejection, revision, HR review/correction, CEO routing, cancellation, pending-quantity revision, applied amendment, vacancy lifecycle/priority/team and existing joining outcomes have explicit bilingual labels. Approval messages state that an approval was recorded; they do not imply the whole request is approved.
- A request becoming Closed still produces the distinct once-only completion notice, now bilingual. The text explicitly includes filled, closed and cancelled vacancies.
- HR's skipped-route notice contains a readable request/position summary and reviewed vacancy or self-interest explanations. It no longer dumps a JSON object or principal account identities. Unknown diagnostic reasons direct HR to the recorded route without echoing arbitrary text. The requester's separate minimal route update remains unchanged.
- Vacancy-team and application-owner messages explain the assigned work in both languages. Application messages contain no candidate identity, phone, private note or reason; their reference remains the authorized Job Opening.
- Templates are independent of the actor's language. Existing command receipt, outbox identity, access recheck, escaping and local MIME-capture mechanisms are retained. Old queued and delivered rows are not rewritten.

## Verification

- [Final native regression](evidence/s2-regression-712fc036729e.json): **56 checks passed** — 16 requester-event/privacy/MIME cases, 3 completion/replay cases, 11 ownership/handoff cases, 12 authority/audit cases and 14 inbox/privacy cases. Real commands exercise bilingual local delivery, language changes, command replay, revocation, known/unknown skipped-route reasons and minimal assignment payloads. Source stayed unchanged during the run.
- [Final browser run](../portal/evidence/notification-events-11060b39bf5e/results.json): **26 checks passed** through ordinary requester/manager/HR/CEO/outsider sessions. Original request and amendment approvals, separate original/child access, stale-reminder suppression, bilingual ordinary messages, searchable event labels and original-request navigation were verified. All seven fixture accounts were disabled and fixture capacity ledgers reconciled to zero.
- [Four-capture visual review](../portal/evidence/notification-events-11060b39bf5e/visual-review.json): ordinary and amendment messages inspected in Arabic mobile RTL and English desktop. No clipped content observed. Production-module fingerprints match the final native run; no frontend source/build change was needed.

The first attempt passed event and completion tests but stopped before ownership tests because its explicit discovered-test count still expected 10. Updating that count to include the new eleventh case resolved the harness issue. This was not a production-code failure. The initial attempt is [863c52149a47](evidence/s2-regression-863c52149a47.json); the intermediate passing subset is [efa40f593a63](evidence/s2-regression-efa40f593a63.json). The final 56-check run above uses the finished human-readable labels.

## Remaining scope

Immediate current-authority-bound delegate invitations are still open. This checkpoint improves existing historical events; it does not grant or advertise new approval authority. Complete S4 event/recipient policy, removed-member/lead-only notification decisions and S5 candidate ownership acceptance remain explicit in the [notification matrix](S4_NOTIFICATION_MATRIX.md).

Local Notification Log receipts are verified for vacancy/application assignments; the existing MIME capture supports Hiring Request references only. No claim is made that vacancy/application emails were captured or sent. HR wording and policy acceptance, provider setup, independent security review, sustained 1,000+ account capacity, migration and production rollout remain open. All 98 reference requirements are preserved.
