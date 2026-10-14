# S5 candidate follow-up queue

14 October 2026. Engineering increment within the unchanged 98-requirement goal. S5 and release acceptance remain in progress.

## Reference and behavior

Reference `src/Candidates.gs:candTasks_` (lines 1104–1159, reference checkout `7824be2`) distinguishes scheduled next actions from new applications without a date. The portal now has **Candidate follow-ups / متابعة المرشحين**, with overdue, today, upcoming and new-without-follow-up buckets, literal candidate search, exact counts and bounded pagination.

The default view shows the signed-in recruiter's dated actions plus readable unassigned new applications. A separately assigned next-action owner takes precedence over the application owner. For legacy records with no next-action owner, the application owner is used; a blank application owner falls back to the vacancy lead. These read-time rules never rewrite assignments. The broader view includes only candidate records already available to the current user's native document permissions and recruitment scope; it is not unrestricted company access.

Counts use the same SQL scope and search as rows, before pagination. Bucket counts retain the selected scope/search while the selected bucket narrows the list. Cairo server date controls due classification. Ordering is overdue, today, upcoming and then unplanned, with deterministic date/creation/ID ties. The API caps a page at 100; the UI uses 20.

Rejected applications and offer journeys with only Joined/No Show/Withdrawn outcomes are excluded. Accepted candidates remain active until an actual terminal offer outcome. Cancelled offers do not hide a candidate. Existing scheduled follow-ups remain visible for readable paused/closed vacancies; new-without-follow-up requires an active/paused vacancy. This matches the reference's distinct next/fresh branches. Opening a row takes the recruiter to the existing candidate detail and its permission-checked work commands; the queue itself is read-only and does not grant edit authority.

## Verification and operational boundaries

- [11 native queue checks](evidence/s2-regression-673c3f5f1c19.json) passed on rollback-scoped synthetic cohorts: exact bucket counts and stable pages, independent owners, legacy fallback without writes, fresh/unassigned selection, terminal/cancelled offer outcomes, paused/closed vacancies, actual native User Permission, team revocation, invalid/literal filters, corrected-person search/minimal projection and Cairo midnight.
- [21 ordinary-role browser checks](../portal/evidence/candidate-queue-69a8767eab2a/results.json) passed: more than one page, chronological buckets, scope and literal search, delayed-response protection, failed-refresh data clearing/retry, opening the actual candidate and saving a clear, Arabic/RTL mobile, role denial/revocation and unchanged identity/capacity counts. Six fixture accounts retired, zero capacity ledgers and restored intake flag were verified. No browser errors, server 5xx or external requests were observed.
- [English/Arabic captures were visually reviewed](../portal/evidence/candidate-queue-69a8767eab2a/visual-review.json). This is not a full accessibility or language acceptance audit.
- The first browser run stopped on a pagination assertion made before rendering settled ([retained failure](../portal/evidence/candidate-queue-4fd9c70c543c/results.json)). The second exposed ambiguous dropdown labels and an unhandled harness wait; its terminal cohort was explicitly cleaned and verified ([cleanup record](../portal/evidence/candidate-queue-d74f44e8b272/results.json)). Product labels now have explicit accessible names. The harness awaits both interaction and response together, waits for render frames, and lets failures reach cleanup. The final full run passed without weakening expected counts or permissions.
- [19 affected native regression checks](evidence/s2-regression-72e370b89c56.json) passed for the existing candidate directory/detail and ownership/recovery contracts.
- [26 existing candidate-work browser checks](../portal/evidence/candidate-work-660a1e704b5e/results.json) passed after the new navigation was added, retaining handoff, independently owned actions, exact recovery, Arabic history, concurrent-command and current-access guarantees. Its synthetic cleanup passed.
- [10 read-only personal-role checks](../portal/evidence/review-work-1791942459894/results.json) passed on the persistent review site after restarting only its web service: the queue and candidate work screen load in EN/AR, the existing login works, business records are unchanged by the smoke check, and no browser errors/5xx/external requests were observed. No review data was reseeded.
- TypeScript/Vite build passed. Existing bundle-size and runtime-font advisories remain; this does not establish production performance.
- After the browser run, only a trailing blank line in the browser fixture was removed for the whitespace check; [AST-equivalence evidence](evidence/queue-fixture-formatting-2026-10-14.json) records that nonfunctional normalization. Product source is unchanged from the final browser run.
- No upstream Frappe, ERPNext or HRMS core or dependency pin was changed. No queue service or scheduler is started by this feature.

## Remaining reference scope

The reference tasks screen also includes rejection-message, duplicate-review, knockout-review and ad-closure work. These depend on remaining S5 sourcing/rejection/review workflows and are not fabricated as completed or zero-work tabs. The new scheduled/fresh queue advances ACT-002; full task-screen and HR acceptance remain open. ACT-001 call/discussion activities and explicit voiding, coded rejection/communications, recruiter-wide MOVE_ALL, full profiles/private files/consent/imports/sourcing and S6–S12 retain their scope.

The persistent review remains synthetic and loopback-only. Independent security review, HR/IT decisions, real-role HR UAT, sustained 1,000+ account capacity, backup/operations, hosting and real-data rollout remain separate gates. Odoo and other company modules remain outside this HR goal.
