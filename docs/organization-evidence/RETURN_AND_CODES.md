# Structural return and external-code imports

Scope: native Kandil organization app on the isolated synthetic parity site. Odoo, existing main8100 and pilot8101 remain outside this change.

## Structural return

The active independent authority can return a pending structure change with a reason of at least three characters, matching the reference Structural.gs contract. A return records the actor, reason, reviewed proposal and prior approval round. Only its author can edit the returned proposal. A fresh preview is required before resubmission; a new independent chain and new step IDs replace the active round. Earlier decisions remain in protected history and the native form exposes their reasons under Previous Review.

Final Create still occurs only after all authorized approvals. Command receipts make exact return and final approval retries idempotent; changed replays and stale steps fail. Rejection is terminal and retains its reason.

## External identities

`Kandil Organization Code` preserves company + entity type + original external code and the explicit native target. Unit targets are Departments, Job targets are Designations, and Position targets are Kandil Positions. Mappings are immutable, independently reviewed through Organization Import, and searchable/exportable through native scoped lists. Source codes are never generated from a title match.

Organization Import supports Units and Jobs in addition to Positions, Hierarchy and Assignments. The native row editor and bounded UTF-8 CSV preview support these schemas:

- Units: required `external_code,title`; optional `target,parent_department,is_group`. Parent Department must already exist as a group in the selected company. Import parent groups before their children. `is_group` is 0 or 1.
- Jobs: required `external_code,title`; optional `target,job_family`. A globally existing Designation title requires an explicit existing target and independent review; it is never silently reused by matching title.
- Positions: existing `external_id`, or `position_code` when no external ID is supplied, becomes the preserved Position code. Company and target identity remain stable.

Preview → independent Review → Apply is retained. Repeating the same batch or importing the same identities again returns unchanged targets. Conflicting target/code metadata fails for reconciliation instead of creating duplicates or replacing original identities. Applied imports expose View Imported Codes. Mapping an existing target creates a registry record without recreating the native master.

Mapped units cannot move to another company; mapped unit/job targets cannot be renamed or deleted; registry records cannot be edited or deleted. Native title corrections that leave identity unchanged may require source reconciliation on subsequent imports. Deliberate code replacement, alias merging and company migration are not supported by this immutable registry.

## Evidence

Final combined native gate passed organization47 + exact11, including AT-ORG-006-02, AT-ORG-008-01 and AT-ORG-008-02. Exact source hashes and assertions are recorded in return-and-codes-2026-10-12.json. CSV/organization pure tests: 37 passed. These are synthetic software checks, not real HR-data migration or business-user acceptance.

A subsequent independent review corrected a native target guard that could miss newly committed mappings under an older repeatable-read snapshot. The guard now locks the original target row, then reads current registry rows, without acquiring Company afterward. Separate Job/Unit rename/delete probes all passed (4/4), followed by the affected native47 + exact11 regression. See code-guard-current-read-2026-10-12.json. This proves stale-snapshot safety, not freedom from deadlocks: simultaneous global-master/import operations may require retrying a transaction selected as a database deadlock victim.
