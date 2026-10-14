# قنديل · Kandil HR

The [candidate ownership and follow-up checkpoint](docs/roadmap/S5_CANDIDATE_WORK_CHECKPOINT.md) adds individual recruiter handoffs, separately owned dated actions, change history and lost-response recovery in AR/EN. **52 distinct native checks, a 20-check affected rerun, 26 final work-browser checks and 42 recovery regression checks passed.** Full S5 and release acceptance remain open. Test through **http://kandil-review.localhost:8112/hr-portal**; see the [walkthrough](docs/portal/PERSISTENT_REVIEW.md).

The [persistent review checkpoint](docs/roadmap/S5_PERSISTENT_REVIEW_CHECKPOINT.md) enables candidate review at **http://kandil-review.localhost:8112/hr-portal** with stable synthetic examples, a dedicated database/Redis and the existing personal login. **22 review checks and 63 independent candidate regression checks passed**; test cleanup preserved the review records, settings and session. Background workers/scheduler remain stopped here. Full S5 and release gates remain open.

Earlier checkpoints below retain their original scope and outstanding work at the time; the current status above supersedes their recovery next-step notes.

The [reviewed migration checkpoint](docs/roadmap/S5_MIGRATION_APPLY_CHECKPOINT.md) adds HR-confirmed legacy identity links, stale-preview rejection, transactional preservation checks and exact-command retries in AR/EN. **48 native and 63 browser checks passed**, including simultaneous first writes. Ordinary candidate mode stays disabled pending recovery across navigation/reloads; full S5 and production gates remain open.

The [S5 search and migration-preview checkpoint](docs/roadmap/S5_SEARCH_MIGRATION_PREVIEW_CHECKPOINT.md) adds search/duplicate review against corrected person details, preserves historical application search, and provides a read-only HR legacy-record review in AR/EN. **46 native and 46 browser checks passed.** Applying migration links, recovery across navigation and ordinary intake activation remain pending; full S5 and release gates stay open.

The [S5 profile correction checkpoint](docs/roadmap/S5_PROFILE_CORRECTIONS_CHECKPOINT.md) adds reasoned AR/EN basic-profile corrections, before/after review and permission-filtered revision history while preserving application snapshots. **74 native checks passed**, with 24 affected checks rerun after final link validation, plus **37 browser checks** covering intake, corrections, retries, competing edits and revocation. Full S5 remains open; ordinary intake/correction activation remains disabled pending migration and recovery work.

The [S5 candidate workspace checkpoint](docs/roadmap/S5_CANDIDATE_WORKSPACE_CHECKPOINT.md) adds scoped AR/EN candidate lists, basic person/application details and reviewed recruiter intake. **35 native and 25 candidate browser checks passed**, including lost-response retry, concurrent creation and access revocation. This is partial S5 delivery: full profiles/history, migration, ownership actions, private files, consent and sourcing remain open. Intake was tested under a temporary synthetic-site lease and remains disabled for ordinary review traffic.

The [team notification checkpoint](docs/roadmap/S4_TEAM_NOTIFICATIONS_CHECKPOINT.md) passed **60 native and 37 browser checks**, with inspected English desktop and Arabic mobile captures. Assignment notices exclude the actor, include lead/support changes and consolidate bulk updates into one summary per recipient. S4 business acceptance and recruiter-wide MOVE_ALL remain open. The [S5 implementation contract](docs/roadmap/S5_IMPLEMENTATION_BRIEF.md) defines the next candidate/person, application, sourcing and privacy work; that contract is planning, not a completed candidate workspace.

The [vacancy filter checkpoint](docs/roadmap/S4_FILTER_SELECTORS_CHECKPOINT.md) replaces exact-name company/department/location fields with scoped searchable selectors. **31 native and 65 browser checks passed**, including AR/EN, dependent resets, stale responses and lookup retry. S4 HR acceptance and shared ownership workflows remain open; full candidate work follows in S5.

The [scheduled invitation catch-up checkpoint](docs/roadmap/S4_INVITATION_CATCHUP_CHECKPOINT.md) adds **10 passed real scheduler/worker checks** for missed event jobs, later delegates and duplicate suppression in a separate sandbox. The [eight-ID reconciliation](docs/roadmap/S4_REQUIREMENT_RECONCILIATION.md) tracks the selector evidence and remaining HR acceptance and candidate-workspace gaps. **S4 remains in progress.**

