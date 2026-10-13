# S4 vacancy lifecycle and priority controls

13 October 2026. **Engineering verification recorded below; this is not a release approval.** This increment connects vacancy state changes and temporary priority pins to the custom AR/EN portal. It preserves the frozen 98 requirements; S4 remains in progress.

## What changes

An authorized recruiter opens **Vacancies → Manage vacancy / الشواغر ← إدارة الشاغر**. The server returns the current state, parent request version, approved/joined/closed/remaining quantities, current Cairo date and permitted transitions. The user chooses an action, enters a reason and reviews its effects before confirmation. Nothing is selected by default.

The portal supports Open, Hold, Resume, Freeze, Unfreeze, Close and Cancel for the selected location. Pause/freeze preserve allocated capacity; restoring a frozen held vacancy returns it to On Hold. Close/cancel release only unfilled remaining seats and preserve actual joiners. The last completed/closed location closes its parent request. This is location cancellation; cancellation of the whole request remains the request command. Terminal vacancies cannot be reopened by these controls.

Unresolved candidate or offer commitments block closure in the review and again at execution. The review returns a boolean warning, without candidate identities. The backend remains authoritative if permissions, state, candidates or headcount change after review. Invalid stored restore states cannot be used to reopen terminal records.

Pinning requires a reason and a valid current/future ISO date. The boost lasts through the chosen Cairo date; held/frozen openings retain zero priority. Removing a pin does not change headcount. Expiry is evaluated by the existing priority function, without a read-side database mutation. A closed location can no longer have its pin changed merely because another location keeps the parent request open.

## Architecture and security

`recruitment/vacancies.py::lifecycle_targets` is shared by the read-only portal context and the existing transactional commands. `portal/vacancy_operations.py` checks the ordinary session, native opening/parent permissions, exact request/location relationship, recruiter role and full management scope. The browser receives neither service credentials nor a separate authority to mutate capacity.

Writes continue through `set_state` and `pin`, with current authority checks, parent revision checks, locked headcount and immutable audit/command receipts. A lost response freezes edited input and retries the same command identity. Invalid reasons, dates, actions and restore metadata receive controlled validation errors. The UI explains released positions and whether the parent will close before submitting.

## Evidence

- [65 native checks](evidence/s2-regression-1aa108264075.json) passed: 13 new lifecycle/review cases, 26 recruitment-command regressions, 15 queue cases and 11 joining cases. The 13 include a real synthetic joined offer/Employee/Assignment followed by closure of only the remaining seat, with occupied capacity and employee/assignment preserved. These native tests roll back their fixtures.
- [91 lifecycle browser checks](../portal/evidence/vacancy-operations-08de66d5470b/results.json) passed in ordinary role sessions: every lifecycle/pin action in EN desktop and AR mobile; read-only review; exact seat release; terminal actions absent; lost pin response and identical-command retry; unresolved commitment UI and direct-command denial; outsider denial; stale UI rejection; simultaneous Hold/Freeze with exactly one success and no headcount change. All six cohort accounts were disabled and capacity ledgers reconciled. No JS errors, HTTP 5xx or external browser requests occurred.
- [Final visual inspection](../portal/evidence/vacancy-operations-08de66d5470b/visual-review.json) covers Arabic mobile closure review and English desktop pin confirmation.
- [24 original hiring-journey checks](../portal/evidence/browser-b0c86604b69a/results.json), with [source and cleanup proof](../portal/evidence/browser-b0c86604b69a/regression.json), passed on a fresh cohort against the final built portal and shared cleanup.
- [27 vacancy-queue regressions](../portal/evidence/vacancies-cff2f841024f/results.json) passed: exact totals/pages/search, assignment/team/state/location filters, explanatory priority, outsider denial and live grant revocation. Its six accounts were disabled and all capacity ledgers reconciled.

That is **142 final browser checks** across three separate cohorts, alongside the 65 native cases. The native run preceded the new browser fixture and shared Closed-parent cleanup adjustment; all product Python and native test files remain identical to that native run. The final browser runs verify the new cleanup path as well as existing paths. TypeScript/Vite compilation and whitespace checks passed; dependency pins and the frozen reference hash remain unchanged.

The shared browser cleanup now recognizes an already Closed synthetic parent and preserves its history, while still requiring every cohort ledger to reconcile to zero and every test account to be disabled. It does not reopen closed requests or erase audit history for cleanup.

## How to review

Open `http://localhost:8102/hr-portal`, sign in with an ordinary synthetic recruiter account with management scope, and choose **Vacancies → Manage vacancy**. Select an action, enter its reason, review the effects and confirm. For a pin, choose its final Cairo date. A stale action requires returning to the queue and reopening the vacancy to review current state. A lost response offers the same confirmation again with input locked.

Completed automated test cohorts are retired, not permanent demo accounts. Existing private personal review credentials remain outside GitHub; no passwords, site configs, real records or uploads are included in this checkpoint.

## Remaining scope

Company-wide dashboard counts/search, searchable organization filter selectors, action inbox, business-calendar reminders, scheduled retry/restart evidence, disabled-recruiter delivery and local email-template capture remain in S4. Candidate workspace and ownership acceptance remain shared with S5. Full joining/onboarding portal acceptance remains S8, despite existing native joining foundations.

Sustained representative load for 1,000+ accounts, independent security assessment, HR terminology/policy/document/UAT acceptance, identity/email provider configuration, recovery and real-data rollout remain separate gates. This checkpoint uses isolated synthetic records, loopback services and muted mail; no upstream core, Odoo or real employee data changes are included.

### Diagnostic evidence retained

Two initial dedicated browser runs, [35cebda6d5bb](../portal/evidence/vacancy-operations-35cebda6d5bb/results.json) and [578f970ed034](../portal/evidence/vacancy-operations-578f970ed034/results.json), passed all EN/AR state, review, capacity and pin-retry assertions before failing the option-disabled assertion. The second run captured the [actual context and DOM options](../portal/evidence/vacancy-operations-578f970ed034/blocked-context.json): the server returned `allowed: false` for Close/Cancel and both native options had `disabled: true`.

A minimal labelled-select reproduction showed Playwright `option.isDisabled()` returning false while the option's native `disabled` and `:disabled` checks were true; without the wrapping label it returned true. The harness now checks the actual option element's two native states. The production control was unchanged. Both failed diagnostic cohorts disabled all six users and reconciled all capacity ledgers; no JavaScript errors or HTTP 5xx occurred.
