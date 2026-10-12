# Command audit envelope — proposed next sprint

Status: **design only, 12 October 2026**. This document does not install a DocType, change a command, or establish a new acceptance result. No database was accessed for this design review. Existing acceptance definitions and policy decisions remain unchanged.

## Requirement and current gap

[REQUIREMENTS.md](REQUIREMENTS.md), AT-AUD-001-01 requires a decision to record its actor, acting principal, before/after values, exact command and timestamp, with ordinary API editing/deletion denied. The frozen reference's `src/Audit.gs::audit_` and `auditDiff_` record identity, on-behalf identity and field differences; `src/Config.gs::AUDIT_LOG` defines those columns.

Current records provide useful parts of this evidence:

- `recruitment.api.command` stores an immutable command receipt with actor, dedupe identity, payload hash and result. The hash alone cannot reconstruct the operation or reviewed arguments.
- `Kandil Request Revision` stores reviewed request snapshots. `Kandil Recruitment Event` stores action, actor, optional principal and a limited resulting state. Neither is an explicit before/after envelope linked to the exact client command.
- `organization.api.structure_command` stores command ID, actor, payload hash and result in command history. Structural approval steps retain the reviewed snapshot and decision identity, but not a unified command envelope.
- Other workflows maintain their own histories and replay checks. Their existence does not prove complete command-audit coverage.

**AT-AUD-001-01 remains partial.** This proposal supplies no executable proof of the missing fields, atomic linkage or every decision boundary. A central wrapper alone would still leave related-object effects and commands outside that wrapper uncovered.

AT-AUD-001-02 remains separate. [POLICY_DECISIONS.md](POLICY_DECISIONS.md), PD-09 requires a protected key/anchor operator and redaction/verification design. An immutable application record does not detect database-operator alteration, reordered rows or a removed tail. This sprint proposal contains no HMAC chain, external anchor or claim of tamper-evident parity.

## Proposed immutable record

Introduce `Kandil Command Audit` only after the contract and integration scope are accepted. Suggested fields:

| Field group | Required meaning |
|---|---|
| Identity | Schema version, domain, target DocType/name, company/department, unique command-audit key and existing receipt/history reference |
| Exact command | Operation name, original client command ID, reviewed version, canonical reviewed payload and its digest |
| Authority | Actual authenticated actor; acting principal and active approval step captured before the handler advances the route; explicit on-behalf evidence references where applicable |
| Time | Server-recorded successful effect time; site-local Datetime plus an unambiguous ISO timestamp with offset/timezone in the envelope |
| State | Explicit before/after projections for the primary target and each reviewed affected target; schema identifiers for each projection |
| Result | Canonical returned result and references to resulting records; no session credentials |

For commands without delegated authority, record the actor as acting principal and an explicit direct-action mode. For approval commands, derive the principal from the locked frozen step, never from a client-supplied principal or the next pending step. Board decisions must preserve their actual authority and evidence identities without pretending the normal delegation model authorized them.

Preserve the reviewed payload exactly after the endpoint's existing parsing/normalization. Do not silently trim or redact arguments while labeling them exact. A reviewed operation adapter must reject unsupported payload shapes or explicitly identify excluded secret material. Session IDs, cookies, passwords and API keys are never audit payloads. Commands that currently have no client command ID need an explicit compatible contract or a clearly named server invocation identity; do not fabricate a client ID retrospectively.

## Adapter coverage map

| Existing boundary | Proposed capture point and remaining work |
|---|---|
| `recruitment.api.command` | Capture request before state after authorization, domain locks, replay lookup and version check; capture resulting state after handler. Covers submit/decide/revise/review/escalation/amend/cancel at the command boundary. Amend needs a separate newly created revision target projection. |
| `recruitment.vacancies` commands and bulk assignment | These call the recruitment wrapper, but need explicit Job Opening/team and affected Applicant projections. Bulk commands need a shared batch correlation ID plus one envelope per underlying command, all in the same transaction. |
| `recruitment.ownership.application_command` | Calls the recruitment wrapper. Add Applicant ownership/task before/after projections; request-only snapshots cannot describe these effects. |
| `recruitment.corrections.correct_approved` | Calls the recruitment wrapper. Add reviewed Capacity, line and Job Opening projections for reductions and relocation. |
| `recruitment.joining_corrections.void_joining` | Calls the recruitment wrapper. Add Offer, Employee, Position Assignment, Onboarding, Capacity and Opening projections. Its existing before/after note is useful but does not substitute for exact command linkage. |
| `recruitment.joining.record_outcome` via `pilot.api.record_outcome` | Bypasses the recruitment command wrapper and uses its own final-outcome replay checks. Needs a separate adapter and an explicit invocation/receipt contract; capture Joined/No Show/Withdrawn and all resulting records. |
| `organization.api.structure_command` | Capture Structure Change, approval step and resulting snapshot; add explicit changed Position/Hierarchy/Capacity projections for applied operations. Preserve reviewed baseline and preview hashes. |
| `organization.api.approve_revision` | Separate boundary for JD Revision and Grade Band approval; capture reviewed and approved state plus any supersession reference. No current client command ID: contract must be explicit. |
| `organization.api.review_import` / `apply_import` | Separate review/apply boundaries. Preserve reviewed import digest and affected records with bounded projections; do not duplicate unrestricted raw CSV or arbitrary uploaded data into a public log. |
| `foundation.delegation.decide` / `revise` and native revoke | Separate decision/revision keys and native lifecycle. Capture approval status, process scope, effective dates, linked versions, actor/principal and retained old decision evidence. |
| Account-disable ownership cleanup | Runs after commit and on scheduler retry outside a client command. Record a system invocation with the known initiating actor when available, explicit unknown-origin retry identity otherwise, plus affected owners/tasks. Never fabricate the original human actor. |
| Native draft edits, confidential note creation, organization record saves and access-grant administration | Outside the two central wrappers. Inventory separately; existing Version/security/note history must not be relabeled as exact-command coverage. Confidential note content must remain isolated. |

