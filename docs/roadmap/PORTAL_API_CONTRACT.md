# HR portal/API contract — Sprint 1

Engineering contract for subsequent sprints, based on the current source. This does not assert that future workflows or production infrastructure already exist.

## Ownership and transport

The React/TypeScript website (`frontend/portal`) provides the Arabic/English experience. Frappe owns personal accounts, sessions and CSRF validation. `kandil_hr/portal/api.py` owns narrow portal read projections and draft saving. Recruitment, organization and future domain modules own authorization, commands, audit and transaction rules. Frappe HR/ERPNext records and MariaDB remain the HR data store. Odoo is outside this implementation boundary; there is no duplicate portal database.

Requests use the same origin and personal session cookies. Mutations use POST plus the session CSRF token. GET endpoints do not perform business transitions. No browser-held shared API key, Administrator fallback, HR record cache in localStorage, or client-selected acting identity is allowed. Production TLS, cookie/session policy, MFA and external identity acceptance remain separate gates.

## Reads and language

- Server field allowlists define response projections; do not expose whole documents or private HR notes through a new convenience endpoint.
- Native read permission and company/department/location scope are checked independently of navigation visibility. List, detail, search, export and attachment paths require their own negative tests.
- Current overview uses 50 requests by default, capped at 100; counts, approvals and vacancies apply to that request page. The current client search is within the loaded page. It is not company-wide reporting.
- The S3 request form uses `portal.request_form.references`: bounded searchable Position/Capacity/replacement pages (default 20, maximum 100), current management scope and native reference restrictions. An empty eligible page may still have more candidates. The old 500-row `choices` API remains for compatibility but is no longer used by this form. Recruiter selectors still fail explicitly if their supported limit is exceeded.
- Read results are advisory. The command rechecks current identity, scope, version, capacity and policy under locks before mutation.
- `_lang` is transport metadata, excluded from command signatures. API identifiers/statuses remain stable; visible labels support AR/EN, and Arabic uses RTL. Names and entered business text are not automatically translated.

## Commands, versions and retries

A transition carries a unique `command_id`, its target and `expected_version` from the record the person reviewed. The server compares a current locked version and rejects stale decisions. Commands must check both resource access and specific business authority, including self-interest and delegation rules.

Receipt identity includes the authenticated actor, target and command ID; payload/reviewed-version hashes prevent changed-payload reuse. Identical replays return the original result, while current authorization still applies. A network timeout is an unknown outcome, not proof of rollback. Retry the same operation with its original ID and unchanged payload; do not create another ID automatically after an uncertain response.

The current frontend keeps the most recent attempt per method in memory. Its retry protection therefore applies while that page and attempt remain available. It does not persist a recovery ledger across browser reloads or competing edited attempts. After reload, inspect saved state before repeating a create action. A later recovery feature must avoid storing sensitive payloads in browser storage and must be independently tested.

The draft-create command uses an actor/company receipt key because there is no target name yet. A saved draft has server identity and requires its reviewed version for changes. Creating a draft and submitting it are separate commands; a submission refusal leaves a real editable draft.

## Transactions and outcomes

All business writes, request snapshots, capacity changes, success receipts and command audit commit together. Database/domain locks precede sorted account/grant/outbox locks. Existing commands serialize on Company before their request; do not add reverse lock order. Transaction retries repeat the whole rolled-back command and must not send external messages inside that boundary.

An evaluated headcount refusal returns a structured `outcome=denied` response, potentially with HTTP 200. This is explicitly a failed business action: the client shows the safe message and retains inputs. The boundary rolls back business changes and stores a private denied outcome for authorized replay. An authorization, validation or infrastructure exception retains its ordinary failure/rollback behavior; it must not be disguised as a headcount refusal.

The frontend strips HTML from server messages and does not render raw tracebacks. It distinguishes an uncertain network result from a confirmed business refusal. New screens must preserve entered values on errors and show the reviewed change before consequential actions.

## Notifications

