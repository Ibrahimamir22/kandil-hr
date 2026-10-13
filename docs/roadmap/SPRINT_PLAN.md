# قنديل — HR delivery sprint plan

The [recovery operations checkpoint](S5_RECOVERY_OPERATIONS_CHECKPOINT.md) preserves original requests across session loss, clears displayed private state on confirmed logout and returns to the actor-owned inbox after sign-in. **19 session checks, 42 recovery UI checks and 10 isolated scheduler/worker checks passed.** Native scheduled cleanup respected its 100-row bound and recovered after worker restart without changing business records. Ordinary candidate mode remains disabled until controlled review-cohort activation. Full S5 and release gates remain open.

Earlier checkpoints below retain their original scope and outstanding work at the time; the current status above supersedes their recovery next-step notes.

The [reviewed migration checkpoint](S5_MIGRATION_APPLY_CHECKPOINT.md) adds HR-confirmed legacy identity links, stale-preview rejection, transactional preservation checks and exact-command retries in AR/EN. **48 native and 63 browser checks passed**, including simultaneous first writes. Ordinary candidate mode stays disabled pending recovery across navigation/reloads; full S5 and production gates remain open.

The [S5 search and migration-preview checkpoint](S5_SEARCH_MIGRATION_PREVIEW_CHECKPOINT.md) adds search/duplicate review against corrected person details, preserves historical application search, and provides a read-only HR legacy-record review in AR/EN. **46 native and 46 browser checks passed.** Applying migration links, recovery across navigation and ordinary intake activation remain pending; full S5 and release gates stay open.

The [S5 profile correction checkpoint](S5_PROFILE_CORRECTIONS_CHECKPOINT.md) adds reasoned AR/EN basic-profile corrections, before/after review and permission-filtered revision history while preserving application snapshots. **74 native checks passed**, with 24 affected checks rerun after final link validation, plus **37 browser checks** covering intake, corrections, retries, competing edits and revocation. Full S5 remains open; ordinary intake/correction activation remains disabled pending migration and recovery work.

The [S5 candidate workspace checkpoint](S5_CANDIDATE_WORKSPACE_CHECKPOINT.md) adds scoped AR/EN candidate lists, basic person/application details and reviewed recruiter intake. **35 native and 25 candidate browser checks passed**, including lost-response retry, concurrent creation and access revocation. This is partial S5 delivery: full profiles/history, migration, ownership actions, private files, consent and sourcing remain open. Intake was tested under a temporary synthetic-site lease and remains disabled for ordinary review traffic.

The [team notification checkpoint](S4_TEAM_NOTIFICATIONS_CHECKPOINT.md) passed **60 native and 37 browser checks**, with inspected English desktop and Arabic mobile captures. Assignment notices exclude the actor, include lead/support changes and consolidate bulk updates into one summary per recipient. S4 business acceptance and recruiter-wide MOVE_ALL remain open. The [S5 implementation contract](S5_IMPLEMENTATION_BRIEF.md) defines the next candidate/person, application, sourcing and privacy work; that contract is planning, not a completed candidate workspace.

The [vacancy filter checkpoint](S4_FILTER_SELECTORS_CHECKPOINT.md) replaces exact-name company/department/location fields with scoped searchable selectors. **31 native and 65 browser checks passed**, including AR/EN, dependent resets, stale responses and lookup retry. S4 HR acceptance and shared ownership workflows remain open; full candidate work follows in S5.

The [scheduled invitation catch-up checkpoint](S4_INVITATION_CATCHUP_CHECKPOINT.md) adds **10 passed real scheduler/worker checks** for missed event jobs, later delegates and duplicate suppression in a separate sandbox. The [eight-ID reconciliation](S4_REQUIREMENT_RECONCILIATION.md) tracks the selector evidence and remaining HR acceptance and candidate-workspace gaps. **S4 remains in progress.**

