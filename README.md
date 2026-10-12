# قنديل · Kandil HR

Custom Frappe HR extension for Kandil's HR department. Odoo and the broader company platform remain separate. This repository contains Kandil's application source, schemas, native Frappe screens, tests and deployment package. The official Frappe, ERPNext and HRMS sources are installed as separate pinned dependencies, without modifying their core code.

**Current status: P0–P3 implementation and verification in progress.** The local parity site is a synthetic development environment, not a production release or HR acceptance. See [sprint plan](docs/sprints/SPRINT_PLAN.md), [task tracker](docs/sprints/tracker.json) and [acceptance cases](docs/sprints/acceptance-results.json). Focused passing suites do not imply all 80 acceptance cases passed.

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

- **Foundation:** dated company/department/branch grants, sensitive-data gates, immutable security events, local transactional notifications, Cairo business calendar, protected HR files and candidate-team boundaries.
- **Organization:** stable positions, effective-dated hierarchy and assignments, reviewed imports, independent structural approval, capacity checks, immutable JD revisions and Arabic/English JD/worker-card outputs.
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
- Identity/MFA/provider and privileged-change policy; approved CEO/Board delegation workflow.
- HR decisions on exception rules, working calendars, expiry, real employee-position mapping and Arabic terminology.
- External audit anchor/key custody; application immutability alone is not cryptographic tamper proof.
- Full JD review/distribution, selected amendment/joining-correction and ownership lifecycle gaps listed in the tracker.
- Final source review, affected regression checks, tagged checkpoint and HR walkthrough. Read-only legacy-site smoke and a synthetic restore rehearsal have passed.

Automatic rejection stays disabled. CEO/Board delegation is blocked until its separate authority workflow is implemented and approved. Unaudited native HR Script/Query/prepared reports are restricted on the parity site because raw SQL/get_all can bypass row-scope hooks; scoped native lists remain available.

No payroll, Odoo, BioTime, Google Sheets or AI provider integration is claimed by this work. The [historical pilot description](docs/PILOT_HISTORY_2026-10-11.md) explains the earlier site's deliberately narrower behavior.