Delivery is currently local Notification Log delivery only. There is no proof of external email or other provider delivery. Outbox content commits with the business transition; delivery rechecks current recipient access. Pending quantity revision suppresses old undelivered notices for that request before queuing the new revision notices. Historical delivered notices remain; decisions still require the current step/version.

## Required proof for each new workflow

Verify ordinary positive roles and forbidden roles, cross-company/location access, disabled/revoked access, direct API/native bypass, duplicate and changed-payload replay, stale versions, transaction failure rollback, and actual persisted results. For concurrency-sensitive changes use independent connections. Verify AR/EN desktop/mobile screens with real sessions, not only mocked data or screenshots. Reuse existing commands instead of implementing alternate business rules in the frontend.

Related: [roadmap](SPRINT_PLAN.md), [policy decisions](../phases_0_3/POLICY_DECISIONS.md), [release gates and decision owners](REMAINING_GATES.md).

## Structural portal extension (Sprint 2)

`portal/structure.py` connects reviewed organization changes. Company-wide grants are required for structural records; branch/department-only viewers retain the separate scoped directory. Draft save and preview have actor/company/operation receipts; submit and decisions retain native structure command receipts and audit. New target replay uses a locking read under Company to avoid an earlier transaction snapshot missing the just-committed record.

The submitted comparison projects only whitelisted position before-values from the matching submission audit; raw audit envelopes, employee records and broad reconciliation snapshots are excluded. Branch/Designation are shared name catalogs with explicit select-only rules for structural authors; the portal additionally checks the selected company. The after-migrate installer records this setup in source. See [structural checkpoint](S2_STRUCTURE_CHECKPOINT.md) for proof and limits.

## Organization import extension (Sprint 2)

`portal/imports.py` exposes GET `choices`, `listing`, `detail` and POST `validate_csv`, `batch_rows`, `save`, `review`, `apply`, `occupancy`. Whole-company access and native import read/write permissions are required. `validate_csv` takes the selected company/type, bounded CSV and baseline reference; existing drafts also require name/version. Its digest binds normalized rows/type/reference. Saving reparses/revalidates and requires that digest. Independent review and application reuse native domain rules with current versions and actor/company/operation command receipts.

Draft batch rows are validated against live records. A business validation error is returned with the submitted rows so the author can correct the draft; authorization errors still reject the request. Reviewed rows retain the frozen review actions. `batch_rows` and `occupancy` use POST for consistent locking reads and do not repair or update records. Lists default to 20 and row comparisons to 30, capped at 100. CSV validation returns at most 1,000 rows / 1 MiB of source; saved detail never includes raw snapshot/audit payloads. See [import checkpoint](S2_IMPORT_CHECKPOINT.md).

## Individual employee-position changes (S2, 2026-10-13)

The existing `portal.structure` save/preview/submit/decide contract accepts one of:

- `AssignEmployee`: `position`, `employee`, optional `allocation` (`Primary` default or `Acting`), optional `valid_until`.
- `EndAssignment`: `position`, `assignment`; request `effective_on` is the inclusive final day.
- `MoveEmployee`: source `position`, `assignment`, `target_position`, optional destination `valid_until`; source ends the preceding day. Without an explicit destination end, the prior finite end is retained.

Use the existing proposal company/effective date/reason, optimistic version and actor-specific command ID. These operations cannot be mixed or batched in this slice. They require separate HR and CEO decisions; the author and affected employee cannot decide. Assignment records cannot be created/edited through ordinary native resource writes. Reviewed baseline import and approved joining/reversal remain separate server-controlled workflows.

`catalog` additionally accepts `kind=employee` or `kind=assignment` (the latter requires a scoped `position`). Both require whole-company management plus native Employee/Assignment read permissions. Employee choices use native `get_list` and its User Permissions; selecting/guessing an unreadable Employee also fails server-side proposal validation. These catalogs return bounded identifiers and labels only. They do not grant broader Employee access.

