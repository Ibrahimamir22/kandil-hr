# Sprint 1 checkpoint — 12 October 2026

**Status: Sprint 1 stabilization complete; full HR goal active. Synthetic local verification only.**

The initial checkpoint below is retained as history. The closeout section supersedes its Sprint 1 remaining-work list.

Tested implementation commit: `eed166c9610d9c23ce94ceab023b0ed3006618fb`. Evidence includes test-time source fingerprints; this document is committed afterwards. The frozen 80-case register now records **72 passed, 4 partial, 4 blocked**. Only AT-HC-005-03 and AT-HC-006-01 changed status; expected definitions remain unchanged. These totals are a historical acceptance scope, not completion of all 98 reference requirements. HR acceptance remains pending.

## What changed

The custom Arabic/English portal now lets the original requester revise quantities on a Pending request. A review screen shows current reservation, new quantity and the difference before confirmation. Successful changes restart approvals and preserve previous decisions. The server checks scope, request version and capacity; a refusal keeps the entered values visible.

A real HTTP failure exposed a missing headcount evaluation on pending revisions. The denial boundary received no evaluation and returned HTTP 500. The command now passes its precise evaluated quantities, own reservation and policy to the existing durable denial boundary. Business changes roll back, while an authorized private denial record is retained. Repeating that denied command does not create another event or consume capacity.

The mobile review table now shows every column without horizontal clipping. Unchanged quantities are rejected in the portal before submission; the backend retains its audited no-op contract.

## Verified evidence

| Lane | Result | Evidence |
|---|---|---|
| Native database/domain regression | 63 tests passed across 5 suites (13 pending, 4 headcount contract, 9 recruitment contract, 11 portal, 26 command) | [Native results](evidence/s1-regression-ff5ec84ca11a.json) |
| Ordinary-session HTTP | 7 scenario groups passed, including 20 simultaneous successful retries, 20 denied retries, last-seat contention, committed denial and other-actor replay refusal | [HTTP results](../sprints/evidence/headcount-http-2026-10-12.json), cohort b5bd590eef74 |
| Native Frappe UI | 7 checks passed in Arabic/English | [Native UI results](../sprints/evidence/browser/headcount/a59d2611b3c9/results.json) |
| Custom portal | 16 named checks passed, including AR mobile, EN desktop, reviewed delta, success, denial, stale action and requester-only action | [Portal results](../portal/evidence/pending-934a2228d384/results.json) |
| Static/build | Portal TypeScript/Vite build, changed Python syntax, whitespace and pinned upstream source checks passed | Scripts and lockfiles are in the repository |

These lanes overlap: do not add their totals as unique feature coverage. Test cohorts were cleaned, test accounts disabled and immutable synthetic audit retained. Source was unchanged during each final verification lane. No production data, external messages or Odoo operations were used.

Earlier failed evidence remains in Git: two HTTP runs exposed the missing evaluation; native browser runs exposed a modal-selection problem in the test; the stricter portal run exposed inherited mobile table width. Later passing runs above supersede them for current evidence. The initial portal pass used a weaker layout assertion and is not the final mobile evidence.

## Exact acceptance promotions

- **AT-HC-005-03:** “Amending own reservation of2 to3 adds delta1; never charges old2 twice.” Native exact-case and real HTTP/UI results prove reservation changes 2→3, not 2→5. Multi-location and other-request reservations remain covered by native tests.
- **AT-HC-006-01:** “Run same shortage with WARN and BLOCK settings; expected outcome and exception route are explicit and audited.” Native/HTTP cases exercise BLOCK precedence, WARN reason boundaries, independent exception authority and persisted denial history. Concurrent denial replay creates no additional event.

## What remains in Sprint 1

1. Reconcile the remaining four partial and four blocked baseline cases against current source and decision owners.
2. Finish the broader headcount robustness checklist: simultaneous approval versus revision, revocation after waiting on a lock, and obsolete queued approvals after a revision. Existing tests do not yet prove every one of these interactions.
3. Review the complete authority/audit/outbox/permission matrix and run additional targeted checks where evidence is missing.
4. Freeze portal/API conventions and document HR/IT decisions: roles, Arabic terminology, identity/MFA, audit custody and measured workload assumptions.