The [event-triggered invitation checkpoint](S4_INVITATIONS_CHECKPOINT.md) verifies post-commit request/delegation jobs, current-authority recipients and bilingual inbox actions with 86 native and 23 HTTP/RQ/browser checks. Generation is event-triggered; delivery follows the outbox worker schedule. Periodic catch-up now has separate evidence; complete S4 acceptance remains open.

The [bilingual event-template checkpoint](S4_EVENT_TEMPLATES_CHECKPOINT.md) verifies ordinary request/completion messages, readable skipped-route HR notices and minimal vacancy/application assignments with 56 native and 26 browser checks. Event-triggered invitations now have separate evidence; complete S4 event policy and HR wording acceptance remain open.

The [current-authority reminder checkpoint](S4_REMINDER_RECIPIENTS_CHECKPOINT.md) verifies effective delegates, frozen Board Vice, revocation checks, fixed AR/EN milestone payloads and duplicate prevention across authority changes with 63 native and 20 browser checks. The [event matrix](S4_NOTIFICATION_MATRIX.md) tracks delivered ordinary templates/invitations and the remaining acceptance gaps. S4 is still in progress.

The [deadline/calendar checkpoint](S4_DEADLINES_CHECKPOINT.md) adds permission-checked Arabic/English approval dates and calendar-aware queued reminders. Holiday deferrals do not consume attempts, corrected calendars can wake due notices, and obsolete milestones are suppressed. Expiry remains advisory; S4 recipient/templates and HR acceptance remain open.

The [native scheduler checkpoint](S4_SCHEDULER_CHECKPOINT.md) verifies automatic reminders, due retries, disabled-recruiter fallback and worker-restart redrive with 15 integration checks and 35 focused native cases. The newer deadline checkpoint covers the date panel and queued calendar behavior; complete delivery policy/templates remain open.

The [worker recovery checkpoint](S4_WORKER_RECOVERY_CHECKPOINT.md) verifies real isolated RQ process crashes before/after commit, bounded retries, reasoned operator recovery and revoked-recipient suppression with 35 checks. Scheduled retry/redrive and disabled-recruiter fallback are now covered by the newer scheduler checkpoint; complete templates and candidate-facing ownership acceptance remain open.

**Active goal:** complete the custom Arabic/English HR portal over Frappe HR, using the reference requirements and verified acceptance gates. Odoo and other departments remain separate.

The [requester-event and reminder checkpoint](S4_NOTIFICATION_EVENTS_CHECKPOINT.md) adds minimal AR/EN amendment/route-skip updates, scoped original-baseline access for submitted amendment reviewers, stale approval-step reminder suppression and event-time inbox ordering. Native scheduled execution now has separate evidence; final event/recipient policy remains open.

**Starting point:** the first connected hiring journey is implemented and has recorded 10 native + 31 HTTP + 24 browser checks. The older 80-case baseline is 70 passed / 6 partial / 4 blocked at its own checkpoint. Neither result proves complete HR parity or production readiness.

**Current engineering focus: S5 — candidates and sourcing.** [S3 engineering verification](S3_ENGINEERING_REVIEW.md) records 215 native checks, 350 AR/EN browser checks and three concurrent HTTP scenarios. All 17 S3 IDs have [explicit evidence](S3_REQUIREMENT_RESULTS.json). S3 remains open for HR policy/terminology/UAT acceptance; S2 document/history acceptance and live email also remain open. S0/S1 engineering stabilization is complete.

The [S4 vacancy checkpoint](S4_VACANCY_QUEUE_CHECKPOINT.md) covers the dedicated read model and AR/EN queue. The [team-assignment checkpoint](S4_TEAM_ASSIGNMENT_CHECKPOINT.md) adds complete-team editing, paginated eligible-recruiter search and reviewed multi-request bulk assignment, with native and real-session test evidence. The [lifecycle checkpoint](S4_VACANCY_LIFECYCLE_CHECKPOINT.md) adds reviewed state transitions and temporary priority pins with ordinary-session concurrency/retry proof. The [dashboard checkpoint](S4_DASHBOARD_CHECKPOINT.md) adds exact current-scope totals and paginated approval actions with 72 distinct native and 58 browser checks across the recorded runs. The [notification inbox checkpoint](S4_NOTIFICATION_INBOX_CHECKPOINT.md) connects delivered messages and current-reference privacy, including native notification reads. The [S4 brief](S4_IMPLEMENTATION_BRIEF.md) retains complete event/recipient coverage, business-calendar reminders, searchable organization filters and scheduled delivery. S4 remains in progress; earlier evidence remains in the tracker.