For a selected source episode, review rows add `assignment_before` with `employee`, `position`, `allocation`, `valid_from`, `valid_until`. Submitted before-values come from the matching immutable audit. Review authorization is the existing whole-company structure permission; no general employee profile/salary/user payload is projected. The existing route history contains the reviewed operation identifiers.

Dated assignments are authoritative for this operation. No promise of standard Employee profile department/branch synchronization, automatic midnight ledger refresh, payroll effects or external account changes is made by this API.

## S2 JD portal increment

`kandil_hr.portal.job_descriptions` exposes bounded personal-session endpoints:

- GET `listing(position?, status?, search?, start?, page_length?)`: native/scoped revision pages. A position filters its company/job; it does not grant access to sibling anchors.
- GET `positions(search?, start?, page_length?)`: scoped active anchor positions with current `can_create`; capped pages, no global employee/salary lookup.
- GET `detail(name)`: explicit editable text/child projections plus status, version, predecessor, approval metadata, warnings and action capabilities. No grade/salary/raw audit data.
- POST `save(position, payload, command_id, name?, expected_version?, supersedes?)`: validated company-wide author command. Existing name requires author ownership and exact version; anchor/predecessor cannot change. Approved predecessor must be readable and match company/job. Native rules govern approval chronology.
- POST `approve(name, expected_version, command_id)`: independent native Sector Approver, immutable approval, latest-predecessor recheck. Personal receipt replay revalidates current role/scope and native write permission.

Payload allowlist and row limits live in `portal/job_descriptions.py`. This is a full editable-content replacement; callers must round-trip the editable fields they want retained. Hidden grade data is excluded and left unchanged on updates; new revisions do not inherit that hidden link automatically. Existing native document view/print routes remain authoritative for AR/EN JD and worker-card HTML. PDF/mail acceptance is not implied.

## S2 PDF and local document delivery

`portal.document_delivery` exposes authenticated GET projections, after native JD read/print and current document-scope checks:

- `capabilities(name)`: `can_capture`, `delivery_mode=local_capture`, `provider_sent=false`, `max_recipients=10`, `note_limit=500`.
- `recipients(name, search?, start?, page_length?)`: approved revision and authorized sender only. Bounded company grant candidates are paginated before full native recipient eligibility checks. Rows contain only eligible `user`/`label`; search is by email. `next_start` advances candidate pages; an empty eligible page can still have `has_more=true`. No global user directory.
- `history(name, start?, page_length?)`: native sender/recipient visibility and frozen included-scope rechecks; rows contain name, JD revision, sender, recipient, language, output kind, status and captured time. No raw MIME, private scope snapshot or unrestricted audit envelope. The native own-capture eligibility scan remains a capacity-review item.

The frontend calls existing POST `organization.document_delivery.capture(name, expected_version, recipients, language, kind, note, command_id)`. It retains the same command ID for an unchanged retry and requires `status=Captured locally` with `provider_sent=false`. This records an immutable local HTML/PDF MIME copy, not an outbound email. Existing native download revalidates current access; revocation denies history and captured EML download.

`organization.documents.download_pdf(name, language, kind)` returns a private `application/pdf` attachment, RFC 5987 UTF-8 filename, `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`. Direct PDF and captured PDF share A4 margins/page-number options. HTML view/print remains available. See [document checkpoint](S2_DOCUMENT_CHECKPOINT.md) for exact focused tests and visual evidence; real email and HR document acceptance are separate gates.

## S2 history projections

Authenticated GET `portal.history.events(kind, name, start?, page_length?)` accepts only `kind=jd` or `structure`. It reuses the target's native/scoped read contract, then selects recorded organization commands for exactly that target/company. Returned event rows contain only name, operation, actor, principal and occurrence timestamp. Historical before/after scope must still be readable. Pagination is over candidate events; an empty visible page can have `has_more=true`.

