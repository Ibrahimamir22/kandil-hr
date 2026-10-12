# Sprint 2 — reporting-tree navigation

13 October 2026. Development checkpoint on the isolated synthetic parity site. Full S2, all 98 requirements, HR acceptance and production readiness remain incomplete.

## Behavior

Open `http://localhost:8102/hr-portal` → **Organization / الهيكل التنظيمي** → **Reporting view / عرض التبعية**.

The former page-only indentation is replaced with a lazy reporting tree. Expand a position to load its direct reports, load more children without losing previous ones, and open any node's real position details. **Explore reporting / استكشاف التبعية** in detail or **Focus this position / التركيز على هذا المنصب** starts a branch at an accessible position. Focus explicitly ignores directory filters while retaining native permissions and the selected date; returning to the filtered structure restores those filters.

Company, department, branch, status and search select the visible subset. Its starting positions are boundaries of that subset, not necessarily company-wide roots. A missing parent, a parent outside the filters, a restricted parent and conflicting reporting episodes have distinct labels. Hidden parents never disclose their names or IDs. A role without hierarchy access receives an explicit list-view fallback.

Dates select effective reporting episodes with inclusive end dates. Position titles, statuses and capacity remain current records; this screen does not reconstruct historical position attributes. Closed positions remain selectable. A cycle stops expansion on the repeated node. After 20 nested ancestors, an explicit focus action continues from that position, rather than silently omitting descendants. Indentation is visually capped for mobile readability while paths can continue through focus.

## Implementation and bounds

- `portal/organization_tree.py`: personal-session GET endpoint. Roots, child candidates, current position projection and parent lookup use native permission-filtered lists. Every requested parent/focus is independently checked. No browser service credentials or broad company snapshots.
- Root discovery scans 100 candidate positions per batch, at most 500 candidates per request. Child discovery scans distinct accessible effective hierarchy positions for the requested parent, then applies native position permissions and selected filters. It does not retrieve the entire company graph.
- Responses contain up to 100 visible nodes (UI requests 20) and a candidate continuation offset. An empty batch with `has_more` is explicitly navigable, not treated as proof that no hierarchy exists. Hidden IDs and sensitive employee/grade/salary fields are not projected.
- Offset pages are a live view, not a transactionally frozen organization export. Refresh after concurrent structural changes. Rootless corrupt cycles are discoverable through directory focus; root discovery does not claim to diagnose the entire graph.
- `OrganizationTree.tsx`: nested semantic lists and ordinary keyboard buttons; no incomplete ARIA tree-widget contract. Expand/collapse, load more, focus, date/filter resets and retry are bilingual. A failed fetch clears the affected branch and provides retry; subsequent requests recheck access.
- No upstream code, business schema, approval authority or capacity-writing logic is changed.

## Verification

- [Final native contracts](evidence/s2-regression-0bad36f58545.json): **17 PASS** (8 tree and 9 existing organization tests), run serially on rollback-scoped fixtures. Covers a root beyond the first 100 candidates, 107 children without duplicate/lost pages, actual native User Permission, hidden/guessed anchors, inclusive dates, closed positions, ambiguous episodes, revocation, disabled/Guest users and unchanged capacity ledgers.
- [Final personal-session browser run](../portal/evidence/tree-e32788b018af/results.json): **26 PASS**, including a 25-child branch, five levels, detail/focus round trips, date-based reparenting, search boundaries, keyboard expansion, a controlled transport abort/retry, Arabic mobile, foreign-company denials and revoked access. No runtime JavaScript exceptions, HTTP 5xx or external requests.
- [Visual review](../portal/evidence/tree-e32788b018af/visual-review.json): English desktop and Arabic mobile captures inspected. RTL layout and wrapped long identifiers are readable; browser geometry confirms no horizontal overflow.
- Final browser cleanup disabled all six synthetic accounts and verified zero current fixture capacity ledgers. All four browser cohorts were cleaned; synthetic organization/history records are retained.
- TypeScript/Vite build passed (38 modules). Final backend and browser source maps match the verified files. Upstream pins remain unchanged. No schema migration.

These focused checks do not certify 1,000+ account load, a complete security assessment or business acceptance. Earlier attempts remain recorded with their original status:

- `tree-4e27972f58e8`: first browser attempt reached the paginated branch but the harness tried to click a removed load-more button after its final response. The original result remains FAIL. Screenshot shows the full 25-child branch; cleanup disabled all six synthetic users and verified zero current fixture capacity ledgers. The harness now waits for the specific pagination response and final button removal.
- `tree-7641c48ac3fe`: eight browser checks passed before an immediate assertion ran ahead of the detail response. The harness now waits for the detail heading. All six accounts were disabled and current ledgers reconciled. Original result remains FAIL.
- `tree-1709afaf1120`: fifteen browser checks passed before an immediate assertion ran ahead of the retry response. The harness now waits for that response and rendered node. All six accounts were disabled and current ledgers reconciled. Original result remains FAIL.
- `s2-regression-f577f4825d0e`: 8 tree contracts and 9 existing organization contracts passed before the browser fixture was added. Final source verification follows below.

## Remaining scope

HR still needs to review organization terminology, tree behavior and document layouts. The unified position timeline across imports, joining and reversals remains to be connected. Live document email, identity/MFA, independent security, audit custody, sustained 1,000+ account capacity, hosting/recovery, real-data reconciliation and staged release remain separate gates. The shared development queue backlog is unchanged; this read-only slice does not certify workers or notification delivery.