The current 80-case register is **72 passed / 4 partial / 4 blocked**. Completing S1 does not complete all 98 requirements or the pending HR/IT/security/production decisions.

## How to use this plan

- `tracker.json` is the current machine-readable task tracker; this file explains scope and acceptance.
- `reference-coverage.csv` allocates every one of the 98 original IDs to a sprint. No requirement is removed or marked accepted just because it was assigned. The original 80-case baseline and the archived supplemental packages remain separate acceptance inputs.
- Aim for a review every two weeks. These are outcome groups, not promises that each group takes exactly two weeks. Split oversized groups and re-estimate after S1; no fixed end date is committed.
- The implementer owns code/tests/GitHub delivery. HR owns business rules and UAT; IT owns identity, hosting, recovery and operational decisions. Their unresolved choices do not stop independent engineering work.
- Related UI, API and test work can overlap only after contracts are agreed. One owner integrates shared schemas and headcount; shared-site mutation tests run serially. No parallel-agent work is automatically started by this document.

## Sprint overview

| Sprint | Outcome | Current status | Depends on |
|---|---|---|---|
| S0 — Repository and architecture clarity / وضوح المعمارية والمستودع | One navigable project repo with all custom source, plans and exact upstream links. | complete | — |
| S1 — Stabilize the existing portal / تثبيت المسار الحالي | The current hiring journey has a verified baseline and remaining defects are explicit. | complete | S0 |
| S2 — Organization and job descriptions / الهيكل والوصف الوظيفي | HR can manage the organization through the custom website. | in_progress | S1 |
| S3 — Full hiring requests and approvals / الطلبات والاعتمادات | The reference request and authority workflow is available in the custom portal. | in_progress | S2 |
| S4 — Vacancy operations and notifications / الشواغر والتنبيهات | Recruiters manage actionable vacancies and reliable follow-up from the portal. | in_progress | S3 |
| S5 — Candidates and sourcing / المرشحون والمصادر | Recruiters can receive, find and manage candidates safely. | in_progress | S4 |
| S6 — Interviews and selection / المقابلات والاختيار | Interviews and selection follow the agreed process with private evaluations. | planned | S5 |
| S7 — Offers and compensation / العروض والبيانات المالية | HR can produce and approve accurate versioned offers with restricted salary access. | planned | S6 |
| S8 — Joining, documents and onboarding / المباشرة والملف والتهيئة | Actual joining creates the correct employee and onboarding records exactly once. | planned | S7 |
| S9 — Probation, transfers and lifecycle / التجربة والنقل ودورة الموظف | HR manages post-joining changes without breaking privacy or historical headcount. | planned | S8 |
| S10 — Reports, guides and selected integrations / التقارير والأدلة والربط | HR receives reconciled reports and explicitly tested connected services. | planned | S5, S6, S7, S8, S9 |
| S11 — Security, capacity and migration rehearsal / الأمان واختبار السعة | A frozen release candidate has evidence for the agreed security, performance and recovery targets. | planned | S10 |
| S12 — Staged release and handover / التشغيل التدريجي والتسليم | An explicitly approved production rollout is reconciled, monitored and owned. | planned | S11 |

## S0: Repository and architecture clarity / وضوح المعمارية والمستودع

One navigable project repo with all custom source, plans and exact upstream links.

**Work:**

