# S5 recovery sessions and scheduled cleanup

14 October 2026. Synthetic engineering checkpoint. S5 remains in progress. Ordinary candidate mode stays disabled until the controlled review-cohort activation step; production rollout is not implied.

## Session recovery behavior

Previously, candidate forms treated a later 401/403 as a confirmed failure and could release their retained attempt even when an earlier response had been lost. The shared recovery transport now treats that denial as an unresolved original request. It preserves the attempt rather than creating a replacement ID.

Authentication is checked separately through Frappe's existing current-user endpoint. A valid session with revoked business scope remains signed in, its original form stays frozen, and private inbox detail is cleared. A confirmed ended session triggers removal of displayed portal state and returns to sign-in. After authentication, the user returns to the actor-owned recovery inbox; login never executes a saved action. A different signed-in account receives only its own recovery list.

[19 browser checks](../portal/evidence/candidate-sessions-32c975f9f2d5/results.json) passed using real server-side session invalidation: after preparation but before execution, and after a committed execution whose reply was lost. Reauthentication resumed the former only after explicit review and recovered the latter without creating another application. The test also switched accounts, recovered in Arabic on mobile, and verified that a scoped denial preserves the original command ID without a misleading login loop. English login and Arabic result screenshots were inspected. The test disabled its six users, restored the candidate flag and reconciled fixture ledgers.

This is not a production idle/absolute timeout policy, MFA/identity-provider certification, or a complete account-switch/cache security audit. It proves the recorded session boundaries through the candidate recovery path.

The [42-case recovery UI regression](../portal/evidence/recovery-ui-f87b8cf8bcf5/results.json) also passed on the final source, covering all three forms, lost responses, competing sessions, expiry, stale discard and scope revocation. Both browser cohorts had no runtime errors, server 5xx or external requests. TypeScript/Vite build passed with the existing advisory bundle-size and local-font warnings.

## Real scheduler/worker rehearsal

[10 checks](evidence/candidate-cleanup-scheduler-a47fbec54950.json) passed in the independently isolated scheduler sandbox, with separate database and Redis services. The existing sandbox was verified retired before reuse, migrated to the current schema while paused, and assigned a fresh synthetic cohort. Only the production Hourly cleanup hook was enabled.

The fixture contained 106 expired recovery envelopes (including a completed action) and one unexpired envelope. The native site scheduler and real worker ran the production cleanup method: the first run removed exactly its default 100-row batch. After the worker was stopped and its terminal state observed, the scheduler queued outstanding cleanup. A new worker processed the remaining six expired copies. A repeated scheduled scan preserved all tombstones and the future copy.

Whole-row hashes and counts for applications, person profiles, command receipts, command audit and capacity matched their pre-cleanup values throughout. Candidate mode remained disabled. Native Scheduled Job Logs confirmed completion without failed cleanup jobs. Shared review queue membership was unchanged. [Retirement verification](evidence/candidate-cleanup-retirement-a47fbec54950.json) confirmed disabled test accounts, zero fixture ledgers, paused scheduler, no live rehearsal worker and no sent external email. The dedicated sandbox services were returned to their original stopped state.

The clock and cleanup implementation were not mocked. Fixture deadlines were aged and the Hourly job's last-execution timestamp was made due for each pass; this is not an hour-long cadence observation. The worker outage was graceful: no process crash, database outage or infrastructure disaster was injected. Existing shared development workers were never started or their backlog drained.

## Next and retained gates

Activate a clearly labelled synthetic candidate review cohort with usable examples, personal-role access and a reversible operating procedure. Validate that subsequent tests preserve that review configuration. Then continue S5 full profiles, ownership/follow-up/rejection/activity, recruiter handoff, private files, sourcing, consent and imports.

Recovery lifetime/key custody, backup/log retention and operational backlog alerts still need HR/IT policy and deployment ownership. All 98 requirements, S6–S12, independent security assessment, sustained 1,000+ account capacity, real-role HR UAT and production release gates remain open where unfulfilled. Odoo and other departments remain outside this HR increment.
