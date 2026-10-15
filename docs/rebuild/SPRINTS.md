# قنديل HR — detailed sprint backlog

15 October 2026 · draft for review · new backend not started

Reference source pinned to `c54c21b93be4063521d5fc1d69b8909d6ba976b1`. Read [source review](SOURCE_REVIEW.md), [decision conflicts](DECISIONS.md), and [architecture plan](PLAN.md) first.

## How to use this plan

N00–N25 replace the earlier group-only schedule as the detailed planning view. There are 26 proposed sprint scopes and 104 concrete work items. Each has deliverables, dependencies, source paths, acceptance and a demo. A two-week timebox is a planning convention, not an effort estimate or promised release date. If executed strictly sequentially it represents 52 calendar weeks; safe overlap or splitting changes that. Re-estimate after N02 and the N04 proof using actual throughput. Do not promise that AI assistance compresses review or external dependencies.

N00–N02 are design/architecture, N03–N04 foundation/proof, N05–N21 functionality, and N22–N25 verification/migration/rollout. No production implementation begins before core N02 contracts are reviewed. Every sprint implements UI + backend + tests together where applicable; a mock is not a finished workflow.

## Definition of ready and done

- Ready: scope, actor, source requirement, state transition, fields, permissions, data owner and acceptance are specified; relevant conflict IDs have an owner/decision.
- Engineering done: reviewed commit, reproducible migrations, real API/database tests, role-denial/concurrency/retry cases, AR/EN/mobile checks, and documented evidence.
- Business accepted: named HR reviewer completes the task on the exact build; legal/provider dependencies resolved for that feature.
- Released: production configuration, security/load/restore gates, migration and operational owner verified.
- Every list, count, export, file and background task is within the authorization test boundary.

[Task spreadsheet / CSV](backlog.csv) · [Machine-readable tracker](tracker.json) · [98 requirements](requirements.csv) · [109 source changes](source-changes.csv)

## Full sequence

| Sprint | Focus | Depends on |
|---|---|---|
| N00 | Reference reconciliation and product decisions | None |
| N01 | Arabic/English UX and workflow design | N00 |
| N02 | Data architecture, contracts and threat model | N00, N01 |
| N03 | New repository and secure foundation | N02 |
| N04 | First complete working slice | N03 |
| N05 | Organization, employees and controlled imports | N04 |
| N06 | Job descriptions and competency library | N05 |
| N07 | Complete hiring requests and approval authority | N05, N06 |
| N08 | Amendments, vacancies and recruitment workload | N07 |
| N09 | Candidate identity, pipeline and daily work | N08 |
| N10 | Public application, self-service and privacy | N09 |
| N11 | Sources, ads, agencies and referrals | N09, N10 |
| N12 | Interview scheduling and candidate responses | N10, N11 |
| N13 | Evaluations, assessments and selection | N12 |
| N14 | Compensation proposals and offers | N13 |
| N15 | Joining, documents and contracts | N14 |
| N16 | Onboarding and new-hire experience | N15 |
| N17 | Transfers, exits and headcount reconciliation | N05, N15, N16 |
| N18 | Probation and insurance follow-up | N16, N17 |
| N19 | Operational reports and management KPIs | N08, N11, N12, N14, N15, N17, N18 |
| N20 | Optional controlled AI assistance | N10, N13, N19 |
| N21 | Administration, oversight and shared identity | N03, N07, N10, N17, N19 |
| N22 | Full regression and migration rehearsal | N05, N06, N07, N08, N09, N10, N11, N12, N13, N14, N15, N16, N17, N18, N19, N21 |
| N23 | Independent security, load and recovery gates | N22 |
| N24 | HR acceptance, training and controlled pilot | N23 |
| N25 | Production rollout and stabilization | N24 |

## N00 — Reference reconciliation and product decisions

**Depends on:** None. **Status:** planned.

**Demo:** Walk through the full scope and every conflicting policy before implementation.

**Reference files:** `docs/blueprint/blueprint-v2.3.md`, `docs/blueprint/requirements-status.md`, `docs/decisions/2026-10-09-review-decisions.md`.

**Primary requirements:** Cross-cutting foundation / release scope.

**Source changes to review:** CHG-18, CHG-32, CHG-39, CHG-51, CHG-52, CHG-80.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N00-T1 | **Product** — Review 98 requirements and 109 change entries; preserve identifiers and record adopted, superseded or pending decisions | Every source item has a sprint and disposition; no undocumented deletion. |
| N00-T2 | **Product** — Define recruitment/HR release boundary, users, entities, locations and authoritative source systems | HR confirms scope or each unresolved item has an owner and due gate. |
| N00-T3 | **Architecture** — Audit reusable React components, API coupling, licenses and Frappe-dependent business rules | Reuse/replace/reference-only register includes source paths and estimates of uncertainty. |
| N00-T4 | **QA** — Write happy-path, denial, exception and concurrency examples for each workflow family | Acceptance catalogue includes request, hiring, joining, lifecycle and public-link actors. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N01 — Arabic/English UX and workflow design

