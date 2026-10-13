# S3 — captured approval reasons and amendment navigation

13 October 2026. The AR/EN portal now explains recorded routing decisions and provides permission-checked links between requests and their amendments. Saved versions and command comparisons share the explanation component. S3 and the full 98-requirement HR goal remain in progress.

## Review the behavior

On the isolated synthetic site, open `http://localhost:8102/hr-portal`, then **Hiring requests** and a permitted request.

- **Original request and amendments / الطلب الأصلي والتعديلات** shows accessible linked requests with current titles, states and revision numbers. Open an amendment and use its original-request button to return. These are current relationships, separate from historical comparisons.
- In **View review history / عرض سجل المراجعات**, select a command and expand **Why did the request follow this route? / لماذا اتّبع الطلب هذا المسار؟**. Each side shows its own captured explanation. The same component appears in saved-version details and pre-decision comparisons.
- The explanation includes recorded dates, skipped authority levels and applied dated approval rules. Rule changes made later do not rewrite the original reason. Personal-interest explanations identify the authority level without exposing the excluded users or private assignment references.
- A missing capture, an unrecognized reason, a restricted original request and an empty amendment page have distinct messages. Refresh clears previously displayed links before rechecking access.

## Source and permission boundary

`portal/history_rationale.py` projects the recorded route JSON, validates the projected types and omits private raw interest/assignment/rule identifiers. `HistoryCapture.tsx` renders it in Arabic/English. No policy engine is rerun and no historical bytes are changed. Saved-version capture lookup excludes the `amend` command: it creates a child and leaves the parent unchanged, so its duplicate parent AFTER timestamp must not hide the original approved version. Commands that actually save the parent still require strict complete matching and fail closed on ambiguity.

`portal/request_links.py` reauthorizes the selected request, original and each amendment. Children use native permission-filtered listing before bounded pagination (20 default, 100 maximum). The parent must be accessible in the same company; otherwise its ID/title are withheld. `RequestLinks.tsx` handles navigation, paging, refresh, errors and obsolete responses. It uses the existing personal-session API transport.

The new history tests revealed that CEO/Board roles lacked native read permission for Capacity references. The source-controlled `foundation.approver_capacity_access` patch grants read/select only, retaining current scope hooks and native User Permissions. Frappe Custom DocPerm defaults export on, so the patch explicitly turns export and other elevated flags off for these two application-owned rules. It does not change other roles or create any Access Grants. Live headcount recalculation retains its existing operational-role boundary through a shared check in the action hints and preview endpoint; Board/CEO reference read access alone does not enable that action. Installation setup calls the same idempotent function. The patch was applied only on `kandil-parity.localhost`; other sites and upstream source were not changed.

## Verification

| Evidence | Checks | Scope |
|---|---:|---|
| [Broader native regression](evidence/s2-regression-a9e97348a1d9.json) | 112 | Navigation, revisions, command history, historical permissions, Board adapters, authority audit, request operations and draft route preview |
| [Final affected native regression](evidence/s2-regression-4889b97ef408.json) | 40 | 15 saved-version cases including retained approved versions after repeated amendments; 11 route/navigation/authority cases; 14 command-history cases |
| [Focused AR/EN browser](../portal/evidence/request-history-55a18226b020/results.json) | 101 | Original and revised history, saved comparisons, frozen dated rule and interest reasons, actual amendment navigation, duplicate-panel regression, restricted/Guest/revoked access |
| [Original browser journey](../portal/evidence/browser-02cf51b48264/regression.json) and [checks](../portal/evidence/browser-02cf51b48264/results.json) | 24 | Existing request, approval, capacity and vacancy workflow |
| [Visual inspection](../portal/evidence/request-history-55a18226b020/visual-review.json) | 4 captures | AR mobile and EN desktop explanations and amendment links |

The final browser total is **125** checks. Both final browser cohorts disabled six synthetic accounts, reconciled ledgers to zero and retained history. The focused harness observed no JavaScript errors, server failures or external browser traffic. Browser fingerprints match the tested source. The 48-module TypeScript/Vite build passed; existing local font paths are resolved at runtime.

Native totals overlap and must not be added: only `request_revisions.py` and its test changed after the broader 112-case pass. The final 40-case run covers that amendment-capture correction and the dependent history/navigation adapters, with unchanged Python fingerprints verified against the final tree. Across these runs there are 113 distinct native cases.

The 11 focused native cases cover current original/child permissions, hidden parent IDs/titles, outsiders/Guests/revocation, bounded pages without mutation, immutable personal-interest and dated-rule reasons, malformed projections, actual delegated actor/principal separation, CEO/recorded Board decisions with private proof, read-only Capacity role/branch/revocation boundaries and native User Permission denial. They do not claim expanded Board/CEO/delegate browser history acceptance.

## Diagnostics retained

- `s2-regression-6fa4b31bb5e5.json`: the original 9-case batch exposed the missing Board Capacity read permission and an incorrect cancellation method in the test. The method is `cancel_request`; the proof projection uses `name`.
- `s2-regression-88f102ee3854.json`: the new negative permission assertion detected Frappe's default export flag. The patch now explicitly sets the elevated flags to zero.
- `s2-regression-caa9bd9ff301.json`: the branch-boundary test attempted to change an immutable grant. It now uses the supported revoke-and-create flow.

- `request-history-3604a9336caa/results.json`: browser navigation found duplicate sibling React keys retaining obsolete panels. Board/history/link components now have distinct keys; the harness asserts a single history/link panel after navigation. The failed cohort was disabled and its ledgers reconciled to zero.
- `s2-regression-bf8eaa4e7b00.json`: history and Board adapters passed, but the existing Board contract detected that reference read permission also enabled live preview. The explicit operational-role check now preserves that denial.

Diagnostic runs are not added to passing totals. Private raw traces and credentials remain outside Git.

## Remaining work

Expand delegated/CEO/Board history screen acceptance, correction and pending-quantity history comparisons, then finish the remaining native nested-route/reference/File/reporting review before S3 closeout. The native authority cases here are not a substitute for ordinary-session screen acceptance. Vacancy, candidate, interview, offer, onboarding/lifecycle and reporting sprint scope remains unchanged.

The 98 frozen reference requirements are retained. HR/IT terminology and UAT, independent security review, sustained capacity for 1,000+ accounts, recovery, production hosting and real-data rollout remain release gates. Odoo and other company modules stay outside this HR goal.
