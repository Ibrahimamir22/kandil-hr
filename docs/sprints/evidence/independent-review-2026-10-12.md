# Independent scoped source review — 12 October 2026

Reviewer: foundation agent, separate from recruitment joining, organization CSV and deployment implementers. This is an application source review, not full release acceptance. The reviewer authored the foundation guards; that part is a consistency recheck, not an independently authored security audit.

## Finding resolved after review

**Resolved P1 — Organization invariants could use a stale snapshot after waiting for Company.**

`organization/api.py:get_locked` first reads the record company without a lock, then acquires Company. Under the configured MariaDB REPEATABLE READ isolation, acquiring a row lock does not refresh that earlier consistent snapshot. `organization/models.py:KandilPositionAssignment.validate` checks overlapping employee assignments and peak occupancy using nonlocking `get_all`; `KandilPositionHierarchy.validate` similarly reads the hierarchy with `get_all`. `dated_import_preview` and `structure_state` also use nonlocking reads. Two independent operations can therefore serialize on Company yet the second validate against data from before the first committed. Concurrent native assignment creation can admit overlapping primary assignments/over-capacity occupancy; hierarchy changes can miss a just-committed edge.

Minimal correction: current locking reads for all decision/invariant inputs after the Company lock, including referenced position state, assignment/hierarchy sets, approved revision checks and apply-time import reconciliation. Do not solve this by committing midway. Add independent-connection cases that deliberately establish both snapshots before contention. Sent to organization agent and root. The organization agent replaced invariant queries with the current locking query helper and added current Position/Employee/revision reads. I independently reread those fixes and the test harness. Saved evidence `docs/organization-evidence/organization-concurrency.json` records 6/6 checks, including independent connections with deliberately old REPEATABLE READ snapshots rejecting seat overfill, overlapping employee assignment, hierarchy cycles and a revoked assignment grant. `docs/sprints/evidence/organization-native-2026-10-12.json` records the final 47/47 organization regression checks. The concrete finding is resolved for those paths. I inspected the evidence rather than rerunning that agent's database tests.

## Revocation finding and subsequent coordinated correction

Foundation `has_scope` reads User enablement and Access Grants through ordinary consistent reads. Therefore fresh-request revocation checks are proven, but a mutation that authenticated before a Company-lock wait may retain old grant state if revocation commits while it waits. This review does not claim that in-flight actions fail immediately after revocation. A stronger guarantee needs explicit current-scope revalidation and a consistent mutex order across modules. Adding locking reads to the generic helper alone is unsafe because callers currently invoke it both before and after Company; root and organization agent were notified. This is an unverified in-flight revocation boundary, separate from the fresh-request controls already tested.

The suspected joining/recruitment reverse lock order was reviewed with root: submit acquires Company before request/capacity, amendments create drafts without route resolution, and mutation endpoints use bounded whole-transaction retry. No confirmed lock-cycle finding remains from that suspicion. Root separately identified route/config authority reads that need current-read treatment after a Company wait and is adding focused regression coverage.

## Resolved during review

The joining replay path initially read linked Employee/Assignment/Onboarding results through nonlocking `get_all` after waiting on Company, potentially reporting a false inconsistency after a concurrent successful join. The joining implementer independently replaced these with `SELECT ... FOR UPDATE`; the reviewer reread and confirmed the correction. Current position/allocation reads are also locked before joining. Concurrent joining runtime evidence remains the joining agent's separate gate.

The joining implementer also replaced the all-primary-assignment replay assumption with a protected stable `custom_kandil_assignment` reference, resolving the source-level replay-after-transfer concern. A focused regression was added by that implementer; its final runtime result remains separate evidence.

## Other inspected boundaries

