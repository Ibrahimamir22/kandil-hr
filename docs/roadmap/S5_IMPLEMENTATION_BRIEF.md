# S5 — candidate identity, applications and sourcing

The [candidate follow-up queue checkpoint](S5_FOLLOWUP_QUEUE_CHECKPOINT.md) connects overdue, today, upcoming and new-without-follow-up work in Arabic/English. Counts and pages use current candidate permissions; each row opens the existing candidate actions. **11 new native checks, 19 affected native checks and 21 queue browser checks passed.** Review at **http://kandil-review.localhost:8112/hr-portal** → **Candidate follow-ups / متابعة المرشحين**. Full S5, HR acceptance and security/capacity/release gates remain open.

The [persistent review checkpoint](S5_PERSISTENT_REVIEW_CHECKPOINT.md) enables candidate review at **http://kandil-review.localhost:8112/hr-portal** with stable synthetic examples, a dedicated database/Redis and the existing personal login. **22 review checks and 63 independent candidate regression checks passed**; test cleanup preserved the review records, settings and session. Background workers/scheduler remain stopped here. Full S5 and release gates remain open.

Earlier checkpoints below retain their original scope and outstanding work at the time; the current status above supersedes their recovery next-step notes.

The [reviewed migration checkpoint](S5_MIGRATION_APPLY_CHECKPOINT.md) adds HR-confirmed legacy identity links, stale-preview rejection, transactional preservation checks and exact-command retries in AR/EN. **48 native and 63 browser checks passed**, including simultaneous first writes. Ordinary candidate mode stays disabled pending recovery across navigation/reloads; full S5 and production gates remain open.

The [S5 search and migration-preview checkpoint](S5_SEARCH_MIGRATION_PREVIEW_CHECKPOINT.md) adds search/duplicate review against corrected person details, preserves historical application search, and provides a read-only HR legacy-record review in AR/EN. **46 native and 46 browser checks passed.** Applying migration links, recovery across navigation and ordinary intake activation remain pending; full S5 and release gates stay open.

The [S5 profile correction checkpoint](S5_PROFILE_CORRECTIONS_CHECKPOINT.md) adds reasoned AR/EN basic-profile corrections, before/after review and permission-filtered revision history while preserving application snapshots. **74 native checks passed**, with 24 affected checks rerun after final link validation, plus **37 browser checks** covering intake, corrections, retries, competing edits and revocation. Full S5 remains open; ordinary intake/correction activation remains disabled pending migration and recovery work.

The [S5 candidate workspace checkpoint](S5_CANDIDATE_WORKSPACE_CHECKPOINT.md) adds scoped AR/EN candidate lists, basic person/application details and reviewed recruiter intake. **35 native and 25 candidate browser checks passed**, including lost-response retry, concurrent creation and access revocation. This is partial S5 delivery: full profiles/history, migration, ownership actions, private files, consent and sourcing remain open. Intake was tested under a temporary synthetic-site lease and remains disabled for ordinary review traffic.

13 October 2026. **Implementation contract, not completed functionality.** Reference clone inspected at `7824be24292c4743b4005e14e2df540786cfe167` (clean checkout). Preserve every frozen S5 ID below and the shared VAC-003/VAC-005 application ownership clauses. Current native Job Applicant/ownership foundations are useful but do not satisfy this sprint.

## First design correction: a person is not an application

The reference `src/Candidates.gs` stores PERSONS separately from APPLICATIONS. A person can apply to several vacancies; an application's stage, source, recruiter, salary disclosure and history belong to that application. Shared phone numbers generate a warning, never an automatic merge or universal identity constraint.

The current pilot's ApplicantMixin builds a unique opening/contact key and uses upstream email-based naming when email exists. That design is insufficient for shared phones and multiple applications. S5 must replace it through a controlled, opt-in migration and verified commands, preserving existing offer/interview/employee references. Do not rewrite historical applicant IDs, silently merge records or treat phone/email as a person primary key.

## Increment 1 — identity and controlled intake

CAN-001, CAN-002, CAN-005, CAN-006, SRC-001, MOV-002 (initial identity/source clauses).

- Introduce an opaque company-scoped person ID and a distinct application ID linked to the existing Job Applicant record used by HRMS. Reuse that record for downstream interview/offer links, not a second independent application workflow.
- Add versioned recruiter commands to create a person/application or use an explicitly selected existing person. Require current team/HR scope and a reviewed open vacancy. Apply company/request/person/application locking in one documented order and retain command receipts.
- Record mandatory source/sub-source, recruiter-on-behalf actor/channel, application-specific contact snapshot and explicit salary disclosure states. No fabricated email or zero-as-unknown salary; national ID stays optional and restricted.
- Duplicate search must operate within the viewer's scope and return minimal review evidence. Shared contacts remain possible; a candidate's applications outside the viewer's scope must not appear through duplicate counts or errors.
- Migrate old applications conservatively with provenance and unresolved-identity flags. Existing records cannot become automatically identified persons from matching contact strings.
- Tests: same contact on different people, one person/multiple applications, same command replay, concurrent creation, stale person changes, scope revocation, native resource/list/export/print bypass and downstream reference preservation.

