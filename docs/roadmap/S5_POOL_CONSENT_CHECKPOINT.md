# S5 separate talent-pool policy and consent

Engineering checkpoint: 2026-10-14. All 98 frozen requirements remain in scope. CAN-008 and S5 are partial; this checkpoint provides the purpose-specific consent foundation for the hybrid talent pool, not the complete pool/search/matching workflow.

## Reference and decisions

The pinned reference's `src/Privacy.gs` separates APPLY consent from optional time-limited POOL consent. Its `poolConsentSave_` records a candidate-reported grant/withdrawal through an authorized recruiter; withdrawing pool consent leaves application processing and its evidence intact. `tests/phase15.js` covers that distinction. Data-subject-request identity checks and AI withdrawal are separate paths in `dsrClose_` and `tests/phase38.js`; they are not replaced by this panel.

The implementation therefore does not equate pending application-link revocation, talent-pool withdrawal, application closure, or erasure. It does not infer pool consent from an application or its privacy acceptance.

## Delivered

- Separate immutable company policy revisions: reviewed Arabic/English wording, explicit whole-month duration and publication state. Only configured full-company HR authority can publish; recruiters can read published wording. No employer text or retention period is seeded. The 1–120 month input range is a technical bound, not a legal recommendation. Actual wording and period still require HR/privacy-owner acceptance.
- The candidate page records GRANT or WITHDRAW with a selected channel, explanatory evidence, explicit confirmation, actor, timestamp, exact policy/hash and expiry for grants. Evidence is labeled **Recruiter record**; this is a report of the candidate's choice, not independently verified identity or candidate-owned online acceptance.
- One current choice per person/company is projected from immutable ordered events, across authorized applications. Company locking, expected previous event, reviewed policy revision and reviewed expiry prevent concurrent choices or stale forms from silently overwriting each other. A new grant after withdrawal/expiry requires fresh reviewed evidence.
- Expiry is evaluated at use time, through the recorded final calendar date, without needing a scheduler. Month-end/leap-day behavior is tested. Policy edits/unpublication stop new grants under the old policy but do not rewrite previously granted expiry or withdraw prior consent.
- Withdrawal is available without a published policy and may record an opt-out before any grant. It ends pool-consent eligibility immediately. It neither deletes records nor changes APPLY consent, application stage, people or headcount.
- Native event/policy reads and changes are restricted; updates, copies, deletes and renames cannot rewrite history through normal document APIs. Application team/scope, current grants and enabled account are checked again before retries.
- AR/EN policy editor under Privacy notices, and a candidate consent/history panel with paging. Uncertain requests freeze their reviewed payload and permit exact retries. After a full reload, users inspect current status/history before another decision; this panel does **not** claim encrypted cross-reload recovery envelopes.

## Verification

- `evidence/pool-schema-2026-10-14.json`: schema-only installation and repeat installation on isolated parity and preserved review. Existing hashed records remained identical; the two new tables were empty. No company-data site or shared worker backlog was touched.
- `evidence/s2-regression-3694e069e5f6.json`: **59 native checks passed**, no skips, Python source unchanged and fixtures rolled back: 17 pool policy/consent, 25 application-consent and 17 Screening/reopening checks. Includes explicit policy validation, current HR scope, exact retry after withdrawal, competing-version rejection, separate APPLY evidence, month-end expiry, renewal, immutable history, rollback and authorized cross-application projection.
- `../portal/evidence/candidate-pool-8eca2f1e18b1/results.json`: **30 connected browser checks passed**. Covers real policy/grant forms, lost-response exact retry, Arabic mobile withdrawal, history after reload, policy authorization, concurrent identical grants, competing distinct choices, revoked authority, out-of-company denial and native privacy. Applications, people and capacity were unchanged; candidate consent bearer probes were absent from logs/receipts/audit/monitoring. No browser errors, unexpected 5xx or external requests. Six temporary accounts disabled; fixture ledgers zeroed and feature/monitor leases restored; synthetic history retained.
- `../portal/evidence/review-work-1792003827189/results.json`: **40 read-only AR/EN checks passed**, preserved review records unchanged. The personal recruiter sees no invented policy, retention period or pool grant and cannot publish policy.
- Four rendered captures manually inspected in `../portal/evidence/candidate-pool-8eca2f1e18b1/visual-review.json`: English policy/grant forms, Arabic mobile withdrawal and a bounded history fragment. No full accessibility certification is claimed.
- TypeScript/Vite build passed. Initial compile errors in the new JSX integration/tuple labels were corrected before browser verification. Existing font-resolution and bundle-size advisories remain; none of these checks establishes sustained production capacity for 1,000+ accounts.

## Review path

Open `http://kandil-review.localhost:8112/hr-portal`:

1. **Privacy notices / إشعارات الخصوصية → Talent-pool policy / سياسة قاعدة المرشحين**. The personal account has read-only access; no policy is prefilled.
2. **Candidates / المرشحون → open an application → Talent-pool consent / موافقة قاعدة المرشحين**. No grant is available until company policy is published. A reported withdrawal requires a channel, evidence and confirmation.

The preserved review dataset is synthetic. Complete eligible grant/withdrawal demonstrations are in the test evidence rather than fabricated employer policy or candidate consent in the review dataset.

## Remaining work

Hybrid talent-pool membership, scoped search/matching and removal consumers must call the current eligibility resolver under the company lock; no active pool membership/search is claimed here. Public optional candidate-owned pool consent, data-subject requests with identity checks, AI opt-out, retention/holds/export/erasure, private CV/documents and sourcing/imports remain open. Granting recruiter-recorded POOL consent must never satisfy the candidate-owned APPLY gate. Separate consent purposes for compensation, references and sensitive documents remain part of later workflows.

Full interviews, offers, joining/onboarding, lifecycle and reporting remain on the frozen roadmap. HR acceptance, production privacy/identity design, independent security, 1,000+ capacity, backup/migration rehearsal and staged release remain unverified. The overall goal stays active.
