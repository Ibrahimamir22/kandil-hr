# S4 global dashboard and approval queue

13 October 2026. Engineering work over the custom AR/EN portal; **engineering verification passed**, not production acceptance. The frozen 98 requirements are unchanged. The notification inbox and scheduled delivery remain separate S4 work.

## Behavior

The dashboard now requests a dedicated summary instead of deriving statistics and approvals from the legacy overview's first 50 requests. Counts cover all currently permitted requests, active/paused vacancies, openings needing a currently eligible lead, and approval actions. The two preview lists remain deliberately bounded at five recent requests and five next actions. The request register and vacancy queue retain their independent server-filtered search/pagination.

The new approval queue counts and filters before pagination, with 25 rows per UI page. Search is literal across request title/ID, including records beyond the first page. Results cover the active direct authority, valid process-scoped delegates, current Board members and the permitted external Board recorder. It does not count later approval steps, requester/personal-interest cases, expired/revoked delegation, wrong-role principals or actors lacking management scope. Opening a result still reads current permissions and routes the user to the existing reviewed decision workflow.

A separate, explicitly labelled past-required-date figure covers only Pending/Approved requests whose required date precedes today's Cairo date. It is not the business-day SLA deadline or an automatic rejection. Those remain in the reminder/scheduling slice.

Dashboard refresh clears old totals while fetching and rejects an older response if a newer refresh has started. Successful logout invalidates outstanding dashboard refreshes. Native permissions may prohibit an entire module, so a Board user without Job Opening access sees zero vacancy counts rather than failing to open the dashboard.

## Read-model contract and privacy

`portal/dashboard.py` uses the existing native-aware `permitted_names` query, including child-Link User Permissions, for requests and the existing vacancy query for vacancies. SQL count and paginated rows use the same authority/filter predicate; only bounded displayed requests are hydrated. No materialized actor grant or cached count can preserve access after revocation.

`portal/approval_query.py` is a fixed-alias, escaped SQL projection of current direct/delegated/Board authority. It tests current/frozen interests, effective non-voided position assignments (including Employee.user_id when Assignment.user is absent), native visibility, current full-request management grants and current roles. The existing domain commands still revalidate locked authority and business conditions at execution; a displayed row is not permission to bypass them. Future changes to authority rules must update and test both projections.

The old `portal.api.overview` remains explicitly page-scoped for compatibility, but the custom website no longer uses it. Its vacancy team projection now reuses the identity restrictions from the new queue; hidden leads/members are redacted and replacement is disabled if identities are restricted. The dashboard summary itself never returns recruiter directories, private notes, CVs or full request bodies.

## Verification

- [Final native dashboard/API run](evidence/s2-regression-86687aa8ed55.json): **17 dashboard cases + 11 portal API cases** passed. Includes 53 actual drafts with exactly five request hydrations, seven pending decisions paginated correctly, current role/grant/delegation/Board cases, native child-Link restrictions, revocation, literal search, real decisions after valid delegation, and legacy restricted-team identity redaction.
- [Affected read-model regressions](evidence/s2-regression-6026fba5d5cb.json): **12 request-register, 17 Board-adapter and 15 vacancy-queue cases** passed, along with 16 earlier dashboard cases before the added legacy identity regression. These unchanged suites are not counted twice. Total distinct native cases across the two recorded checkpoints: **72**.
- [Dashboard browser acceptance](../portal/evidence/dashboard-3a42bd11d1ea/results.json): **34 checks passed** across English desktop and Arabic mobile. Covers 57 requests, 28 initial approval actions, page boundaries, literal search, real manager decisions advancing to HR, current-scope revocation, guessed-ID isolation and an intentionally delayed response after a newer revoked-access refresh. All six synthetic users disabled and capacity ledgers zeroed in cleanup; no JavaScript errors, HTTP 5xx or external requests.
- [Visual review](../portal/evidence/dashboard-3a42bd11d1ea/visual-review.json): Arabic mobile dashboard and English approval queue reviewed directly. [Original hiring journey](../portal/evidence/browser-a9fd95a8a88f/regression.json): **24 browser checks passed**, source unchanged, with clean synthetic cleanup. The two browser runs cover 58 checks total.

## Diagnostic runs

- [3515635f856e](evidence/s2-regression-3515635f856e.json): nine of twelve new cases passed. A pagination fixture exceeded its five-seat capacity and therefore correctly routed later requests to an exception authority; two other errors were a wrong fixture-helper signature and a grant not stored in the helper's dictionary. The corrected fixture provisions adequate rollback-scoped capacity, calls the existing helper correctly and retrieves the exact synthetic grant. Expected approval counts and security assertions were retained.
- [ad2d52ab013c](evidence/s2-regression-ad2d52ab013c.json): fifteen of sixteen passed. Removing the HR fixture's only HR role correctly denied all portal access, rather than returning a zero count. The final assertion requires that PermissionError.
- [dashboard-5b936a4cedc6](../portal/evidence/dashboard-5b936a4cedc6/results.json): dashboard total/bounds/layout checks passed before navigation timed out because its exact accessible-name selector omitted the approval count badge. The harness now matches the Approvals label with its appended count. The cohort cleaned up successfully.

- [dashboard-a141416ea310](../portal/evidence/dashboard-a141416ea310/results.json) and [dashboard-2c3648f20d4a](../portal/evidence/dashboard-2c3648f20d4a/results.json): 24 checks passed before the Arabic mobile badge assertion failed. The API correctly returned 26 remaining actions, but the test read innerText while the sidebar was closing. Transitional visibility was an unreliable proxy for whether navigation was open. The harness now opens according to the actual sidebar state and waits for visible navigation and badge; the final run asserts the same visible count. No product change or weakened count expectation was needed. Both cohorts cleaned successfully.

## Remaining work

S4 still requires the permission-checked notification inbox, business-calendar milestones, recipient/event coverage, isolated scheduler execution and retry/restart recovery, disabled-recruiter handoff delivery, local email-template capture and searchable organization filter selectors. Candidate/global people search remains S5/S10. HR policy/terminology/UAT acceptance, real identity/email configuration, independent security, representative sustained 1,000+ account load/recovery and approved deployment remain explicit gates.
