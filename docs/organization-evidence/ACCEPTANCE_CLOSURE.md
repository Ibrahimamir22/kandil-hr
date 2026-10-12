# Organization exact acceptance closure — 12 October 2026

The rollback-only native suite executes the original 47 checks and the following eight frozen acceptance cases. All executed assertions passed at the recorded source hashes. All eight cases now have passing focused evidence, including nine cross-domain occupancy regressions. Final broader frozen-source regression is recorded separately by the root run. No acceptance wording was changed.

| Case | Evidence |
|---|---|
| AT-HC-001-01 | Approved Create with structural input omitted produces Position and capacity=1; Explicit approved structural=3 persists as Position and capacity=3 |
| AT-HC-002-01 | Dated assignment-derived occupied=2 for two active primary episodes; Valid Until is inclusive: count stays2 through end date and becomes1 next day; Both episodes remain stored. Recruitment refreshes current dated occupancy before reservation/approval; stale recorded0 with two employees and request3 on structural3 produces shortage2 (Warn exception or Block). Unmatched imported baseline requires explicit authorized, immutable-audited reconciliation; cancellation remains available. |
| AT-ORG-001-02 | Position title and Employee Designation changed through native saves; Stable assignment IDs, Position references and dated episodes unchanged; Occupied stays2 in original Position and0 in sibling Position |
| AT-HC-001-02 | Several positions share one Designation while capacities remain individually1 and3; Attempt to replace one approved capacity with same-Designation position count rejected; Rejected write leaves both position-linked ledgers unchanged |
| AT-ORG-002-01 | Approved R1 renders original root relationship; Approved dated R2 renders new parent independently in Arabic RTL; R1 remains byte-identical after R2 and live title edits; Snapshot mutation and unscoped read denied |
| AT-ORG-002-02 | Independent HR/CEO approved closure refreshes previously recorded occupied1 to current0 after its dated episode ends, and preserves past occupancy and episode; New allocation on closure date rejected; Native API delete of closed referenced Position and its historical assignment rejected even as Administrator |
| AT-ORG-003-01 | Existing fixture creates Draft JD and independently approves it; frappe.client.save cannot edit approved top-level JD; frappe.client.delete cannot delete approved JD; original approved content remains |
| AT-ORG-007-02 | Reparent ancestor under its dated descendant rejected as cycle; Cross-company parent rejected at request preview; Cross-company parent also rejected by native hierarchy invariant |

Implementation changes: unchanged assignment identity dates are normalized before comparison; snapshots now retain position titles and render their stored relationships independently; reconciliation exposes dated primary-assignment occupied, recorded provenance/as-of date and explicit unresolved imported differences. Covered recruitment and structure command boundaries refresh derived occupancy atomically under the Company mutex.

The new renderer is kandil_hr.organization.snapshots.view(name, language), with language en/ar. It checks native read permission, whole-company read scope and stored digest, escapes HTML, and does not join mutable live relationships or expose assignments. Older snapshots without titles show stable Position IDs.

Latest focused verification: 47 native checks + 8 exact cases and 9 occupancy integration tests. Earlier pure35/concurrency6 evidence remains historical until the root final frozen-source run. Main8100 and pilot8101 were not modified.

Occupancy detail: headcount approval freezes prior request-line commitment cohorts and joined/closed counters. Existing vacancy-to-employee conversions and later quantity top-ups do not double count the original cohort. HR quantity reductions offset subsequent occupancy growth; genuinely larger unreviewed shortages require a fresh review.

Known conservative boundary: An occupied employee from a later approved exception beyond the original frozen cohort conservatively requires fresh review of an earlier pending request. The proof covers original-cohort joins after a top-up; it does not claim every possible later-exception conversion order. Native forms distinguish current evaluation from recorded occupied/available values; continuously refreshed storage is not claimed.
