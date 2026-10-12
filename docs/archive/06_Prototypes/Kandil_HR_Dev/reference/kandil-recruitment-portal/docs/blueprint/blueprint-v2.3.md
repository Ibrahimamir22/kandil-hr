# Kandil Egypt — Recruitment System Master Blueprint v2.3

Oct 7, 2026 · @Mohamed Omara

## 0. Document control

v2.3 is the single source of truth (updated 9 Oct 2026 with the v0.33 review decisions CHG-72 to CHG-87; built from v0.34.0; CHG-74 to CHG-78 built in v0.36.0; CHG-73, CHG-82 and the operations part of CHG-79 built in v0.37.0; CHG-80 and CHG-81 built in v0.38.0; CHG-83 and the private-link rules of CHG-82 built in v0.39.0; CHG-84 built in v0.40.0; CHG-85 and CHG-86 built in v0.41.0; CHG-87 built in v0.42.0; CHG-88 built in v0.42.1; CHG-89 built in v0.42.2; CHG-90 built in v0.43.0; CHG-91 built in v0.44.0; CHG-92 built in v0.44.1; CHG-93 built in v0.44.2; CHG-94 fixed in v0.44.3; CHG-95 built in v0.44.4; CHG-96 built in v0.45.0; CHG-97 and CHG-98 built in v0.45.1; CHG-99 built in v0.46.0, one-line menu items in v0.46.1; CHG-100 built in v0.46.2; CHG-101 built in v0.47.0; CHG-102 built in v0.48.0; CHG-103 built in v0.48.0; CHG-104 to CHG-106 built in v0.49.0; CHG-107 to CHG-109 built in v0.50.0) and supersedes v2.1, v2.0, v1.4, v1.3 and v1.2. v2.1 kept every v2.0 requirement and applied 18 corrections found by reading the full original design conversation line by line, not from model memory. v2.3 brings the document in line with the portal as built (v0.31.0, 7 Oct 2026): owner decisions CHG-61 to CHG-71, probation, medical insurance and KPIs as built (17.2, 17.3, 18), phase status (27) and the status of every requirement (29).

Change rule: no requirement is added, removed or reworded in code first. Every change gets a REQ ID, a source and a blueprint section here, then it is built.