- `S0-01` Publish the architecture map and responsibility of every main folder.
- `S0-02` Add upstream/frappe, upstream/erpnext and upstream/hrms as exact Git submodule links matching the installer lock.
- `S0-03` Publish this sprint tracker and a complete allocation of all 98 reference requirements.
- `S0-04` Preserve original test evidence and the archive; distinguish working features, incomplete work and release gates.

**Exit checks:**

- All three source links match the version lock; reference mapping has 98 unique IDs with no omissions.
- New source/docs are committed and pushed; remote SHA equals local HEAD.

**Possible overlap:** Documentation and source inventory are independent; one integrator stages source links.

## S1: Stabilize the existing portal / تثبيت المسار الحالي

The current hiring journey has a verified baseline and remaining defects are explicit.

**Work:**

- `S1-01` Reconcile the 80-case historical baseline and current portal evidence with the actual source; list every unresolved clause without changing frozen expected results.
- `S1-02` Finish and prove exact pending reservation 2→3 delta, all-location atomicity, restarted approvals and durable shortage denial; retain existing headcount work.
- `S1-03` Run affected authority/audit/outbox/permission regressions, independent-connection contention and ordinary-session HTTP tests.
- `S1-04` Verify real AR/EN screens for the pending revision and denial path; retain form input and show reviewed quantities.
- `S1-05` Freeze portal/API conventions: personal sessions, field projections, pagination, errors, command IDs, version checks and no browser-held service secrets.
- `S1-06` Record HR terminology, role/policy questions, identity/MFA choice, audit custody and workload assumptions with owners.

**Exit checks:**

- Both exact headcount cases pass every clause, including committed HTTP denial and contention; otherwise remain partial.
- Requester/manager/HR separation, revocation, duplicate/stale actions and native/resource bypass checks pass.
- The original request → approvals → vacancies journey still passes on a fresh cohort; HR review remains distinct.

**Possible overlap:** API review, visual feedback and requirements mapping can overlap; all shared-site mutation tests run serially.

**External decisions / owners:**

- HR: authority/headcount policy and Arabic terms.
- IT: identity/MFA, recovery owner and external audit custody.

## S2: Organization and job descriptions / الهيكل والوصف الوظيفي

HR can manage the organization through the custom website.

**Work:**

- `S2-01` Build department/branch/position tree and distinguish job, position, employee and vacancy.
- `S2-02` Connect effective-dated assignments, structural revisions and independent organization approvals.
- `S2-03` Add reviewed CSV import, validation/error preview and occupied-baseline reconciliation.
- `S2-04` Connect JD versions, weighted KPIs and approved AR/EN documents/worker cards.
- `S2-05` Show dated history and differences; prohibit silent overwrite of historical assignments.

**Exit checks:**

- Cross-scope organization access fails through list/detail/export/API routes.
- Imports reconcile, rejected rows cannot partially overwrite records, and effective dates produce correct counts.
- HR reviews tree, terminology and document layouts.

**Possible overlap:** Tree UI, JD presentation and import validation can overlap after shared IDs/contracts freeze.

## S3: Full hiring requests and approvals / الطلبات والاعتمادات

The reference request and authority workflow is available in the custom portal.

**Work:**

- `S3-01` Complete every agreed request field, replacement information, skills, employment terms and multi-location quantities.
- `S3-02` Expose route preview, self-interest exclusions, missing-authority handling and exception reasoning.
- `S3-03` Connect dated delegation, independent CEO/Board decisions and supporting evidence.
- `S3-04` Complete return/revise/reject/cancel, approved amendments and requested-versus-approved histories.
- `S3-05` Integrate the S1 pending-quantity command into the final request UX with reapproval notice and safe retries.

**Exit checks:**

- All mapped request/authority requirements have role-specific positive and negative evidence.
- Material revisions retain old decisions and restart the required approvals; seats and vacancies reconcile.
- No screen or native endpoint bypasses server authority.

**Possible overlap:** Request wizard and approval inbox can overlap; capacity and shared authority changes have one owner.

