# قنديل — HR sprint plan

Updated: 12 October 2026 · Africa/Cairo

Deliver a reproducible, bilingual local Frappe HR release for P0–P3, with the selected 40 requirements verified against 80 baseline cases and targeted regression tests.

P0 baseline + P1 security + P2 organization + P3 requests and vacancies. Full HR parity (P4–P10), company platform, Odoo integrations and production are separate milestones.

Implementation is active. Source work overlaps safely across four lanes; database migrations and shared-site suites remain serial. A passed focused suite does not automatically pass the 80 broader acceptance cases.

## Current evidence

- 98 total requirements; 40 in this delivery; all 80 selected cases assessed individually. Passing focused tests does not automatically pass a complete case.
- Fresh pinned ARM64 sandbox and synthetic restore passed: database IDs, private files, encrypted field and migration. A final tagged release remains pending.
- Latest affected suites and independent races passed; detailed results are in CHECKPOINT.md. Baseline: 28 passed, 42 partial, 10 blocked; HR acceptance pending.
- Native manager/HR approvals, bulk vacancy assignment, opening action and AR/EN document downloads passed in the browser. Initial Arabic/English desktop/mobile rendering and scoped access checks also passed.
- HTTP approval replay and capacity races passed; eight-worker notification enqueue/delivery/rollback proof passed.
- Tested development source `d3e2c66100926cfa8ad8f886e6a3debf5a4c0865` is pushed to the private custom repository. A production or final tagged release is not claimed.
- See tracker task evidence and the strict acceptance mapping for current limits. HR policy decisions and human acceptance remain explicit gates.

## Sprint sequence

### S0 — Reproducible project / تجهيز المشروع وتثبيت المتطلبات

A new machine can install the same pinned HR stack, and everyone can see the exact scope.

Parallel: Lead: packaging. Security: interfaces. Organization: mapping. QA: baseline and cases.

Exit gate: Version lock + install/restore instructions + synthetic-site plan + requirement ownership reviewed; clean bootstrap proof required before setup is Done.

### S1 — Secure organization foundation / الصلاحيات والهيكل التنظيمي

Position data and scoped authority are consistent, with safe write commands.

Parallel: Security and organization build independently against agreed scope/route contracts; lead fixes commands; QA prepares fixtures.

Exit gate: Real accounts cannot cross company/branch boundaries; duplicate commands are safe; hierarchy, assignments and capacity constraints pass native tests.

### S2 — Complete hiring workflows / طلبات التوظيف والاعتمادات والشواغر

A request moves from draft through the correct approvals into an accurately tracked vacancy.

Parallel: Lead: request state machine. Security: identity/account controls. Organization: structural approval and capacity. QA: bilingual/native UI.

Exit gate: Returns, amendments, delegations, CEO/board routes, capacity, priority and recruiter queues work under normal and negative cases.

### S3 — Integration and bilingual proof / الاختبار المتكامل والعربية والإنجليزية

The selected 40 requirements have dated evidence for all 80 baseline acceptance cases plus targeted regression cases.

Parallel: Security: adversarial tests. Organization: import/history tests. Lead: serial integration/concurrency. QA: EN/AR browser tests after fixture stability.

Exit gate: No unresolved critical authorization or headcount defect; concurrent operations reconcile; EN/AR native UI, files, exports and notifications pass; unresolved provider/policy cases stay blocked.

### S4 — Reviewable release and handover / نسخة للمراجعة والتسليم

A tagged, reproducible local release, testing walkthrough and HR decision record.

Parallel: Lead: release. Security: review. Organization: operator guide. QA: evidence pack and HR walkthrough.

Exit gate: Independent source review, restore rehearsal, secret scan, tested commit pushed, evidence tied to commit, and HR UAT decision recorded. This is not production go-live.

## Task tracker

Status vocabulary: verified = task-specific evidence; in_progress = active and incomplete; draft = source written but incomplete/unaccepted; planned = work queued; needs_decision = owner choice outstanding. Task counts are not project effort percentages.

