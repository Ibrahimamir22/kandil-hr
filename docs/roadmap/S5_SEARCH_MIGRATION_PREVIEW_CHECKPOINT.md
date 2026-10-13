# S5 corrected-profile search and legacy migration preview

14 October 2026. **Partial S5 engineering checkpoint, synthetic data only.** Full candidate management, migration application/activation and all release gates remain open.

## Current and historical identity search

The candidate directory searches both current basic person name/contact values and the historical application snapshot. Counts and pages use the same native application/opening/request scope; person matches additionally require native person visibility. List rows display the current person name and label the original application name when different. No phone/email values are added to list responses.

Duplicate review also matches corrected master contacts alongside historical snapshots, with case/whitespace normalization for email/name and punctuation normalization for phone. It returns minimal application/person references and the current name, within current permissions. Contact matches still do not select, merge or assert identity. Paging remains a 20-row scoped cursor. Country-aware phone normalization, similar-name matching and restricted national-ID rules remain part of the wider identity work.

## HR legacy review

The **Review legacy records / مراجعة السجلات السابقة** control is available to the configured HR authority. Its server query requires current manage scope and native applicant/opening/request visibility before totals and pagination. Ordinary recruiters cannot enter it by guessing its API.

- Lists only applications without a linked person and supports scoped name/ID search and paging.
- Previews a proposed basic profile from that application's existing name/contact snapshot.
- Flags incomplete/invalid data or an already-linked record; previews never fix data silently.
- Shows a bounded sample of offer, interview and onboarding identifiers only when those linked records are readable. Restricted references do not reveal hidden counts.
- Records a deterministic preview fingerprint of the reviewed data/versions for comparison. This fingerprint is not an authorization token or approval.
- Explicitly explains preservation of application identity/contact/source/downstream links, one unreviewed person per legacy application, and no inferred consent or automatic merging.

This screen is **read-only**. There is no public migration/apply endpoint or apply button in this checkpoint. The existing internal migration primitive remains a separate controlled command; reviewed batch execution, reconciliation, retry/recovery and activation still need implementation and evidence. The preview works with the identity intake flag off.

## Evidence

[46 native checks passed](evidence/s2-regression-9c67797464c3.json): 6 migration-preview, 5 corrected-search, 17 identity, 7 candidate projection and 11 portal API cases. Source hashes remained unchanged. [46 personal-session browser checks passed](../portal/evidence/candidates-f57a4a71704f/results.json), including the existing intake/correction/retry/concurrency/revocation journey, corrected-contact matching/search and HR-only EN/AR preview with unchanged application/capacity state. [Three screenshots](../portal/evidence/candidates-f57a4a71704f/visual-review.json) were visually inspected. All six cohort users were disabled, capacity reconciled and the intake flag restored. No browser runtime errors, server 5xx or external requests were observed. Initial native search run `755a45d5d0a1` passed 38 checks. Preview run `7ea5f2ca622b` failed because the test referenced a nonexistent offer helper; the fixture was replaced with an actual synthetic Job Offer. Failed evidence is retained, and rollback-scoped test records were rolled back.

## Remaining delivery

The intake feature flag stays disabled outside temporary synthetic tests. Next: implement reviewed migration application/reconciliation and recoverable intake/correction navigation, then remaining candidate ownership, follow-up, activities, sourcing, sensitive fields, private documents, consent, imports and communications. All 98 frozen requirements are preserved. S6–S12, HR/IT/UAT, independent security, real identity/MFA/email, sustained 1,000+ account capacity/recovery and production gates remain open.