## S4: Vacancy operations and notifications / الشواغر والتنبيهات

Recruiters manage actionable vacancies and reliable follow-up from the portal.

**Work:**

- `S4-01` Complete vacancy lead/team assignment, unassigned queue, bulk actions, priority and reasoned pinning.
- `S4-02` Expose pause/resume/close/cancel and partial-fill progress without corrupting capacity.
- `S4-03` Replace page-only dashboard counts/search with correctly scoped server-wide projections and pagination.
- `S4-04` Implement action inbox, business-calendar deadlines, reminders and in-app notifications.
- `S4-05` Verify outbox retries, worker restart recovery, disabled recruiter handoff and email templates in local capture.

**Exit checks:**

- Parallel/repeated assignment and notifications have one intended effect.
- Scheduled reminders run without a user opening a page; failure/retry states are visible.
- Counts reconcile and unauthorized search/export reveals no records.

**Possible overlap:** Vacancy screens, notification templates and read-model work can overlap after contracts freeze.

**External decisions / owners:**

- HR: priority/SLA calendar.
- IT/owner: email provider/test recipients before any external sending.

## S5: Candidates and sourcing / المرشحون والمصادر

Recruiters can receive, find and manage candidates safely.

**Work:**

- `S5-01` Implement person identity plus distinct applications; reviewed deduplication, former/internal candidates and history.
- `S5-02` Build candidate workspace, private CV/documents, follow-up/activity queue and rejection records.
- `S5-03` Add sourcing channels, ads/apply links, referrals, agencies and subscription-credit records.
- `S5-04` Implement small-batch imports with preview and per-row outcomes; shared phones never trigger automatic merges.
- `S5-05` Build consent/version/retention controls, talent pool and scoped candidate self-service uploads.
- `S5-06` Test token expiry, enumeration, malicious uploads, object ownership and recruiter-on-behalf history.

**Exit checks:**

- All candidate/source requirements mapped here have acceptance cases and evidence.
- Private files are permission-checked; guessed IDs/tokens and cross-company requests fail.
- Consent/export/deletion holds and internal-note separation work.

**Possible overlap:** Recruiter UI, intake and sourcing can overlap once identity/privacy/API contracts are stable.

**External decisions / owners:**

- HR/privacy owner: retention, consent wording, candidate access and public intake scope.

## S6: Interviews and selection / المقابلات والاختيار

Interviews and selection follow the agreed process with private evaluations.

**Work:**

- `S6-01` Add confirmed slots, rescheduling, conflicts, invitations, reminders and candidate check-in/wait times.
- `S6-02` Build panel roles, interview plans, approved waivers and JD/question-bank views.
- `S6-03` Implement assessments and independent structured feedback with permitted release timing.
- `S6-04` Build comparison/decision readiness, reserve candidates and consented reference checks.
- `S6-05` Test no-show, timezone boundaries, late feedback and escalation.

**Exit checks:**

- An unconfirmed interview cannot trigger an invitation.
- Blind feedback remains private through APIs, exports and UI until authorized release.
- HR can complete a full candidate → interview → selection scenario in AR and EN.

**Possible overlap:** Scheduler, feedback forms and assessment library can overlap against stable candidate contracts.

## S7: Offers and compensation / العروض والبيانات المالية

HR can produce and approve accurate versioned offers with restricted salary access.

**Work:**

- `S7-01` Implement scoped grade/benefit data, approved calculation rules and the reference salary/disclosure trail.
- `S7-02` Connect offer drafting, authority thresholds, negotiation, revision and reapproval.
- `S7-03` Add expiry/extension, acceptance/decline and reserve-candidate handling.
- `S7-04` Build approved AR/EN offer and preliminary contract templates with private download access.
- `S7-05` Verify monetary precision, effective-dated rules and concurrent version decisions.

**Exit checks:**

- Unauthorized users cannot see compensation in any response, report or file.
- Expired/superseded offers cannot be accepted; concurrent actions cannot overwrite decisions.
- HR validates calculation examples and document templates.

