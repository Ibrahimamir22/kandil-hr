# Sprint 2 — reviewed organization imports

**Engineering increment; Sprint 2 and production acceptance remain open.** The custom portal now supports the existing reviewed import policy. This does not add another database, change Frappe core, import real employees or integrate Odoo.

## What HR can do

Open the local HR portal, sign in with a personal account, then choose **Organization imports / استيراد الهيكل**. Import access requires an appropriate native role and a current whole-company grant. Department-only users retain their scoped organization directory but cannot inspect these whole-company import batches.

1. Choose company and import type: departments, jobs, positions, reporting lines or employee assignments.
2. Download the CSV header template, supply the baseline reference and select a UTF-8 CSV or paste its contents. Limits are 1 MiB, 1,000 rows and the existing parser's cell limits. Headers and record identifiers are exact technical IDs; titles may be Arabic or English. Formula-like cells are rejected.
3. Validate before saving. The server checks live domain rules. Employee/position mismatches return every unmatched row; other business conflicts fail validation with the domain message. The initial preview is paginated in the browser; saved batch rows are paginated on the server.
4. Review the input and save a draft. This creates an import record, not the imported employees/positions/assignments. The author can replace a draft CSV with a validated revision. A later baseline conflict remains readable and correctable; it cannot be reviewed while invalid.
5. A different user with the Sector Approver role and whole-company management access reviews the current draft version. This freezes its content, reference, digest and reviewer. The existing import policy uses one independent structural reviewer, unlike structural change proposals that require HR and CEO steps.
6. An authorized import operator explicitly applies the reviewed batch. The native command revalidates every row against live records before applying. Matching records remain unchanged; conflicting records are rejected. Reviewed/applied content cannot be silently edited.
7. Inspect created/unchanged/mapped counts and the occupancy comparison. It shows effective primary assignments, recorded ledger occupancy, differences and unlinked ledger count. It does not repair a mismatch automatically. The comparison saved at application is labelled separately from the current comparison.

Baseline imports use existing/historical dates; they cannot schedule future assignments or silently replace historical assignments. Individual dated employee reassignment is a separate unfinished S2-02 workflow.

## Implementation and authorization

- `frontend/portal/src/OrganizationImports.tsx`: AR/EN desktop/mobile flow using the existing same-origin, cookie-session and CSRF transport. New sidebar entry, CSV templates, validation, reviewed commands and comparison. Draft input survives confirmed errors; an uncertain request retains its command ID within the mounted screen. Durable retry recovery across browser reloads is not implemented.
- `kandil_hr/portal/imports.py`: permission-checked, bounded DTO adapters. Domain parsing, row validation, independent review, application, immutable audit and ledger rules remain in `organization/`.
- GET choices/list/detail; POST CSV validation, batch row preview, save, review, apply and occupancy comparison. Read-only previews use POST because their consistent calculations acquire database locks; previews do not change business records.
- Company-scoped, actor/operation-specific receipts protect save/review/apply retries. Payload hashes bind each command. Current role/grant checks and native document permissions still apply to replay. Company locking serializes concurrent retries; receipt targets use current locking reads.
- Native review/apply audit envelopes remain the authoritative operation records. Drafts use native history and private receipts; no new claim of exact draft command audit is made.
- Whole-company import readers can see submitted CSV rows, including supplied employee IDs, linked user IDs and remarks. General employee records, salary fields, full company state and raw audit envelopes are not returned by the adapter.
- No permission/schema migration or upstream source change is required by this increment. Fresh installation was not rerun here.

## Verification

- Final native import suite: [13 passed, no failures or skips](evidence/s2-regression-a1f0a6427f09.json), matching final Python sources. Existing structure command regression: [10 passed](evidence/s2-regression-1a3cfa201c4b.json); that earlier run also contains the initial 10-case import suite, not the final expanded suite.
- Final import browser/API journey: [24 passed](../portal/evidence/imports-6e32fd6a0b36/results.json), source unchanged; six synthetic accounts retired, all three capacity ledgers zero. [Arabic mobile](../portal/evidence/imports-6e32fd6a0b36/review-ar-mobile.png) and [English desktop](../portal/evidence/imports-6e32fd6a0b36/applied-en.png) were visually inspected.
- Existing hiring-to-vacancy browser regression: [24 checks passed](../portal/evidence/browser-d745f7771b41/results.json), with [source/cleanup evidence](../portal/evidence/browser-d745f7771b41/regression.json).
- TypeScript checking and Vite build passed (34 modules); runtime font URL warnings refer to the existing served fonts, which rendered in the browser evidence.
- Earlier attempts remain recorded rather than rewritten.

- Native ordinary-role suite covers all five kinds; no-write validation; malformed/formula/oversize input; unmatched references; self-review and stale-version rejection; edit freeze; revoked/disabled identities; paginated rows; current assignment counts and duplicate matching; overlap/future-date refusal; cross-scope/native bypass; complete-batch conflict refusal; invalidated-draft repair.
- Personal-session browser evidence covers English author and Arabic mobile independent reviewer, historical assignment import, occupancy display, direct API negatives and native-resource bypass, real concurrent duplicate save/review/apply transactions, exact committed counts/audit events, invalidated-draft repair and synthetic cleanup.
- The browser fixture deliberately leaves its pre-existing HEAD assignment without a linked capacity ledger; the displayed “Needs review” and difference of -1 are expected evidence that the comparison exposes a mismatch. Cleanup checks that every actual company capacity ledger has zero occupancy/reservations/open slots. No false balanced claim is made.
- A pagination test initially expected rejection above 100 rows, whereas the shared API contract clamps the limit to 100. That test was corrected to verify the cap; the application behavior was preserved. The failed attempt remains in `evidence/s2-regression-5a49e43345f6.json`.
- Browser run `imports-7610e43174a9` caught the local `--noreload` web process serving the earlier adapter after the draft-conflict fix. Only `parity-web` was restarted before the final browser run. The failed run and successful cleanup remain recorded. Native test success and disk hashes alone were not treated as proof of the updated HTTP behavior.

## Still required

S2 remains in progress: individual effective-dated assignment changes, JD editing/approval/KPIs/documents, complete dated history/differences and HR review of terminology/layouts. The original 98 requirement IDs and 72 passed / 4 partial / 4 blocked baseline register are unchanged by this checkpoint. Full security review, sustained capacity for 1,000+ accounts, identity/MFA decisions, production recovery and real-data rollout remain release gates.
