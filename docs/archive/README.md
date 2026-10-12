# Historical project archive

This folder preserves the HR research, comparisons, proposals, implementation plans, design prototypes, original development harness and HR concept reference that previously lived outside the application repository. The manifest lists every captured file and its original relative location and SHA-256.

**These are dated snapshots, not current implementation or release claims.** Some reports contain older local paths, older case totals, superseded plans and historical statements that code was not yet published. Start with the repository README, `docs/portal/PROGRESS.md` and `docs/SOURCE_CONTROL.md` for current status.

- `05_Deliverables/`: research, comparisons, strategy, sprint plans, fit/testing reports and design assets.
- `06_Prototypes/Kandil_HR_Portal_Prototype_2026-10-12/`: approved static prototype and its QA evidence.
- `06_Prototypes/Recruitment_Portal_Google_Demo_2026-10-11/`: historical private Google Apps Script demo source and deployment metadata; no login credentials or local clasp authentication.
- `06_Prototypes/Kandil_HR_Dev/`: original development orchestration, scripts and pinned reference source. Runtime databases, sites and installed dependencies are excluded.

Do not bootstrap the historical harness over an existing environment: its scaffolding represents the earlier pilot. Use `deployment/README.md` at repository root for the pinned installer, and `docs/portal/README.md` for the current connected portal. Snapshotting the harness does not validate running it at this archive location.

Frappe, ERPNext and HRMS remain unmodified upstream dependencies pinned by exact commits in `deployment/versions.lock.json`; copying their entire repositories into the app would not improve source provenance. The HR concept reference is retained at its recorded revision and remains requirements evidence, not the active implementation.

The expanded sources and assets are retained instead of duplicate ZIP bundles. Private credentials, HR uploads, site configuration and databases require secure storage outside Git. An archive is not a database backup or a production release.
