# S3 slice 3 — HR request actions

13 October 2026. Engineering checkpoint for the custom portal. The full S3 authority/history scope, HR acceptance and production gates remain open.

## What HR and requesters can do

- Active HR reviewers can reduce proposed location quantities, record HR priority and give a reason. The original requested quantities remain visible. HR review does not approve the request; increases still require returned revision or an approved linked amendment as appropriate.
- HR can add an independent CEO approval with a reason. The current HR approval stays pending. The CEO is checked for enabled identity, current company/location authority and personal-interest exclusions; it cannot be an unusable future step silently added to a request.
- The requester or authorized HR can cancel eligible Draft, Returned, Pending or Approved requests. Pending reservations or remaining open seats are released exactly once. Actual joiners and prior records remain. Existing candidate-disposition and active-amendment guards still apply.
- The requester or HR can create a linked amendment to an approved original. The portal opens its real saved draft. Position and location identities are fixed in this UI; quantities are new totals, with zero allowed at a previously reduced location. The preview and submission count only demand above the approved parent. An active amendment blocks conflicting corrections/cancellation of the original. Approval updates the original openings rather than duplicating them.
- Authorized HR can correct the existing allowlisted fields, reduce approved quantities no lower than actual joiners, and relocate remaining unfilled seats to distinct new locations for the same job. A reduction is applied before relocation when combined. Existing native candidate, scope, position and capacity checks remain authoritative. Increases require the linked approval route.
- Returned revisions use the same bounded adapter and then fetch the current permission-filtered draft. Native full-document command results and stored receipt payloads are not exposed by this adapter.

Every new action has a reason and a separate review-before-confirmation screen. Current detail distinguishes requested, proposed, reserved and approved quantities, HR priority and linked parent. Arabic mobile quantity tables use stacked labelled rows so location and before/after amounts remain visible. Correction field labels and priority values are bilingual, and relocation displays explicit source, destination and quantity. The ordinary timeline displays the correction reason; complete frozen before/after review history is still the following S3 slice. Original audit/revision records are not rewritten.

## Technical boundaries

`portal/request_operations.py` provides allowlisted, bounded POST payloads and minimal `{name, operation}` results over the existing recruitment commands. It validates identifier types/lengths and the reviewed timestamp before native dispatch, rejecting malformed metadata as controlled validation errors. It does not implement another workflow or database. Capability hints reflect the native requester/HR cancellation rule, include Returned state and exclude active-amendment conflicts. Native commands still authorize all writes under their existing Company/request/capacity/User order. Exact receipt replay occurs after current access validation even when the successful action has changed the stage.

Native HR review now rejects unknown line IDs and validates the active principal's current scope. CEO routing validates current HR/CEO scope and independent interest, and includes candidate identities before the shared sorted User locks. The cancellation role gate now matches the existing requester-or-HR handler rather than also allowing a sector-only account to reach it.

The personal-session frontend uses existing command IDs, reviewed versions and uncertain-outcome retry behavior. The in-memory retry limit in `PORTAL_API_CONTRACT.md` still applies across page reloads. No claim of durable browser recovery, full 1,000-user performance or production security certification is made here.

## Verification

Native final run `b9f4bb30aa39` passed 89 checks with unchanged Python source: operations 14, preview 15, commands 26, approved corrections 6, routing/headcount 9, portal API 11 and full form 8. These include joined-floor/candidate guards, immutable old snapshots, current/revoked/read-only roles, exact/stale/changed-payload replay, approved reduction/relocation and increment-only amendment application.

The action browser journey includes ordinary requester, manager, HR and CEO sessions, English desktop and Arabic 390px mobile, actual persisted ledger outcomes, two competing HTTP actions and simultaneous exact retries, CSRF/method/guest denials, correction reason privacy and terminal-safe fixture cleanup. This is scoped workflow evidence, not a sustained load test or independent security assessment.

## Final evidence links