**Depends on:** N00. **Status:** planned.

**Demo:** Clickable manager, HR, recruiter and candidate journeys on desktop and phone.

**Reference files:** `src/Index.html`, `docs/design/new-look/Main.dc.html`, `docs/design/new-look/Candidates.dc.html`, `src/Apply.html`, `src/SelfPage.html`.

**Primary requirements:** UX-001.

**Source changes to review:** CHG-19, CHG-28, CHG-55, CHG-87, CHG-97, CHG-99, CHG-109.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N01-T1 | **Design** — Define navigation, brand tokens, typography, forms, tables, status labels and reusable components | AR RTL and EN LTR layouts include long names, responsive tables and keyboard focus. |
| N01-T2 | **Design** — Prototype inbox, approvals, organization, vacancy stage board and tabbed candidate file | HR can find and complete the next action without developer coaching. |
| N01-T3 | **Design** — Prototype interviews, guided offer, joining/docs, employee file and settings | Every source screen has a destination or explicit recorded scope decision. |
| N01-T4 | **QA** — Review loading, empty, validation, access denied, stale form, expired link and lost-reply states | Scenario walkthrough records reviewer feedback; design sign-off is separate from implementation. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N02 — Data architecture, contracts and threat model

**Depends on:** N00, N01. **Status:** planned.

**Demo:** Trace one hiring event across data, permissions, transaction, audit and notification.

**Reference files:** `src/Config.gs`, `src/Perm.gs`, `src/Repo.gs`, `src/Api.gs`.

**Primary requirements:** Cross-cutting foundation / release scope.

**Source changes to review:** CHG-22, CHG-27, CHG-45, CHG-47, CHG-94.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N02-T1 | **Architecture** — Produce ERD, data dictionary and module ownership for person/application/employee/job/position/vacancy | Stable keys, relations, uniqueness, effective dates and field classifications are explicit. |
| N02-T2 | **Architecture** — Define state transition tables, version checks, command receipts and transactional outbox | Retry, stale version, deadlock and partial-provider-failure behavior are specified. |
| N02-T3 | **Architecture** — Publish API contracts including pagination, errors, scoped search and file access | Frontend and backend use the same reviewed request/response examples. |
| N02-T4 | **Security** — Decide session/SSO/MFA, public-token scope, retention, audit anchoring and environment boundaries | Threat model covers exports, files, reset flows and privileged actions; unresolved decisions have gates. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N03 — New repository and secure foundation

**Depends on:** N02. **Status:** planned.

**Demo:** Clean install, sign-in as two different scopes, and a visibly denied cross-scope request.

**Reference files:** `src/Auth.gs`, `src/Security.gs`, `src/Audit.gs`, `src/PrivacyRules.gs`.

**Primary requirements:** ACC-001, ACC-002, ACC-003, AUD-001, AUD-002.

**Source changes to review:** CHG-14, CHG-54, CHG-82, CHG-104, CHG-108.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N03-T1 | **Platform** — Create private repo with frontend/backend/infrastructure/docs, locked dependencies, CI and synthetic fixtures | A clean checkout builds and migrates using documented commands; no runtime secrets in Git. |
| N03-T2 | **Backend** — Implement chosen identity provider/session, MFA and recovery, account disable and server-side scope | Logout/disable invalidate access; brute-force/CSRF/session-expiry and privilege tests pass. |
| N03-T3 | **Backend** — Implement audit events, protected files foundation, command receipts and outbox | Domain write and event commit together; retries reuse the result and recheck current authorization. |
| N03-T4 | **Frontend** — Build bilingual shell, login, role navigation and staging setup | AR/EN smoke and secure-cookie/configuration checks pass on isolated staging. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N04 — First complete working slice

**Depends on:** N03. **Status:** planned.

**Demo:** Manager submits; reviewer returns; manager revises; authorized approval creates vacancy; recruiter adds candidate.

**Reference files:** `src/Requests.gs`, `src/Workflow.gs`, `src/Vacancies.gs`, `src/Candidates.gs`.

**Primary requirements:** Cross-cutting foundation / release scope.

**Source changes to review:** Inherited from feature dependencies.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N04-T1 | **Backend** — Seed minimal synthetic company, positions and authority; implement one real hiring route | Scoped user cannot select another unit; decision records the exact reviewed version. |
| N04-T2 | **Backend** — Create vacancy and person/application through transactional commands | Repeated approval creates one vacancy; double candidate submit creates one intended application. |
| N04-T3 | **Frontend** — Connect request, approval, vacancy and candidate screens to actual APIs | Refresh retains saved state; no mock success messages remain in the slice. |
| N04-T4 | **QA** — Exercise AR/EN ordinary users, revoked access, network retry and conflicting decisions | Evidence links the source revision, fixture, API results and browser workflow; full parity is not claimed. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N05 — Organization, employees and controlled imports

