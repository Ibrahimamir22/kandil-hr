# Requirements baseline / سجل المتطلبات

Pinned reference: `v0.50.0 / 7824be24292c4743b4005e14e2df540786cfe167`.

**Scope: P0–P3 = the first four phases. P4 candidates is the next phase.**

This register preserves all 98 original IDs. “Built” in the source describes the Apps Script reference, not our Frappe delivery. No case below has been executed by this document. Runtime evidence belongs in a dated execution report. HR acceptance is pending.

## First-four-phase acceptance cases

### ACC-001 — OTP login, personal Gmail; spreadsheets owner-only

Phase: P1 · Source claim: Built

Source: `Auth.gs`; sheets protected (`protectAllSheets_`); authenticator app added in 0.15 — `harness`, `phase16`. 0.37: authenticator for every user (CEO exempt), 12-hour / 7-day sessions, idle lock on the server, go-live button, weekly backups, incident log (CHG-79, CHG-82) — `phase37`

Target: Frappe provides user accounts and OTP-app authentication. Reproduce the exact CEO exception, trusted-device, session, idle-lock and incident policies separately. Google owner-only Sheet protection is not the new storage model.

- [ ] AT-ACC-001-01: Enabled synthetic user authenticates; disabled user and expired session fail on direct API as well as UI.
- [ ] AT-ACC-001-02: Authenticate from new device; exactly one alert is queued. Prove idle expiry and MFA before marking exact authentication parity.

### ACC-002 — AuthService swappable for Workspace identity

Phase: P1 · Source claim: Built

Source: Sign-in lives in `Auth.gs` / `Security.gs` only; services take a session context

Target: Frappe has its own authentication system. Connect the selected identity provider and define account lifecycle; the Apps Script AuthService cannot be copied unchanged.

- [ ] AT-ACC-002-01: Identity adapter resolves one external subject to one Frappe User; conflicting mapping is rejected.
- [ ] AT-ACC-002-02: Provider unavailable cannot result in an Administrator/service-account fallback. No external provider is implied by native password login.

### ACC-003 — Role and scope resolved on the server only

Phase: P1 · Source claim: Built

Source: `Perm.gs`, role check in `api()`; scope per service — all suites. 0.36: separation of duties — CEO queue for top roles / heads, CEO trusted phone + PIN, two-person rule, access review (CHG-74…78) — `phase36`, `phase4`, `ui20`, `ui26`

Target: Roles and server permissions are available. Kandil's position scopes, CEO phone/PIN route, two-person restrictions and access review need explicit server rules and tests.

- [ ] AT-ACC-003-01: Create equal-looking records in Company A/B and branches A1/A2; permitted role sees only configured scope in list, detail, link search, export, print and private attachments.
- [ ] AT-ACC-003-02: Requester, beneficiary and acting principal cannot bypass self-interest rules; disabled principal or revoked delegation fails immediately.

### ORG-001 — Job, Position, Employee, Vacancy as separate entities

Phase: P2 · Source claim: Built

Source: `JOBS` / `POSITIONS` / `EMPLOYEES` / `VACANCIES` — `harness`, `phase4`

Target: Employee, Department, Designation and Job Opening exist. Add Kandil Position as an occupied or vacant organizational seat, distinct from a job title and recruitment opening.

- [ ] AT-ORG-001-01: Create two Positions with same Designation; each retains distinct identity, company, unit and capacity.
- [ ] AT-ORG-001-02: One Employee assignment references one Position and a dated episode; changing the job title never silently moves occupancy.

### ORG-002 — Versioned organization; closed positions kept

Phase: P2 · Source claim: Partial

Source: Unit / position history and closing (never delete) — `orgadmin`. **Missing:** full structure version snapshots (`Structural.gs`: "come later")

Target: Document change history is available. Full organization snapshots and dated structural versions require a model; the source repo itself marks these incomplete.

Precedence: Include full dated organization snapshots as an explicit extension beyond the source’s Partial status.

- [ ] AT-ORG-002-01: Capture organization revision R1, change a unit in R2, then render both independently with their original relationships.
- [ ] AT-ORG-002-02: Closing a position preserves its history and blocks new allocation; deleting a referenced historical record fails.

