# Finite P0–P3 decision audit review — 12 October 2026

Scope: original 40 requirements / 80 cases. The exact AT-AUD-001-01 expectation is unchanged. See `../phases_0_3/DECISION_AUDIT_INVENTORY.md`. This is local synthetic engineering evidence, not HR approval or production readiness.

## Changes and review findings

- Joining captures exact original outcome inputs and locked source/effect projections. Successful replay returns before an occupancy refresh can change the ledger. New outcomes retain pre-refresh state, and audit persistence shares the business transaction. Tests cover rollback and existing final-outcome rules.
- Delegation captures creation, CEO decisions, revisions and first revocation. Native creation uses explicit absence; endpoint commands suppress duplicate native-hook records. Only declared temporal fields normalize; native JSON saves preserve unchanged approval metadata.
- Occupancy reconciliation includes exact invocation, principal and old/new occupied count, basis and as-of date. Native Department changes retain observed field deltas and reviewed version, without claiming a raw HTTP request body.
- Disabled-account cleanup retains original initiator (or explicit unknown scheduler), execution identity and exact opening/application ownership changes. Requester-visible events omit private task content. Private immutable records survive Applicant deletion, and audit failure restores the whole handoff and only its added callbacks.
- Independent review found that aggregating every Applicant into one `Small Text` Security Event could exceed its 65,535-byte storage limit and repeatedly roll back cleanup. The correction uses separate application records and a bounded opening record; the regression exercises more than 64 KiB of aggregate private content. A second review identified uncapped existing team snapshots and large legacy reasons; `changed_fields` is widened to Long Text, with a near-limit valid source reason producing an audit larger than 64 KiB. Only the synthetic parity site is migrated for this checkpoint.

## Diagnostic history

Initial focused failures are retained rather than overwritten. The first joining fixture lacked ordinary team access, and a later replay fixture attempted a prohibited backdated native assignment edit. Fixtures were corrected without relaxing product authorization/date guards. The native replay test advances a controlled business clock; the separate HTTP fixture clearly labels its CLI-only synthetic historical seed.

A handoff assertion expected PermissionError when the immutable event controller correctly raised ValidationError for deletion. Only the assertion was corrected. Parallel source edits invalidate an otherwise passing gate's frozen-source claim; the final checkpoint must cite a separate unchanged-source run.

## Acceptance boundary

All in-scope rows need executed identity, exact-input/delta, before/after, timestamp, immutability and relevant rollback/replay evidence. Shared central/Security Event protection tests may support several adapters. Original historical records are not backfilled.

External protected audit anchors remain AT-AUD-001-02. Durable shortage-denial history remains HC-006-01; override/operator governance remains AUD-002. This work cannot promote those cases. P4–P10, production identity/provider setup, HR terminology approval and final release restore remain separate.

Execution results and exact tested source are recorded in `CHECKPOINT.md`; do not infer a passing result from this source review alone.