- CSV accepts content only, never a server path/URL; size, rows, cell sizes, column allowlists, numeric ranges and dates are bounded. The preview endpoint requires company management scope, native write permission, draft authorship and matching record version. Loading a CSV does not bypass independent review/apply. No additional high-confidence access bypass found in this path.
- The CSV parser's formula-looking string rule is narrower than every possible spreadsheet formula prefix (for example a minus-prefixed expression can pass). Current upstream CSV writer escapes formula-trigger prefixes; no executable spreadsheet-export exploit is claimed from this difference.
- Joining checks native offer read permission, recruiter role, full request manage scope, current vacancy state, accepted submitted offer, active lead, dates and capacity. Company → request → capacity → opening/offer lock order is explicit. Employee/assignment/capacity/opening/offer/onboarding updates remain in the caller transaction; no commit was found inside the action.
- Hook wiring includes scoped native detail/list guards, private File validation/download/ZIP protections, DocShare denial, Report controller and Prepared Report guards. Migration setup invokes protected-share cleanup. A site with old direct shares must complete that cleanup before revocation is claimed.
- Foundation guard review is a consistency check against already recorded native tests, not independent HTTP retesting. Legacy file aliases/copies, all HRMS/payroll endpoints, full field-level redaction, MFA and external identity remain outside this proof.
- Deployment publishes only loopback web/socket ports. MariaDB/Redis have no host port mapping. Secret files are generated locally and mounted as Docker secrets; the full `.local` tree is ignored. Installer captures sensitive new-site command output and does not log password arguments. Commands still carry credentials in child argv within the local container; this is local development tooling, not a hardened production secrets mechanism.

## Secret exclusion checks

Read-only `git check-ignore` confirmed exclusions for deployment local admin/database password paths, local workspace private uploads, site configuration, parity credentials, `.env` and SQL dumps. The tracked-name check found no matching credential/config/dump paths. No secret values were read or printed. Root's staged content secret scan is still required; ignore rules alone are not content scanning.

## Verification limits

The initial review was source-only and made no database changes. Root subsequently authorized the bounded mutation-helper implementation and isolated synthetic proof described below. Other agents' evidence was inspected rather than independently rerun by this reviewer. Organization/HR policy approval, restore rehearsal, full production authorization and complete baseline acceptance are not claimed.

## Initial examined source hashes (history preserved)

Recorded UTC: 2026-10-12T02:47:24.126462+00:00

- `kandil_hr/recruitment/joining.py`: `28662283553e553abe3e9feb0a434ed78bcc7786400f4f6da364fa071a81dd33`
- `kandil_hr/organization/api.py`: `5ec26e5450be3ba0986d935cde769c48b96a5882c9bee0311630fba6cd9ee2b8`
- `kandil_hr/organization/models.py`: `77f756b631e6ee05a3bb474b4a3659aac1d95f674ec60aa723529ba4ea402a17`
- `kandil_hr/organization/csv_import.py`: `c859bfb98a38b0d278f655568151bf0ddc3466d61c7402ff96db4e3ad98920e4`
- `kandil_hr/organization/permissions.py`: `71ff82ec6ab83b78ce98cdae9a1e5b5918308a8253b0148d2919920d354f514f`
- `kandil_hr/hooks.py`: `43f335e7581b7160919c2d8904f3471664566489636477989a69b636954da702`
- `kandil_hr/foundation/files.py`: `58c01c237a30b9337374eba3151d327ba4e2580de1171bdfca1aefbe2af80ffe`
- `kandil_hr/foundation/reports.py`: `4848e48e664ae038c74268c523f3a5cdb6a5170fef904d0ae7af74621d5df427`
- `kandil_hr/foundation/security.py`: `5bb6136f1478ba0bfef217f0ffac665da3457f59bf092061420ab92c1fe5fb2c`
- `deployment/prepare.py`: `babf0aa55d8c47cee0a35ec98493db356b0cb056b8b6d4bbe3c9f17e26d4b953`
- `deployment/install.py`: `fe2da6233e4dd74347d958d03549e258d32a29c217d9f70f4ef06729299f22be`
- `deployment/compose.yaml`: `ed839f08e71f88d6cfc5934e277eada8a41a3fac02815b477c5f1ca308abb5d9`
- `.gitignore`: `7c2b08d6387fcd3983466e51404423be09acb4a6c6db5851b2630bb1c02cbbfa`

