# Recruitment command tests / اختبارات أوامر التوظيف

The baseline remains immutable: 80 planned acceptance cases. This file maps a subset to new test code; it does not mark requirements complete. Tests use actual Frappe ORM, hooks, DocTypes, users and business commands. They do not simulate HTTP authentication, browser actions or separate-connection concurrency.

## Invocation and prerequisites

After the integration owner has migrated and explicitly opted in a disposable synthetic parity site:

```sh
bench --site kandil-parity.localhost execute kandil_hr.recruitment.test_commands.run
```

Required: installed Frappe/ERPNext/HRMS/custom app, migrated schema/custom fields/hooks/roles; `allow_tests=1`; parity in site name; one synthetic Company with TEST in its company name. No unrelated enabled company-wide authority rules should apply to the fixture company. Run database suites serially. The suite patches the three Kandil feature flags and mail mute only inside each test; it does not persist site settings.

Each case creates unique users, scoped grants, department, title, two locations/Positions/capacities and a manager assignment. Setup uses Administrator for fixtures and internal organization transition only for seeding approved hierarchy. Actual hiring actions use ordinary user accounts and native scope checks. No external provider is called and no commit is issued. Per-test savepoint rollback removes fixture records and restores company settings; a full-transaction deadlock rollback will fail the test rather than commit fixtures.

## Mapping and limitations

| Test method | Baseline cases supported | Evidence scope |
|---|---|---|
| test_submit_replay_does_not_duplicate_effects | AT-REQ-006-02; AT-HC-005-01; AT-REQ-007-01/02 | One receipt and unchanged event/revision/outbox/opening counts on identical replay; not delivery-worker evidence |
| test_replay_cannot_advance_consecutive_steps_for_same_principal | AT-REQ-006-02; AT-REQ-009-01 | Same principal holds consecutive Department/HR authorities; first action replay leaves next step pending |
| test_command_collision_stale_version_and_wrong_step_fail_without_effects | AT-REQ-006-02; AT-REQ-008-01 | Changed payload, stale version and old step cannot mutate current request |
| test_two_locations_reserve_approve_and_cancel_exact_balances | AT-REQ-003-01; AT-HC-005-01; AT-VAC-001-01 | Two real native openings, quantities and ledger conservation; concurrency not demonstrated |
| test_return_revision_preserves_history_and_releases_old_reservation | AT-REQ-008-01/02; AT-REQ-009-01 | Prior snapshots remain unchanged, reservations release/reapply, step identities refresh |
| test_hr_reduction_releases_only_delta_and_preserves_requested_quantities | AT-REQ-006-01; AT-REQ-009-01 | Requested versus approved quantities and HR review deltas; joined-floor boundary requires joining fixture separately |
| test_amendment_increase_tops_up_existing_openings_once | AT-REQ-011-01; AT-VAC-001-01 | Linked increase reapproves and tops up existing openings; parent cancellation blocked while amendment active |
| test_pending_cancellation_replay_releases_reservations_once | AT-HC-005-01; AT-REQ-006-02 | Pending cancellation/replay preserves zero reservations and stable audit counts |
| test_read_only_or_revoked_grant_cannot_mutate_or_replay | AT-ACC-003-02; AT-REQ-001-02 | Same actor with revoked manage grant and new read-only grant cannot write/replay. No claim for full HTTP/files/export matrix |

## Execution status

Authored and Python syntax-checked at creation. The first native run executed 15 cases: six passed and nine failed at the shared native Staffing Plan permission dependency. This exposed an integration gap rather than a reason to give test users Administrator. The repaired final rerun passed all16 cases; see the execution record below. Record actual execution date, tested Git commit, site, pass/fail/skip counts and failures in a separate execution report. A skipped suite is not a pass.

هذه اختبارات تقنية جزئية وليست اعتماداً نهائياً للموارد البشرية. لا تشمل إثبات الصلاحيات عبر جلسة متصفح أو التزامن بين اتصالات قاعدة بيانات منفصلة. لا تُغيّر حالات الاختبار المخططة إلى ناجحة إلا مع دليل تنفيذ مؤرخ.

## Vacancy additions

Four further native cases now extend the same fixture, plus six pure priority cases:

| Test | Acceptance support |
|---|---|
| test_vacancy_team_is_deduplicated_scoped_and_command_replay_safe | AT-VAC-003-01/02: one lead, unique team, role/scope constraints, no repeated notification effects |
| test_vacancy_pause_freeze_resume_preserves_capacity | AT-VAC-006-01: start requires lead; hold/freeze/resume keep capacity; queue UI acceptance remains separate |
| test_closing_one_vacancy_then_parent_cancel_releases_each_slot_once | AT-HC-005-01; AT-VAC-002-01: closed quantity prevents double-release on later parent cancellation |
| test_all_closed_vacancies_close_parent_and_unresolved_candidate_blocks | AT-VAC-002-01: candidate disposition guard and automatic parent closure |
| test_priority.py (six pure tests) | AT-PRI-001-01: classification, age15/30/60, due0/7/30, expired pin, inactive state future date and native creation datetime boundaries |

Pure priority invocation: `python3 -m unittest kandil_hr.recruitment.test_priority -v`.
Six pure cases passed when authored on 12 October 2026. This does not establish native pin permissions, queue ranking under production workload or source-policy acceptance. The native ORM suite now has 16 cases. Final successful execution must be recorded at the integrated source fingerprint.

Two further cases cover preserved Hold/Frozen state during approved quantity amendments and real native priority pin/unassigned queue behaviour. The explicit `execute ...run` invocation is required: Frappe v16 `run-tests` silently omitted these plain unittest classes in the first discovery attempt; its zero exit code was not counted as a test pass.

## Executed native result — 12 October 2026