The [event-triggered invitation checkpoint](docs/roadmap/S4_INVITATIONS_CHECKPOINT.md) verifies post-commit request/delegation jobs, current-authority recipients and bilingual inbox actions with 86 native and 23 HTTP/RQ/browser checks. Generation is event-triggered; delivery follows the outbox worker schedule. Periodic catch-up now has separate evidence; complete S4 acceptance remains open.

The [bilingual event-template checkpoint](docs/roadmap/S4_EVENT_TEMPLATES_CHECKPOINT.md) verifies ordinary request/completion messages, readable skipped-route HR notices and minimal vacancy/application assignments with 56 native and 26 browser checks. Event-triggered invitations now have separate evidence; complete S4 event policy and HR wording acceptance remain open.

The [current-authority reminder checkpoint](docs/roadmap/S4_REMINDER_RECIPIENTS_CHECKPOINT.md) verifies effective delegates, frozen Board Vice, revocation checks, fixed AR/EN milestone payloads and duplicate prevention across authority changes with 63 native and 20 browser checks. The [event matrix](docs/roadmap/S4_NOTIFICATION_MATRIX.md) tracks delivered ordinary templates/invitations and the remaining acceptance gaps. S4 is still in progress.

The [deadline/calendar checkpoint](docs/roadmap/S4_DEADLINES_CHECKPOINT.md) adds permission-checked Arabic/English approval dates and calendar-aware queued reminders. Holiday deferrals do not consume attempts, corrected calendars can wake due notices, and obsolete milestones are suppressed. Expiry remains advisory; S4 recipient/templates and HR acceptance remain open.

The [native scheduler checkpoint](docs/roadmap/S4_SCHEDULER_CHECKPOINT.md) verifies automatic reminders, due retries, disabled-recruiter fallback and worker-restart redrive with 15 integration checks and 35 focused native cases. The newer deadline checkpoint covers the date panel and queued calendar behavior; complete delivery policy/templates remain open.

The [worker recovery checkpoint](docs/roadmap/S4_WORKER_RECOVERY_CHECKPOINT.md) verifies real isolated RQ process crashes before/after commit, bounded retries, reasoned operator recovery and revoked-recipient suppression with 35 checks. Scheduled retry/redrive and disabled-recruiter fallback are now covered by the newer scheduler checkpoint; complete templates and candidate-facing ownership acceptance remain open.

Custom Frappe HR extension for Kandil's HR department. Odoo and the broader company platform remain separate. This repository contains Kandil's application source, schemas, native Frappe screens, tests and deployment package. The official Frappe, ERPNext and HRMS sources are installed as separate pinned dependencies, without modifying their core code.

The [requester-event and reminder checkpoint](docs/roadmap/S4_NOTIFICATION_EVENTS_CHECKPOINT.md) adds minimal AR/EN amendment/route-skip updates, scoped original-baseline access for submitted amendment reviewers, stale approval-step reminder suppression and event-time inbox ordering. Native scheduled execution now has separate evidence; final event/recipient policy remains open.

**Current engineering focus: Sprint 5 — candidates and sourcing.** The AR/EN portal includes organization, HR + CEO structural/individual assignment approvals, job descriptions, hiring forms, routing, HR actions, delegation, Board decisions and review history.

[S3 engineering verification](docs/roadmap/S3_ENGINEERING_REVIEW.md) passed 215 native checks, 350 browser checks and three concurrent HTTP scenarios. S3 remains open for HR policy/UAT acceptance. The [17-ID results](docs/roadmap/S3_REQUIREMENT_RESULTS.json) distinguish engineering evidence from business and release acceptance.