GET `event(kind, name, event_id, related_start?, page_length?)` binds the audit ID to the authorized target. It returns whitelisted field differences and capture-presence markers. Structural related records are restricted to source/destination/created position targets; only supported position/capacity/hierarchy/assignment fields are compared. Native current record permissions and historical scopes apply. Unreadable employee, assignment and parent/target-position references are redacted. No raw envelope, receipt, payload, grade/salary or broad company snapshot is returned. Related candidate pagination is bounded; audit-envelope parsing remains a performance-review item.

GET `revisions(name, start?, page_length?)` lists readable revisions for that JD's company/job. GET `compare(name, other)` independently checks both revisions and rejects a different company/job, returning whitelisted before/after differences plus the two current record versions. Draft comparisons are explicitly mutable and must be refreshed; event comparisons use frozen command snapshots. Page sizes default to 20 and cap at 100. No history endpoint mutates business state or grants raw audit REST access.

See [history checkpoint](S2_HISTORY_CHECKPOINT.md). This is recorded-command history, not proof every historical database write was captured or a replacement for independent audit custody.

## S3 advisory request preview

POST `portal.route_preview.evaluate(payload, name?, expected_version?)` accepts the draft-save editable field allowlist (at most 50 location lines and 40,000 JSON characters). It requires a personal session and CSRF even though it is read-only, to keep editable HR text out of URLs. Existing records must be current requester-owned drafts with native read/write permission and exact version. All proposals require current management scope for each location plus native Position/Capacity access; new proposals require native create permission. Replacement identity policy remains separate from Employee profile access.

The response contains `advisory`, `ready`, Cairo `evaluated_at`/`as_of`, `rows`, public `policy`, ordered `steps`, minimal `skipped` reasons and `issues`. `ready` means only that this preview found no current blocker. WARN/BLOCK shortage evaluation, dated occupancy and native authority resolution are reused; required principals also undergo current scope preflight. No request, route snapshot, ledger, revision, command receipt, audit or notice is persisted. SQL current reads can acquire locks; capacity/latency on production topology still requires S11 evidence.

Current access, guessed references, wrong draft owner/stage or stale version fail as ordinary exceptions. After those checks, unavailable route authority yields `ready=false` with a configuration issue and no partial route. Submission still revalidates, records durable business denials when appropriate and freezes its actual snapshot. Repeated preview needs no command ID because there is no business mutation. The frontend discards outdated responses and clears stale data on a refresh/access failure. See [preview checkpoint](S3_PREVIEW_CHECKPOINT.md).

## HR request actions (Sprint 3)

`portal.request_operations.execute` is a POST-only personal-session adapter for review, adding CEO approval, cancellation, linked amendment creation, approved correction and returned revision. It accepts the reviewed version, command ID and a bounded allowlisted payload. It delegates to the native recruitment commands and returns only `{name, operation}`; neither an initial result nor a receipt replay exposes a native full-document snapshot. Fetch current `portal.api.detail` afterward. Stage/role hints are guidance; native command checks remain authoritative. Exact replay must reach the command receipt after current access checks even if the original action has changed the stage.

HR review can reduce proposed quantities and set HR priority while retaining original requested amounts. Unknown line identities fail validation. An added CEO step leaves HR pending; both active HR authority and the independent CEO require current scope. CEO candidate identities are included in the existing sorted lock order. Cancellation is requester/HR only, includes Returned requests, and is hidden while a linked amendment is active. Approved correction supports allowlisted fields, reductions above actual-joiner floors and relocation of remaining open seats; increases follow linked amendment approval. Candidate-disposition and current destination capacity guards remain in the native commands.

Amendment drafts retain their parent link and permit zero at an original location. Their portal UI fixes position and location identities; the server still checks the parent version, permitted locations and actual joiners on submission. Their advisory preview uses incremental demand above the approved parent, including zero-demand lines.

Request detail projects `hr_priority`, `amends`, `request_kind` and line `closed_qty`, alongside requested/proposed/approved quantities. The ordinary timeline shows the reason of an HR correction rather than its raw JSON before/after payload. Original audit and revision records remain unchanged; the full permission-filtered frozen-history UI belongs to the following S3 slice.