## Increment 2 — candidate workspace and accountable follow-up

CAN-001 history, CAN-002, ACT-001, ACT-002, SCR-002; shared VAC-003/VAC-005.

- AR/EN candidate and application views with bounded search, exact scoped counts, filters and distinct person/application labels. Do not expose compensation, national IDs, private notes or document URLs in ordinary list results.
- Reuse existing owner/next-action commands; show one responsible recruiter, dated next action, unassigned work and immutable handoff history. Finish recruiter-to-recruiter replacement while preserving lead/support roles, unrelated team members and owned application/tasks.
- Activity entries are append-only with reasoned void/correction, never silent edits. Coded rejection and internal reason are separate from a reviewed candidate-facing message.
- Stage transitions enforce prerequisites; interview, offer and joining stages must come from their domain workflows rather than a free dropdown.
- Tests: actual ordinary-session creation/read/update, owner and team access, manager shortlist visibility only where authorized, former owner revocation, concurrent/stale handoff, unassigned fallback, confidential-note isolation and bilingual mobile/keyboard review.

## Increment 3 — sourcing, ads and commercial attribution

ADV-001, ADV-002, SRC-001, SRC-002, SRC-003.

- Versioned JD-derived copyable ads, stable application links with server-resolved source attribution, referral attribution lock, agency terms and subscription-credit ledger/expiry alerts.
- Credits and referral terms are business records, not permission to purchase subscriptions or pay agencies. Editing a campaign cannot rewrite an existing application source.
- Tests: tampered source parameters, expired/disabled ad, immutable referral attribution, authorized correction audit, concurrent credit usage, reversal and expiry boundaries.

## Increment 4 — private files and candidate self-service

CAN-003, CAN-004, CAN-005, CAN-006, CAN-008; S5-05/S5-06 privacy gates.

- Private CV/document storage with purpose-specific short-lived tokens, bounded uploads, verified content type, malware-review status, filename isolation and download checks. Candidate access exposes only their own approved fields and documents.
- Versioned privacy acceptance and explicit recruiter-on-behalf evidence; consent is never invented from an upload or account creation. Talent-pool consent is distinct from applying to one vacancy.
- Keep internal notes, restriction reasoning, other applications and other candidate identities out of candidate responses. Define retention, holds, withdrawal/export/deletion workflow with the HR/privacy owner before enabling public intake.
- Tests: token expiry/replay/revocation, enumeration, cross-company/object access, mismatched MIME, malicious/archive uploads, file replacement/version history and recruiter impersonation boundaries. Public sending/provider configuration requires separate approved staging.

## Increment 5 — batch imports, former/internal candidates and communication

CAN-007, CAN-008, CAN-009, COM-001, COM-002, MOV-002 completion.

- Preview imports of 50–100 rows with an immutable batch ID, row outcomes, explicit duplicate review and retry semantics. Keep source provenance and never auto-merge by shared contact.
- Former/internal employee identification uses an explicit reviewed link and restricted hiring-rule evidence. Notify the manager before an internal candidate's first interview through the existing outbox; do not reveal restriction or pay details in that notice.
- Copyable WhatsApp templates and explicit rejection-message actions track draft/copied/sent/failed separately. Copying text or capturing local email cannot mark a candidate as contacted.
- Tests: malformed rows, partial batch retry, duplicate review, restriction approval, notification ordering, consent/retention holds and false-delivery prevention.

## Increment 6 — integrated acceptance

Reconcile all 20 S5 IDs plus shared VAC-003/VAC-005. Run permission-negative tests, actual AR/EN recruiter journeys, private document access, concurrency and cleanup. Keep S6 interviews, S7 offers, S8 joining, S9 lifecycle and S10 reports open until their own complete flows pass.

## Decisions and known boundaries

- The frozen CAN-005 wording and newer reference source differ on when current salary is collected. Preserve disclosure states and record the stage-specific HR decision; do not silently choose zero, remove the field or expose salary to a general recruiter list.
- HR/privacy owner must approve consent text, retention and holds, former-employee restrictions, public intake and candidate access. Internal schema/workflow work can proceed without inventing those approvals.
- Existing S4 selected-vacancy bulk assignment is all-or-nothing and bounded at 50. The reference also has recruiter-to-recruiter MOVE_ALL preserving roles and next actions; that end-to-end handoff remains required here. Neither selected-team replacement nor a generic bulk notification proves MOVE_ALL acceptance.
- Notification summaries contain no confidential data; current work is fetched through current permission checks. Sending to real candidates, provider subscriptions, production hosting, security certification and 1,000+ account performance remain separate gates.
