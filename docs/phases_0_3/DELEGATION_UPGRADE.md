# Delegation metadata upgrade

The updated code adds process scope and explicit CEO approval/version metadata. The new `approval_status` field deliberately has **no SQL/default value and a blank first Select option**. New ordinary grants become Active only through authorized server validation; new CEO grants become Pending CEO. Rows lacking approval metadata cannot match the active-delegation predicate.

An intermediate, unpublished local schema used `default: Active`. The pinned Frappe migration builds an ADD COLUMN SQL default from that value, which can fill pre-existing rows without calling document validation. Removing a default prevents that behavior on a first upgrade but does not rewrite already populated rows.

On the isolated parity site, read-only inventory found one pre-migration ordinary test grant plus two new revoked CEO grants. Both accounts on the old grant were already disabled, preventing its use. The exact retired grant was revoked through the native audited save path, and a second independent bench process confirmed replay made no change. No active production grant was inspected or modified; no blanket grant migration was performed.

Evidence:

- `../sprints/evidence/delegation-schema-native-2026-10-12.json`: five checks against actual installed metadata, Frappe SQL generation, a temporary row created before ADD COLUMN, its NULL/inactive result, and the installed column's NULL default.
- `../sprints/evidence/legacy-delegation-remediation-2026-10-12.json`: exact synthetic cleanup and read-back after the bench command committed.
- `../sprints/evidence/authority-final-2026-10-12.json`: final regression, including new ordinary/CEO behavior and legacy version/revoke handling.

The repair helper is a narrow test-maintenance function bound to the recorded parity ID, users, creation time and disabled-account state. It is not a production migration and is not exposed as an HTTP endpoint. Any installation that ran the intermediate local schema needs its own reviewed inventory; legitimate new ordinary grants also have no CEO approval fields, so that absence alone is not a safe revocation heuristic.

The temporary-table migration probe runs in its own fresh CLI process because DDL can cross transaction boundaries. It refuses pending writes and never changes application rows. All other shared-site suites run serially.
