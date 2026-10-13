# HR portal/API contract — Sprint 1

Engineering contract for subsequent sprints, based on the current source. This does not assert that future workflows or production infrastructure already exist.

## Ownership and transport

The React/TypeScript website (`frontend/portal`) provides the Arabic/English experience. Frappe owns personal accounts, sessions and CSRF validation. `kandil_hr/portal/api.py` owns narrow portal read projections and draft saving. Recruitment, organization and future domain modules own authorization, commands, audit and transaction rules. Frappe HR/ERPNext records and MariaDB remain the HR data store. Odoo is outside this implementation boundary; there is no duplicate portal database.

Requests use the same origin and personal session cookies. Mutations use POST plus the session CSRF token. GET endpoints do not perform business transitions. No browser-held shared API key, Administrator fallback, HR record cache in localStorage, or client-selected acting identity is allowed. Production TLS, cookie/session policy, MFA and external identity acceptance remain separate gates.

## Reads and language

- Server field allowlists define response projections; do not expose whole documents or private HR notes through a new convenience endpoint.
- Native read permission and company/department/location scope are checked independently of navigation visibility. List, detail, search, export and attachment paths require their own negative tests.
- Current overview uses 50 requests by default, capped at 100; counts, approvals and vacancies apply to that request page. Overview/approval/vacancy client search remains within the loaded page. These views are not company-wide reporting. The separate hiring-request register now uses the server-filtered contract below.
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

## Delegation portal (Sprint 3)

`portal.delegations.listing` and `detail` are authenticated GET projections over native Delegation read permissions and current company/department grants. Lists use server-side search/status filters, stable ordering and bounded pagination (25 default, 100 maximum). Detail projects the stored approval state separately from the currently effective APPROVALS/TEAM processes and Cairo as-of date. Effective process hints do not authorize a request decision; actual commands recheck participant roles/scopes, current dates and request-specific interests. The stored Active state is displayed as Approved rather than promising present effectiveness.

`people` is an explicitly limited authority directory for scoped Sector administrators with native Delegation create permission. It returns only user identifier and display label, uses database-side search/pagination and excludes disabled/out-of-scope accounts, Board principals and self as delegate. Delegate choices require the Approver role. This endpoint grants no native User profile access. The company/department controls reuse the permission-filtered organization choices; a department without a configured visible Position requires organization setup before this form can select it.

POST `create(payload, command_id)` allows only company, department, holder, delegate, inclusive dates, process scope and reason. POST `execute(name, operation, payload, expected_version, command_id)` accepts only revise/revoke/decide and their precise fields. Text bounds, dates and metadata are checked before native dispatch. Creation/revocation use native model validation, the Company mutex and sorted User locks, and atomically record one client-command audit and a minimal identifier receipt. Receipt identities are actor/company/operation/command-ID scoped; changed content under the same key is denied, exact concurrent retries return the original identifier after current scope/permission revalidation. Revision and CEO decision reuse the existing domain commands and their receipts. No internal decision/revision key, full native response or private audit envelope is returned. Every command returns only `{name, operation}`.

The UI uses the existing personal-session CSRF transport and command ID lifecycle. It retains input on denial, shows the reviewed grant's participants/dates/process before confirmation, and retains a successful result locally until the current detail fetch succeeds. This prevents a successful create followed by a failed detail fetch from being resubmitted as a new command during the same mounted form. This is not durable recovery across reloads; the existing contract's reload limitation remains.

Only the Sector administration role creates/revises/revokes ordinary grants; CEO authority starts Pending CEO and only the configured CEO can decide it. A revised CEO grant needs new approval. Native immutable versions and revocation reasons remain authoritative. Board delegation is explicitly excluded; the separate implemented Board evidence contract follows below. Storing TEAM/ALL does not implement later transfer/probation workflows or add account/data/payroll permissions.

## S3 Board decisions and evidence

`kandil_hr.portal.board` provides authenticated GET `context(name)`, `files(name, start?, page_length?)`, and `proof(name, evidence)`. All require current request read permission; each attachment also requires native File read permission, a local private nonfolder File and an exact attachment target. Candidate-page pagination may return fewer visible rows than its limit. Exact proof lookup avoids coupling a just-uploaded attachment to the first listing page. Context separates the frozen deciding member from the recording actor and exposes only permitted current-round Board decisions, not raw receipts/audit envelopes.

