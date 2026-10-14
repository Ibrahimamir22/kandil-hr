# S5 — reviewed referral changes and HR bonus history

Engineering increment, 14 October 2026. Partial SRC-003/S5-03 delivery; the 98 frozen requirements and full release gates are unchanged.

## User workflow and reference

The pinned HR reference `7824be24292c4743b4005e14e2df540786cfe167` implements `referralSet_`, `referralsList_` and `referralBonus_` in `src/Referrals.gs`. This increment connects reviewed replacement/addition, influencing-referral voids, company-HR bonus decisions and a scoped active-referral register. Dedicated `appSourceSet_` transitions between ordinary/referral/agency sources remain separate unfinished work. Removing a primary referral is denied until that reviewed source transition is available.

Open the custom **Candidates → application → Current referral and bonus decisions** panel. The original intake snapshot remains visible and explicitly labelled original. Choose an action, review the current value and proposed change, enter a reason, then confirm. English desktop and Arabic mobile use the same authenticated commands. The **Employee referrals** register searches permitted candidate records, filters bonus status, counts all matching records and opens the candidate detail. It shows current active claims; a void removes an entry from the active register without deleting its history.

A changed employee or relationship re-runs the existing active-employee, employee-version, company, policy, self-referral, known prior-application and first-referrer checks. The replacement receives a fresh initial bonus classification. Earlier bonus decisions remain in history. A company with an employee register cannot use an unverified typed name to bypass employee selection. An empty-register name fallback remains explicitly unverified, as in the initial intake milestone.

Only configured company HR with the required current recruitment scope can record PENDING, REVIEW, ELIGIBLE, NOT_ELIGIBLE or PAID. A changed status requires a reason; repeating the same status is rejected. **PAID means a human reported payment, never that this system paid or verified it.** Payment reporting is deliberately labelled unverified in both languages. Bonus follow-up may continue after a candidate outcome; changing referral attribution may not. Reopening a candidate does not erase prior outcome evidence.

## Integrity and access

`Kandil Referral Revision` stores an immutable sequence of before/after values, reason, actor, time and chained fingerprints. The original `Kandil Referral Submission` is never rewritten. Each business command atomically records the revision, neutral candidate activity, receipt and audit references. Private bonus reasons are excluded from generic activity/audit projections and remain available only through the scoped referral history. This application-level immutability is not a claim of tamper-proof storage against database administrators or external audit custody.

All recruitment commands retain the company-first serialization order. Claim discovery uses locking current reads, so a transaction cannot rely on a repeatable-read snapshot taken before another referral was committed. Explicit application/request/referral versions reject stale decisions. Current authority is checked before serving a completed receipt, so revocation also blocks replay. Native history read/edit/copy/delete/rename shortcuts are denied.

Referral decisions use the encrypted unfinished-action mechanism. A lost response freezes the reviewed input and retries the same command. Leaving the form does not start a background decision. The recovery inbox displays the action, selected referrer, decision and reason before an explicit resume. No browser-held service credential or external email is introduced.

## Evidence

- Schema reload twice on isolated parity/review sites preserved all existing business-record hashes: `evidence/referral-changes-schema-2026-10-14.json`.
- **65 native checks passed:** 16 referral-decision, 14 initial-referral, 14 attribution and 21 recovery checks in `evidence/s2-regression-29125fc0960c.json`. They cover history chains, exact retry/conflict, stale input, primary-void denial, influencing void/restore, current employee checks, HR-only bonus, late audit rollback, native evidence protection, encrypted recovery/revocation and scoped register paging/counts. The reopened-status test deliberately changes only a fixture projection to establish that independent closure evidence still locks changes; it is not itself an end-to-end reopening test. The affected attribution suite separately exercises real reopening.
- The first native attempt (`evidence/s2-regression-62d71182168e.json`) passed 15 of 16 checks. Its snapshot comparison incorrectly included the read API's added display timestamp; the assertion was corrected to compare stored fields. Production behavior was not weakened.
- **70 read-only preserved-review checks passed:** `../portal/evidence/review-work-1792010702410/results.json`. Personal login, English/Arabic screens, current-referral empty state and register load without inventing employee claims or HR bonus authority. Existing business records remain unchanged. This check preceded a display-only addition of relationship/kind labels to nonempty register rows, exercised by the subsequent browser run.
- **32 final connected browser checks passed:** `../portal/evidence/referral-changes-ec189c3868d0/results.json`. Includes ordinary recruiter/HR/outsider sessions, lost-reply intake and correction, HR-only payment reporting, filtered-register navigation, competing bonus decisions, revoked-HR replay, Arabic influencing void/history and a closure-versus-correction race. Six final rendered captures were manually inspected; `visual-review.json` records the final layout review. The earlier passing workflow run `referral-changes-e84b5d0ce953` revealed a cramped Arabic inline confirmation; a grid layout repair was built and retested on the final fresh cohort.
- Final browser cleanup disabled six cohort accounts, inactivated two new referral employees, reconciled all fixture capacity ledgers and restored feature leases. Existing applications/capacity were preserved. No page errors, HTTP 5xx or external requests occurred.
- TypeScript/Vite build passed: 80 modules, approximately 710 kB JavaScript. Existing font-runtime-resolution and bundle-size warnings remain. Dependency pins and all 98 requirement IDs are intact.

## Remaining scope

This is not complete sourcing acceptance. Dedicated source transitions and primary/influencing conversion, agency disputes, full internal/former identity reconciliation, person-wide original source, advertisements/apply links, subscription credits and HR policy/terminology approval remain open. Candidate documents/imports and privacy/retention work also remain.

S6–S12 interviews, offers, joining/onboarding, lifecycle, reporting, independent security, representative 1,000+ account capacity testing, migration rehearsal, real-role HR UAT and staged production release remain required. Shared workers/scheduler and the company-data site are outside these test mutations. The goal remains active.
