# S4 notification event and recipient matrix

Engineering inventory, 13 October 2026. **Partial, not HR-approved policy or an external-email specification.** Scope is the frozen reference requirement REQ-007 plus S4 vacancy follow-up. Notification delivery still means a permission-checked local receipt and, for hiring requests, private local MIME capture. Nothing here claims an email was sent.

| Event | Current recipient selection | Reference / meaning | Remaining acceptance |
|---|---|---|---|
| Submit, approve, return, reject, revise, HR review, HR correction, cancel | Requester plus the currently pending principal and frozen Board Vice when applicable, through `recruitment.api.save` | Historical request update; minimal action label, no private decision note | Fixed AR/EN templates implemented; event-triggered authority-bound invitations are separate from historical updates; full matrix closeout and HR wording acceptance remain |
| Pending quantity revision | Same save path, after route restart and quantity/ledger validation | Updated request and revision; old pending notices handled by existing revision logic | Fixed bilingual quantities/restarted-approval wording implemented; final HR terminology and complete event acceptance remain |
| Original requester for an HR-owned amendment | Original requester, against original request | Minimal proposal/submission/decision/revision/cancel update; no child ID/reason/private detail | Existing requester-event tests; HR approval of wording remains |
| Amendment applied | Original requester through original request save | Applied baseline event, distinct from child's decision | Existing event tests; complete template review |
| Vacant authority skipped | Requester gets minimal bilingual route update; frozen HR reviewer receives skipped-route details | Request reference; no synthetic approval silently substituted | Human-readable bilingual position/reason summary implemented without principal identities or arbitrary diagnostics; HR acceptance remains |
| Active approval step / new effective approved delegation | Current principal and valid delegates; frozen Chair/Vice for Board | After-commit short-queue invitation generation; current-step/authority-bound local delivery | Real HTTP/RQ generation and isolated wall-clock scheduled catch-up verified; production operational latency and HR acceptance remain |
| Approval day 2 reminder | Current valid principal, approved effective APPROVALS/ALL delegates, or frozen Chair and Vice for a Board step | Action follow-up, current-step and recipient-authority-bound | Recipient checkpoint tests cover dates/process/CEO approval/interest/revocation; HR recipient policy acceptance remains |
| Approval day 3 escalation | Current configured HR and Sector contacts with valid roles/manage scope | Follow-up escalation | HR must confirm contacts and escalation policy |
| Approval day 4 warning | Same active authority audience as day 2 plus requester | Warning, not a rejection instruction | Fixed AR/EN payload, calendar and recipient checks; HR wording acceptance |
| Approval day 5+ advisory expiry | Active authority audience, current HR/Sector and requester, deduplicated per user | Advisory only; no rejection, capacity release or payroll mutation | HR must confirm expiry policy; automatic rejection stays disabled |
| Vacancy team added or role changed | Newly added members and retained members changing lead/support role; actor excluded | Single update has a scoped Job Opening reference; bulk queues one generic account-only summary per affected recipient | Reference-aligned implementation and native/browser evidence in S4_TEAM_NOTIFICATIONS_CHECKPOINT.md; no business identifiers/counts in batch summary; MOVE_ALL remains S5 |
| Application ownership/task handoff | New owner; references opening without candidate identity or notes | Scoped work queue notification | Fixed AR/EN ownership template implemented; complete S5 candidate workspace and ownership acceptance remain |
| Disabled recruiter fallback | Existing audited unassignment/save path | No silent owner replacement; explicitly unassigned work | Earlier scheduled fallback proven; full candidate-facing acceptance remains S5 |
| Candidate/interview/offer/joining/lifecycle event families | Only existing foundational cases, not a completed event catalogue | Separate S5–S9 workflows | Specify and implement along with those workflows; do not mark complete from S4 evidence |

## Recipient and history rules

Scheduled follow-up is distinct from a historical event. Historical updates may remain useful after an approval step completes; their reference permissions are still checked. An actionable reminder must match the active request revision, step, principal, waiting timestamp and current recipient authority at delivery.

Ordinary delegation never replaces Board membership. A CEO delegate needs the existing personal CEO approval; TEAM-only, future, expired, revoked and self-interested delegates receive no approval reminder. Frozen Board membership follows the reviewed request, while escalation contacts follow current company settings. Read permission alone never establishes an approval-reminder role. A user may retain independent recruiter read access after delegation revocation; that does not authorize delivery of the revoked delegated reminder.

Terminal delivered history is preserved. A suppressed notification is never resurrected. A new valid delegation or restarted waiting timestamp can create a new pending instruction; duplicate delivery of an already-delivered same milestone is prevented separately from authority-version identity. Current calendar deferrals preserve retry attempts and technical failure backoff.

## Next implementation order

1. Review the fixed AR/EN ordinary-event, skipped-route and vacancy templates with HR; retain existing stored messages unchanged.
2. Periodic catch-up now has 10 passing isolated checks in S4_INVITATION_CATCHUP_CHECKPOINT.md. Production worker monitoring/latency and workload acceptance remain.
3. Use S4_REQUIREMENT_RECONCILIATION.md for the eight frozen S4 IDs; selectors and assignment batching now have S4_FILTER_SELECTORS_CHECKPOINT.md and S4_TEAM_NOTIFICATIONS_CHECKPOINT.md evidence; retain HR policy acceptance and S5 handoff gaps without hiding candidate-dependent clauses.
4. Continue S5 candidate workflows and their ownership/notification acceptance.

External provider setup, recipients, consent/privacy rules, delivery failure handling and HR acceptance remain separate gates. Local capture does not satisfy external email delivery, and this matrix does not certify production security or 1,000+ account capacity.