POST `upload(name, filename, content, expected_version, command_id)` accepts base64 PDF, PNG, JPEG or UTF-8 text up to 10 MiB. Signature/extension checks are not malware scanning. It requires an active Board step, eligible independent Chair/Vice or designated Sector recorder, current management scope and native request write permission. Company/request/position/capacity/User locks precede validation and an atomic minimal receipt. Exact retries return `{name, file}`; changed input with the same ID fails. Receipt replay reads the referenced File with current locking visibility before checking its attachment and read permission, so a newly committed upload is not hidden by an older transaction snapshot. Upload creates a private attachment, never an approval.

POST `decide(name, decision, step_id, expected_version, command_id, comment?, board_evidence?, board_member?, on_behalf_method?, on_behalf_note?)` delegates to the native recruitment command. The frozen route requires CEO before Board; direct members cannot impersonate another member. On-behalf recording requires the frozen Sector authority, a current eligible frozen member, method, explanatory note and same-request private proof. Return/Reject require a reason. The response is only `{name, operation}`. Replays after later revisions still enforce current native access and exact receipt identity and do not decide the new round.

The native decision audit stores the proof File ID, filename, byte count and SHA-256 in a strictly validated authority projection. Existing request attachments cannot have their content, privacy, URL or attachment metadata overwritten through ordinary File lifecycle writes. Recorded Board proof cannot be deleted or renamed after a returned request's current steps have been replaced; retained command audit references continue protecting it. The File mixin checks before physical deletion. This is application-level custody, not an external archive/seal or protection against privileged database/filesystem operators. Native private download/zip checks continue to apply. Evidence is readable by authorized request readers according to their File permissions, not exclusively Board members.

## S3 request register

Authenticated GET `kandil_hr.portal.requests.listing(mode?, search?, status?, start?, page_length?)` accepts `mine` or `scope`. Backend default is `mine`; the current portal initially selects `scope` to preserve authorized HR/manager navigation. Mine adds `requested_by=current user` to the native permission filter; scope never means unrestricted company access. Search is literal title/ID text, maximum 140 characters; `%`, `_` and backslash are escaped. Status must be an allowed workflow status. Filters apply before both count and pagination.

Default page length is 25, bounded to 1–100. The native permission-aware aggregate and page use identical filters, including User Permissions and current company/department/location scope. Each row is reauthorized with `read_request`. The response contains compact rows, `total`, `start`, `page_length`, `next_start`, `has_more`, `mode`, `statuses` and `count_scope=permission_filtered_matching_requests`. Rows contain only identity/title/status/revision/modified/requester/company/department/required date and summed original requested quantity. No raw request body, employee profile, private note or snapshot is returned.

The client clears old rows on a query/refresh and ignores superseded responses. Filters reset pagination; Refresh retains the applied query. Returning from detail currently resets the register to its default scope view. Counts describe matches at read time; offset pages are not a frozen cross-request database snapshot. Dashboard, approvals and vacancy totals remain page-local and need their separately tracked work. See [register checkpoint](S3_REGISTER_CHECKPOINT.md).

## S3 command review history

Authenticated GET `kandil_hr.portal.request_history.events(name, start?, page_length?)` lists permitted modern recruitment commands for one currently readable request. It reads only the private audit target matching request/company/domain and the explicit request-workflow operation allowlist. Default pages are 20, maximum 100; `has_more` describes candidate pages. Hidden historical events are omitted, so a page may be empty while later candidates remain. No unrestricted total is claimed.

GET `event(name, event_id)` binds the ID to that same target and returns field-allowlisted `before`/`after`, visible changed-field names, safe event metadata and the reviewed step for a decision. Original requested/proposed/approved amounts, actual step outcomes, actor/principal and a captured policy subset come from stored envelopes. Private payloads, receipts, HR notes, employee profiles and raw related effects are omitted. Replacement references are redacted when current employee-reference access is absent; inaccessible amendment references are omitted. Board proof uses the exact-target current private File check.

Both sides require current native Position/Capacity access and access to every recorded historical location. New command captures include the selected Position. Missing old location context requires a department-wide current grant and returns `location_capture=partial`; it is not reconstructed from today's metadata. Current request authorization is necessary but not sufficient. Events outside historical scope are omitted or denied; revocation is rechecked on each call.

The screen clears previously displayed content on refresh and discards obsolete responses. It is loaded explicitly from saved detail and uses the same personal session. The adapter does not modify old audit bytes or close native legacy revision access, cross-event comparison or full S3 acceptance. See [command-history checkpoint](S3_COMMAND_HISTORY_CHECKPOINT.md) and [remaining contract](S3_HISTORY_DESIGN.md).

