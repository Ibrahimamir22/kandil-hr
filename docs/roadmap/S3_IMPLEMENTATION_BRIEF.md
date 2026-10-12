# Sprint 3 — full hiring requests and approvals

13 October 2026. **In progress: the full request form, advisory approval/headcount preview and HR request actions are implemented; see [slice 1 checkpoint](S3_FORM_CHECKPOINT.md), [slice 2 checkpoint](S3_PREVIEW_CHECKPOINT.md) and [slice 3 checkpoint](S3_OPERATIONS_CHECKPOINT.md) for verification and limits.** This document remains the build contract for the later slices; their planned screens are not claimed delivered. S2 engineering dependencies are available; S2's HR terminology/document/history acceptance and configured live email remain open. Starting independent S3 work does not close those gates.

## What already works and what is missing

The custom portal has create/save/submit, per-location quantities, approve/reject/return, returned-request revision, pending-quantity revision, decision timeline and scoped paginated overview. Its source is `frontend/portal/src/main.tsx`, `PendingRevision.tsx` and `kandil_hr/portal/api.py`. The domain commands already provide more behavior than the portal exposes; reuse them.

The request wizard now exposes all four need reasons, scoped replacement identity, employment type, qualifications, skills, experience, working conditions, requested priority, date, exception reason, position and multiple location quantities. Review and saved detail display these fields. Paginated searchable selectors replace the eager 500-item choice fetch. The old choice API remains for compatibility; the new form does not call it. See `RequestForm.tsx` and the slice 1 checkpoint for current evidence.

The portal now connects HR review quantities/priority, adding CEO approval, cancellation, approved corrections/relocation and linked amendments through the existing domain commands. It retains original requested amounts, shows proposed/approved amounts, and requires reviewed reasons. Adding CEO approval leaves the HR step pending. Delegation management is connected through `portal/delegations.py` and `Delegations.tsx`, including immutable versions, CEO decisions and reasoned revocation. Board evidence and the full frozen approval snapshot still need connected screens. The portal request list uses the scoped overview; the native own-only `review_views.my_requests` endpoint is not connected as a distinct My Requests mode. Existing backend tests are reusable evidence only for their precise clauses, not proof that these missing screens work.

## Requirements retained

All 17 S3 IDs remain allocated unchanged in `reference-coverage.csv`:

| IDs | Required outcome | Delivery slice |
|---|---|---|
| REQ-001, REQ-002, REQ-003 | Scoped position selection, complete HR-REC-F02 fields, several locations in one request | 1 — Full request form |
| HC-003, HC-004, HC-005, HC-006 | Guidance and any positive requested quantity; independent shortage exception; no double counting; explicit configured WARN/BLOCK behavior | 1 + 2 — Form and route preview |
| REQ-004, REQ-005, ORG-006 | Effective structure chain, missing-level/self-interest handling, CEO rules/routing and stable approved Position IDs | 2 — Route explanation and authority |
| REQ-006, REQ-008, REQ-011 | HR actions, reasoned return/revision, approved corrections and required reapproval | 3 — Request operations |
| ORG-005, BRD-001 | Dated process-specific delegation and independent CEO/Board decision evidence | 4 — Delegation and Board |
| REQ-009, REQ-010 | What each approver actually saw, immutable versions, request timeline and My Requests | 5 — Review history and acceptance |

ORG-006's structural portal already has S2 evidence. Reuse it and test its integration with recruitment routes; do not invent a second structural workflow. Preserve later reference policy corrections in `docs/phases_0_3/POLICY_DECISIONS.md`, including Reserved in availability, 90-inclusive-day delegation limits and the quantity-increase versus ordinary HR correction distinction. Do not infer HR sign-off from implementation.

## Slice 1 — complete form and readable details

1. Extract the request form from the large `main.tsx` component into a dedicated typed component. Preserve draft identity, retry command ID, stale-version handling and S1 pending-revision behavior.
2. Expose all current editable business fields individually: need reason (four schema values), replacement employee when applicable, employment type, qualifications, skills, experience, working conditions, requested priority, required date, exception justification, position and per-location quantities. Keep existing free-text employment type semantics unless HR deliberately approves a controlled list. Do not silently combine qualifications with an invented justification field.
3. Add bounded, searchable position/capacity choices and a narrowly projected replacement selector. Reuse native Position/Capacity permissions and current management scope. Replacement selection is an explicitly limited recruitment identity directory: require an allowed recruitment role, current management scope, selected company/department and native Employee User Permissions. Full Employee profile read permission is separate and is not granted by this directory. Return only a stable identifier and permitted display label, never contact, pay or private profile data. Handle linked values that became restricted without disclosing them or silently clearing saved values.
4. Validate selected references on the server, including guessed replacement IDs and native REST paths. New/changed replacement references now use the same limited identity policy on native draft saves, in addition to company/department validation. Existing unchanged restricted references are preserved and redacted in the custom portal; native User Permissions may instead deny reading the entire linked request. HR/IT role configuration and the full replacement approval route remain separate acceptance work. A hidden option is not a security boundary.
5. Display every permitted field in review-before-submit and saved request detail. Distinguish requested, proposed and approved quantities and present headcount values with their recorded/as-of basis. Do not cap input at available seats: the authoritative policy decides whether a justified exception may proceed.
6. Preserve user-entered AR/EN text and meaningful empty states. Any unavailable current link gets a clear restricted/unavailable state, not a mismatched substituted option.

**Evidence required:** AR and EN create/save/reload/edit/submit with every field, Replacement and multi-location examples, immutable submitted records, failed-validation input retention, duplicate/stale retries, outside-scope and native User Permission denials, large selector pagination without omissions, and no disclosure of Employee private fields. Rerun the original hiring journey and pending revision screens after extracting the form.

