# Organization implementation (Phase 2)

Native records live under Kandil HR. This implementation does not require a new company-wide backend.

## Operator path

1. An HR user with a company-wide manage grant creates **Kandil Organization Settings**, selecting enabled HR/Sector/CEO/Board authorities with appropriate roles.
2. Request **Kandil Position** creation through Structure Change. Position is distinct from Designation and links Company, Department and optional Branch. The final independent approval assigns a stable KPOS-##### code, creates the effective hierarchy and, when Branch is set, an empty capacity ledger. Existing external position codes are preserved through independently reviewed baseline imports. Direct Position creation is blocked on the parity site.
3. An authorized author creates **Kandil Structure Change** with a reason and effective date. Use Add Structure Change to select Create, Reparent, Resize or Close in the native dialog. Click Preview Changes and then Submit for Approval. Applicable managers review first, followed by the configured independent HR reviewer and independent CEO. These last two must differ from each other and from the author. Initial hierarchy setup has no existing manager chain and explicitly requires HR then CEO. Preview freezes a digest of hierarchy, assignments, positions and capacity counters. Intervening changes require a new preview.
4. Create **Kandil Position Assignment** linking an existing Employee and that employee's enabled User. Primary assignments count toward structural occupancy; Acting assignments resolve authority without double-counting seats. Dates are inclusive. End existing assignments rather than rewriting their identity.
5. Create **Kandil Grade Band** and **Kandil JD Revision** drafts. A different Sector Approver approves. Approved versions are immutable; weighted KPIs total 100, monitoring KPIs carry no weight, and competencies stay separate. Bilingual JD and worker-card view/PDF outputs are available; email distribution remains later work.
6. Use Reconcile Occupancy from Position to identify differences between dated Primary allocations and linked capacity occupied baselines. This reports mismatch without silently manufacturing employees or changing recruitment counters.

Example initial hierarchy:

```json
[
  {"action":"Reparent","position":"FACTORY-OPERATOR-001","parent_position":"FACTORY-MANAGER-001","authority":"Department Approval"},
  {"action":"Reparent","position":"FACTORY-MANAGER-001","authority":"Department Approval"}
]
```

A hierarchy row's authority describes **that position's occupant's approval authority**. Routing begins at the requested position's parent. Vacant parents are recorded as skipped and traversal continues; missing hierarchy is a blocking configuration error. More than one primary occupant requires a unique Acting authority or a dedicated head position. Terminal HR is explicit in Organization Settings, not inferred from an arbitrary employee.

Other operations: `{"action":"Resize","position":"...","structural":2}` and `{"action":"Close","position":"..."}`. Resize/Close currently require today's effective date; future scheduling deliberately fails rather than applying early. Resize updates its one linked capacity ledger under lock and cannot drop below occupied + reserved + open. Closing requires no current/future allocations, subordinate edges or capacity commitments.

## Reviewed import

Create Organization Import, select Positions, Hierarchy or Assignments and click Edit Import Rows to use a native editable table. Company is supplied by the batch and cannot be injected per row. Optional baseline reference records the provenance of reviewed existing data. A different Sector Approver reviews the current record version; a permitted HR user applies the reviewed digest. Same-batch retries return the original result; exact matching rows in later batches are Unchanged. Conflicting positions, cycles, overlapping primary allocations, acting-authority overlaps and excessive seats fail before writes. Dated baseline rows cannot begin in the future. Creating records captures an immutable structure snapshot and reports occupancy reconciliation. The native editable table and bounded CSV loader are available; XLSX parsing remains pending.

## Integration contract

`kandil_hr.organization.api.resolve_route(company, department, position, as_of=None)` returns:

- position, as_of, structure_revision digest
- steps: position, principal (User), authority, assignment. CEO/Board use dedicated Kandil CEO Approver and Kandil Board Approver roles.
- skipped: position, authority, reason
- exception_approver, ceo_approver, board_approver

Authority strings are Department Approval, Sector Approval, HR Approval, CEO Approval, Board Approval. Consecutive same-person steps remain explicit; the request command layer enforces its business policy and command/step identity. Route user principals must be enabled and hold the needed role. This resolver is internal, not anonymously exposed.

Foundation scope hooks must cover all nonchild organization DocTypes; Grade Band additionally needs sensitive scope. Company-wide snapshot/import/settings/structural requests require a broad company grant because their payload spans departments. All structural authorities need that manage grant before submission. Organization Settings owns the company principals; recruitment route records should store policy toggles and reject conflicting duplicate authority configuration. Add Position to Capacity as a unique optional Link and validate matching company, department, branch, designation and structural seats. Old pilot fixtures may remain unmapped outside parity enforcement.

## Tests and current limits

- `python -m unittest kandil_hr.organization.test_rules`: 10 pure rules tests covering future cycle detection, boundary dates, valid historical reversal, overlap, peak occupancy and competency totals.
- `bench --site kandil-parity.localhost execute kandil_hr.organization.integration_tests.run`: native synthetic fixture suite with an existing test Company. Explicit parity-only, rolls back all writes. Requires foundation schemas and hooks first.

