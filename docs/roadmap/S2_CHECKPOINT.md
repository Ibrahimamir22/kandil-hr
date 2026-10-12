# Sprint 2 checkpoint — organization browsing

Status: **in progress; first read-only portal slice verified**. This is a synthetic engineering checkpoint, not full Sprint 2 completion, HR acceptance or production readiness. The original register remains 72 passed / 4 partial / 4 blocked; these new checks are not added to that denominator.

## Available now

Open http://localhost:8102/hr-portal and select **Organization / الهيكل التنظيمي** with an existing authorized personal review account. Login credentials remain private. Test-generated accounts below were disabled after verification.

- Permission-scoped company, department and branch choices; bounded server search, active/closed filters and 20-row paging.
- Position list and reporting view for the loaded page, with links only to accessible parents. This is not a complete-company tree or a global total.
- Position details distinguish the shared job, position, recorded capacity and dated assignments. Current capacity reads do not recalculate or mutate the ledger.
- The date selector applies to reporting/assignment episodes. Current position attributes and recorded capacity are explicitly labelled as current, not historical reconstruction.
- Assignment history with inclusive end dates and employee identity redacted when native Employee read permission fails.
- Scoped JD revision list and permission-checked Arabic/English view/print links. No salary/grade or private document body in the organization list projection.
- Arabic RTL/mobile and English desktop screens, using the same personal-session API transport as the hiring portal.

## Verification

| Check | Evidence | Result |
|---|---|---|
| Native organization permission/projection/date tests | `evidence/s2-regression-16468fd2e2a8.json` | 9 passed |
| Personal-session organization browser/API checks | `../portal/evidence/organization-e8e1d1c633f1/results.json` | 26 passed |
| Existing hiring/approval/vacancy browser regression | `../portal/evidence/browser-5fbab5ddc84a/regression.json` and `results.json` | 24 passed |
| TypeScript check and Vite production build | `npm run build --prefix frontend/portal` | Passed |

Evidence includes source fingerprints; native and browser results refer to their exact recorded source. Screenshots were inspected for layout; Arabic mobile had no horizontal overflow. This does not certify all browser/accessibility combinations. Existing local font paths produce Vite warnings because assets resolve at runtime; they are retained in the repository.

Organization browser negatives use HR, branch-restricted recruiter, requester and unscoped personal accounts across four synthetic legal entities. Guessed foreign IDs, document URL bypass and hidden reporting parents are tested. Native identity-redaction test forces Employee permission denial to isolate that projection branch; it is not a full deployed identity-provider acceptance test.

Both browser cohorts completed cleanup: six accounts disabled in each, secrets scrubbed from private fixture manifests and fixture capacity ledgers zero. Synthetic source/history records remain for evidence. The three foreign synthetic company records in each organization cohort are also retained; no real company data was imported. No outbound requests/email were observed during the organization browser checks.

Earlier organization run `organization-f52211eb6a30` passed 25 checks before adding the JD tab UI assertion and resetting scroll for the mobile capture. Final run has 26. Failed evidence is retained: `s1-regression-232299f856e8.json` was an S2 suite launched through the older runner before Docker was available; no test result was obtained. `s2-regression-31a7652e356d.json` records fixture setup errors caused by an overly broad import flag; limiting that flag to synthetic User creation fixed setup. The subsequent nine native tests passed without weakening production validation.

## Source and architecture

`frontend/portal/src/Organization.tsx` renders the new screens; `kandil_hr/portal/organization.py` provides read-only, allowlisted projections on native scope-checked records. Fixture, native tests and browser harness are included with the code. No upstream Frappe/ERPNext/HRMS core change or database migration was needed.

Upstream dependencies are pinned Git submodules under `upstream/`; their commits match `deployment/versions.lock.json`. The running Bench keeps app checkouts as siblings. Repository layout and runtime layout intentionally differ; a recursive clone retrieves the tracked upstream sources.

## Next work and remaining limits

1. Connect structure proposal/edit/closure forms to server preview, version/hash checks and independent approval; test stale/repeated actions and both decision paths.
2. Add reviewed CSV import and assignment reconciliation with row errors, no silent overwrite and explicit baseline provenance.
3. Add JD editing, weighted KPIs, approval/version history and worker-card/PDF checks. Existing view links do not complete this scope.
4. Complete dated structural differences, broader scoped tree interactions and HR terminology/layout review.

S2-01 remains in progress; S2-02 through S2-05 remain planned. Native capabilities existing in the repository are not automatically counted as connected portal delivery. Authentication/MFA decisions, independent security review, sustained load for 1,000+ accounts, recovery, HR UAT and production rollout remain later gates. Odoo and other company departments remain outside this goal.
