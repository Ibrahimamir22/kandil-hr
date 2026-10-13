# S3 — saved request versions and pre-decision comparisons

13 October 2026. The AR/EN portal now connects immutable saved request versions and comparison with the content actually reviewed before a selected decision. This extends the existing command before/after view. S3 and the complete HR goal remain in progress.

## Review it locally

Open `http://localhost:8102/hr-portal` using a synthetic ordinary-role account. Choose **Hiring requests**, open a permitted request, then **View review history / عرض سجل المراجعات**.

1. Select **Browse saved versions / عرض النسخ المحفوظة**. Each saved action has its own record; several can belong to the same numbered revision.
2. Choose the original **Submitted / إرسال للاعتماد** snapshot, or another saved version. Expand **Saved version details / تفاصيل النسخة المحفوظة** for recorded fields, quantities, steps and policy.
3. Select an approval, return or rejection decision in the command history above. Choose **Compare with reviewed content / قارن بما راجعه صاحب القرار**.
4. The left side is the selected saved version. The right side is the selected decision's exact recorded BEFORE content. The actual decision and resulting request status are shown separately; approval can leave a request Pending for another authority.
5. Comparing different revision numbers shows a warning. Original requested quantities remain distinct from HR's later proposal. Selecting a non-decision clears the comparison and disables its action. Refresh clears earlier selections rather than continuing to display stale history.

This is a read-only view. It does not rerun policies, modify old records, recalculate headcount or make an approval.

## Source and authorization

`portal/request_revisions.py` provides authenticated GET `revisions`, `revision` and `compare`; the API contract documents parameters and response meaning. Every call reauthorizes the current request, scopes selected record IDs to that exact request/company, verifies snapshot metadata and checks historical and current reference access through the existing command-history projection. Restricted replacement identities, amendment references and Board evidence use that projection's existing redaction rules. Raw snapshot JSON, command envelopes and private receipts are not returned.

Historical branch data is borrowed only from a command AFTER capture whose complete snapshot matches the saved version. The two existing serializers differ in datetime formatting: saved revisions use a space and audit captures use `T`. Only declared datetime fields normalize this difference; all other fields, free text, route JSON and types stay exact. A timestamp or revision-number match alone is insufficient. Two timestamp candidates are treated as ambiguous and denied. Missing exact captures require department-wide legacy access, keep unknown locations null and explicitly mark the capture partial. Today's position/branch is never relabelled as a historical fact.

Lists fetch at most 100 candidate snapshots per page and omit inaccessible rows; an empty page may still have a next page. No unrestricted count is claimed. A source-controlled post-model-sync patch adds `request_command_history` and `request_saved_history` composite indexes. The patch was applied on the synthetic parity site and its index columns are asserted by native tests. This supports per-request lookup; sustained production workload remains unproven.

`HistoryCapture.tsx` shares the field/quantity/step/policy presentation across command and saved-version comparisons. `RequestRevisions.tsx` owns bounded listing, selection, explicit comparison, loading/errors, stale-response cancellation and reset behavior. The current command view remains available. Arabic/English strings and RTL layout are included.

## Final verification

| Evidence | Checks | Scope |
|---|---:|---|
| [Final native](evidence/s2-regression-06239da79727.json) | 50 | 14 saved-version/index cases, 14 existing command-history cases, 15 native historical-access cases, 7 recruitment acceptance cases |
| [Focused browser](../portal/evidence/request-history-db0d5ad8bb14/results.json) | 79 | English desktop and Arabic mobile; version selection, actual reviewed quantities, cross-revision warning, forbidden IDs/scopes, existing command views and native snapshot protections |
| [Original browser journey](../portal/evidence/browser-f83f595c85fe/regression.json) and [checks](../portal/evidence/browser-f83f595c85fe/results.json) | 24 | Existing request, approval, headcount and vacancy flow |
| [Visual review](../portal/evidence/request-history-db0d5ad8bb14/visual-review.json) | 2 inspected captures | Arabic before/after columns and English full comparison, outcomes, quantities and reviewed step |

Final browser total is **103** checks. Both browser cohorts disabled all six fixture accounts, reconciled ledgers to zero and retained history. No external browser requests, JS errors or server failures were observed by the focused harness. Final native and focused browser fingerprints match source. Earlier passing native runs (`9c30599c3f22`, `9a61e35095bc`, `2339ab7c6f97`) are intermediate evidence, not additional unique checks. The final TypeScript/Vite build passed with 47 modules; existing local-font paths resolve at runtime rather than build time.

The 14 new native cases cover exact recorded location matching, ordinary manager/HR access, multiple actions in one revision, requested-versus-HR-reviewed quantity comparison, return/revise retention, cross-revision labels, foreign IDs/non-decisions, missing capture fallback, historical scope plus current User Permissions, revocation/Guest, malformed metadata/nested data, restricted references, both installed composite indexes, bounded pagination and no read mutations.

## Migration and source boundaries

`kandil_hr.foundation.request_history_indexes` is registered in `patches.txt` after model sync. Deployments need their normal migration to install both indexes, then web reload for the new endpoints. This turn applied only that index patch to `kandil-parity.localhost`. Other local sites were not migrated. No upstream Frappe, HRMS or ERPNext source/pin changed. Production hosting, real records and outgoing email remain outside this checkpoint.

## Diagnostics

The first native run (`8ec982ba1bdb`) exposed the existing timestamp-format difference: exact semantic snapshot matches were mistakenly marked legacy. A separate test serialization assertion needed `default=str` for returned native creation datetimes. The implementation now normalizes only declared datetime fields before strict full-content matching. Later passing native runs preserve the deliberate mismatched-title test, which must remain partial/denied for branch-only access. A build command was initially launched from the frontend directory with app-relative edit paths; those edits did not run. They were then applied from the app root, and the 47-module TypeScript/Vite build passed.

## Remaining scope

Standalone saved-version navigation and selected saved-version/pre-decision comparisons are now implemented. Full S3 still needs expanded delegated/CEO/Board/correction/pending-quantity history acceptance, explicit historical route-rationale projection and useful linked-amendment navigation. Remaining native nested-route/reference/File/reporting paths from the native-history checkpoint are not certified by this projected view. Do not remove those gates or infer comprehensive security from the tests here.

All 98 reference requirements and their original acceptance definitions remain intact. Independent security, HR/IT/UAT acceptance, sustained capacity for 1,000+ accounts, recovery, hosting and real-data rollout remain explicit release gates. Odoo and other company modules remain outside this HR goal.