**Depends on:** N04. **Status:** planned.

**Demo:** Import a synthetic structure, compare history, request a position and approve an employee assignment.

**Reference files:** `src/OrgAdmin.gs`, `src/OrgChart.gs`, `src/Employees.gs`, `src/Import.gs`, `src/Structural.gs`.

**Primary requirements:** ORG-001, ORG-002, ORG-006, ORG-007, ORG-008, ORG-009, HC-001, HC-002.

**Source changes to review:** CHG-02, CHG-15, CHG-16, CHG-20, CHG-23, CHG-29, CHG-33, CHG-56.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N05-T1 | **Backend** — Implement separate legal entities, hierarchy, jobs, positions, branch placement and effective-dated assignments | Cycles/duplicate codes denied; historical structure can be reconstructed and compared. |
| N05-T2 | **Backend** — Implement structural requests and employee-position assignment/end/move approvals | HR + CEO approval is required under the user's chosen route; pending changes do not change occupancy. |
| N05-T3 | **Frontend** — Build searchable tree/chart, employee directory, position detail and approved-change history | Counts reconcile and unauthorized employees/compensation are absent from all views. |
| N05-T4 | **QA** — Build import preview, mapping, validation, duplicate review and batch reconciliation | Invalid rows are reported before commit; reruns cannot double occupancy; no salary values required for HC import. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N06 — Job descriptions and competency library

**Depends on:** N05. **Status:** planned.

**Demo:** Draft a JD, collect manager comments, approve a version and print its worker card in Arabic.

**Reference files:** `src/JobDescriptions.gs`, `src/JdReview.gs`, `src/Grades.gs`, `docs/policies/jd-writing-guide.md`.

**Primary requirements:** ORG-003.

**Source changes to review:** CHG-06, CHG-34, CHG-35, CHG-36, CHG-37, CHG-88, CHG-89, CHG-90, CHG-93, CHG-96.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N06-T1 | **Backend** — Model competency levels, question/test references, grades/job levels and versioned JDs | Superseded versions remain; grade-derived level follows reviewed rules without exposing grade to employees. |
| N06-T2 | **Backend** — Implement responsibility limits/reasons, KPI types and weights, certificates and manager review rounds | Invalid weights blocked; manager comments cannot silently edit or approve a JD. |
| N06-T3 | **Frontend** — Build JD editor, review inbox, comparisons, interview kit and approved-version document views | Manager/employee outputs hide restricted fields; AR/EN printing has no clipped text. |
| N06-T4 | **QA** — Test spreadsheet JD import, round deadlines, reviewed recipient lists and PDF/email generation | Approved snapshot is delivered; missing role and failed-delivery cases remain actionable. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N07 — Complete hiring requests and approval authority

**Depends on:** N05, N06. **Status:** planned.

**Demo:** Multi-site request with an absent manager, HC exception, delegation, CEO and Board evidence.

**Reference files:** `src/Requests.gs`, `src/Workflow.gs`, `src/Ceo.gs`, `src/Dual.gs`, `src/Daily.gs`.

**Primary requirements:** ORG-005, HC-003, HC-004, HC-005, HC-006, REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010, REQ-011, BRD-001.

**Source changes to review:** CHG-01, CHG-03, CHG-24, CHG-26, CHG-40, CHG-41, CHG-74, CHG-75, CHG-76.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N07-T1 | **Backend** — Complete HR-REC-F02 fields, location lines, replacements, skills and headcount reservation math | Request quantities do not double count pending/open/occupied commitments under concurrent submissions. |
| N07-T2 | **Backend** — Implement reviewed authority chains, vacant-role skips, dated delegation, HR actions and Board route | Self-approval conflicts follow signed policy; sensitive authority changes require independent approval. |
| N07-T3 | **Frontend** — Build My Requests, review inbox, decision snapshots, return/revision timeline and authority administration | Reviewers see exactly what they approve and current delegated scope. |
| N07-T4 | **QA** — Implement working-calendar reminders/escalations and resolve auto-rejection decision before enabling it | Timed tests cover holidays, expired delegation, concurrent approvals and requester notification history. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N08 — Amendments, vacancies and recruitment workload

**Depends on:** N07. **Status:** planned.

**Demo:** Amend an approved request, assign a recruiter team, freeze a vacancy and recover an inactive recruiter's work.

**Reference files:** `src/RequestChanges.gs`, `src/Vacancies.gs`, `src/Workflow.gs`, `src/Requests.gs`.

**Primary requirements:** PRI-001, VAC-001, VAC-002, VAC-003, VAC-004, VAC-005, VAC-006.