| Verification | Result | Evidence |
|---|---|---|
| Native operation/preview/command/correction/routing/API/form suites | 89 passed; unchanged Python source | [Native results](evidence/s2-regression-b9f4bb30aa39.json) |
| New HR actions, competing HTTP requests, exact retries, method/CSRF/guest/malformed-input denials, AR mobile + EN desktop | 53 passed | [Action browser results](../portal/evidence/request-operations-617fb74d7f56/results.json) |
| Original request → approval → vacancy, return/revision, stale decision, mobile denial and logout | 24 passed | [Original journey](../portal/evidence/browser-3c49d9a9033f/regression.json) |
| Full form save/reload/edit/submit, limited replacement reference, two locations | 25 passed | [Form browser](../portal/evidence/request-form-878fc805e372/results.json) |
| Pending quantity success/denial, reservation delta, input retention and reapproval | 16 passed | [Pending revision browser](../portal/evidence/pending-22759b3bec7c/results.json) |
| Visual inspection of captured action/summary views | Scoped review complete; history-label follow-up explicit | [Visual review](../portal/evidence/request-operations-617fb74d7f56/visual-review.json) |

The four final browser suites total 118 checks, with source fingerprints retained in each result. The final TypeScript/Vite build passed (41 modules). Every final browser cohort was cleaned: its accounts were disabled, commitments reconciled and history retained. Fixture cleanup never deletes completed audit/revision history. Upstream pins and all 98 frozen reference IDs are unchanged.

## Diagnostic history retained

- Native `74ea2120531d` found two fixture errors: attempted in-place grant editing, and a shared manager fixture that also carried Recruiter. The suite now revokes/replaces a grant and uses a plain manager role. No production authorization assertion was weakened.
- Native `d9cdb0390da4` passed the initial six affected suites; it predates the amendment preview fix and is not the final source proof.
- Browser `f844dcae1fe5` exposed the real zero-location amendment preview bug. The preview now follows the native amendment rule; originals still require positive quantities. All six fixture accounts were disabled and ledgers reconciled.
- Native `6fa5e8a88ae4` reused a Python input object mutated by Frappe draft construction. The test now serializes its save input like the actual HTTP client; its separate preview payload stays clean.
- Browser `a5bf089c1c58` passed 43 workflow checks. Visual review then found hidden mobile quantity columns and untranslated changed priority values; the UI was improved and retested.
- Browser `87f5a467134e` passed 49 checks after mobile improvements. Visual review also found the amendment review summary omitted its parent link; that display is corrected in the final run.

- Final source review added malformed command metadata guards and a native no-effects test; the browser suite also verifies a malformed action receives a controlled HTTP 417 instead of an internal server error. Valid command receipts and replay semantics are unchanged.

## Next and still open

Connect dated delegation management and Board authority/evidence, then server-filtered My Requests and full permission-filtered frozen request/decision history. That history work must also localize remaining legacy event labels such as `Amendment applied` and `Revision source`; the current timeline is not claimed fully translated or a complete historical comparison screen. Continue preserving all 98 frozen requirements and the historical 80-case register (72 passed / 4 partial / 4 blocked). S3 is not complete.

HR/IT terminology, policy/role configuration including linked Employee visibility, organization document/history acceptance, identity/MFA and audit custody, independent security assessment, capacity/soak and recovery targets, hosting, real-data authorization and production UAT/release remain explicit gates. No external email, Odoo changes or real-data migration was performed.

## How to try it locally

Open `http://localhost:8102/hr-portal` with the existing synthetic review accounts. Create/submit as a requester; approve the department step as its manager. At the HR step, use **Review quantities & priority** (مراجعة الأعداد والأولوية) or **Add CEO approval** (إضافة اعتماد المدير التنفيذي). Review changes, enter a reason and confirm. Adding CEO still requires the HR approval before the CEO decision. After approval, the requester/HR can create a linked amendment and HR can correct/reduce/relocate permitted unfilled seats. Refresh before acting on a record another reviewer changed. Automated-run accounts are disabled after cleanup and are not demonstration credentials.
