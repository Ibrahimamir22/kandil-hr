# Next bounded headcount increment

Prepared 12 October 2026. **Design only; no implementation, migration, database run or acceptance promotion.** The running regression gate is independent of this document. Source inspection used custom-app HEAD `8b3dbff518781184642752f7c08f1a0f429cb9b8` plus the current uncommitted working tree; that HEAD alone does not identify all current implementation. Frozen reference HEAD: `7824be24292c4743b4005e14e2df540786cfe167`.

## Exact scope and baseline

Copy these expected strings unchanged into test descriptions; do not edit the canonical baseline:

| Case | Exact baseline expected |
|---|---|
| AT-HC-005-03 | Amending own reservation of2 to3 adds delta1; never charges old2 twice. |
| AT-HC-006-01 | Run same shortage with WARN and BLOCK settings; expected outcome and exception route are explicit and audited. |

Source of wording: `docs/phases_0_3/requirements-baseline.json`, HC-005 and HC-006. HC-005 rule note includes Reserved and excludes the current request's own reservation when evaluating its amendment.

Frozen `reference/kandil-recruitment-portal/src/Requests.gs:218–220` limits ordinary requester editing to Draft/Returned. `tests/phase40.js:245–253` proves reservation during approval and self-exclusion, not atomic editing of a Pending request. `src/Requests.gs:303–306` puts BLOCK before justification validation and requires ten characters for WARN. Therefore the proposed pending command is an explicit implementation of the accepted atomic case, not a claim that the reference already has that endpoint.

Current pointers: `recruitment/api.py::{command,submit_request,revise,review,amend}`, `recruitment/headcount_contract.py::enforce_shortage`, `recruitment/preview.py`, `recruitment/command_audit.py`, `foundation/command_audit.py`, and `docs/phases_0_3/HEADCOUNT_REMAINING.md`. Existing approved amendments and HR quantity corrections keep their current contracts.

## Increment A: atomic requester revision while Pending

Add one explicit parity-only POST command, provisionally `revise_pending_quantities`, through the existing versioned command boundary. Ordinary native Pending save remains denied. Limit the command to the actual requester, an enabled account with current management scope, a Pending non-amendment request, and its existing line/capacity identities. It changes quantities only plus a required revision explanation and an explicit shortage justification where needed. It cannot move locations, change requester/company/position, create a vacancy, change occupied/open counts, or carry out an HR correction.

Accept a complete map of existing line IDs to positive integer quantities, reviewed version, command ID, revision reason and, when supplied, exception reason. Reject missing, duplicate, unknown or foreign lines and extra payload fields. Apply the existing quantity parser and text bounds; define no alternative coercion rule. An unchanged map is a controlled no-op and does not reset approvals.

### Transaction and approval contract

1. Acquire the existing Company → request → requested Position/capacities/related domain → sorted Users/roles/grants locks. Use current reads after waiting; revalidate requester identity, scope and version. Preserve existing lock order and deadlock retry discipline. No nested public command or manual commit.
2. Capture current request/line/approval, capacity and policy snapshots. For each line let `r` be its own current reservation, `a` the current available quantity including all reservations, and `q` its new total. Evaluate against `a + r`; apply **delta = q − r** to aggregate reserved. Other requests' reservations remain charged. Example: structural3, occupied0, open0, own reserved2 gives available1; proposed3 sees effective available3, delta1, final reserved3. Do not add three on top of the original two.
3. Validate all lines and fresh current policy before persistent business changes. Use the same BLOCK-first/WARN-at-least-ten-trimmed-characters helper. Multi-line changes succeed or fail together. Store the evaluation basis and exact submitted input.
4. Preserve the old submitted snapshot, approval decisions and route in an immutable revision record. Increment revision, create fresh approval step keys and freshly resolved independent authority, and restart approvals from the first required step. The request remains Pending. No synthetic Return decision, no interval with released seats, no reuse of a completed manager approval for a changed quantity, and no mutation of the old decision.
5. Apply all reservation deltas and save the new submitted/policy/route snapshot. Reset revision-specific waiting/SLA timestamps using the existing business clock. Invalidate obsolete actionable steps and revision-bound authority using existing revision rules; preserve company/TEAM grants. Old queued approval notices must not remain actionable. Use existing outbox idempotency and scoped current-authority validation.
6. Save request history, the exact command audit envelope, related ledger before/after, command receipt and new approval notifications in the same transaction. Replay of the identical command returns its original result once; changed payload under the same command ID fails. A failure at any point restores request, ledger, revision, receipts, audit and outbox together.

