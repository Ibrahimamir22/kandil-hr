# Reference repository examination — scope and findings

15 October 2026. Static source/document examination for planning, not a full security audit or runtime acceptance.

## What was actually examined

The first rebuild draft was based on the existing 98-ID mapping. It was not preceded by a fresh examination of the reference repository. This revision corrects that limitation.

Repository: https://github.com/mohamedomara-hr/kandil-recruitment-portal

Remote HEAD/main verified and fetched: `c54c21b93be4063521d5fc1d69b8909d6ba976b1`.

Previously checked-out source: `7824be24292c4743b4005e14e2df540786cfe167`. The two intervening commits update the blueprint's lawyer questions and print-book generation/content; they do not change `src/`. The older checkout was preserved. Current source was extracted into an isolated read-only-review directory; its Apps Script setup/deployment was not executed.

Reviewed material: README/release notes; requirements-status matrix; blueprint change log, screen map, state machines, acceptance criteria and open items; recorded owner decisions; API/public entry points; repository locking/cache implementation; session/permission code; request-amendment, candidate salary, self-service and source-change logic; domain module headers and function surfaces across organization, JDs, interviews, assessments, offers/pay, joining, onboarding, transfers, probation, reporting, privacy, AI and operations; representative mock tests and CI definition. The JSON inventory fingerprints 219 files but does not claim all 219 were read line by line.

No live Apps Script deployment was tested. No current CI result, security guarantee or 1,000-user capacity is asserted. The repository's own claims of 94 Built / 3 Partial / 1 Later are its classifications, not independently verified results from this review.

## Architecture found in the reference

| Layer | Evidence | Rebuild treatment |
|---|---|---|
| UI | `src/Index.html`: large HTML/JavaScript portal; navigation, role-based actions, `google.script.run`; separate Apply/Self/Docs/Consent/Prob/Voice pages | Use as behavior/design reference; implement React components and explicit browser routes |
| API | `src/Api.gs`: `api(action, token, payload)` and public entry routes | Replace with reviewed REST contracts and separate authenticated/public boundaries |
| Data | `src/Repo.gs`: spreadsheet repository, cache generations, buffered writes and Apps Script lock | Replace with typed PostgreSQL schema, constraints, transaction boundaries and row-level concurrency controls |
| Identity | `src/Auth.gs`, `Security.gs`, `Perm.gs`: OTP/TOTP/session logic and role plus organizational scope | Preserve required experience only after security design; use mature framework/provider primitives |
| Business services | Domain `.gs` files | Translate rules and test cases into Django modules; not direct code conversion |
| Background work | `Daily.gs`, assessment/hourly jobs, notification/email budgeting | Explicit workers, scheduler, idempotent outbox and delivery failure visibility |
| Tests | 109 JavaScript files under `tests/`; inspected harness mocks Apps Script; CI labels server tests as mocks | Reuse scenarios; add real database, HTTP, browser, concurrency and deployment checks |

The API source has separate applicant, document, probation, candidate-self, consent, CEO and new-hire-survey entry surfaces. A staff-only dashboard would miss a substantial part of the reference product.

## Findings that change the plan

