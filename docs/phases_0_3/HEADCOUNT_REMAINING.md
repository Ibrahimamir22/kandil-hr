# Remaining headcount acceptance — 12 October 2026

Source implementation and four focused headcount tests verified in the final 23-suite serial gate. This note updates the earlier proposed work to reflect current code and test assertions. It performs no database work, changes no baseline wording and promotes no acceptance case. **AT-HC-005-03 and AT-HC-006-01 remain partial.**

## AT-HC-005-03 — pending own reservation 2 to 3

The approved-opening amendment mechanism changes existing openings and reserves only its increase. It does not edit a Pending request's own reservation: `recruitment.api.amend` accepts Approved/Filled; `revise` requires Returned. Ordinary Pending edits and reviewer increases remain denied. The frozen reference `Requests.gs::requestSave_` also permits Draft/Returned editing; `phase40.js` own-reservation exclusion is a view rule, not evidence of an atomic pending increase.

The lifecycle test is now implemented in `recruitment.test_headcount_contract.test_pending_two_return_revise_three_is_release_then_reserve_not_atomic_edit`:

1. Create a separate pending request reserving one seat, and the subject pending request reserving two.
2. Check the preview excludes the subject's own two-seat reservation. Aggregate reserved is three.
3. Return the subject request, releasing its two seats. Subject reserved is zero; aggregate reserved is one.
4. Revise the Returned request, edit the new Draft quantity to three and resubmit. Subject reserved is three; aggregate reserved is four.
5. Replaying the same submission adds no reservation. The old approval-step key is invalid; the other request and all previously stored revision snapshots remain unchanged.

The subject sequence is **2 → 0 → 3**, with the unrelated reservation preserved; aggregate reservation is **3 → 1 → 4**. It is not an atomic **2 → 3** update while remaining Pending. Between Return and resubmission those seats are released and can be considered by another transaction. A final net increase of one does not erase that distinction.

This is a bounded implementation/test of the existing lifecycle, not approval to add a new pending-edit endpoint. Keep the exact atomic acceptance clause unresolved for HR/product review. Existing approved amendments and pending preview checks cannot substitute for that clause.

## AT-HC-006-01 — exact WARN/BLOCK contract

The earlier minimum-length and ordering gaps are **fixed in source**. `recruitment.api.submit_request` now calls `recruitment.headcount_contract.enforce_shortage` before reservation mutation:

* No shortage: this exception-justification rule adds no requirement.
* Shortage in BLOCK: reject immediately, regardless of blank, short or valid justification. A valid reason does not authorize a Sector override of BLOCK.
* Shortage in WARN: require at least **10 trimmed characters** before proceeding. A nine-character reason padded with spaces still fails.
* Valid WARN: freeze mode, demand/availability/basis and justification, reserve under existing checks, and follow the independent exception approval route. An ordinary HR role cannot decide a Sector exception step.

This follows frozen `src/Requests.gs:303–305`: BLOCK precedes the justification check; WARN requires ten characters. It does not grant automatic exception approval.

Current test source adds:

| Test | Assertions present |
|---|---|
| `test_headcount_contract.test_block_precedes_blank_short_or_valid_reason_and_leaves_no_effect` | Identical quantity 3 / capacity 1 shortage; BLOCK with blank, short and valid reasons always gives the blocking denial; request, route, ledger and relevant counts remain unchanged. |
| `test_headcount_contract.test_warn_rejects_trimmed_lengths_below_ten` | Blank, whitespace, nine characters and padded nine characters deny without changes. |
| `test_headcount_contract.test_warn_ten_characters_snapshot_and_independent_exception_authority` | Exact ten-character reason accepted; requested 3 / available 1 / shortage 2; frozen WARN policy and submitted reason; Sector principal; HR denied; independent Sector decision retains reviewed reason/actor/principal and reservation. |
| `test_contracts.test_hc_006_same_shortage_block_then_warn_and_frozen_authority` | Same shortage across mode settings and frozen submitted authority/policy despite later configuration changes. |
| `test_authority_audit.test_hc00402_personal_sector_shortage_requires_independent_ceo` | Interested Sector exception does not become self-approval; independent CEO authority is required. |

All four focused tests pass within [the frozen-source final 23-suite gate](../sprints/evidence/audit-document-final-2026-10-12.json). The complete acceptance clauses remain partial for the reasons below.

### Why the case remains partial

Successful WARN commands now enter the implemented command-audit boundary and retain reviewed input/state evidence. **Rejected BLOCK/WARN transactions still roll back; they do not retain a durable denial event.** Tests proving denial and unchanged ledger are not tests proving retained denied-attempt history. The successful-command envelope does not close that gap.

Durable failed-attempt auditing needs an explicit transaction, scope/privacy, retention and failure-handling contract. It must not accidentally commit a denied request or reservation, leak rejected sensitive input, or pretend an uncommitted success envelope is a denial event. See [COMMAND_AUDIT_DESIGN.md](COMMAND_AUDIT_DESIGN.md) for the current wrapped operations and missing boundaries.

HR policy acceptance, production data migration and payroll changes remain outside these synthetic engineering cases.