The [dedicated vacancy queue](docs/roadmap/S4_VACANCY_QUEUE_CHECKPOINT.md) provides scoped search, exact totals/pages, filters, quantities and priority explanations. The [team-assignment increment](docs/roadmap/S4_TEAM_ASSIGNMENT_CHECKPOINT.md) adds paginated recruiter lookup, complete-team editing and reviewed bulk assignment in AR/EN, using the same transactional commands and current permission checks. The [lifecycle checkpoint](docs/roadmap/S4_VACANCY_LIFECYCLE_CHECKPOINT.md) adds reviewed open/hold/freeze/restore/close/cancel and temporary priority pins, protecting unresolved commitments and occupied positions. The [dashboard checkpoint](docs/roadmap/S4_DASHBOARD_CHECKPOINT.md) adds exact scoped totals and paginated approvals, including delegation and Board actions, with current-permission and delayed-response tests. The [notification inbox checkpoint](docs/roadmap/S4_NOTIFICATION_INBOX_CHECKPOINT.md) adds AR/EN delivered messages, unread totals and current-reference privacy in both the portal and native notification reads. S4 is still in progress: HR acceptance and shared S5 ownership/workload-transfer clauses remain. See the [sprint plan](docs/roadmap/SPRINT_PLAN.md) and [tracker](docs/roadmap/tracker.json) for the unchanged 98 requirements.

The local site uses synthetic data. HR acceptance, live email, independent security review, sustained 1,000+ account capacity/recovery testing, hosting and production rollout remain separate gates.

The [current Sprint 1 checkpoint](docs/roadmap/S1_CHECKPOINT.md) records **72 passed, 4 partial and 4 blocked** baseline cases, with source identity, new portal evidence and remaining gates.

The [Sprint 2 organization checkpoint](docs/roadmap/S2_CHECKPOINT.md) records browsing and document links; the [structural-change checkpoint](docs/roadmap/S2_STRUCTURE_CHECKPOINT.md) records reviewed proposals and independent decisions. The [import checkpoint](docs/roadmap/S2_IMPORT_CHECKPOINT.md) records CSV validation, independent review, application and occupancy comparison. The [individual assignment checkpoint](docs/roadmap/S2_ASSIGNMENT_CHECKPOINT.md) records the user-selected HR + CEO route for assigning, ending and transferring employees. The [JD portal checkpoint](docs/roadmap/S2_JD_CHECKPOINT.md) records authoring, independent revision approval, KPIs and bilingual document views. The [document delivery checkpoint](docs/roadmap/S2_DOCUMENT_CHECKPOINT.md) records actual PDF downloads, local-only email copies and eight-page visual review. The [history checkpoint](docs/roadmap/S2_HISTORY_CHECKPOINT.md) records revision comparisons and permission-checked structural/assignment event differences.

## Start here

- [Plain-language architecture and folder map](docs/START_HERE.md).
- [Current delivery plan: 13 sprints and 69 tasks](docs/roadmap/SPRINT_PLAN.md).
- [Live task tracker](docs/roadmap/tracker.json) and [all 98 reference requirements](docs/roadmap/reference-coverage.csv).
- [Frappe, ERPNext and HRMS source links](upstream/README.md): exact pinned Git submodules, visible on GitHub.

The active delivery goal uses `docs/roadmap/`. Earlier `docs/sprints/` checkpoints remain historical technical evidence and do not describe the whole new portal goal.

## Project source and current portal

All project source is kept in this private repository. The connected portal lives in [`frontend/portal/`](frontend/portal/), its Frappe API in [`kandil_hr/portal/`](kandil_hr/portal/) and its served assets in [`kandil_hr/public/portal/`](kandil_hr/public/portal/). Open http://localhost:8102/hr-portal on the existing development machine.

- [Current portal progress](docs/portal/PROGRESS.md) and [testing walkthrough](docs/portal/README.md).
- [Source-control checkpoint, limits and next steps](docs/SOURCE_CONTROL.md).
- [Historical research, proposals, designs, prototypes and development harness](docs/archive/README.md).
- [Pinned clean installation](deployment/README.md).

The portal milestone has 10 native, 31 HTTP and 24 browser checks recorded in `docs/portal/evidence/`. The pending-quantity portal increment now has separate native/HTTP/AR/EN evidence in the current Sprint 1 checkpoint; the selected stabilization gates have passed; full HR and release gates remain open. The older 80-case baseline is a separate acceptance scope; do not add its totals to the portal results or treat this checkpoint as a production release.

## Running locally

