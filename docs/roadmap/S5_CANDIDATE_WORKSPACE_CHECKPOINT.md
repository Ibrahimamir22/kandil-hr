# S5 candidate workspace and reviewed intake checkpoint

13 October 2026. **Partial S5 engineering delivery on the synthetic parity site.** The scope still contains all 98 frozen requirements. This checkpoint does not complete candidate management or authorize production/public intake.

## Delivered behavior

- A candidate directory in the custom AR/EN portal, visible to authenticated recruiter accounts with native applicant read permission. Search, status filters, exact scoped totals and server pagination use the same current record scope.
- Application detail separates the application contact/source snapshot from the company-scoped person profile. A person can have multiple applications, and its history shows only applications the viewer can currently read. Legacy records clearly have no linked person.
- A basic professional profile: name/contact, governorate/city, education/specialization, graduation year, experience, employer/title, notice period and preferred language in the schema. Numeric unknowns remain null; zero experience remains zero. Preferred language input and profile correction/history are not yet in the portal.
- Recruiter-assisted intake selects an open vacancy, records mandatory source details, reviews scoped possible matches and explicitly chooses a new or existing person. Matching contacts never select or merge automatically. Additional matches can be loaded using a scoped cursor.
- Existing-person reuse requires the reviewed person version and a reason; application contact details do not overwrite its master profile. Creation is not candidate consent.
- Intake uses the existing versioned command, permissions, locking, private audit and receipt mechanism. A lost-response retry freezes the form and reuses the exact command/payload. Simultaneous identical requests commit one application and return the same result. Intake does not reserve or occupy additional headcount.
- Ordinary list/detail projections do not include compensation, national ID, internal notes or private document links. Guessed references and revoked access are denied on the server.

## Verification

- Browser: [25 passed checks](../portal/evidence/candidates-68a7c80bee7d/results.json), including real English desktop and Arabic mobile intake, two applications sharing one person, duplicate cursor paging, lost response/retry, simultaneous HTTP submissions and revoked access. [Concurrency responses](../portal/evidence/candidates-68a7c80bee7d/concurrency.json) have equal parsed content.
- [Six screenshot reviews](../portal/evidence/candidates-68a7c80bee7d/visual-review.json) record the inspected list, intake and detail screens. This is engineering review, not HR UAT.
- Native: [35 passed checks](evidence/s2-regression-2652211f4907.json): 7 scoped read/profile cases, 17 identity cases and 11 portal API regressions. Source hashes remained unchanged. The earlier 35-pass run `70d0fca9e27a` preceded the final cursor/bounds changes and is retained as historical evidence.
- Original hiring-journey regression: [24 passed browser checks](../portal/evidence/browser-10606e9ecc2e/results.json), with [unchanged source and cleanup evidence](../portal/evidence/browser-10606e9ecc2e/regression.json).
- Each browser cohort disables its six synthetic users, reconciles capacity to zero and restores the prior intake setting. Audit history is retained. No live employee/candidate data or external sending is involved.

## Investigation history

Earlier failed runs remain in the repo for traceability:

1. `candidates-e049c321a614`: startup readiness request failed immediately after restart; separate cleanup verification confirmed restoration. Readiness now retries startup connection errors.
2. `candidates-4e7eca16abb2`: the list assertion ran before loading completed. The screenshot showed the correct count. Loading state is now explicit and the harness waits for the rendered paginated result.
3. `candidates-aa7ba192c908`: the concurrency assertion compared serialized JSON key order. Command receipts serialize sorted keys. The corrected assertion requires two successful responses and deep equality of parsed results, then verifies exactly one committed application.

## Activation and review

Open the local portal at `http://localhost:8102/hr-portal`, sign in with an ordinary authorized recruiter account, and use **Candidates / المرشحون**. Listing/detail remain available for records within that account's current scope.

The `kandil_candidate_identity_enabled` setting is **restored to its prior disabled state** after the test. New intake was proven under a temporary synthetic-site lease, not enabled for all review traffic. A controlled legacy migration preview and the remaining identity/privacy work precede ordinary site activation. Do not enable the flag on a company-data site to reproduce these tests.

The repeatable test entry point is `node docs/portal/test_candidates.cjs` in the existing development checkout. It creates a fresh synthetic cohort, temporarily enables only parity-site intake, executes the journey and restores it in cleanup. Mutation tests must remain serial on this shared database. General workers remain stopped; this checkpoint does not exercise external notifications.

## Still required in S5

- Versioned profile correction/history and sensitive disclosure controls; reviewed former/internal employee links.
- Migration preview/reconciliation and explicit activation procedure with preserved downstream references.
- Candidate owner/next-action editing, activity/rejection history, and recruiter-wide MOVE_ALL handoff.
- Source catalogs, JD-derived ads, attribution links, referrals/agencies and credit records.
- Private CV/documents, consent/retention/holds and candidate self-service; reviewed 50–100 row imports.
- Candidate communication states and the complete S5 permission/native-bypass/bilingual acceptance package.

Current limitations include no intake-draft recovery across navigation/reload (the exact retry is retained while the form stays mounted), long duplicate-review lists, and vacancy choices that may require a more specific per-opening capability hint. The authoritative creation command still rejects invalid permissions or vacancy state. Complete these before general intake activation.

S6–S12, HR/IT decisions, independent security review, real identity/MFA/email, sustained 1,000+ account capacity/recovery, hosting, migration and production acceptance remain open.
