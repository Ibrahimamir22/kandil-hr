# S4 — native scheduled reminders, retry and disabled-recruiter fallback

13 October 2026. **S4 remains in progress.** Native Frappe scheduled hooks now have an actual wall-clock, independent-worker rehearsal with no browser activity. This is isolated synthetic engineering evidence, not production scheduler supervision, email delivery, scale or HR acceptance.

## What was exercised

The [15-check rehearsal](evidence/scheduler-rehearsal-739f9e51bfe9.json) runs Frappe's `enqueue_events_for_site` from a bounded two-second timer, then its real `ScheduledJobType.enqueue`, RQ `execute_job` and `run_scheduled_job` handlers on a separate `SimpleWorker` process. It does not call the business processing functions directly from the host test and does not mock the wall clock.

The three installed methods retained their hook frequencies:

| Installed method | Frequency | Observed result |
|---|---|---|
| `recruitment.sla.process_pending` | Daily | Four highest-due expiry notices generated and delivered locally; request remained Pending and its seat remained reserved. |
| `foundation.outbox.process_pending` | All | Future retry stayed undelivered, then a later automatic scan delivered it after its due timestamp. Outstanding work was delivered after worker restart. |
| `recruitment.ownership.process_disabled_handoffs` | Hourly | Missed-disable fallback cleared disabled lead, application owner and next-action owner; kept an explicit Unassigned state and one cleanup audit. |

The retry was due at **17:10:35 Cairo**; successful delivery was observed at **17:11:46**. These are observed timestamps, not a latency guarantee. The production default All interval was shortened to 60 seconds only on this test site; the site-dispatch timer ticks every two seconds. A synthetic seven-day workweek and eight-day-old waiting date make this scenario independent of the test day. The existing native SLA regression separately covers real configured weekends and holidays.

After the first pass, the host requested a graceful worker stop and observed its process exit. It queued a new ordinary outbox event while the worker was down. On restart, the still-running site scheduler dispatched pending work; the new event produced one receipt and one capture. The test backdated the Daily/Hourly job's last-execution fields again to test replay without waiting a day. Repeated hooks preserved exactly four SLA notices and one ownership cleanup. Eight native job logs for this attempt ended Complete; logs from earlier attempts were excluded from assertions.

This complements [real process-death recovery](S4_WORKER_RECOVERY_CHECKPOINT.md), which separately proves before/after-commit crashes, bounded failures and operator recovery. This scheduler test uses a graceful restart and a short synthetic retry timestamp. It does not independently prove automatic RQ orphan reclamation, Redis durability after host failure or production service-manager recovery.

## Isolation and retirement

A new `kandil-parity.localhost` was created **inside the separate `kandil-hr-sandbox` database/Redis stack**. The identical site name permits existing tightly guarded synthetic fixtures; it is a different database/server environment from the 8102 development portal. The portless `kandil-hr-scheduler-rehearsal` container did not expose a new website. A private marker plus exact UUID, site, test flags, muted-email configuration and synthetic-company checks guard every test entry point.

Only this site's dispatch function was selected. All other Scheduled Job Types on this fresh site were stopped during the test and their stopped/logging settings restored afterward. No general FrappeWorker/all-sites scheduler was started. Shared development queue membership fingerprints remained unchanged. Upstream runtime checkout SHAs matched `deployment/versions.lock.json`; no core files were edited. Provisioning used the current development checkout; this is not a clean-release installation certification.

[Independent retirement verification](evidence/scheduler-retirement-2026-10-13.json) confirms **all 18 accounts across three attempts are disabled**, their private passwords removed, capacity commitments zero, scheduler paused/disabled and no live rehearsal worker. There were zero configured outgoing email accounts and zero Sent Email Queue records. Test history is retained. The portless container and the three separate sandbox services started for this work were then stopped; their data was preserved. The 8102 portal stack was not stopped or migrated.

## Reproduction and failure evidence

- `deployment/prepare_scheduler_site.py` provisions only a fresh test site inside the separate deployment sandbox. It refuses existing sites/markers, reads secrets privately and retains installation diagnostics outside Git.
- `kandil_hr/foundation/scheduler_rehearsal.py` supplies internal-only fixture preparation, native timed dispatch, isolated worker control, scoped inspection and retirement. It is not a public API or replacement production scheduler.
- `docs/roadmap/test_scheduler_rehearsal.py` supervises actual process handles, records source hashes/logs/effects, requests graceful shutdown and verifies cleanup. Existing evidence cannot be overwritten by a rerun. A fresh UUID is permitted only after the prior cohort is retired and scheduling paused.
- `deployment/verify_scheduler_retirement.py` rechecks stored account, capacity, scheduler and email state read-only.

[Attempt 4e56ccc0c095](evidence/scheduler-rehearsal-4e56ccc0c095.json) failed during test preparation because a positional approval argument conflicted with `step_id`. It ran no scheduled jobs; the corrected fixture uses explicit named arguments. Its six committed setup accounts were subsequently retired, as proven by the independent retirement file.

[Attempt 729e73521e16](evidence/scheduler-rehearsal-729e73521e16.json) stopped before the timed assertions because the test worker's 100-job bound was consumed by initialization work. The harness now runs until explicit stop with an idle bound, checks native job logs within the current attempt and verifies the RQ worker's actual process identity when stopping it. Its six accounts were retired. Failed evidence remains failed; raw diagnostic logs remain private.

[Final focused regression](evidence/s2-regression-44b201888070.json): **35 native cases passed** — 15 SLA/calendar/context cases, 10 ownership cases, 7 handoff/audit cases and 3 worker-entry authorization cases. Source fingerprints match the exercised implementation. No business-rule or UI changes were required for this checkpoint.

## Still open

S4-04 and S4-05 remain in progress. Complete the notification event/recipient/template matrix; current escalation/delegation/Board-recipient semantics; queued notices aging into later milestones or non-working days; calendar/deadline UI; and candidate-facing ownership acceptance with S5. The scheduled disabled-recruiter fallback is now verified, but this does not complete the future candidate workspace or its role-specific UI acceptance.

HR must confirm SLA calendar, escalation policy, templates and Arabic terminology. Automatic rejection remains disabled. External email remains unconfigured. All 98 frozen requirements, S5–S12, independent security, sustained 1,000+ account capacity, HR/IT UAT, hosting and production rollout remain open. Next engineering work is the remaining deadline/calendar and delivery-policy behavior, then its AR/EN portal controls.