**Source changes to review:** CHG-09, CHG-30, CHG-31, CHG-68.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N08-T1 | **Backend** — Implement approved-change policy, supplementary HC requests and quantity commitments | Changes never erase approval history or reduce below committed capacity; reapproval matrix is explicit. |
| N08-T2 | **Backend** — Implement one vacancy per location, partial fill, hold/freeze/close/reopen and application ownership | Cancel/void reconciles parent request status; inactive owners move to a visible queue safely. |
| N08-T3 | **Frontend** — Build list/board, priority explanation, pinning, team lookup, bulk assignment and filters | Pagination and totals use the same permissions; bulk errors identify affected rows. |
| N08-T4 | **QA** — Verify notifications, concurrent allocation and edit/reassignment races | No duplicate assignments or hidden cross-scope results; retries do not repeat side effects. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N09 — Candidate identity, pipeline and daily work

**Depends on:** N08. **Status:** planned.

**Demo:** One person applies to two vacancies; recruiter records a call, schedules follow-up and closes one application.

**Reference files:** `src/Candidates.gs`, `src/Pool.gs`, `src/Screening.gs`.

**Primary requirements:** CAN-001, CAN-005, CAN-006, CAN-007, CAN-009, SCR-002, ACT-001, ACT-002, COM-001, COM-002, MOV-002.

**Source changes to review:** CHG-25, CHG-42, CHG-43.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N09-T1 | **Backend** — Separate person master, application, employee/rehire links and duplicate review | No automatic merging; masked duplicate hints do not disclose inaccessible contact details. |
| N09-T2 | **Backend** — Implement stage transitions, hold/reopen/closure, coded reasons, immutable activity and follow-ups | Invalid jumps denied; internal reasons never appear in candidate messages. |
| N09-T3 | **Frontend** — Build Candidate 360 tabs, stage board, search, activity timeline and next-action queue | Drag/drop calls the same validated transition; offer/acceptance/joining cannot bypass dedicated workflows. |
| N09-T4 | **QA** — Implement 50–100-row candidate import with batch review and existing-person handling | Duplicate retry and conflicting updates preserve one coherent result; blank salary differs from zero. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N10 — Public application, self-service and privacy

**Depends on:** N09. **Status:** planned.

**Demo:** Candidate applies, accepts a versioned notice, updates their file and revokes optional pool consent.

**Reference files:** `src/Apply.html`, `src/Self.gs`, `src/Consent.gs`, `src/Privacy.gs`, `src/PrivacyRules.gs`, `src/Photos.gs`.

**Primary requirements:** CAN-002, CAN-003, CAN-004, CAN-008.

**Source changes to review:** CHG-07, CHG-53, CHG-72, CHG-81, CHG-83.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N10-T1 | **Backend** — Implement vacancy/ad intake, candidate-owned consent and separate purpose-specific grants | Public source attribution is server-validated; screening gate uses the approved consent policy. |
| N10-T2 | **Backend** — Implement expiring/revocable scoped self-service links, private CV/photo upload and pool membership | Token rotation invalidates old links; uploads are quarantined/scanned; photo visibility follows consent and role. |
| N10-T3 | **Frontend** — Build accessible AR/EN public form, consent page, candidate page and privacy admin | Candidate actors are recorded as themselves, not impersonated recruiter accounts; salary/ID fields follow signed policy. |
| N10-T4 | **QA** — Add data requests, identity verification, retention/hold, export and redaction workflows | Unauthorized file access blocked; withdrawal affects eligibility immediately; deletion does not destroy required lawful evidence. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N11 — Sources, ads, agencies and referrals

**Depends on:** N09, N10. **Status:** planned.

**Demo:** Generate an ad, track credits, attribute a referral and resolve a competing agency claim.

**Reference files:** `src/Sourcing.gs`, `src/Referrals.gs`.

**Primary requirements:** ADV-001, ADV-002, SRC-001, SRC-002, SRC-003.

**Source changes to review:** CHG-38.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N11-T1 | **Backend** — Model source/sub-source, ads and immutable original/current attribution with outcome locks | Source changes preserve original evidence and cannot bypass closing locks. |
| N11-T2 | **Backend** — Implement agency terms/ownership and employee referrals/bonus review ledger | Simultaneous agencies cannot own the same eligible person; bonuses record decisions without executing payments. |
| N11-T3 | **Frontend** — Build source catalogue, ad templates/apply links, agency/referral register and subscription-credit controls | Terms and attribution changes show before/after confirmation; credit usage can be voided with history. |
| N11-T4 | **QA** — Verify same-agency terms preservation, referral reclassification, disputes, expiry and cost attribution | Replays cannot renew ownership or spend credits twice; unresolved dispute has assigned human owner. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N12 — Interview scheduling and candidate responses