## Slice 2 — understandable route and headcount preview

**Engineering implementation:** `portal/route_preview.py` and `RoutePreview.tsx` now connect the current request content to the actual resolver without saving its in-memory snapshot. Current approver scope is also preflighted. See the checkpoint for tests and open acceptance. Later HR decisions can still add authority; initial preview is advisory.

Reuse recruitment `resolve_chain`, `route_config`, `authority.enforce_chain`, current organization route resolution and the configured headcount policy. Existing route helpers use locking/current reads and set an in-memory snapshot; inspect their side effects before using them behind a read-only adapter. A preview must not reserve seats, change occupancy, create openings, send notices or persist an approval snapshot.

Show the resolved current route, available/occupied/reserved/open figures, shortage/exception authority, skipped structure levels, conflicts of interest and actionable missing-authority errors. Reveal principals only within the caller's authorized request context. Explain that preview is advisory: submission locks and revalidates current policy/structure/capacity and freezes the actual route. A stale preview cannot authorize an outdated route.

**Evidence required:** actual dated hierarchy/rule boundaries, self-interest rerouting and fail-closed missing/disabled authority; WARN/BLOCK and all-location rollback; compare preview with the eventual submitted snapshot; assert that preview does not mutate business/audit/notification counts. Do not replace server policy with frontend calculations.

## Slice 3 — complete HR request actions

**Engineering implementation:** `portal/request_operations.py` and `RequestOperations.tsx` now connect all actions below with bounded inputs, current authority checks, minimal receipt results and bilingual review-before-confirmation. The amendment form and preview preserve zero-quantity original locations. See the slice 3 checkpoint; complete frozen history is still slice 5.

Connect the existing domain APIs through explicit permission/stage-specific capabilities:

- `recruitment.api.review`: proposed quantities and HR priority with reason.
- `send_to_ceo`: add an independent CEO step while retaining the current pending HR decision, with a required reason.
- `cancel_request`: eligible draft/returned/pending/approved cancellation with ledger consequences.
- `revise`: returned request revision, prior decisions retained.
- `amend`: linked increase requiring reapproval, retaining the approved parent.
- `recruitment.corrections.correct_approved`: permitted non-increase corrections with reason, revision and requester notice, never decreasing below actual joins.
- `recruitment.pending_revision.revise_pending_quantities`: preserve the completed S1 behavior and exact 2→3 delta logic.

Review each command's current signature/authority before wiring. Use `command_id`, `expected_version`, exact `step_id` and the existing transaction/receipt logic. Do not return unrestricted native documents to simplify UI work. Capture unknown outcomes and retry safely; a response timeout is not proof of rollback.

**Evidence required:** each visible action succeeds at the correct role/stage; direct API misuse is denied; approved amendments top up existing openings exactly once; cancelled/rejected/returned requests release only their commitments; frozen prior snapshots remain byte-identical. Include actual simultaneous decisions and stale-screen failures.

## Slice 4 — delegation and Board evidence

**Delegation engineering checkpoint:** [S3 delegation checkpoint](S3_DELEGATION_CHECKPOINT.md) records the connected AR/EN screens and guarded adapters. Board evidence remains unimplemented in the custom portal, so this slice and S3-03 remain in progress.

Connect existing `foundation/delegation.py` rules through guarded portal adapters and bilingual screens for create/read/revise/revoke and CEO decisions. New versions preserve history; authority cannot be edited in place. Keep process scope, company/department, inclusive effective dates, independent CEO approval, immediate revocation and disabled-account behavior.

Use `recruitment.authority.authorize_board` and the existing Board evidence fields for Chairman/Vice and authorized on-behalf cases after CEO. Inspect private-file access and every principal/beneficiary/actor relationship. A text box claiming approval is not authorization. Production MFA/CEO identity choice remains an IT/security acceptance gate.

**Evidence required:** ordinary personal CEO/Board/delegate sessions; expiry/from-date boundaries and 90/91-day cases; process isolation; self-delegation and self-interest denial; revocation between viewing and submitting; evidence upload/read authorization and repeat-command behavior.

## Slice 5 — My Requests and frozen review history

Add server-filtered My Requests / All within my scope modes with search and pagination. Do not filter a single downloaded page and claim complete totals. Reuse the native own-only query behavior, with explicit current-scope revalidation and bounded response envelopes.

Expose immutable submitted revision and decision snapshots through field-allowlisted projections. Compare original requested content/quantities with the version each principal reviewed, including a subsequent HR edit or changed company policy. Keep confidential HR notes separate; request access must never grant private-note access. Audit existing sensitive reference fields and retain historical values only when authorized. Do not regenerate an old route from current structure.

**Evidence required:** requester/manager/HR own-versus-authorized counts across pages, native/raw resource/export denials, original snapshots unchanged after revision/correction/policy changes, current revocation, guessed event/revision IDs and Arabic/English review clarity.

## Integration order and completion gate

Implement slices 1 → 2 → 3, then 4/5 against the settled contracts. Independent documentation/read-only reviews may overlap; all tests that mutate the shared parity database run serially. No parallel agents are started by this brief. Each slice gets source, tests, screenshots where useful, cleanup proof, tracker update and a verified GitHub checkpoint.

S3 is complete only when all mapped clauses have role-specific positive/negative evidence and the integrated portal journey passes, not merely when native APIs exist. Do not substitute a small UI test for the full security/capacity acceptance. Preserve the separate S11 1,500-account dataset / measured concurrency and soak plan, and S12 approved migration/release. The entire 98-requirement goal remains active.
