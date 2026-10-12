# S3 slice 2 — approval and headcount preview

13 October 2026. This checkpoint adds a connected advisory preview to the request wizard. It does not complete S3 or certify HR/IT production acceptance.

## User experience

On Review & submit, the portal automatically evaluates the currently entered request. It shows the expected ordered authorities and names, vacant levels or personal-interest exclusions, and per-location structural, occupied, reserved, open, available, requested, additional-demand and shortage figures. A refresh button reads current policy/authority again. Arabic RTL/mobile and English use the same server response contract and show evaluation time in Cairo.

A BLOCK shortage, missing WARN explanation, unresolved imported occupancy or invalid authority configuration is shown as a blocker. A justified WARN shortage shows its independent exception authority. Missing/disabled/out-of-scope approvers produce a configuration explanation without returning a misleading partial route. The preview is advisory: it does not authorize submission, freeze an approval chain or reserve seats. The existing submission command remains authoritative and may reject an outdated preview. Saving a draft remains available; the preview does not remove normal command denial/audit behavior.

## Implementation and boundaries

- `kandil_hr/portal/route_preview.py` accepts the same allowlisted editable fields as draft saving, with bounded location count and request size. Shared parsing is extracted into `portal.api.editable_payload`; command-ID/replay logic stays in the save command.
- This is a POST with personal session and CSRF, keeping editable HR text out of URLs. Guest, wrong HTTP method, missing CSRF, forbidden fields, native reference restrictions, wrong owner/stage, stale saved version and revoked scope are denied.
- Current company/domain reads and permissions are checked before the route or capacity projection. New and changed replacement references retain the limited identity policy from slice 1.
- `occupancy.values` computes dated occupancy without calling the mutating `refresh_locked` path. Unresolved imported occupancy is made explicit. An amendment counts only the increase above its approved parent.
- The actual `route_config`, `resolve_chain` and personal-interest policy run against an in-memory proposal. The proposal's route snapshot is never saved. Only route labels/principals, skipped level/reason, public policy and capacity figures are projected; full interest sets, beneficiary details, rule reasons and raw snapshots are not returned.
- Required approvers receive an additional current role/scope preflight for every location. This flags an unusable authority early; it does not confer decision authority. The actual decision command separately revalidates current authority and scope.
- Preview response changes remove prior displayed data. Late responses from an obsolete form are ignored. A network/access failure displays an error rather than retaining an apparently usable old route.
- Native tests intercept SQL writes and forbid explicit commits during preview, and compare request/ledger state and business/audit/outbox counts before and after. Browser tests inspect the isolated cohort before and after the ordinary-session scenarios.

## Verification record

| Check | Result | Evidence |
|---|---|---|
| Native preview 15 + portal API 11 + full form 8 + headcount/routing 9 + commands 26 | 69 passed, source unchanged | [Native regression](evidence/s2-regression-1577649abe12.json) |
| Real EN desktop and AR mobile preview, CSRF/method/access checks | 22 passed, cleanup complete | [Preview browser](../portal/evidence/route-preview-e7dca9d75513/results.json) |
| Full form save/reload/edit/submit, replacement and two locations | 25 passed, cleanup complete | [Form browser](../portal/evidence/request-form-59862eb9ce2d/results.json) |
| Existing request → manager/HR approval → vacancy and returned-revision journey | 24 passed, source unchanged and cleanup complete | [Original journey](../portal/evidence/browser-5ac6ee7ef3c5/regression.json) |
| Direct final screenshot inspection | Passed for captured views | [Visual review](../portal/evidence/route-preview-e7dca9d75513/visual-review.json) |

The final production build passed with 40 modules. Native tests verify no SQL business writes or explicit commit during successful and blocked previews. The preview browser scenarios leave request, event, revision, ledger and outbox state identical; six cohort accounts are disabled during cleanup. These checks do not constitute full S3, performance or production acceptance.

Native `4ad76383a477`: the initial disabled-approver case returned a PermissionError from the route resolver. It now becomes a fail-closed configuration issue inside the already-authorized preview; caller authorization remains outside that catch. Native `72f4d6a6f776` passed every case but detected a newly added test-fixture file during execution, so it remains FAIL/source changed and is not final evidence.

Browser `a9ecc418f266` and `d978cdbd10bc` failed before preview because the new test inspector used incorrect schema columns. The inspector now follows Recruitment Event → request and Outbox → recipient. Both cohorts were cleaned: six accounts disabled and all ledgers zero. No business validation or security assertion was removed to pass these checks.

## Remaining work

Next is slice 3: connect the existing HR review, CEO handoff, cancellation, approved correction and linked-increase commands through explicit stage/role capabilities, retaining requested/proposed/approved histories and safe replay. Delegation, Board evidence and full frozen-history screens follow.

A preview is not approval. Later HR action or expiry rules can add authority; the initial preview does not predict all future decisions. This checkpoint does not authorize changes to real approval people, imported occupancy, external sending or production permissions. HR/IT role configuration (including linked replacement Employee visibility), terminology/UAT, S2 document acceptance, independent security/MFA/audit custody, load and recovery testing, hosting and real-data rollout remain open. All 98 frozen IDs and the historical 80-case 72 passed / 4 partial / 4 blocked register are preserved.
