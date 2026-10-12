# Command audit envelope — implemented scope and remaining gaps

Status: **implemented selected adapters; final native regression verified**, 12 October 2026. See [checkpoint](../sprints/CHECKPOINT.md) for the exact tested source, final native evidence and separate browser/HTTP results. The finite obligation and dedicated-event alternatives are defined in [DECISION_AUDIT_INVENTORY.md](DECISION_AUDIT_INVENTORY.md).

**AT-AUD-001-01 status is recorded in the current checkpoint.** The finite P0–P3 inventory combines central envelopes with dedicated immutable events; new adapters require their final regression evidence before acceptance. **AT-AUD-001-02 is separate:** these are immutable local application records, not an external tamper-evidence anchor. Baseline definitions and policy decisions are unchanged.

## Requirement and implementation

AT-AUD-001-01 requires a decision to record its actor, acting principal, before/after values, exact command and timestamp, with ordinary API editing/deletion denied. The frozen reference `src/Audit.gs::audit_` / `auditDiff_` and `src/Config.gs::AUDIT_LOG` provide the original identity, on-behalf identity and field-difference contract.

`foundation/command_audit.py` implements the `Kandil Command Audit` DocType and a server-only `record_command` helper. It permits a finite domain/operation registry, explicit primitive projections and named targets; it rejects unsupported fields, secret keys, nonfinite numbers, arbitrary objects, duplicate related targets and mismatched command targets. No unrestricted `doc.as_dict()` becomes an audit projection.

| Stored group | Current meaning |
|---|---|
| Identity | Schema version, domain, operation, target DocType/name, company/department, explicitly labeled client command or server invocation ID and receipt/history reference |
| Reviewed input | Reviewed version plus canonical reviewed endpoint payload, retained as data rather than only a hash |
| Authority | Authenticated actor; original frozen approval principal and step; completed Board member/method/note/evidence fields when relevant |
| Time | Server-recorded occurrence time, ISO timestamp with offset, explicit `Africa/Cairo` timezone and native Datetime field |
| State | Immutable copies of primary before/after projections and explicitly selected related targets |
| Result | Returned result and generated-record references |
| Identity and content fingerprints | SHA-256 identity from domain/target/actor/client command; repeatable content fingerprint excluding occurrence time |

The captured payload is the payload passed to the command wrapper after existing endpoint parsing/normalization. It is **not** the raw HTTP body, authentication/session metadata or a retrospective reconstruction of arguments. Request projections use the reviewed shared-request allowlist. Restricted envelopes are separate from requester-readable Recruitment Events and Request Revisions.

For ordinary direct commands, principal defaults to actor. Approval adapters freeze the active step before the handler advances it. Recruitment Board decisions additionally preserve the frozen route principal and the actual Chair/Vice decision member; an external recorder remains the actor. This is distinct from normal delegation.

`related_added_to_capture` and `related_removed_from_capture` describe membership in the adapter's capture. They are not general assertions that an object was created/deleted anywhere in the database. New records receive no fabricated before state.

## Boundaries currently wired

| Boundary | Current capture | Remaining limitation |
|---|---|---|
| `recruitment.api.command` | Submit, decide, revise, HR review, send-to-CEO, amend and cancel; request/line/approval state, frozen authority, exact command, receipt and result | This is the wrapper's finite registry, not all HR decisions. Rejected commands roll back rather than producing durable denial records. |
| Amendment creation and approval | Parent/child request projections, related capacities/openings, newly created amendment included after creation | No invented pre-creation state; atomic pending-quantity editing is still absent. |
| Vacancy state/team/pin and bulk assignment | Related Job Openings and capacities; explicit team state; affected Applicant ownership/task projections for team changes | Bulk operations produce envelopes for their underlying request commands with existing batch payload/replay rules; this does not establish a separate global batch audit or a new concurrency test result. |
| `ownership.application_command` through recruitment wrapper | Selected Applicant owner/task before/after, request/version/result | Disabled-user cleanup uses the separate private system-event adapter described below. |
| `corrections.correct_approved` | Request, old/new capacities and openings; old related targets retained after relocation so released state remains visible | Only bounded approved corrections; no general compensation or payroll reversal. |
| `joining_corrections.void_joining` | Offer, Applicant, Employee, Position Assignment, draft Onboarding, Capacity and Opening projections under the request wrapper | This captures the bounded reversal command; the original outcome uses the dedicated joining adapter below. |
| `organization.api.structure_command` | Submit and decide; Structure Change, frozen approval step, reviewed preview/baseline, command history receipt; changed Positions/Hierarchy/Capacity and resulting Structure Snapshot | Does not wrap every native organization save. Revision approvals and imports use their own adapter below. |
| `organization.api.approve_revision` | Exact JD/Grade before/after, full AR/EN JD children and content, approved/superseded related records; independent actor and submitted reviewed version | Deterministic server invocation identity, explicitly distinguished from a client command ID. |
| `organization.api.review_import` / `apply_import` | Reviewed raw rows, digest, preview, result; actual created/reused Positions, Units, Jobs, Hierarchy, Assignments, codes, capacities and snapshots | All five import kinds; no invented before state for newly created records. |
| `recruitment.joining.record_outcome` | Exact original outcome arguments; server-observed locked Offer version, request/capacity/opening/source records and actual created Employee/Assignment/draft Onboarding including activities | Replay retains the original result without refreshing ledgers. This is not full P7 orchestration or a client-reviewed version assertion. |
| `foundation.delegation` create/revoke/decide/revise | Exact endpoint arguments for decisions/revisions, explicit observed native deltas for create/revoke, original version and new version, actor/principal/time | Native creation records explicit absence. Endpoint hook suppression prevents duplicate envelopes. Semantic timestamp normalization does not rewrite user input. |

