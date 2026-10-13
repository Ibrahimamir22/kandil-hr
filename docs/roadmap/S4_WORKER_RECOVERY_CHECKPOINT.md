# S4 — local notification worker recovery

13 October 2026. **S4 remains in progress.** This checkpoint proves local transaction recovery with real independent RQ worker processes on the synthetic parity site. It does not prove automatic scheduled execution, remote email delivery, production capacity or HR acceptance.

## Implementation

`foundation/outbox.process_one(name)` now owns the per-notification commit/rollback/retry boundary. The existing scheduled `process_pending` batch delegates to it and selects due rows in stable next-attempt/name order. Both worker entry points require the internal Administrator context and reject HTTP requests. Business commands still enqueue inside their own transactions; they must never call this committing worker boundary. `deliver` retains the existing current-access locks, stale-step suppression and atomic local receipt/mail-capture behavior.

A recoverable exception rolls back all delivery effects before recording its sanitized exception class and bounded retry state. Five failed attempts produce terminal `Failed`. A reasoned, audited System Manager retry can reset a failed row; suppressed rows cannot be revived. A crash before commit leaves the original due row recoverable by the next scan. A crash after commit leaves a terminal receipt that repeated delivery cannot duplicate.

No upstream edits, schema changes, provider adapter or frontend changes are part of this checkpoint. No site configuration, shared queue or general worker was changed. Existing web behavior uses the unchanged `deliver` contract; the new worker boundary is loaded by each new worker process.

## Real-process proof

[Recovery evidence](evidence/worker-recovery-1fc8a9b12e9f.json): **35 checks passed**, including queue-isolation assertions. The runner `docs/roadmap/test_worker_recovery.py` creates one UUID cohort and one dedicated RQ queue, starts independent `rq.SimpleWorker` processes through Frappe's actual `execute_job` wrapper, and runs the production `process_one` boundary. It deliberately does not use `FrappeWorker`, because that class automatically starts the shared Frappe scheduler.

- Forced process exit **after actual capture/receipt writes, before commit**: database rolled back the effects and attempt increment. A newly started worker created exactly one receipt and one capture.
- Forced exit **after commit, before RQ acknowledgement**: delivery persisted. Resubmission on a new worker did not increment attempts or duplicate either effect.
- Exception after actual delivery writes: full rollback; sanitized `Retry` persisted. The same worker continued to a healthy independent test notification.
- Early retry respected the backoff without consuming an attempt; a due retry delivered once.
- Five real worker failures reached terminal `Failed`; a normal replay did not revive it. Reasoned operator recovery produced one receipt/capture and one recorded manual retry.
- Access revoked between failure and retry suppressed the message with no receipt/capture. Further replay remained suppressed.
- All six synthetic accounts were disabled, all cohort capacity commitments reconciled to zero, the dedicated queue was cleared and unrelated queue membership fingerprints remained unchanged at every observation and cleanup.

The test moves retry timestamps only on exact designated cohort rows. This proves due/backoff enforcement and crash recovery, **not wall-clock retry scheduling**. Deliberate exits leave RQ acknowledgements incomplete; the harness explicitly resubmits the database outbox row on a fresh worker. Automatic periodic redrive, automatic RQ orphan handling, Redis durability under host failure and full infrastructure recovery remain separate work. Queue and worker metadata cleanup is restricted to manifest-owned objects, and refuses cleanup while an identified cohort worker PID is alive. Immutable synthetic business/audit history is retained.

## Regression and authorization

[Final native regression](evidence/s2-regression-54c85a77c187.json): **102 checks passed**. It covers internal-only worker entry, foundation/manual-retry rules, current-reference delivery, independent authority revocation, SLA contexts, inbox privacy and requester amendment events. The worker proof used the final production implementation; the subsequently added worker-authorization test module changes no production behavior. Source fingerprints are stored in both evidence files.

## Remaining work and next execution

S4-05 is **in progress**, not complete. Next, use a separately isolated scheduler environment/site so actual Frappe scheduled hooks can scan only synthetic records and queues. Prove reminders and database-outbox redrive run without browser activity, repeat across worker restart, and record hook/job identity plus delivery effects. Do not start the shared Frappe worker against its existing backlog.

Complete disabled-recruiter handoff, local template/recipient coverage, current escalation/delegation/Board recipient rules, business-calendar/deadline UI and queued notices aging into a later milestone or non-working day. HR must confirm calendar/escalation policy. Automatic rejection remains disabled. External email requires configured delivery and approved test recipients; local capture is not sent mail. S5–S12, all 98 frozen requirements, independent security assessment, sustained 1,000+ account testing, HR/IT UAT and production rollout remain open.
