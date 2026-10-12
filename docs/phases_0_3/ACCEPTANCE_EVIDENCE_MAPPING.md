# Acceptance evidence / أدلة الاختبارات

Updated 2026-10-12T03:36:04.163198+00:00. Current tested source: `d3e2c66100926cfa8ad8f886e6a3debf5a4c0865`.

**28 passed / 42 partial / 10 blocked.** All 80 baseline definitions remain unchanged. These are technical case results, not HR sign-off or production certification.

Unchanged cases retain their earlier tested commit and timestamp in the canonical JSON. New cases reference the latest affected suite. An initial missing SLA test entry point and the native note form failure are preserved; corrected targeted runs passed. The final note permission change was followed by all eight privacy tests and the browser journey.

Current suite evidence: [combined checkpoint](../sprints/evidence/checkpoint-summary-2026-10-12.json), [final privacy](../sprints/evidence/privacy-final-form-2026-10-12.json), [HTTP concurrency](../sprints/evidence/concurrency-http-2026-10-12.json), [AR/EN browser](../sprints/evidence/browser/results.json).

Limits: later exception hires outside the original commitment cohort may trigger conservative fresh review; old shared snapshots are not rewritten; no provider/MFA, external audit seal, production or human acceptance is implied.

| Case | Status | Actual / remaining gap |
|---|---|---|
| AT-ACC-001-01 | partial | Password login and authenticated ordinary users pass; disabled-account scope checks pass. Expired-session plus disabled-login UI/API matrix is not executed. |
| AT-ACC-001-02 | blocked | New-device alert deduplication, idle expiry and enrolled MFA have no acceptance evidence; native login does not substitute. |
| AT-ACC-002-01 | blocked | External identity adapter and conflicting-subject mapping are not implemented/verified. |
| AT-ACC-002-02 | blocked | No provider-failure exercise exists; provider integration is absent. |
| AT-ACC-003-01 | partial | Company/branch native list/detail, file/share and team denials pass. Equal-looking A/B records across every link/export/print/attachment channel remain untested as one complete matrix. |
| AT-ACC-003-02 | partial | Requester takeover, role loss, self-approval and executive delegation denial pass. Full beneficiary/acting-principal and immediately revoked delegated-decision matrix remains. |
| AT-ORG-001-01 | passed | Reviewed baseline creates Worker/Vacant/Manager Position IDs sharing one Designation; separate native identities and scope fields persist. Capacity is position-linked, not title-counted. |
| AT-ORG-001-02 | passed | Position title and Employee Designation changed through native saves; Stable assignment IDs, Position references and dated episodes unchanged; Occupied stays2 in original Position and0 in sibling Position |
| AT-ORG-002-01 | passed | Approved R1 renders original root relationship; Approved dated R2 renders new parent independently in Arabic RTL; R1 remains byte-identical after R2 and live title edits; Snapshot mutation and unscoped read denied |
| AT-ORG-002-02 | passed | Independent HR/CEO approved closure preserves past occupancy and episode; New allocation on closure date rejected; Native API delete of closed referenced Position and its historical assignment rejected even as Administrator |
| AT-ORG-003-01 | passed | Existing fixture creates Draft JD and independently approves it; frappe.client.save cannot edit approved top-level JD; frappe.client.delete cannot delete approved JD; original approved content remains |
| AT-ORG-003-02 | passed | Native and pure JD tests prove60+40, reject60+30, zero-weight monitoring, and out-of-band written reason; KPI rules are separate from competency weights. |
| AT-ORG-003-03 | partial | Four native PDFs visually reviewed, readable AR/EN with no clipping in samples. External-recipient and greater-than10 recipient mail denial/audit is not implemented/verified. |
| AT-ORG-005-01 | passed | Ordinary sector actor creates and reloads a 90-inclusive-calendar-day delegation; 91 days and self-delegation fail with no extra delegation records. |
| AT-ORG-005-02 | partial | Scope revocation and immutable decisions have partial evidence. Delegation process isolation, delegated action revocation and preserved old decisions require one complete test. |
| AT-ORG-005-03 | partial | Unapproved executive delegation is rejected. Positive separately approved CEO delegation/version workflow is absent; fail-closed is not feature completion. |
| AT-ORG-006-01 | passed | No Position exists at draft/submission; independent hierarchy/HR/CEO completion creates one stable KPOS identity with one capacity. |
| AT-ORG-006-02 | partial | Structural approval replay is stable. Reject/return reason and final Create replay together have not been exercised; structural Return is not delivered. |
| AT-ORG-007-01 | partial | Authorized native organization commands and draft ownership checks pass; actual UI unit create/update plus requester REST denial is not recorded. |
| AT-ORG-007-02 | passed | Reparent ancestor under its dated descendant rejected as cycle; Cross-company parent rejected at request preview; Cross-company parent also rejected by native hierarchy invariant |
| AT-ORG-008-01 | partial | Position/hierarchy/assignment repeated reviewed imports do not duplicate. Unit/job import and full external-code adapter coverage are not implemented/verified. |
| AT-ORG-008-02 | partial | Conflicting allocation and occupied-baseline mismatch are reported. External-ID collision, search and export retention need dedicated tests. |
| AT-ORG-009-01 | partial | Company-keyed authority settings exist; simultaneous legal entities with equal titles and independently resolved chiefs are not exercised. |
| AT-ORG-009-02 | partial | Native cross-company scope and browser out-of-scope detail/queue denial pass. Complete report/link/attachment URL matrix for company A versus B remains. |
| AT-HC-001-01 | passed | Approved Create with structural input omitted produces Position and capacity=1; Explicit approved structural=3 persists as Position and capacity=3 |
| AT-HC-001-02 | passed | Several positions share one Designation while capacities remain individually1 and3; Attempt to replace one approved capacity with same-Designation position count rejected; Rejected write leaves both position-linked ledgers unchanged |
| AT-HC-002-01 | passed | Dated assignment-derived occupied=2 for two active primary episodes; Valid Until is inclusive: count stays2 through end date and becomes1 next day; Both episodes remain stored; ledger discrepancy remains explicit and is not overwritten Current dated occupancy is also refreshed before recruitment reservation/approval and structural closure; nine cross-domain tests cover integration and reviewed baseline reconciliation. Later exception hires outside the frozen cohort may conservatively require renewed review. |
| AT-HC-002-02 | partial | Repeat assignment import and explicit occupied mismatch pass; exhaustive unmatched Employee/Position preview and payroll-file adapter remain. |
| AT-HC-003-01 | partial | BLOCK denial and normal reservations pass. Exact3-request/1-available displayed shortage2 plus justified exception request need verification. |
| AT-HC-003-02 | passed | Native requester JSON saves with zero, negative and fractional quantities each fail; original normal draft, all capacity ledger terms and command/revision/event/opening counts remain unchanged. |
| AT-HC-004-01 | blocked | Positive Sector exception with exact shortage snapshot and ordinary-HR denial is not in the current executed suite. |
| AT-HC-004-02 | blocked | Independent CEO exception path exists in source but personal Sector-interest routing is not exercised; business beneficiary rules remain unresolved. |
| AT-HC-005-01 | partial | Multiple exact ledger conservation cases pass. Literal mixed occupied3/open2/reserved1 fixture and reserve2 arithmetic are not executed. |
| AT-HC-005-02 | passed | 20 concurrent HTTP quantity1 submissions against5 BLOCK seats produce5 reservations and15 controlled denials; no excess/negative capacity, cleanup reconciles. |
| AT-HC-005-03 | partial | Approved-parent amendment1to3 reserves onlydelta2. Pending-own-reservation2to3 delta1 wording is not the tested scenario. |
| AT-HC-006-01 | partial | BLOCK contention passes. Same shortage under WARN plus recorded exception authority still needs direct comparison and HR acceptance. |
| AT-HC-006-02 | partial | Frozen step/revision snapshots are exercised. Changing WARN/BLOCK or authority configuration while requests exist needs explicit tests. |
| AT-HC-007-01 | passed | Three accepted offers leave occupancy unchanged; each actual join transfers one open seat to occupied with matching dated assignment. Replays preserve original links and counts after parent completion. This is native sequential proof; new parity concurrent joining remains an additional unexecuted gate. |
| AT-HC-007-02 | partial | No Show/Withdrawn preserve vacancies and replay once with reason checks. Authorized joining correction, assignment reversal and history reconciliation remain unsupported; no fill void is claimed. |
| AT-REQ-001-01 | partial | Ordinary requester creation/read succeeds and out-of-scope access fails. Exact managerA1 create followed by B1 payload substitution is not executed. |
| AT-REQ-001-02 | partial | Manage-scope and revoked/read-only grants pass. Positive dated delegate and process/unit/interval boundaries remain. |
| AT-REQ-002-01 | partial | Native request values persist and form renders. Every HR-REC-F02 field round-trip plus matching printed values is not exercised. |
| AT-REQ-002-02 | passed | Separate immutable HR notes are excluded from requester detail/list, native form/timeline, request print, revision/event payloads and newly generated decision notifications. Requester note detail/create/print/export are denied. Noted request scope cannot move; native HR creation and requester HTTP denial passed. |
| AT-REQ-003-01 | passed | Two-location approved fixtures preserve2/1 quantities and linked native openings; additional3/2 fixture checks two distinct openings and per-line vacancies. |
| AT-REQ-003-02 | passed | Native requester save with a duplicate capacity/location/position line fails before reservation; original request, zero reservations/open slots and audit counts remain unchanged. |
| AT-REQ-004-01 | partial | Dated hierarchy traversal, vacant-level recorded skip and cycle rejection pass. Required HR notice for a skipped vacant level is not proven. |
| AT-REQ-004-02 | partial | Frozen step identity/revision and requester self-independence pass. Creator versus beneficiary policy requires HR decision and explicit coverage. |
| AT-REQ-005-01 | partial | Cairo date clock and dated hierarchy helpers pass. Authority-rule tomorrow/today resolution on either side of Cairo midnight is untested. |
| AT-REQ-005-02 | partial | Pending steps are stored and protected. Positive HR route-to-CEO and subsequent hierarchy change preserving principal require explicit execution. |
| AT-REQ-006-01 | partial | Approval, return, reduction and revoked-HR denial pass. HR rejection and positive CEO-request action at allowed/forbidden stages remain untested. |
| AT-REQ-006-02 | passed | Native altered payload/stale step/version denial plus20 simultaneous same-command manager and final-HR calls return identical outcomes and advance once. |
| AT-REQ-007-01 | passed | Exact recipient counters pass for submission, Manager/HR Approve/Reject/Return, HR priority edit and requester cancellation: 15 unique transitions and 15 command replays produce each intended requester notice once. This proves local outbox creation and deduplication, not external delivery. |
| AT-REQ-007-02 | partial | Local outbox identity/retry/failure/suppression pass and no external email occurs. A mail-sink adapter/result classification is not exercised. |
| AT-REQ-008-01 | passed | Return revision1 records its reason; requester edits/resubmits revision2 with new step identities. Requester, Manager and HR read byte-identical revision1 payload/steps; native revision save/delete fail for requester and Administrator, leaving originals unchanged. |
| AT-REQ-008-02 | passed | Return releases reservations to zero; requester revision resubmission reapplies exact new quantities and ledger reconciles at both points. |
| AT-REQ-009-01 | partial | Revision snapshots remain unchanged through return/edit and step identities persist. Assertions for exact policy/authority/all reviewed fields need full snapshot contract test. |
| AT-REQ-009-02 | passed | New shared snapshots explicitly allow only public request, line and step fields. Unknown pay/internal fields are excluded; requester snapshot/request exports denied. Historical snapshots are not retroactively scrubbed and need a separate reviewed migration if sensitive data was previously stored. |
| AT-REQ-010-01 | partial | Scoped native list and browser request/queue access pass; requester My Requests own-only versus manager/HR organizational lists need explicit comparison. |
| AT-REQ-010-02 | partial | Immutable event counts exist. Rendered timeline ordering, principal/time and delegated-action correspondence are not asserted. |
| AT-REQ-011-01 | partial | Linked approved1to3 top-up preserves openings and addsdelta2. Exact approved2to3 adds1 fixture and final-action replay need explicit execution. |
| AT-REQ-011-02 | blocked | Pending reduction is tested, not approved joined-floor3to2/1. Full HR-reason branch/type/date/spec amendment path remains incomplete. |
| AT-PRI-001-01 | passed | Hand-calculated Critical60 + age61days40 + overdue1day30 + inclusive pin100 =230, with exact factor breakdown; ten repeated evaluations are identical. |
| AT-PRI-001-02 | passed | Unauthorized requester and empty-reason HR pins fail without mutation; authorized HR pin records original requested priority Normal and live score20→120. Removing the pin leaves the prior immutable revision unchanged. The discovered first-pin before-score0 defect was fixed and the exact case reran successfully. |
| AT-BRD-001-01 | blocked | No executed Board-after-CEO ordering or Chairman/Vice identity fixture in current suite. |
| AT-BRD-001-02 | blocked | Private-file access checks pass generally. Board on-behalf missing-proof denial and unrelated-user proof access are not specifically exercised. |
| AT-VAC-001-01 | passed | Native two-line opening allocation plus20 concurrent final-HR same-command calls yield exactly one opening per approved line with no duplicate effects. |
| AT-VAC-002-01 | partial | Actual partial joining, full and mixed Filled/Closed completion, sequential replay counts and cancellation double-release pass. Exact parent completion notice count and per-location Cancelled variant remain unverified. |
| AT-VAC-002-02 | blocked | No executed authorized fill-void/reopen workflow and full ledger reconciliation on current code. |
| AT-VAC-003-01 | partial | One lead and two unique recruiters, scoped team and bulk assignment pass. Exactly one current responsible owner on every application is not proven. |
| AT-VAC-003-02 | passed | Scoped non-team recruiter is denied known candidate detail/list and mutation; read-only assigned recruiter cannot write. Applies to native boundary tested at recorded hash. |
| AT-VAC-004-01 | partial | Missing/disabled lead yields explicit HR-assignment fallback and intake denial; queue visibility exists. Automatic routing/task ownership no-orphan behavior remains. |
| AT-VAC-005-01 | partial | Disabled lead is detected and cannot intake; explicit fallback tested. Automatic moving of vacancy/tasks/applications to unassigned with history is not implemented/proven. |
| AT-VAC-005-02 | partial | Bulk two-location success, replay, stale/closed second-parent atomic rollback pass. Out-of-scope IDs in a mixed bulk request and disabled-owner reassignment need explicit execution. |
| AT-VAC-006-01 | partial | Native queue states and browser scoped approved openings pass; complete approved/pending/excluded-state/site-company list fixture still needed. |
| AT-AUD-001-01 | partial | Immutable snapshots/security events and replay counts pass; exact actor/principal/command/before-after coverage plus edit/delete attacks on each business audit type remain. |
| AT-AUD-001-02 | blocked | No HMAC chain or protected external latest-seal anchor; altered/reordered/truncated audit attacks cannot pass. |
| AT-AUD-002-01 | partial | Reason and authority guards exist for exercised actions. Every override/evidence-required route, including Board proof, is not exercised. |
| AT-AUD-002-02 | partial | User privilege changes and direct child/decision writes are blocked. Explicit ordinary System Manager decision attempts and reviewed Administrator operations remain incomplete. |
| AT-WAG-001-01 | partial | Implemented SLA/outbox jobs preserve hashes of 15 payroll/ledger tables with real payroll fixture records present. Future overdue-document automation is not implemented, so that clause remains unproved. |
| AT-WAG-001-02 | passed | Four ordinary recruitment role accounts are denied native wage mutations and nine payroll controller endpoints despite installed payroll modules; payroll fixture table hashes remain unchanged. |

Exact evidence paths, timestamps and commits for every case: [canonical results](../sprints/acceptance-results.json).
