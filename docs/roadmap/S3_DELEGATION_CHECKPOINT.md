# Sprint 3 — delegation portal checkpoint

13 October 2026. The delegation part of slice 4 is implemented and verified on the isolated synthetic site. Board evidence, complete request-review history, HR acceptance and production gates remain open. This does not close S3 or the 98-requirement goal.

## What is connected

Open the custom portal at `http://localhost:8102/hr-portal`, then **Delegations / التفويضات**. Scoped Sector administrators can create a 1–90-inclusive-day delegation, choose APPROVALS/TEAM/ALL, revise it into a new immutable version, and revoke it with a fresh reason. Search, status filtering and pagination happen on the server. Participants are selected from a bounded scoped directory; it does not expose User profiles. Company/department choices reuse visible organization Positions; a department without a configured visible Position needs organization setup first.

The UI separates a grant's stored approval state from the processes actually effective today. Future, expired, disabled-account and revoked authority must not be presented as presently effective. Each real request action still rechecks current scope, roles and personal interests. TEAM/ALL are delegation scopes, not a claim that later transfer/probation screens or additional payroll/account permissions are implemented.

Delegating the configured CEO's authority starts **Pending CEO**. Only that CEO can approve or reject it. A replacement version revokes the old grant and requires new CEO approval; the old decision remains recorded. Ordinary grants cannot delegate Board authority. The Board workflow remains the next part of slice 4.

Every mutation has a review-before-confirmation screen. CEO/revise/revoke screens show the reviewed record's holder, delegate, company, department, inclusive dates, process and original reason alongside the proposed action. Rejected input is retained. Detail preserves the original reason, CEO decision and separate revocation reason, and links to the prior version.

## Implementation and access boundaries

- `frontend/portal/src/Delegations.tsx`: bilingual list, searchable selectors, creation, revision, CEO decision, revocation and historical detail, with mobile RTL layout.
- `kandil_hr/portal/delegations.py`: bounded personal-session GET projections and POST commands. It reuses native Delegation validation and the existing revise/decide commands. It returns only `{name, operation}` after writes; internal receipt keys and private audit envelopes are excluded.
- Create/revoke are serialized by Company, then sorted User locks. Audit and minimal command receipt are in the same database transaction as the model change. Exact concurrent retries return one effect; reused command IDs with changed input fail. Replay requires current access. Revocation can stop a grant even after the delegate account is disabled.
- The UI keeps an already-successful mutation result until the follow-up detail fetch succeeds, avoiding another create during that same mounted form. Recovery across browser reloads is still the existing open limitation; this is not a durable offline command queue.
- The dedicated test fixture creates six synthetic accounts/company records, revokes all cohort grants and disables all accounts afterward. It does not use the main company's data, change real review credentials, send external email or run shared workers.

## Final evidence

| Check | Result | Evidence |
|---|---|---|
| Native adapter, native delegation/audit, portal and recruitment regression | 76 passed | [Native run](evidence/s2-regression-6dcaabdeb994.json) |
| EN desktop and AR 390px personal-session delegation workflow | 41 passed | [Delegation browser run](../portal/evidence/delegations-8f6043507e32/results.json) |
| Original request → approvals → vacancy, return/revision, stale decision, mobile denial and logout | 24 passed | [Original journey](../portal/evidence/browser-af0fc6b4a164/regression.json) |
| TypeScript and Vite build | Passed, 42 modules | Rebuild with `npm --prefix frontend/portal run build` |
| Scoped screenshot review | Completed for listed views | [Visual review](../portal/evidence/delegations-8f6043507e32/visual-review.json) |

Native total: 21 portal delegation cases, 10 original delegation cases, 8 audit cases, 11 existing portal cases and 26 recruitment commands. It includes 90/91-day and both date boundaries; process isolation; CEO pending/reject/reapproval; no self-delegation/Board delegation; stale versions; disabled users; revoked administrator scope; limited directory pagination; audit failure rollback; and revocation between viewing a request and delegated approval.

The browser checks include ordinary Sector/CEO/delegate/outside-scope sessions; create/revise/revoke; independent CEO grant decision; retained prior decisions; 91-day rejection with editable retained input; simultaneous duplicate create/revoke HTTP requests; GET, missing-CSRF and Guest denials; and no observed JS exceptions, HTTP 5xx or external traffic. All six accounts were disabled and cohort commitments reconciled after each final run. The original journey's separate fresh cohort also has cleanup evidence. These are scoped tests, not full accessibility, security certification or representative sustained load.

## Diagnostic evidence retained

- Native `28cca6c94785`: four fixture count assertions initially included pre-existing grants in the shared synthetic company. Counts were corrected to the test's own unique department. No product authority rule was weakened.
- Native `7bb0992b1109`: portal cases passed and the original delegation suite executed all 10 cases with zero failures/errors/skips, but its legacy summary lacked a PASS/successful field. The runner now recognizes that exact suite format only when all discovered cases execute and all failure/skip counts are zero.
- Browser `0eadf862ac1a`: navigation test expected a button instead of the actual link. No business flow had executed; its six accounts were cleaned.
- Browser `662a6134fa50`: 39 checks passed before visual review added the reviewed grant summary to the CEO confirmation screen.
- Browser `9d190d5f615a`: 41 checks passed on final product source; a full-page revoked-history capture retained the sticky header at the current scroll position. The final harness explicitly scrolls to the top before capturing that view. The final 41-check run uses the current harness and clean screenshots.

## Next and remaining gates

Next: Board Chair/Vice decisions and authorized on-behalf recording, with private evidence upload/read checks, CEO-before-Board order, self-interest exclusions and current-authority revalidation. Then connect server-filtered My Requests and full permission-filtered frozen request/decision comparisons, including remaining legacy Arabic event labels.

All 98 frozen requirements remain. The historical 80-case register remains 72 passed / 4 partial / 4 blocked; this checkpoint does not silently change those expected results. HR/IT terminology, configured roles/identity/MFA, independent security assessment, sustained 1,000+ account workload, backup/restore, hosting, real-data authorization, UAT and release remain separate acceptance gates. The active goal remains unchanged.
