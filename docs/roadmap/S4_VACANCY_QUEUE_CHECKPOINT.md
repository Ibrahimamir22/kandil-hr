# S4 vacancy queue — implementation checkpoint

13 October 2026. Scope: the dedicated vacancy read model and Arabic/English portal screen. **S4 remains in progress.** This is a working increment, not acceptance of all eight S4 requirements or production readiness.

## What changed

Previously, the portal derived vacancies from one loaded page of hiring requests. Its cards and counts could omit openings from other request pages. The portal now calls `kandil_hr.portal.vacancies.listing` directly. Filtering, priority ordering, counting and pagination happen in the database before the bounded row projection.

The screen provides all-permitted, my-team and unassigned views; active/paused/terminal state filters; literal search by title, request ID or opening ID; exact company, department and location filters; and 25-row pages with the total for that filter. A vacancy displays requested, approved, joined, closed and remaining quantities, current authorized lead, requested/HR priority and the score breakdown. Paused and terminal vacancies have score zero while retaining the explanation of their components. Existing lead assignment remains connected to the same transactional command.

Native permission queries for **both Job Opening and its parent request** apply before totals and paging. The pinned native list compiler does not enforce every child Link User Permission that a document read checks; this endpoint additionally applies those child restrictions before counting. This prevents a request's restricted approval-history position from producing a counted row that cannot be opened. Exact opening-to-request-line linkage and all-location scope remain required. Ordinary accounts without native opening-read access are denied.

The unassigned filter considers current enabled status, recruitment role and live management grants for every request location and requested position. Revoking, expiring or narrowing a stored lead's grant makes the vacancy unassigned on the next read, without rewriting assignment history. Team identity labels respect native User Permissions. If identities are restricted, the existing replace-team modal is disabled to prevent dropping hidden members. Closed locations expose no assignment/manage hint even when another location keeps the parent request approved.

## Verification

- **15 final native queue checks passed:** [final queue regression](evidence/s2-regression-4b56e52fd719.json). Coverage includes exact count/pages/search, native parent/opening/child permissions, all-location scope, revocation, expired/future/partial lead grants, priority date boundaries, closed-location action hints, quantity arithmetic, identity redaction and read-only behavior.
- **37 existing native regressions passed:** 11 portal API and 26 recruitment-command checks in [the focused integration run](evidence/s2-regression-6d1c282c89d5.json). That run also passed the earlier 14 queue cases. Its source predates only the final closed-location/role action-hint tightening and added queue test, subsequently verified by the 15-case final run. Do not add repeated queue cases to the unique total.
- **27 dedicated browser checks passed:** [final vacancy browser result](../portal/evidence/vacancies-9ef32230769a/results.json). The cohort contains 28 actual approved openings across two locations, with 25 + 3 page results; tests use EN desktop and AR mobile personal sessions, search outside the first page, exact totals, team/unassigned/state/location filters, priority explanation, empty results, outsider access and live lead-grant revocation. No browser runtime errors, HTTP 5xx or external requests were observed.
- **24 original-journey browser checks passed:** [final journey result](../portal/evidence/browser-74bf04ec66d3/results.json), [source/cleanup verification](../portal/evidence/browser-74bf04ec66d3/regression.json). Submit → manager → HR → two vacancies → recruiter assignment, stale decisions, returned/revised requests and mobile shortage denials still work. The harness now waits for the dedicated queue to finish loading; assertions were retained.
- **Visual review and build:** TypeScript/Vite build passed. Final [EN desktop](../portal/evidence/vacancies-9ef32230769a/queue-en.png) and [AR mobile](../portal/evidence/vacancies-9ef32230769a/queue-ar.png) were inspected; [review observations](../portal/evidence/vacancies-9ef32230769a/visual-review.json) record scope and hashes. All 98 coverage rows and the frozen original reference hash remain unchanged. Upstream submodule pins still match the installer lock.

The resulting evidence covers **52 distinct native cases and 51 browser checks**, across the source checkpoints specified above. This is not 1,000-user load testing or independent security certification.

### Retained diagnostics and repeated runs

The [initial native run](evidence/s2-regression-bdc9f5900329.json) exposed the child-permission gap; it also correctly denied an ordinary requester without Job Opening read access. Child constraints were added before paging, and the requester test now explicitly expects that denial. [The corrected 14-case run](evidence/s2-regression-a3842a0d45ac.json) passed before the final fifteenth case was added.

The [first browser attempt](../portal/evidence/vacancies-a39516ddfd38/results.json) stopped because the test harness called the browser Fetch Response `status` property as a function; it is retained as a failed run with successful cleanup. No product assertion was weakened. [The next 27-check run](../portal/evidence/vacancies-3158dc5b9123/results.json) passed; its mobile full-page screenshot had the sticky header captured at the scroll position. Final capture scrolls to the top, and the date label now stays on one line. [The earlier 24-check journey](../portal/evidence/browser-d233b6bbcd2d/regression.json) also passed. Repeated passes are not added to the totals.

The test runner uses only `kandil-parity.localhost` / localhost:8102. Native cases roll back; browser cohorts retain synthetic history but disable accounts and reconcile all capacity ledgers at cleanup. No production/company records, Odoo, external messages, upstream core, general queue workers or queued jobs were changed.

## What remains in S4

- Paginated, scoped recruiter lookup replacing the existing 500-result picker; complete team editing and bulk assignment, with reviewed versions and all-or-nothing errors.
- Portal controls for open/hold/resume/freeze/unfreeze/close, reasoned priority pinning and unresolved-candidate handling. Existing backend commands are retained; a read-only state filter does not implement these controls.
- Searchable organization filter selectors; the current queue uses explicitly labelled exact-name fields.
- Company-wide dashboard counts, action inbox and permission-aware notification references. The dashboard still labels its existing request-page counts accurately.
- Isolated scheduled reminders, retry/restart recovery, disabled recruiter handoffs and local email-template capture. Real email and automatic expiry decisions remain separate HR/IT gates.
- Full requirement reconciliation, HR review, independent security review, representative sustained 1,000+ account load and recovery, hosting and production rollout. A 28-vacancy browser cohort is functional evidence, not scale certification.

## How to review locally

1. Open `http://localhost:8102/hr-portal` and sign in with an authorized synthetic HR account.
2. Open **Vacancies / الشواغر**. Review totals and pages; search using an opening/request ID or title.
3. Compare **My team / شواغر فريقي** with **Needs a lead recruiter / تحتاج مسؤول توظيف**. Apply a state or exact location filter and confirm the total changes.
4. Expand the priority explanation, switch AR/EN and review on a narrow/mobile viewport.
5. Use the existing Assign recruiter flow on a permitted active vacancy. A changed request version still requires refreshing and reviewing the current record.

Automated test cohorts are retired after testing; their accounts are not demo credentials. The existing separate review cohort is preserved.