### ORG-003 — Structured, versioned JD with view / print / PDF / email

Phase: P2 · Source claim: Built

Source: Versions, approval, view, print / PDF — `phase5`. E-mail (0.28): the approved version in the mail + PDF, to portal users only (owner decision, no candidates), up to 10, audited — `phase28`, `ui32`. 0.42.1: responsibilities by job level (CHG-88), 3 … 16, a reason above the band. 0.42.2: weighted / monitoring KPIs, weights add up to 100 (CHG-89). 0.43: worker card, certificates, locations from the structure (CHG-90) — `phase42`, `ui8`

Target: Job descriptions and print facilities are building blocks. Structured approved JD versions, responsibility bands, worker cards and validated KPI weights need custom records and logic.

- [ ] AT-ORG-003-01: Create draft JD revision; approve it, then attempt API edits and deletion; approved content stays unchanged.
- [ ] AT-ORG-003-02: Weighted KPI values 60+40 pass; 60+30 fail, monitoring-only metrics do not inflate total. Responsibilities outside grade band need a reason.
- [ ] AT-ORG-003-03: Print approved AR/EN revision with no clipped Arabic; mailing to external candidate or more than 10 portal users fails. Actual provider delivery remains separate.

### ORG-005 — Delegation / acting authority with dates and history

Phase: P3 · Source claim: Built