1. **98 IDs alone are insufficient detail.** The blueprint has 109 CHG entries. `source-changes.csv` retains them and gives each a primary review sprint. These are history, including superseded decisions and implementation fixes; they are not 109 automatically approved new requirements.
2. **Short requirement labels can contradict later policy.** CAN-005 says salary required, while candidate code allows an empty expected salary/range and clears current salary on public intake. REQ-011's broad reapproval description differs from the more permissive amendment implementation. See C01/C02 in `DECISIONS.md`.
3. **The current user overrides some reference routes.** The reference's transfer module says managers give opinions and HR decides; the rebuild retains the user's HR + CEO employee-position route. Reference owner decisions are evidence, not instructions to change the user's choice.
4. **The source has detailed employee-lifecycle work.** Onboarding owners, custody/PPE, attendance-enrollment metadata, confidential surveys, probation/evaluator selection, medical insurance and exits need individual tickets. They cannot be covered by a single 'employee file' task.
5. **Attendance enrollment is not attendance integration.** The reference records enrollment and mobile-license use; it explicitly has no BioTime connection and stores no biometric templates. The rebuilt scope must preserve that distinction.
6. **Compensation calculation is not payroll execution.** `Pay.gs` calculates proposed offer packages; joining documents can print compensation details. WAG-001 still prohibits payroll/wage actions. Current tax/insurance formulas and legal wording need separate authoritative validation before adoption.
7. **Privacy goes beyond one consent checkbox.** Candidate links, salary/photo/pool purposes, retention, data requests, minors/accommodation questions and survey confidentiality need explicit policies and permissions. Legal interpretations in the repository remain questions for Kandil's advisers.
8. **Operations are product features too.** New-device alerts, dormant accounts, two-person privileged changes, access reviews, incident records, audit verification, backups and readiness screens need tickets and real operational tests.
9. **The visual reference is specific.** Action-first inbox, section colors, Arabic-first navigation, candidate tabs, next-action panel, guided offers, browser back/filter restoration, responsive behavior and branded login are included in N01 and subsequent feature screens.
10. **Known reference gaps must remain visible.** Requirements-status lists full structure snapshots, independent multi-company approval roots, occupied-HC payroll import as partial, and appraisal shared login as later. These require new implementation or explicit deferral, not inherited 'done' labels.
11. **Legal review is explicitly unfinished.** Current blueprint §30 item 17 lists 16 lawyer questions, including contract wage wording, probation result/appeal, transfer notices, retention and acknowledgements. No claim is made that these practices comply with current law. Final templates and consequential rules stay gated.

## Source pointers

All links below are pinned to the inspected revision:

- [Requirements and admitted gaps](https://github.com/mohamedomara-hr/kandil-recruitment-portal/blob/c54c21b93be4063521d5fc1d69b8909d6ba976b1/docs/blueprint/requirements-status.md)
- [Blueprint and change history](https://github.com/mohamedomara-hr/kandil-recruitment-portal/blob/c54c21b93be4063521d5fc1d69b8909d6ba976b1/docs/blueprint/blueprint-v2.3.md)
- [Request amendment implementation](https://github.com/mohamedomara-hr/kandil-recruitment-portal/blob/c54c21b93be4063521d5fc1d69b8909d6ba976b1/src/RequestChanges.gs)
- [Candidate intake and salary rules](https://github.com/mohamedomara-hr/kandil-recruitment-portal/blob/c54c21b93be4063521d5fc1d69b8909d6ba976b1/src/Candidates.gs)
- [Candidate self-service](https://github.com/mohamedomara-hr/kandil-recruitment-portal/blob/c54c21b93be4063521d5fc1d69b8909d6ba976b1/src/Self.gs)
- [Transfer implementation](https://github.com/mohamedomara-hr/kandil-recruitment-portal/blob/c54c21b93be4063521d5fc1d69b8909d6ba976b1/src/Transfers.gs)
- [Spreadsheet repository/locking](https://github.com/mohamedomara-hr/kandil-recruitment-portal/blob/c54c21b93be4063521d5fc1d69b8909d6ba976b1/src/Repo.gs)
- [Mock test harness](https://github.com/mohamedomara-hr/kandil-recruitment-portal/blob/c54c21b93be4063521d5fc1d69b8909d6ba976b1/tests/harness.js)

## How to read the resulting plan

`SPRINTS.md` is the full N00–N25 backlog, with 104 work items and observable demos. `requirements.csv` preserves all 98 IDs/text and assigns a primary detailed sprint. `source-changes.csv` is a 109-entry review catalogue, not a claim of complete acceptance. Cross-cutting and multi-domain changes must be split during N00/N02; one primary sprint is the review owner, not the only implementation location.

`tracker.json` tracks every sprint and task as planned. `DECISIONS.md` lists conflicts that cannot be resolved by counting code or tests. The previous R0–R14 view remains historical grouping only; use N00–N25 for planning execution.