| # | Change | Source | Section |
| --- | --- | --- | --- |
| CHG-01 | Headcount exception approvable only by HR Manager or CEO (removed from open items) | Owner decision, design chat | 5 |
| CHG-02 | New Position: requester's management chain endorses (not approves); HR review; CEO final approval | Owner decision, design chat | 3.4 |
| CHG-03 | HR Manager may edit defined request fields; requester notified of every edit and every approval step; request timeline | Owner's first brief + Module 1 | 4 |
| CHG-04 | HR Sector Manager role = Mohamed Omara; sole authority over grade, salary, benefits, working conditions | Owner decision, 30 Sep 2026 | 3, 19 |
| CHG-05 | Interview Question Bank linked to Competency Library; HR standard questions auto-shown in HR interview | Owner's first brief | 11 |
| CHG-06 | JD outputs: view, print, PDF, email; ad templates per platform generated from JD; Apply link per ad | Owner's first brief + Module 2/3 | 3.3, 7 |
| CHG-07 | Candidate privacy notice acceptance on the application form | Module 3 design | 9 |
| CHG-08 | Practical / technical Assessment stage added to the candidate journey | Owner decision, 30 Sep 2026 | 12 |
| CHG-09 | One Vacancy per location: an approved request splits automatically into location vacancies | Owner decision, 30 Sep 2026 | 7 |
| CHG-10 | Offer validity date + audited extension; five-figure salary trail | Module 6 design | 13 |
| CHG-11 | Deferred documents trigger HR alerts only; the system has no wage or payroll action | Owner decision, 30 Sep 2026 | 14 |
| CHG-12 | Behavior/Safety Issue restored to the probation performance log | v1.0 blueprint | 17 |
| CHG-13 | Offer-decline, did-not-join and withdrawal reason lists restored | v1.4 blueprint | 10, 13, 14 |
| CHG-14 | Phase-1 identity: personal Gmail + email OTP login; spreadsheet owner-only; Workspace migration path | Owner decision, 30 Sep 2026 | 2, 23 |
| CHG-15 | Baseline HC: every position loaded with Structural HC = 1 until a manpower plan exists; HC Basis flag; HC checks warn-only | Owner decision, 30 Sep 2026 | 2, 5 |
| CHG-16 | Payroll-sheet link deferred beyond Phase 1; Occupied HC maintained by HR until then | Owner decision, 30 Sep 2026 | 2, 5 |
| CHG-17 | Notification channel budget because of personal-Gmail sending limits | Technical constraint | 2, 18 |
| CHG-18 | Requirements traceability matrix with stable REQ IDs | Audit recommendation | 29 |
| CHG-19 | UX-001 and ACC-004 added: the portal follows the Performance Appraisal portal's design and spirit (greeting and progress message, «المطلوب منك», idle auto-lock, remember-me, friendly in-portal guide); login to be unified with the appraisal system later | Owner decision, 30 Sep 2026 | 23, 24, 29 |
| CHG-20 | Phase 2 simplification: a structural change approved by the CEO creates the position in the active org version and logs it in position history; full org-version snapshots are deferred | Build decision, Phase 2 | 3, 20 |
| CHG-21 | Internal transfer added: a vacancy can be filled by moving a current employee, and all movement between units follows one transfer process (MOV-001…004), spread over Phases 2, 3 and 6 | Owner request, 30 Sep 2026 | 7.4, 27, 29 |
| CHG-22 | Structure editing screen added to Phase 2 (ORG-007), so future structural changes need no re-import; from Phase 3 on, data access is written as targeted queries to keep a later move to a real database (e.g. Supabase) cheap | Owner request, 3 Oct 2026 | 3, 23, 29 |
| CHG-23 | Real structure reconciled from the requisition-form Jobs sheet and the Korn Ferry chart (Jul 2025): 285 positions, 77 units, 219 job titles in 21 families; new coding (ORG-008). Legal entities and sister companies (Enarat, Le Chateau) deferred to a later phase (ORG-009) | Owner decision, 3 Oct 2026 | 3, 29 |
| CHG-24 | Chairman and Vice Chairman added above the CEO (EXE-001/002, CEO EXE-003); board approval level added to requests and structural changes (BRD-001), with a rules screen for temporary board/CEO rules | Owner decision, 3 Oct 2026 | 6, 29 |
| CHG-25 | Phase 3A built (v0.3.0): person master with duplicate flagging, public apply page per vacancy (AR/EN, CV upload, consent, source from link), per-vacancy pipeline NEW→CONTACTED→SCREENING→SHORTLISTED + ON\_HOLD/REJECTED/WITHDRAWN, activity log (void, never delete), next action + My tasks, message templates, internal-candidate manager notice at shortlist; hiring manager sees shortlist only (no salary/contact). Salaries asked with no 'prefer not to say' option, blanks allowed; national ID optional | Owner decision, 3 Oct 2026 | 8–10 |
| CHG-26 | HR Sector Manager's own request is approved on submission (line steps skipped, HR step recorded, classification = requested priority) except jobs reporting directly to the CEO, which still go to CEO and board | Owner decision, 4 Oct 2026 | 6 |
| CHG-27 | Overlapping saves fixed: sheet writes flushed before the lock is released, ID counters self-repair on upgrade, UI blocks a second click while saving | Defect, 4 Oct 2026 | Technical |
| CHG-28 | New look (v0.4.0): Kandil identity colors (red #A8111C, gold #C6A151), Almarai font (closest free to GE SS Two), type scale, and six status color families used everywhere: done, rejected/late, needs your action, moving, partial/escalated, neutral | Owner decision, 4 Oct 2026 | UX |
| CHG-29 | Locations: factories, admin building and each of the 15 branches as its own location; showroom positions sit under the branch group and every request line picks the branch (one vacancy per branch); branches managed from a screen | Owner decision, 4 Oct 2026 | 5, 6 |
| CHG-30 | Employment type Daily (يومية) added; portal skills scale kept; old sector-based job codes dropped | Owner decision, 4 Oct 2026 | 6 |
| CHG-31 | Printed request copy (HR-REC-F02 v07) with a status stamp at print time and a watermark on non-final copies; every print audited; the old requisition form to be retired when the portal goes live | Owner decision, 4 Oct 2026 | 6 |
| CHG-32 | Agreed next steps, in order: employee master + end-of-service (occupied HC computed; resignation offers a ready replacement request; periodic reconciliation with payroll), job descriptions inside the system with the new-position process including the JD, English UI with per-user language control (user choice / forced Arabic / forced English), then Phase 3B | Owner decision, 4 Oct 2026 | Roadmap |
| CHG-33 | Employee master built (v0.5.0), in its own HR-only spreadsheet: bulk import from the reviewed appraisal mapping workbook (approved position + branch, per-employee override, managers' emails for portal accounts; never exits anyone missing from the file). After the first import, Occupied HC of every position is counted from active employees and can no longer be typed. End of service with a future last day keeps the employee counted until then and sends his nearest manager with a portal account a ready replacement request. Vacancy fills create, re-hire or move employees by code; voiding reverses them. Branch-group positions take a branch, or stay on the group for staff covering all branches | Owner decision, 4 Oct 2026 | 2, 5, 7 |
| CHG-34 | Job grades = Korn Ferry Job Level 1–15 (15 highest), loaded on 216 jobs (v0.5.1). Job descriptions built on a company competency library (core, leadership, functional by family; 4 proficiency levels; interview questions and practical tests) and seven job levels (worker → sector head); JDs written and approved by HR only, versioned; a request on a job without an approved JD shows a warning only. Pilot families: showroom sales/installation and production | Owner decision, 4 Oct 2026 | 3.3, 11 |
| CHG-35 | Job descriptions built into the portal (v0.6.0): competency library tables, versioned JD per job code (draft → approved → superseded), bulk import of the reviewed workbooks as drafts and bulk approval, interview kit per job (questions by job level + practical tests) with print, JD print, JD status shown on hiring-request lines (warning only), request stores the JD version, new job from an approved new-position request starts with a JD draft. Pilot content: 18 showroom/installation JDs and 90 production JDs; review continues after load | Owner decision, 4 Oct 2026 | 3.3, 11 |
| CHG-36 | Job description content completed for all non-executive jobs: 110 further JDs written as draft 0.1 (finance 18, HR 13, IT and admin/security 13, legal/audit/OSH 7, commercial and marketing 19, operations leadership and factory support 27, supply chain 13), on top of the 108 pilot JDs — 218 in total. Competency library grows to 79 competencies with interview questions and practical tests (new functional groups FI, HR, IT, AD, LG, IA, OS, CM, MK, DS, MN, QA, PL, SC). All 218 JDs and the library import and approve cleanly in the portal. Each workbook flags points to confirm (grades of some supervisors, merged admin/security unit, missing grades for head of operations and customer follow-up specialist) | Owner decision, 4 Oct 2026 | 3.3, 11 |
| CHG-37 | English interface (v0.7.0): every screen can show in English, left-to-right, through a translation dictionary of 1,885 texts; master data shows its English name (\_EN columns) when filled, otherwise Arabic. Each user switches language from the header (saved on their account); HR sets a user's language from Users; settings DEFAULT\_LANG (ar/en) and USER\_LANG\_CHOICE (Y/N). Sign-in and notification emails go in the recipient's language. Arabic stays the default and is unchanged | Owner decision, 4 Oct 2026 | 3.1, 11 |
| CHG-38 | Sources, subscriptions and job ads (v0.8.0, Phase 3B-1): RECRUITMENT\_SOURCES table replaces the CANDIDATE\_SOURCES setting (13 sources, migrated automatically). Paid subscriptions (SOURCE\_SUBSCRIPTIONS) with ad and CV-search credit derived from a usage log (SOURCE\_USAGE; cancelling returns the credit, nothing is deleted) and a daily expiry alert to recruitment managers. ADVERTISEMENTS per vacancy: text generated from the platform template (Purpose=AD, AD\_\<SOURCE>, fallback AD\_GENERIC) + the approved JD + request data; statuses Draft, Ready, Published, Paused, Closed; first publish on a paid platform uses one credit or needs explicit confirmation without a subscription. Each ad has its own apply link (&ad=AD-...) and APPLICATIONS.Ad\_ID records which ad brought each applicant. My tasks lists published ads on vacancies closed for applications. Screens are in Arabic and English | Owner approval to start Phase 3B, 4 Oct 2026 | 7, 8 |
| CHG-39 | Two phases added to the roadmap (scope to be detailed before each starts): Operational reports (after phase 5 — requests, vacancies, candidates, ads, offers, joiners; filters and export) and an Interactive process map (after phase 7 — clickable end-to-end map of the recruitment and new-hire process, each step showing owner, rules, SLA and the portal screen). Phase 8 Intelligence stays last | Owner request, 4 Oct 2026 | Roadmap |
| CHG-40 | Decisions from the phase 1–3 audit: (1) approval reminders, escalation and daily digest run on a daily scheduled trigger; a request step left unapproved 30 days counts as rejected. (2) HC exceptions are approved by the HR Sector Manager only, as a separate approval. (3) HR notes on a request are visible to the HR team only (separate internal field). (5) Rejection reasons and activity types become editable lists. (6) Manual merge of duplicate persons is kept. (7) Data retention/deletion per the privacy text to be built; privacy text still awaits legal review. (4) Cancelling a vacancy requires a decision per open application: transfer / talent pool / reject due to cancellation / hold (built with 3B-3). (8) AI CV reading and summary help move to phase 8. (9) Agreed in principle: application owner with 3B-2; former-employee check, do-not-rehire and per-vacancy screening questions with 3B-3; candidate secure link with phase 5. (10) Admin screens for delegation, job/grade edit and reasons are built before 3B-2 | Owner decision, 4 Oct 2026 | 2, 3, 7, 9, 10, 23 |
| CHG-41 | CHG-40 items (1), (2), (3), (5) and (10) built in v0.8.1. Daily job on a time-driven trigger at DIGEST\_TIME (first portal call of the day runs it when the trigger is missing or missed a day, without the digest): in-app reminder every APPROVAL\_REMIND\_DAYS (3), one escalation to the HR Sector Manager and HR Manager after APPROVAL\_ESCALATE\_DAYS (7), warning APPROVAL\_EXPIRY\_WARN\_DAYS (5) before expiry, and a step without a decision for APPROVAL\_EXPIRE\_DAYS (30) is rejected by the system (recruitment requests and new-position requests); one digest email per user with approvals waiting or a request returned. EMAIL\_DAILY\_BUDGET now enforced (login codes always go). HC exception = separate step HC\_EXC after HR review, HR Sector Manager only: approve, approve within available HC (lines cut to what is free, requester told), return or reject; skipped when HR approves within available; the HR Sector Manager reviewing as HR may record both approvals in one go (two records); his own request approves both on submission; the old HR Manager / CEO exception rules stopped. HR\_Internal\_Notes on the request: HR and recruitment roles only, never in the timeline, notifications or print; audited. Admin screens: delegation (unit-head approval authority to a user for up to one year; stop only), editable lists (request reject/return, candidate reject/withdraw, end-of-service reasons, candidate activity types; built-in items renamed only), job data and grade edit on the job page with change history (grade by the HR Sector Manager only). Item (7) data retention waits for the legal review of the privacy text. | Built, 4 Oct 2026 | 2, 3, 6, 9, 10, 18, 19, 23 |
| CHG-42 | Phase 3B-2 built (v0.9.0). Application owner (Owner\_User\_ID): one recruiter per application from the vacancy team, default the creator or the lead; hand-over by the owner, the lead or a recruitment manager; applications of a recruiter removed from the team go back to the lead; My tasks follow the owner. Employee referrals (REFERRALS): referrer picked from active employees in the employee master, first referral per vacancy wins, no self-referral, PRIMARY on a referral source and INFLUENCING otherwise; bonus status PENDING (due after hire + probation) / REVIEW (HR decides: influencing, internal or candidate already applied within REFERRAL\_PRIOR\_DAYS = 180) / ELIGIBLE / NOT\_ELIGIBLE / PAID, decided by HR admins in the referrals register; the portal pays nothing. A referrer typed on the public form waits for recruiter confirmation. Agencies (AGENCIES): fee basis and value, guarantee days, replacement terms, ownership days, contract link; terms snapshot on each submission; another agency cannot submit a candidate during ownership, other sources get a warning. Original\_Source kept; source change needs a reason and is logged; source, agency and referral lock when the application is rejected or withdrawn (hire lock follows with phase 5). Existing applications migrated (owner = lead, original source, locks, typed referrers as REVIEW). | Built, 4 Oct 2026 | 8, 9, 10 |
| CHG-43 | Phase 3B-3 built (v0.10.0). Screening questions (SCREEN\_QUESTIONS): editable library seeded with 6 questions; each vacancy picks its questions and optional knockout answers; applicants answer on the public form; a knockout answer flags the application for review (never auto-rejects) and the recruitment team accepts or rejects it from the candidate page or My tasks. Talent pool (TALENT\_POOL): candidates saved by category, suggested when a matching vacancy opens, moved to a vacancy in one step. Transfer to another vacancy creates a linked new application (Origin\_Application\_ID) and closes the old one as withdrawn - transferred. Cancelling a vacancy with active candidates requires a decision per candidate (transfer / pool / reject / hold). Bulk import (IMPORT\_BATCHES): paste from Excel, max 300 rows, preview flags new / possible duplicate / already on vacancy / missing mobile / invalid / duplicate in file, per-row link / new / skip, batch number IMB-YYYY-NNNN. Source performance tab: applicants and reach to interview, offer and hire per source. Former employees: name/mobile match against exited employees shows a warning that HR confirms or dismisses; no-rehire restrictions (HIRING\_RESTRICTIONS) recorded with a reason by HR admins only; any application by a restricted person alerts the managers, who decide. | Built, 4 Oct 2026 | 8, 9, 10 |
| CHG-44 | Phase 4 split: 4A interviews (built, v0.11.0); 4B practical / technical assessments, 2-hour reminders and reconfirmation, interviewer analytics and per-job round templates. 4A: interview rounds per vacancy (Plan\_JSON, default INTERVIEW\_DEFAULT\_PLAN = HR required, direct manager technical required, senior final optional; type HR / MANAGER / SENIOR / OTHER drives the competencies and questions shown). New stage INTERVIEW, entered only by scheduling the first interview; the hiring manager sees SHORTLISTED and INTERVIEW candidates. INTERVIEWS + INTERVIEW\_PANEL (one lead; technical, HR, observer, decision participant): Proposed → Manager Confirmed → Candidate Pending → Confirmed → Checked-in → Started → Completed → Evaluated; the invitation is blocked until the lead confirms (INT-001); exceptions manager / candidate declined, rescheduled (linked), no-show, manager no-show, cancelled, controlled ad-hoc with reason, round waived by recruitment managers / HR with reason; closing or transferring a candidate cancels live interviews. Check-in, screen opened, first note, start, end and each evaluation are recorded as events; evidence reported as facts (waiting minutes, late arrival, duration). Interviewer workspace: candidate summary (no salary / contact outside the recruitment team), CV through the interview, approved JD, round competencies with anchors and library questions, HR standard question bank (INTERVIEW\_QUESTIONS, 10 seeded, mandatory or suggested), requirements from the request (education, experience, essential skills). EVALUATIONS: requirements Met / Not met / Needs verification with evidence (all required in HR and manager rounds), competencies 1–5 against the required level (evidence for 1 and 5), mandatory questions must be asked, interviewer-added questions, recommendation Strongly proceed / Proceed / Hold / Do not proceed; independent (hidden while the user still owes an evaluation on that candidate); revision = new version with reason, old superseded; late after EVAL\_SLA\_HOURS (24) measured. Live comparison and readiness (not ready / ready for decision / deferred): incomplete as x/y, conflicting recommendations flagged never averaged, competency averages with rater count and spread, requirements by worst status; salary only for the recruitment team. Daily job: unconfirmed after INTERVIEW\_CONFIRM\_HOURS, tomorrow reminders, unrecorded past interviews, late evaluations with escalation to recruitment managers at 2× SLA. Selection decisions (selected / reserve) stay with phase 5. | Built, 4 Oct 2026 | 11, 20, 27 |
| CHG-45 | v0.11.1 — fixes accepted from an external code review (Gemini, all 29 files in five parts; about a third of its points held, no authorization gap found). Text starting with "=" is stored with a look-alike sign so it can never become a sheet formula (public apply page, import, every write). Login-code attempts counted and checked under the lock. Audit trail, timeline events and notifications are appended without reading the whole table; the ID counter is not re-read inside the same lock. Unit move checked under the lock and tree walks guarded against loops. CVs uploaded to Drive before taking the lock. Online applications capped per vacancy per hour (APPLY\_MAX\_PER\_VACANCY\_HOUR = 60; lead recruiter told). Former-employee name match uses four words when both names have them. Weekly days off WEEKEND\_DAYS = Friday and Saturday: no reminders, escalations or digest on those days, and they do not count in approval waiting days or evaluation lateness. Every data sheet warns before a hand edit. New automatic XSS test: HTML/script typed into names, notes, questions, round names and summaries shows as text on every screen and never runs. Deferred: data archiving (with the retention decision CHG-40/7), splitting Index.html (with the move to a real database). | Built, 5 Oct 2026 | 18, 22, 23 |
| CHG-46 | v0.12.0 (Phase 4B): practical / written / skills assessment rounds with criteria from the JD and competency tests; HSE safety checklist before shop-floor tests; result form (pass/fail per item, optional score out of 100, evidence files, PASS / FAIL / RETEST) — a fail flags the candidate and never auto-rejects; round templates per job / job family, vacancy plan frozen at its first interview; day-before reconfirmation; hourly job for 2-hour panel reminders + candidate reminder email; interviewer analytics for calibration only. | Built, 2026-10-05 | Interviews & assessments; Notifications; Settings |
| CHG-47 | v0.12.1: fix for 'system busy' at login after an upgrade — the in-request upgrade no longer re-formats or re-protects existing sheets (protection runs once from the daily job); other users see 'portal is updating, try again in a minute' instead of queueing on the lock; a stuck upgrade is retried after 6 minutes. | Built, 2026-10-05 | Google Apps Script architecture |
| CHG-48 | v0.13.0 (Phase 5A): selection decision (selected / reserve / hold / more interview / rejected) with readiness snapshot and exception justification; hiring manager may decide (not reject); optional reference checks with consent; versioned salary structures per grade, pay components (fixed / variable, show-on-letter) and OFFER\_AUTHORITY matrix edited by the HR Sector Manager; offers with calculated fixed package, lowest-sufficient-authority routing with fallback, self-approval within own limit, return, negotiation versions, salary trail, offer letter (print / email), acceptance with signed copy, decline reasons with reserve reminder, validity + daily expiry + HR extension, over-hiring check with HR override; salaries hidden from hiring managers; new stages OFFER and ACCEPTED. Joining and documents follow in 5B. | Built, 2026-10-05 | 13.1–13.5; 20; 21; 24 |
| CHG-49 | v0.13.1: offers follow Kandil's package rules (owner decision 2026-10-05) — the offer starts from the agreed amount (Gross or Net); allowances come from a versioned per-grade table (collar W/B/G, transport: Inshas = first column, elsewhere = first + extra; meal, phone, representation, cost of living, job-nature eligibility) and per unit/department job-nature rates (2026), with per-job overrides, location transport zones and temporary transport by decision; basic = amount − allowances; contribution wage = full × 60% capped 16,700, rounded to 500, floor 5,500 (social insurance 11%); comprehensive wage = contribution wage topped up to 7,000 (tax base after insurance and the 20,000 exemption, progressive brackets); martyrs fund borne by the company; Net contracts grossed up with the difference as «Net allowance»; incentive as a separate annex decided only by the HR Sector Manager. All figures editable yearly from the Salaries & offers screen. | Built, 2026-10-05 | 13.2; 13.3; 13.4 |
| CHG-50 | v0.14.0 (Phase 5B): joining and hiring documents (owner decisions 2026-10-05) — an accepted offer opens a joining record (planned date with change history, date confirmation notifies the manager); 12 document types seeded (original kept / copy / paper, copies, scope all / males / collar / listed jobs, digital copy, expiry, deferrable with max days, insured-only); the candidate uploads from a private link or HR uploads, the recruiter reviews, paper receipt ticked separately, versions kept per person on Drive; deferral and waiver by the Recruitment Manager; joined → vacancy fill + employee record, did not join → withdrawn with reason; the receipt of hiring documents prints only when every required document is complete; payroll cut-off day 25 with a 7-day alert — the portal lists and records stop / release notices, it never stops a salary itself; contracts without social insurance need the CEO or the Chairman / Vice Chairman, insurance is zero and the work stub, insurance print, form 111, practice permit and skill certificate become optional (recorded if brought). | Built, 2026-10-05 | 14; 13.4 |
| CHG-51 | Owner decisions: probation is at most 90 days with the same employer, never repeated on rehire; STEPS HR & Payroll not approved, so phases 6 and 7 (employee file, onboarding, social insurance, probation, medical insurance) are built in this portal, and a full HR system follows later as a separate project. | Decided, 2026-10-05 | 17.2; open items 11, 14 |
| CHG-52 | Owner decisions: the 4 legal entities count as one employer, so probation is never repeated on rehire or on a move between entities. Probation: at most 3 months; once per employer; the contract must state the probation and its length (offer / contract carries the probation days); either party may end the contract during probation, usually without compensation or end-of-service pay. Social insurance: legally due from the first working day; the company may start it from the 1st of the following month or from the date the hiring documents are complete (especially form 111) — the portal will hold the start rule as a setting and track it per employee. Privacy notice to be drafted externally and reviewed before legal sign-off. | Decided, 2026-10-05 | 17.1; 17.2; open items 11, 12 |
| CHG-53 | v0.14.1: personal-data protection (privacy notice drafted externally, reviewed; final wording awaits legal). Separate recorded consents with the notice version (application, storage on Google possibly outside Egypt, salary data as sensitive financial data, optional talent pool for RETENTION\_POOL\_MONTHS = 12); talent pool only with consent; explicit hiring-documents consent (link or signed paper) before the first upload; criminal record and form 111 open for the application owner and HR / recruitment managers only; legal entities linked to the structure and shown as employer (more can be added later); data-subject requests (access export, correction, deletion, pool withdrawal) with a due date; retention list (rejected 6 months, did not join 3 months — periods editable, owner to decide) with manual deletion, automatic deletion off until the HR Sector Manager switches it on; DPO = wages supervisor, privacy email to be set. Hiring-document files are kept (owner decision). WhatsApp contact from company numbers. Open: move from a personal Google account to Workspace or Supabase before real candidate data. | Built, 2026-10-05 | 9.1; 14; open item 12 |
| CHG-54 | v0.15.0: sign-in with an authenticator app (TOTP) as an alternative to email codes; once on, email codes stop for that account (also saves the Gmail daily quota). Required from the first sign-in for system owner, HR sector manager, HR manager / staff, recruitment team and consultant (TOTP\_REQUIRED\_ROLES); everyone else after 3 email sign-ins (TOTP\_AFTER\_EMAIL\_LOGINS). QR drawn on the device, 8 one-time recovery codes, secret stored encrypted, codes not reusable, 15-minute pause after 5 wrong codes. Reset by system owner / HR sector manager with a reason (closes sessions); emergency owner reset from the script editor via a script property. New role Consultant (view only): sees every screen including pay (owner decision), server refuses all writes, alone, end date (max 180 days), no position, granted by owner / HR sector manager, confidentiality acknowledgement at first sign-in (interim text, final after legal). Notes button on every screen + Notes screen (status and reply, author notified). Decision: the 'twice a day' rule replaced by role-based enforcement. | Built, 2026-10-06 | 9.1; open item: consultant acknowledgement wording (legal) |
| CHG-55 | v0.15.1: short 'for whom / where to start' intro under 24 screen titles, closed and reopened per user (saved per account). Owner and HR sector manager can switch on coloured dots showing who sees each menu item (everyone / managers and approvers / HR and recruitment team / HR sector manager and system owner only) with a legend; one meaning per visual channel so it does not clash with the planned org-chart status colours. Guide answers on the authenticator and notes. Agreed order after this: v0.16 org chart (headcount status colours + sector colours, 8 sectors), recruitment policy inside the portal after the owner approves the draft, then phase 6 onboarding as a full in-portal program. | Built, 2026-10-06 | 9.1; phase 6 order |
| CHG-56 | v0.16.0: Org chart screen. Tree of the active structure; every card shows actual / approved headcount including everything below it. Card fill = headcount status per position (over approved / short / full / empty), always with number and icon; units also show counts of over, short and empty positions below them. Top band = sector colour (fixed palette in sector order, override per sector in SECTOR\_COLORS); departments take their sector's colour. 'On the way' = remaining headcount of open vacancies, with new hires waiting to join. By unit / by position view, sector filter, status filter (dims the rest), search by unit, position or holder name that opens the path, open / close all, zoom and fit, print A4 landscape, unit details with its positions and holders. Visibility: HR, recruitment, CEO, board, consultant, viewer = whole company; a line manager = his units only; others refused. Phone = indented list. | Built, 2026-10-06 | 4 (structure); 9.1 |
| CHG-57 | v0.17.0 (phase 6A): full onboarding program inside the portal + employee e-file. Owner decisions: full program (not a simple record); three templates are enough (factory / showroom / office, chosen from the location type; factories and warehouses = factory); task owners = HR site specialist, recruiter, supervisor and line manager (plus the buddy); social insurance starts on the first working day by default (setting comes in v0.18). Templates hold phased activities (before day one / day one / first week / first month) with a day offset, owner role and employee-acknowledgement flag; editable and copyable by system owner, HR sector manager and HR manager. A program opens when the joining date is confirmed; tasks are dated from the start (weekly days off moved) and assigned to real users (HR site specialist per location, vacancy lead recruiter, reports-to holder, unit head, buddy or the supervisor until a buddy is set). Date changes re-date open tasks; joined links the employee and re-dates to the real first day; did-not-join cancels. Done / won't do (reason) / reopen; flagged tasks need the employee's acknowledgement; manager or supervisor sets the buddy and adds tasks; HR changes owners (open tasks move); program closes with the employee's acknowledgement (paper / in person / none with a reason), HR may close earlier with a reason; print for signature; daily one-time late reminders; home to-do. Program by hand for current employees. Employee e-file: hiring record, hiring documents and their status, onboarding progress, agreed package for pay roles. | Built, 2026-10-06 | Phase 6; 9.1 |
| CHG-58 | v0.18.0 (phase 6B): welcome gift, social-insurance tracking, New Hire Voice. Gift: recorded on the onboarding program (choice list WELCOME\_GIFTS, delivery date, by whom, employee signature) by HR, manager or supervisor. Insurance: one case per new hire opened on joining; start per INSURANCE\_START\_RULE (owner decision: first working day by default; alternatives next month / documents complete, the latter set when the documents receipt is issued); office per location (INSURANCE\_OFFICES list, 13 offices to be entered); to submit → submitted (date, request ref) → registered (insurance number, unique); no-insurance contracts marked; late after INSURANCE\_SUBMIT\_DAYS = 7 (interim, to confirm with the insurance officer) with one alert to HR managers and the site specialist; HR roles only. New Hire Voice: surveys at day 7 and 30 (NHV\_DAYS) on a private no-login link (Voice.html, Arabic / English, phone first), emailed when the person has an email, otherwise the HR site specialist sends it by WhatsApp and marks it sent; 5 default questions (1–5 + comment, editable in NHV\_QUESTIONS); answers visible to HR team and recruitment manager only, never to the line manager by name; averages per question per round; any score at or below NHV\_ALERT\_SCORE = 2 alerts the site specialist and HR managers and stays in the to-do until a follow-up note is recorded. Employee e-file shows insurance and survey status. | Built, 2026-10-06 | Phase 6; 9.1; open: insurance submit days, offices list |
| CHG-59 | v0.19.0 (phase 6C): internal transfers, per the owner's rules. Opened by the employee's current manager or anyone in the HR team (one open request per employee). The target must have room: free approved headcount or an open vacancy; when a vacancy exists the transfer is linked to it and fills / closes it on execution (recorded as internal transfer); room is reserved while the request is open. Approvals: current manager → new manager → HR manager → HR sector manager when salary items change (requester steps auto-approved, empty steps skipped with reason; reject with reason). Allowances tied to the job or the unit (grade, collar, transport zone, job-nature rate) are detected and force a salary-items change (items from → to, or a note); agreed different benefits can be added; amounts visible to HR and pay roles only. Working-hours and location changes recorded (history note). Executed on the effective date (immediately if due, else by the daily job); headcount recounted; managers notified; printable salary-items notice for payroll with a 'sent to payroll' record. Not built (owner did not ask): short onboarding for the new unit. | Built, 2026-10-06 | Phase 6; 9.1 |
| CHG-60 | v0.20.0: demo data + wipe transactions (owner request: test every case with non-real data in the same portal, then empty it). Owner-only screen. Seeding in 7 ordered stages through the real services on the real structure: demo users (HR, recruitment, managers placed on unit heads with no account) and demo employees (short/full/over/empty headcount); requests in every state, vacancies, new-position request; candidates in every stage + a duplicate; interviews (upcoming, done, late evaluation, no-show), evaluations, selections; offers (accepted, presented, declined, pending, draft); joining with missing/deferred/rejected documents, onboarding, gift, insurance, surveys (good and low), did-not-join; transfers in every state, personal-data requests, an exit. Demo people use @demo.invalid; no email at all is sent while seeding. 'Try as' lets the owner open the portal as a demo user (yellow banner, back to own account, audited). Wipe: typed phrase + reason + authenticator code; copies the 7 spreadsheets to a Backup folder first; clears every transaction table (real and demo), removes demo users/employees, restarts counters, recounts or restores headcount, trashes uploaded files; keeps structure, jobs, JDs, locations, real users/roles/MFA, real employees and history, settings, lists, pay tables, templates, notes, audit log. | Built, 2026-10-06 | Testing / go-live |
| CHG-61 | Probation is one period only, at most 90 days (PROBATION\_DAYS), with no extension. The direct manager sets 3–5 measurable goals in the first week and the employee acknowledges them; follow-up reviews on day 30 and day 60; self-assessment, then the final evaluation on day 75 on the annual appraisal items (productivity 35%, quality 25%, four core values 10% each, 1–5 with evidence; confirming needs a weighted score of 3 or more and no value below 2). An improvement plan (PIP) must start by day 60 so it ends inside the period. The manager recommends; HR decides by day 80: confirming = HR team, ending employment = HR Sector Manager only, with written reasons; the decision is told in a meeting, then a printed letter. Built v0.25.0. | Owner decision | 17.2, 26 |
| CHG-62 | Stay interview near day 60: HR with the employee, without the manager (what he likes, what could make him leave, manager support, intent to stay, risk level); a high risk alerts the HR managers and the HR site specialist; HR only. Manager satisfaction survey: 3 questions to the direct manager after confirmation, feeding the quality-of-hire KPI. Built v0.26.0. | Owner decision | 17.2, 18 |
| CHG-63 | Medical insurance case opened automatically on confirmation; the employee is added within MEDICAL\_ADD\_DAYS (14) with insurer and card number, or marked not added with a reason; late cases alert HR; HR team only. Built v0.25.0. | Owner decision | 17.3 |
| CHG-64 | Recruitment KPIs computed from the portal's own records: process KPIs in 5 groups (speed, quality, efficiency & cost, candidate experience, compliance); weighted scorecards (weights sum to 100, score 1–5 on the appraisal scale) per recruiter, recruitment lead and HR site specialist; service KPIs of managers, approvers and interview panels for information only (not in any score); drill-down to cases, Excel export, monthly e-mail to the recruitment manager, HR manager and HR Sector Manager. Built v0.26.0. | Owner decision | 18, 26 |
| CHG-65 | KPI targets, target days-to-fill per job class, job class per grade and scorecard weights are edited on the KPI screen (no JSON typing) by the system owner, HR Sector Manager and HR Manager only, each change with a reason and audited; the rest of HR / recruitment and the consultant view only. Built v0.27.0. | Owner decision | 18, 19, 26 |
| CHG-66 | Every user sees his own evaluation ("My evaluation"): the scorecards that apply to him and his service as manager, approver and evaluator, with only his own cases behind them. The probation employee sees the day-30 and day-60 follow-ups on his link once the manager saves them, and the final evaluation only after the HR decision; internal notes, the stay interview and the manager survey are never shown to him. Built v0.27.0. | Owner decision | 17.2, 18, 19 |
| CHG-67 | Every form is printable from inside the program: a print button in every form window and beside each page title prints the form with its data, blank lines for empty fields, logo, date and a signature table. A forms book holds every portal form on demo data, in workflow order. Built v0.24.0–v0.26.0. | Owner decision | 24, 27 |
| CHG-68 | Post-approval request changes: only a headcount increase goes back to approval (as a linked request that tops up the same vacancy); every other change (date, specs, priority, employment type, branch, decrease) is recorded by HR with a reason as an amendment version. Bulk vacancy assignment and moving a recruiter's whole workload. Approved JD e-mailed with PDF to portal users only (not candidates). Application salary stays optional for everyone, not labelled optional, zero refused. | Owner decision | 4.4, 7.2, 3.3, 9.3 |
| CHG-69 | Phase 8 first part built: source return (funnel to confirmation, quality, time to hire, cost per hire incl. ads, subscriptions spread over the period, agency fees, referral bonus estimate), bottlenecks (each process step with average / median / 90th percentile, waiting, overdue, slowest people, oldest cases) and interviewer calibration (deviation from the rest of the panel, recommendation vs outcome, interview score vs final probation score). Forecasting waits for \~6 months of data; AI CV help waits for an owner decision on the AI service. | Owner decision | 18, 27 |
| CHG-70 | Go-live readiness screen (automatic checks + manual items ticked and audited) and the hiring forecast (next quarter by job class and sector, expected time to fill, confidence by months of history). | Owner decision | 18, 27 |
| CHG-71 | AI CV reading (Claude, Anthropic API): on the candidate page the recruiter asks the system to read the CV (PDF, image or .docx) against the vacancy's approved JD; it returns suggestions only — fields the recruiter ticks to save (audited), a short summary, skills, and a 1–5 match on job-related criteria (age, gender, religion, marital status, nationality, photo excluded). Never moves or rejects a candidate. One reading per CV per vacancy (saved), monthly cost cap CVAI\_MONTH\_CAP\_USD (default US$10, \~1 cent per CV on Claude Haiku 4.5), API key kept in the script properties, readings blanked when a candidate's data is deleted. Owner decision; cross-border transfer of CV data to go to the lawyer review. | Owner decision | 13, 29 |
| CHG-72 | Profile photos (built v0.33): a small thumbnail for candidates and portal users. A candidate photo needs a separate optional consent on the apply page and a line in the privacy notice; hiring managers do not see it until after the interview; it is deleted with the candidate's data. | Owner decision 9 Oct 2026 | 9, 19, 22 |
| CHG-73 | AI CV reading may run on test data now; the go-live step reminds about the cross-border transfer licence. What is sent excludes the photo and National ID; the address is reduced to "district, governorate". The job-related match is shown as a percentage (advisory only: never sorts, filters, moves or rejects). The portal flags a long commute (candidate governorate / district far from the vacancy location) for information. Amends §1 and §10.1. Built v0.37.0 (§10.1 note). | Owner decision 9 Oct 2026 | 1, 10, 13 |
| CHG-74 | Separation of duties. No user grants himself a role or changes his own role, position or delegation. CEO and Board roles and the heads of top units are given only with the CEO's approval. The HR Sector Manager is the highest HR authority: he approves HR-sector requests and headcount exceptions (one rule replaces the five in §5, §19, §26.1, CHG-01) and may send any item to the CEO; anything that concerns him personally (his own pay, offer, position, a relative, a request where he is the subject) goes to the CEO. Built v0.36.0. | Owner decision 9 Oct 2026 | 5, 6, 19 |
| CHG-75 | CEO approval channel: the CEO approves in the portal from a link the HR Sector Manager sends on WhatsApp; approval needs the CEO's trusted device (90 days, renewable; the owner sees the days left) plus a PIN only the CEO knows (stored hashed). One page lists everything waiting for the CEO. Built v0.36.0. | Owner decision 9 Oct 2026 | 6, 23 |
| CHG-76 | Delegation by process: a delegation lists the processes delegated (anything not listed stays with the delegator); each change is a new version; a delegation of CEO authority takes effect only after the CEO approves it; at most 90 days, renewable. Built v0.36.0. | Owner decision 9 Oct 2026 | 6.3 |
| CHG-77 | Two-person rule: data wipe and resetting an administrator's sign-in are requested by one user (the Payroll & Salaries Supervisor) and approved by the HR Sector Manager — never the same person. Ending employment: the unit manager requests, the HR Sector Manager approves. Built v0.36.0. | Owner decision 9 Oct 2026 | 17.2, 19, 22 |
| CHG-78 | Oversight: a monthly report to the CEO (decisions taken under delegation, two steps taken by one person, role and delegation changes) and a quarterly access review approved by the HR Sector Manager. A vacant unit head is skipped upwards and HR is alerted. A Board decision recorded on its behalf needs an attachment (minutes, written approval or a WhatsApp screenshot). Built v0.36.0. | Owner decision 9 Oct 2026 | 6, 19, 22 |
| CHG-79 | Operations: Gmail until go-live, Google Workspace after go-live (a database such as Supabase decided after 6 months of real use); weekly backups kept 8 weeks with a quarterly restore test; e-mail priority login codes → candidates → approvals → daily summary (at most half the budget); the daily summary e-mail goes to managers only; a data protection officer outside HR; breach procedure (owner reports, DPO decides and notifies within 72 h) with an incident log in the portal; Anthropic key rotated every 6 months. Built v0.37.0: weekly backups, restore-test record, DPO and incident log, key-rotation reminder, daily summary e-mail to managers only. | Owner decision 9 Oct 2026 | 2, 18, 22, 23 |
| CHG-80 | Legal positions (owner, lawyer to confirm): payroll stop notice stays; social insurance from the first working day (anything else is an exception with a reason and approval); a contract without social insurance needs the legal basis and a portal form printed, signed and uploaded back; background and criminal-record checks for all jobs with written consent uploaded first; retention 2 years with automatic deletion; under-18 applicants need guardian consent; data-subject requests answered within 30 days with a recorded identity check (objection and withdrawal of AI consent included). Built v0.38.0 (§9.6). | Owner decision 9 Oct 2026 | 9, 13, 17, 22 |
| CHG-81 | Candidate privacy: candidates added by hand, import or job sites get the privacy notice and a consent link and cannot pass "Contacted" without a recorded consent; salary on the apply form is optional and a range (current salary asked at the offer stage); relatives question with a match alert and a no-relation declaration by interviewers and approvers; optional accommodation question and a 5 % disability indicator; survey results hidden below 5 answers; every user accepts a usage policy once and staff are told that the portal computes their service indicators. Built v0.38.0 (§9.6). | Owner decision 9 Oct 2026 | 9, 11, 16, 18 |
| CHG-82 | Sign-in: authenticator app mandatory from the first sign-in for every user (the CEO may use the trusted device + PIN of CHG-75); session one working day, remember-me 7 days, idle lock enforced on the server; private links valid 7 days, revoked when their purpose is done, with "send a new link". A go-live button locks demo data and the data wipe for good. The consultant keeps full access and export while the data is test data only; restricted before go-live. Built v0.37.0; the private-link rules built v0.39.0 (§9.7). | Owner decision 9 Oct 2026 | 19, 23 |
| CHG-83 | Candidate self-service link: the candidate completes his data and CV, confirms or declines an interview and answers the offer from a private link; the recruiter can still do each step on his behalf (recorded as on-behalf). Built v0.39.0 (§9.7). | Owner decision 9 Oct 2026 | 9.2, 11.1, 13.5 |
| CHG-84 | Workflow: offer letter net pay marked "estimated" and reviewed by the payroll supervisor before sending; recruiter offer authority = grade minimum exactly; WhatsApp offers from each recruiter's own work number; employment-contract stage after acceptance (Arabic form with entity and probation, signed copy uploaded; joining not blocked); HR may change branch or contract type after approval alone (risk accepted, reason logged, requester told); hiring ban reviewed every 2 years with appeal; response deadline 5 working days (owner correction, v0.40.1; first recorded as 10); deferred documents escalated after 7 days; expiries, transfers and probation run every day, reminders and escalations pause Fri–Sat. Built v0.40.0 (§5, §7.1, §9.1, §13.3, §13.6, §14.6, §20). «Response deadline» is the deadline of an approval step: 5 working days without a decision → rejected; reminder on day 2, escalation to the HR Sector Manager and HR Manager on day 3, warning to the approver and requester on day 4 (v0.40.1). | Owner decision 9 Oct 2026 | 4.4, 9.1, 13, 14, 20 |
| CHG-85 | Transfers and onboarding: the receiving manager may start a transfer; managers give an opinion only; temporary transfer type, handover list and a replacement request on execution; onboarding owners for IT, admin and safety, a custody and PPE log and an "arriving tomorrow" screen. Built v0.41.0 (§7.4, §16.1). | Owner decision 9 Oct 2026 | 7.4, 16 |
| CHG-86 | Small items built: similar-name matching, frozen status, attrition at 30 / 180 / 365 days, new-hire survey axes, AI summary on the candidate page; and the 49 code fixes of the v0.33 review (security, privacy, data layer, Apps Script limits). The small items built v0.41.0 (§7.1, §9.1, §10.2, §16.1, §18); the code fixes in v0.34.0 – v0.37.0. | Owner decision 9 Oct 2026 | 9, 16, 18, 23 |
| CHG-87 | New look (v0.39): inbox home, stage board per vacancy, tabbed candidate file with the next step first, guided steps for long forms, global search; one colour per main section with sub-tabs in shades of it; Kandil red kept for the logo and primary buttons; red / green / orange reserved for statuses. Built v0.42.0 (§24.1). | Owner decision 9 Oct 2026 | 24 |
| CHG-88 | Responsibilities in a JD by job level (JD standard v1.0, rule 4.2 — indicative): JL1–2 5–8, JL3 6–10, JL4–5 8–12, JL6–7 8–16 grouped under 4–6 areas; a hard cap of 16 and a floor of 3; above the level's band needs a written reason. Replaces «5 to 8». Built v0.42.1 (§3.3). | Owner decision 9 Oct 2026 (job-profile work) | 3 |
| CHG-89 | JD KPIs carry a type (weighted / monitoring) and a weight. Structural rules block: the weighted KPIs' weights add up to exactly 100, every weighted KPI has a weight. Numeric bands only warn (weighted KPIs JL1–3 3–5, JL4–5 4–6, JL6–7 5–7; at most 4 monitoring). Writing rules of the job-profile standard (closed verb list, job analysis, moved / deleted log, task-to-KPI mapping) stay in the authoring tool, not the portal. Built v0.42.2 (§3.3). | Owner decision 10 Oct 2026 | 3 |
| CHG-90 | Factory pilot (operative family): a one-page worker card printed from the portal for any JD (offered first for JL1–2); required certificates and licences as a JD field; the work locations and the direct manager on the printed JD come from the structure (one JD, many positions), not from a field in the JD. Built v0.43.0 (§3.3). | Owner decision 10 Oct 2026 | 3 |
| CHG-91 | Attendance enrolment on ZKBioTime (the company's attendance system on an internal server, ~20 machines, 150 mobile licences): the portal records only that a new hire's face and fingers were enrolled and the punch type (machines only / mobile + machines); no connection to ZKBioTime and no biometric data in the portal. HR records it and decides the type; mobile licences are counted against the licence number; on exit HR is told to stop the enrolment and the licence is freed when it is stopped. Existing employees can be recorded later from their file. Built v0.44.0 (§16.2). | Owner decision 10 Oct 2026 | 16 |
| CHG-92 | The probation evaluator is a head of section (JL5) or higher — never a technician or a supervisor, even where the structure has a person report to a technician or a supervisor. The portal walks up from the employee's position to the first position at JL5 or above whose holder has a portal account; the skip-level reviewer the same way above him; none found → HR is told to set one. Built v0.44.1 (§17.2). | Owner decision 10 Oct 2026 (painting family) | 17 |
| CHG-93 | A job without a level of its own takes one from its grade, worked out when needed and never stored: grade 1–2 → JL1, 3–5 → JL2, 6–7 → JL3, 8 → JL4 when the title starts with «مشرف» or «رئيس», else JL3, 9–10 → JL5, 11–13 → JL6, 14–15 → JL7. A level set on the job (from its approved JD or on the jobs screen) always wins. The grade is not shown on what the employee receives — the printed JD and the JD sent by e-mail (JD standard decision D-21); it stays on HR screens. Built v0.44.2 (§3.3, §17.2). | Owner decision 10 Oct 2026 (grades vs levels) | 3, 17 |
| CHG-94 | Defect: the upgrade after the v0.44.0 deploy failed on every request (sign-in included) — the migration wrote the new onboarding-task column against the table's shared cached copy taken before the upgrade, which still had the old columns. The upgrade now reads every sheet whose columns it just changed from the sheet itself, never from that cache. Fixed v0.44.3 (§23). | Defect, 10 Oct 2026 (portal down after v0.44.0) | 23 |
| CHG-95 | When the upgrade after a deploy fails, the system owner gets one e-mail per version (the error reference and the first line of the technical error, at most 300 characters, no personal data) and users see «the portal has a problem with the update — the system administrator has been told» with the reference, instead of the generic error. Built v0.44.4 (§23). | Owner decision 10 Oct 2026 (after the CHG-94 outage) | 23 |
| CHG-96 | Manager review of draft JDs: the HR Sector Manager or HR Manager opens a review round on the drafts (all, or one family) with a due date (default 10 working days); each job's reviewer is its direct manager from the structure; each manager gets one e-mail listing the jobs to review and an item in «المطلوب منك», reads each draft (no grade, D-21) and answers «agree» or «I have notes»; one reminder 2 working days before the due date; HR follows the round (who answered, the notes), exports the notes and closes it. Managers never edit a JD; approval stays with HR (and the CEO for a JD of the approver's own job). Built v0.45.0 (§3.3). | Owner decision 10 Oct 2026 | 3, 19 |
| CHG-97 | Back to the previous screen from anywhere: a «رجوع» button in the top bar returns to the screen (and its filter or tab) the user came from, and the browser's own Back button (and the phone's) does the same inside the portal. Nothing is stored beyond the current session; every screen opened this way is checked on the server as usual. Built v0.45.1 (§24). | Owner request 10 Oct 2026 | 24 |
| CHG-98 | «مين أونلاين»: the system owner and the HR Sector Manager (and the read-only consultant) see who has used the portal in the last 6 minutes and the name of the screen each is on — never the record inside it — live only, kept in the script cache for 10 minutes and never written to a sheet or a log. The usage policy says so; the policy version goes up so every user accepts it again. Built v0.45.1 (§24.3). | Owner decision 10 Oct 2026 | 19, 24 |
| CHG-99 | A calmer side menu (after Gusto and BambooHR): one section open at a time; reports and KPIs in a section of their own; the open screen shown in its section's colour with white text; a path «section › screen» above every screen title; the administration screens moved out of the menu behind a gear («الإدارة والإعدادات») that opens one settings page in four groups; the «who sees each screen» dots moved from the menu to that page. No permission changes. Built v0.46.0 (§24.4). | Owner request 10 Oct 2026 | 24 |
| CHG-100 | The signed no-insurance acknowledgement is a joining document (owner decision 10 Oct 2026): on the list of a contract without social insurance only, required, never deferred or waived, uploaded before the person is recorded as joined (the general «allow joining with missing documents» does not cover it); it shows on the documents receipt and is deleted with the other documents. It is printed from the offer card or the joining card; the signed copy is uploaded on the documents list only (an upload sent to the offer goes to the same document). Approval of a no-insurance offer is unchanged: the CEO, the Chairman or the Vice Chairman. Open joinings get the document on upgrade; a copy already uploaded on the offer moves onto it. | Owner decision 10 Oct 2026 | 9.6, 14 |
| CHG-101 | The fixed-term employment contract (owner decisions 10 Oct 2026, on the legal review's preliminary template, docs/legal on the review branch): a request of employment type «عقد محدد المدة» prints the two-page template — parties with the company's register, tax card, address and signatory; the worker's national ID, qualification, profession (the job title), insurance number (from the insurance case, else a line to fill), residence address; job, workplace and its address, work pattern; term in months with start and end dates (end = the day before the same date that many months later; converts to indefinite if continued without a written agreement); 90-day probation once; **the wage stated is the contribution wage (أجر الاشتراك)**, in figures and words, as the base for social insurance, allowances and incentives per the approved company rules (the full pay stays in the offer — art. 22 of decree 162/2026 left to the owner and the lawyer); pay by day PAY\_DAY of the next month; no resignation notice period; four copies; foot «نموذج مبدئي — يراجعه المحامي». Printing is refused, naming what is missing, until the company name, address, register, tax card and signatory, the worker's residence address and valid national ID, the start date, the wage and PAY\_DAY are all present. New data: the worker's residence address (on the person; set from «بيانات العقد» on the joining card by those with full access to the joining; in the person's data copy; deleted with the person and from the audit log), the contract's months (on the joining; CONTRACT\_MONTHS\_DEFAULT 12, 1–60), the company signatory and title (on the company, set by those who manage companies), PAY\_DAY (setting). The other employment types keep the short form until their templates are delivered, now also on the contribution wage (a contract without insurance, having no contribution wage, states its comprehensive wage). Server-written documents may now open in the portal's print theme (the same head, sections and foot as the other printed forms). | Owner decision 10 Oct 2026 | 14.6 |
| CHG-102 | «مفردات الراتب عند بداية التعيين» (owner decisions 10 Oct 2026, on the legal review's draft docs/legal/05 and the company's current form): from the joining card, one A4 page in the portal's print theme, marked «نسخة الشركة فقط — سري» and «نموذج مبدئي — يراجعه المحامي»: the candidate, job, unit, sector, location and start date; every fixed pay line of the accepted offer by name and amount; the gross with the contract basis; the contribution wage, comprehensive wage, the employee's insurance and income tax (estimates) and the estimated net (marked when payroll has not reviewed it); the variable incentive; the no-insurance basis when there is one; the terms (PAY\_DETAILS\_TERMS, one per line, {probation\_days} and {pay\_day} filled in; empty = the legal session's default: dues within 7 days of the claim, resignation by the legal procedure with no notice period, joining documents followed up without withholding pay); signatures: prepared by (the printer, with the time), approved by the head of HR (HR\_HEAD\_NAME), and the candidate's acknowledgement that he has seen it. Printed only by the pay-view roles (owner, HR Sector Manager, HR Manager, Recruitment Manager and Supervisor) with full access to the joining; every print logged (PRINT\_PAY\_DETAILS); nothing stored or e-mailed, so nothing to delete; one signed paper copy kept in the service file (retention under art. 92 of law 14/2025 for the lawyer). It does not replace the pay statement art. 115 requires the employer to give the worker. The fixed-term contract now lists the allowances by name (the offer's pay lines, read correctly). | Owner decision 10 Oct 2026 | 14.6 |
| CHG-103 | The payroll notice for missing joining documents is a notice to follow up, never a stop of pay (owner decision 10 Oct 2026, after the legal review: art. 36 of decree 162/2026 forbids withholding or deducting wages except as the law provides). Every label, hint and dialog says so («إخطار المرتبات — مسوغات ناقصة (للمتابعة، بدون إيقاف صرف)», «إخطار اكتمال المسوغات»); the stored kinds STOP / RELEASE are unchanged. Completing the documents is enforced lawfully instead: before joining (CHG-50), clause 13 of the contract (15 days), and the company's penalty table (for the lawyer). | Owner decision 10 Oct 2026 | 14.4, 9.6 |
| CHG-104 | Sign-in from a new device (owner decision 10 Oct 2026): the page keeps a random device id in its own storage and sends it with each sign-in (e-mail code or authenticator); the server keeps only its hash with the browser and system name and the first and last dates (USER\_DEVICES, security spreadsheet). A sign-in from a device the account has not used before — other than the first device known for the account, so existing users are not alerted on the first sign-in after the upgrade — is logged (NEW\_DEVICE) and the user is told in the portal and by e-mail (which device, when, and «if it was not you, tell the system administrator now»). Without a device id the browser string tells devices apart. Demo accounts and «try as» sessions are left out. One e-mail per new device, within the approval/internal e-mail budget. | Owner decision 10 Oct 2026 | 23.1 |
| CHG-105 | Accounts nobody uses stop by themselves (owner decision 10 Oct 2026): the daily job stops an active account with no sign-in for DORMANT\_DAYS (60; counted from its creation when it never signed in; 0 = off) exactly as stopping it by hand does — sessions closed, its recruitment work back to «not assigned» — logs it (DORMANT\_STOPPED) and tells the system owner and the HR Sector Manager (portal, and one e-mail to the owner with the names). The system owner, the CEO and the board are never stopped this way; demo accounts are left out. Turning an account on again is a normal edit in «Users». | Owner decision 10 Oct 2026 | 19, 23.1 |
| CHG-106 | A tamper-evident audit log (owner decision 10 Oct 2026): every audit row is sealed when written, under the lock — Content\_Hash = two HMAC-SHA-256 seals (the row's fields; its old / new values) and Chain\_Hash = HMAC(previous Chain\_Hash, Content\_Hash) — with a key kept in Script Properties, never in a sheet, so someone who reaches the spreadsheet but not the script cannot forge a row. The newest seal is kept outside the sheet (a removed tail shows) and the last archived seal when old rows move to the archive (the chain goes on). Deleting a person's data blanks the values and marks the row Redacted: the fields' seal still guards the rest of the row and a redacted value can only read «محذوف». The daily job checks the whole live log; an edited value, an added, removed or moved row, or a removed tail is reported once a day to the system owner (portal and e-mail) and on the readiness screen («سلامة سجل التدقيق»). Rows written before v0.49.0 are not sealed. | Owner decision 10 Oct 2026 | 22 |
| CHG-107 | The working hours and weekly rest agreed with the employee (owner decision 10 Oct 2026): two fields on the offer (review step) — daily working hours (1–12, whole or half hours) and the weekly rest (Friday, Saturday, Friday and Saturday, or a day a week by the shift roster) — starting from WORK\_HOURS\_DEFAULT (8) and WEEKLY\_REST\_DEFAULT (FRI). Seen and edited by those who see and edit the offer; not sensitive. Printed in the fixed-term contract (clause 10, paid weekly rest), the short contract, and the salary details (default terms; {work\_hours} and {weekly\_rest} in PAY\_DETAILS\_TERMS). An offer saved before has the settings' defaults. | Owner decision 10 Oct 2026 | 13, 14.6 |
| CHG-108 | The usage policy states that the portal records the devices an account signs in from (browser and system type, first and last sign-in) and alerts the user on a new device (CHG-104). The default policy text is updated and its version raised, so every user accepts it again; a policy the owner wrote himself is left as it is. | Owner decision 10 Oct 2026 | 23.1 |
| CHG-109 | A branded sign-in (owner request 10 Oct 2026): the sign-in screen and the steps before the portal (authenticator set-up, usage policy, confidentiality acknowledgement) are split in two — a Kandil-red half with a glowing gold lantern (قنديل), «بوابة التوظيف» (in English «Recruitment Portal», all in English), one line on what the portal does and three of its stages, and the sign-in card on the other half. The brand half is on the start side, so it is on the right in Arabic and moves to the left in English; on a phone it becomes a short band above the card. Nothing in how signing in works changes. | Owner request 10 Oct 2026 | 24 |

## 1. Purpose, scope and principles

The system is a recruitment and new-hire portal covering Workforce Need → Recruitment Request → Vacancy → Candidate → Assessment/Interview → Offer → Joining → Onboarding → Probation → Medical Insurance → Quality of Hire. It is not a payroll or wage system and takes no action on pay.

Non-negotiable principles:

- Job, Position, Employee and Vacancy are separate entities. Person is the durable identity behind Candidate and Employee profiles.
- Candidate ≠ Application. One person can have many applications over years, become an employee, leave, and apply again.
- Business rules live server-side. The UI is never the authority for permissions, approvals, headcount or salary rules.
- Approved records are versioned. Material changes use a Change Request or new version, never a silent overwrite.
- Control without blocking legitimate work: real exceptions go through a controlled override with authority, reason and audit.
- A missing Recruiter, Supervisor, Recruitment Manager or organizational level never freezes work; fallback rules resolve authority and record the skip.
- Every Application has a mandatory Recruitment Source.
- Several recruiters may work one Vacancy; every Application has exactly one Current Owner.
- Filled HC changes on Actual Joining, not on Offer Acceptance.
- AI assists with summaries, evidence extraction and classification. It never rejects, ranks or selects candidates on its own, and a human reviews every AI text before it becomes a record.
- Timestamps are evidence, not accusations.
- The first screen for every operational user answers: what requires my action today?

## 2. Operating context and Phase-1 constraints

Phase 1 runs on personal Gmail accounts, a Google Sheets data store and about 45 users, with a planned later move to Google Workspace. These constraints shape the architecture and are requirements in their own right.

| Area | Phase-1 decision | Consequence for the design |
| --- | --- | --- |
| Identity | Personal Gmail; Apps Script cannot reliably identify users without Workspace | Login by one-time code sent to the user's registered email; server-side session token; user must exist and be Active in USERS |
| Data protection | Web app executes as the owner; the spreadsheet is shared with nobody | All reads/writes go through the web app; no one edits sheets directly, including HR |
| Workspace migration | Planned, date not set | AuthService is a swappable adapter; moving to Workspace replaces only that module |
| Users | \~40 managers + 5 HR at launch | Session validity \~14 days per device keeps login emails low |
| Email budget | Personal Gmail script sending is limited (order of 100 recipients/day) | In-app Action Queue is the main channel; email only for OTP, urgent alerts and one daily digest |
| Org structure | Complete to the last level | Loaded into ORG\_UNITS / POSITIONS in Phase 1 |
| Approved HC | Does not exist yet | Every position is loaded with Structural HC = 1; HC Basis = Baseline (temporary) until a manpower plan exists |
| HC enforcement | Data still being verified | HC checks warn, never block, until switched on in configuration |
| Occupied HC | Payroll is kept in a Google Sheet | Phase 1: entered by HR per position (optional, default 0). Later phase: read-only import of non-salary columns from the payroll sheet |
| Payroll link | Key risk: name mismatches between payroll and structure | Deferred. When built: a Position ID column in the payroll sheet, or a mapping table with mismatch report |
| Wages | Out of scope | No module computes, holds or deducts pay |

The exact Gmail sending quota must be checked against Google's current limits before go-live.

## 3. Organization, Job, Position and Structural Change

Recruitment can only target a Position that already exists in the approved structure; anything else is a Structural Change first.

### 3.1 Entities

- **Job** — what the role is: code, title, family, level, grade reference, structured JD, qualifications, experience, skills, competency profile, working conditions, effective dates.
- **Position** — where the job sits: Position ID, Job Code, company, sector, department, section/sub-unit, Reports-To Position ID, one location, grade reference, Structural HC, HC Basis, status (Active / Frozen / Closed), effective dates. Occupancy (Fully / Partially Occupied / Vacant) is derived, not a status.
- **Employee** — the person occupying a position.
- **Vacancy** — an approved need to fill HC against one position at one location.
- One Job can have many Positions (e.g. Sales Representative in Obour, Hurghada, Export).

### 3.2 Versioning

The organization is versioned (e.g. 2026.01 → 2026.02, each with effective date, approval date, approver, change description). Closed positions stay in history. Acting/delegation changes approval authority for a period without rewriting the chart.

### 3.3 Structured JD and its outputs

The JD lives in the system as structured data: purpose, responsibilities, authority, KPIs, qualifications, experience, technical skills, behavioral competencies, working/physical conditions, reporting relationship. It is versioned; offers and hires keep the JD version valid at the time.

As built v0.42.1 (CHG-88): the number of responsibilities follows the job level (JD standard v1.0, rule 4.2, indicative) — JL1–2 5–8, JL3 6–10, JL4–5 8–12, JL6–7 8–16 (grouped under 4–6 areas). Hard limits on save and on the Excel import: at least 3, at most 16. Above the level's band the draft is saved only with a written reason (kept on the JD version, shown on the JD); below it the editor shows a warning only. A job with no level gets the hard limits only. The AI CV reading sends up to 16 responsibilities.

As built v0.42.2 (CHG-89): each KPI is stored as name, formula (or, for a monitoring KPI, its purpose), frequency, type (weighted / monitoring) and weight. Hard on save and import: the weighted KPIs' weights add up to exactly 100 and none is without a weight; a monitoring KPI carries no weight. Warnings only: the number of weighted KPIs outside the level's band (JL1–3 3–5, JL4–5 4–6, JL6–7 5–7, indicative — owner decision D-08 on the job-profile standard), more than 4 monitoring KPIs, a JD with KPIs but no weights. The Excel import reads the columns «النوع» (موزون / متابعة) and «الوزن» on the «مؤشرات الأداء» sheet by name and refuses the file when either is missing. JDs from before keep their KPIs with no type until edited. The JD view, print and e-mail show the weight, weighted first.

As built v0.42.3: a printed JD saved as PDF is named after the job — «code title — الوصف الوظيفي vN» (with «مسودة» on a draft), the interview kit «code title — ملف المقابلة», and any other printed form after its own heading — instead of the portal's name.
As built v0.43.1: inside Apps Script the portal runs in frames and the browser names the PDF after the outer page, which the portal cannot change; so every print now opens in a window of its own whose title is that name (the window closes after printing). When the browser blocks pop-ups the print falls back to the page itself, as before. As fixed v0.46.2: the recruitment request print, which still printed inside the page, uses the same window too, named «طلب تعيين <request number>».

As built v0.44.2 (CHG-93): **job level from the grade.** A job whose level is empty takes one from its Korn Ferry grade — 1–2 JL1, 3–5 JL2, 6–7 JL3, 8 JL4 for a supervisor or head («مشرف / رئيس…») else JL3, 9–10 JL5, 11–13 JL6, 14–15 JL7. It is worked out each time and never written to the job, so a later grade change moves it too; a level set on the job (approved JD or jobs screen) always wins. The jobs list and the job page show it marked «من الدرجة»; a new JD starts at it; the probation evaluator rule (§17.2) uses it. **The grade is internal (D-21):** the printed JD and the JD sent by e-mail no longer show it; HR screens still do.

As built v0.45.0 (CHG-96): **manager review rounds.**
- **Who:** the HR Sector Manager, the HR Manager or the system owner opens and closes a round; HR staff (the roles that see the JD screens) can follow it. A reviewer sees only the drafts sent to him, read-only, and only while the round is open.
- **Scope and reviewers:** all draft JDs or one family. For each job, its reviewers are the holders (active accounts) of the position each of its positions reports to — reports-to, else the unit head, then the parent unit's head. Jobs whose manager has no account are listed before the round starts (print the draft for them); demo users are never reviewers. A draft already under review by the same manager in an open round is not sent twice.
- **What the manager sees:** the draft as it stands (purpose, responsibilities, KPIs, authorities, competencies, locations) — never the grade (D-21) or HR's internal notes.
- **Answer:** «موافق» or «عندي ملاحظات» with the notes (required, up to 2000 characters); he may change it while the round is open.
- **Mail:** one e-mail per manager listing his jobs and the due date, sent within the internal e-mail budget — what does not fit today goes with the next daily run; the inbox item and the portal notification appear at once. One reminder 2 working days before the due date to those who have not answered.
- **Follow-up:** HR sees each round (jobs, reviewers, answered / notes / no answer) and every note, exports them as CSV for the JD writers, and closes the round; after closing no answer is taken.

As built v0.43.0 (CHG-90):
- **Certificates and licences** (field «Certifications», Excel column «الشهادات والتراخيص» on the «الأوصاف» sheet, read by name, optional): one per line; shown on the JD, its print and e-mail, the worker card and the interview kit.
- **Locations from the structure:** the JD view and print list every work location of the job with the unit and the direct manager, from the job's active positions (the manager is the position it reports to, else the unit head). No location field in the JD: one JD serves all its positions.
- **Worker card** («بطاقة العامل»): one A4 page in large type for the worker — the job, code and direct manager; «هدف شغلك» (purpose); «شغلك» (responsibilities); «السلامة أولاً» in a bold frame (the hazards from the working conditions and the authorities whose level stops or refuses — «يوقف» / «يرفض»); «اللي بنقيسه في شغلك» (the weighted KPIs' names only, no formulas or weights); «وتقدر تقرر» (the other authorities); the certificates; and a receipt with the worker's signature or thumbprint, the manager and a witness (the receipt wording is a draft pending legal review). Marked «مسودة» on a draft. Offered first on JL1–2 JDs, available on any. Same view rights as the JD.

From the same source the system produces:

- JD view, print, PDF download and email from inside the system
- Approved JD can be e-mailed from the portal with a PDF to portal users only (up to 10 per send, audited); not sent to candidates.
- Recruitment advertisements per platform (section 7)
- Interview guide and question set (section 11)
- Probation evaluation template (section 17)

### 3.4 Structural Change (New Position) Request

1. The requesting manager submits: proposed title, department, section, reporting-to, number of positions, business justification, proposed qualifications and responsibilities.
2. The requester's management chain **endorses** the request (support, not approval) — e.g. Department Manager, then Sector Manager.
3. HR reviews organization impact, job architecture, grade, salary, reporting line and manpower, and records a recommendation.
4. The CEO gives the final structural approval.
5. A new organization version is created; the Position ID is generated on approval, not on request.
6. The position becomes selectable and a normal Recruitment Request can follow.

The requester never sets grade, salary, benefits or working conditions.

### 3.5 Protected job architecture

Grade, salary structure, benefits and working conditions are read-only for requesters, managers, recruiters and the HR Manager. Only the **HR Sector Manager (Mohamed Omara)** can change them, and every change is versioned and audited.

## 4. Recruitment Request

A manager requests HC only for positions inside his organizational scope, validated server-side; one request may cover several locations of the same job through request lines.

### 4.1 Fields

| Group | Content |
| --- | --- |
| Identity | Request ID/version; requester auto-derived from login (employee ID, name, title, org unit); Submitted By; submitted date |
| Job | Job Code, Job Title, Sector, Department, Section, Direct Manager / Reports-To, Grade (read-only), JD version |
| Request lines | One line per Position/location: Position ID, location, Current HC, Structural HC, Open Recruitment HC, Available HC, Requested HC, Approved Number Required |
| Need | Recruitment Type: Replacement / Additional HC / Backfill–Planned Vacancy / Temporary |
| Timing | Proposed Hire Date / Required-By Date |
| Employment | Employment Type, Work Model, shift pattern / working hours |
| Priority | Requested Priority + reason (proposal only) |
| Justification | Reason category (increased workload, replacement, new business, new project, organizational change, productivity, other) + details; attachments linked to the request |
| Replacement | One or more replaced employees: ID, name, position, last working date, reason |
| Requirements | Baseline education, specialization, experience context + years, skills with required proficiency and Essential / Additional flag, request-specific notes |
| Role content | Duties & responsibilities and working conditions pulled from the linked JD version |
| HR review | Status, HR Notes, Reviewed By / Date |

### 4.2 HR Manager review powers

The HR Manager can Approve, Reject, Return for Revision, Edit, or Send to CEO. Editable fields: Approved Number Required per line, Employment Type, Required-By Date, HR priority classification, requirements, JD version. Not editable: grade, salary, benefits, working conditions (section 3.5).

Every HR edit is shown to the requester as old → new with the reason, and is stored in the approval snapshot.

### 4.3 Requester notifications and timeline

The requester is notified in-app (and by email where the channel budget allows) on: submission received, each approval step, return with reason, rejection with reason, any HR edit, routing to CEO, approval for recruitment, vacancy creation, and each joiner against the request.

Every request has a timeline showing each event with actor, date/time and comment. The manager's home screen lists My Recruitment Requests with status and required date.

### 4.4 Return and change control

Return for Revision keeps every prior version and the exact submit / return / resubmit timestamps. Material changes after approval (HC, position, location, employment type, required date) create a Change Request, an impact assessment and reapproval where required.

As built (v0.28.0): after approval, only a headcount increase goes back to approval, as a linked request that tops up the same vacancy. Every other change (date, specs, priority, employment type, branch, headcount decrease) is recorded by HR with a reason as an amendment version of the request.

## 5. Headcount rules

A manager may request any number; HC above Available becomes a Headcount Exception that only the HR Manager or the CEO can approve.

| Metric | Definition |
| --- | --- |
| Structural HC | Approved HC for the Position. Phase 1: 1 for every position (temporary) |
| HC Basis | Baseline (temporary) or Approved Manpower Plan; reports separate the two |
| Occupied HC | Employees currently in the Position; Phase 1 entered by HR (default 0), later imported from payroll |
| Open Recruitment HC | Approved, still-open vacancy quantity against the Position |
| Available HC | Structural − Occupied − Open Recruitment |
| Requested HC | What the manager asked for; may exceed Available |
| Approved Number Required | What was approved; stored separately from Requested |
| Joined / Filled HC | Actual joiners only |

Rules:

- Current and Available HC are shown to the manager for guidance; they never block submission.
- Requested > Available → Headcount Exception: justification mandatory; approver = HR Sector Manager only (CHG-40/2); recorded as its own approval (available, requested, exception HC, approver, date, reason).
- Multiple open requests on one Position never double-count capacity.
- As built v0.40 (HC-005): HC asked for by requests still in approval is **reserved** — Available = Structural − Occupied − Open − Reserved for every other request on the same position (a request never reserves against itself), and the request view shows the reserved number.
- Accepted and pending offers are shown as exposure, not as Joined HC.
- Partial fill is supported; a vacancy stays open until joined HC reaches the approved number or an approved change closes the balance.
- Phase 1: HC checks warn only. Blocking behavior is a configuration switch, turned on after the HC data is verified.

## 6. Approval, authority, delegation and priority

Approval chains are derived from the organization structure at run time, never stored as fixed names on the request.

### 6.1 Recruitment Request chain

- Normal: Section Head (requester) → Department Manager → Sector Manager → HR Manager.
- Department without sections: Department Manager (requester) → Sector Manager → HR Manager.
- A missing level is skipped to the next valid authority, and the skip is recorded.
- Sector Manager position vacant → HR Manager or CEO, per configured fallback.
- Request for a Sector Manager position: requester = HR Manager, approver = CEO.
- Self-approval is blocked; the resolver finds the next valid approver.

### 6.2 CEO approval

CEO approval is rule-based, not universal. The HR Manager can route any request to the CEO (status Pending CEO Approval). The CEO can issue effective-dated rules by job, department, sector, request type or priority (e.g. all Production requests until 31 Dec). Rules live in AUTHORITY\_RULES, not in code.

As built v0.36 (CHG-74, CHG-75):
- CEO queue (CEO\_APPROVALS): giving or removing the CEO or Board role, linking a user to the head position of the company or a sector, and delegating the company head's authority are saved as a pending item and carried out only when the CEO approves (as the person who asked). A rejection needs a reason and changes nothing. A newer request for the same thing cancels the older one. While the portal has no CEO user, the owner sets these directly and the audit log records it (NO\_CEO\_DIRECT).
- The HR Sector Manager's own approval never covers a request on his own position, and an HR approver who approves a request on his own position sends it on to the CEO (a CEO step is added).
- The CEO decides from one page: the queued items plus any approval step of a recruitment or new-position request that is his.
- Trusted phone (CEO\_DEVICES): the CEO, signed in on his phone, sets a PIN of 4–6 digits (no repeated or consecutive digits) and the phone keeps a device key. The key and the PIN are stored hashed only. The approvals link (?ceo=1) opens on that phone with the PIN; 5 wrong PINs lock the device 15 minutes and tell the owner; a PIN opens a 30-minute session. A device lasts CEO\_DEVICE\_DAYS (90) days; the owner and the HR Sector Manager see the days left and get reminders at 14, 7 and 1 days, and either of them (or the CEO) can revoke it. A device stops working when its user is no longer an active CEO.
- The HR Sector Manager sends the link from «CEO approvals & access»: a WhatsApp message with the number of items waiting and the link only (no names or request details).

### 6.3 Delegation

Acting / delegated authority has From, To, authority, reason and effective dates. Each delegation is a new record; old ones are never edited. At most 90 days, renewable (CHG-76). Nobody delegates authority to himself; the authority of the company or a sector head is delegated by the system owner or the HR Sector Manager only (v0.34). As built v0.36: a delegation lists the processes it covers — approving requests, and following the unit's work (candidates, transfers, probation); anything not ticked stays with the position's holder. A delegation of the company head's (CEO's) authority waits for the CEO's approval (status «waiting for the CEO») and stopping it cancels the pending item.

### 6.4 Approval snapshot

Every decision stores the entity, version, required authority, assigned approver, decision, timestamp, comment and a snapshot of exactly what the approver saw.

### 6.5 Priority

| Layer | Owner | Purpose |
| --- | --- | --- |
| Requested Priority | Requester | Proposal with reason |
| HR Classification: Normal / Important / Critical | HR Manager only | Official importance; every change logged with reason |
| Dynamic Priority Score | System | Daily work order: classification + aging (in bands) + Required-By urgency + configured impact factors |
| Temporary Override (Pin / Expedite) | HR Manager only | Reason + Effective From / To; expires automatically |

An old Normal vacancy can outrank a new Critical one. Classification and score are always shown together, and score history is kept. Weights are configured and tested on 20–30 sample requests before go-live.

## 7. Vacancy, recruiter team and advertising

An approved request creates one Vacancy per request line, so each location is tracked, staffed and closed on its own while staying linked to the same request.

### 7.1 Vacancy

- Example: REQ-2026-0045 approved for 5 (Obour 3, Inshas 2) → VAC-…-A Obour, HC 3 and VAC-…-B Inshas, HC 2.
- Fields: Required HC, Joined HC, Remaining HC (derived), Recruitment Start Date, status, HR classification, dynamic score, Lead Recruiter.
- Vacancy Age starts at Recruitment Start Date, not request creation.
- Statuses: Approved, Recruitment Preparation, Open, On Hold, Partially Filled, Filled, Closed, Cancelled, Frozen.
- The request closes only when all its vacancies are Filled, Closed or Cancelled.
- As built v0.41 (CHG-86): **Frozen** — a management hiring freeze set and lifted by HR managers only, with the decision as the reason. A frozen vacancy keeps its candidates and its headcount (still counted as open), takes no new candidates, interviews, transfers or fills, and its apply page is closed; unfreezing returns it to the status it had.
- As built v0.40 (VAC-002): the request moves to «Closed» by itself the moment its last vacancy is filled, closed or cancelled (event, requester told), and back to «Approved» when one of them reopens (a fill voided). A closed request still opens, prints as approved and counts in the approval-time KPI.
- HC change after recruitment starts shows impact (joined, accepted and outstanding offers, final-stage candidates) before approval.
- Cancellation requires disposition of every open application: Transfer / Talent Pool / Reject due to Cancellation / Hold.

### 7.2 Recruiter team

- Vacancy ↔ Recruiter is many-to-many: one Lead Recruiter + assigned recruiters.
- Each application has one Current Owner; reassignment history is immutable (from, to, by, date, reason).
- Inactive recruiter → active work moves to an Unassigned Work Queue for bulk reassignment.
- Vacancies can be assigned to recruiters in bulk, and all of one recruiter's work can be moved to a colleague with the same roles; candidates and next actions follow, with one notification per person.
- Before contacting a candidate, the recruiter sees the latest contact and who made it.

### 7.3 Advertising

- Advertisement is a first-class record: Ad ID, vacancy, platform, campaign / sub-source, content version, publication and closing dates, URL, cost / credit used, posted by, updated by / date.
- Statuses: Draft, Ready, Published, Paused, Closed. Copy Advertisement reuses an ad without changing the original.
- Ad text is generated from the JD + vacancy details through a template per platform (LinkedIn, Facebook, Wuzzuf, company website, internal, WhatsApp, other), then edited and copied by the recruiter.
- Ads never carry a recruiter's personal number; each ad carries an Apply link that opens the application form and attributes the source and ad automatically.
- Ad publication consumes subscription credits (section 8).

### 7.4 Internal transfer and employee movement (v2.2)

A vacancy can be filled by moving a current employee instead of hiring, and every movement between units follows one controlled transfer process that keeps headcount right on both sides.

**Filling a vacancy by internal transfer**

- Every vacancy fill records its method: External Hire or Internal Transfer.
- Phase 2 (built in v0.2.0): the recruitment team records each person who fills the vacancy — External Hire or Internal Transfer, name, employee ID, effective date and, for a transfer, the source position. It counts in Joined HC (Partially Filled / Filled, not a plain Close), Occupied HC moves automatically (+1 target, −1 source) with position history, and a wrong record is voided by an HR Manager with a reason, reversing both.
- Phase 3: an internal candidate enters the pipeline with source "Internal", goes through screening, assessment and interviews like any candidate, and the current manager is notified before the first interview.
- Phase 6: when that internal candidate is selected, the fill is completed through the transfer process below, not through offer and joining.

**Transfer process (Phase 6, needs the employee file)**

- Types: fills a vacancy · standalone move between units or locations · temporary assignment with an end date.
- Any manager can raise a transfer request for an employee (the releasing manager, the receiving manager) and so can HR; the employee must be in the requester's scope or be the subject of an open vacancy.
- Decision: the other manager gives an opinion and the proposed handover / last-day date but cannot block the move; the HR Manager takes the final decision. The HR Sector Manager also approves only if grade, salary, benefits or working conditions change (his sole authority, 3.5).
- Target position must have Available HC, or the transfer is an HC exception with justification.
- On the effective date: the employee's position changes, Occupied HC moves from source to target, the linked vacancy's Joined HC increases, and everything is written to position and employee history.
- The releasing manager is offered a pre-filled Replacement request for the released position; nothing is created automatically.
- Handover checklist and a notice to the payroll owner; the system itself takes no pay action.
- States: Draft → Other Manager's Opinion → HR Decision → \[Pending HR Sector Manager\] → Approved → Effective; or Returned / Rejected / Cancelled.

**As built in v0.41 (CHG-85)**

- Who opens: HR; the employee's current manager; or the receiving manager — he finds any active employee by name or code (at least 3 letters) and may only move him to a position in his own scope; the current manager is told at once.
- The current and receiving managers' steps are opinions: «agree» or «object» with a reason (recorded, the requester told) — an objection never ends the request. Only the HR step (and the HR Sector Manager when pay items change) can reject. A requester's own step passes when reached.
- Temporary transfer (cover): to an end date at most TRF\_TEMP\_MAX\_DAYS (180) days away; no room needed on the target and no vacancy linked. On the start date the employee keeps his own position and headcount and the cover is recorded on him (temporary position, until, transfer); a reminder goes a week before the end (working days); on the day after the end date the cover ends by itself every day — days off included — and he is back; HR may end it early with a reason. No other transfer for him while a cover runs.
- Handover list on every transfer (TRF\_HANDOVER\_ITEMS, else four built-in items: custody and tools, ongoing work and files, accounts and passwords, introducing the replacement), ticked by the current manager, the requester or HR, with extra items; open items are named in the notice when the move is carried out (it never blocks it).
- On a permanent move the old manager gets a notice that opens a replacement request prefilled with the old position (reason «transfer»); nothing is created automatically.

## 8. Recruitment sources, subscriptions and agencies

Source is mandatory on every Application, because the same person can arrive through a different source in each recruitment cycle.

- Source → Sub-source: Employee Referral → Employee ID; Agency → agency; job board → specific ad; Facebook → campaign; also Walk-in, WhatsApp, Talent Pool, LinkedIn, Internal.
- Where relevant keep Original Source, Application Source and Influencing Source, with history.
- Referral attribution is locked by rule; it cannot be changed after the hiring outcome is known.
- Referral record: referring employee, date, relationship if policy requires, bonus eligibility.
- Subscription record: provider, start / expiry, package, purchased credits / ads / CV searches, used, remaining (derived from usage), cost, account owner, renewal notice, contract / invoice attachment.
- Alerts before expiry and when paid credits remain unused.
- Agency terms: fee type / amount, guarantee period, replacement terms, submission date, candidate ownership expiry.
- Metrics: applications, qualified, interviews, offers, hires, then cost per application / qualified / interview / hire / successful-probation hire, and retention.

## 9. Person, candidate, application and talent pool

Person Master is the lifelong identity; Candidate Profile and Employee Profile hang from it, and an Application links a candidate to one vacancy.

### 9.1 Identity and duplicates

- Duplicate check before creating anyone, in order: National ID (if held) → email → mobile, plus name similarity. The system warns and offers Link Existing / Create New / Skip; it never auto-merges.
- Matching also searches former employees and shows Rehire Eligibility to authorized HR.
- As built v0.41 (CHG-86): **similar names** count as a possible match too — the first three names (four when both have four) alike after normalising hamza, taa marbuta and a joined «عبد / أبو», allowing one letter's difference per name; names under three words never match. A name-only match on someone the user cannot already see shows his name with the mobile masked and no e-mail. (The «عبد» joining also fixes the same check for former employees.)
- Hiring Restriction (Do-Not-Rehire): high HR authority only, coded reason, evidence, added by, review date or permanent. Recruiters cannot create it from impressions.
- As built v0.40 (CHG-84): **no permanent restriction** — every restriction has a review date at most RESTRICTION\_MAX\_YEARS (2) years away; when it comes, HR managers are told (working days) and lift it or renew it by a decision with a new date (again at most 2 years). The person may appeal: HR records the appeal (grounds, at least 10 characters); the HR Sector Manager decides — never whoever placed the restriction or recorded the appeal (then the CEO decides). Accepting lifts it; rejecting keeps it; both are audited and the recorder is told. Older permanent restrictions got a review date 2 years after they were made (or a month from the upgrade when that had passed).

### 9.2 Candidate journey

- Interaction Mode: Self-Service / Recruiter-Assisted / Hybrid. Candidate category (administrative / technical) never decides the mode.
- The candidate portal is optional and needs no Google account: a secure link per application for missing data, CV and document upload, interview confirm / reschedule / decline, and offer actions.
- Recruiters can act on behalf of any candidate; the audit records the acting recruiter, the candidate and the time.
- Preferred communication method is stored (phone, WhatsApp, email, recruiter-assisted).

### 9.3 Application form

- Core data for all: name, mobile, WhatsApp, email, governorate / area, qualification, specialization, graduation year, experience, current job and employer, current and expected salary, notice period, CV, source.
- Vacancy-specific questions come from the Screening Question Library.
- The candidate must accept a Recruitment Privacy Notice before submitting; the accepted notice version and time are stored. For recruiter-entered candidates, the recruiter records verbal acknowledgement.
- Current and Expected Salary are optional for every applicant, and the form does not label them optional. When a salary is entered, a separate sensitive-data consent is taken. Zero is refused, and a blank salary is never an automatic rejection reason.
- National ID is optional at application and becomes mandatory at the hiring-document stage.

### 9.4 Applications

- A candidate may hold several active applications; the system warns recruiters, it does not prohibit.
- Transfer to another vacancy creates a new application linked to the origin application.
- Withdrawn or rejected applications reopen only with permission and reason; otherwise a new application is created.

### 9.5 Bulk import and talent pool

- Bulk import (Excel / CSV / Google Sheet, typically 50–100 rows): pre-import validation (new, possible duplicates, missing mobile, invalid), duplicate review screen, Batch ID, source, vacancy, imported by / date, funnel by batch.
- Talent Pool is hybrid: the system suggests category and tags, the recruiter confirms or ignores.

### 9.6 Privacy and legal rules as built (v0.38, CHG-80 / CHG-81)

- Consent before work starts: a person who applied on the apply page gave his consent there. A person added by hand, from an import or from a job site has only the recruiter's note that he was told; he cannot move past «Contacted» (screening, shortlist, interviews, offer) until he gives his own consent. The recruiter sends him a private consent link (WhatsApp or e-mail); the page shows the employer, the privacy notice and the storage / transfer consent. The link lasts CONSENT\_LINK\_DAYS (7) days, works once, and «send a new link» replaces it. The consent is logged (channel LINK) like the apply page's.
- Salary on the apply form: optional, as an expected range (from – to). The current salary is not asked on the apply form; it is recorded at the offer stage. Salary data keeps its separate consent.
- Relatives: the apply form asks whether a relative works in the company (name and relation). The portal looks for the name among active employees and shows a «possible relative» alert on the candidate page. Every interviewer, when saving an evaluation, and every offer approver, when approving, declares that he is not related to the candidate; the declaration is recorded in the audit log, and a declared relation stops the action (another person must do it).
- Accommodation and disability: optional questions — whether the candidate needs an accommodation for the interview or the job, and whether he has a disability (for the legal 5 % quota). Only the HR team sees the answers. The disability flag follows the person to his employee record at joining, and the employees screen shows the share of active employees with a disability against the 5 % target.
- Under 18: a birth date under 18 years, or the «I am under 18» box, needs a guardian's name, mobile and consent on the form (consent kind GUARDIAN).
- Photos: the photo on the apply form is kept only with its own optional consent; a recruiter who uploads a candidate photo confirms the candidate agreed. The hiring manager sees a candidate's photo only after the candidate's first interview is done (the recruitment team sees it as before).
- Surveys: survey averages (new-hire voice, and the KPI built on it) are shown only for groups with at least SURVEY\_MIN\_ANSWERS (5) answers.
- Usage policy: every user accepts the usage policy once (USAGE\_POLICY\_AR / EN, version USAGE\_POLICY\_VERSION) before using the portal; the text tells staff that the portal computes their service indicators (approval speed, interview feedback). A new version is accepted again.
- Retention: candidates are kept 2 years (RETENTION\_\*\_MONTHS = 24) after their last application closed, then deleted automatically (RETENTION\_ENABLED = Y). Before go-live (test data) the job only lists who is due.
- Data-subject requests: answered within 30 days (DSR\_DAYS). A request is closed only after the identity check is recorded (how it was checked, by whom, when). Kinds include objection and withdrawal of the AI consent; a withdrawn AI consent stops any further AI reading of that person's CV.
- Background / criminal-record check: for all jobs; the candidate's signed consent («إقرار موافقة على الكشف الجنائي») is uploaded before the criminal-record document can be uploaded.
- Social insurance from the first working day: a different start date is an exception with a reason, approved by the HR Sector Manager (until then the case keeps the first working day).
- Contracts without social insurance: an offer without insurance records its legal basis, and the portal prints the «no-insurance acknowledgement» form; the signed form is uploaded back before the person can be recorded as joined. From v0.46.2 (CHG-100) the signed form is one of the joining documents (§14): «إقرار التعاقد من غير تأمينات اجتماعية (موقّع)», added only to the list of a contract without insurance, required, never deferred or waived, on the receipt, and deleted with the other documents.
- Payroll stop notice: stays as built. From v0.48.0 (CHG-103) it is worded as a notice to follow up the missing documents, never a stop of pay (art. 36 of decree 162/2026: wages are not withheld or deducted except as the law provides).

### 9.7 The candidate's own page and private links (v0.39, CHG-83 / CHG-82)

- The recruiter sends the candidate one private link (WhatsApp text or e-mail) from the candidate page. On it the candidate: gives his consent when he has not yet (§9.6); completes his data (e-mail, National ID and birth date when still empty, governorate and area, education, experience, current job, notice period, preferred contact channel) and uploads or replaces his CV; confirms or declines an interview the team has invited him to (a decline needs a reason); and reads the offer letter presented to him and accepts it or declines it with a reason.
- Every step is recorded as done by the candidate through his link (activity and audit), and the team is told. The recruiter can still do each step for him from the portal (recorded as on his behalf), as before.
- The page shows only the candidate's own applications, interviews (date, time, place) and the offer letter as presented — never internal notes, evaluations, other candidates, salary structures or the incentive annex.
- Private links (consent, the candidate's page, hiring documents, new-hire voice, the probation page): valid 7 days from the moment they are sent (CONSENT\_LINK\_DAYS, SELF\_LINK\_DAYS, DOC\_LINK\_DAYS, NHV\_LINK\_DAYS, PROB\_LINK\_DAYS); «send a new link» replaces the old one at once; a link stops working when its purpose is done (consent given, survey answered, all applications of the candidate closed, documents receipt issued, probation ended).
- Preferred contact channel (WhatsApp, e-mail or phone) is kept on the person (the recruiter or the candidate sets it) and shown wherever the team contacts him, including the rejection message step.
- Interview reminders: the panel gets the day-before reminder by e-mail as well as in the portal; the candidate gets an e-mail about two hours before a confirmed interview (once), in addition to the day-before e-mail, and the organizer is reminded to message him on his preferred channel.

## 10. Screening, activity log, actions and communications

The recruiter works from one screen and one queue, and every meaningful interaction leaves a short structured record.

### 10.1 Screening

- Questions are Information or Knockout. A failed knockout flags "Mandatory Requirement Not Met" for human review; nothing is auto-rejected or hidden.
- Screening workspace: candidate data, CV, previous applications / interviews, vacancy requirements and JD, notes, communication history, side by side.
- Actions: Shortlist, Hold, Reject, Request Information.
- AI CV help returns Evidence Found / Not Found / Needs Verification plus a summary; never a match percentage that decides.
- As built v0.37 (CHG-73): the AI is not asked for the National ID and returns none; the address comes back as "district, governorate" only (never a street); the match is shown as a percentage (score 1–5 × 20) and stays advisory. When the candidate's governorate differs from the vacancy location's governorate, the reading shows "far commute — check transport" for information only. The CV file itself is sent as uploaded: a photo or a National ID printed inside the file reaches the AI, so the go-live step keeps the transfer-licence reminder.
- Rejection reasons (coded): Experience, Qualification, Technical Requirement, Salary Expectation, Location / Transportation, Availability, Work Schedule, Position Filled, Candidate Withdrew, Duplicate, Other (note required).
- The internal rejection reason is separate from the candidate-facing message.

### 10.2 Activity log

- Types: Candidate Call, Hiring Manager Discussion, Internal HR Discussion, WhatsApp, Email, Interview Coordination, CV Review, Follow-up, Agency Discussion, Reference Check, Note, Other (list is configurable).
- Record: actor, date / time, discussed with, summary, outcome, next action + date. One record links to candidate, application, vacancy and request at once and appears in each.
- Activity (happened) ≠ Internal Note (observation) ≠ Action (to do).
- No silent edits: revisions keep original text, editor and time; deletion is void with reason.
- "Improve Summary" (AI) rewrites a rough note; the recruiter reviews before saving.
  As built v0.41 (CHG-86): «✨ improve the wording» next to the note on the candidate page — the note goes to the same AI service as the CV reading (switched on there, its monthly cap and log), keeping the facts only and removing anything about age, gender, religion, marital status, health or family; the suggestion replaces the text in the box for the recruiter to edit and save. The call is logged with its cost, the text itself is not kept; not for a candidate who withdrew AI consent.

### 10.3 Action queue

New Applications, First Contact Due, No-Answer Follow-up, Screening Pending, Waiting Information, Interview Scheduling, Manager Confirmation Pending, Assessments Due, Offers, Joining, Overdue. Every application carries Next Action type, date and owner; missed dates show as overdue.

### 10.4 Candidate communications

- Message templates per stage: interview invitation, confirmation, reschedule, assessment invitation, rejection, offer notification, missing documents, joining instructions.
- Templates auto-fill name, job, date, time, location, interviewer, contact.
- Phase 1: Copy for WhatsApp, or send by email. WhatsApp API is a later phase.
- **Rejection notice is an explicit step**: when an application is rejected, the system creates a "Send rejection message" action with the channel from the candidate's preference, and records when it was sent.

## 11. Interview management and evaluation

No interview is confirmed without the manager, the interviewer works from a prepared screen with the JD and questions, and each evaluation is independent.

### 11.1 Confirmation chain

Proposed → Manager Confirmed → Candidate Confirmation Pending → Confirmed → Checked-in → Started → Completed → Evaluation Submitted.

- The candidate invitation (copy / send) is unavailable until the manager confirms.
- Exceptions: Manager Declined, Candidate Declined, Rescheduled, Candidate No-Show, Manager No-Show, Cancelled, Waived, controlled Ad-hoc Interview (reason + actor recorded).
- Each interview has date, time and **location / meeting link**; managers see their interview schedule with location.
- Reminders (configurable): 24 h and 2 h before to manager and candidate, 15–30 min before to manager. High-no-show roles can require reconfirmation the day before.

### 11.2 Check-in and evidence

Check-in starts a waiting timer. Recorded events: arrival, interviewer screen opened, first note, evaluation started, last activity, start, end, evaluation submitted. Reports describe evidence ("candidate waited 23 minutes before first recorded interviewer activity"), never conclusions.

### 11.3 Interview plan and panel

- Rounds per Job / Vacancy (e.g. HR, Direct Manager technical, Sector Manager final), each Required / Conditional / Optional. Waiving a round needs authority and a reason.
- Panel roles: Lead Interviewer, Technical Interviewer, HR, Observer, Final Decision Participant.
- Focus by round: HR — motivation, stability, communication, fit, salary, notice period, transport / location, schedule; Direct Manager — experience, technical knowledge, problem solving, core requirements; Sector Manager — maturity, scope of responsibility, level fit, leadership where relevant.

### 11.4 Interviewer workspace

Candidate summary, CV, **JD of the vacancy**, interview guide and questions, previous interview information (permission-controlled), evaluation form.

### 11.5 Competency Library and Question Bank

- Competency Library: company-wide definitions with levels 1–5 and behavioral anchors.
- Job Competency Profile: the competencies each job needs and the required level (e.g. Communication 3 for Sales Representative, 5 for Sales Manager).
- Interview Question Bank: approved questions per competency and per round.
- In an HR interview the system shows the job's **standard HR questions** automatically.
- Question types: Mandatory (must be asked), Suggested, Interviewer-added (recorded with the evaluation).

### 11.6 Evaluation

- Layers: Requirements → Competencies → Structured Questions → Overall Recommendation.
- Scale 1–5: Well Below / Below / Meets / Above / Significantly Above requirement.
- Critical requirements: Met / Not Met / Needs Verification, separate from ratings; evidence mandatory.
- Recommendation: Strongly Proceed / Proceed / Hold / Do Not Proceed; the hiring decision is separate.
- Interviewers cannot see others' evaluations before submitting their own; afterwards visibility is permission-controlled.
- Revisions after submission create a new version with reason; late submissions are allowed and measured.

### 11.7 Comparison and decision readiness

- Comparison is live, per candidate, without waiting for the whole pipeline.
- Incomplete evaluations show as Incomplete (e.g. 2/3), never zero. Conflicting recommendations show as Evaluation Conflict, never averaged.
- Decision Readiness: Not Ready / Ready for Decision / Decision Deferred / Selected / Reserve / Rejected / Withdrawn.
- Salary fields in comparison follow field-level permissions.

### 11.8 Interviewer analytics

Rating distribution vs company average, share of middle ratings, submission delay, candidate waiting, reschedules and no-shows. For calibration only, never an automatic judgment of a manager.

## 12. Practical / technical assessment

A practical or technical assessment is a formal stage of the candidate journey, configured per job; its detailed rules are still to be defined (section 30).

- Configured in the Job / Vacancy plan like an interview round: Required / Conditional / Optional, with its position in the sequence (e.g. after HR screening, before the manager interview).
- Types (configurable): practical trade test (e.g. machine operation, assembly, finishing), written technical test, skills demonstration, other.
- Scheduling reuses the interview chain: assessor confirmation before the candidate is invited, candidate confirmation, check-in, no-show handling, reminders.
- Assessment record: type, date, location (e.g. factory workshop), assessor(s), criteria from the job's assessment template, result Pass / Fail / Needs Retest, optional score, assessor comments, evidence attachments (test sheet, photos of the work sample).
- Safety: practical tests on the shop floor require an HSE briefing / PPE checklist item before start.
- A failed assessment flags the application for a human decision; it does not auto-reject.
- Results appear in candidate comparison and decision readiness; waiving a required assessment needs authority and a reason.

## 13. Selection, reference checks, compensation and offer

Selection and the offer are separate steps: the first decides who, the second decides terms within salary authority.

### 13.1 Selection

- Decisions: Selected / Reserve / Hold / Rejected / Additional Interview Required.
- Selection record: decided by, date, vacancy / position, reason, conditions, snapshot of evaluations available at that moment.
- Reserve candidates are kept so a declined offer does not restart the search.
- Reference Check is an optional formal step by job / policy: referee, consent / evidence, performed by, date, result, follow-up.

### 13.2 Compensation structure

- Fixed: Basic + configurable fixed allowances (housing, transportation, meal, representation, other). Fixed Monthly Package is calculated by the system, never typed.
- Variable: incentive, commission, bonus, production or sales scheme, linked to a versioned Scheme ID.
- Each component has Show on Offer Yes / No. Incentives and commissions are held in the system but not written in the offer.
- Salary structures (Min / Mid / Max per grade) and incentive schemes are versioned; the offer keeps the versions valid at issue.

### 13.3 Offer authority

| Authority | Limit (configurable) |
| --- | --- |
| Recruiter | Around grade minimum |
| Recruitment Supervisor | Up to midpoint |
| Recruitment Manager | Up to maximum |
| HR Manager | Above maximum, as exception with justification |

A lower role may propose above its limit; the offer routes to the lowest sufficient authority. Missing roles use fallback resolution. Limits live in OFFER\_AUTHORITY\_MATRIX, not code.

As built v0.40 (CHG-84): the Recruiter's limit is **exactly the grade minimum** (no percentage above it) — the matrix refuses anything else for the Recruiter row, and the upgrade set it back where it differed.

### 13.4 Salary trail

Each offer keeps five figures: Candidate Current Salary, Candidate Expected Salary, Initial Proposed, Approved Offer, Final Accepted. Negotiation analysis uses this trail.

### 13.5 Offer lifecycle

- Draft → Authority Check / Pending Approval → Approved → Presented / Sent → Candidate Reviewing → Accepted / Declined / Expired / Withdrawn; Negotiation → new version → reapproval if required.
- Versions V1, V2, V3 are never overwritten; each keeps salary, components, terms, approvals, creator and date.
- Every offer has **Valid Until**. Reminder before expiry; after it the status becomes Expired. HR can Extend Validity with reason; the extension is an audited event.
- Delivery: email / portal / PDF for digital candidates; printed offer for recruiter-assisted candidates, with acceptance recorded on behalf plus signed copy or evidence.
- Offer-decline reasons: Salary, Benefits, Counteroffer, Another Offer, Location, Working Hours, Job Scope, Joining Date, Personal, No Response, Other.
- Over-hiring warning before an offer exceeds remaining HC (joined + accepted + outstanding); authorized HR override with reason.

### 13.6 Net pay review and presenting the offer (v0.40, CHG-84)

- The net in an offer is an **estimate**. After approval, an offer with a net figure waits for the payroll reviewer (PAYROLL\_REVIEW\_USERS — e-mails or user IDs; empty = the HR managers) to confirm it («Review the net»); never the person who made the offer. Until then it cannot be presented; the reviewer sees it in «waiting for me» and on the home count. NET\_REVIEW\_REQUIRED switches the step off.
- The offer letter always marks the net «estimated» («صافي تقديري»; payroll confirms the exact net).
- Presenting by WhatsApp is from the recruiter's own mobile registered on the portal only; that number is recorded on the offer.

## 14. Joining, pre-employment and documents

The joining date is agreed after offer acceptance, and a candidate is Cleared to Join only when the date is confirmed and the minimum pre-joining requirements are met.

### 14.1 Joining

- Offer Accepted → Joining Date Coordination → Date Confirmed → Pre-Employment → Cleared to Join → Joining Expected → Joined / Postponed / Did Not Join.
- Every joining-date change keeps original date, new date, changed by, reason; slippage is a KPI.
- Did Not Join (never started) is distinct from Joined then Early Exit.
- Did-Not-Join reasons: Counteroffer, Another Offer, Personal, No Contact, Salary, Joining Date, Other.
- Joining a different approved position than recruited requires an approved change; recruitment history is preserved.

### 14.2 Document requirements

- DOCUMENT\_REQUIREMENTS by job, employment type, location, worker category: Required / Conditional / Optional; Before Joining / Can Be Deferred; Original / Copy; expiry; verification; who may upload.
- Statuses: Not Submitted → Uploaded → Under Review → Verified Digitally → Original Pending → Original Received → Completed; plus Rejected, Expired, Deferred, Waived, Suspected Issue, Replacement Requested.
- Upload is never equal to physical receipt.

### 14.3 Physical receipt

HR ticks what was physically received and generates a receipt (e.g. DOC-RCP-2026-00152) listing items, original / copy, date / time, receiver and notes. The PDF is saved to the employee file and can be printed or sent. Later batches get new receipts; old ones are never edited.

### 14.4 Deferred documents — alert only

- Deferral needs an authorized approver, reason and due date.
- Escalation ladder (configurable): reminders to employee before due, alert to HR on due date, HR escalation when overdue, HR Manager after a further period.
- **The system takes no payroll or wage action.** Escalation ends in an HR alert and action item; any administrative step is decided and handled outside the system.

### 14.5 Self-service

Eligible candidates and employees use My Documents to see required items, status, expiry and to upload replacements. HR uploads on behalf of non-digital staff, with actor recorded.

### 14.6 As built in v0.40 (CHG-84, DOC-002, FIL-001)

- **The 13 states** of §14.2 are shown on every document, derived from what is stored: Not Submitted, Uploaded (until a reviewer opens the file), Under Review, Verified Digitally, Original Pending (an original still to come), Original Received, Completed, Rejected, Expired, Deferred, Waived, Suspected Issue, Replacement Requested.
- **Suspected issue**: the reviewer marks a doubtful file with what is wrong; the HR managers are told and only they can verify it afterwards. **Replacement requested**: the reason reaches the candidate's upload link; a new upload goes back to review.
- **Expiry** (every day, days off included): a verified document past its expiry date becomes Expired — the team is told and the person is e-mailed to send a valid copy. On working days a renewal notice goes DOC\_RENEW\_NOTICE\_DAYS (30) before expiry for people who joined. A renewed, verified copy clears the markers. An expired document is not complete.
- **Deferred documents** (working days): the person is e-mailed 3 days before and on the due date; DOC\_DEFER\_ESCALATE\_DAYS (7) after the due date the HR manager is told, once. The portal still takes no payroll or wage action.
- **Employment contract**: (v0.47.0, CHG-101: a fixed-term contract prints the legal review's two-page preliminary template on the contribution wage — see CHG-101) after acceptance the joining card prints an Arabic employment contract (entity, person and National ID, job, location, contract type (the request's employment type as listed on the request — fixed in v0.46.2, when fixed-term, internship and daily contracts printed as «full time»), start date, monthly pay, probation of PROBATION\_DAYS — never more than three months, no repeat — insurance or the no-insurance basis; wording for the lawyer to confirm), and the signed copy is uploaded back. It never blocks joining. Deleting the person's data trashes it, like the signed no-insurance form.

## 15. Employee electronic file

Actual joining links an Employee Profile to the existing Person, so recruitment data is never re-entered and history stays connected.

- Tabs: Personal, Employment, Contract, Compensation (offer package as hired — not payroll), Documents, Qualifications, Medical / Insurance Documents, Recruitment History, Offers, Onboarding, Probation, Performance, Administrative Records, Changes / Transfers, Activity / Audit.
- Employment, position changes, exit and rehire are historical records, never overwrites (EMPLOYMENT\_HISTORY).
- Files live in Google Drive in folders named by stable IDs; sheets hold metadata and Drive file IDs. Shareable links are never the security model.
- Document replacements keep prior versions; expiry dates feed a Document Renewal Queue.
- Sensitive tabs (compensation, medical, administrative) have their own field-level permissions.

## 16. Onboarding and new-hire experience

Onboarding starts before day one, splits work by owner, and ends with the new hire's own feedback after 30 days.

- Onboarding case generated from a template by job, location and employee type once the candidate is Cleared to Join.
- Task owners: HR, IT, Admin, HSE, Hiring Manager. Tasks include employee ID, payroll data preparation (hand-off only), email / account, laptop / PC, workplace, PPE, access, orientation schedule.
- Task statuses: Pending, In Progress, Completed, Not Applicable, Blocked; each with owner, due date, completion time, notes.
- Manager readiness: team informed, workstation ready, first-day meeting planned, responsibilities reviewed, initial objectives, buddy / mentor where used. Shown as an operational readiness indicator, not a manager rating.
- Joining Tomorrow view shows readiness per joiner: documents, workspace, IT, PPE, manager, orientation, welcome gift.
- **Welcome gift**: a formal first-day task — required, gift type, responsible, preparation status, delivered, date.
- First-day check-in records actual joining date and time.
- Orientations tracked separately: HR, HSE, Department, Job, IT / Security — required, date, delivered by, completed, employee acknowledgement.
- Policy acknowledgements: electronic, or recorded on behalf with physical evidence uploaded.
- Assets: laptop, mobile, SIM, tools, PPE, access card, keys, uniform — asset ID, issue date, condition, acknowledgement.
- Check-ins: Day 1, Week 1, Day 30 (templates per job) — duties started, training needs, attendance / behavior concerns, open tasks; concerns create HR actions.
- **30-day New Hire Voice**: positives, improvement areas, recruitment promise vs reality, job clarity, tools readiness, manager / team experience, one thing to change. Separate from performance. Themes: Onboarding, Manager Support, IT, Workplace, Transportation, Job Clarity, Recruitment Experience, Training, Policies, Other; AI suggests, HR confirms. Selected answers are HR-only; management sees aggregated themes. Serious mismatch creates HR follow-up.

### 16.1 As built in v0.41 (CHG-85, CHG-86)

- Owners for IT, administration and safety (ONB\_IT\_USERS, ONB\_ADMIN\_USERS, ONB\_SAFETY\_USERS — e-mails or user IDs; the HR site specialist when none is named). The templates give them their tasks: safety induction and PPE (factories), device / e-mail / system accounts (offices, sales accounts in showrooms), and «ID card, desk and custody» (all). They see the onboarding screen and the programs they own.
- Custody & PPE log (ONB\_CUSTODY): item, kind (custody / protective equipment), serial, quantity, handed-over date and by whom, signed or not; returned or lost / damaged (with what happened). On the program and on the employee's file; items handed over before the employee code exists move onto it when he joins. Recorded by HR, recruitment, the IT / administration / safety people and the program's owners. Open items are named to HR, the departments and the site HR specialist when an end of service is recorded.
- «Arriving tomorrow»: everyone starting today or on the next working day — date confirmed, documents cleared, open tasks before and on day one with their owners (the viewer's own marked), custody recorded. For HR, recruitment and the IT / administration / safety people; a unit manager sees his own units.
- New Hire Voice axes: every question has an axis (job as promised, welcome and first day, direct manager, colleagues, intention to stay — NHV\_QUESTIONS may set it); the report shows each axis's average per round, hidden below SURVEY\_MIN\_ANSWERS people like the questions.

### 16.2 Attendance enrolment on ZKBioTime — as built in v0.44 (CHG-91)

- **What the portal keeps:** that the face and the fingers were enrolled on ZKBioTime, the punch type — machines only, or mobile + machines — the employee's code on ZKBioTime (optional), a note, who recorded it and when. Never a fingerprint, face image or any other biometric data, never punches or GPS: the portal does not connect to ZKBioTime (it sits on an internal server).
- **Onboarding task:** the day-one HR task «تسليم الكارنيه وتسجيل البصمة على ZKBioTime (وجه + أصابع)» is a task of its own kind: it closes only through the enrolment form, with both the face and the fingers ticked, or with a written reason (at least 10 letters) when one cannot be taken (e.g. an injured hand). It may still be marked «won't be done» with a reason.
- **Who:** HR records the enrolment and decides the punch type (HR roles, or the onboarding's HR site specialist who owns the task); changes after that by the HR roles only, every change audited.
- **Mobile licences:** `ATT_MOBILE_LICENSES` (default 150). Mobile + machines is refused when every licence is in use; the form shows «used X of N». A licence stays in use until HR records that the enrolment was stopped on ZKBioTime.
- **Exit:** when an employee's service ends, an active enrolment becomes «stop due» and the HR managers and the site HR are told to stop it on ZKBioTime; HR then records «stopped», which frees a mobile licence.
- **Existing employees:** HR can record an enrolment from the employee's file, so the licence count can include everyone already on mobile.
- **Deletion:** the enrolment row follows the person — a purge blanks the name, code and note; a demo wipe removes the rows.

## 17. Social insurance, probation and medical insurance

Each is its own case with a lifecycle and an owner, created automatically by the event that triggers it.

### 17.1 Social insurance

- Created on Actual Joining. Company operating target: processing within the first month of employment.
- Created → Documents Pending → Ready for Submission → Submitted → Under Processing → Registered → Completed / Issue.
- Tracks required date, due date, responsible HR user, submission, reference / evidence, completion; stays in the HR queue until done.
- Statutory deadlines must be validated against current Egyptian requirements before they are coded; the operating target stays separate from the legal deadline.

### 17.2 Probation

- Opens automatically on Actual Joining (HR can also open one for an employee already on the list): start, end, decision due date, direct manager, HR site specialist, position. One period only, at most 90 days (PROBATION\_DAYS), never extended (CHG-61).
- Goals: the direct manager sets 3–5 measurable goals in the first week; the employee acknowledges them on his private link or in person. Changing goals after acknowledgement needs a reason and a new acknowledgement.
- Checkpoints (PROB\_CHECKPOINTS, default 30 / 60 / 75): follow-up reviews on day 30 and day 60 (overall rating, status of each goal, what goes well, what needs improvement); the employee's self-assessment; the final evaluation on day 75.
- Performance log during the period: dated notes, positive or needs-improvement, with impact; shown to the employee on his link, who can reply. A note is never edited, only voided with a reason and kept. (The v2.1 categories such as Behavior / Safety Issue are not separate note types.)
- Final evaluation on the annual appraisal items: productivity 35%, quality 25% and the four core values 10% each (PROB\_WEIGHTS), 1–5 with evidence. It supports confirming at a weighted score of 3 or more (PROB\_PASS\_AVG) with no core value below 2 (PROB\_VALUE\_MIN). Interview scores are never reused.
- Improvement plan (PIP): 2–3 measurable goals, the support given and a review date 2–4 weeks ahead; it must start by day 60 so it ends inside the period; its outcome (passed / partial / failed) is recorded before the recommendation.
- Decision: the manager recommends confirm or end, with a reason (a detailed one when it goes against the score); HR decides by day 80 (PROB\_DECISION\_DAY). Confirming = HR team; ending the employment = HR Sector Manager only, with written reasons tied to the evaluation. The decision is told in a meeting (date recorded), then a printed confirmation / non-confirmation letter (wording interim, pending legal review).
- Stay interview near day 60 (CHG-62): HR with the employee, without the manager — what he likes, what could make him leave, manager support (1–5), intent to stay (1–5), risk level; a high risk alerts the HR managers and the HR site specialist. HR only.
- Manager satisfaction survey after confirmation: 3 questions (1–5) to the direct manager, feeding the quality-of-hire KPI.
- What the employee sees (CHG-66): his goals, the log notes, his self-assessment, the day-30 / day-60 follow-ups once the manager saves them, and the final evaluation (items, strengths, improvements, decision) only after the HR decision. Internal notes, the stay interview and the manager survey are never shown to him.
- Reminders and escalation (daily job): goals not set by day 5; 7 days before each review; 30 / 15 / 7 days before the decision (PROB\_REMIND\_DAYS); a late review goes to the manager's manager and the HR site specialist after 3 days, to the HR managers and HR Sector Manager after 7 (PROB\_ESCALATE\_DAYS).
- Manager change: HR sets the new direct manager with a reason; earlier reviews stay with the original manager. Exit during probation closes the case (automatically when the employee leaves, or by HR with a reason) without a fictional final evaluation.
- After the decision: an employee-history entry; on confirmation the medical insurance case opens and the manager survey is sent; on ending, HR records the end of service from Employees (no payroll action).

- As built v0.44.1 (CHG-92): **who evaluates.** The direct manager of the probation (who sets the goals, evaluates and recommends) is the first position up from the employee — reports-to, else the unit head, then the parent unit's head — at job level JL5 (head of section) or higher whose holder has an active portal account; the skip-level reviewer is found the same way above him. From v0.44.2 (CHG-93) a job without a level of its own uses the level from its grade (§3.3). A position whose job has no level and no grade counts only if it heads a unit and its title is not a supervisor's, technician's, assistant's or worker's («مشرف / فني / مساعد / عامل»). When nobody is found the probation opens without a manager and the HR managers and the site HR are told to set one («تغيير المدير»). Supervisors and technicians may pass their observations to the evaluator; onboarding tasks (on-the-job training) stay with the direct supervisor. Probations already open keep their manager.

### 17.3 Medical insurance

- Opened automatically when HR confirms the employee — only after successful probation (company policy; CHG-63). Owner: the HR site specialist.
- To add → Added (insurer from MEDICAL\_PROVIDERS, card number, date added, number of dependents) or Not added (reason, e.g. covered elsewhere). HR managers can reopen a closed case with a reason.
- Due within MEDICAL\_ADD\_DAYS (14) of confirmation; a late case shows in the HR to-do and sends one alert to the HR managers and the owner.
- Opened, due and added dates are stored separately; HR team only; every change audited.

## 18. Dashboards, SLA, KPIs and quality of hire

Every home screen starts with the user's actions for today, and every KPI drills down to the records behind it.

| Role | Action-first home |
| --- | --- |
| Recruiter | New applications, first contacts, follow-ups, interviews and assessments today, confirmations, offers, joining, overdue |
| Recruitment Manager | Vacancy age and priority, recruiter workload, pipeline, bottlenecks, offers, no-shows, source utilization |
| Hiring Manager | My requests, approvals, interviews today with location, candidates waiting, evaluations pending, comparison, joiners, onboarding and probation tasks |
| HR Management | End-to-end control: exceptions, documents, insurance, onboarding, probation, analytics |
| CEO | HC and vacancies, critical positions, decisions waiting, cycle trends, exceptions |

- Live funnel per vacancy: Required → Applications → Screened → Assessed → Interviewed → Selected → Offers → Accepted → Joined → Remaining.
- Stage KPIs: request approval, time to start, first candidate, screening, time to interview, manager confirmation, candidate waiting, evaluation submission, selection, offer approval, offer acceptance, accepted → joined, no-shows, reschedules, joining slippage, early turnover (30 / 90 / 180 / 365 days), probation outcome.
- As built v0.41 (CHG-86): leaving within 30, 180 and 365 days (beside the 90-day one) on the KPI screen's quality group — of the joiners whose 30th / 180th / 365th day fell in the period, the share who had already left; a joiner who has not reached the day yet is not counted.
- SLA matrix per activity, configurable by priority and job level; durations from stage history, showing which role held the delay.
- Notification levels: Immediate Alert, Reminder, Daily Digest, Escalation. Given the Phase-1 email budget, only OTP, Immediate Alerts and one daily digest go by email; the rest stay in-app.
- Quality of Hire links source, recruiter, screening, assessment, interview, offer, joining, probation and retention. The KPI screen measures it as the average final probation evaluation, beside probation pass rate, 90-day leavers and manager satisfaction; no combined formula until enough data exists.

### 18.1 Recruitment KPIs (built v0.26–v0.27)

The KPI screen (under Recruitment) computes every KPI from the portal's own records; nothing is typed by hand (CHG-64, CHG-65).

- Views: Process, Recruitment team, HR sites, Managers & approvers, and My evaluation for every user. Filters: period, sector, location, job class (labour / technical / administrative / leaders, from the grade via KPI\_JOB\_CLASS; default ≤4 labour, 5–6 technical, 7–8 administrative, 9+ leaders).
- Process KPIs (22 in 5 groups). Speed: request approval days, vacancies filled on time, time to hire, time to start, aging vacancies. Quality: probation pass rate, leavers within 90 days, quality of hire, join rate after acceptance, manager satisfaction. Efficiency & cost: offer acceptance, interviews per offer, cost per hire (subscriptions ÷ hires), referral share. Candidate experience: first contact within 3 days, closed candidates who got a reply, New Hire Voice average, interview no-shows. Compliance: documents complete before joining, social insurance on time, medical insurance on time, hires above approved HC.
- Each KPI shows value, target, number of cases, green / amber (within 10%) / red and a 1–5 score on the appraisal scale; fewer than KPI\_MIN\_CASES (3) cases = "not enough data", left out of the score. Every KPI drills down to its cases. Days-to-fill targets per job class: KPI\_TTF\_TARGETS (21 / 30 / 45 / 60 days).
- Scorecards, weights summing to 100: recruiter (vacancies he leads and tasks given to him) — on time 25, probation pass 25, tasks on time 15, first contact 10, screening quality 10, offer acceptance 10, closing messages 5; recruitment lead (whole team) — on time 25, probation pass 25, aging 15, assignment speed 10, offer approvals within a day 10, early leavers 10, manager satisfaction 5; HR site specialist — onboarding tasks on time 25, documents complete 20, social insurance on time 20, medical insurance on time 15, New Hire Voice follow-up 10, probation goals in week 1 10. A recruiter sees only his own card.
- Managers, approvers and interview panels: approval days, escalated approvals, interview evaluation within 24 hours, probation reviews on time, onboarding tasks — for information only, never in a score.
- My evaluation (CHG-66): every user sees the cards that apply to him and his service as manager, approver and evaluator, with only his own cases behind them.
- Targets & weights tab: KPI targets, days-to-fill per job class, job class per grade, card weights (live sum must be 100; blank = not in the card, 0 = information only; reset to default), minimum cases and the monthly summary. Edited by the system owner, HR Sector Manager and HR Manager only, with a reason, audited; the rest of HR / recruitment and the consultant view only.
- Excel export of any view; a monthly e-mail on the 1st (KPI\_MONTHLY\_EMAIL) to the recruitment manager, HR manager and HR Sector Manager. Forecasting and advanced analytics stay in Phase 8.

### 18.2 Insights (built v0.29.0)

- Source return: for each recruitment source, the funnel from applying to confirmation after probation, quality of hire (final probation score), time to hire and cost — ad spend, subscriptions spread over the period, agency fees and referral bonuses — giving cost per hire.
- Bottlenecks: each process step (request approval, assignment, first contact, each pipeline stage, interview confirmation, evaluation, offer approval, candidate answer, joining) with average / median / 90th-percentile days, what is waiting now, what is overdue, the slowest people where a person owns the step, and the oldest cases.
- Interviewer calibration: how each evaluator scores against the rest of the same panel, how often his recommendation matches what happened to the candidate, and, for those hired, his interview score against the final probation score.
- Settings INSIGHT\_STEP\_DAYS (target days per step) and INSIGHT\_REFERRAL\_BONUS (an estimate; the portal pays nothing). Same filters as the KPI screen (period, sector, location, job class). Access: HR / recruitment management and top management (and the HR team); the consultant reads only.

### 18.3 Hiring forecast (built v0.30.0)

- Method: from the last 12 months, leavers per month × 3 + the open vacancies still to fill = the hires needed next quarter, by job class and by sector. Approved positions that are empty with no vacancy are shown apart, as a management decision rather than a forecast.
- Expected time to fill per job class: the median of vacancy opened → joined over the year, else the job class target.
- Confidence: LOW under 6 months of history or under 10 leavers, MEDIUM under 12 months, GOOD after. The screen also shows the load per recruiter (hires needed ÷ active recruiters).

## 19. Permissions and field-level security

Authorization = role + organizational scope + process authority + field sensitivity, checked on the server for every call.

| Capability | Requester / Hiring Manager | Recruitment team | HR Manager | HR Sector Manager | CEO |
| --- | --- | --- | --- | --- | --- |
| Create recruitment request | Within scope | As configured | Yes | Yes | As configured |
| Approve request | By org chain | No | Yes | Yes | When rule applies |
| Approve HC exception | No | No | Yes | Yes | Yes |
| HR priority classification / override | No | No | Yes | Yes | No |
| Manage candidates | View as needed | Within assignment / team | Yes | Yes | If needed |
| See others' evaluations before own submission | No | No | Policy | Policy | Policy |
| Propose offer | No | Yes | Yes | Yes | No |
| Approve salary | No | Within band | Above max by exception | Yes | Where rule requires |
| Change grade / salary / benefits / working conditions | No | No | No | Yes (sole) | No |
| Controlled override | No | Limited by type | By type | By type | By configured type |
| Audit explorer | Own / scope | Own / team | Full HR | Full HR | Executive |

- Technical interviewers do not see current salary or offer details by default.
- Hiring managers do not see HR-only notes.
- Medical and highly sensitive documents need a separate permission.
- New Hire Voice individual answers can be HR-only.
- The role is always resolved from the authenticated user on the server; a role sent by the browser is ignored.
- Separation of duties (CHG-74, v0.34): nobody changes his own roles, position or delegation; the System Owner, HR Sector Manager, CEO and Board roles and positions that head a unit are given only by the System Owner or the HR Sector Manager (CEO approval added in v0.36, CHG-75: CEO and Board roles and company / sector head positions are applied only after the CEO approves).
- Two-person rule (CHG-77, v0.36): wiping the transactions, resetting the sign-in of an administrator account (owner, HR Sector Manager, HR Manager) and ending an employee's service by company decision (termination, absence) are requested by one user and approved by the HR Sector Manager or the system owner — never the same person (DUAL\_REQUESTS). The requester of a wipe or reset is an HR user; of an end of service, the employee's manager or HR. While the portal has a single real administrator, the owner may still wipe alone and the audit log records it (WIPE\_SOLE\_ADMIN); the go-live step (v0.37) locks the wipe for good.
- Access review (CHG-78, v0.36): every 3 months the HR Sector Manager reviews every active user's roles and the delegations in effect, and signs off with a note; the portal reminds him at each quarter start and on his home page when 92 days have passed.
- A recruiter reaches a candidate only through his own vacancies: linking an existing person needs his mobile, National ID or e-mail as recorded; a merge needs access to both people; search masks contact details outside his vacancies (v0.34).
- An account that stops (deactivated, or its employee leaves) has its sessions closed and its recruitment work returned to «not assigned» (v0.34).

## 20. State machines and automatic triggers

Valid transitions live in WORKFLOW\_RULES / STATE\_TRANSITIONS configuration, not scattered through screens.

| Process | Flow |
| --- | --- |
| Structural Change | Draft → Submitted → Endorsement (management chain) → HR Review → Pending CEO → Approved / Rejected / Returned → Org Version Created → Position Active |
| Recruitment Request | Draft → Submitted → Manager Approval steps → HR Review → \[Returned / Rejected / HC Exception / Pending CEO\] → Approved for Recruitment → Vacancies Created → Closed |
| Vacancy | Approved → Preparation → Open ↔ On Hold → Partially Filled → Filled → Closed; Cancelled / Frozen |
| Application | New → First Contact → Screening → Shortlisted → Assessment → Interview Process → Ready for Decision → Selected / Reserve / Hold / Rejected / Withdrawn → Offer Process → Pre-Employment → Cleared → Joined |
| Assessment | Proposed → Assessor Confirmed → Candidate Confirmation Pending → Confirmed → Checked-in → Completed → Result Recorded; No-Show / Cancelled / Waived |
| Interview | Proposed → Manager Confirmed → Candidate Confirmation Pending → Confirmed → Checked-in → Started → Completed → Evaluation Submitted |
| Offer | Draft → Authority Check → Pending Approval → Approved → Presented → Reviewing → Accepted / Declined / Expired / Withdrawn; Negotiation → New Version → Reapproval |
| Joining | Accepted → Date Coordination → Date Confirmed → Pre-Employment → Cleared → Expected → Joined / Postponed / Did Not Join |
| Onboarding | Created → Preparation → First Day → Orientations → Week-1 → 30-Day → Completed |
| Social Insurance | Created → Documents Pending → Ready → Submitted → Processing → Registered → Completed / Issue |
| Probation | Active → Checkpoints → Final Review Due → Final Evaluation → Decision / Closed due to exit |
| Medical Insurance | Eligible → Enrollment Pending → Documents → Submitted → Activated → Notified |

| Trigger | Automatic action |
| --- | --- |
| Request approved for recruitment | One vacancy per request line; requester notified |
| Any approval step or HR edit | Requester notified; timeline event |
| Application rejected | "Send rejection message" action in preferred channel |
| Candidate checked in | Interviewer / assessor + recruiter notified; waiting timer starts |
| Evaluation SLA exceeded | Reminder, then escalation per rule |
| Offer near Valid Until | Reminder to owner; Expired on the date |
| Offer accepted | Joining-date coordination action |
| Joining date confirmed | Pre-employment and onboarding preparation tasks |
| Actual joined | Employee profile, onboarding, social insurance and probation cases |
| Probation passed | Medical insurance case |
| Deferred document overdue | HR alert and action item (no wage action); v0.40: the employee reminded before, the HR manager 7 days after |
| All vacancies of a request done | Request Closed (v0.40); reopened when a vacancy reopens |
| Approval step without decision | Reminder day 2, escalation day 3, warning day 4, rejected after 5 working days (v0.40.1, CHG-84 / decision 48); the «waiting since» shown on a step counts the same working days (v0.41) |
| Weekly days off (WEEKEND\_DAYS) | Expiries (approval steps, documents), executing transfers and closing probations still run; reminders, escalations and the digest wait (v0.40, CHG-84) |
| Subscription near expiry | Alert with remaining credits |
| Vacancy ages / required date nears | Priority recalculated |
| Recruiter inactive | Work to Unassigned Queue |
| Document expiry nears | Renewal action |
| Payroll sheet import (later phase) | Occupied HC refreshed; mismatch report to HR |

## 21. Logical data model

About 105 logical tables across all phases; users see screens, never sheets. Phase 1–2 needs roughly 35 of them. Items marked **(v2.1)** are new in this version.

| Domain | Tables |
| --- | --- |
| Access (v2.1) | USERS, USER\_ROLES, LOGIN\_CODES, SESSIONS |
| Org / Jobs | ORG\_UNITS, ORG\_VERSIONS, JOBS, JOB\_VERSIONS, JOB\_DESCRIPTIONS, POSITIONS, POSITION\_HISTORY, POSITION\_CHANGE\_REQUESTS, GRADES, SALARY\_STRUCTURES, COMPETENCIES, COMPETENCY\_LEVELS (v2.1), JOB\_COMPETENCIES, JOB\_SKILLS, LOCATIONS, EMPLOYMENT\_TYPES |
| Payroll link (v2.1, later phase) | PAYROLL\_IMPORT\_LOG, PAYROLL\_POSITION\_MAP |
| Identity / Employment | PERSONS, CANDIDATE\_PROFILES, EMPLOYEE\_PROFILES, EMPLOYMENT\_HISTORY, CONSENT\_RECORDS (v2.1) |
| Requests / Authority | RECRUITMENT\_REQUESTS, REQUEST\_LINES (v2.1), REQUEST\_VERSIONS, REQUEST\_REPLACEMENTS, APPROVAL\_INSTANCES, AUTHORITY\_RULES, OFFER\_AUTHORITY\_MATRIX, DELEGATIONS, SYSTEM\_OVERRIDES |
| Priority / Vacancy | PRIORITY\_RULES, PRIORITY\_HISTORY, VACANCIES, VACANCY\_RECRUITERS |
| Advertising / Sources | AD\_TEMPLATES (v2.1), ADVERTISEMENTS, ADVERTISEMENT\_VERSIONS, RECRUITMENT\_SOURCES, SOURCE\_SUBSCRIPTIONS, SOURCE\_USAGE, APPLICATION\_SOURCE\_HISTORY, AGENCIES / AGENCY\_TERMS |
| Applications / Screening | APPLICATIONS, APPLICATION\_STAGE\_HISTORY, SCREENING\_QUESTIONS, VACANCY\_SCREENING\_QUESTIONS, SCREENING\_RESPONSES, SCREENING\_REVIEWS, IMPORT\_BATCHES |
| Work / Communication | ACTIVITIES, ACTIONS, COMMUNICATION\_TEMPLATES, NOTIFICATION\_RULES, NOTIFICATION\_LOG |
| Assessment (v2.1) | ASSESSMENT\_TEMPLATES, ASSESSMENTS, ASSESSMENT\_RESULTS |
| Interviews | INTERVIEW\_PLANS, INTERVIEW\_QUESTIONS (v2.1), INTERVIEWS, INTERVIEW\_PANEL, INTERVIEW\_EVENTS, EVALUATIONS, EVALUATION\_DETAILS, EVALUATION\_VERSIONS, REFERENCE\_CHECKS |
| Selection / Offer | SELECTION\_DECISIONS, COMPENSATION\_COMPONENTS, INCENTIVE\_SCHEMES, OFFERS (+ Valid Until, 5-figure salary trail), OFFER\_COMPONENTS, OFFER\_EVENTS (v2.1: extensions, presentations) |
| Joining / Documents | JOINING\_HISTORY, DOCUMENT\_TYPES, DOCUMENT\_REQUIREMENTS, PERSON\_DOCUMENTS, DOCUMENT\_RECEIPTS, DOCUMENT\_RECEIPT\_ITEMS |
| Onboarding / Post-join | ONBOARDING\_TEMPLATES, ONBOARDING\_CASES, ONBOARDING\_TASKS, ASSET\_ASSIGNMENTS, SOCIAL\_INSURANCE\_CASES, NEW\_HIRE\_FEEDBACK, NEW\_HIRE\_FEEDBACK\_RESPONSES, FEEDBACK\_THEMES |
| Probation / Benefits | PROBATION\_CASES, PROBATION\_CHECKPOINTS, PROBATION\_EVENTS, PROBATION\_EVALUATIONS, MEDICAL\_INSURANCE\_CASES |
| Control | WORKFLOW\_RULES / STATE\_TRANSITIONS, SLA\_RULES / SLA\_EVENTS, PERMISSION\_RULES / FIELD\_ACCESS\_RULES, REASON\_MASTER, CONFIG, ID\_SEQUENCES, AUDIT\_LOG |

- REASON\_MASTER holds every coded list: rejection, withdrawal, offer decline, did not join, cancellation, deferral, override.
- Derived values (Remaining HC, remaining credits, Available HC) are calculated from transactions, not typed.
- Row numbers are never identities; IDs come from ID\_SEQUENCES under a lock.
- Column-level schema is produced per phase, starting with Phase 1 tables.

## 22. Audit, versioning and evidence

Nothing material is silently overwritten or deleted; business records are voided or versioned with a reason.

- AUDIT\_LOG: timestamp, user, acting-on-behalf-of (candidate / employee where relevant), entity type / ID, action, field or state transition, old / new value, reason, session reference.
- Versioned: organization, JDs, requests, salary structures, incentive schemes, offers, evaluations, ad content, consent notice.
- Approval snapshots preserve exactly what each approver saw.
- Historical actions stay attributed to the person who acted, even after ownership or management changes.
- System timestamps are operational evidence; they never prove intent, negligence or physical presence on their own.
- Only the application writes to AUDIT\_LOG; no user, including the owner, edits it through the UI.
- Incident log (CHG-79, v0.37): the owner, the HR Sector Manager or the data protection officer (DPO\_USER\_ID, someone outside HR) records a personal-data incident (what happened, which data, how many people, when it was found). The HR Sector Manager and the DPO are told at once. The DPO decides whether the regulator must be told (with a reason) and records when it was told; the screen counts down the 72 hours from detection and the daily job reminds the DPO and the owner after 48 hours without a decision. Incidents are never deleted.
- As built v0.36 (CHG-78): every CEO decision records whether it came from the portal or the trusted phone (and which device); every two-person request and decision is audited; a Board decision recorded on the Board's behalf needs a proof file (meeting minutes, written approval, or a WhatsApp screenshot), kept with the decision. On the 1st of each month the CEO gets a report of the month before: decisions taken by delegation, requests where one person approved more than one step, role changes and delegations. When an approval step is skipped because a unit head position is vacant, HR is told which position to fill or delegate.
- Deleting a person's data (request or retention) reaches every copy: personal fields (incl. gender, governorate, education), CV and files, AI readings, photo, written evaluation comments, notifications naming him, and old / new values of his audit rows (replaced by «محذوف»; the event stays). Applications, stages, sources and dates stay as anonymous statistics (v0.34).

## 23. Google Apps Script technical architecture

One web app, layered so that screens never touch sheets and the data store can later move off Sheets without rewriting business logic.

| Layer | Responsibility |
| --- | --- |
| UI | HtmlService pages and components, Arabic/English, mobile-friendly; no trusted authority |
| Router / API | One entry point; validates session token and input; calls services |
| AuthService | Phase 1: email OTP + session tokens. Workspace phase: replaced by Google identity. Only this module changes |
| Business services | Request, Structural Change, Vacancy, Advertising, Candidate, Assessment, Interview, Offer, Joining, Document, Onboarding, Insurance, Probation, Dashboard |
| Shared engines | Workflow, Approval, Authority Resolver, Priority, SLA / Escalation, Notification, Audit / Versioning, Document, Permission, Override |
| Repositories | The only code that reads/writes sheets: batch reads/writes, caching, indexes, locks, stable IDs |
| Integrations | Drive, Gmail, Calendar (optional), payroll-sheet import (read-only, later phase), WhatsApp later |
| Configuration | Statuses, transitions, authority, SLA, templates, reason masters, feature flags (e.g. HC blocking on/off) |

### 23.1 Login (Phase 1)

1. User enters email → server checks USERS (active) → generates a 6-digit code valid \~10 minutes, stored hashed in LOGIN\_CODES → sends it by email.
2. User enters the code → server issues a random session token (stored hashed in SESSIONS, \~14-day expiry) → the browser keeps it and sends it on every call.
3. Failed-attempt limit and lockout per email; logout and HR-side session revoke.
   v0.37 (CHG-82): the authenticator app is required of every user from the first sign-in (TOTP\_REQUIRED\_ROLES = ALL, no free e-mail sign-ins); the CEO is exempt (TOTP\_EXEMPT\_ROLES) because he approves from his trusted device + PIN. A session lasts SESSION\_HOURS (12, one working day); with «remember me» REMEMBER\_DAYS (7). The idle lock is enforced on the server too: a session with no call for IDLE\_MINUTES is ended (the page sends a light «still here» call while the person is active).
   v0.34: the same answer for every address (registered or not) and for every wrong / old code; code requests limited per address (3 per 15 minutes, 10 per day) and for the whole portal (LOGIN\_CODES\_HOURLY\_MAX per hour) so nobody can use up the day's e-mails; authenticator pauses after TOTP\_MAX\_FAILS for TOTP\_LOCK\_MINUTES, recovery codes still accepted.
   Editor-only functions (setup, triggers, cache, owner bootstrap, AI authorisation, emergency reset) refuse calls from a browser; scheduled jobs check that a real project trigger started them.
4. Every server call resolves user, role and scope from the token; nothing from the browser is trusted.

### 23.2 Data store and limits

- Split data across several spreadsheets by domain (e.g. Core & Org, Recruitment, Employee & Post-join, Audit & Logs) to stay well below per-spreadsheet size limits and to keep the audit log from slowing operational reads.
- All spreadsheets owned by the system account and shared with no one.
- Execution-time and quota limits (script runtime, triggers, email) must be checked against Google's current published quotas; long jobs (imports, recalculations) run in batches from time-driven triggers.
- LockService around ID generation, approvals, ownership changes and HC-sensitive actions.
- Backups (CHG-79, v0.37): every week (BACKUP\_WEEKDAY) the daily job copies each spreadsheet into a dated folder under «Kandil Recruitment — Backups», shared with no one; folders older than BACKUP\_KEEP\_WEEKS (8) are moved to the bin. Every 3 months the owner restores a copy as a test and records it (date + note) on the readiness screen; the owner is reminded when the last test is older than 92 days. The Anthropic key's age is kept; the owner is reminded to rotate it after 180 days.
- Migration trigger to a database: when response times or sheet sizes pass thresholds set in Phase 1 testing, the repositories move; services and UI stay.
- As built v0.35: a write under the lock reuses a cached table copy when its generation is still current (generations are set before a sheet read and retired after each flushed write); an error under the lock drops the held-back writes; equality look-ups use per-column indexes; the daily job runs in recorded steps and continues in the background near the time limit; expired rows are deleted in blocks (never a table rewrite); empty sheet columns removed; audit and timeline rows older than LOG\_ARCHIVE\_MONTHS move to an archive spreadsheet monthly; the readiness screen shows spreadsheet and Drive fill; cells over 50,000 characters are refused; the English dictionary loads only when needed.
- E-mail priority (CHG-79): login codes keep MAIL\_LOGIN\_RESERVE of Google's quota; candidate mails may use the whole EMAIL\_DAILY\_BUDGET; approval and internal mails leave MAIL\_CANDIDATE\_RESERVE; the daily summary and monthly KPI mails use at most half; the owner is told at 80 %.

### 23.3 Other rules

- Drive folders named by stable IDs, never by person names alone.
- Scheduled triggers: priority recalculation, SLA / escalation, reminders, offer expiry, subscription expiry, document renewal, daily digest (payroll import when built). No per-row triggers.
- Deployment: every release is a new versioned deployment of the web app; changes to code alone do not reach the published URL.
- As built v0.44.4 (CHG-95): a failed upgrade is never silent — the system owner (OWNER_EMAIL) is e-mailed once per version with the error reference and the first line of the error (≤ 300 characters, no personal data); every request until it is fixed shows users a clear message with that reference; the next deploy that upgrades cleanly ends it.
- As fixed v0.44.3 (CHG-94): the upgrade that runs in the first request after a deploy reads a sheet whose columns it just changed from the sheet, never from the shared cache taken before the upgrade; a migration may then write the new columns in the same upgrade.
- Editor-only functions (setupSystem, clearPortalCache and the like) check that the signed-in user is the account the script runs as; this needs the userinfo.email permission in the manifest (v0.41). After a release that adds a permission the owner opens the Apps Script editor, runs any function once and allows it; until then the portal may ask for authorisation. Upgrades themselves run by themselves on the first portal call after a deploy.

## 24. Screen map

Screens are action-first, responsive for mobile use, with status chips, drill-down and global search by person, candidate, application, vacancy, request or employee ID.

| Area | Core screens |
| --- | --- |
| Login | Email → code → session |
| Home | My actions today, alerts, interviews and assessments today, joining soon, overdue |
| Requests | Create / view, my requests + timeline, approvals, returns, changes, priority |
| Structure | New position / structural change requests, endorsements, CEO approval |
| Vacancies | Board / list, funnel, team, ads, sources, age / priority |
| Candidates | Search, Candidate 360, applications, activity, documents |
| Screening | Workspace, bulk import, talent pool |
| Assessments | Schedule, confirmations, check-in, result entry |
| Interviews | Calendar / list with location, confirmations, check-in, interviewer workspace (JD + questions), evaluation, comparison |
| Offers | Compensation proposal, approvals, versions, validity, negotiation |
| Joining | Date coordination, pre-employment, clearance, did-not-join |
| New hires | Electronic file, onboarding, documents and receipts, social insurance, New Hire Voice |
| Probation | Cases, checkpoints, performance log, final review |
| Medical insurance | Eligibility and enrollment queue |
| Sources | Source master, subscriptions, usage, ROI |
| Management | Funnel, SLA, bottlenecks, workload, quality of hire |
| Admin | Users and roles, org / jobs / positions, JD and ad templates, question bank, rules, reasons, HC maintenance (payroll import later), audit explorer |
| Public | Application form (per ad link), candidate secure link, employee My Documents |

### 24.1 As built in v0.42 (CHG-87)

- **Section colours.** One colour per main section of the menu: home Kandil red #9E1B22, recruitment (requests, approvals, vacancies) blue #1F4F8F, candidates and interviews plum #6E2A6B, structure and employees teal #0F5F63, reports and KPIs amber #8A5A12, administration and settings warm grey #4A4540. The open screen's section colours the menu mark, the screen title bar, the card titles and the sub-tabs (in lighter shades of it). Primary buttons and the logo stay Kandil red; the status chips keep their fixed colours (late / rejected red, needs attention orange, done green, waiting grey). Font: IBM Plex Sans Arabic.
- **Top bar.** White, with the logo, one **search box** (Ctrl K), a **«+ جديد»** menu that lists only what the user may start (recruitment request, new candidate, new position), the notifications bell and the user.
- **Global search.** One box for candidates, requests, vacancies and employees, 3 letters at least (or 4+ digits of a mobile / ID), 5 results per kind. The server runs each kind through the same check as its own screen — candidates only for the recruitment roles and only where the user may open the application; requests from the user's boxes (all requests for the recruitment roles, else his own and his managed scope); vacancies the user may see; employees for the HR roles. Results carry a name, job and status only — never a mobile, e-mail or salary. A consultant after go-live gets no candidates or employees (CHG-82). Nothing is cached or logged beyond the normal call.
- **Inbox home.** The greeting and progress message, how many items wait and how many are urgent with a bar of the share still on time, then «المطلوب منك» with filter chips (all / approvals / contact / documents / follow-up): each item shows its count, what to do, an urgency chip and one «افتح» button. On the side: today's interviews, the user's vacancies with their filled share, his requests, his data, and (HR admin) the structure health.
- **Stage board.** The vacancy's candidates in a column per stage (new → accepted; the «all» filter adds on hold and closed), each card with the photo or initial, source, days in the current stage (orange after 3 days), the AI match of the current CV when one was read (full access only — a suggestion, never a ranking), overdue follow-up and the usual flags. Dragging a card to another column opens the same move dialog as the candidate page (reason where needed) and the server applies the same checks; offer, acceptance and joining are not drop targets (they go through the offer and joining cards), interviews only when the candidate has one. The cards view stays one click away. The vacancy's apply link, screening questions, interview plan and ads move under «إعدادات الشاغر» below the board.
- **Candidate file.** The stage steps bar and the actions on top, then tabs — all (first), data, files (CV and its AI reading), interviews, offer and joining, log — with the next step always on the side.
- **Guided steps.** The offer form runs in four steps — salary, benefits, review (dates, terms, justification), send — with the live calculation in sight on every step and a summary (basic, allowances, gross, estimated net, approver, dates) before sending; a draft can be saved at any step. The other long forms (recruitment request, transfer) keep one page with their progress meter.
- **Phone.** The search folds into an icon and opens over the top bar; the board scrolls sideways.

### 24.2 Back — as built in v0.45.1 (CHG-97)

- A **«رجوع»** button in the top bar (shown once the user has moved from the first screen) returns to the previous screen with the same argument (filter, tab, record); pressed again it goes on back, up to the last 40 screens; with nothing left it opens the home screen.
- The browser's Back button, Alt + ← and the phone's back button do the same inside the portal (Apps Script `google.script.history`): each screen change adds a browser history entry.
- Only the screen names and their arguments of the current session are kept, in the page; nothing is saved. Every screen reached by going back loads through the server with the usual permission checks.

### 24.3 Who is online — as built in v0.45.1 (CHG-98)

- **Screen:** «مين أونلاين» under administration — name, job, the screen each person is on and when he last did something; refreshed every minute.
- **Who sees it:** the system owner and the HR Sector Manager (the read-only consultant too); checked on the server.
- **Online:** any portal action in the last 6 minutes (an active page sends a «still here» every 5 minutes). The page sends the screen's name only when it changes, at most once a minute otherwise, and with the «still here», so ordinary requests cost nothing extra.
- **What is kept:** for each user, the name of the screen (e.g. «interview», never which candidate or request) and the time, in the script cache only, gone after 10 minutes; nothing is written to a sheet, the audit log or anywhere else, so there is no history.
- **Transparency:** the usage policy states that the system administrator can see who is online and on which screen; the default policy text is updated and its version raised, so every user accepts it again (a policy text the owner changed by hand is left as it is).

### 24.4 Side menu — as built in v0.46.0 (CHG-99)

- **Sections:** home; recruitment (request, requests, approvals, CEO approvals, vacancies, new position); candidates and interviews; structure and employees; reports and KPIs; then the process map and the guide. Each section opens with one click; opening one closes the one that was open, and moving to a screen opens its section.
- **You are here:** the open screen's menu item takes its section's colour as a solid background with white text; above every screen title a path «section › screen» (a sub-page shows its parent screen as a link back).
- **Administration behind a gear:** users, CEO approvals and access, two-person approvals, approvals and delegation, «who is online», pay and offers, lists and reasons, privacy and data, data incidents, audit log, settings, structure import, demo data, go-live readiness and feedback leave the menu. A gear button at the foot of the menu («الإدارة والإعدادات», shown only to someone who may open at least one of them, with the sum of their waiting items) opens one page in four groups — people and access; pay and lists; data and privacy; system — listing only what the user may open. On a phone the gear is one item of the bottom bar.
- **Who sees each screen:** the coloured dots leave the menu; the HR Sector Manager and the system owner find them on the settings page, as a list of every screen with its audience.
- **No permission change:** each screen keeps its own server check; the menu and the settings page only list what the user may open.
- **One line per item (v0.46.1):** the menu is a little wider (276 px) so every label fits on one line; a label that still does not fit (a narrow window or a large browser zoom) ends with «…» and shows whole on hover.

## 25. Exception catalogue

Each case below must be handled by a defined rule and tested before its phase goes live.

- Request: material change after approval; HC raised or cut with live candidates and offers; vacancy cancellation; request covering several locations where one location fills first.
- Approval: missing section or department level; vacant Sector Manager; HR Manager requesting a Sector Manager; requester equals calculated approver; CEO rule in force.
- Candidates: several active applications; transfer between vacancies; withdrawal and return; rejection and reconsideration; former employee / rehire; hiring restriction.
- Recruiters: several on one vacancy; duplicate contact; recruiter absent or leaving; bulk reassignment.
- Sources: referral attribution dispute; agency ownership expiry; subscription expiring with unused credits.
- Assessment / interview: ad-hoc or waived round; assessor or manager no-show; candidate waiting; late or revised evaluation; strong disagreement; interviewer changed; failed assessment.
- Offer: renegotiation after acceptance; offer expiry and extension; over-hiring risk; accepted but did not join.
- Joining: joining date changed several times; joining a different approved position; early exit after joining.
- Documents: wrong, suspect or expired documents; replacement versions; deferred originals overdue (HR alert only).
- Post-join: probation manager change; overdue final review; exit during probation; confidential New Hire Voice answers.
- Platform: login email not received; session expired mid-form; payroll row that matches no position; two users acting on the same record at once; email quota reached (fallback to in-app only).

## 26. Confirmed decisions and configurable items

Confirmed decisions are fixed requirements; configurable items are set in the Admin screens and never invented in code.

### 26.1 Confirmed decisions

- Only existing positions within the requester's scope can be requested; new positions go through structural change with CEO final approval.
- Current and available HC are guidance; any number may be requested; HC exceptions (HC above the structure) go to a separate approval by the HR Sector Manager only (CHG-40/2).
- Only the HR Sector Manager (Mohamed Omara) changes grade, salary, benefits or working conditions.
- Approval chain: Section Head → Department Manager → Sector Manager → HR Manager; CEO by HR routing or dated CEO rules.
- Return for revision with exact timestamps and versions.
- HR Manager alone sets Normal / Important / Critical; dynamic priority may reorder work.
- One vacancy per location; several recruiters per vacancy; one owner per application; missing team roles are skipped.
- Source is mandatory per application; subscriptions are managed.
- Hybrid candidate journey; salaries optional at application and only with a separate sensitive-data consent (v0.14.1 personal-data rules), no "prefers not to say" states; National ID optional at application; bulk import of 50–100 rows; hybrid talent pool.
- Practical / technical assessment stage exists.
- Continuous pipeline: candidates move independently; live comparison; reserve candidates.
- Offer authority by salary band: recruiter \~min, supervisor to mid, recruitment manager to max, HR Manager above max. Variable pay held in system, not in the offer.
- Joining date agreed after acceptance; filled HC counts actual joiners.
- Deferred documents → HR alerts only; no wage link.
- Social insurance within the first month; medical insurance after successful probation.
- Welcome gift on day one; 30-day New Hire Voice.
- Phase 1: personal Gmail with OTP login; \~45 users; actual HC as temporary structural HC; payroll sheet read for occupied HC.
- Probation: one period only, at most 90 days, no extension; reviews on day 30 and 60, final evaluation on day 75, PIP must start by day 60, decision by day 80; ending employment = HR Sector Manager only.
- Stay interview near day 60 by HR only (not the manager); manager satisfaction survey after confirmation.
- Medical insurance case opened on confirmation.
- Recruitment KPIs: process KPIs (speed, quality, efficiency & cost, candidate experience, compliance); scorecards per recruiter, recruitment lead and HR site specialist (weights sum to 100, score 1–5); managers' and approvers' service KPIs for information only; monthly e-mail.
- KPI targets, days-to-fill per job class, job class per grade and weights are edited on screen by the system owner, HR Sector Manager or HR Manager, with a reason and audit.
- Every user sees his own evaluation (My evaluation); the probation employee sees the day-30 / day-60 follow-ups once saved and the final evaluation only after the HR decision.
- Every form is printable from inside the program.

### 26.2 Configurable items

- CEO approval rules by scope and dates; delegation fallbacks.
- Offer authority thresholds by grade / range.
- Priority weights and aging bands.
- SLA targets and escalation ladders.
- Interview and assessment rounds per job / job family; question bank; assessment templates and pass criteria.
- Document requirements by job / employment type / location / category; deferral ladder.
- Probation: PROBATION\_ENABLED, PROBATION\_DAYS (max 90), PROB\_CHECKPOINTS (30, 60, 75), PROB\_DECISION\_DAY (80), PROB\_REMIND\_DAYS (30, 15, 7), PROB\_ESCALATE\_DAYS (3, 7), PROB\_WEIGHTS (final evaluation items, sum 100), PROB\_PASS\_AVG (3), PROB\_VALUE\_MIN (2).
- Notification channels, digest time, email budget.
- Field visibility by role.
- HC enforcement switch (warn / block).
- Legal deadlines, after validation against current Egyptian requirements.
- Medical insurance: MEDICAL\_ADD\_DAYS (14), MEDICAL\_PROVIDERS (insurer list).
- Recruitment KPIs (edited on the KPI screen): KPI\_TARGETS, KPI\_TTF\_TARGETS (days to fill per job class: 21 / 30 / 45 / 60), KPI\_JOB\_CLASS (job class per grade), KPI\_WEIGHTS\_RECRUITER, KPI\_WEIGHTS\_LEAD, KPI\_WEIGHTS\_SITE (each sums to 100), KPI\_MIN\_CASES (3), KPI\_MONTHLY\_EMAIL.
- Insights: INSIGHT\_STEP\_DAYS (target days per step: REQ\_APPROVAL 3, ASSIGN 2, FIRST\_CONTACT 3, stages NEW 3 / CONTACTED 5 / SCREENING 5 / SHORTLISTED 7 / INTERVIEW 10, IV\_CONFIRM 2, EVAL 1, OFFER\_APPROVAL 2, OFFER\_RESPONSE 5, JOINING 21), INSIGHT\_REFERRAL\_BONUS (referral bonus estimate per referral hire; default 0).
- GOLIVE\_CHECKS — the manual go-live items ticked on the readiness screen (date, who, note); kept by the screen.

## 27. Implementation sequence

Build starts with Phases 1–2, which replace the current online requisition form (HR-REC-F02) with a controlled request-to-vacancy flow; each phase uses the shared engines from day one.

| Phase | Deliverable | Gate to next phase | Status |
| --- | --- | --- | --- |
| 1 Foundation | OTP login, users / roles, org structure load, jobs, positions, baseline HC (1 per position), audit, configuration, IDs | Real structure loaded (test structure used during build); login and approval chain tested with 3–4 test users | Delivered — v0.1 to v0.2.2 (real structure and coding v0.2.2); authenticator sign-in added in v0.15.0 |
| 2 Request → Vacancy | Request with lines, approval engine, HC exception, HR edit + notifications, timeline, CEO rules, structural change, priority, vacancy per location, recruiter assignment, record a vacancy filled by internal transfer (interim) | Parallel run with the current form for one month | Delivered — v0.2.0 to v0.2.3 (structure editing v0.2.1, board approval v0.2.3); reminders, escalation and HC-exception step v0.8.1. REQ-011 and VAC-005 completed v0.28.0 |
| 3 Candidate pipeline | Person / candidate / application, application form + consent, sources / subscriptions / ads, screening, activity / actions, bulk import, talent pool, rejection messages, internal candidates | — | Delivered — 3A v0.3.0, 3B-1 v0.8.0, 3B-2 v0.9.0, 3B-3 v0.10.0. CAN-005 settled v0.28.0 (salary optional, unlabelled, never zero) |
| 4 Assessment & interviews | Assessment stage, interview scheduling / confirmation, check-in / evidence, question bank, evaluations, comparison | Question bank loaded for priority jobs | Delivered — 4A v0.11.0 (review fixes v0.11.1), 4B v0.12.0. Question bank content pending from HR |
| 5 Offer → Joining | Selection, compensation authority, offer versions / validity, joining, pre-employment documents and receipts | Salary structures loaded by HR Sector Manager | Delivered — 5A v0.13.0 to v0.13.2, 5B v0.14.0; personal-data protection v0.14.1 |
| 5+ Recruitment policy | Full recruitment policy with forms (printable versions of the portal forms + forms for manual cases), written on the built request-to-joining cycle (owner decision 2026-10-05) | Right after 5B | Not part of the portal (separate policy document) |
| 6 New hire | Employee file, onboarding, welcome gift, social insurance, New Hire Voice, internal transfer process | — | Delivered — 6A v0.17.0, 6B v0.18.0, 6C v0.19.0 (internal transfer) |
| 6+ Manager guide | Manager guide: requesting, approving, confirming interviews, evaluating, selecting, onboarding and first-day role — simple, with screenshots (owner decision 2026-10-05) | Right after Phase 6 | Delivered (as a separate guide page) |
| 7 Probation & benefits | Probation, medical insurance, early retention | — | Delivered — v0.25.0 (probation, medical insurance), v0.26.0 (stay interview, manager survey, KPIs), v0.27.0 (employee view of his evaluation) |
| 8 Intelligence | Advanced dashboards, source ROI, bottlenecks, quality of hire, calibration | Enough data (e.g. 6 months) | Started — KPI screen v0.26.0–v0.27.0; source return (cost per hire), bottlenecks and interviewer calibration v0.29.0; hiring forecast v0.30.0 (confidence grows with data); v0.31.0 — AI CV reading (suggestions only, monthly cost cap) |

Status at portal v0.31.0 (7 Oct 2026). The two phases added by CHG-39 are delivered too: Operational reports (v0.22.0) and the Interactive process map (v0.23.0; probation and medical steps live from v0.25.0).

The current form's data (requests, jobs tab) is migrated into Phase 2 tables, not discarded.

Phase 1 tables, columns and the structure import template: Phase 1 Schema

### Go-live readiness (v0.30.0)

A readiness screen for the owner and the HR Sector Manager (the HR manager reads) shows what is still missing before go-live. Automatic checks cover the daily job, e-mail, demo data, key roles, the authenticator, unit heads and their accounts, HR site specialists, structure, employees, approved JDs, salary structures per grade, offer authority, competencies and question bank, documents, sources, onboarding templates, medical insurance providers and legal entities, each linked to the screen that fixes it. Manual items are ticked with a date and a note and audited: lawyer review, the old passwords sheet, role-based user testing, training, moving the current form's open requests, and the one-month parallel run.

As built v0.37 (CHG-82, CHG-73, CHG-79): manual items also cover the AI transfer licence and naming the DPO, and automatic checks cover backups, the restore test, the key age and active consultant accounts. The «Go live» button (owner only, typed phrase, no demo data left) records GOLIVE\_AT once and for good: demo data and the data wipe are locked, the two-person wipe request is refused, and consultant accounts lose the personal-data screens (CVs, candidate and employee files, photos, offer letters, interview files, documents, privacy search). The go-live confirmation shows the transfer-licence reminder while AI reading is on. The daily summary e-mail goes only to unit heads (people whose position heads a unit, or who act for one) and the CEO; everyone else sees the same list on the home page.

## 28. Acceptance criteria

A phase is accepted only when every criterion below holds for the features it delivers.

- Every material event has an owner, a state and an audit record.
- No approved record is silently overwritten.
- No workflow depends on a named role always being filled.
- Candidate identity survives applications, employment, exit and rehire.
- Every application has a traceable source.
- Users see their next actions without searching.
- HC, offers and joining cannot produce inconsistent vacancy counts.
- Sensitive fields are protected on the server; no user can open the spreadsheets directly.
- Legitimate exceptions go through controlled authority, not workarounds outside the system.
- Every management KPI drills down to its records.
- The system never performs any wage or payroll action.
- A requirement counts as delivered only when its rule, data, permission, workflow transition, screen and audit behavior all exist.

## 29. Requirements traceability matrix

98 requirements, each with a stable ID, its source and the section that specifies it; the Status column moves Specified → Built → Tested as delivery proceeds. Status at portal v0.31.0 (7 Oct 2026): 94 Built, 3 Partial (works, but part is missing or built differently), 1 Later (deferred by the owner), 0 Not built — per the portal's requirements-status file, checked against the code and tests.

Source codes: **OB** = owner's first brief · **OD** = owner decision in the design conversation · **OD-30S** = owner decision, 30 Sep 2026 · **CF** = current form HR-REC-F02 · **DC** = design element agreed in the conversation.

| ID | Requirement | Source | Section | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| ACC-001 | OTP login for personal Gmail users; spreadsheets owner-only | OD-30S | 2, 23.1 | 1 | Built |
| ACC-002 | AuthService swappable for Workspace identity | OD-30S | 23 | 1 | Built |
| ACC-003 | Role and scope resolved on the server only | DC | 19 | 1 | Built |
| ACC-004 | One login shared with the Performance Appraisal portal (unified sign-in for both systems) | OD | 23 | later | Later |
| UX-001 | Same design system, tone and spirit as the Performance Appraisal portal: greeting and progress message, action-first «المطلوب منك», idle auto-lock with warning, 7-day remember-me, friendly in-portal guide | OD | 24 | 1–2 | Built |
| ORG-001 | Job, Position, Employee, Vacancy as separate entities | DC | 3.1 | 1 | Built |
| ORG-002 | Versioned organization; closed positions kept | OD | 3.2 | 1 | Partial |
| ORG-003 | Structured, versioned JD with view / print / PDF / email | OD | 3.3 | 1 | Built |
| ORG-004 | Only HR Sector Manager changes grade, salary, benefits, working conditions | OD | 3.5 | 1 | Built |
| ORG-005 | Delegation / acting authority with dates and history | OD | 6.3 | 1 | Built |
| ORG-006 | Structural change: chain endorsement, HR review, CEO final approval, Position ID on approval | OD | 3.4 | 2 | Built |
| ORG-007 | Structure maintained from the portal without files: add / rename / move / close a unit, set or change its head (reporting lines follow), add / move a position; reason required, unit and position history, blocked while open vacancies or requests exist; editing by System Owner and HR Sector Manager | OD | 3 | 2 | Built |
| ORG-008 | Coding: units = sector code + department no. + section no. (FAD-04-02); jobs = job family + number (ACC-007), one code per title company-wide; old form codes kept as reference; new codes generated automatically | OD | 3 | 2 | Built |
| ORG-009 | Multi-company: Kandil Egypt's 4 legal entities (employer of record, social insurance) and the sister companies Enarat and Le Chateau (same owners, managed separately, shared HR) as separate companies; CEO-level approval resolves to each company's own top position | OD | 3, 6 | later | Partial |
| HC-001 | Structural HC = 1 per position until a manpower plan; HC Basis flag | OD-30S | 5 | 1 | Built |
| HC-002 | Occupied HC entered by HR; payroll-sheet import (non-salary columns only) in a later phase | OD-30S | 2 | 1 / later | Partial |
| HC-003 | Current / available HC shown as guidance; any number requestable | OD | 5 | 2 | Built |
| HC-004 | HC exception approved by the HR Sector Manager only (CHG-40/2) | OD | 5 | 2 | Built |
| HC-005 | Available = Structural − Occupied − Open; no double counting | DC | 5 | 2 | Built v0.40 |
| HC-006 | HC checks warn-only until switched to block | OD-30S | 5 | 2 | Built |
| HC-007 | Filled HC counts actual joiners only | DC | 5 | 5 | Built |
| REQ-001 | Manager requests only positions in his scope, validated server-side | OD | 4 | 2 | Built |
| REQ-002 | Current form fields kept: education, experience context, skills + proficiency + Essential / Additional, work model, proposed hire date, replacements | CF | 4.1 | 2 | Built |
| REQ-003 | One request, several locations via request lines | CF, OD-30S | 4.1 | 2 | Built |
| REQ-004 | Chain from structure; missing level skipped; vacant Sector Manager fallback; self-approval blocked | OD | 6.1 | 2 | Built |
| REQ-005 | CEO by HR routing, dated CEO rules, Sector Manager requests → CEO | OD | 6.2 | 2 | Built |
| REQ-006 | HR Manager: approve / reject / return / edit defined fields / send to CEO | OD | 4.2 | 2 | Built |
| REQ-007 | Requester notified of every approval step, rejection and HR edit | OB | 4.3 | 2 | Built |
| REQ-008 | Return for revision with exact timestamps and versions | OD | 4.4 | 2 | Built |
| REQ-009 | Approval snapshot of what each approver saw | DC | 6.4 | 2 | Built |
| REQ-010 | Request timeline and My Requests screen | DC | 4.3 | 2 | Built |
| REQ-011 | Change request and reapproval for material post-approval changes | DC | 4.4 | 2 | Built |
| PRI-001 | Requested priority / HR classification by HR Manager only / dynamic score / temporary override | OD | 6.5 | 2 | Built |
| VAC-001 | One vacancy per location line | OD-30S | 7.1 | 2 | Built |
| VAC-002 | Partial fill; request closes fully or partially by number | OB | 7.1 | 2 | Built v0.40 |
| VAC-003 | Several recruiters per vacancy; lead; one owner per application | OD | 7.2 | 2 | Built |
| VAC-004 | Missing recruitment roles skipped with record | OD | 7.2 | 2 | Built |
| VAC-005 | Unassigned work queue and bulk reassignment | DC | 7.2 | 2 | Built |
| VAC-006 | Recruitment screen listing all approved requests / vacancies | OB | 7, 24 | 2 | Built |
| ADV-001 | Ads per platform generated from JD templates, copyable | OB | 7.3 | 3 | Built |
| ADV-002 | Apply link per ad with automatic source attribution | DC | 7.3 | 3 | Built |
| SRC-001 | Source mandatory per application, with sub-source | OD | 8 | 3 | Built |
| SRC-002 | Subscriptions: credits, usage, expiry and unused-credit alerts | OD | 8 | 3 | Built |
| SRC-003 | Referral attribution lock; agency terms | DC | 8 | 3 | Built |
| CAN-001 | Person master; candidate ≠ application; duplicate warning, no auto-merge | DC | 9.1 | 3 | Built |
| CAN-002 | Hybrid journey; recruiter acts on behalf with audit | OD | 9.2 | 3 | Partial (v0.33 review) |
| CAN-003 | Online application intake | OB | 9.3 | 3 | Built |
| CAN-004 | Privacy notice acceptance stored with version | DC | 9.3 | 3 | Built |
| CAN-005 | Salaries required with disclosure states; never zero | OD | 9.3 | 3 | Built |
| CAN-006 | National ID optional at application | OD | 9.3 | 3 | Built |
| CAN-007 | Bulk import of 50–100 rows with duplicate review and batch ID | OD | 9.5 | 3 | Built |
| CAN-008 | Hybrid talent pool | OD | 9.5 | 3 | Built |
| CAN-009 | Former employee detection and hiring restriction | DC | 9.1 | 3 | Built |
| SCR-001 | Knockout flags for human review; AI evidence-only | DC | 10.1 | 3 | Built · 0.10 · 0.31 — Knockout flags reviewed by a person (phase9). AI CV reading (0.31) gives suggestions only: fields the recruiter picks, a summary and a 1–5 job-related match; it never moves or rejects a candidate (phase31, ui35). |
| SCR-002 | Coded rejection reasons; internal reason separate from message | DC | 10.1 | 3 | Built |
| ACT-001 | Recruiter activity log: calls and manager discussions summarized, multi-reference, no silent edits | OD | 10.2 | 3 | Built |
| ACT-002 | Action queue with next action per application | DC | 10.3 | 3 | Built |
| COM-001 | Message templates; copy-paste for WhatsApp | OB | 10.4 | 3 | Built |
| COM-002 | Rejection message by WhatsApp or email as an explicit step | OB | 10.4 | 3 | Partial (v0.33 review) |
| ASM-001 | Practical / technical assessment stage | OD-30S | 12 | 4 | Built |
| INT-001 | Candidate invite blocked until manager confirms | OD | 11.1 | 4 | Built |
| INT-002 | Manager screen of interview dates and locations | OB | 11.1 | 4 | Built |
| INT-003 | Reminders and optional reconfirmation | DC | 11.1 | 4 | Partial (v0.33 review) |
| INT-004 | Check-in, waiting timer, evidence trail of interviewer activity | OD | 11.2 | 4 | Built |
| INT-005 | Interview plan, panel roles, waiver with reason | DC | 11.3 | 4 | Built |
| INT-006 | Interviewer workspace shows the JD | OB | 11.4 | 4 | Built |
| INT-007 | Question bank; HR standard questions shown in HR interview | OB | 11.5 | 4 | Built |
| INT-008 | Evaluation entry for HR, direct and higher manager; structured, independent | OB | 11.6 | 4 | Built |
| INT-009 | Live comparison page; continuous pipeline; decision readiness | OD | 11.7 | 4 | Built |
| INT-010 | SLA on confirmation and evaluation with escalation | DC | 18 | 4 | Built |
| OFF-001 | Offer sent by email from the system or printed | OB | 13.5 | 5 | Built |
| OFF-002 | Offer authority by salary band; HR Manager above max | OD | 13.3 | 5 | Built |
| OFF-003 | Basic + allowances; incentives / commissions in system, not in offer | OD | 13.2 | 5 | Built |
| OFF-004 | Offer versions and negotiation with reapproval | DC | 13.5 | 5 | Built |
| OFF-005 | Offer Valid Until and audited extension | DC | 13.5 | 5 | Built |
| OFF-006 | Five-figure salary trail | DC | 13.4 | 5 | Built |
| OFF-007 | Decline reasons, over-hiring warning, reserve candidates | DC | 13 | 5 | Built |
| JOI-001 | Joining date agreed after acceptance, with history | OD | 14.1 | 5 | Built |
| JOI-002 | Did-not-join tracked with reasons | DC | 14.1 | 5 | Built |
| DOC-001 | Upload by employee or HR, HR review, physical receipt | OD | 14.2–14.3 | 5 | Built |
| DOC-002 | Deferred documents with approver and due date; HR alerts only | OD-30S | 14.4 | 5 | Built v0.40 |
| FIL-001 | Electronic employee file with document versions and expiry | OD | 15 | 6 | Built v0.40 |
| ONB-001 | Orientation with separate manager and HR screens | OB | 16 | 6 | Built v0.41 |
| ONB-002 | First-day welcome gift | OD | 16 | 6 | Built |
| ONB-003 | 30-day New Hire Voice with confidentiality | OD | 16 | 6 | Built |
| INS-001 | Social insurance case within the first month | OD | 17.1 | 6 | Built |
| PRB-001 | Probation checkpoints, log (incl. Behavior / Safety), final evaluation, reminders | OB | 17.2 | 7 | Built |
| INS-002 | Medical insurance after successful probation | OD | 17.3 | 7 | Built |
| RPT-001 | Status report per request; log of calls, appointments, no-shows | OB | 18 | 2–8 | Built |
| RPT-002 | Role dashboards; drill-down KPIs | DC | 18 | 8 | Built |
| AUD-001 | Audit: who, what, when, before, after | DC | 22 | 1 | Built |
| AUD-002 | Controlled overrides instead of admin bypass | DC | 1 | 1 | Built |
| WAG-001 | No wage or payroll action anywhere in the system | OD-30S | 1, 14.4 | All | Built |
| MOV-001 | Vacancy fill method recorded (External Hire / Internal Transfer); an internal fill counts in Joined HC with employee, source position and effective date | OD | 7.4 | 2 | Built |
| MOV-002 | Internal candidates in the pipeline (source Internal), current manager notified before the first interview | OD | 7.4 | 3 | Built |
| MOV-003 | Transfer process: raised by any manager or HR, other manager's opinion (no veto), HR Manager final decision, HR Sector Manager when terms change; HC check on the target position | OD | 7.4 | 6 | Built v0.41 |
| MOV-004 | On the effective date: position and Occupied HC move on both sides, linked vacancy updated, history written, replacement request offered to the releasing manager | OD | 7.4 | 6 | Built v0.41 |
| BRD-001 | Board approval (Chairman or Vice Chairman — either one) after the CEO for: positions reporting directly to the CEO, every new structural position, jobs/units under a temporary board rule, and any request the HR Sector Manager sends to the board; HR Sector Manager may record the board's decision on its behalf with the external method and a note | OD | 6 | 2 | Built |

## 30. Open items and change control

Phase 1 build can start now with a test structure and 3–4 test users; the rest are needed before the phase listed.

| # | Open item | Needed from | Needed before |
| --- | --- | --- | --- |
| 1 | Org structure file to the last level (every position defaults to HC = 1) | HR | Phase 1 go-live |
| 2 | Payroll sheet column headers (no salary values) — only when the payroll link is built | HR | Later phase |
| 3 | 3–4 test users now (owner, one manager, one HR); full list (\~40 managers + 5 HR) added later from the Users screen | HR | Phase 1 |
| 4 | Do Recruitment Supervisor / Recruitment Manager roles exist today, or skip to HR Manager? | HR Sector Manager | Phase 2 |
| 5 | CEO standing rules currently in force (jobs / departments / dates) | HR Manager | Phase 2 |
| 6 | Priority weights and aging bands; SLA targets | HR Manager | Phase 2 |
| 7 | Assessment data: which jobs have practical tests, assessors, pass criteria (system built and configurable in v0.12.0 — criteria taken from JDs meanwhile; data entry deferred by owner until the whole program is finished) | HR + production managers | After all phases are built |
| 8 | Question bank for priority jobs; competency levels | HR | Phase 4 |
| 9 | Salary structures per grade and offer authority thresholds | HR Sector Manager | Phase 5 |
| 10 | Document requirement matrix by job category | HR | Phase 5 |
| 11 | Probation checkpoint days (rules settled 2026-10-05: max 3 months, once per employer — the 4 entities are one employer, stated in the contract) | HR | Phase 7 |
| 12 | Legal validation: privacy-notice wording and data retention under Egyptian personal-data law (draft in progress); keeping original documents; payroll stop notice for missing documents; social insurance start later than day one (owner rule CHG-52). Probation rules settled by owner. | Legal | Phases 3, 6, 7 |
| 13 | Google quotas (email, triggers, runtime) confirmed for the account used | Build team | Phase 1 |
| 14 | Closed 2026-10-05: STEPS not approved — employee file, insurance, probation and medical insurance stay in this portal; a full HR system will be built with Claude in a separate later phase | HR Sector Manager | Phase 6 |
| 15 | Deferred by the owner 2026-10-10: a short company link (e.g. jobs.kandilegypt.com) with a public page carrying the portal's name and Kandil logo for the WhatsApp / social link preview, which forwards to the portal. Needs the company's IT for the sub-domain, the logo file and the chosen address; the portal's own sign-in is unchanged. | HR Sector Manager + IT | When the owner reopens it |
| 16 | Deferred by the owner 2026-10-10: the manager review round of the draft JDs (CHG-96) opens only after the job-analysis interviews come back. | HR Sector Manager | After the interviews |

Change control:

1. Every new or changed requirement gets a REQ ID, source, date, owner and blueprint section in section 29 before any code.
2. Chat discussions alone never change the build; the blueprint changes first, then the code.
3. Each release lists the REQ IDs it delivers and moves their status to Built, then Tested.