**Depends on:** N10, N11. **Status:** planned.

**Demo:** Manager confirms, candidate receives invite, reschedules, checks in and interviewer starts.

**Reference files:** `src/Interviews.gs`, `src/Self.gs`, `src/Assessments.gs`.

**Primary requirements:** INT-001, INT-002, INT-003, INT-004, INT-010.

**Source changes to review:** CHG-44.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N12-T1 | **Backend** — Implement interview plans, required/optional rounds, panels, locations and schedule versions | Candidate invitation blocked before manager confirmation; rescheduling invalidates outdated actions. |
| N12-T2 | **Backend** — Implement scoped candidate confirmation/decline, cancellation, no-shows and waiting timers | Repeated responses and reminder jobs do not create duplicate events or invitations. |
| N12-T3 | **Frontend** — Build calendar/list, interviewer workspace, recruiter scheduling and candidate response views | JD version and correct location/time are shown in both languages and mobile layouts. |
| N12-T4 | **QA** — Add reminders, reconfirmation and escalation with provider sandbox verification | Stale recipients, cancelled interviews and disabled users receive no invalid reminders. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N13 — Evaluations, assessments and selection

**Depends on:** N12. **Status:** planned.

**Demo:** Independent interview feedback plus a practical test lead to a reviewed selection decision.

**Reference files:** `src/Interviews.gs`, `src/Assessments.gs`, `src/Offers.gs`, `src/PrivacyRules.gs`.

**Primary requirements:** ASM-001, INT-005, INT-006, INT-007, INT-008, INT-009.

**Source changes to review:** CHG-05, CHG-08, CHG-46.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N13-T1 | **Backend** — Implement structured evaluations, revisions, question bank and readiness calculation | Evaluators cannot see peers' protected answers before authorized release; every revision preserves history. |
| N13-T2 | **Backend** — Implement practical/written assessments, criteria, HSE prerequisite, evidence and retest | Unsafe/unconfirmed start denied; failed assessment produces human-review flag, not automatic rejection. |
| N13-T3 | **Frontend** — Build evaluation forms, assessment results, comparison/readiness and selected/reserve/hold decisions | Required missing evidence is visible; waiver requires authorized reason and relationship declaration. |
| N13-T4 | **QA** — Verify manager decline, panel replacement, late feedback, reference-check consent and selection reversal | Selection is separate from financial offer authority; old evaluation versions remain attributable. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N14 — Compensation proposals and offers

**Depends on:** N13. **Status:** planned.

**Demo:** Calculate a reviewed package, route authority, revise after negotiation and obtain candidate acceptance.

**Reference files:** `src/Pay.gs`, `src/Offers.gs`, `src/Self.gs`.

**Primary requirements:** ORG-004, OFF-001, OFF-002, OFF-003, OFF-004, OFF-005, OFF-006, OFF-007.

**Source changes to review:** CHG-04, CHG-10, CHG-48, CHG-49, CHG-84, CHG-107.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N14-T1 | **Backend** — Version grade/range/component/allowance rules and offer package calculations | Gross/net estimates have approved sample calculations; no payroll or payment execution exists. |
| N14-T2 | **Backend** — Implement authority thresholds, independent net review, expiry, extension and five-figure salary trail | Recruiter authority and exceptional contracts follow approved matrix; self-review denied. |
| N14-T3 | **Frontend** — Build salary/benefits/review/send wizard, print preview and candidate response | Accepted terms identify exact version; working hours/rest and variable incentives display correctly. |
| N14-T4 | **QA** — Test restricted pay fields/exports, concurrent acceptance/expiry, rejected offers and delivery evidence | No duplicate accepted commitment; revised offers require appropriate reapproval; legal wording stays gated. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N15 — Joining, documents and contracts

**Depends on:** N14. **Status:** planned.

**Demo:** Candidate uploads documents; HR verifies and records physical receipt; approved actual joining creates employee.

**Reference files:** `src/Joining.gs`, `src/Employees.gs`, `docs/forms/print-book.pdf`, `tools/print_book.js`.

**Primary requirements:** HC-007, MOV-001, JOI-001, JOI-002, DOC-001, DOC-002, FIL-001, WAG-001.

**Source changes to review:** CHG-11, CHG-13, CHG-50, CHG-67, CHG-100, CHG-101, CHG-102, CHG-103.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N15-T1 | **Backend** — Implement joining-date revisions, no-show, actual join and rollback/void controls | Actual join updates occupancy once; accepting an offer alone does not fill the position. |
| N15-T2 | **Backend** — Implement document requirement matrix, versions, 13 reference states, suspect/replacement, deferral and expiry | Digital upload is not physical receipt; mandatory exceptions cannot be waived without approved policy. |
| N15-T3 | **Frontend** — Build candidate documents page, HR verification/receipt, contract prerequisites and restricted salary-details print | Missing legal inputs prevent final contract issuance; approved templates render correct AR/EN PDFs. |
| N15-T4 | **QA** — Test late documents, replacement, token expiry, signed contract, no-insurance policy gate and notifications | Missing documents never stop wages; private files and historical signatures remain correctly scoped. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N16 — Onboarding and new-hire experience

