# Requirements status — Blueprint v2.3 §29

Blueprint v2.3 (`Kandil_Egypt_Recruitment_System_Master_Blueprint_v2.3.pdf`, §29) carries these statuses. This file records the actual state of the code, checked requirement by requirement against `src/` and the tests in `tests/` (as of **v0.34.0**, 2026-10-09, kept current to **v0.50.0**; corrected after the v0.33 review — 10 requirements marked Built were partial). Carry it into the next blueprint version and keep it current with each release (blueprint §30, change control rule 3).

| Status | Meaning |
|---|---|
| **Built** | Rule, data, permission, workflow, screen and audit exist (blueprint §28) and a server test covers it |
| **Partial** | Works, but part of the requirement is missing or built differently — see the note |
| **Not built** | Planned for a phase that has not started |
| **Later** | Deferred by an owner decision |

Tests are in `tests/` and run in CI (`node tests/<file>.js`).

## Summary

| Status | Count |
|---|---|
| Built | 94 |
| Partial | 3 |
| Not built | 0 |
| Later | 1 |
| **Total** | **98** |

## Access, UX, organization

| ID | Requirement (short) | Status | Version | Evidence / note |
|---|---|---|---|---|
| ACC-001 | OTP login, personal Gmail; spreadsheets owner-only | Built | 0.2 · 0.15 · 0.37 | `Auth.gs`; sheets protected (`protectAllSheets_`); authenticator app added in 0.15 — `harness`, `phase16`. 0.37: authenticator for every user (CEO exempt), 12-hour / 7-day sessions, idle lock on the server, go-live button, weekly backups, incident log (CHG-79, CHG-82) — `phase37` |
| ACC-002 | AuthService swappable for Workspace identity | Built | 0.2 | Sign-in lives in `Auth.gs` / `Security.gs` only; services take a session context |
| ACC-003 | Role and scope resolved on the server only | Built | 0.2 · 0.36 | `Perm.gs`, role check in `api()`; scope per service — all suites. 0.36: separation of duties — CEO queue for top roles / heads, CEO trusted phone + PIN, two-person rule, access review (CHG-74…78) — `phase36`, `phase4`, `ui20`, `ui26` |
| ACC-004 | One login shared with the Performance Appraisal portal | Later | — | Owner: later phase |
| UX-001 | Same design and spirit as the Performance Appraisal portal | Built | 0.2–0.15 · 0.42 | Greeting, «المطلوب منك», idle lock, remember-me, guide. 0.42: new look (CHG-87) — section colours, inbox home with filters, global search checked per kind on the server, stage board with drag-to-move, tabbed candidate file, guided offer steps — `phase42`, `ui43` |
| ORG-001 | Job, Position, Employee, Vacancy as separate entities | Built | 0.2 · 0.5 | `JOBS` / `POSITIONS` / `EMPLOYEES` / `VACANCIES` — `harness`, `phase4` |
| ORG-002 | Versioned organization; closed positions kept | Partial | 0.2.1 | Unit / position history and closing (never delete) — `orgadmin`. **Missing:** full structure version snapshots (`Structural.gs`: "come later") |
| ORG-003 | Structured, versioned JD with view / print / PDF / email | Built | 0.6 · 0.28 · 0.42.1 | Versions, approval, view, print / PDF — `phase5`. E-mail (0.28): the approved version in the mail + PDF, to portal users only (owner decision, no candidates), up to 10, audited — `phase28`, `ui32`. 0.42.1: responsibilities by job level (CHG-88), 3 … 16, a reason above the band. 0.42.2: weighted / monitoring KPIs, weights add up to 100 (CHG-89). 0.43: worker card, certificates, locations from the structure (CHG-90) — `phase42`, `ui8` |
| ORG-004 | Only HR Sector Manager changes grade, salary, benefits, conditions | Built | 0.5.1 · 0.13 | Grade and pay tables restricted (`Services.gs`, `payEditRoles_`) — `phase13` |
| ORG-005 | Delegation / acting authority with dates and history | Built | 0.8.1 · 0.36 | `DELEGATIONS` with dates; used by approvals — `phase7`. 0.36: delegation by process (approvals / unit's work), the CEO's authority only after his approval (CHG-76) — `phase36` |
| ORG-006 | Structural change: chain, HR review, CEO approval, Position ID on approval | Built | 0.2 | `Structural.gs` (new-position requests) — `phase2` |
| ORG-007 | Structure maintained from the portal | Built | 0.2.1 | `OrgAdmin.gs` — `orgadmin` |
| ORG-008 | Coding of units and jobs, automatic codes | Built | 0.2.2 | `Import.gs`, job families — `harness`, `orgadmin` |
| ORG-009 | Multi-company (4 legal entities + sister companies) | Partial | 0.14.1 | Legal entities recorded for privacy notices — `phase15`. **Missing:** separate companies with their own top position for approvals (owner: later) |

## Headcount and requests

| ID | Requirement (short) | Status | Version | Evidence / note |
|---|---|---|---|---|
| HC-001 | Structural HC = 1 per position until a manpower plan | Built | 0.2 | `Structural_HC` default 1 — `harness` |
| HC-002 | Occupied HC by HR; payroll-sheet import later | Partial | 0.5 | Occupied HC counted from the employee records — `phase4`. **Missing:** payroll-sheet import (owner: later, open item 2) |
| HC-003 | Current / available HC shown as guidance; any number requestable | Built | 0.2 | Request form — `phase2` |
| HC-004 | HC exception approved by the HR Sector Manager only (CHG-40/2) | Built | 0.8.1 | Separate HC-exception step — `phase7` |
| HC-005 | Available = Structural − Occupied − Open; no double counting | Built | 0.2 · 0.40 | 0.40: headcount asked for by requests still in approval is reserved — another request for the same position sees it as taken (a request never reserves against itself); the request view shows it — `phase40`, before `phase2`, `phase18` |
| HC-006 | HC checks warn-only until switched to block | Built | 0.2 | `HC_ENFORCEMENT_MODE` — `phase2` |
| HC-007 | Filled HC counts actual joiners only | Built | 0.14 | Joined on actual joining — `phase14` |
| REQ-001 | Manager requests only positions in his scope, server-side | Built | 0.2 | `reqScopePositions_` — `phase2` |
| REQ-002 | Current form fields kept (HR-REC-F02) | Built | 0.2 | `REQUEST_LINES`, skills, replacements — `phase2` |
| REQ-003 | One request, several locations via request lines | Built | 0.2 · 0.4.1 | `phase2` |
| REQ-004 | Chain from structure; missing level skipped; self-approval blocked | Built | 0.2 | `Workflow.gs` — `phase2` |
| REQ-005 | CEO by HR routing, dated CEO rules, Sector Manager → CEO | Built | 0.2 · 0.2.3 | Approval rules screen — `phase2` |
| REQ-006 | HR Manager approve / reject / return / edit / send to CEO | Built | 0.2 | `phase2` |
| REQ-007 | Requester notified of every step, rejection and HR edit | Built | 0.2 | `notify_` — `phase2` |
| REQ-008 | Return for revision with timestamps and versions | Built | 0.2 | `REQUEST_VERSIONS` — `phase2` |
| REQ-009 | Approval snapshot of what each approver saw | Built | 0.2 | `Snapshot_JSON` on each step — `phase2` |
| REQ-010 | Request timeline and My Requests | Built | 0.2 | `EVENTS`, «طلباتي» — `phase2` |
| REQ-011 | Change request and reapproval for material post-approval changes | Built | 0.2 · 0.28 | HR edits before approval are versioned and notified. After approval (0.28): owner decision — only a headcount **increase** goes back to approval, as a linked request through the normal chain that tops up the same vacancy; date, specs, priority, employment type, branch and decreases are recorded by HR with a reason as amendment versions — `phase28`, `ui32` |
| PRI-001 | Requested priority / HR classification / dynamic score / override | Built | 0.2 | `PRIORITY_WEIGHTS`, pin — `phase2` |
| BRD-001 | Board approval (Chairman or Vice) after the CEO | Built | 0.2.3 · 0.36 | `SEND_BOARD`, on-behalf recording — `phase2`, `phase7`. 0.36: on-behalf needs a proof file (CHG-78) — `phase36`, `ui4` |

## Vacancies, sourcing, candidates

| ID | Requirement (short) | Status | Version | Evidence / note |
|---|---|---|---|---|
| VAC-001 | One vacancy per location line | Built | 0.2 | `phase2` |
| VAC-002 | Partial fill; request closes fully or partially | Built | 0.2 · 0.14 · 0.40 | 0.40: the request closes by itself («Closed») when all its vacancies are filled, closed or cancelled, and opens again when a fill is voided; event + requester told — `phase40`, before `phase2`, `phase14` |
| VAC-003 | Several recruiters per vacancy; lead; one owner per application | Built | 0.2 · 0.9 | `VACANCY_RECRUITERS`, application owner — `phase2`, `phase8` |
| VAC-004 | Missing recruitment roles skipped with record | Built | 0.2 | Fallback to HR; skip reason — `phase2` |
| VAC-005 | Unassigned work queue and bulk reassignment | Built | 0.2 · 0.28 · 0.34 | v0.33 review: a deactivated recruiter's work did not return to «not assigned» — fixed in v0.34 (`phase34`); bulk reassignment built in 0.28 |
| VAC-006 | Recruitment screen listing all approved requests / vacancies | Built | 0.2 | «الشواغر» — `phase2` |
| ADV-001 | Ads per platform from JD templates, copyable | Built | 0.8 | `Sourcing.gs` — `phase6` |
| ADV-002 | Apply link per ad with automatic source | Built | 0.8 | `&ad=` link — `phase6` |
| SRC-001 | Source mandatory per application, with sub-source | Built | 0.3 · 0.8 | `phase3`, `phase6` |
| SRC-002 | Subscriptions: credits, usage, expiry, unused-credit alerts | Built | 0.8 | `phase6` |
| SRC-003 | Referral attribution lock; agency terms | Built | 0.9 | `Referrals.gs` — `phase8` |
| CAN-001 | Person master; candidate ≠ application; duplicate warning, no auto-merge | Built | 0.3 | `phase3`. 0.38: own consent before passing «Contacted» (consent link), relatives, accommodation, minors, photo consent (CHG-81) — `phase38` |
| CAN-002 | Hybrid journey; recruiter acts on behalf with audit  | Built | 0.3 · 0.39 | Candidate's own page (private link, 7 days): consent, data and CV, confirm / decline interview, answer the offer; recruiter on-behalf kept (CHG-83) — `phase39`, `ui40` |
| CAN-003 | Online application intake | Built | 0.3 | `Apply.html` — `phase3` |
| CAN-004 | Privacy notice acceptance stored with version | Built | 0.3 · 0.14.1 | `CONSENTS` — `phase3`, `phase15` |
| CAN-005 | Salaries required with disclosure states; never zero | Built | 0.3 · 0.14.1 · 0.28 | Owner decision (0.28): salary optional for everyone, the form does not label it optional; a separate sensitive-data consent when entered (0.14.1); zero refused on the form and the server — `phase28` |
| CAN-006 | National ID optional at application | Built | 0.3 | `phase3` |
| CAN-007 | Bulk import of 50–100 rows with duplicate review and batch ID | Built | 0.10 | `IMPORT_BATCHES` — `phase9` |
| CAN-008 | Hybrid talent pool | Built | 0.10 | `Pool.gs` — `phase9` |
| CAN-009 | Former employee detection and hiring restriction | Built | 0.10 | Restrictions, rehire confirmation — `phase9` |
| SCR-001 | Knockout flags for human review; AI evidence-only | Built | 0.10 · 0.31 | Knockout flags reviewed by a person — `phase9`. AI CV reading (0.31, `CvAi.gs`) gives suggestions only: fields the recruiter picks to save, a summary and a 1–5 match on job-related criteria (age, gender, religion, marital status, nationality, photo excluded); it never moves or rejects a candidate — `phase31`, `ui35` |
| SCR-002 | Coded rejection reasons; internal reason separate from message | Built | 0.3 | `REASON_MASTER` — `phase3` |
| ACT-001 | Activity log: calls, manager discussions, no silent edits | Built | 0.3 | `ACTIVITIES`, void instead of edit — `phase3` |
| ACT-002 | Action queue with next action per application | Built | 0.3 | «مهامي» — `phase3` |
| COM-001 | Message templates; copy for WhatsApp | Built | 0.3 | `MESSAGE_TEMPLATES` — `phase3` |
| COM-002 | Rejection message by WhatsApp or email as an explicit step  | Built | 0.3 · 0.39 | `cand.rejectMsg`; preferred contact channel kept on the person and shown at the rejection step (v0.39) — `phase3`, `phase39` |
| MOV-001 | Vacancy fill method recorded (external / internal transfer) | Built | 0.2 | `VACANCY_FILLS` — `phase2`, `phase4` |
| MOV-002 | Internal candidates (source Internal); manager told before first interview | Built | 0.3 | Told at shortlist (`Candidates.gs`) — `phase3` |

## Interviews, offers, joining

| ID | Requirement (short) | Status | Version | Evidence / note |
|---|---|---|---|---|
| ASM-001 | Practical / technical assessment stage | Built | 0.12 | `Assessments.gs` — `phase12`. Assessment data entry deferred by the owner (open item 7) |
| INT-001 | Invite blocked until the manager confirms | Built | 0.11 | Confirmation chain — `phase10` |
| INT-002 | Manager screen of interview dates and locations | Built | 0.11 | `phase10` |
| INT-003 | Reminders and optional reconfirmation  | Built | 0.12 · 0.39 | Day-before reminder to the panel by e-mail too; candidate e-mail ~2 hours before a confirmed interview; reconfirmation — `phase12`, `phase39` |
| INT-004 | Check-in, waiting timer, evidence trail | Built | 0.11 | `phase10` |
| INT-005 | Interview plan, panel roles, waiver with reason | Built | 0.11 | `phase10` |
| INT-006 | Interviewer workspace shows the JD | Built | 0.11 | Interview kit — `phase5`, `phase10` |
| INT-007 | Question bank; HR standard questions in the HR interview | Built | 0.11 | `INTERVIEW_QUESTIONS` — `phase10`. Bank content pending from HR (open item 8) |
| INT-008 | Structured, independent evaluations (HR, direct, higher manager) | Built | 0.11 | `phase10` |
| INT-009 | Live comparison; continuous pipeline; decision readiness | Built | 0.11 | `int.compare` — `phase10` |
| INT-010 | SLA on confirmation and evaluation with escalation | Built | 0.11 | `EVAL_SLA_HOURS`, daily job — `phase10` |
| OFF-001 | Offer sent by email from the system or printed | Built | 0.13 | `OFFER_VIA_` — `phase13` |
| OFF-002 | Offer authority by salary band; HR Manager above max | Built | 0.13 | `OFFER_AUTHORITY` — `phase13` |
| OFF-003 | Basic + allowances; incentives in the system, not in the offer | Built | 0.13.1 | Incentive annex — `phase13` |
| OFF-004 | Offer versions and negotiation with reapproval | Built | 0.13 | `phase13` |
| OFF-005 | Valid Until and audited extension | Built | 0.13 | `phase13` |
| OFF-006 | Five-figure salary trail | Built | 0.13 | Current / expected / proposed / approved / agreed — `phase13` |
| OFF-007 | Decline reasons, over-hiring warning, reserve candidates | Built | 0.13 · 0.14 | `phase13`, `phase14` |
| JOI-001 | Joining date agreed after acceptance, with history | Built | 0.14 | `phase14`; 0.47 (CHG-101): the fixed-term employment contract prints the two-page preliminary template on the contribution wage, refused while its legal data is missing — `phase51`, `ui51`; 0.48 (CHG-102): the salary details at hire (company copy, pay-view roles, one page) — `phase52`, `ui51` |
| JOI-002 | Did-not-join tracked with reasons | Built | 0.14 | `phase14` |
| DOC-001 | Upload by employee or HR, HR review, physical receipt | Built | 0.14 | Private upload link, receipts — `phase14`; 0.46.2 (CHG-100): the signed no-insurance acknowledgement is a required joining document of a no-insurance contract, never deferred or waived — `phase50` |
| DOC-002 | Deferred documents with approver and due date; HR alerts only | Built | 0.14 · 0.40 | 0.40: the employee is e-mailed 3 days before and on the due date; 7 days after it the HR manager is told (DOC\_DEFER\_ESCALATE\_DAYS); never on days off; no payroll action — `phase40`, before `phase14` |

## New hire, movement, reporting, control

| ID | Requirement (short) | Status | Version | Evidence / note |
|---|---|---|---|---|
| FIL-001 | Electronic employee file with document versions and expiry | Built | 0.17 · 0.40 | 0.40: the 13 document states (§14.2) shown on every document; «suspected issue» (only an HR manager clears it) and «replacement requested» (the reason reaches the candidate's link); a verified document past its expiry becomes «Expired» every day, renewal notice 30 days before (employee e-mailed, team told), a renewed copy clears it — `phase40`, `ui41`, before `phase19` |
| ONB-001 | Orientation with separate manager and HR screens | Built | 0.17 · 0.41 · 0.44 | 0.41: IT / administration / safety owners (named in settings, else the HR site specialist) with their own tasks; custody & PPE log on the program and the employee file, flagged at end of service; «arriving tomorrow» screen; survey axes — `phase41`, `ui42`, before `phase19`. 0.44: ZKBioTime enrolment task (face + fingers, punch type, mobile licences, stop on exit — CHG-91) — `phase43`, `ui44` |
| ONB-002 | First-day welcome gift | Built | 0.18 | `phase20` |
| ONB-003 | 30-day New Hire Voice with confidentiality | Built | 0.18 | 7 / 30 days, HR-only answers — `phase20` |
| INS-001 | Social insurance case within the first month | Built | 0.18 | `INSURANCE_CASES` — `phase20` |
| MOV-003 | Transfer process with approvals and HC check on the target | Built | 0.19 · 0.41 | 0.41: the receiving manager can open (towards his own scope); the two managers give an opinion (an objection is recorded, never ends it) — HR decides; temporary transfer (cover) to an end date — `phase41`, `phase21`, `ui42` |
| MOV-004 | On the effective date: positions / HC move, vacancy updated, history, replacement offered | Built | 0.19 · 0.5 · 0.41 | 0.41: handover list (ticked, open items named at the move); the old manager offered a prefilled replacement request; a cover keeps the home position and ends by itself — `phase41`, `phase21`, `phase4` |
| PRB-001 | Probation checkpoints, log, final evaluation, reminders | Built | 0.25 | `Probation.gs`, `Probation.html`: one period ≤ 90 days, no extension; goals + acknowledgement, performance log, reviews 30/60, self-assessment, final evaluation on day 75 (annual appraisal items), PIP by day 60, decision by day 80 (ending = HR sector only), reminders and escalation. Checkpoint days in `PROB_CHECKPOINTS` — `phase25`, `ui29`. Stay interview and KPIs in 0.26; the employee sees his follow-ups and, after the decision, his final evaluation (0.27) — `phase27`, `ui31` |
| INS-002 | Medical insurance after successful probation | Built | 0.25 | `MEDICAL_CASES`: opened on confirmation, due in `MEDICAL_ADD_DAYS`, HR only — `phase25`, `ui29` |
| RPT-001 | Status report per request; log of calls, appointments, no-shows | Built | 0.2 · 0.22 | Request timeline and activity log; **Operational reports** screen (0.22): requests, vacancies, candidates, ads, offers, joiners with filters and Excel export — `phase24` |
| RPT-002 | Role dashboards; drill-down KPIs | Built | 0.26 | `Kpi.gs`: KPI screen — process KPIs (speed, quality, efficiency, candidate experience, compliance), scorecards per recruiter, recruitment lead and HR site specialist (weighted, 1–5), managers and approvers; filters, drill-down to cases, Excel export, monthly e-mail. Targets and weights edited on the KPI screen (v0.27, validated + audited); "my evaluation" for every user — `phase26`, `phase27`, `ui30`, `ui31`. Phase 8 part 1 (0.29): source return with cost per hire, bottlenecks per step, interviewer calibration — `phase29`, `ui33`. Hiring forecast (0.30), confidence by months of history — `phase30`, `ui34` |
| AUD-001 | Audit: who, what, when, before, after | Built | 0.2 | `AUDIT_LOG`, `auditDiff_` — all suites; 0.49 (CHG-106): every row sealed and chained, checked daily — `phase53` |
| AUD-002 | Controlled overrides instead of admin bypass | Built | 0.2–0.20 | HC exception, waivers, on-behalf, all with reason and audit — `phase7`, `phase10`, `phase14` |
| WAG-001 | No wage or payroll action anywhere | Built | all | Portal records and prints notices only (payroll notice, salary-items notice) — `phase14`, `phase21` |

## Gaps worth deciding on

1. **ORG-002**: full structure version snapshots (structure on a date, compare two dates, formal versions) — owner: later.
2. **Link preview** (deferred 2026-10-10): a short company link with the portal's name and logo in WhatsApp previews — needs IT, the logo and the address (blueprint §30 item 15).

REQ-011, VAC-005, ORG-003 and CAN-005 were decided and built in v0.28.0. Phases 1–7 are delivered; Phase 8 has started: the KPI screen (v0.26–v0.27) source return, bottlenecks and interviewer calibration (v0.29), and the hiring forecast (v0.30). A go-live readiness screen (v0.30) lists what is still missing before go-live.