## Final resolution and frozen-source evidence

The original findings above are retained as discovery history. The concrete organization stale-snapshot and joining replay findings are resolved in the reviewed paths; no identified P1 from this scoped review remains open. This is not full release/security acceptance.

Root authorized `foundation/mutation_access.py`: mutation-only current User, explicit role and Access Grant reads run after domain mutexes. The generic read/list scope helper remains unchanged. The helper does not acquire Company and has no privilege fallback. Root integrated it into request/vacancy actions, including current principal/delegation and team authority checks. The joining agent integrated actor/lead checks after domain locks and sorted User locks. Organization applies late native `before_save` checks after domain validation. This reviewer authored the helper, so its review is explicitly a self-check supported by automated tests, not a separate independent audit.

Frozen-source evidence:

- `foundation-native-2026-10-12.json`: 52/52 checks, zero failures/errors/skips. Classification is 14 pure calendar/clock, 13 mocked authorization, 25 native database checks. It must not be reported as 52 native tests.
- `foundation-mutation-concurrency-2026-10-12.json`: 4/4 gates. Three independent-connection REPEATABLE READ cases establish an authorized old snapshot, then revoke a grant, disable the account or remove the required role while Company is held. Current mutation revalidation denies every contender; the fourth gate confirms synthetic fixture cleanup.
- `foundation-concurrency-2026-10-12.json`: 5/5 gates on the frozen source. Eight distinct connection IDs enqueue one identity; eight delivery workers create one receipt/attempt; rollback after receipt creation allows one competing completion; no Email Queue growth; fixture cleanup passes.
- `joining-recruitment-checkpoint-2026-10-12.json`: inspected saved PASS for 11 joining + 26 recruitment + 9 SLA checks (46 total), with unchanged source hashes during the run. Joining tests cover stable replay after a later assignment, rollback, pause/overfill boundaries and direct submitted-Offer forgery. The joining agent found that submitted-document updates skip `validate`; its `before_update_after_submit` guard now protects outcome, reason, assignment and final status. I inspected the correction in source.
- `docs/organization-evidence/organization-concurrency.json` records the organization 6/6 proof discussed above; the organization agent refreshed the formatted-source 47/47 native and 6/6 concurrency gates at 03:04:56 UTC, with path-qualified hashes. Those saved hashes match the final source inspected here.

Only UUID-owned synthetic users/grants/notifications were committed for the two foundation concurrency probes; cleanup completed and DB connections closed. No migration or application source edit followed these foundation final gates.

Residual limits remain explicit:

1. A newly resolved principal can add a notification recipient after the initially known User set. Cross-company shared-user contention therefore relies on bounded whole-transaction retry; no deadlock-free or sustained-load claim is made.
2. The outbox proves exactly one local transactional receipt under the specified races, but strict in-flight access revocation while a delivery worker waits on an outbox lock is not certified. Reusing business mutation lock order inside the delivery worker would require a separate design. Fresh-request disabled/revoked recipient suppression is tested.
3. Native row-before-Company edit contention, all upstream HR/payroll surfaces, historical file copies/aliases, full field-level redaction, MFA/external identity, real HR acceptance and production restoration remain outside this release proof.
4. Joining currently creates draft Employee Onboarding; native Project/Task generation and automatic shares are intentionally not executed. Automatic SLA rejection remains disabled pending policy.

## Final reviewed source hashes

Recorded UTC: 2026-10-12T03:05:03.884432+00:00

