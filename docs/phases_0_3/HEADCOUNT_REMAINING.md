# Remaining headcount acceptance — 12 October 2026

Source-only follow-up review; no new case is promoted by this note.

## AT-HC-005-03 — pending own reservation 2 to 3

The tested approved-opening amendment changes existing openings and reserves only the increase. It does not edit a Pending request's own reservation. Current `recruitment.api.amend` accepts Approved/Filled, while `revise` requires Returned. Ordinary Pending edits and reviewer increases are denied. Frozen reference `Requests.gs::requestSave_` also permits Draft/Returned editing; `phase40.js` proves own-reservation exclusion from a view, not an in-place pending increase.

Next bounded test: Pending quantity 2, inspect own-reservation preview, Return, revise, edit 3 and resubmit. Verify reservation history 2→0→3 (net +1 and never 5), no change to another request, old steps invalid, and replay without an extra reservation. This lifecycle is distinct from an atomic pending 2→3 amendment. Do not silently add such an endpoint to satisfy ambiguous acceptance wording; retain the distinction for HR review.

## AT-HC-006-01 — exact WARN/BLOCK contract

`test_contracts.test_hc_006_same_shortage_block_then_warn_and_frozen_authority` already exercises identical quantity 3 / structural 1 under Block then Warn, Sector approval and a frozen Warn snapshot after configuration changes. Frozen reference `Requests.gs` blocks submission in BLOCK mode and requires a justification of at least 10 characters in WARN mode. No Sector override of BLOCK is established by that reference.

Current `recruitment.api.submit_request` checks a nonblank justification before Block mode, leaving the reference's minimum length and validation ordering unimplemented. Next change should enforce that exact contract and add a matrix: Block with blank/short/valid reason always rejects without reservation; Warn below 10 rejects; valid Warn records mode, quantity, available seats, excess and reason, requires the independent Sector/CEO route, and rejects an ordinary HR attempt at that step.

Successful Warn events retain evidence. Rejected Block transactions roll back; they do not currently retain a durable denial event. Explicit denied-attempt auditing must have its own transaction/privacy design if required. The command audit design describes the separate broader evidence gap.

HR policy sign-off remains separate from synthetic technical proof. These notes do not permit an automatic headcount exception, production data migration or a payroll change.
