# S5 Screening and reviewed candidate reopening

Engineering checkpoint, 2026-10-14. Full goal remains all 98 requirements; S5 and later release gates are not complete.

## Implemented behavior

`Screening` is a real Job Applicant status added through an idempotent Kandil Property Setter. Upstream Frappe/ERPNext/HRMS files and dependency pins are unchanged. Existing status values are retained.

A currently authorized recruiter can move a new/contacted application into Screening after the candidate has personally accepted the employer's privacy notice. Issuing a link or recording a recruiter/import note is insufficient. The service records an immutable stage activity, keeps its private reason out of generic command-audit text, preserves follow-up and does not change headcount.

Only configured HR or sector recruitment leadership can reopen a currently rejected/withdrawn application. The reviewed application/request versions and closure hash must still match. The vacancy must be active, candidate-owned consent must exist, and live referral/interview/offer/joining/employee commitments must be resolved through their owning workflows. Reopening inserts immutable evidence referencing the original closure and consent, then moves the application to actual Screening in the same transaction. It never substitutes Replied for Screening.

Original closure reasons and candidate-message drafts remain unchanged. A pending rejection-message task projects as cancelled after reopening; a previously recorded manual-send/not-needed outcome remains intact. Old follow-up is not restored. Repeated real closure/reopening cycles are supported. These operations send no messages.

## Boundaries and recovery

Company/request/application locks serialize changes. Current scope, enabled account, required role, native application permissions and leadership (for reopening) are checked before replay. Exact command retries return the original result; changed payloads, stale versions and competing decisions cannot duplicate effects. Existing actor-owned encrypted recovery envelopes now support both operations. The AR/EN portal freezes uncertain attempts and exposes them through Unfinished actions after reload.

Native applicant saves cannot invent Screening or directly exit it; changes must use the reviewed owning workflow. When the site feature is enabled, protected applicant states and Interview/Job Offer writes require candidate-owned consent through backend hooks. This protects direct calls as well as portal buttons. It does not implement all interview/offer workflow rules or consent withdrawal/retention; those remain explicit subsequent work. Existing sites are not silently activated.

## Verification

Schema-only upgrade evidence: `evidence/screening-schema-2026-10-14.json`. Both isolated synthetic sites retained all hashed business/consent/recovery records, while only status metadata and allowed recovery operations were extended. Repeating installation preserved the same state. Screening activation was still off at schema installation.

**37 final native checks passed** with unchanged Python source and rollback-scoped fixtures: `evidence/s2-regression-94eb38e4efb5.json` (17 Screening/reopening and 20 closure checks). An earlier broader run passed 88 checks: `evidence/s2-regression-911fbf0b163d.json` (16 Screening/reopening, 20 closure, 13 history, 18 message and 21 recovery). The final run followed the added native Screening-exit guard; overlapping runs are not added into a single test total. Final connected-browser and preserved-review evidence follows below.

- Final connected browser: `../portal/evidence/candidate-stages-b6dd8a13107b/results.json`, **27 checks passed**, source unchanged. Includes consent gating, reviewed AR/EN forms, native bypass denials, leadership access, lost-response recovery after reload, simultaneous exact retries, competing decisions, original closure/message preservation and unchanged people/capacity. No browser errors, unexpected 5xx or external requests. All six temporary accounts disabled, fixture ledgers zeroed and feature/monitor leases restored; synthetic history retained.
- Visual review: four final rendered screenshots inspected in `../portal/evidence/candidate-stages-b6dd8a13107b/visual-review.json`. English desktop and Arabic mobile controls fit; the Screening result and preserved closure history are visible.
- Review activation: `evidence/screening-review-activation-2026-10-14.json`. Only the explicit Screening feature flag changed on the preserved synthetic review site. Hashed business/consent/recovery records were unchanged; no employer policy or candidate acceptance was seeded.
- Preserved review: `../portal/evidence/review-work-1792003109257/results.json`, **36 read-only AR/EN checks passed**, with business records unchanged and no browser errors, 5xx or external requests. The existing personal recruiter sees the consent requirement rather than invented eligibility.
- Build passed (TypeScript + Vite). Existing runtime-font and bundle-size advisories remain; correctness/concurrency checks do not establish sustained capacity for 1,000+ users.

## Review path

Open `http://kandil-review.localhost:8112/hr-portal`, choose Candidates / المرشحون, open an application and find Screening and reopening / الفحص الأولي وإعادة الفتح. The review dataset has no employer notice or candidate consent, so the action correctly stays unavailable. The workflow screenshots and isolated test evidence demonstrate the complete eligible path; do not fabricate consent to make the review button appear. Leadership authority is required to reopen.

## Corrections during verification

The first native run (`s2-regression-eefe6695453b.json`) correctly rejected the new operations because they had not yet been registered in the command-audit allowlist. Registering the two explicit operation names resolved that integration omission without weakening the audit guard. The initial browser run passed 26 checks, but inspection found that its native-bypass case labeled “even with consent” had not actually accepted consent for that application. The corrected run explicitly accepts that candidate and adds a native Screening-exit check; all 27 checks passed (`candidate-stages-c788700950ff`). Visual review then found a screenshot captured during layout movement and cramped inline form actions. The capture now waits for panel loading and stable layout; form actions use separated rows. The final 27-check browser run below verifies those changes.

## Remaining scope

Consent withdrawal/reconsent, purpose/retention/talent-pool controls, private candidate documents and sourcing/imports; full interview/offer/holding and downstream cancellation/referral workflows; joining/onboarding/lifecycle/reporting. HR terminology, real-role UAT, actual employer privacy wording and authority acceptance remain separate. Independent security, 1,000+ account workload capacity, identity/MFA, migration/recovery and production rollout are unverified. The company-data site, Odoo and shared worker backlog remain outside these changes.
