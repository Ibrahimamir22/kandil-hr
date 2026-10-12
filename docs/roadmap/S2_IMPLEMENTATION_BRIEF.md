# Sprint 2 — organization and job descriptions in the HR portal

**In progress: the first read-only AR/EN organization portal slice is implemented and tested.** See [checkpoint](S2_CHECKPOINT.md) for exact evidence and remaining work. Existing native organization capabilities will be reused through permission-checked adapters. This sprint does not replace Odoo or introduce another HR database.

Reference coverage: ORG-001, ORG-002, ORG-003, ORG-007, ORG-008, ORG-009, HC-001 and HC-002. Their full definitions remain in the frozen baseline/traceability files; this brief does not replace them.

## Delivery sequence

1. **Organization browser:** add an Organization navigation entry, scoped company/department/branch selectors, a position tree/list and position detail with as-of date. Distinguish Designation (job), Position (seat/capacity), Employee assignment and Vacancy. Show recorded capacity plus its basis/date; opening a page must not mutate occupancy. Preserve closed positions in historical views. Current source: `organization/models.py`, `permissions.py`, `api.py::active_hierarchy`, `occupancy.py`, `current.py`.
2. **Reviewed structural changes:** custom forms for proposed creates/changes/closures with reasons and effective dates, server preview/diff, independent submit/decide flow, current version and preview hash. Reuse `preview_structure`, `submit_structure`, `decide_structure`; do not expose unrestricted native saves as an alternative approval route. Company/unit coding follows existing `codes.py` and `units.py` rules; verify exact interfaces before integration.
3. **Dated assignments and import:** add CSV draft input, validation, row errors and unmatched identity reconciliation before independent Review/Apply. Reuse `preview_csv_import`, `review_import`, `apply_import`, `preview_assignment_reconciliation` and strict parser limits. Preserve dated assignments; no title-only employee matching or silent overwrite. Payroll-sheet adapters remain explicitly distinguished from already-supported CSV baseline loading.
4. **Job descriptions:** approved/draft version list and editor for responsibilities, competencies and weighted KPIs; reuse approval and document endpoints. Add Arabic/English view, print/PDF and worker-card actions. Preserve approved versions. Local mail capture must be visibly labelled; real email delivery is a separate configured/tested integration, so ORG-003 cannot be called fully accepted solely from local capture.
5. **History and acceptance:** show structural/JD/assignment revisions and differences. Verify four synthetic legal entities plus sibling companies, branch-restricted and company-wide roles, same-looking identifiers across scopes, denied edits/exports/prints and correct dated headcount.

## First implementation slice

Create `kandil_hr/portal/organization.py` for bounded read projections and `frontend/portal/src/Organization.tsx` for the organization browser. Start with read-only tree/list/detail and stable IDs; then wire reviewed commands. The backend may reuse domain calculations internally, but broad `structure_state` snapshots must not be returned without per-record scope filtering. Hidden parents must not reveal cross-scope names; display a neutral unavailable-parent boundary when necessary.

Tests must establish that scope applies to companies, departments, positions, assignments and document links, including a guessed record ID. Exclude salary/grade/sensitive employee fields from ordinary organization projections. Add paginated server search instead of reusing the current hiring selector's 500-row limit as a complete organization listing.

## Completion evidence

Each of the five tracker tasks needs ordinary-role AR/EN desktop/mobile browser execution with saved database results, API negative tests and affected native domain regressions. Imports must reconcile counts and reject invalid batches without partial writes. Test effective-date boundaries, closed positions, revision history, duplicate/stale commands and concurrent approvals. HR must separately review organization terminology and document layouts; no fixture or developer screenshot constitutes HR acceptance.