**Possible overlap:** Offer UX, calculation examples and templates can overlap; financial rules need one approved specification.

**External decisions / owners:**

- HR/payroll owner: formulas, authority thresholds and reviewed templates.

## S8: Joining, documents and onboarding / المباشرة والملف والتهيئة

Actual joining creates the correct employee and onboarding records exactly once.

**Work:**

- `S8-01` Connect planned date history, actual joining, no-show reasons and seat handling.
- `S8-02` Reuse and revalidate Employee/Assignment/Onboarding creation with replay and concurrency tests.
- `S8-03` Build private employee file: upload/review/version/expiry, physical receipts and approved deferrals.
- `S8-04` Deliver orientation, HR/manager tasks, welcome gift and confidential day-7/day-30 feedback.
- `S8-05` Add social-insurance case tracking and BioTime enrollment task; do not label the task as device integration.
- `S8-06` Enforce the reference rule that overdue documents create HR alerts only, never wage withholding or payroll actions.

**Exit checks:**

- Concurrent joining creates one employee/assignment/onboarding effect set; no-show does not occupy a seat.
- Private documents and feedback are isolated by role and scope.
- DOC-002 and wage/payroll-isolation clauses are tested with actual records.

**Possible overlap:** File workflows, onboarding screens and feedback privacy can overlap after joining contracts stabilize.

**External decisions / owners:**

- HR: required documents, deferral policy and onboarding responsibilities.

## S9: Probation, transfers and lifecycle / التجربة والنقل ودورة الموظف

HR manages post-joining changes without breaking privacy or historical headcount.

**Work:**

- `S9-01` Deliver probation checkpoints, observations, reminders, final evaluation and confidential follow-up.
- `S9-02` Create medical-insurance case only after approved qualifying outcome.
- `S9-03` Implement transfer approvals, target capacity, effective dates, source/target history and replacement prompts.
- `S9-04` Implement controlled corrections/voids and exit/deactivation with session revocation and work reassignment.
- `S9-05` Keep exit settlement/payroll outside this scope until separately specified.

**Exit checks:**

- Future transfers do not alter current headcount; due transfers affect both sides once.
- Probation confidentiality and qualifying insurance rules pass negative tests.
- Disabled accounts lose access and work handoff retains private history.

**Possible overlap:** Probation and transfer UI can overlap; assignment/capacity mutations require one integrator.

## S10: Reports, guides and selected integrations / التقارير والأدلة والربط

HR receives reconciled reports and explicitly tested connected services.

**Work:**

- `S10-01` Define and implement funnel/source yield, request progress, bottlenecks, forecasts and evaluation reports.
- `S10-02` Complete process map, role help, accessible bilingual UX and scoped search/export.
- `S10-03` Implement approved identity/appraisal SSO and email adapters with sandbox outage/retry tests.
- `S10-04` Map reviewed employee/position imports from current Sheets; record source provenance.
- `S10-05` Implement assisted CV evidence only after provider/purpose/budget approval; human owns hiring decisions.
- `S10-06` Reconcile all 98 requirements and supplemental acceptance packages; expose every remaining gap.

**Exit checks:**

- Reports reconcile to transactions under filters/exports and respect privacy.
- Identity/provider failures never grant access; external sending only to approved recipients.
- No required AI/integration feature is silently relabelled done when its provider or approval is absent.

**Possible overlap:** Reports, documentation and independently scoped adapters can overlap.

**External decisions / owners:**

- HR/IT: identity/appraisal access, provider configuration, AI consent/budget if retained in scope.

## S11: Security, capacity and migration rehearsal / الأمان واختبار السعة

A frozen release candidate has evidence for the agreed security, performance and recovery targets.

**Work:**

