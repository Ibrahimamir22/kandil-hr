# S4 — scheduled invitation catch-up

13 October 2026. **10 integration checks passed. S4 remains in progress.** This closes the isolated timed invitation catch-up gap recorded at `c3113b0`; it does not certify deployment latency or production capacity.

## Verified behavior

The [final run](evidence/invitation-catchup-065c904c1e8c.json) used a separate sandbox database and Redis, real wall-clock Frappe scheduling, real RQ execution and native Scheduled Job Logs. Only the invitation and outbox hooks were enabled. Their normal `All` frequency was retained; the sandbox interval was shortened to 60 seconds.

Setup deliberately omitted the request/delegation event callbacks, representing a committed action whose short-queue generation job was missed. No scheduler, generation, delivery implementation or runtime clock was mocked. There were no invitations before starting the scheduler. It then generated and locally delivered one invitation each for the current principal and existing approved delegate. A later effective delegation, also without its event callback, was recovered on subsequent scheduled execution. Repeated scans retained exactly one receipt and private MIME capture per invitation. The cancelled request received none; the pending reservation remained one. Both hook logs completed without a failed job log.

Six synthetic accounts were disabled, delegations revoked and capacity balances reconciled to zero. The scheduler was paused and its test processes stopped. Shared review queue membership was unchanged. The separate rehearsal container and its MariaDB/Redis services were stopped after verification, restoring their pre-test state. No company records, external mail or upstream core were changed.

## Setup failure and repair

The [first attempt](evidence/invitation-catchup-dbc48a1e6d33.json) failed before the scheduler was armed: the reused sandbox had not registered the invitation hook. Source contained the hook, but the installed Scheduled Job Type was absent. The harness now clears Frappe caches before native `sync_jobs`, matching normal migration ordering, and checks registration before creating fixture data. This is a test/deployment setup repair, not a change to invitation business rules.

The failed run's six-account cohort was separately retired with zero capacity and revoked grants before allocating the final fresh run. Cleanup now also handles a preparation failure after the shared fixture has committed. The failed evidence is retained; it is not counted as a pass. Source fingerprints remained unchanged during the final run.

## Limits and next work

Local notification receipts and MIME capture are not external email. A grant becoming effective on a future date remains covered by controlled-date native tests, not a wall-clock multi-day rehearsal. A small isolated cohort and shortened interval do not prove a 1,000-account workload, production topology, operational monitoring or delivery SLA. No new browser claim is made by this runtime test; prior invitation AR/EN browser evidence remains separate.

See [S4 requirement reconciliation](S4_REQUIREMENT_RECONCILIATION.md). Next implementation: replace exact-name company/department/location vacancy filters with scoped searchable selectors; close remaining event-policy gaps, then build the S5 candidate workspace and complete its ownership/handoff acceptance. All 98 original requirements and HR/IT/security/release gates remain tracked.