Follow [deployment instructions](deployment/README.md). The included ARM64 Docker package installs the exact upstream commits and image digests in [versions.lock.json](deployment/versions.lock.json). A fresh sandbox was booted and its login checked at port 8110; a synthetic restore rehearsal also passed (database IDs, private files and an encrypted field). A final tagged release and production recovery plan remain separate gates.

Existing development workspace:

| Address | Purpose |
|---|---|
| localhost:8100 | Existing main site; not migrated by this phase |
| localhost:8101 | Preserved earlier synthetic recruitment pilot |
| localhost:8102 | New P0–P3 synthetic parity review site |
| localhost:8110 | Separate fresh-install sandbox |

These addresses are local to the development machine. No cloud deployment, public tunnel, outbound email or external integration is configured. Secrets, site configuration, uploads and databases are excluded from Git.

The parity site opts in with `kandil_pilot_enabled`, `kandil_foundation_enabled` and `kandil_parity_enabled`. Other sites do not acquire the new business rules merely because the custom app source is shared. Disabling flags is not a database/schema rollback.

## Implemented development modules

- **Foundation:** dated company/department/branch grants, sensitive-data gates, immutable security events, selected exact command-audit envelopes, local transactional notifications, Cairo business calendar, protected HR files and candidate-team boundaries.
- **Organization:** stable positions, effective-dated hierarchy and assignments, reviewed imports, independent structural approval, capacity checks, immutable JD revisions, Arabic/English outputs and private local mail capture with current scope/print checks.
- **Recruitment:** multi-location requests, versioned approvals, returns and revisions, quantity amendments, capacity reservations, vacancy lifecycle, recruiter teams, scored queue and atomic bulk assignment.
- **Reliability:** command receipts, current locking reads for concurrent replay, transactional rollback and bounded whole-transaction deadlock retries. No external side effects occur inside those transactions.
- **Native UI:** Frappe forms, lists, documents and custom Vacancy Queue page; Arabic translations and RTL rendering. Business commands authorize on the server regardless of visible buttons.

## Verification

Evidence is stored in [docs/sprints/evidence](docs/sprints/evidence), with source fingerprints, exact scope and known limitations. Tests use ordinary synthetic role accounts; database suites sharing a site run serially. HTTP concurrency uses a separate synthetic company and keeps cancelled audit history after cleanup.

Inside the configured Bench container, examples include:

```sh
bench --site kandil-parity.localhost execute kandil_hr.foundation.tests_runner.run
bench --site kandil-parity.localhost execute kandil_hr.recruitment.test_commands.run
bench --site kandil-parity.localhost execute kandil_hr.organization.integration_tests.run
```

Plain unittest classes were omitted by the standard Frappe test discovery in this environment. Use the explicit runners and verify nonzero test counts. Host browser and concurrency scripts are under `docs/sprints`; they require local Chrome/Playwright or Python respectively and private synthetic fixture files. Never run fixture scripts on a business site.

## Remaining release gates

- Complete the 40-requirement/80-case evidence mapping and remaining implementation gaps.
- Identity/MFA/provider and privileged-change policy; HR acceptance of the implemented CEO delegation and separate Board authority workflow.
- HR decisions on exception rules, working calendars, expiry, real employee-position mapping and Arabic terminology.
- External audit anchor/key custody; application immutability alone is not cryptographic tamper proof.
- Remaining audit adapters, hiring-request mail capture and lifecycle gaps listed in the tracker. Document capture does not establish external delivery.
- Final source review, affected regression checks, tagged checkpoint and HR walkthrough. Read-only legacy-site smoke and a synthetic restore rehearsal have passed.

Automatic rejection stays disabled. CEO delegation requires explicit approval by the configured CEO; Board decisions use the separate frozen Chair/Vice and documented external-decision path. HR policy acceptance remains pending. Unaudited native HR Script/Query/prepared reports are restricted on the parity site because raw SQL/get_all can bypass row-scope hooks; scoped native lists remain available.

No payroll, Odoo, BioTime, Google Sheets or AI provider integration is claimed by this work. The [historical pilot description](docs/PILOT_HISTORY_2026-10-11.md) explains the earlier site's deliberately narrower behavior.