## Saved request revisions and pre-decision comparisons (Sprint 3)

Authenticated GET methods in `portal.request_revisions`:

- `revisions(name, start=0, page_length=20)` returns permission-checked saved snapshot metadata. Pages cap at 100 candidate rows, with stable creation/name ordering. Several actions can share one revision number; the saved record ID identifies the exact snapshot. Restricted rows are omitted, so an empty page can still have a next page. No unrestricted total is returned.
- `revision(name, revision_id)` returns the immutable saved snapshot through the same explicit field and reference projection as command history. It does not return raw JSON. The ID must belong to the selected, currently readable request/company; snapshot metadata and historical location access must also agree.
- `compare(name, revision_id, event_id)` compares that saved snapshot to the selected decision command's **before** capture. It separately identifies the resulting decision and request status. A non-decision event or another request's ID is rejected. `same_revision` distinguishes ordinary comparisons from deliberate comparisons across revisions.

To obtain historical branch context, the adapter looks for a command AFTER capture with the exact same complete snapshot content. Only declared datetime fields normalize the existing space-versus-T serializer difference; title, other free text, quantities, route JSON and every other field stay exact. A matching timestamp/revision number alone cannot attach a historical location. Ambiguous timestamp candidates fail closed. Without an exact matching capture, existing department-wide legacy permissions are required and missing location context remains marked partial. Current position/branch data is never substituted for unknown historical values.

These projected endpoints intentionally differ from native raw Revision access: they can redact a restricted employee/amendment/proof reference and can authorize a branch-scoped historical capture. Native raw JSON requires its stricter whole-record guard. Reads leave stored snapshots, audit records and receipts untouched. Refresh and changed selection clear prior comparisons; each detail/compare request reauthorizes access.

The source-controlled post-model-sync patch `kandil_hr.foundation.request_history_indexes` adds composite indexes for request/company history lookups. JSON capture matching still evaluates candidates inside the selected request; this is not a claim of production load capacity. Sustained capacity and broad authority-history acceptance remain separate gates.

## Captured route explanations and amendment links (Sprint 3)

The command and saved-version projections include `rationale`, derived exclusively from the selected snapshot's `route_snapshot`. It exposes the recorded structure/check dates, skipped authority levels with known vacancy/personal-interest reason codes, and the authority, inclusive dates, modified timestamp and reason of applied dated rules. It does not return excluded users, assignment IDs, raw interest sets, rule IDs or historical position IDs whose scope is not established by those legacy rows. Unknown skip reasons have an explicit unrecognized code. Missing captures return null; malformed collections or nontext projected values are denied. This explanation never reroutes a request or evaluates today's policy.

Authenticated GET `portal.request_links.related(name, start=0, page_length=20)` reads the currently permitted original request and amendment cards (`name`, `title`, `status`, `revision`). Native list permissions apply before child pagination, capped at 100, followed by direct read authorization. The parent must also be currently readable in the same company; otherwise its identifier/title are withheld and `parent_restricted` is true. `has_more` refers to candidate pages, with no hidden counts. Navigation reads current relationship state, rather than claiming it is an immutable historical snapshot. The UI reauthorizes every opened record; refreshing removes stale cards before the new response.

`foundation.approver_capacity_access` is a post-model-sync patch and is also called by installation setup. It grants CEO/Board roles read/select on Capacity so those request reviewers can inspect historical location references. It explicitly disables export (which Frappe Custom DocPerm otherwise defaults on), writes, creation, deletion and other elevated flags for these application-owned rules. It creates no Access Grants and does not bypass existing company/department/branch or native User Permission restrictions. Other roles are preserved. Production grants and independent security acceptance remain separate.

Live `recruitment.preview.headcount` and its navigation action share an explicit operational-role check (Requester, Approver, Recruiter or Sector; Administrator break-glass). CEO/Board reference-read permission alone does not enable this recalculation. Native Capacity permissions and request scope are still checked by the endpoint.

Saved-version location matching considers snapshot-writing operations only. `amend` is excluded because it creates a child without saving the parent; its unchanged parent AFTER capture cannot establish the original version’s historical location. This prevents legitimate amendment creation from making the parent’s approved version unavailable, while retaining strict full-content matching and ambiguity denial for candidate writes.