Extract shared evaluation/route construction only as needed; do not call Return, revise and submit endpoints in sequence. Review `command()` carefully because `lock_capacities()` can refresh occupancy before the handler: rollback protection must encompass every business mutation, including refresh, not just the final delta.

### Required gates for A

- Exact own2→3 with one free seat: reserved changes by one, stays continuously reserved until commit, no opening/occupancy change; public preview shows total requested and additional demand correctly.
- Same case with another request's reservation and multiple locations: only the subject's own quantity is excluded; unrelated reservations stay byte-for-byte unchanged.
- At least one completed manager approval before revision: old snapshot/actor/principal/decision stays unchanged, new revision restarts with new keys, old decision key fails, new independent approvals work.
- Identical replay, altered payload, stale version, wrong requester, revoked scope after lock wait, zero/negative/fractional quantities and tampered line/capacity all tested. Unauthorized input has no ledger effects.
- Two independent connections contend for the last seat: pending revision and another submission cannot both consume unavailable normal capacity. A simultaneous decision and revision serializes; one must reload rather than applying an obsolete route.
- Inject failure after ledger, revision/audit and outbox writes: no partial business effects or stray success receipt. Existing Return2→0→3 test remains a separate lifecycle test.
- Real native EN/AR command UI, reviewed quantity summary, confirmation explaining restarted approval, clear denied outcome, and runtime receipt/ledger verification. Do not treat source or screenshots alone as transaction proof.

## Increment B: retained headcount denial outcome

Retain only evaluated headcount denials within these authorized commands: shortage under BLOCK, and shortage under WARN with a missing/short justification. This is not a universal failed-request logger, general authorization-event project, external tamper anchor, or expansion of AUD-001. Never expose headcount details to an actor who failed authorization before reaching evaluation.

### Selected transaction design to validate

Use a narrowly typed domain-denial outcome and a server-owned outer command boundary. Establish its rollback savepoint **before** any capacity refresh or business write. Evaluate under normal locks, copying a bounded server-generated denial projection. On this specific domain denial, roll back all business effects to that savepoint, discard callbacks created inside the rejected attempt while preserving pre-existing callbacks, clear stale document caches, and insert only the immutable denial event/outcome record. Commit through Frappe's normal successful POST transaction completion. No `frappe.db.commit()` inside a business helper, no commit-then-throw workaround, no external provider or autonomous connection.

Because Frappe ordinarily rolls back an exception response, the client must receive an explicit structured result such as `outcome="denied"`, a stable denial code, safe translated explanation and event identifier. It must show failure, retain the form, and never interpret HTTP success as successful submission. Preserve the existing successful response contract or update every audited caller together. A non-headcount validation/security/infrastructure exception continues to raise and roll back normally. Native callers remain subject to their surrounding transaction: only an independently committed HTTP result proves persistence beyond the request.

This design requires a small explicit transport adaptation for the affected headcount commands, plus tests of existing API consumers. Do not silently swallow every ValidationError. Keep the transaction wrapper parity-only; legacy sites retain behavior. If the existing framework cannot safely implement savepoint rollback and callback handling, stop and revise this design before adding a second transaction or changing error semantics broadly.

### Denial record and retry contract

Use an existing immutable private audit facility if it can satisfy deterministic identity and query privacy; otherwise define only the minimal denial-outcome schema after review. Do not disguise denial as a successful decision or grant a successful command receipt.

