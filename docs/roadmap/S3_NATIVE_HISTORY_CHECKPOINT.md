# S3 — native history access and embedded snapshots

13 October 2026. This increment narrows native historical access and removes embedded raw snapshot fields from ordinary request reads/command replies. It preserves safe immutable revision reads and the existing AR/EN portal comparison. It does not complete S3 or certify all native historical references.

## Implemented behavior

- Native Request Revision list and detail now share a SQL predicate, applied before native list pagination. The reader needs current access to the parent request, current native User Permissions, historical company/department scope, readable Position/Capacity references, and permitted replacement-employee identity/profile access.
- Revision metadata must match the stored request name/company/department. Invalid JSON and unexpected top-level, line or approval-step keys fail closed. Capacity references must match the historical company/department. Supported Capacity writes already preserve their identity dimensions.
- Native raw JSON cannot redact individual references. Legacy snapshots do not reliably capture the requested position branch, so this native raw route requires department-wide historical scope. Branch-scoped users can continue using the permission-checked modern portal capture where recorded locations establish access. Administrator remains the documented break-glass account.
- `submitted_snapshot` and `route_snapshot` on Hiring Request, plus child `reviewed_snapshot`, have permission level 1, with no ordinary-role level-1 grants. Standard Frappe reads filter them out, including REST v1 and v2. The pinned list compiler either omits inaccessible fields or denies the query; neither response may contain their values.
- Native recruitment command replies and receipt replays omit those three nested fields for ordinary callers. Projection occurs only after the internal command: stored receipt results, original snapshots, immutable revisions, decision records and business hashes retain their original contents. Existing request status, quantity and approval fields remain available.
- Native submitted-record edits remain prohibited. Reading a form and attempting to save it cannot erase the omitted history fields.

## Verification

[Native final run](evidence/s2-regression-8470ece98ed6.json): **79 checks passed**, with unchanged Python source fingerprints: 15 historical-access, 7 recruitment acceptance, 8 confidential-note privacy, 26 recruitment commands, 9 recruitment contracts and 14 portal command-history cases. These are rollback-scoped synthetic ORM tests; they are not a production security audit.

[Focused personal-session browser run](../portal/evidence/request-history-c4222493ea82/results.json): **55 checks passed** on English desktop and Arabic mobile. Ordinary requester, manager and HR sessions retain permitted review content and native immutable revisions. Both REST versions omit embedded snapshots. Outside-scope and Guest access are denied, and revocation clears the previous comparison. Six fixture accounts were disabled and ledgers reconciled during cleanup. [Visual review](../portal/evidence/request-history-c4222493ea82/visual-review.json) covers the Arabic comparison columns and English snapshot.

[Original hiring journey](../portal/evidence/browser-6665fbf73b5f/regression.json) and [checks](../portal/evidence/browser-6665fbf73b5f/results.json): **24 checks passed** for the existing bilingual request/approval/headcount/vacancy flow. Six fixture accounts disabled, all commitments reconciled to zero and history retained. Final browser total is **79 checks** across the focused and original journeys.

The focused browser fingerprint includes both changed schema files and the native source. The native regression runner fingerprints Python files; it does not independently fingerprint database metadata. Successful native reads plus HTTP checks exercised the reloaded schema on the synthetic site.

## Runtime and reproduction

Source definitions are in `kandil_hr/kandil_hr/doctype`; installed schema needs migration/reload before testing, not just a web restart. On the isolated `kandil-parity.localhost` site, the two affected DocTypes were reloaded and `parity-web` restarted. No real-data site was migrated. Existing installers/migrations synchronize source DocTypes; a fresh-install proof for this increment remains separate.

From the app checkout, run:

```sh
python3 docs/roadmap/run_s2_regression.py --suite kandil_hr.recruitment.test_history_access.run --suite kandil_hr.recruitment.test_acceptance.run --suite kandil_hr.recruitment.test_privacy.run --suite kandil_hr.recruitment.test_commands.run --suite kandil_hr.recruitment.test_contracts.run --suite kandil_hr.portal.test_request_history.run
node docs/portal/test_request_history.cjs
```

Run mutating synthetic suites serially. The browser harness starts with a fresh synthetic cohort and cleans up accounts/commitments while retaining history. Credentials remain private local files.

## Diagnostic evidence

The initial 11-case [native guard run](evidence/s2-regression-c3373bdc3513.json) passed with existing acceptance/privacy cases (26 total). The expanded [diagnostic run](evidence/s2-regression-fb8b9789797f.json) passed 14 of 15: its query test incorrectly expected every forbidden field selection to throw. The pinned Frappe compiler can omit that field instead. The corrected test requires every returned row to contain only `name`, or a PermissionError, while preserving the requirement that no protected value is returned. All 15 then passed in the final 79-case run.

## Remaining historical and release work

This is not blanket approval for native raw history. Further review is still required for nested route-policy references, amendment/job-opening/Board-proof references inside raw revisions, revision-attached File metadata, historical event surfaces and custom reporting paths. The portal continues projecting an explicit allowlist and checking private proof access. Do not extend this evidence to those untested raw paths.

Next, connect standalone immutable revision metadata/detail and selected submission-versus-decision comparisons, using exact stored captures rather than reconstructing past state. Complete delegated/CEO/Board/correction and pending-quantity history acceptance. Keep original immutable-byte positive tests and negative scope tests.

S3-04/S3-05 remain in progress; all 98 reference IDs and historical acceptance results remain unchanged. HR/IT decisions, independent security/UAT, sustained 1,000+ account capacity, recovery, hosting, real-data migration and release acceptance remain open. The full goal stays active.
