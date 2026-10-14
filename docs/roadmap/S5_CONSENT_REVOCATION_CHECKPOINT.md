# S5 consent link revocation and private history

Date: 2026-10-14. Full scope remains all 98 frozen requirements. This checkpoint adds pending-link revocation; it does not implement consent withdrawal or complete S5.

## Behavior and authority

An authorized original issuer or configured recruitment leadership can revoke the current unaccepted link for the selected application, after reviewing an explicit reason. Expired links, paused vacancies and changed/unpublished notices can still be revoked. An unrelated recruiter cannot revoke another issuer's link. Current company/department scope, native record permissions, enabled account, roles and current team/leadership are checked before every command, including retries.

Revocation appends an immutable record containing invitation, exact notice revision, actor, reason and timestamp. The original invitation and application are unchanged. The candidate receives the same generic unavailable response as for other unusable links, without the internal reason or actor. Revoked links cannot be copied, viewed or accepted. Issuing a replacement later does not revive the old link.

Accepted consent cannot be erased through this command. A candidate's recorded acceptance is retained unchanged; withdrawal/reconsent/retention need their own explicit workflows. A repeated command returns the original event after fresh authorization. Changed payloads and attempts against a superseded invitation are rejected. Company-level locking serializes acceptance, replacement and revocation; a pending link cannot be both accepted and revoked.

## Portal and history

The AR/EN candidate panel contains a reviewed revocation form. An uncertain response freezes its payload and disables conflicting actions; retry uses the same command ID. History is private to the selected application and shows issuing actor/reason, time, current status and any revocation actor/reason/time. Five records are shown per page. The backend uses current locking reads after acquiring authority to avoid stale history after concurrent writes. No bearer value, internal command signature or invitation ID is projected in history.

The separate synthetic review dataset still contains no published company notice, invitation, acceptance or revocation. Its personal account sees the truthful empty history. No legal wording was invented to make controls appear.

## Verification

- Schema evidence: `evidence/consent-revocation-schema-2026-10-14.json`. Added the empty revocation table on parity and review, with exact before/after hashes for existing candidate, capacity, audit, privacy notice, invitation and acceptance records. No existing records changed or new business records were seeded.
- Native evidence: `evidence/s2-regression-01c1fa45bb10.json`. **46 checks passed**: 13 revocation/history, 25 consent and 8 transport checks; no skips, source unchanged, rollback-scoped fixtures.
- Review evidence: `../portal/evidence/review-work-1792001684407/results.json`. **34 read-only AR/EN checks passed**, preserving review business records, with no browser errors, server 5xx or external requests.
- Connected browser evidence: `../portal/evidence/candidate-consent-30d00cfb54f4/results.json`. **64 checks passed**, covering reviewed revocation, uncertain-response retry, current authority, private history pagination, simultaneous acceptance/revocation, identical revocation and replacement/revocation, plus the existing complete consent journey. No browser errors, unexpected staff 5xx or external requests; candidate/capacity snapshots were unchanged. Six temporary accounts were disabled, fixture ledgers zeroed and feature/monitor leases restored; synthetic history retained.
- Four final English desktop/Arabic mobile screenshots were manually inspected: `../portal/evidence/candidate-consent-30d00cfb54f4/visual-review.json`. Form controls, history and translated confirmation fit. Timestamp precision remains cosmetic. Raw capability probes were absent from server console/file logs, error records, receipts, audit and actual monitoring records.
- Build passes; existing runtime-font-resolution and bundle-size advisories remain. No 1,000+ capacity or production performance claim follows from the build or concurrency correctness checks.

### Failure corrected

The first native run (`s2-regression-26b1a6d0acd1.json`) exposed a local variable named `_` shadowing the translation function in error paths. Renaming the unused opening variable restored the intended validation/permission errors. The final 46-check run above supersedes that failed run; counts are not added together. The first connected run (`candidate-consent-a61438401f33`) then stopped at a test navigation timeout: clicking the already-selected Candidates navigation item retained the open detail, so the harness now uses Back to candidates before choosing another application. Its six temporary accounts were disabled and leases restored. Two subsequent runs (`candidate-consent-c9d8293b7930` and `candidate-consent-263f24a2d5d5`) stopped at harness timing assertions: the first read old history before refresh settled; the second matched two transient pagination controls during navigation. The harness now waits for the selected candidate row, new pending state and expected history rows. Both runs completed cleanup. Visual inspection also found an English success message surviving an Arabic language switch; messages now retain both translations and render using the current language.

## Remaining scope

Withdrawal, reconsent, retention/purpose and talent-pool rules; candidate documents/self-service uploads; canonical Screening and reviewed leadership reopening; remaining sourcing/interviews/offers/joining/lifecycle/reporting work. Actual employer wording and privacy choices require HR/privacy-owner acceptance. Independent security, production identity/proxy/logging, capacity for 1,000+ accounts, migration/recovery, HR UAT and staged production release remain open. Odoo, company-data site and shared worker backlog were not changed.
