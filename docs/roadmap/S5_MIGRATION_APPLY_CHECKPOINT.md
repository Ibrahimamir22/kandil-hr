# S5 reviewed legacy migration application

14 October 2026. Partial S5 engineering delivery on synthetic records. The complete HR scope and release gates remain open.

## What HR can do

Open Candidates → Review legacy records, choose an unlinked application, review the proposed basic profile, enter a reason and acknowledge the conservative identity policy. When candidate mode is enabled and the profile has no validation issues, **Confirm migration / تأكيد الربط** creates one new Unreviewed person and links the existing application. It never merges contacts, renames the application, fabricates a source or records consent retroactively.

Preview GETs still make no changes and work while candidate mode is off. The ordinary review site keeps that mode disabled; this checkpoint does not activate real-data migration or ordinary intake.

## Command and reconciliation

The public POST requires application/request versions and the exact preview fingerprint. The server repeats current HR authority, request manage scope, native application/opening permissions and candidate feature checks. A fingerprint is a stale-data check, not permission or a signed approval token. Versions and profile content are checked against locked records before effects.

The existing company/request/domain lock order and command receipt handle retries. The same actor/command/payload returns the original result after current authorization; a changed reason or fingerprint conflicts. A second command from an older preview is rejected. Audit or reconciliation failure rolls back the new person, application link and receipt together.

Before/after reconciliation hashes cover the existing application's full stored fields (except the two intended link/origin fields and modification metadata), linked offer/interview/onboarding IDs, request and capacity state. Only the hashes and a preservation result are returned; reconciliation does not expose restricted downstream records. The person remains Unreviewed and has the normalized basic profile from the original application. Existing source and application contact snapshots stay unchanged.

The AR/EN confirmation screen requires a reason and acknowledgement. A lost response or malformed success keeps the exact command available for retry and locks its local edit/back/refresh controls. Successful confirmation displays the linked person and reconciliation result. Refreshing an already-linked record removes the apply control. These protections do **not yet persist across global navigation or a full browser reload**; recovery across those boundaries remains next, before ordinary activation.

## Verification

[48 native checks passed](evidence/s2-regression-6c850d2a0758.json): 9 reviewed-migration, 6 preview, 17 identity, 9 correction and 7 candidate projection cases. Covers revoked/replaced HR, native User Permission, disabled mode, stale versions/content, changed receipt input, rollback on audit/reconciliation failure, historical preservation and minimal audit payload. Source was unchanged during execution. The first native run `bf3bffd83b47` used the wrong expected exception for a guessed application; the actual PermissionError was correct, and the test was corrected.

[63 personal-session browser checks passed](../portal/evidence/candidates-eaee1ea0cb9f/results.json) against the final compiled source. Both fresh-write concurrency cases passed: identical commands returned structurally identical results; competing command IDs produced one success and one stale-version denial. Each race added exactly one person and one migration audit entry, with unchanged application count and capacity. Lost and malformed replies retained the same command; stale Arabic review was denied; refreshed linked records had no apply control. No browser errors, server 5xx or external requests occurred. Cleanup disabled six accounts, zeroed cohort ledgers and restored the feature flag. [Three screenshots were visually inspected](../portal/evidence/candidates-eaee1ea0cb9f/visual-review.json). The native-tested production Python files remain unchanged; only the CLI synthetic fixture helper/counts changed afterward and were exercised by the final browser run. TypeScript/Vite build passed. The first-write concurrency assertion in run `b06a110aa015` compared serialized JSON property order; it now compares result objects structurally and retains both responses before asserting. Run `1ab45da6f2a7` stopped on an unstable exact label lookup after reason entry; the textarea now has an explicit translated accessible label. Run `51b3abab7179` passed that check and the full migration confirmation/retry flow, then failed while creating race fixtures whose phones violated the historical application uniqueness rule. Distinct synthetic legacy contacts correct the fixture without relaxing the product rule. Both failed runs are retained and confirmed cleanup restored the candidate flag, disabled all six accounts and zeroed cohort capacity ledgers.

## Remaining scope

This is a single-record reviewed migration, not a completed batch-import/reconciliation dashboard or real-data rollout. Next: recoverable intake, profile-correction and migration navigation; then the remaining S5 profile/privacy, ownership/follow-up/activity, sourcing, documents, consent, former/internal candidate and import requirements. All 98 reference IDs, S6–S12, HR/IT decisions, independent security, UAT, representative sustained 1,000+ account capacity/recovery and production rollout remain in scope.
