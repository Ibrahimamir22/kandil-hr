# S5 versioned privacy notices — consent prerequisite

Date: 2026-10-14. The full 98-requirement goal remains active. CAN-004 is not complete: candidate-owned acceptance is still unimplemented.

## Delivered behavior

The connected AR/EN portal has **Privacy notices / إشعارات الخصوصية**. The configured company HR authority with current full-company recruitment scope can create a complete bilingual notice revision, publish or unpublish it, and inspect previous exact wording. Ordinary recruiters can read the current published notice only. They cannot inspect unpublished text, revision history or native notice documents.

A revision records employer names in both languages, one privacy-contact email, complete Arabic/English plain-text wording, whether separate transfer acceptance is required, corresponding bilingual wording when required, publication status, actor, reason, previous revision, content hashes and command identity. No legal text or policy is seeded. Transfer requirements are explicit company configuration, not an assertion about Kandil's actual hosting or a legal conclusion.

Every save appends an immutable snapshot. Company serialization, expected-version checks and actor-bound command identities prevent competing editors from silently overwriting each other. Current HR authority is rechecked before exact replay. Reusing a command with changed content fails. Failed writes roll back. Standard create/update/delete/rename operations cannot alter notice history.

The editor requires a wording/publication review; lost responses freeze the exact attempted save and allow retry. A page reload does not persist notice form data locally; HR must inspect revision history before starting a replacement. Old wording is read-only, not a silent restore operation. Plain text is escaped by React, including literal markup. The UI shows human revision numbers rather than opaque hashes.

**Publication records no candidate consent, sends no message and changes no applicant/person/capacity record.** No recruiter control can accept the notice on behalf of a candidate. An unpublished current revision makes the notice unavailable; it does not erase history or establish any candidate's consent state.

## Scope and next steps

Reference: pinned `7824be24292c4743b4005e14e2df540786cfe167`, especially `src/Consent.gs` and `src/Candidates.gs` reopening/consent gates. The notice snapshots supply the exact wording/version that the next workflow must bind.

Still required before candidate-owned consent or reopening can be claimed:

1. Candidate link issuance with current application/company access; high-entropy bearer credentials, bounded lifetime, replacement invalidation and no secret in ordinary audit/receipts/browser storage.
2. Minimal candidate-facing AR/EN notice view and independent acceptance, bound to employer/person/application and exact notice revision. A recruiter/import note is not candidate acceptance. Record separately whether any transfer wording was accepted.
3. Single-use consumption, safe uncertain-response handling, anti-enumeration/rate/origin boundaries and concurrent acceptance/replacement/expiry tests. Document that bearer-link possession alone is not verified identity; do not label it stronger evidence.
4. Privacy-state changes, withdrawal/retention/talent-pool requirements and the approved reference gate across canonical screening/interview/offer paths. Consent validity/reconsent policy must be explicit; publishing new wording alone must not silently rewrite historical acceptance.
5. Canonical Screening representation and company-scoped HR/recruitment leadership reopening, with reason, live vacancy, consent evidence, downstream/joined checks and immutable closure history. Existing reopening storage fixtures do not prove this workflow.
6. Full reference reconciliation, real-role HR/privacy acceptance, independent security, 1,000+ workload, migration/recovery and S6–S12 delivery remain open.

HR/privacy owners must approve production wording, purposes, transfers, retention and access model. Synthetic wording is labelled testing-only. This checkpoint is software functionality, not legal approval or compliance certification.

## Deployment and record preservation

`migrate_privacy_notice.py` explicitly reloads only the new DocType on `kandil-parity.localhost` and `kandil-review.localhost`. It checks the existing business-record digests before/after and verifies zero notice rows were seeded. Evidence: `evidence/privacy-notice-schema-2026-10-14.json`. The first schema-check attempt discovered that Bench prints no output for a zero count; the read parser was corrected and the idempotent check rerun. No candidate/public consent flag was enabled.

The review site keeps its existing accounts, grants and four applications; its personal account remains read-only for notices and sees the empty published state. No workers/schedulers were started, no real/company-data site was touched, and no external communication occurred. A full clean install/upgrade/rollback rehearsal remains S11 work.

## Verification

- **30 native checks passed**: `evidence/s2-regression-088577e171c8.json`: 16 notice tests plus 14 existing catalog-authority tests. No skipped tests; synthetic fixtures rolled back and Python source hashes remained unchanged.
- Covered empty/no-seed state, exact bilingual snapshots, no candidate mutation, unpublish/history preservation, exact and changed retries, stale/no-op rejection, full-company HR authority, revocation, native CRUD and cross-scope denial, bounded history, separate transfer wording, email/field limits, plaintext behavior and insertion rollback.
- TypeScript/Vite build passed. Existing font runtime-resolution and >500 kB bundle advisories remain; neither build nor notice tests establish production capacity.

- **27 browser checks passed**: `../portal/evidence/privacy-notices-528b92433b94/results.json`. These verify ordinary HR/recruiter sessions, explicit review, exact lost-response retry, concurrent same/different edits, unpublishing, original-wording history, no HTML execution, AR/mobile, revocation, and unchanged candidate/capacity snapshots. All six disposable accounts disabled; ledgers zero and candidate lease restored. No browser errors, server 5xx or external requests.
- **30 read-only review checks passed**: `../portal/evidence/review-work-1791953069173/results.json`. Personal account sees the unseeded read-only notice state in AR/EN; review business digests are unchanged.
- Three workflow screenshots inspected: `../portal/evidence/privacy-notices-528b92433b94/visual-review.json`. Upstream dependency pins remain unchanged.

## Review locally

Open `http://kandil-review.localhost:8112/hr-portal` → **Privacy notices / إشعارات الخصوصية**. The personal account has no publication authority and will see the empty published state. The full-company HR editor is proven on disposable parity accounts; no real policy was published or account elevated on the review site.