| ID | Sprint / owner | Task | Status | Dependencies |
|---|---|---|---|---|
| T01 | S0 / QA | Freeze and validate requirements | verified | — |
| T02 | S0 / Lead | Record repositories and upstream boundaries | verified | — |
| T03 | S0 / Lead | Package pinned installation and recovery | in_progress | T02 |
| T04 | S0 / QA | Resolve policy and contract decisions | needs_decision | T01 |
| T05 | S0 / Lead | Prepare isolated integration site and seed | verified | T03 |
| T06 | S1 / Security | Enforce scoped write and read access | in_progress | T01, T02 |
| T07 | S1 / Lead | Make commands replay-safe and versioned | verified | T06 |
| T08 | S1 / Organization | Complete position/hierarchy/assignment model | in_progress | T01, T02 |
| T09 | S1 / Organization | Reconcile position capacity and imports | in_progress | T08, T06 |
| T10 | S1 / Security | Protect sensitive records and audit trail | in_progress | T06 |
| T11 | S1 / Security | Deliver reliable local notifications and clock | in_progress | T06 |
| T12 | S1 / Organization | Complete JD revisions and outputs | in_progress | T08, T10 |
| T13 | S2 / Lead | Complete request form and approval routing | in_progress | T07, T08, T09 |
| T14 | S2 / Lead | Returns, amendments and reviewed snapshots | in_progress | T13 |
| T15 | S2 / Organization | Structural approval and delegated authority | in_progress | T08, T06 |
| T16 | S2 / Lead | Close headcount and vacancy lifecycle gaps | in_progress | T14, T09 |
| T17 | S2 / Lead | Recruiter team, priority and queue | in_progress | T13, T06 |
| T18 | S2 / Security | Native identity, MFA and account controls | planned | T04, T06 |
| T19 | S2 / QA | Bilingual native workspace and timelines | in_progress | T13, T14, T11 |
| T20 | S2 / Security | SLA reminders and escalation | in_progress | T11, T13 |
| T21 | S2 / QA | Verify no payroll actions | in_progress | T13, T18 |
| T22 | S3 / Lead | Integrate schemas and migrate serially | in_progress | T05, T07, T08, T10, T12, T14, T15, T16, T17, T18, T19, T20, T21 |
| T23 | S3 / Security | Native authorization and identity tests | in_progress | T22 |
| T24 | S3 / Organization | Native organization and import tests | in_progress | T22 |
| T25 | S3 / Lead | Concurrency, rollback and ledger tests | in_progress | T22 |
| T26 | S3 / QA | Arabic/English browser and mobile tests | in_progress | T22 |
| T27 | S3 / Lead | Acceptance matrix and regression gate | in_progress | T23, T24, T25, T26 |
| T28 | S4 / Lead | Fresh install and restore rehearsal | in_progress | T27, T03 |
| T29 | S4 / Security | Independent review and secret scan | in_progress | T27 |
| T30 | S4 / Lead | Publish tested commit and release notes | in_progress | T28, T29 |
| T31 | S4 / QA | HR walkthrough and decision | planned | T30, T04 |

## Parallel execution rules

- Four concurrent slots: Lead/integration, Security, Organization, QA/bilingual. Owners may change at sprint boundaries; no two agents edit the same file concurrently.
- Freeze scope, route, command receipt and capacity contracts first. Independent source work can overlap sprints, but acceptance gates remain ordered.
- Only Lead edits shared hooks/setup/schema integration, runs migrations, manages fixtures and creates release commits. Other workstreams return patches or file-scoped changes.
- Use separate disposable sites for independent database suites when feasible. Tests sharing a database run serially, especially capacity races and fixture changes.
- Baseline and translation work may run throughout. Browser acceptance starts after schema and fixtures are stable; security review is independent of implementation.
- No unattended background work or recurring refresh is configured. Tracker changes when source/evidence are updated; user review marks are separate browser-local notes.

## Decisions

- **PD-02/12 — HR + Ibrahim:** Approve independent authority, personal-interest/CEO escalation and rerouting rules. Blocks: Authority acceptance in T13/T15; source work may continue with explicit fail-closed defaults.
- **PD-03 — HR:** Define WARN versus BLOCK and who can approve excess headcount. Blocks: T16 acceptance; never silently approve extra seats.
- **PD-08 — HR/IT + Ibrahim:** Select native account/MFA/CEO recovery policy and any external identity provider. Blocks: T18 identity acceptance and provider-specific tests.
- **PD-09 — IT/security owner:** Choose audit key custody, external seal location, retention and operator. Blocks: Cryptographic AUD-001 parity; local immutable events can be tested separately.
- **PD-13 — HR + Ibrahim:** Review Arabic terminology and bilingual business-content requirements before final native UI acceptance.
- **PD-11 — HR:** Confirm employee-to-position mapping and baseline occupied seats. Blocks: Real migration; synthetic mapping tests can proceed.
- **PD-05 — HR:** Confirm workweek/holidays and automatic-expiry outcome. Blocks: Automatic rejection remains disabled until tested and approved.

## Acceptance and updating

Statuses distinguish passed, partial, blocked, failed and not_run; every status must identify its evidence and limits. All 80 baseline case IDs are preserved in `acceptance-results.json`. Update only after an actual run, with status, evidence path, tested commit and timestamp. Add supplementary cases without replacing the baseline. `tracker.json` owns task status; browser checkboxes only mark your review and never turn tests green.

Run `python3 docs/sprints/render_tracker.py` after changing tracker/evidence. It checks references and rebuilds the local HTML; the dashboard does not monitor GitHub or the database automatically.

The planning goal is separate from the implementation release goal: completing this plan does not complete P0–P3. HR acceptance, provider integration and production readiness remain distinct.

## Tracker verification

18 browser checks passed for the tracker, including filters, notes, review export, dependency navigation, artifact links and mobile width. No JavaScript errors were observed. These checks are not HR application acceptance. Evidence: `evidence/tracker-browser-check.json`.

## Later scope

- P4 — Candidates, sourcing and private journey
- P5 — Interviews and selection
- P6 — Compensation and offers
- P7 — Joining and onboarding
- P8 — Probation, transfers and exit
- P9 — Reports and assisted CV review
- P10 — Full integration and production readiness