**Depends on:** N15. **Status:** planned.

**Demo:** An arriving employee gets tasks for HR/IT/safety, custody/PPE, enrollment record and confidential survey.

**Reference files:** `src/Onboarding.gs`, `src/NewHire.gs`, `src/Employees.gs`.

**Primary requirements:** ONB-001, ONB-002, ONB-003, INS-001.

**Source changes to review:** CHG-57, CHG-58, CHG-85, CHG-86, CHG-91.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N16-T1 | **Backend** — Implement factory/showroom/office programs, owner resolution, acknowledgement and date changes | Changed start dates move only eligible open tasks; no-show cancels appropriate work without losing history. |
| N16-T2 | **Backend** — Implement gifts, custody/PPE, social-insurance case and attendance-enrollment metadata | No biometric storage or BioTime connector; mobile-license occupancy/release is validated and auditable. |
| N16-T3 | **Frontend** — Build arrivals-tomorrow, owner task lists, employee file and new-hire survey | Survey answers stay HR-only; small-group aggregates are suppressed per approved threshold. |
| N16-T4 | **QA** — Verify missing owners, repeat scheduler runs, incomplete equipment return and enrollment stop alerts | Every overdue case has an owner; gifts/signatures/insurance changes require correct role. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N17 — Transfers, exits and headcount reconciliation

**Depends on:** N05, N15, N16. **Status:** planned.

**Demo:** Request permanent or temporary transfer, approve through HR + CEO, execute on date and reconcile positions.

**Reference files:** `src/Transfers.gs`, `src/Employees.gs`, `src/Onboarding.gs`.

**Primary requirements:** MOV-003, MOV-004.

**Source changes to review:** CHG-21, CHG-59.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N17-T1 | **Backend** — Implement sender/receiver initiation, manager opinions, handover, temporary cover and replacement request | Apply user's HR + CEO approval override; simultaneous moves cannot overbook target capacity. |
| N17-T2 | **Backend** — Implement effective-date execution, temporary return, cancellation and end-of-service reversal policy | Repeated scheduler execution is idempotent; source/home assignment and history remain coherent. |
| N17-T3 | **Frontend** — Build transfer preview, approvals, handover, exit file and reconciliation report | Salary/grade implications are restricted; employee notification/signature follows reviewed policy. |
| N17-T4 | **QA** — Test future exit, rehire restriction/appeal, revoked account access and custody/enrollment follow-up | Ended users lose access at the approved point; historic person/application identity survives. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N18 — Probation and insurance follow-up

**Depends on:** N16, N17. **Status:** planned.

**Demo:** Employee acknowledges goals, submits self-review, manager evaluates and HR decides with history.

**Reference files:** `src/Probation.gs`, `src/NewHire.gs`, `src/Self.gs`.

**Primary requirements:** PRB-001, INS-002.

**Source changes to review:** CHG-12, CHG-61, CHG-62, CHG-63, CHG-92.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N18-T1 | **Backend** — Implement eligible evaluator selection, goals, dated checkpoints, evidence log and final decisions | Missing JL5+ evaluator routes to HR; period/rehire rules follow signed HR/legal decision. |
| N18-T2 | **Backend** — Implement stay interview/PIP, confidential access, insurance enrollment and appeals decision from legal review | No unreviewed legal deadline or automatic termination is enabled; exit closes cases appropriately. |
| N18-T3 | **Frontend** — Build manager/HR/employee views, checkpoint forms, decision evidence and medical-insurance queue | Employee visibility and appeal/result-notification rules are explicit and tested. |
| N18-T4 | **QA** — Test changed manager, overdue review, concurrent exit/confirmation and repeat insurance creation | Once-only events, confidentiality and historical evidence survive all paths. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N19 — Operational reports and management KPIs

**Depends on:** N08, N11, N12, N14, N15, N17, N18. **Status:** planned.

**Demo:** A manager drills from KPI to the exact permitted cases and exports the same reconciled population.

**Reference files:** `src/Reports.gs`, `src/Kpi.gs`, `src/Insights.gs`.

**Primary requirements:** RPT-001, RPT-002.

