# قنديل — Connected HR portal

The approved portal design now runs as a React + TypeScript application connected to the existing Frappe HR and `kandil_hr` backend. This is the first connected local milestone, with synthetic data. It does not replace Odoo or implement the entire HR reference repository.

**Open:** http://localhost:8102/hr-portal

**Private test accounts:** open `development/frappe-bench/sites/kandil-parity.localhost/private/Kandil_Portal_Private_Test_Accounts.html` from the `Kandil_HR_Dev` directory. This local file contains personal synthetic accounts and a walkthrough; it is outside the application repository. Never commit or forward it.

Current full-scope progress is in the [roadmap tracker](../roadmap/tracker.json). The [Board checkpoint](../roadmap/S3_BOARD_CHECKPOINT.md) describes the latest approval/evidence UI and its exact test limits. The list below describes the original connected milestone.

## What is working

1. Personal password login and logout using Frappe session cookies and CSRF protection.
2. An Arabic/English dashboard showing records and actions available to the signed-in account.
3. A hiring-request wizard with several locations, whole-number quantities, priority, required date and justification/qualifications. Drafts persist on the server.
4. Separate manager and HR approvals. Returning a request requires a reason; its requester can revise, edit and resubmit it.
5. A vacancy for each approved location, with scoped lead-recruiter assignment and a reason.
6. Server-enforced ownership/scope, reviewed-version checks, command replay protection, headcount reservations and final opening counters.

The dashboard, search and vacancy list currently cover a bounded page of accessible requests. Counts are labelled as page counts. Use Next/Previous to navigate. Position/capacity choices are capped at 500 with a truncation notice. Availability in the selector is a recorded ledger value; submission rechecks current capacity and policy. This milestone is not yet a full-scale reporting/search implementation.

## Pending quantity revision — Sprint 1

The original requester can open a Pending request, change its quantities, enter a reason and review current reservation/new quantity/difference before confirming. Successful changes restart approvals while retaining past decisions. A shortage or stale version keeps entered values; refresh/review a stale request before trying again. The action is unavailable to other actors. Arabic/mobile and English/desktop flows were verified with fresh synthetic cohorts. See [checkpoint and exact evidence](../roadmap/S1_CHECKPOINT.md).

## How to test

| Account | Action | Expected result |
|---|---|---|
| Requester / طالب التوظيف | Create a request for one operator at العبور and one at العاشر. Confirm & submit. | Pending, with both location quantities reserved. |
| Manager / مدير الإدارة | Open Approvals, read the request and approve. | Still Pending; next authority is HR. |
| HR / الموارد البشرية | Approve that request. | Approved; one vacancy per location. Reservations become open positions. |
| HR | Open Vacancies, choose Assign recruiter, select سلمى and enter a reason. | The saved lead appears on that vacancy. |
| Requester + Manager | Create another request. Manager returns it with a reason. Requester selects Revise request, edits and resubmits. | Revision increases; approvals restart independently. |
| Requester | Ask for two seats at the limited-capacity location, which has one. | Clear denial, no reservation, retained draft/input. |

Sign out between accounts or use separate browser profiles. Switch Arabic/English and try a phone-width viewport. New API messages follow the selected language; a message already displayed retains the language of the action that produced it. Names and entered business data are not machine-translated.

Existing Browser-labelled requests are retained synthetic acceptance examples. The guide's cohort is `d67f380ba124`. Its approved and revised examples remain available for inspection; new manual requests should use fresh titles.

## Technical boundary

```text
React + TypeScript portal on /hr-portal
  → personal Frappe session + CSRF
  → narrow portal projections/draft API
  → existing Kandil recruitment commands + Frappe HR records
  → existing MariaDB database
```

- Sources: `frontend/portal/`; compiled assets: `kandil_hr/public/portal/`.
- Frappe website shell: `kandil_hr/www/hr-portal.html` and `hr_portal.py`.
- Adapter: `kandil_hr/portal/api.py`. It checks access, filters fields, provides scoped selectors and wraps idempotent draft save. It does not introduce a second HR database or a browser service key.
- Existing `recruitment.api` and `recruitment.vacancies` continue to own transitions, approvals, reservations and assignment.
- Frappe Desk remains available for existing administrative workflows. Other HR modules are not presented as completed portal screens.
- React/React DOM 19.1.1, TypeScript 5.9.2, Vite 7.3.7. Exact dependencies are in `frontend/portal/package-lock.json`. The final npm audit found zero reported vulnerabilities; this is dependency scanning, not a security certification.

## Run and build

From `Kandil_HR_Dev`, start the existing isolated site:

```sh
docker compose --profile parity up -d parity-web
```

From `development/frappe-bench/apps/kandil_hr/frontend/portal`:

```sh
npm ci
npm run build
```

The shell reads Vite's manifest and serves the built assets from the same origin. No separate frontend web server is required. Restart only `parity-web` after Python changes; do not recreate databases or run bootstrap against existing sites.

## Verification and provenance

- `evidence/native-tests.json`: 10 native database/permission tests with rolled-back synthetic fixtures. The CLI test mocks only CSRF token generation because it has no HTTP session; the real session/CSRF checks are in the HTTP lane.
- `evidence/http-e49b6037af18.json`: final ordinary-session HTTP journey and negative checks, including two simultaneous identical draft-create requests.
- `evidence/browser-d67f380ba124/results.json`: final connected desktop/mobile browser journey, 24 checks, with screenshots.
- `evidence/source-manifest.json`: hashes of the tested working-tree source and upstream revisions. This is the original test-time manifest; its `local_only` and working-tree fields are historical provenance, not the current publication status. The source is included in the repository checkpoint described in `../SOURCE_CONTROL.md`. Earlier headcount work remains preserved rather than silently claimed complete.
- Earlier failed checks remain in their own evidence directories. The first browser attempt exposed missing accessible labels; these were corrected and the full journey passed on a fresh cohort. The first HTTP attempt exposed a concurrent replay snapshot issue; a current locking read fixed it before the final passes.

Scripts `test_http.py` and `test_browser.cjs` expect a **fresh** synthetic cohort from the CLI-only `kandil_hr.portal.fixture.prepare`. Do not rerun them against a completed cohort: they are acceptance journeys, not state-reset scripts. Private manifests and credentials stay in the site's private folder. Test evidence contains no passwords or session tokens.

## What comes next

1. HR reviews this complete journey and records any workflow or screen corrections.
2. Extend the same portal to the next agreed reference workflows, starting with candidates/interviews, offers and joining; retain a feature-by-feature acceptance checklist.
3. Before a real staff pilot, verify migration data, role/scope matrix, backups and restore, monitoring, secure hosting/TLS/session configuration, operational ownership and an independent security review.
4. Define measured concurrency, request mix, latency/error targets and test realistic data volumes for 1,000+ accounts. Neither employee count alone nor these local functional tests proves production capacity.

Production deployment, real employee imports, Odoo integration, payroll/attendance, AI agents and wider company modules were not performed in this milestone.
