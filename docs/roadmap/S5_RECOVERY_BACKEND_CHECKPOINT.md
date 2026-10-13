# S5 durable candidate recovery backend

14 October 2026. Partial engineering checkpoint. This introduces recovery storage and APIs; the existing candidate forms still call their original commands directly. Navigation/reload recovery is not yet delivered in the user interface, and ordinary candidate mode stays disabled.

## Contract

The new `Kandil Candidate Recovery` DocType stores an immutable, actor-owned command envelope for intake, profile correction or legacy migration. Its unique key derives from actor and command ID. The reviewed arguments are encrypted using the site's Frappe encryption key; candidate details are not persisted to browser storage. Native document read/write permissions are empty, and native mutations/deletion/rename are blocked. Site administrators and key custodians remain privileged; encryption is not a substitute for access control or backup/key management.

- `prepare` validates a bounded allowlisted command shape and current candidate authority, then stores it without executing business work. A same-ID/same-payload retry returns the same envelope; changed input conflicts.
- `pending` returns a paginated actor-owned index of opaque references, operation, status and creation time only. It contains no profile, request, application or contact fields. A user's own index may show a command after its request grant is revoked; its details and execution remain inaccessible.
- `inspect` rechecks current role, request/native scope, opening and person/application authority before returning that actor's stored arguments.
- `execute` calls the existing candidate command with its original ID and arguments. Existing versions, permission checks, audit, receipts and transactional effects remain authoritative. The business effect and Completed marker commit together. Completion-marker failure rolls the effects and deferred callbacks back even if an internal caller catches the error.
- `acknowledge` closes a Completed envelope and removes its encrypted payload. The original command receipt/audit remains. It cannot acknowledge unfinished work.
- `cancel` closes only a still-Pending envelope without an existing business receipt and removes its encrypted payload. It prevents subsequent execution through recovery and never reverses a completed business action.

Current company/request locking serializes preparation/execution/cancellation. A retry waiting for another preparation uses a current locking ownership lookup so it can see the new envelope despite an older transaction snapshot. An acknowledgement/cancellation has a stable idempotent response for the original actor. No background job automatically executes stored candidate requests.

## Verification

[48 native checks passed](evidence/s2-regression-05a90348bfc3.json), with all [13 recovery cases rerun on the final code](evidence/s2-regression-808d33ebbfda.json). [18 personal-session HTTP/concurrency checks passed](../portal/evidence/recovery-ba86d3ea924d/results.json), using browser sessions but without a new recovery UI. Concurrent preparation returned one reference; concurrent execution returned one identical result and created exactly one application/person with unchanged capacity. Reload and a new signed-in session recovered the stored command/result; other-account access and revoked-scope execution were denied. The observed execute/cancel race completed execution and rejected cancellation. Native tests additionally cover cancelling before execution. Acknowledgement removed the payload and inbox entry. No browser errors, server 5xx or external requests occurred; cleanup disabled six accounts, zeroed cohort ledgers and restored the feature flag. Initial native run `d135a6b8e230` found two implementation defects: automatic DocType naming prevented preparation deduplication, and a local `_` variable shadowed translation/error handling. Both were repaired; the record now has an explicit unique dedupe key and naming method. Native run `05a90348bfc3` passed 48 checks: 13 recovery, 9 migration apply, 17 identity and 9 corrections.

The first HTTP run `e342501ad068` exposed a repeatable-read retry race: after waiting for the first preparation, a nonlocking ownership lookup could miss its committed row and return 403. The final native rerun and session/concurrency test above verify the locking lookup fix. Source hashes match the final implementation; upstream pins and whitespace checks passed. Failed evidence is retained, with all six fixture accounts disabled, capacity reconciled and the candidate flag restored.

## Next delivery and open gates

Connect candidate intake, correction and migration forms to prepare/execute; provide a bilingual recovery inbox and explicit review/resume/result acknowledgement. Prove navigation, refresh, session expiry, interrupted preparation/execution, competing tabs and storage unavailability through the actual UI. Clients must not treat an unknown preparation result as permission to generate a fresh business command ID.

Unacknowledged payload expiration/operational cleanup, key rotation/recovery and a user-reviewed retention policy remain open before ordinary activation. This backend does not replace the existing business audit or implement candidate consent/retention requirements. All 98 requirements, remaining S5 work, S6–S12, HR/IT decisions, independent security/UAT, sustained 1,000+ account capacity and production gates remain in scope.
