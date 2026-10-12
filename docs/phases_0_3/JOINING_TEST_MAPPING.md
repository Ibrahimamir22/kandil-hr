# Joining lifecycle regression scope

`kandil_hr.recruitment.test_joining.run` executes 11 native ORM tests on
`kandil-parity.localhost` only. Each case creates synthetic role/scope/request/offer
fixtures, then rolls them back. It requires the explicit pilot/foundation/parity
flags and `allow_tests`, Administrator CLI invocation and installed schemas.
Business actions execute as an ordinary scoped recruiter. No HTTP login is simulated.

| Test | Acceptance relationship |
|---|---|
| partial_full_and_parent_completion_reconcile | AT-HC-007-01; accepted offers do not occupy seats, each actual join creates one Employee and dated assignment, open→occupied conservation and organization reconciliation; both vacancy and parent completion |
| filled_and_closed_locations_complete_parent | AT-VAC-002-01 partial coverage: mixed Filled/Closed locations close parent; per-location Cancelled variant remains untested |
| terminal_replay_has_identical_links_and_no_duplicate_effect | AT-HC-007-01 sequential replay after parent closes; same original links and unchanged counts/ledger |
| changed_replay_payload_denied | Replay with changed date/birth date/reason rejected |
| overfill_denied_and_no_employee_created | Excess accepted offer cannot overfill fully occupied approved line |
| hold_and_freeze_block_joining_without_ledger_changes | Sequential pause validation; independent-connection joining race is a separate gate |
| no_show_and_withdrawal_preserve_vacancies | AT-HC-007-02 partial coverage: terminal non-join outcomes require reason and keep seats unfilled; joining correction remains unsupported |
| failed_onboarding_request_rolls_back_all_joining_effects | Simulated native onboarding insertion failure with Frappe request rollback semantics; Employee/assignment/ledger/opening all restored |
| revoked_management_grant_blocks_joining | Current authorization denial before new joining |
| replay_retains_original_assignment_after_later_assignment | Stable original assignment ID after closing its episode and creating a later episode |
| joining_assignment_reference_cannot_be_forged | Native submitted-offer save rejects outcome, reason, assignment and finalized status changes |

The onboarding result is explicitly **Draft** (`docstatus=0`); tests assert no
Project/Task growth. P7 task orchestration is outside this implementation. Fill
void, employee deactivation, backdated assignment reversal and request reopening
remain unimplemented and unaccepted.

## Findings preserved from pre-final runs

- The first fixture lacked native company Holiday List Assignment. This exposed
  the submitted-onboarding path's prerequisite, not a joining ledger defect.
- Native onboarding task assignment then failed under the deliberately narrow
  recruiter role. Scope was bounded to an explicit draft onboarding handoff;
  broad Task/Project permissions or shares were not introduced.
- An existing Grant is immutable; the denial test was corrected to revoke it.
- Frappe skips `validate()` during a submitted-document update. A native direct
  offer edit initially bypassed a guard in that method. The parity path now also
  checks `before_update_after_submit`, including finalized native status.
- Once that guard worked, the test expected ValidationError rather than the
  intended PermissionError. The expectation was corrected without weakening the
  business denial.

The final executed result and source hashes belong in
`../sprints/evidence/joining-recruitment-checkpoint-2026-10-12.json`; the final frozen-source gate passed all 11 joining checks, all 26 recruitment checks and all 9 SLA checks (46 total, zero skips) at 03:03:33 UTC. Custom source hashes were unchanged during the complete gate.
