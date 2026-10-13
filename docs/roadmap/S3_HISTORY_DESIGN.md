# S3 remaining frozen-history implementation

Inspected against the current source on 13 October 2026. This remains the full implementation contract. The modern command before/after adapter and AR/EN review screen are now implemented in `portal/request_history.py` and `RequestHistory.tsx`; see [command-history checkpoint](S3_COMMAND_HISTORY_CHECKPOINT.md). The first native scope/embedded-snapshot guards are recorded in [native history checkpoint](S3_NATIVE_HISTORY_CHECKPOINT.md). Standalone immutable revision navigation and selected saved-version/pre-decision comparison are connected in the [revision checkpoint](S3_REVISION_CHECKPOINT.md). Expanded delegated/CEO/Board, correction and pending-quantity history coverage is recorded in the [authority-history checkpoint](S3_AUTHORITY_HISTORY_CHECKPOINT.md). The [native-read audit](S3_NATIVE_READ_AUDIT.md) verifies direct revision-attached File metadata/detail/download restrictions and native report/export gates. Nested raw references, Event/indirect-file paths and integrated acceptance are not yet complete.

## Current evidence and sources

- `recruitment.api.snapshot` appends immutable `Kandil Request Revision` rows after native transitions. A revision contains the explicit shared snapshot schema, including the frozen route and approval outcomes. Return/revise preserves old rows and replaces the current child steps.
- `privacy.shared_snapshot` deliberately excludes unknown/salary/HR-note fields and nested `reviewed_snapshot` strings. Do not add those nested strings to every shared snapshot: repeated decisions would duplicate recursive history and increase disclosure risk.
- The native decision stores `reviewed_snapshot` on its current approval step. This is an exact source while that step is retained; a later revision clears current steps. Do not imply every old revision row contains that exact pre-decision payload.
- Modern `Kandil Command Audit` envelopes retain explicit before/after request projections for recruitment commands. These are private, not client-readable records. A guarded history adapter may read only the authorized request's exact envelope and project reviewed fields.
- The existing timeline returns original events with pagination and a sanitized HR-correction reason. It is not the complete reviewed-content comparison.

## Required adapter behavior

1. Authorize the current request with `portal.api.read_request` on every list/detail/compare request. Scope a selected revision/event/command ID to that exact request and company before any projection.
2. Paginate immutable revision metadata and decision-command metadata on the server. Do not return raw JSON envelopes, command receipts or HR notes. Distinguish request revision numbers from multiple snapshots within the same revision.
3. Project only agreed public request fields, quantity rows and frozen routing/decision fields. Validate historical company, department, requested position and every recorded location against the current reader's permissions. Apply current Employee reference restrictions; omit inaccessible IDs and expose an explicit restricted marker.
4. Use the original stored submission and the exact recorded pre-decision command snapshot for comparisons. Mark capture missing/unavailable for legacy records; never reconstruct old facts from current policy, current organizational structure or the latest request.
5. Prefer recorded branch/location identity where captured. Current Capacity/Position metadata alone does not prove historical location identity if a record moved. Fail closed or mark an incomplete capture rather than quietly relabelling old history.
6. Show original requested quantities, quantities reviewed by that actor, resulting decision and actor/principal distinction, plus corrections and revision links. Historical Board evidence keeps the same private File checks as the Board adapter.
7. Preserve existing native authorized history contracts where safe. Existing acceptance expects authorized requesters/managers/HR to read immutable shared revisions. Do not replace those tests with blanket denial. Audit native direct-read/list/export surfaces for historical scope/reference disclosure and cover any required hardening with positive and negative regression evidence.

## Required proof before S3 history closes

Ordinary requester/manager/HR/Board and outside-scope sessions; changed organization policy after submission; HR quantity changes between approvals; return/revise/resubmit; approved corrections; hidden replacement employees; scope revocation; guessed history IDs; native resource/export denials where appropriate; stored bytes unchanged; AR/EN mobile/desktop comparison clarity. Missing captures, restricted records and empty history must be distinguishable. S3 remains in progress until these requirements and the integrated journey are verified.

## Remaining after the saved-revision increment

- Immutable Request Revision metadata/detail and exact command capture matching are implemented. Keep legacy missing captures explicitly partial; do not fabricate pre-decision records. Expanded authority/correction screen evidence is now recorded in the authority-history checkpoint; keep HR acceptance separate.
- Submitted-version versus selected-decision comparison across commands and across revision numbers is implemented. Permission-checked linked-amendment navigation is implemented; correction/pending-quantity comparisons now have native and ordinary-session AR/EN evidence.
- The initial native Revision scope/current-reference checks and nested snapshot field protections are implemented. Complete the remaining nested-route/reference/File/reporting audit and hardening. The new adapter filters its own output; this does not prove that existing native legacy endpoints meet historical-scope and restricted-reference requirements. Preserve positive authorized immutable-byte contracts where disclosure is safe.
- Ordinary-session history coverage now includes delegated/CEO/Board decisions and retained evidence across revisions and HR correction. Existing Board action tests remain separate from these read-only history-screen tests.
- Captured dated rules and skipped authority reasons now have an explicit projection shared by command and saved-version views. Excluded users/assignments and unproven historical position identities remain private; no current rerouting is presented as history. Expanded authority/correction browser checks passed; native raw-history surfaces remain a separate audit.

New recruitment command envelopes also capture the requested Position alongside capacities. Old envelopes are never rewritten. Old missing location context is explicitly partial and requires current department-wide scope; narrow-branch readers cannot rely on today's location to infer historical authorization.