**Source changes to review:** CHG-64, CHG-65, CHG-66, CHG-69, CHG-70.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N19-T1 | **Backend** — Define metric catalogue, cohorts, costs, elapsed/business time, exclusions and targets | Every figure has a formula, denominator, source events and reproducible fixture expectation. |
| N19-T2 | **Backend** — Build request/vacancy/candidate/offer/joiner reports, source ROI, bottlenecks and calibration | Missing history is labelled; estimates are distinguished from observed costs and outcomes. |
| N19-T3 | **Frontend** — Build personal/team/process scorecards, target editing, filters, drill-down and forecast confidence | Targets/weights are versioned and restricted; small sensitive cohorts remain protected. |
| N19-T4 | **QA** — Validate exports, injection-safe CSV, authorization and query plans against representative volumes | Counts match details and exports; heavy jobs cannot block ordinary operations. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N20 — Optional controlled AI assistance

**Depends on:** N10, N13, N19. **Status:** planned.

**Demo:** Synthetic CV produces reviewable suggestions; recruiter selects fields and sees source evidence.

**Reference files:** `src/CvAi.gs`, `src/Screening.gs`.

**Primary requirements:** SCR-001.

**Source changes to review:** CHG-71, CHG-73.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N20-T1 | **Backend** — Implement provider adapter, redaction, consent/purpose checks and isolated asynchronous jobs | No live personal-data transfer until approved; secrets never reach browser or logs. |
| N20-T2 | **Backend** — Enforce budget reservation, retry limits, file-size limits, model/prompt versions and kill switch | Concurrent calls cannot exceed approved cap; malformed output is rejected safely. |
| N20-T3 | **Frontend** — Show extracted fields, job-related evidence, uncertainty and explicit apply/reject choices | Suggestions never automatically change stage, reject candidate or rank by protected traits. |
| N20-T4 | **QA** — Test document prompt injection, protected fields, stale CV/JD, provider failure and hallucinated evidence | Traceable evaluation report required; if deferred, record exact AI-related scope rather than claim parity. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N21 — Administration, oversight and shared identity

**Depends on:** N03, N07, N10, N17, N19. **Status:** planned.

**Demo:** Disable dormant account, review delegated access, inspect audit alert and exercise staging incident procedure.

**Reference files:** `src/Admin.gs`, `src/Security.gs`, `src/Ceo.gs`, `src/Dual.gs`, `src/Presence.gs`, `src/Ops.gs`, `src/Readiness.gs`.

**Primary requirements:** ACC-004.

**Source changes to review:** CHG-17, CHG-60, CHG-77, CHG-78, CHG-79, CHG-95, CHG-98, CHG-105, CHG-106.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N21-T1 | **Backend** — Implement access reviews, privileged two-person changes, new-device alerts and dormant-account reassignment | No user approves own reset/role change; recovery path remains independently controlled. |
| N21-T2 | **Backend** — Implement tamper-evidence verification, incident workflow, backup status and readiness checks | Protected anchor/key design is tested; redaction and archival do not silently break verification. |
| N21-T3 | **Frontend** — Build grouped settings, audit explorer, feedback, process map/guide and limited presence view | Presence contains only permitted screen-level data and expires; readiness checkboxes cannot prove deployment. |
| N21-T4 | **Integration** — Implement agreed shared sign-in with appraisal portal and sandbox delivery adapters | Provider contract and revocation tested; unavailable external dependency stays explicitly blocked. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N22 — Full regression and migration rehearsal

**Depends on:** N05, N06, N07, N08, N09, N10, N11, N12, N13, N14, N15, N16, N17, N18, N19, N21. **Status:** planned.

**Demo:** Rehearse import, run all release workflows and produce reconciled exceptions without touching production.

**Reference files:** `src/Import.gs`, `src/Repo.gs`, `tests/harness.js`, `docs/blueprint/blueprint-v2.3.md`.

**Primary requirements:** Cross-cutting foundation / release scope.

**Source changes to review:** Inherited from feature dependencies.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N22-T1 | **Data** — Inventory authoritative Sheets/approved exports, map IDs/fields, classify missing data and legal holds | Synthetic/approved sample migration has row counts, rejected records and named HR reconciliation. |
| N22-T2 | **Platform** — Rehearse migrations, expand/contract schema changes, rollback and pending-job handling | Clean install and upgrade both pass; old/new compatibility is explicit during release window. |
| N22-T3 | **QA** — Port acceptance scenarios to real PostgreSQL/API/browser tests across roles and languages | All 98 IDs and adopted change entries have evidence or named unresolved gate; mock-only passes excluded. |
| N22-T4 | **Product** — Run scripted HR walkthrough and resolve integration defects with severity/owner | No critical business-flow defects remain; migrated history is labelled honestly, not fabricated. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N23 — Independent security, load and recovery gates

**Depends on:** N22. **Status:** planned.

**Demo:** Show measured response times, access-denial evidence and a successful isolated restore.

**Reference files:** `src/Security.gs`, `src/Privacy.gs`, `src/Audit.gs`, `src/Ops.gs`.

**Primary requirements:** Cross-cutting foundation / release scope.

