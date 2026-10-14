# S5 reviewed pool-to-vacancy intake and latest visible application

Engineering increment: 2026-10-14. All 98 frozen requirements remain in scope. This extends the membership/search checkpoint; CAN-008 and S5 remain partial pending the remaining reference and acceptance clauses.

## Behavior and reference

The pinned reference's `Pool.gs:poolToVacancy_` delegates to `Candidates.gs:candCreate_`: reuse an existing person, create a distinct application on an open vacancy, attribute it to the pool, and reject an existing active application for that person/vacancy. The custom portal now exposes a reviewed destination preview and explicit create action. It does not transfer/close the original application, remove pool membership, send messages, create another person, or reserve/occupy a headcount seat.

- Source access, current person and native permissions are required. The destination must be in the same company and within current recruitment scope/team and native create/read permissions.
- Preview captures source/person/request/opening versions and the exact membership and POOL grant. Creation rechecks all of them under the company lock, plus vacancy activity, authorized lead and unfilled approved capacity.
- An active same-person application blocks creation. Rejected/withdrawn applications can be followed by a distinct application; contact similarity never chooses or merges people. The integrity check does not disclose a restricted application's ID, stage, owner or count.
- Source attribution is assigned by the server. The reserved `TALENT_POOL` code is rejected through ordinary generic intake. An immutable private `Kandil Pool Intake` event binds the source, target, membership, grant, actor, reason and reviewed versions; a target application activity is written atomically.
- Intake, its original command receipt/audit, activity and pool provenance share one transaction. Failure of a later write rolls all effects back. The internal intake composition entry point has no independent transaction retry; only the outer pool command can retry and reacquire source locks/check consent.
- Exact retries first recheck current source/destination authority and target application readability, then return the original result. Later withdrawal/removal does not turn an exact historical receipt replay into a second creation. A new command requires current eligible membership and consent.
- POOL consent never creates candidate-owned APPLY evidence or unlocks Screening. No real candidate consent, legal wording or employer policy was seeded.
- Pool results include the latest application the viewer can currently read, ordered by creation then stable ID. A permission-filtered window query selects one per person for the current page; restricted applications do not replace the visible result or leak counts. Active closure projection distinguishes withdrawal from rejection.
- AR/EN destination search/paging, review form, confirmation, uncertain-result retry, success navigation and private paginated intake history are connected. New-event history requires both source and target application access. Pool rows open the latest visible application and retain a separate membership-source link.

## Verification

- Final focused native suite: **19 passed**, no failures/errors/skips; synthetic fixtures rolled back. Evidence: `evidence/s2-regression-d574119098a4.json`.
- Earlier broader native run: **54 passed** across pool intake, membership and identity before the final result-read correction. Evidence: `evidence/s2-regression-e566d8944ca4.json`; it is supporting regression evidence, not a claim that all 54 ran against the final source.
- Preserved review: **46 passed**, AR/EN, existing records unchanged, no invented consent or membership, no browser errors/5xx/external requests. Evidence: `../portal/evidence/review-work-1792006236933/results.json`.
- Connected pool intake: **28 passed**, including lost-response recovery, exact simultaneous retries, competing commands, withdrawal serialization, native/private/API denials, source/person/headcount preservation and AR mobile creation/history. Cleanup disabled six disposable accounts, released all fixture ledgers and restored feature leases. Evidence: `../portal/evidence/pool-intake-e1e50ec267dc/results.json`.
- Four final EN desktop / AR mobile captures were manually inspected; labels, confirmation, result actions and history remain readable with no horizontal overflow. Evidence: `../portal/evidence/pool-intake-e1e50ec267dc/visual-review.json`.
- New DocType migration was repeated idempotently on the isolated parity and review sites, with existing-table hashes unchanged. Evidence: `evidence/pool-intake-schema-2026-10-14.json`.
- Final frontend build passed (75 modules); existing font/bundle-size advisories remain. Sustained performance and accessibility certification are not claimed.

The connected simultaneous-retry test exposed a consistent-read snapshot problem: even an outer `FOR UPDATE` did not make nested permission-list subqueries see the just-committed application. Receipt/result authorization now loads the application with a current locking read, checks its exact person/destination binding, and checks native document permissions on the application, person, opening and parent request. Source and target current authority remain checked before replay. Added denial cases cover an application-specific native User Permission and mismatched destination. The next browser run passed simultaneous exact retries, distinct-command duplicate prevention and withdrawal serialization, then stopped at a responsive navigation timing error in the test helper. The helper now waits for animations and checks the actual mobile menu state before clicking; its ready-state selector also targets the results heading specifically when the intake panel remains open. Earlier failed browser runs are retained; the final full-suite result is listed above.

The initial native run identified translation-name shadowing and an incorrect one-layer decorator unwrap in the retry test. The implementation now uses an explicit internal intake function rather than relying on decorator structure. A later negative test expected empty history when native opening permissions also hid the shared parent/source request; the correct 403 expectation was retained. No permission rule was relaxed. Another test incorrectly counted events across all retained synthetic cohorts; its zero-event assertion was narrowed to its own fixture company, preserving test isolation.

## Review

Open `http://kandil-review.localhost:8112/hr-portal` → **Talent pool / قاعدة المرشحين**.

1. Search the pool and choose **Add to vacancy / إضافة لشاغر** for a permitted member.
2. Search/select a destination and review the person, vacancy, source and consent date.
3. Enter a reason, confirm and create. Open the new application or review the intake history after reload.
4. The preserved review pool remains empty until authorized employer policy and actual candidate choices are entered. Complete synthetic examples are recorded in the separate test evidence.

## Remaining scope and limitations

- This is recruiter-selected vacancy reuse, not automatic AI scoring, screening or a hiring decision. Job-related CV matching, its explanations/consent and human review remain part of later reference work; no substitute ranking has been invented.
- Rehire restrictions, agency ownership/referral policy consumers, vacancy cancellation/transfer dispositions and source catalog integrations are unfinished. They must be connected before those scenarios are accepted; this checkpoint is not a complete sourcing system.
- Pool discovery still lacks the reference's private CV availability and full education/experience presentation pending the private-document scope. Public optional POOL consent and HR/privacy-owner acceptance remain open.
- All remaining S5 candidates/imports/privacy work, interviews/offers/joining/lifecycle/reports, independent security, 1,000+ capacity testing, migration rehearsal, HR/UAT and production gates stay on the full roadmap. The overall goal remains active.
