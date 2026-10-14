# S5 closure-cycle history — engineering prerequisite

Date: 2026-10-14. Scope remains all 98 frozen requirements. S5 and the overall goal remain active.

## What changed

The connected candidate page now has Arabic/English, paginated **Closure and reopening history**. It shows the original decision, internal explanation, original unsent draft, recorded actor/time, message outcome and, when a reopening event exists, the historical reason and return stage. Every page rechecks current candidate/native permissions. Raw history documents have no user CRUD permissions.

The previous schema allowed exactly one closure per application. Normal Frappe schema synchronization now removes that application-wide unique constraint, retains the application lookup index, and installs `Kandil Candidate Reopening` with a unique closure link. Closures remain immutable. The closure controller takes the company/application locks and rejects another active closure. Current closure means a closure with no linked reopening event; ambiguous multiple active closures fail closed.

Candidate detail, listing and withdrawal filters use only the active closure. A past withdrawal cannot make a reopened application appear withdrawn, or hide a later rejection. Native application and downstream guards still prevent bypassing an active closure.

The message queue retains historical completed reports and distinguishes pending, resolved and **cancelled by reopening** tasks. Rows are keyed by closure, with closure dates, so several cycles of the same application remain distinct. Reopening a pending task derives cancellation from its event; it never fabricates `MANUAL_SENT`/`NOT_NEEDED`, edits the original closure, or overwrites a previous manual report. The resolver refuses an old pending task after a subsequent rejection.

## Explicit limits: reopening is not enabled

This delivers the history/storage/projection prerequisite, **not a working reopen button or completed S5**. The reopening controller rejects all normal insert/update/delete/rename operations. No public mutation endpoint exists. Browser/native repeated-cycle tests use labelled, CLI-only synthetic storage fixtures; these do not prove an authorized reopening or genuine candidate consent.

The frozen reference at `7824be24292c4743b4005e14e2df540786cfe167` says:

- `src/Candidates.gs`, `appMove_`, REOPEN: only closed applications, a live vacancy, HR/recruitment leadership, a reason of at least three characters, candidate consent, and return to **SCREENING**. Pending rejection messages become cancelled; completed outcomes remain.
- `src/Candidates.gs`, `candAllRoles_`: Owner, HR Sector, HR Manager, Recruitment Manager and Recruitment Supervisor. These need explicit mapping to the portal's company-scoped authorities; ordinary recruiter/team membership must not grant reopening.
- `src/Consent.gs`: recruiter/import notes are not the candidate's own consent. A versioned notice and candidate-owned acceptance precede screening. Private links expire, are single-use, and replacement invalidates the previous link.

The current candidate flow has no candidate-owned consent service. Native Job Applicant also has no Screening enum. **Do not map a real reopening to Replied just to pass tests.** The direct-storage fixtures use Replied only to distinguish an open native projection from a closure; they explicitly declare that they are not the final stage workflow.

## Next implementation sequence

1. Implement versioned AR/EN privacy notice publishing with approved company wording kept separate from synthetic test wording. Preserve the exact accepted notice and configured purpose; do not infer consent from intake, a recruiter checkbox, or imported records. HR/privacy owner acceptance of production wording remains a gate.
2. Implement candidate-owned link issuance, expiry/replacement and single-use acceptance, bounded unauthenticated projections, race/replay protections, sensitive-token handling and consent evidence. Keep candidate acceptance separate from recruiter issuance; exercise public boundaries on isolated synthetic sites without contacting anyone.
3. Connect canonical Screening and other required reference stage projections without editing upstream HRMS enums. Check all list/filter/detail/native bridges and later interview/offer integration against the frozen reference.
4. Implement the company-scoped leadership reopen command, under existing company/request/application serialization. Check current authority before new execution and exact replay; verify candidate evidence, active vacancy, closure identity/version, reason, and joined/downstream restrictions. Append one immutable event, change canonical stage, append activity/audit/receipt, and preserve attribution/follow-up/history atomically. Recheck privacy state under the same command locks.
5. Connect AR/EN reviewed form and encrypted lost-response recovery. Test real authorized command cycles, concurrent reopen/closure/message resolution, revoked roles, consent/link races, downstream effects, mobile/RTL and HR UAT. Replace storage-fixture evidence with command acceptance evidence; do not relabel the fixtures as user workflow proof.
6. Continue every remaining candidate, interview, offer, joining, lifecycle, reporting and S11–S12 gate. No scope reduction.

