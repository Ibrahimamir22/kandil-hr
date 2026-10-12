# Remaining gates and decision owners — Sprint 1 reconciliation

Prepared 12 October 2026. This reconciles open cases and assigns the type of owner needed; no named person or HR/IT approval is implied. The frozen expected definitions in `docs/phases_0_3/requirements-baseline.json` remain unchanged. All 98 reference IDs remain in `reference-coverage.csv`.

## Open cases in the 80-case register

| Case | Status and remaining proof | Delivery location / accountable role |
|---|---|---|
| AT-ACC-001-02 | Blocked: device-alert deduplication, agreed idle expiry and enrolled MFA have no complete evidence. | S11 security; Kandil IT chooses identity/session policy, developer implements and tests. |
| AT-ACC-002-01 | Blocked: external subject→Frappe identity adapter and conflicting mapping absent. | S11; Kandil IT names provider/tenant and account owner. |
| AT-ACC-002-02 | Blocked: provider-failure exercise absent; native accounts do not prove it. | S11; developer tests chosen integration, IT accepts recovery process without privileged fallback. |
| AT-ORG-005-02 | Partial: current approval delegation isolation/revocation passes; complete probation/transfer lifecycle remains absent. | S9 lifecycle; HR confirms process authority, developer implements exact positive/negative workflows. |
| AT-AUD-001-02 | Blocked: external protected audit anchor/key custody and altered/reordered/truncated-history proof absent. | S11 security; IT/security owns separate custody, developer implements verifier. Local immutable records do not substitute. |
| AT-AUD-002-01 | Partial: implemented overrides have checks, but all-endpoint/configuration/operational exception coverage is incomplete. | Each implementation sprint expands override matrix; S11 final security review. HR owns exception policy. |
| AT-AUD-002-02 | Partial: ordinary save cannot fabricate decisions; privileged operational logging and independent review are incomplete. | S11; IT/security owns administrator access/review, developer adds technical evidence. |
| AT-WAG-001-01 | Partial: current jobs preserve payroll fixtures; overdue-document job not yet implemented/tested. | S8 document/joining workflow and S11 regression. HR confirms document policy; wage mutations remain excluded. |

Deferral to a later planned sprint preserves the requirement; it does not convert a partial or blocked case to passed. Sprint 1 closes only its stabilization scope, not these later implementation/acceptance gates.

## Decisions to record before real staff use

| Decision | Current development behavior / unknown | Owner and required evidence |
|---|---|---|
| Headcount policy | Configurable WARN/BLOCK; synthetic tests exercise both. | HR approves per-company rule, exception authority and effective date. |
| Approval authority | Frozen route per revision; current role/scope checks, independent decisions and audited delegation. | HR signs actual manager/sector/HR/CEO/Board table, self-interest routing and rerouting policy. |
| Terminology / AR/EN | Labels tested on selected screens; translated content is not HR sign-off. | HR reviews screen glossary, titles, letters and bilingual document templates. |
| Waiting calendars | Cairo clock; development reminder milestones; automatic rejection disabled. | HR confirms workdays/holidays, escalation recipients, expiry and exception behavior. |
| Identity / MFA | Local personal password sessions; production provider unknown. | IT selects provider or an explicitly approved alternative, MFA enrollment, idle/absolute expiry, recovery and joiner/leaver ownership. |
| Audit custody | Application controls exist; no independent external anchor. | IT/security designates protected signing/anchor storage and reviewer, with tampering/recovery exercises. |
| Hosting / restore | Local loopback development only. | IT approves hosting, TLS, patch ownership, backup location/retention, measured RPO/RTO and monitored restore drill. |
| Migration | Synthetic fixtures only. | HR supplies reviewed data mapping and reconciliation totals; IT controls export/import access. |
| Capacity | 1,000+ intended accounts. Concurrent users, daily actions, attachment volumes and burst patterns unknown. | HR/IT supply expected usage; developer measures target workload and publishes latency/error/resource evidence. |

## Proposed capacity scenarios — not accepted requirements or results

Plan a seeded dataset of at least 1,500 synthetic accounts. Measure typical and peak read/write mixes separately at 25, 100 and 250 concurrent sessions, then test agreed peak bursts and a sustained soak. Cover login, scoped lists/search, approvals, request creation and attachments, with representative history rather than empty tables. Final concurrency and service targets require Kandil's usage/operating expectations and chosen infrastructure.

Report p50/p95/p99 response time, error rate, deadlock/retry rate, throughput, queue lag and CPU/memory/database utilization. Check ledger/audit correctness after load. Existing 20-request correctness races do not certify these scenarios. Capacity results must name hardware, dataset size, application/dependency versions and duration.

No external subscription, provider connection or real-data rollout is authorized by this decision register alone.

## Local queue finding — 13 October 2026

The shared development queue reached its configured 650-job limit during synthetic User contact setup/retirement. Matching test-account contact jobs now run inline under a guarded CLI fixture context; this preserves production hooks and does not clear queues or start workers. The existing backlog still needs a scoped inventory/drain and worker-ownership plan before queue-dependent notification/capacity proof. Owner: developer for isolated test operations, IT for production workers/monitoring. This is not evidence that production queue sizing or recovery has passed. See [history checkpoint](S2_HISTORY_CHECKPOINT.md) for failed attempts and cleanup/rollback evidence.