- `kandil_hr/recruitment/joining.py`: `c8ec5ef32d46c6fbd01d5a6a73243234ab59ca5d34f1f5bd3bbad92067a95123`
- `kandil_hr/recruitment/test_joining.py`: `f0adcbbb453067c96f9986487ef635b76616ef98b246eec5a950b9a429e74682`
- `kandil_hr/pilot/extensions.py`: `12a5fec0840d120151a2d149c71b332e62f8796eaa3caba0e2ffb5e56eb38f59`
- `kandil_hr/recruitment/api.py`: `0b5d0b2b05d9195b8640aa6c32d1ff8830d2c844c72eac0ebd54dd585872e57e`
- `kandil_hr/recruitment/vacancies.py`: `c8a6da90069e8e344ed56f0c502ef52a6b760270ffade7893483d1cd84d30a27`
- `kandil_hr/organization/api.py`: `d5a57a3f9b8f369656306bd29dd8339f889f55e05332d784b8ca544d734eb39e`
- `kandil_hr/organization/models.py`: `c7a87ac6c6edc8f3ce64592515136907092fe15a16ba66b48fcde36f5a182de3`
- `kandil_hr/organization/current.py`: `800a04e7c0edc78c02fa183b0e31cecb939bab2378e71ad22223d0104e1e06fb`
- `kandil_hr/organization/concurrency_tests.py`: `0da9af14fad94c86ff48b52365d2cc65a2dbbd00610c084f940169f73fea6817`
- `kandil_hr/organization/csv_import.py`: `107f08d28521c1e669fddad14f9323352bb0beaf7952f7840a24ca911a85bd57`
- `kandil_hr/hooks.py`: `43f335e7581b7160919c2d8904f3471664566489636477989a69b636954da702`
- `kandil_hr/foundation/mutation_access.py`: `23166ff2fd6a633dc8316b12527228e6e07dec051e4821688045a84243a66f2d`
- `kandil_hr/foundation/mutation_access_runner.py`: `f15b367d5d3af6de7a61e5889efc736d59ecfc249d92784ad8da2d7112816323`
- `kandil_hr/foundation/test_mutation_access.py`: `ac364de13cacf5eb8e18bf42dfb2199334e1f2f3327afc84e166fc152c77e1b3`
- `kandil_hr/foundation/tests_runner.py`: `8719a1368ea246526632f57d1c4fd27a1eb684de77bed71a11d994687774372b`
- `kandil_hr/foundation/concurrency_runner.py`: `ef1241362ea8f5e378630e3f91c9ba7361f2eba6df5f72890ff7d9dc6a199267`
- `kandil_hr/foundation/outbox.py`: `3402731f756c216a4e24668c4289dd119605fa4f28a33b4637e46501b62070b0`
- `kandil_hr/foundation/files.py`: `58c01c237a30b9337374eba3151d327ba4e2580de1171bdfca1aefbe2af80ffe`
- `kandil_hr/foundation/reports.py`: `4848e48e664ae038c74268c523f3a5cdb6a5170fef904d0ae7af74621d5df427`
- `kandil_hr/foundation/security.py`: `5bb6136f1478ba0bfef217f0ffac665da3457f59bf092061420ab92c1fe5fb2c`
- `deployment/prepare.py`: `babf0aa55d8c47cee0a35ec98493db356b0cb056b8b6d4bbe3c9f17e26d4b953`
- `deployment/install.py`: `fe2da6233e4dd74347d958d03549e258d32a29c217d9f70f4ef06729299f22be`
- `deployment/compose.yaml`: `ed839f08e71f88d6cfc5934e277eada8a41a3fac02815b477c5f1ca308abb5d9`
- `.gitignore`: `cc7b39023ddc586d5a2d0016ea930309b3b0f9a0be6ad178b90193252b5a3c62`

## Subsequent continuation — identity, register and organization-code review

