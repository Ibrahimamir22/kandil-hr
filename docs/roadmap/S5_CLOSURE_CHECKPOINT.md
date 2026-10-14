# S5 candidate rejection and withdrawal

14 October 2026. Partial engineering delivery under SCR-002 / ACT-001 and the unchanged 98-requirement goal. S5 and release acceptance remain open.

## Connected behavior

The Arabic/English candidate page has **Close application / قرار إغلاق طلب الترشح**. A currently authorized recruiter chooses rejection or withdrawal, selects an active company reason and supplies the configured required explanation. An explicit review confirms the decision and removal of the current follow-up. Rejection optionally saves a separately written candidate-message draft; the internal explanation is never copied into it. Saving creates a pending message task state, not a delivery claim. No email or WhatsApp message is sent. Withdrawal creates no rejection-message task.

The decision, reason code and historical labels, internal explanation, message draft, actor and content hash are saved in an immutable Kandil Candidate Closure record. A separate immutable stage activity links the outcome to the application history without copying confidential closure text into the general activity or request audit. The command's audit contains hashes of both texts and follow-up history. The application owner, person identity, other applications, source snapshot and headcount are preserved; only this application's follow-up is cleared.

Frappe HR's applicant enum has no Withdrawn state. The Kandil closure decision is authoritative for that distinction; the native Rejected state is used as the closed projection so existing ownership, vacancy and headcount guards remain consistent. The custom portal's detail, list and filters distinguish Withdrawn from Rejected. Native Desk and unadapted native reports still show the closed projection; S10 reports must consume the canonical decision. No upstream enum/core change was made.

## Current boundary versus the reference

The inspected reference is Candidates.gs appMove_ at 7824be2: it validates coded reasons, clears follow-ups, records a stage action and starts a pending rejection-message task. It also cancels live interviews, withdraws live offers, locks source attribution and provides a separately authorized REOPEN path. Those broader clauses remain required.

This increment supports closure before unresolved downstream commitments. It explicitly blocks applications with a live Pending/Under Review interview, a live offer or Accepted stage. Accepted offers awaiting joining point to the existing joining-outcome workflow. An employee link or Joined offer requires employee-lifecycle handling. Live interview/offer cancellation is not yet connected and is not silently simulated or counted complete.

A native Employee Referral link also blocks closure for now: HRMS JobApplicant.validate would otherwise update that referral's status without this command's separate authorization/audit. The portal explains this integration boundary. Kandil's custom Referral source channel is still supported; it is distinct from the native link. Full referral/agency credit attribution remains S5 sourcing work.

Reopening, repeated close/reopen cycles and message-task completion are not implemented. The current closure schema admits one immutable closure per application. A future reviewed reopening change must extend the event/state contract and uniqueness constraint rather than edit or delete that original record. The current form explicitly identifies reopening as a separate unfinished workflow.

## Permissions, consistency and recovery

- The shared command boundary locks Company, request and related records, checks current recruiter/team/native scope, and validates both request and application versions. Closure reasons use the current catalog version and active flag. Exact retries return the original result; competing decisions cannot replace history.
- Saving closure, clearing the follow-up, recording the stage event, audit and receipt is one transaction. Audit/event failure rolls back all effects. The internal ownership effect is reused under the outer command rather than introducing a nested transaction-retry boundary.
- Ordinary native document reads/writes cannot edit closure history. Native applicant rejection cannot bypass the reviewed action for candidate-mode records; an existing closure cannot be silently reopened. Native interview/offer validation serializes against the same company/application and rejects closed applications. Trusted server fixture cleanup is explicitly separated from public commands.
- Closure uses the existing encrypted private recovery envelopes. A lost response freezes the form; leaving/reloading preserves the exact decision, reason and separate texts in Unfinished actions. Replaying, inspecting or executing rechecks current authorization. Acknowledgement removes the private recovery copy while preserving business records.
- Candidate panels now refresh against the returned application version so closure does not leave a stale follow-up editor on screen.

## Local review and deployment

Review at **http://kandil-review.localhost:8112/hr-portal → Candidates → open an eligible synthetic application → Close application**. Existing personal credentials and privileges were preserved. Closing a review example changes that synthetic application; no company data is involved. The parity test cohorts use a separate site and are cleaned up.

The two synthetic sites received targeted reloads of Kandil Candidate Closure and Kandil Candidate Recovery plus the rebuilt portal. Only their web services were restarted. The separate review workers/scheduler remain stopped. The company-data site, upstream dependency pins, Odoo and external delivery were not changed.

## Verification

- [20 final closure native checks](evidence/s2-regression-5a9598b916d7.json), including the native-referral side-effect guard. [Affected suites](evidence/s2-regression-d3880d30310f.json) passed 27 activity, 21 recovery and 12 ownership/work checks; its earlier 19 closure checks are superseded. [11 joining checks](evidence/s2-regression-4b14d17e109f.json) passed after the downstream hook changes. Total: **91 native checks**, without double-counting earlier closure runs.
- [25 final closure browser checks](../portal/evidence/candidate-closure-1a1e66d36a27/results.json), [23 compound activity checks](../portal/evidence/candidate-activity-actions-ed1184972df7/results.json) and [42 shared recovery checks](../portal/evidence/recovery-ui-015172cd0493/results.json). Total: **90 workflow browser checks**. Closure covers EN/AR, uncertain-response freezing, reload recovery, actual native endpoint denial, distinct withdrawal filters, competing decisions, revocation and unchanged people/capacity. Each cohort disabled six accounts, restored its feature lease and left zero fixture ledgers.
- [14 read-only personal review checks](../portal/evidence/review-work-1791948232224/results.json) passed with unchanged business-record digests, including the new closure table. No review record was reseeded or closed by these checks.
- [Visual review](../portal/evidence/candidate-closure-1a1e66d36a27/visual-review.json) covers the final English rejection form and Arabic mobile withdrawal form/result. Withdrawal confirmation was refined to omit the inapplicable message draft. The final 25-check browser run covers that copy change; the preceding read-only and affected-regression runs predate only that copy change or the isolated referral-blocker addition, as their hashes record.
- TypeScript/Vite build passed. Existing bundle-size and runtime font-resolution advisories remain; no production performance claim is made.

Earlier failed runs remain in the repository: the [first native suite](evidence/s2-regression-50d9dfe387a9.json) used a nonexistent outsider fixture key (the permission assertion now uses the actual non-recruiter requester account); the [first browser run](../portal/evidence/candidate-closure-b33bcd8bfba6/results.json) exposed implicit select-label ambiguity, corrected with explicit bilingual accessible labels. The TypeScript application-version type was corrected before the successful build. The preserved failed browser cohort was cleaned, all six accounts disabled and its capacity ledgers reconciled.

## Next and remaining work

Connect rejection-message task review/completion with explicit manual-versus-provider delivery evidence; implement reviewed reopening/history cycles and the required downstream interview/offer cancellation contract. Complete shared recruiter MOVE_ALL, sourcing/ads/imports, complete profiles/private files, consent/retention and other S5 requirements. S6 interviews, S7 offers, S8 joining/onboarding, S9 lifecycle, S10 reports/integrations, S11 security/capacity/migration and S12 release/handover remain open. HR policy/terminology/UAT, IT identity/hosting/backup decisions, independent security review, sustained 1,000+ account capacity and real-data rollout require their own evidence. No full reference requirement or production readiness is accepted by implication.