## Schema deployment and preservation

`migrate_candidate_history.py` runs explicit `reload-doc` on the two isolated synthetic sites only. `schema_proof()` emits counts/hashes, no private row contents. Evidence: `evidence/candidate-history-schema-2026-10-14.json`.

- Both parity and review: all pre-existing closure, message-resolution, applicant, activity, capacity and command-audit rows unchanged.
- Closure application uniqueness removed; reopening closure uniqueness installed.
- Repeating closure schema synchronization preserved rows and indexes.
- No real/company-data site migrated, no records reseeded, no account permissions changed, no workers or schedulers started.
- Old unmigrated sites sharing source use the previous read model when the reopening table is absent; read fallback does not migrate them.
- This does not prove a full fresh installation, production upgrade/rollback or migration rehearsal; those remain S11 work.

## Verification

Final evidence from the serial native and browser runs: Initial native run `s2-regression-da0f88601a19.json` had two synthetic fixture errors (copied raw inserts lacked `docstatus=0`); no production transition was enabled. The fixture setup was corrected and the full selected set rerun.

- **79 native checks passed**: `evidence/s2-regression-67b26ec24ade.json` (13 history/schema/projection, 20 closure, 18 message, 21 recovery, 7 candidate portal). Source hashes stayed unchanged throughout the serial run. The 13 history checks include synthetic multi-cycle data, cancelled versus completed outcomes, stale historical task denial, native CRUD denial, unique reopening links, current scope/revocation, old-site fallback and ambiguous-current-history denial.
- **26 read-only review checks passed**: `../portal/evidence/review-work-1791951930832/results.json`. Personal-role AR/EN/mobile history and four message filters load; recorded review business digests remain unchanged; no browser errors, server 5xx or external requests.
- Frontend TypeScript/Vite build passed. Existing font-runtime and >500 kB bundle advisories remain; this is not capacity evidence.

- **47 workflow browser checks passed**: `../portal/evidence/candidate-messages-80b98a1f822b/results.json`. Real sessions exercise closure/message recovery and seven synthetic storage cycles, history pages, current-versus-historical outcomes, Arabic cancellation filters, revocation, and unchanged identity/capacity. Six disposable accounts disabled, capacity ledgers zero, candidate feature lease restored, no browser errors/5xx/external requests, tested source hashes unchanged.
- Three final EN/AR screenshots inspected: `../portal/evidence/candidate-messages-80b98a1f822b/visual-review.json`. Prior browser attempts `c5e7f51f9733` and `fb77207194a3` exposed test-helper issues: application-list pagination needed a precise selector after adding a second pager; screenshot helper needed explicit history/queue targets. Both attempts cleaned their cohorts. Their screenshots/results are superseded, not added to the final pass count. Shared candidate-navigation helpers now explicitly target a section containing the application list; changed harness syntax checks passed.
- All 98 IDs and every frozen comparison column preserved; only relevant `current_acceptance` text updated. Upstream pins unchanged. Independent security, sustained 1,000+ workload, HR/privacy wording/authority acceptance, UAT and production readiness remain open.

## Review locally

Open `http://kandil-review.localhost:8112/hr-portal`, choose Candidates, open an application and scroll to **Closure and reopening history / سجل الإغلاق وإعادة الفتح**. The persistent review site's four applications have no recorded closures, so the empty state is expected. No examples were injected into the user's review data. The repeated-cycle screenshots and automated evidence come from separate disposable parity cohorts.