The earlier frozen-source sections are historical checkpoints, not claims about later changed code. The strict outbox in-flight revocation limitation above has since been addressed for its reviewed production reference adapters: `outbox-revocation-2026-10-12.json` records the controlled grant/account/role revocation races and local receipt safeguards. It does not retrospectively erase already committed receipts. `outbox-shared-recipient-2026-10-12.json` adds eight independent workers delivering two company references to one recipient. It does not establish universal deadlock freedom.

The session hook and scoped position register are authored by this reviewer, so their validation is a self-check with real HTTP/browser evidence, not an independent audit. See `security-session-scope-2026-10-12.md`: 7 session groups and 12 equal-looking company/branch access groups passed; all committed fixtures were cleaned.

Independent source review of the new `recruitment/corrections.py` found that a field-only edit could change an already Filled request to Closed. Root corrected the final status calculation to retain the existing terminal status for field-only edits. The current correction command uses the Company/request/capacity mutex, current recruiter authority, command receipt replay, same-scope destination checks, remaining-seat ledger updates and transaction rollback. No additional concrete correction ledger/replay defect was found in this bounded source pass. Confidential-note scope relocation remains deliberately restricted by the separate privacy guard.

**Actionable organization-code finding:** `organization/codes.py::protect_target` initially used nonlocking `db.exists`. A native rename/delete transaction whose repeatable-read snapshot predates a newly committed registry mapping can therefore miss the mapping and bypass the mapped-target restriction. Native rename calls `before_rename` before taking its eventual target write lock. The recommended correction is a current target row lock followed by current registry reads; do not acquire Company after target. Organization owns the fix and independent-connection proof. At this review entry, runtime closure is pending. Existing-target imports can already lock Code before target, so introducing target→Code guards must also account for deadlock/retry behavior; correctness does not imply deadlock-free execution.

Returned structure requests retain protected route/history/approval rows and re-preview/resubmit before approval. Current code-registration/import paths preserve explicit company identity and apply-time validation. Beyond the stale-read issue above, no additional high-confidence exploit or invariant failure was identified in the inspected changes. This is source review of these paths, not full HR-policy or production security acceptance.

### Organization-code finding closure

I independently reread the final `protect_target` correction: it locks the current target row, then reads current registry rows, with no target-to-Company acquisition. Saved `docs/organization-evidence/code-guard-current-read-2026-10-12.json` records 4/4 independent-connection Job/Unit rename/delete stale-snapshot probes passing, plus the owner's affected native organization regressions. The product `codes.py` hash matches the current source. The concrete old-snapshot bypass is resolved in these guarded paths. I did not independently rerun the owner's DB suite. The runner subsequently changed timestamp/path metadata, so I reported its recorded/current hash mismatch to the owner for an explicit evidence-boundary correction; no exact-current-runner claim is made here. The documented conflicting-global-master deadlock/whole-transaction retry limitation remains. No additional actionable product defect remains from this bounded review.

Current reviewed product source hashes:

- `kandil_hr/recruitment/corrections.py`: `4f406d0ed9332db2372cf5e7fd3f06e75c8a88192452d4a82b39f9540f97e1c4`
- `kandil_hr/organization/codes.py`: `5f06a9c4eafa8b098036681db97e39b5e4b4a0d3f4e7277e8ee67e62b78373df`
- `kandil_hr/organization/api.py`: `4b7a76290f9eca57d1894fbf256fc55f69da13190464f7e218b4b8788c54eba2`
- `kandil_hr/organization/models.py`: `9566fc3fd1e151effc54778eec6d6f9f5bfca878dcd844ac0786e2672ddfd518`

The owner subsequently corrected the evidence boundary: `source_unchanged=false`, `product_source_unchanged=true`, and explicit executed/current runner hashes. I verified current runner hash `e928b76c8d7d63b974b3ff987fda7522f319efda4cf16a1f74e42f64c9fd7d7f`. The documented post-run change is the equivalent Ruff UTC timestamp alias/import cleanup; product guard/hooks are unchanged. The metadata discrepancy is closed without claiming a rerun of that formatting-only runner.
