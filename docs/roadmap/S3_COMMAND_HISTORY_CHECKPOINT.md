# S3 — recorded command review history

13 October 2026. The custom AR/EN portal now shows modern recruitment command content before and after each action. This is the first history implementation increment; it does not complete the full revision-history contract or S3.

## What to test

At `http://localhost:8102/hr-portal`, choose **Hiring requests**, open a request you can read, then select **View review history / عرض سجل المراجعات** under **What was reviewed? / ما الذي تمت مراجعته؟**. Choose a recorded action.

- Submission shows saved draft content before the command and the submitted request afterward.
- A decision shows the content reviewed before that decision, the actor/principal, the affected step, recorded reason and resulting outcome.
- HR review keeps original requested quantity separate from the changed proposal and reservation. A later return/revise/resubmit does not rewrite older comparisons.
- Captured policy values and historical branch identity come from the stored command, not today's structure or settings. Unknown old location captures are explicitly marked partial.
- Requests are reauthorized on every read. Each side also checks historical location scope and current native Position/Capacity permissions. Restricted replacement identities are redacted; private envelopes, payloads, receipts, confidential notes and employee profiles are never returned.
- Board proof references use the existing exact-target private File permission check. Dedicated history-screen coverage for all Board/delegation paths remains part of the next integration work.

The English desktop and Arabic mobile views include wrapped before/after fields, original/proposed/reserved/approved quantity tables, recorded steps and expandable frozen policy. Users explicitly load this section. Refresh clears earlier data and checks current access.

## Source changes

`portal/request_history.py` provides authenticated GET `events` and `event`. Candidate pages default to 20 and cap at 100; historically inaccessible events are omitted, so an empty candidate page can still have a next page. No unrestricted historical total is claimed. IDs are bound to the authorized request/company and explicit recruitment operation allowlist. Only reviewed fields are projected from the private audit store.

`recruitment/command_audit.py` now adds the requested Position to new related-state captures. Capacity branch identity was already captured. Old envelopes and revision bytes are not rewritten. If an old position/location capture is absent, only current department-wide scope can establish access without knowing the old branch; narrow-branch readers are denied. The output marks incomplete location context rather than fetching a current label and presenting it as historical fact.

`frontend/portal/src/RequestHistory.tsx` connects the bilingual view. CSS explicitly overrides the inherited 620px table minimum: all history columns now fit their local container rather than relying on hidden horizontal scrolling.

## Verification

| Evidence | Checks | Scope |
|---|---:|---|
| [Native history and affected domains](evidence/s2-regression-00357f5b2377.json) | 72 | 14 history, 15 command-audit, 26 recruitment command, 17 Board cases |
| [Final native source](evidence/s2-regression-1819a9f40497.json) | 25 | Same 14 history cases plus 11 portal API cases, after the browser fixture was added |
| [Final focused browser](../portal/evidence/request-history-c4ef8ae1fc60/results.json) | 37 | Actual EN desktop / AR 390px mobile, ordinary requester/HR/manager/outside-scope sessions |
| [Final existing journey](../portal/evidence/browser-82c314f7038a/regression.json) and [checks](../portal/evidence/browser-82c314f7038a/results.json) | 24 | Existing request, approval, headcount and vacancy flow after final UI changes |
| [Visual review](../portal/evidence/request-history-c4ef8ae1fc60/visual-review.json) | 3 captures | Field and quantity comparisons, steps and frozen policy |

There are **83 distinct native checks** across the two native runs; the repeated 14 history cases are not added twice. Final browser evidence contains 61 checks. Recorded source fingerprints match current files; broad native evidence predates only addition of the CLI browser fixture, which is included in the final focused native run and exercised by browser acceptance. Native cases roll back; every browser cohort disables six accounts and reconciles commitments to zero while retaining history. No real-data site, external email or production integration was used.

Specific history checks cover exact old title/quantity/outcome after revision, frozen policy despite settings changes, current and historical branch mismatch, missing old position capture, restricted employee identity, guessed other-request events, scope revocation, native Position User Permission, Guest denial, field allowlists, pagination and no read side effects. Browser checks deny direct access to the private Command Audit resource; this does not prove all legacy native revision surfaces safe.

## Diagnostics and repairs

- Native `0fec4d022f52`: 10 cases passed; two test-fixture assumptions were wrong. The policy lives on Recruitment Route, not Organization Settings; the selected request has Department then HR authority, not a Sector step. The corrected test also addresses the actual request-line ID for HR quantity review. All final cases pass without weakening expected outcomes.
- Browser `774b741cbb1d`: 35 functional checks passed, but visual review found inherited table width hid comparison columns. The final harness adds actual internal table-container overflow assertions for both languages. Final result is `c4ef8ae1fc60` with 37 checks.
- Original browser `ccef99d40702`: 24 checks passed before the final table/layout correction. Final-source repeat is `82c314f7038a`.
- Supplementary element screenshots hide the sticky navigation only during capture so it does not overlay a scrolled element. Full-page screenshots retain the normal application layout. No data content or table styling is changed for captures.

## Work still required

See [the unchanged full history contract and explicit remaining work](S3_HISTORY_DESIGN.md): standalone Request Revision list/detail, selected submitted-versus-decision comparisons across commands, revision/amendment links, native legacy snapshot access hardening, explicit route-rationale projection and expanded delegated/CEO/Board/correction history acceptance. The new adapter does not certify the older native revision endpoints. Existing authorized immutable-byte contracts must remain when disclosure is safe.

S3-04/S3-05 and full S3 remain in progress. All 98 reference IDs and the historical 80-case result remain unchanged. HR/IT decisions, independent security, sustained 1,000+ account capacity, recovery, hosting, real-data migration and release acceptance remain separate gates. The full goal stays active.