The map describes adapters to implement, not adapters already installed. It corrects the initially suspected void-joining gap: `void_joining` does use the recruitment wrapper, although its multi-record effects still require their own projections.

## Privacy and application immutability

The new record should have no ordinary-role permissions. Initially allow review only through the documented Administrator break-glass boundary; any future business audit viewer requires an explicit scoped, redacted read contract. This is not production operator-policy acceptance.

Use `recruitment.privacy.shared_snapshot` for the request projection. Do not put raw payloads, candidate information, salary fields, HR notes or full `doc.as_dict()` values into the existing requester-readable Recruitment Event or Request Revision. Organization and related-object adapters need explicit field allowlists; adding a custom field must not automatically expand audit payloads. Restricted records can contain reviewed confidential arguments, so retention and later audit-viewer access need deliberate treatment.

Server-only insertion and unconditional ordinary edit/delete/rename denial must apply through native document APIs. Register the new type with existing protected attachment/share/report boundaries; deny direct sharing, child/file alias bypasses, downloads, unrestricted export and prepared-report access. Do not rely only on empty DocType permissions: stale DocShare and native secondary surfaces need tests. Administrator/database maintenance remains outside the ordinary-API immutability guarantee.

## Transaction and replay contract

1. Keep existing authorization and lock order. The audit module must not acquire a new Company/User lock after later domain locks or run an external service call.
2. After locking and checking the existing receipt, return an authorized replay without new audit effects. Reject the same command identity with different reviewed arguments.
3. Freeze explicit before projections and authority identity before invoking the handler. Keep primitive serialized copies so later in-memory mutation cannot rewrite the before state.
4. Execute the authorized effect, capture current resulting records under the same transaction/locks, then insert its receipt and audit envelope before commit. A unique identity must prevent duplicate envelopes on concurrent replay.
5. Any handler, outbox, receipt or audit failure rolls back the entire command. Do not commit inside the audit helper or swallow audit errors while committing business changes.
6. Multi-command bulk operations keep their existing whole-transaction rollback semantics. Native savepoints and whole-transaction retries must not leak buffered audit state between attempts.

Historical receipts/revisions remain historical partial evidence. Do not generate fabricated before states, principal identities or command arguments for them. If a future migration adds references, mark their provenance and missing fields explicitly.

## Next sprint and acceptance gates

1. Agree schema and a finite operation/target adapter registry; inventory all decision paths against the table above. Start with the recruitment and structure wrappers plus JD/grade approval, while keeping other paths explicitly incomplete.
2. Implement a small serializer/projector and server-only record controller with pure tests for stable serialization, preserved before values, unknown fields and explicit principal capture.
3. Integrate each selected boundary without changing authorization or replay semantics. Add related-target adapters before claiming complete before/after coverage for a command.
4. Run native synthetic tests for direct, delegated and Board decisions; exact argument/version reconstruction; ordinary insert/edit/delete/rename denial; list/detail/export/file/share/report privacy; and administrator review.
5. Prove same-command concurrent replay produces one effect, one receipt and one envelope. Inject failure at handler/outbox/audit insertion and verify no effect/receipt/audit remains; test bulk rollback and savepoint/retry isolation.
6. Publish an operation-by-operation coverage inventory and exact executed evidence. Keep AT-AUD-001-01 partial until its full agreed decision inventory is covered. Keep AT-AUD-001-02 unresolved until its separate protected-operator design and destructive tamper tests exist.

No production or HR-policy acceptance is inferred from these engineering gates.