Not claimed complete: full manpower planning, automatic Department/Job coding policy, hierarchy visualization and XLSX bulk file parsing, printed statutory templates, JD email distribution and manager review rounds, automatic future Create/Resize/Close execution, assignment transfer/exit workflow, employee/payroll spreadsheet adapters, production load or HR acceptance. No hierarchy/assignment/position deletion; preserve history.

## Root integration hooks

Register every `organization.permissions.HOOK_QUERIES` DocType with `organization.permissions.permission` plus its named query helper. Grade Bands require sensitive grants. Call `organization.capacity.validate_capacity(doc)` from the Capacity validator after numeric normalization and before final available calculation. This helper is parity-gated; it rejects changing/removing Position, direct resize, structural divergence and closed-position commitments.

Structure APIs: `preview_structure(name)`; `submit_structure(name, preview_hash, command_id, expected_version)`; `decide_structure(name, preview_hash, decision, step_id, command_id, expected_version, comment='')`. Decisions require the exact active step and current actor role/grant. Replay receipts are immutable inside the structural request. Same ID with changed payload fails; an exact replay returns the original outcome. Permission revocation still prevents receipt access. Approvals freeze the authority route; structural baseline changes invalidate approval and require rejection plus a fresh request. Outbox notifications are queued to the author and next authority transactionally.

## Structured JD and worker documents (ORG-003)

The frozen reference CHG-88/89/90 distinguishes responsibilities, performance indicators and competencies. New drafts use native child tables: 3–16 responsibilities, indicative level bands and a written reason above the band; Weighted KPIs sum to 100 and Monitoring KPIs have no weight. Competencies carry proficiency, behavior and a measurement description independently. Old narrative and competency-weight fields remain for approved-history compatibility; they are not silently reinterpreted as new KPIs.

Designation is the job identity; new revision numbering follows Company + Designation across its positions. Position remains an anchor for conservative native read permissions. Editing and approval require company-wide management authority because the description serves multiple positions. Printed locations and direct-manager positions are derived from current active matching Positions and filtered by the reader's scope. Broader discovery by a user who can see a sibling Position but cannot read the anchor remains an explicit sharing limitation.

Saved JD forms have a Documents menu for Arabic/English JD view, print and PDF download, plus worker cards. The authenticated document endpoint applies native read/print and foundation scope checks. Outputs exclude grade/salary fields. Drafts are clearly marked, certificates are included, and worker cards show KPI names without formula/weight and a draft receipt. Worker cards use readable A4 styling; the native export test verifies the supplied synthetic samples fit one page. Arbitrarily long real content can span pages rather than being clipped and still needs operator review. The receipt wording needs business/legal approval before employee issuance.

The output template is versioned code in `organization/documents.py`; it does not need a public website or a second frontend. Email distribution, delivery auditing, manager review rounds, grade-derived job levels and organization-wide competency-library management remain pending.

## CSV loading into a reviewed baseline

Save a Draft Organization Import, select its kind, then choose **Load CSV**. Read a local CSV file or paste its text, choose **Validate CSV**, inspect the normalized preview, then choose **Load Rows into Draft**. Loading replaces only the draft rows; save the draft and obtain independent review before Apply. The preview never inserts Positions, Hierarchy or Assignments and never marks the batch Reviewed.

CSV column names are the exact field names shown in the dialog. Positions require `position_code,title,department,designation`; Hierarchy requires `position,authority,valid_from`; Assignments requires `position,employee,valid_from`. Optional fields follow the native table. Dates are ISO `YYYY-MM-DD`, structural seats positive integers, enum values retain canonical English API codes. Arabic cell content and UTF-8 BOM are supported. The input is CSV text only: no file path, URL fetch, workbook macro, formula execution or external upload.

Engineering limits: 1 MiB, 1000 nonempty rows, 8192 characters per cell; strict UTF-8, header/schema checks, calendar dates and formula-looking input rejection. Convert spreadsheet formulas to literal values before exporting. Existing organization rules still validate company links, cycles, date intervals and allocations. Duplicate rows/batches remain subject to the reviewed import's existing idempotency rules. Raw Excel/XLSX parsing remains pending.

## Complete assignment matching and native units

For an Assignments import, **Reconcile Assignments** lists every unmatched Employee and Position reference by input row. CSV validation shows the same complete report and blocks loading unmatched rows. This is company-scoped identity reconciliation: names from another company are unmatched, and no title-based guess is made. Independent Review and Apply remain mandatory; a repeated accepted batch does not duplicate a dated allocation. Payroll-file parsing remains a separate adapter.

A **Kandil Sector Approver** with a company-wide management grant can create or update native **Department** records. Enter **Unit Change Reason** with each meaningful change; server validation and an immutable security event retain actor, before/after values and reason. Ordinary requesters can read their own unit through an active grant, including a branch-scoped grant, but cannot maintain units. Company changes are prohibited, and disabling a unit with active children or Positions is blocked. Reviewed organization imports use their separate audited transition; trusted Administrator CLI setup remains a documented fixture/installation exception.

Voided joining assignments retain their original IDs, dates and allocation type. Readonly reversal metadata records the reason, actor and timestamp. Current occupancy, hierarchy authority and overlap calculations exclude voided episodes; explicit historical reads retain them. Further native edits are rejected, and an Employee marked as a voided joining cannot receive a new Position Assignment. The HR joining-reversal command supplies the authorization and eligibility checks; setting flags directly is not an operator workflow.
