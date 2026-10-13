# قنديل · Kandil HR

Custom Frappe HR extension for Kandil's HR department. Odoo and the broader company platform remain separate. This repository contains Kandil's application source, schemas, native Frappe screens, tests and deployment package. The official Frappe, ERPNext and HRMS sources are installed as separate pinned dependencies, without modifying their core code.

**Current status: Sprint 3 is in progress.** The AR/EN portal includes organization browsing, HR + CEO structural/individual assignment changes, JD authoring, PDF/local delivery, scoped history and reporting-tree navigation. Full hiring forms, route previews, HR request operations, dated delegation and CEO decisions are connected. Board decision/evidence work is recorded in the [Board checkpoint](docs/roadmap/S3_BOARD_CHECKPOINT.md). Full request history and subsequent recruitment/lifecycle workflows remain in progress. The local site uses synthetic data; HR acceptance, live email, independent security, sustained capacity, hosting and production rollout remain separate gates. See the [sprint plan](docs/roadmap/SPRINT_PLAN.md) and [tracker](docs/roadmap/tracker.json).

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