Source: `DELEGATIONS` with dates; used by approvals — `phase7`. 0.36: delegation by process (approvals / unit's work), the CEO's authority only after his approval (CHG-76) — `phase36`

Target: The exact dated delegation by process and CEO-approved delegation are additional business rules, not implied by ordinary workflow roles.

- [ ] AT-ORG-005-01: 90 inclusive calendar-day delegation passes; 91 days and self-delegation fail.
- [ ] AT-ORG-005-02: Request approval delegation cannot grant unrelated transfers/probation; revocation blocks next action and preserves old decisions.
- [ ] AT-ORG-005-03: CEO authority delegation remains inactive until recorded CEO approval; changing scope creates a new version.

### ORG-006 — Structural change: chain, HR review, CEO approval, Position ID on approval

Phase: P3 · Source claim: Built

Source: `Structural.gs` (new-position requests) — `phase2`

Target: Implement a structural-change request linked to positions and use workflow states for approvals. Create the Position only after the authorized final decision.

- [ ] AT-ORG-006-01: New-position request creates no Position before final authorized CEO decision; approval creates exactly one stable Position ID.
- [ ] AT-ORG-006-02: Return or reject records reason; replay final approval does not create a second Position.

### ORG-007 — Structure maintained from the portal

Phase: P2 · Source claim: Built

Source: `OrgAdmin.gs` — `orgadmin`

Target: Standard masters can be maintained through forms. The proposed Kandil Position and hierarchy editor need their own interface and permissions.

- [ ] AT-ORG-007-01: Authorized structure owner creates/updates unit via native UI; ordinary requester cannot modify the same record through REST.
- [ ] AT-ORG-007-02: Reparent A under its descendant C fails; cross-company parent assignment fails.

### ORG-008 — Coding of units and jobs, automatic codes

Phase: P2 · Source claim: Built

Source: `Import.gs`, job families — `harness`, `orgadmin`

Target: Naming series and custom code/family fields can implement agreed coding. Existing Kandil IDs must be preserved during import.

- [ ] AT-ORG-008-01: Import external code K-001 twice; second run updates/no-ops deterministically without duplicate units/jobs/positions.
- [ ] AT-ORG-008-02: Conflicting external IDs produce a reconciliation error; original IDs remain searchable and exportable.

### ORG-009 — Multi-company (4 legal entities + sister companies)

Phase: P2 · Source claim: Partial

Source: Legal entities recorded for privacy notices — `phase15`. **Missing:** separate companies with their own top position for approvals (owner: later)

Target: Company records provide a stronger base for multiple legal entities. Per-company top approver and record isolation still need explicit configuration and custom routing.

Precedence: Include isolated multi-company HR routes as an explicit extension beyond the source’s Partial status.

- [ ] AT-ORG-009-01: Two legal entities have independent top approvers; A request never resolves B chief by matching a title.
- [ ] AT-ORG-009-02: Unauthorized A user cannot read B record by name, report, link autocomplete or attachment URL.

### HC-001 — Structural HC = 1 per position until a manpower plan

Phase: P2 · Source claim: Built

Source: `Structural_HC` default 1 — `harness`

Target: Staffing Plan stores quantities by designation. A one-seat default on each Kandil Position needs the Position model.

- [ ] AT-HC-001-01: New position defaults structural capacity to 1; explicitly configured capacity 3 remains 3.
- [ ] AT-HC-001-02: Designation count never substitutes for approved position capacity.

### HC-002 — Occupied HC by HR; payroll-sheet import later

Phase: P2 · Source claim: Partial

Source: Occupied HC counted from the employee records — `phase4`. **Missing:** payroll-sheet import (owner: later, open item 2)

Target: Employee records and imports provide the base. Count occupancy against positions; map and reconcile any payroll-sheet import. The repo's payroll import is partial.

Precedence: Separate employee/position occupancy from a later payroll-file import. Import reconciliation is not wage processing.

- [ ] AT-HC-002-01: Two active dated assignments produce occupied=2; closing one episode changes count on effective date only.
- [ ] AT-HC-002-02: Import preview reports every unmatched Employee/Position; repeating accepted import does not double occupancy. Payroll file adapter is separately pending.

### HC-003 — Current / available HC shown as guidance; any number requestable

Phase: P3 · Source claim: Built

Source: Request form — `phase2`

Target: Show position-level availability and permit over-capacity requests without accidentally applying the standard offer vacancy block.

- [ ] AT-HC-003-01: Request quantity 3 with available1 is representable, shows shortage2 and demands justification under the selected exception policy.
- [ ] AT-HC-003-02: Negative, fractional and zero quantity fail with no ledger mutation.

### HC-004 — HC exception approved by the HR Sector Manager only (CHG-40/2)

Phase: P3 · Source claim: Built

Source: Separate HC-exception step — `phase7`

Target: Create a separate headcount-exception decision with HR Sector Manager authority and an auditable result.

- [ ] AT-HC-004-01: Configured Sector authority approves exception with captured requested, available, excess, reason and principal; ordinary HR role fails.
- [ ] AT-HC-004-02: If the Sector authority is personally concerned, route to independent CEO decision instead of automatic self-approval.

### HC-005 — Available = Structural − Occupied − Open; no double counting

Phase: P3 · Source claim: Built

Source: 0.40: headcount asked for by requests still in approval is reserved — another request for the same position sees it as taken (a request never reserves against itself); the request view shows it — `phase40`, before `phase2`, `phase18`

Target: Implement a transactional reservation ledger for pending requests, open vacancies and occupancy. Standard offer vacancy validation counts submitted offers; it is a different calculation.

Precedence: Use the later reserved-capacity rule (v0.40/§5); the short heading omits Reserved. Display Structural − Occupied − Open − Reserved; exclude the current request’s own reservation when evaluating its amendment.

- [ ] AT-HC-005-01: Structural10 occupied3 open2 reserved1 gives available4. Reserving2 gives available2.
- [ ] AT-HC-005-02: Twenty concurrent quantity1 submissions against five available produce at most five normal reservations; remaining outcomes follow configured exception/block policy with no negative unapproved capacity.
- [ ] AT-HC-005-03: Amending own reservation of2 to3 adds delta1; never charges old2 twice.

### HC-006 — HC checks warn-only until switched to block

Phase: P3 · Source claim: Built

Source: `HC_ENFORCEMENT_MODE` — `phase2`

Target: Provide a Kandil warning-versus-block setting across the full request lifecycle. The standard vacancy check does not express this complete policy.

- [ ] AT-HC-006-01: Run same shortage with WARN and BLOCK settings; expected outcome and exception route are explicit and audited.
- [ ] AT-HC-006-02: Configuration change affects future evaluations only; never silently grants authority or overwrites completed decisions.

### HC-007 — Filled HC counts actual joiners only

Phase: P3 · Source claim: Built

Source: Joined on actual joining — `phase14`

Target: Occupancy must change on actual joining, not offer acceptance or submission. Define cancellations, no-shows and reversals consistently.

- [ ] AT-HC-007-01: Offer accepted causes occupied delta0; actual joining causes occupied+1 and open-1 exactly once.
- [ ] AT-HC-007-02: No-show leaves vacancy unfilled; authorized joining correction reconciles occupancy and recorded history.

### REQ-001 — Manager requests only positions in his scope, server-side

Phase: P3 · Source claim: Built

Source: `reqScopePositions_` — `phase2`

Target: Use server permissions but derive allowed positions from Kandil's manager hierarchy, including delegation and direct API calls.

- [ ] AT-REQ-001-01: Manager of A1 requests A1 position successfully; changing payload to B1 is rejected server-side.
- [ ] AT-REQ-001-02: Eligible dated delegate can act only within delegated unit/process/effective interval.

### REQ-002 — Current form fields kept (HR-REC-F02)

Phase: P3 · Source claim: Built

Source: `REQUEST_LINES`, skills, replacements — `phase2`

Target: Job Requisition is a useful base. Add the agreed HR-REC-F02 fields; related multi-line and routing behavior is covered separately.

- [ ] AT-REQ-002-01: Persist each HR-REC-F02 field in a native request and reload/print the same values: position, locations, quantities, need date, employment type, replacements, skills and justification.
- [ ] AT-REQ-002-02: HR internal notes remain absent from requester responses, notifications, timeline and requester print.

### REQ-003 — One request, several locations via request lines

Phase: P3 · Source claim: Built

Source: `phase2`

Target: The standard requisition has one designation and department, not Kandil's multiple location lines. Add a parent request with lines and linked openings.

- [ ] AT-REQ-003-01: One request contains A quantity2 and B quantity1; final approval creates one linked opening per location with exact approved quantities.
- [ ] AT-REQ-003-02: Duplicate location/position line is rejected or explicitly consolidated before any reservation.

### REQ-004 — Chain from structure; missing level skipped; self-approval blocked

Phase: P3 · Source claim: Built

Source: `Workflow.gs` — `phase2`

Target: Frappe has workflow conditions and an owner-based self-approval check. Dynamic hierarchy traversal, missing-level skips and requester-versus-creator checks need added logic.

- [ ] AT-REQ-004-01: Resolve chain from dated Position hierarchy, skip a vacant head with recorded reason and HR notice; no infinite traversal.
- [ ] AT-REQ-004-02: Requester/creator/beneficiary policy determines independent route; no blind self-approval. Submission freezes step identities for that revision.

### REQ-005 — CEO by HR routing, dated CEO rules, Sector Manager → CEO

Phase: P3 · Source claim: Built

Source: Approval rules screen — `phase2`

Target: Implement dated CEO routing rules and resolved approver records; role-based workflow transitions alone are insufficient.

- [ ] AT-REQ-005-01: Rule effective tomorrow does not affect today submission; test either side of effective date in Cairo.
- [ ] AT-REQ-005-02: HR may route to CEO with reason; later hierarchy change cannot replace a pending principal without explicit audited reroute.

### REQ-006 — HR Manager approve / reject / return / edit / send to CEO

Phase: P3 · Source claim: Built

Source: `phase2`

Target: Configure approval/return states and implement the special HR edit/reroute actions with permissions and revision rules.

- [ ] AT-REQ-006-01: HR approves, rejects, returns with reason, edits an allowed field or requests CEO action only at authorized stage.
- [ ] AT-REQ-006-02: Double-click/time-out replay with same command returns same result; stale step/version cannot advance next authority.

### REQ-007 — Requester notified of every step, rejection and HR edit

Phase: P3 · Source claim: Built

Source: `notify_` — `phase2`

Target: Configure notifications for each agreed workflow transition and edit. Custom workflow actions must trigger those events consistently.

- [ ] AT-REQ-007-01: Submit, each decision, HR edit and cancellation each create the intended requester notice once.
- [ ] AT-REQ-007-02: Notification retry reuses outbox identity; a mail-sink result is labeled captured, never sent externally.

### REQ-008 — Return for revision with timestamps and versions

Phase: P3 · Source claim: Built

Source: `REQUEST_VERSIONS` — `phase2`

Target: Use history as a base, but preserve formal request revisions, return reasons and timestamps as business records.

- [ ] AT-REQ-008-01: Return revision1 with reason; requester edits and resubmits revision2; revision1 payload/steps remain readable and immutable.
- [ ] AT-REQ-008-02: Reservations are released/reapplied by the documented state policy and reconcile before and after resubmission.

### REQ-009 — Approval snapshot of what each approver saw

Phase: P3 · Source claim: Built

Source: `Snapshot_JSON` on each step — `phase2`

Target: Store an immutable business snapshot linked to each approval. A general document diff is not the exact payload that an approver saw.

- [ ] AT-REQ-009-01: Approver snapshot contains exact revision, quantities, policy and authority visible at decision; later request edit changes none of it.
- [ ] AT-REQ-009-02: Snapshot audience excludes HR-internal/pay fields from unauthorized readers and exports.

### REQ-010 — Request timeline and My Requests

Phase: P3 · Source claim: Built

Source: `EVENTS`, «طلباتي» — `phase2`

Target: Filtered lists, ownership filters and document timelines provide the base for My Requests. Configure visibility and displayed events.

- [ ] AT-REQ-010-01: Requester My Requests includes own requests only; authorized manager/HR list follows organizational scope.
- [ ] AT-REQ-010-02: Timeline ordering, actor, principal and time match the immutable decision events, including delegated action.

### REQ-011 — Change request and reapproval for material post-approval changes

Phase: P3 · Source claim: Built

Source: HR edits before approval are versioned and notified. After approval (0.28): owner decision — only a headcount **increase** goes back to approval, as a linked request through the normal chain that tops up the same vacancy; date, specs, priority, employment type, branch and decreases are recorded by HR with a reason as amendment versions — `phase28`, `ui32`

Target: Implement linked change requests: increases reapprove and top up the same vacancy; other approved changes need reasons and amendment versions.

- [ ] AT-REQ-011-01: Increase approved2 to3 uses linked reapproval and adds1 to existing opening only after approval.
- [ ] AT-REQ-011-02: Decrease approved3 to2 with joined2 passes and releases1; decrease to1 fails. Branch/type/date/spec changes require HR reason and revision.

### PRI-001 — Requested priority / HR classification / dynamic score / override

Phase: P3 · Source claim: Built

Source: `PRIORITY_WEIGHTS`, pin — `phase2`

Target: Add requested priority, HR classification, scored factors and controlled override/pin with recalculation and audit.

- [ ] AT-PRI-001-01: Known weight fixture yields hand-calculated score; repeated recalculation is deterministic.
- [ ] AT-PRI-001-02: Only permitted HR role overrides/pins with reason; original requested priority and score remain recorded.

### BRD-001 — Board approval (Chairman or Vice) after the CEO

Phase: P3 · Source claim: Built

Source: `SEND_BOARD`, on-behalf recording — `phase2`, `phase7`. 0.36: on-behalf needs a proof file (CHG-78) — `phase36`, `ui4`

Target: Add board routing after CEO and required evidence for on-behalf approval. Generic workflow does not supply this evidence policy.

- [ ] AT-BRD-001-01: Board step cannot be completed before required CEO decision; Chairman or authorized Vice action is captured.
- [ ] AT-BRD-001-02: On-behalf Board approval without private proof fails; proof is inaccessible to unrelated users.

### VAC-001 — One vacancy per location line

Phase: P3 · Source claim: Built

Source: `phase2`

Target: Generate a linked Job Opening or custom vacancy per request location line, preserving parent IDs and approved quantities.

- [ ] AT-VAC-001-01: Replaying final request approval preserves one opening per line; no duplicate opening even under concurrent callbacks.

### VAC-002 — Partial fill; request closes fully or partially

Phase: P3 · Source claim: Built

Source: 0.40: the request closes by itself («Closed») when all its vacancies are filled, closed or cancelled, and opens again when a fill is voided; event + requester told — `phase40`, before `phase2`, `phase14`

Target: Standard opening states are Open/Closed. Partial fills, automatic parent closure and reopening on voided fills require coordinated state logic.

- [ ] AT-VAC-002-01: Partial fill leaves correct remainder; when all openings are filled/closed/cancelled parent closes once and notifies once.
- [ ] AT-VAC-002-02: Authorized fill void reopens parent when required and reconciles all ledger terms.

### VAC-003 — Several recruiters per vacancy; lead; one owner per application

Phase: P3 · Source claim: Built

Source: `VACANCY_RECRUITERS`, application owner — `phase2`, `phase8`

Target: Assignments provide a base. Add lead recruiter, recruiter team and accountable application owner with their distinct permissions.

- [ ] AT-VAC-003-01: Two recruiters may belong to vacancy team with one lead; each application has exactly one current responsible owner.
- [ ] AT-VAC-003-02: Non-team user cannot gain candidate access merely by knowing vacancy ID.

### VAC-004 — Missing recruitment roles skipped with record

Phase: P3 · Source claim: Built

Source: Fallback to HR; skip reason — `phase2`

Target: Implement deterministic HR fallback when roles are missing and record the skipped role and reason.

- [ ] AT-VAC-004-01: Missing recruitment assignee produces HR fallback and a visible skip reason; no orphaned work or guessed user.

### VAC-005 — Unassigned work queue and bulk reassignment

Phase: P3 · Source claim: Built

Source: v0.33 review: a deactivated recruiter's work did not return to «not assigned» — fixed in v0.34 (`phase34`); bulk reassignment built in 0.28

Target: Add the exact unassigned queue and reassignment behavior when a recruiter is disabled; test open tasks, applications and vacancies together.

- [ ] AT-VAC-005-01: Disable recruiter with open vacancy/tasks/applications; affected ownership moves to unassigned while history remains.
- [ ] AT-VAC-005-02: Bulk reassignment accepts authorized IDs only, rejects out-of-scope IDs and produces itemized result without silent partial loss.

### VAC-006 — Recruitment screen listing all approved requests / vacancies

Phase: P3 · Source claim: Built

Source: «الشواغر» — `phase2`

Target: Configure approved-request and vacancy lists/reports, filters and permissions against the chosen data model.

- [ ] AT-VAC-006-01: Approved and pending fixtures exist; recruitment list shows approved items and allowed vacancy states only, respecting company/site scope.

### AUD-001 — Audit: who, what, when, before, after

Phase: P1 · Source claim: Built

Source: `AUDIT_LOG`, `auditDiff_` — all suites; 0.49 (CHG-106): every row sealed and chained, checked daily — `phase53`

Target: Frappe Version provides change differences. The repo adds HMAC-sealed chained audit rows; reproducing that tamper-evidence needs separate design, key control and verification jobs.

- [ ] AT-AUD-001-01: Decision records actor, acting principal, before/after, exact command and timestamp; ordinary APIs cannot edit/delete it.
- [ ] AT-AUD-001-02: For tamper-evident parity: detect altered payload, reordered row and removed tail using protected external anchor; an immutable DocType alone does not pass this case.

### AUD-002 — Controlled overrides instead of admin bypass

Phase: P1 · Source claim: Built

Source: HC exception, waivers, on-behalf, all with reason and audit — `phase7`, `phase10`, `phase14`

Target: Model each exception explicitly with authorized role, reason and audit. Framework Administrator privileges are not the repo's controlled business-override policy.

- [ ] AT-AUD-002-01: Every allowed override requires an explicit action, authorized role, reason and evidence when required.
- [ ] AT-AUD-002-02: Calling ordinary save as System Manager cannot fabricate a completed business decision. Administrator operational access is separately logged and reviewed.

### WAG-001 — No wage or payroll action anywhere

Phase: P1 · Source claim: Built

Source: Portal records and prints notices only (payroll notice, salary-items notice) — `phase14`, `phase21`

Target: Keep payroll actions out of recruitment/document workflows and disable unneeded access. HRMS has payroll functionality, unlike this repo; do not enable deductions through document-compliance automation.

Precedence: Keep compensation estimates and follow-up notices separate from payroll execution. Older STOP labels must not become wage-stopping operations.

- [ ] AT-WAG-001-01: Run overdue-document/recruitment jobs with payroll fixture present; zero Salary Slip/Payroll Entry/deduction/payment changes occur.
- [ ] AT-WAG-001-02: Recruitment roles cannot reach wage mutation endpoints merely because HRMS payroll modules are installed.

## Deferred IDs remain in scope

All remaining IDs and assigned phases are preserved in `requirements-baseline.json`; they are not implementation commitments for P0–P3.
