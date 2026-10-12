# Repository publication checkpoint — 12 October 2026

Repository: https://github.com/Ibrahimamir22/kandil-hr (private, main).

This checkpoint captures the current project so work is recoverable from GitHub. It is a development checkpoint, not a production release. The previous published source was `dd3b7598da0e198037322e9c3a479e9b649b1197`; use the Git history/remote branch for the new publication SHA.

## Included

- Current Kandil HR custom Frappe application, schemas, native UI and backend workflows.
- Connected Arabic/English React + TypeScript portal, package lock, fonts/licenses, served assets, portal API and website shell.
- Native, HTTP and browser tests, sanitized evidence and screenshots. The recorded connected milestone passed 10 native + 31 HTTP + 24 browser checks.
- Existing additional headcount/denial/pending-revision implementation and tests. Full pending-revision acceptance is still incomplete; retaining it in Git does not declare it complete.
- Pinned deployment package and installation documentation.
- Historical research, comparisons, proposals, architectural/design reports, sprint plans, prototype code, QA, original development scripts and HR concept source under `docs/archive/`. Its manifest records original locations and hashes.

## Deliberate exclusions

Credentials, site configuration/encryption keys, private uploads, local databases/backups, session state, node_modules, virtual environments, Git internals and duplicate ZIP exports are excluded. Expanded ZIP sources/assets are retained. Local .clasp.json files and authentication state are excluded. GitHub source control is not a secure HR data backup service.

Frappe, ERPNext and HRMS are unmodified separate upstream repositories. Their exact commits and image digests are in `deployment/versions.lock.json`; the installer fetches those dependencies. Their source is not duplicated into this application repo. The three local clones matched the pins and were clean at publication preparation.

## Evidence boundaries

Original JSON test manifests retain their test-time hashes, previous HEAD and `local_only` state. They are historical evidence, not current publication flags. Reports in the archive can contain superseded architecture, case counts and local file paths. The current connected scope is in `portal/PROGRESS.md`; the frozen original baseline remains separately recorded in `sprints/CHECKPOINT.md`.

Publication checks include source/secret review, Git whitespace checks, portal TypeScript checking, native-form callback checks and a GitHub remote-commit verification. Full stateful acceptance journeys are not rerun merely to publish unchanged application code. Follow the original evidence and remaining acceptance gates.

## Next work

1. HR review of the connected request → manager approval → HR approval → vacancy/recruiter journey.
2. Close and retest remaining authority/headcount cases and finish organization/vacancy screens.
3. Candidates, interviews, offers, actual joining and onboarding portal workflows.
4. Remaining lifecycle, reports, notifications and agreed integrations.
5. Production identity/security, measured concurrent workload for 1,000+ accounts, migration, backup restoration, HR acceptance and staged rollout.

## Ongoing delivery rule

Approved source changes and documentation belong in this repository. Finish a work increment with an explicit tested/incomplete status, secret review, commit, push and remote-SHA verification. If access or publication fails, report the exact blocker; do not call a local-only checkpoint delivered to GitHub.