- `S11-01` Run original unchanged acceptance cases plus full-reference portal/API/native bypass regressions.
- `S11-02` Validate real MFA, new-device/session handling, revocation, privileged actions and external audit custody.
- `S11-03` Run independent security assessment and retest findings on representative staging.
- `S11-04` Measure mixed-workload load, contention, sustained soak, large files and queue recovery with 1,000+ accounts.
- `S11-05` Rehearse clean clone/install, upgrade, import/file reconciliation, encrypted backup restoration and rollback.
- `S11-06` Complete HR real-role AR/EN/mobile/accessibility UAT and operational runbooks.

**Exit checks:**

- Zero unexplained ledger/data variance or permission bypass; no unresolved critical/high findings accepted by default.
- Approved concurrent workload, latency/error and recovery targets are met on the proposed topology.
- Mandatory feature cases pass or the user explicitly approves a reduced release scope; evidence matches frozen source.

**Possible overlap:** Security, browser and capacity reviews may use isolated environments; never contend over one shared test database.

**External decisions / owners:**

- HR/IT: staging budget, assessor, performance/recovery targets, identity/audit choices and named UAT reviewers.

## S12: Staged release and handover / التشغيل التدريجي والتسليم

An explicitly approved production rollout is reconciled, monitored and owned.

**Work:**

- `S12-01` Prepare cutover journal, backup, legacy write-freeze, delta import and rollback decision point.
- `S12-02` Obtain concrete release approval after all evidence and remaining risks are reviewable.
- `S12-03` Roll out to named HR pilot, then approved 50/200/full cohorts with stop criteria.
- `S12-04` Train roles and deliver admin/user guides, support contacts and private secret handover.
- `S12-05` Tag the tested release, verify GitHub, reconcile the running revision and run at least ten business days of hypercare.

**Exit checks:**

- HR accepts workflows; IT accepts monitoring, recovery and support ownership.
- No unresolved critical incident, unexplained import variance or failed access boundary.
- Approved cohorts complete real tasks; known issues have owners and follow-up dates.

**Possible overlap:** Training and handover preparation can overlap S11; actual cutover has one accountable owner.

**External decisions / owners:**

- User/HR/IT: hosting/spend, real-data authorization and production release approval.

## Security and 1,000+ users

Security is part of every sprint; S11 is the final assurance gate. Server authorization applies to UI, direct API, native forms, files and exports. Tests include cross-company access, disabled users, stale approvals, concurrent capacity changes, replay, file access, confidential salary/feedback and audit failure.

The population is 1,000+ accounts, not an assumption of 1,000 simultaneous sessions. In S1 establish expected peak active users, actions/minute, request mix, data growth, attachment size and uptime/recovery needs. A provisional synthetic characterization can use 25/50/100 active sessions with 80% scoped reads and 20% writes, a 30-minute plateau and a two-hour soak. Proposed—not approved—targets are p95 read <1s, write <2s and unexpected errors <0.5%; business conflicts/denials are reported separately. Require zero data/ledger corruption. The final workload and targets must reflect HR/IT usage and proposed hosting; laptop timing does not certify production.

Use encrypted private backups, tested restore, scoped roles, approved MFA/session policy, monitoring and independent assessment before real staff rollout. Secrets, private HR files and databases stay outside Git.

## Immediate S1 execution order

1. Read current pending-revision/denial implementation against the frozen two-case contract.
2. Run native rollback tests serially on the isolated parity site; fix any failure without weakening expectations.
3. Run fresh-cohort ordinary-session HTTP and independent-connection race tests.
4. Verify the actual AR/EN UI, form retention and approval restart; rerun affected regression at frozen source.
5. Promote only fully evidenced cases, update current tracker, commit/push and verify GitHub.

## Completion rule

- Agreed cases including negative permissions and concurrency where relevant pass.
- AR/EN/RTL/mobile and accessible primary interactions are checked.
- Immutable history, privacy and headcount invariants hold.
- Tests and documentation match source; incomplete clauses stay visible.
- No secrets in Git; coherent commit pushed and remote SHA verified.
- Human acceptance is separately recorded and never inferred from automated tests.