The final explicit runner executed **16 tests, all passing, no skips**, on `kandil-parity.localhost` at 02:17:06 UTC. All per-test fixtures rolled back. The app Python/JSON source fingerprint was unchanged during the run: `dfc12cd89b76f4520b9eb40be715eda1870b0b4c886036beda96b4a2467154f8`. Evidence: `../sprints/evidence/recruitment-native-2026-10-12.json`.

The tests exposed and verified fixes for two integration issues: native Staffing Plan validation conflicted with Kandil's position capacity authority, and custom recruiter roles lacked necessary native record permissions. Linked parity Job Openings now use the authorized Kandil ledger path while ordinary/unlinked openings retain native validation; the 16th case proves direct linked-opening writes remain blocked even with ignore_permissions. Native recruiter permissions were granted narrowly rather than adding broad HR Manager roles to test users.

This is partial technical acceptance, not all40requirements/80cases, concurrency proof, browser/translation acceptance or production readiness.

## Expanded security and bulk-assignment coverage

Ten additional native cases extend the suite to 26. All 26 passed in the later execution recorded below; the original 16-case run is retained as historical evidence.

| Test | Acceptance support |
|---|---|
| test_other_recruiter_cannot_take_over_draft_requester | AT-ACC-003-02; AT-REQ-001-02: a scoped recruiter cannot rewrite another requester's attribution through native client.save |
| test_child_save_cannot_forge_approval_or_capacity_outcomes | AT-ACC-003-02; AT-REQ-006-02: direct child save cannot change frozen decisions or reservation quantities |
| test_requester_json_draft_edit_preserves_datetime_authorship | AT-REQ-001-01: legitimate JSON draft edits still work and preserve creation/requester/owner |
| test_child_guard_does_not_change_nonparity_behavior | Compatibility boundary: the parity-only guard does not alter the existing pilot's child save behavior; no other site is touched |
| test_bulk_team_same_request_locations_replay_once | AT-VAC-003-01/02: two locations, one command receipt, exact replay, unchanged notification/event counts |
| test_bulk_team_second_parent_stale_rolls_back_first_parent | AT-VAC-003-02: stale second request causes bulk API rollback of first request's assignments and all receipts/outbox effects |
| test_bulk_team_closed_second_vacancy_rolls_back_first_parent | AT-VAC-003-02: second vacancy business failure also rolls back prior parent effects |

The bulk rollback assertions deliberately inspect state immediately after the API error without using the suite's rejection rollback helper. This tests the bulk command's atomic rollback rather than masking defects with test cleanup. All fixture data is still rolled back at the end of each test.


## Expanded execution — 12 October 2026, 02:24:56 UTC

**26 native tests passed, no failures/errors/skips, in 26.868 seconds.** The complete app Python/JSON fingerprint stayed unchanged during this run: `e61d9b99d9ef62ed55805763f2f381b90e48142fb0d01ef5daa084da99a2d8e2`. Updated evidence retains the previous 16-case result under `previous_execution`.

Three additional regression cases cover the subsequent source-review findings:

| Test | Acceptance support |
|---|---|
| test_parent_cancel_cannot_bypass_candidate_disposition_guard | AT-VAC-002-01: parent cancellation cannot close an opening with unresolved candidates and bypass the vacancy-level rule |
| test_revoked_hr_role_cannot_review_pending_quantities | AT-ACC-003-02: a principal who lost HR authority cannot reduce quantities using a still-pending HR step |
| test_sector_cannot_self_grant_ceo_delegation | AT-ACC-003-02: sector authority cannot create an unapproved CEO delegation |

CEO/Board delegation is now deliberately blocked until its separate approval workflow exists. This is fail-closed behavior, not completion of the full delegated executive approval requirement. Six pure priority cases also passed in the current pass. Native tests do not establish browser localization or separate-connection concurrency.


## Independent HTTP concurrency gate — 12 October 2026

The host runner `docs/sprints/test_concurrency.py` prepares its own synthetic TEST company and uses ordinary password login, authenticated identity verification and CSRF tokens. Each worker opens an independent HTTP connection, with a barrier and recorded overlap. Internal `recruitment/concurrency_fixture.py` operations are not whitelisted and require Administrator on the exact opted-in parity site. Private credentials use a mode-0600 ignored site file; cleanup removes passwords from it and disables the accounts.

The run at **02:33:08–02:33:25 UTC passed**, with 20 HTTP calls overlapping in each batch:

- Twenty quantity-one requests competed for five BLOCK-mode seats: exactly five succeeded and fifteen received the expected controlled HTTP417 rejection; five reservations and no openings.
- Twenty identical manager approvals returned HTTP200 with identical results: one receipt/revision/event, two intended local notifications, no opening, next authority still pending.
- Twenty identical final HR approvals returned HTTP200: one receipt/revision/event, one intended local notification, exactly one opening; ledger four reserved plus one open.
- Cleanup cancelled the test requests and reconciled the dedicated ledger to zero reserved/open/occupied and five available. Synthetic cancelled audit records remain; no review fixtures or real data were reused.

This gate exposed a real REPEATABLE READ replay bug: a non-locking receipt lookup could miss a concurrent committed receipt and incorrectly return TimestampMismatchError. The implementation now reads the receipt with FOR UPDATE after locking the request. The evidence retains the two preceding failed runs and their successful cleanup, and records unchanged source hashes for the final successful run: `../sprints/evidence/concurrency-http-2026-10-12.json`.

Supports AT-REQ-006-02, AT-HC-005-01 and AT-VAC-001-01. It is a short local concurrency test, not a sustained production load certification or approval for live candidate data. The SQL transaction effects and HTTP responses are evidenced; browser Arabic/English acceptance remains separate.