Store: exact operation/command ID, authenticated actor and acting principal, reviewed request version/revision, evaluation timestamp, current policy identifier/mode, bounded line/capacity identities and requested/own-reserved/available/excess/basis values, safe allowlisted submitted fields (including submitted exception reason), denial code, and unchanged business-state evidence. For submit, the command payload is empty: distinguish that exact payload from the evaluated saved request snapshot. Exclude attachments, CV, salary, confidential HR notes, raw HTTP headers/body, tokens and unrelated request fields. Apply existing private audit access/immutability; the actor sees only the safe response and permitted request history.

Use a deterministic identity from actor, request and command ID, with an exact operation/version/payload digest. Same-attempt replay creates one denial and returns that recorded outcome; reuse with different input fails. An intentional retry after policy/data changes uses a new command ID and fresh reviewed version. Do not re-evaluate a replay and silently convert an old denied command into approval. Lock or uniquely enforce identity in concurrent attempts and recheck current access before revealing any replay result. Snapshot the evaluated policy because a later setting change must not rewrite historical evidence.

If denial-event storage fails, no business change may survive and the response must explicitly say the attempt could not be recorded; it must not claim audited denial. A process/database failure before the normal transaction commit is not durable capture. This increment proves committed denials, not guaranteed logging during total storage outage. Existing local audit immutability does not become an external tamper anchor.

### Required gates for B

- Identical requested3/available1: BLOCK with blank/short/valid reason always blocks; WARN blank/whitespace/nine/padded-nine fails; WARN exact ten proceeds to the configured independent exception route. Only the successful path reserves quantity.
- Each controlled denial survives the completed HTTP request and a fresh independent DB connection; request, route, ledger, revision, ordinary success receipts and notifications remain unchanged. Its recorded outcome, policy and shortage numbers are exact.
- Identical concurrent/repeated command yields one retained denial; conflicting payload is denied; policy changes do not rewrite old denial and a new command uses new policy.
- Successful WARN retains exact reason and Sector/independent CEO authority as applicable; ordinary HR cannot grant the exception. Existing successful-command audit remains intact.
- Inject denial-record insertion/commit failure: no business mutation and no false audit-success message. Inject unexpected validation/permission/database errors: they are not converted into headcount-denial successes.
- Native get/list/update/delete permissions on denial storage, unauthorized actor replay denial, secret-field exclusion, EN/AR UI failure display and backward-compatibility checks for existing successful submit callers.

## Execution order, dependencies and decisions

1. Root reviews the bounded endpoint and transport contract before source ownership is assigned. Preserve baseline IDs/expected strings and existing evidence.
2. Implement A with native transaction/independence tests. Implement B against the same shared typed evaluator and outer rollback boundary. Finish source-level peer review before schema migration, if any.
3. Use only the parity site and synthetic data. Root coordinates any schema reload and exclusive DB/browser leases. Run affected recruitment/headcount/authority/SLA/outbox/audit suites, then independent-connection and authenticated HTTP gates at a frozen source hash. Record initial failures and fixes; no numeric pass claim before execution.
4. Promote only the two exact cases after their entire clauses are evidenced. If atomicity or retained HTTP denial remains unproved, retain partial status with the precise missing gate. Update the remaining-headcount note only after implementation; this document does not override it.

**Authorized engineering work:** exact delta arithmetic; explicit requester-only command boundary; stale-version/current-scope checks; immutable earlier revisions; fresh independent approvals; rollback/idempotency/privacy; deterministic local denial storage; bilingual UI; synthetic tests. These can be designed and built without asking HR to choose database mechanics.

**Business signoff genuinely needed before operational rollout:** confirm the visible requester action and full approval restart for a changed Pending quantity, since the frozen UI only allowed Draft/Returned edits; confirm the company's WARN/BLOCK configuration and named independent approvers already tracked as policy decisions. If HR requires any previous approvals to carry forward, that is a different policy needing explicit criteria and new tests; do not infer it. Keep existing private audit retention/access unless HR explicitly requests changes—no new retention-policy choice is a prerequisite for this bounded local proof.

No new probation, overdue-document, payroll, Odoo, SaaS, identity-provider or global auditing scope is included.