Then Sprint 2 connects organization and job descriptions through the custom portal. The remaining roadmap is in [SPRINT_PLAN.md](SPRINT_PLAN.md) and [tracker.json](tracker.json).

## How to review locally

Open http://localhost:8102/hr-portal and use your private synthetic requester account. Create and submit a fresh request within available capacity; open it while Pending, choose the quantity-change action, enter new quantities and a reason, review the difference, then confirm. Switch language and use a phone-width viewport. Successful changes restart approvals; denied changes retain the form. Sign in separately as HR to confirm requester-only actions are absent.

The automated test cohorts are disabled after cleanup; use the private manual-testing account guide documented in [portal README](../portal/README.md), never credentials in Git. Exact 2→3 and denial fixtures are created by the fresh-cohort test scripts, so an arbitrary manually selected capacity may produce a different valid result.

No cloud release, full-reference parity, independent security acceptance or 1,000-user load certification is claimed.


## Sprint 1 closeout

Implementation commit: `1c5049912bf6b2dd904565ba75296966b8785a8d`.

Pending revisions now suppress this request's older Pending/Retry/Failed notifications atomically before enqueueing its new notices. Previously delivered history and unrelated requests remain unchanged. An injected audit failure restores the old notification statuses along with all business state. An unchanged or denied revision does not suppress the queue. The SLA worker now uses the same Company-first lock order as request commands and delivery.

A new independent-connection suite proves both approval/revision orderings reject the losing stale version; a requester with an old authorized snapshot is refused after grant revocation; and a delivery worker starting with an old Pending snapshot sees the committed suppression. The SQL observation hook signals the Company lock call but does not replace database locks or command logic.

| Final lane | Result / evidence |
|---|---|
| Pending revision native suite | 15 passed, including second-location shortage with no partial ledger/approval/notification effects: [results](evidence/s1-regression-d24e0c92c969.json) |
| Other affected native suites | 111 passed: headcount 4, recruitment contract 9, portal 11, commands 26, SLA 9, foundation/security 52. [Results](evidence/s1-regression-921d89f05205.json). This batch is labelled FAIL because its final race harness tried to reactivate an immutable revoked grant; the preceding seven suites passed. |
| Corrected race suite | 5 scenario groups passed; uses a new grant rather than reactivating history: [results](evidence/s1-regression-df76c11d1162.json), cohort bc20dab7f3b3 |
| Fresh ordinary-session HTTP | 7 scenario groups passed: [results](../sprints/evidence/headcount-http-2026-10-12.json), cohort 8b6e2922163a |
| Fresh AR/EN quantity portal | 16 checks passed: [results](../portal/evidence/pending-a0edae4efa72/results.json) |
| Fresh original hiring journey | 24 checks passed: [browser results](../portal/evidence/browser-d3a934a3a027/results.json), [source/DB/cleanup evidence](../portal/evidence/browser-d3a934a3a027/regression.json). Request → manager/HR approvals → vacancies → recruiter assignment, plus return/revise and role negatives. |

Native tests total 126 across the latest relevant suite runs. Race, HTTP and browser counts overlap business behaviors and must not be summed as unique features. Evidence records test-time source; later edits fixed only the new race harness, added one native test, and added guarded browser fixture preparation/cleanup. Production revision/SLA logic remained unchanged throughout the successful verification lanes.

Two browser setup attempts hit the normal hourly User-creation throttle before the journey began. Their failure records are retained. The CLI-only synthetic fixture now uses Frappe's scoped import flag around User insertion and restores it immediately; site limits and HTTP account creation are unchanged. The final cohort passed and its six accounts were disabled, credentials scrubbed, requests cancelled and capacities reconciled. Failed setup attempts were checked for their exact UUID users/companies; none were retained.

The eight remaining baseline cases stay four partial/four blocked. Their exact outstanding clauses and owners are listed in [REMAINING_GATES.md](REMAINING_GATES.md); closing stabilization does not accept those later workflows or production gates. [PORTAL_API_CONTRACT.md](PORTAL_API_CONTRACT.md) records the reviewed API conventions and current limitations, including page-scoped counts and retry state that does not survive page reload.

Next: [Sprint 2 implementation brief](S2_IMPLEMENTATION_BRIEF.md). HR sign-off, independent security, agreed production capacity, hosting, migration and rollout remain unfulfilled gates of the full active goal.