**Source changes to review:** Inherited from feature dependencies.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N23-T1 | **Security** — Review authentication, object/field access, public links, uploads, dependencies, secrets and cloud configuration | Independent findings triaged; critical/high release risks fixed or formally dispositioned before pilot. |
| N23-T2 | **Performance** — Seed 1500 synthetic accounts; test realistic 50/100/250 active-user mixes, bursts, jobs and soak | Record infrastructure and p95/error/queue/lock metrics; agree actual peak and targets before judging pass. |
| N23-T3 | **Operations** — Restore database/files/keys to a clean environment and rehearse provider/database outage | Measured RPO/RTO meet signed targets; restored data and encrypted fields reconcile. |
| N23-T4 | **QA** — Repeat affected tests after fixes and verify production configuration separately from dev | No test/admin shortcut or synthetic destructive action is available in production. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N24 — HR acceptance, training and controlled pilot

**Depends on:** N23. **Status:** planned.

**Demo:** Representative HR, managers and employees complete their own tasks during a limited supported pilot.

**Reference files:** `src/Readiness.gs`, `docs/blueprint/blueprint-v2.3.md`.

**Primary requirements:** Cross-cutting foundation / release scope.

**Source changes to review:** Inherited from feature dependencies.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N24-T1 | **Product** — Obtain role-based UAT on approved source revision and HR-owned sample scenarios | Named reviewers accept scope; open noncritical defects have explicit impact/workaround. |
| N24-T2 | **Operations** — Finalize account provisioning, training, support contacts, runbooks and service costs | Users can access without shared admin credentials; named people own incidents and backups. |
| N24-T3 | **Data** — Rehearse cutover freeze/change capture, reconciliation and rollback including new writes | Pilot cohort and go/no-go triggers agreed; old source remains recoverable with controlled access. |
| N24-T4 | **QA** — Observe pilot, reconcile daily business totals and verify monitoring/notification delivery | No unresolved critical issues; users complete tasks without developer intervention. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## N25 — Production rollout and stabilization

**Depends on:** N24. **Status:** planned.

**Demo:** Expand from the accepted pilot to the agreed user groups with operational evidence.

**Reference files:** `src/Ops.gs`, `src/Readiness.gs`.

**Primary requirements:** Cross-cutting foundation / release scope.

**Source changes to review:** Inherited from feature dependencies.

| Task | Work and owner lane | Acceptance evidence required |
|---|---|---|
| N25-T1 | **Release** — Deploy tagged reviewed build through controlled pipeline and approved migration | Release manifest includes code, configuration, migrations, evidence and rollback steps. |
| N25-T2 | **Operations** — Expand cohorts gradually and monitor latency, errors, jobs, security and support | Pause criteria are enforced; real usage informs sizing before all-user expansion. |
| N25-T3 | **Data** — Reconcile transferred records and post-cutover transactions with HR | Exception ownership and recovery for lost/misassigned records are documented and resolved. |
| N25-T4 | **Product** — Close stabilization, hand over repository/hosting/access and schedule maintenance | Kandil can operate and restore system; deferred features stay visible in backlog. |

**Review:** Ibrahim integrates; HR reviews policy/UX; technical reviewer checks implementation. Named assignments and story estimates are made before sprint start. Legal/security/provider acceptance uses the separate decision and release gates.

## Parallel work without broken dependencies

- N01 UI and N02 data/threat modelling can overlap after N00 baseline, but finish shared API/state contracts together.
- Inside each feature sprint: backend owns schema/domain commands; frontend works against agreed fixtures/contracts; QA writes role and exception scenarios; integration validates the real path.
- N06 JD work can proceed alongside N05 organization after stable position/job contracts; N07 needs the tested result.
- N10 privacy and N11 source catalogue/ad work may overlap after N09; referral/agency mutations depend on final identity/consent contracts.
- N16 onboarding and N17 lifecycle can be prepared concurrently after N15; actual integration follows dependencies in the tracker.
- N19 metric definitions start during N02, while real reports wait for source events. N21 shared-identity/provider discovery starts during N00 even though final integration is later.
- N20 is optional only by explicit scope decision. Its omission must retain SCR-001 and source changes in the deferred register.
- Security, accessibility and performance checks happen throughout; N23 is independent verification, not the first security work.
- Use isolated branches/worktrees and test databases; one schema owner coordinates migrations. Parallel agents do not share destructive fixtures.

## Before coding: exact package to approve

1. N00 scope, 98-ID mapping and disposition of 109 change entries.
2. Workflow/state catalogue and role/field-access matrix.
3. AR/EN clickable journeys, navigation and visual components.
4. ERD, module ownership, API contracts and source-system integration matrix.
5. Decisions C01–C12, with unresolved items explicitly gated.
6. Backlog estimates, hosting cost assumptions and named HR/IT/security reviewers.

No new provider subscriptions or production data are needed for this planning package.
