# S4 recruiter-team assignment checkpoint

13 October 2026. This increment connects the custom AR/EN vacancy portal to complete-team editing and atomic bulk assignment. **S4 remains in progress.** The original 98 requirements and their acceptance scope are unchanged.

## Behavior and boundaries

An authorized, configured HR/sector recruitment authority can review an active or paused vacancy's current lead and full team, choose a lead and multiple members, give a reason and review the replacement before confirming. Existing members remain selected in a single-vacancy edit; an old member who no longer qualifies is shown with a warning and must be explicitly removed. A restricted identity cannot be silently removed through the portal or by guessing the direct command endpoint.

The directory is server-paginated and searchable. Its total and results include only enabled users with the recruitment role, native identity visibility and current management grants covering **every location and requested position of every selected parent request**. It returns minimal identity labels, not User profiles. The old compatibility lookup also uses this scoped query and explicitly refuses truncation if more than 100 results require the new searchable directory.

Queue selection persists across pages, is bounded at 50 openings, and clears when filters or refresh change. The bulk editor lists the affected locations and their current teams; it explicitly replaces the complete team on all selected vacancies. Versions, resource permissions, configured authority and team eligibility are checked on the server. No client-side state can approve a stale batch or allocate headcount.

The existing `recruitment.vacancies.assign_team` and `bulk_assign` commands remain the sole writers. Current native opening/reference permissions are checked inside the command before receipt replay as well as before new mutations. Team changes retain immutable request/audit history and existing application-owner handoff behavior. Failed batches roll back as a whole. A lost response freezes the reviewed input and retries the same command identity; it does not create a new assignment.

## Verification

Native results cover **77 distinct cases** across the following runs:

- [Final team and recruitment-command run](evidence/s2-regression-86b401d89bb1.json): 15 team/directory cases and 26 recruitment-command cases passed after the final current-authority replay protection. A stale read-model authority hint is explicitly mocked while the stored authority has changed; the mutation/replay still denies access using current locked settings and roles.
- [Affected regressions](evidence/s2-regression-0b5e119208f0.json): 10 ownership, 11 portal API and 15 vacancy-queue cases passed before the final authority-read tightening. That tightening is covered by the final 41-case run above. The ownership runner's older schema is accepted only when discovered equals executed, with zero failures, errors and skips.
- The 15 team cases cover bounded lookup, **505 eligible directory identities**, current scope/role/grant validity, multi-request common eligibility, hidden identity protection, native opening restrictions, mismatched links, exact replay, revoked replay authority and stale later-parent atomic rollback. The 505 rows are a synthetic lookup fixture, not 505 login sessions or production load proof.

Final browser evidence covers **80 checks** on the final built portal:

- [29 team-editor checks](../portal/evidence/vacancy-teams-a4b91110e993/results.json): EN desktop and AR mobile review/assignment, directory pages of 25 + 7, scoped search, preservation of existing members, cross-page selection, replacement across different parents, stale-batch atomic rejection and outsider denial. A saved response is deliberately dropped; the UI freezes the input and retries the exact command ID without another revision. Two simultaneous identical HTTP bulk calls return structurally equal successful results, and replay changes no stored team/request version.
- [24 original hiring-journey checks](../portal/evidence/browser-dd30d7e2c0ad/results.json), with [source and cleanup proof](../portal/evidence/browser-dd30d7e2c0ad/regression.json): submit, manager/HR approvals, vacancies, assignment through the new editor, return/revision, stale decisions, mobile capacity denial and session separation. Only the assignment selectors/review step changed in the harness; its business assertions remain.
- [27 vacancy-queue regressions](../portal/evidence/vacancies-f7b3ec1a07ae/results.json): exact totals/pages/search, team/state/location filters, priority explanation, role/scope restrictions and lead revocation still pass with selection controls present.
- [Visual inspection](../portal/evidence/vacancy-teams-a4b91110e993/visual-review.json): final Arabic mobile editor and English desktop confirmation inspected. The lead badge is attached to its own identity to avoid mixed-direction text ambiguity. TypeScript/Vite build and whitespace checks passed; runtime fonts are served from the included local assets. No JS errors, HTTP 5xx or external browser requests were observed in the dedicated team/queue runs.

All team cohorts, including failed diagnostic attempts, disabled their 36 test accounts and reconciled their capacity ledgers. The original journey and queue cohorts also completed their explicit cleanup. The original 98 IDs/reference hash and upstream pins are unchanged. These are bounded synthetic functional/concurrency checks, **not** a sustained 1,000+ account capacity certification, independent security review or HR production acceptance.

### Diagnostic runs retained

- [Earlier native integration run](evidence/s2-regression-d02919cc54a8.json): all 15 team, 26 command and 10 ownership tests passed individually, but the wrapper marked the run FAIL because it did not recognize the ownership suite's result schema. The corrected wrapper and final native runs above preserve the actual assertions; repeated cases are not added to totals.
- [Concurrent-response comparison attempt](../portal/evidence/vacancy-teams-86157e6d1345/results.json): browser single/bulk mutations passed, but bytewise JSON comparison treated receipt key ordering as a difference. The harness now compares the complete parsed structures; it still requires both HTTP responses to be successful and checks that a further replay changes no stored team/request version. [The following 29-check run](../portal/evidence/vacancy-teams-b8ebba00cc8b/results.json) passed before the final authority-read and RTL badge refinements.


- [Initial native attempt](evidence/s2-regression-3f399ae70370.json): 14/15 passed; one fixture-only permission reset called Frappe's queued dynamic-link cleanup and encountered the pre-existing 650-job backlog. The reset now directly removes only that rollback-scoped synthetic User Permission and clears its cache. No worker was started and no queued job was removed.
- [Initial browser attempt](../portal/evidence/vacancy-teams-c6efe42e65d0/results.json): the harness checked the old row count before the requested directory page rendered. The screenshot confirms the new page's seven results; the harness now waits for the expected DOM state.
- [Second browser attempt](../portal/evidence/vacancy-teams-fe47c2652e71/results.json): the EN assignment and lost-response replay passed. The AR test tried to choose that already-selected lead using its correctly disabled button. The AR scenario now chooses a different eligible recruiter, retaining its independent mutation assertions. Both retired cohorts cleaned up successfully.

## Review and next work

On the isolated `http://localhost:8102/hr-portal`, sign in as a configured synthetic recruitment authority and open **Vacancies / الشواغر**. Use **Assign recruiter / إسناد مسؤول** for a single vacancy, or check rows across pages and use **Assign team to selection / إسناد فريق للمحدد**. Search recruiters, choose the lead/members, explain the change, review and confirm. Return to the queue and refresh/review again after a stale selection error.

Test-run accounts are disabled and their capacities reconciled by cleanup; they are not permanent demo logins. Personal review credentials are private and excluded from GitHub. The private review account does not bypass configured approval actors.

Still required in S4: reasoned pinning; full lifecycle controls and unresolved-candidate handling; searchable organization filters; company-wide dashboard counts/search; action inbox; business-calendar reminders; isolated scheduler/retry/restart evidence; disabled-recruiter delivery and local email-template capture. S5 onward, HR/IT acceptance, independent security, sustained 1,000+ account load/recovery, deployment and real-data rollout remain tracked separately. No Odoo, real employee records, external mail or upstream core edits are included.