The actual adapters are `recruitment/command_audit.py`, `organization/command_audit.py` and `organization/revision_import_audit.py`, `recruitment/joining_audit.py` and `foundation/delegation_audit.py`. They obtain related records through the locked request/structure changes and reviewed arguments. Recruitment preserves old captured targets in the after set when relocation removes them from current lines. Structure capture includes created Position IDs after approval and dated hierarchy records, rather than only the parent request's status.

## Separate event contracts and remaining obligations

Existing histories below remain useful evidence, but are not relabeled as exact command envelopes:

| Boundary | Existing evidence and missing work |
|---|---|
| After-commit/scheduled disabled-account ownership handoff | Private immutable Long Text Security Events preserve original initiator or explicitly unknown system origin, system executor, exact invocation, opening before/after and separate Applicant ownership/task changes. Shared vacancy events exclude private task content. Audit persists independently of Applicant deletion. |
| Native drafts, confidential HR notes, Department/organization saves, access grants and policy configuration | Native Versions, dedicated histories or security events cover selected changes. There is no universal exact-command wrapper; confidential notes must stay isolated. |
| Document delivery capture / local outbox operations | These have their own local capture/receipt/history contracts, not the central command envelope. A local mail capture is not an email delivery assertion. |
| Denied/failed commands | Transaction rollback prevents committed business/audit effects. Durable failed-attempt auditing requires a separate transaction/privacy/retention design. |

## Transaction, replay and privacy contract

The source keeps command authorization and domain locking, validates the current receipt/version, freezes before state and authority, executes the business effect, and inserts receipt/history plus envelope in the same transaction. The helper does not commit or call external services. An audit insertion error propagates so the caller can roll back business effects and receipts. Authorized replay returns the original result without a new envelope; changed payload under the same identity is refused. Native savepoint and after-commit callback isolation pass in the linked integration tests.

In recruitment, related targets are selected and locked after initial read/scope checks and before the shared User/grant locks. Primary before-state and frozen authority capture follow current authorization and replay checks. Three fresh 20-request HTTP batches now verify capacity admission and exactly one audit/receipt/effect for each replayed Manager and HR approval. This does not establish independent concurrency proof across every adapter. See the linked checkpoint for the current HTTP evidence.

The DocType's permission contract allows Administrator read-only review; normal business-role list/detail/read/share are denied. Controller rules forbid ordinary insertion, editing, deletion and rename, and the type is registered with protected secondary-surface handling. The installed tests cover selected native surfaces. Full authenticated browser/export/file/report coverage for this new DocType is not established merely by registration or adjacent-type tests. A future scoped business audit viewer needs an explicit redaction/read contract.

The record's content hash is a local consistency/replay fingerprint. Database operators could change content and fingerprints, remove rows or remove the tail; local immutability cannot independently detect that. PD-09's protected key/anchor operator, redaction, retention and external verification design remain unresolved. There is no implemented external anchor/HMAC chain or production operator-policy acceptance.

Historical receipts/events remain historical partial evidence. No migration fabricates missing old commands, before states or principals.

## Verified assertions in the final native gate

* `foundation.test_command_audit`: deterministic copying/serialization, secrets/nonfinite/unsupported objects, related allowlists, exact identity/authority/time/replay, native forgery/edit/delete/rename denial, ordinary read/list/share denial, stale-share cleanup, actual private file/download/ZIP/alias denial, native export/query-report denial, transaction rollback and no invented before state for newly captured records.
* `recruitment.test_command_audit`: exact submit/decision payload and generated opening, audit-failure rollback/retry, delegated HR principal, new amendment capture, relocation released/added capacities, team handoff Applicant effects, void-joining effects and fixture callback cleanup isolation.
* `organization.integration_tests`: exact submit/approval envelope identity and reviewed input; real actor/frozen principal/step; one envelope on replay; resize Position/Capacity before/after; final Create Position/Capacity/Hierarchy/Snapshot capture; future Reparent old-parent interval closure and new-parent start date.

The linked final gate executes foundation audit 15 (6 pure/9 native), recruitment audit 8 and organization 51 checks plus 15 grouped scenarios. Focused failures remain preserved in the evidence directory. AT-AUD-001-01 acceptance follows the finite inventory and current executed evidence; AT-AUD-001-02 remains separate pending external tamper-evidence design and proof.

## Revision/import extension

The new registry marks command origin as `client_command` or `server_invocation`; old records are not backfilled. Revision/import IDs hash operation, target, actor and submitted version/digest. Only declared temporal schema fields normalize to ISO; reviewed free text and import JSON stay intact. These adapters no-op outside the opted-in parity site flags. Audit insertion failure propagates to roll back every business effect in the transaction. The 11 focused native checks cover all five import kinds, independent approval, replay, full JD children, private Grade ranges, supersession, foreign-company denial, rollback and inactive-site compatibility. Final regression evidence is recorded in the current checkpoint.

## Dedicated organization decision events

Occupied-baseline reconciliation retains a protected Security Event with explicit actor and principal, exact callable name/arguments, old/new occupied values, basis and as-of dates, reason and server creation time. Department maintenance retains actor/principal, create/save operation, previous modified version, exact whitelisted changed field values, before/after and reason. A native field delta is labeled `native_document_delta`; it does not claim to reconstruct an HTTP request body. These are existing immutable event records, not duplicate central envelopes. Their native tests assert the concrete contents and forbidden ordinary mutation.
