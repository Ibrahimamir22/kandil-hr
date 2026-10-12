# S2 individual employee-position changes — HR + CEO route

Date: 2026-10-13. Engineering checkpoint, synthetic local site only. S2 and the overall goal remain in progress.

## User decision and scope

The user explicitly selected **HR + CEO approval for individual employee-position changes**. This supersedes the earlier ability of authorized HR to create/end assignment records directly. One individual change is reviewed per request; it cannot be mixed with bulk structure operations. Existing reviewed baseline imports and approved recruitment joining/reversal are separate server-controlled workflows and retain their own reviewed rules.

This changes **dated position assignments**, not every field on the standard Employee profile. It does not silently rewrite Employee.department/branch, payroll, employment terms, Odoo, or external identity accounts. Future assignments become effective through date-based reads. The capacity service refreshes current occupancy when used; this is not a new midnight scheduling service. Broader employee lifecycle/profile synchronization remains in S9 and requires an explicit field-ownership contract.

## What the user sees

Open `http://localhost:8102/hr-portal`, then **Structure changes / تغييرات الهيكل → New change / تغيير جديد**.

| Operation | Input | Result after independent HR then CEO approval |
|---|---|---|
| Assign employee / إسناد موظف لمنصب | Active position, readable employee, Primary/Acting, effective date, optional end, reason | A new dated assignment; primary occupancy updates only when effective |
| End assignment / إنهاء إسناد موظف | Position, assignment, effective date, reason | The same episode ends on the effective date **inclusive**; identity/start are retained |
| Transfer employee / نقل موظف | Source position/assignment, destination, effective date, optional end, reason | Source ends the previous day; a separate destination episode starts on the effective date |

Save → prepare preview → review → submit → independent HR → independent CEO. Author and affected employee cannot approve their own change. If the configured HR/CEO is the author or subject, the proposal cannot be submitted using that route; there is no silent authority substitution.

Authors need whole-company management scope plus native Employee/Assignment read access. Native User Permissions still restrict selectable people and guessed IDs. Reviewers use existing organization review permissions; the review projects the selected employee identifier and assignment dates/allocation, not the employee profile, salary, private user data or the full audit envelope. The author selector shows the readable employee name and identifier. Reviewer identity presentation currently uses employee identifiers; HR should review terminology/usability before acceptance.

## Server guarantees in this slice

- Ordinary native REST create/edit and Desk saves cannot bypass the reviewed assignment route. The server-only transition remains available to existing reviewed imports/joining and trusted CLI synthetic seeders.
- Company locking, optimistic versions, personal command receipts and exact decision audit envelopes reuse the existing structure workflow. Final approval applies assignment records, ledgers and snapshot in one transaction.
- The reviewed hash includes current employee eligibility, linked user identity/enabled state, dated assignments and capacity commitments. Changed prerequisites require return and fresh review.
- Cross-company targets, inactive/voided employees, disabled linked accounts, dates before joining, dates after relieving, past effective dates, primary overlaps, acting-authority overlaps, same-position transfers, same-start-day transfers and invalid episode endings are rejected.
- New primary assignment destinations must fit structural seats **after** reserved/open recruitment commitments. Unmatched legacy occupancy is rejected for independent reconciliation; it is never silently reset.
- Transfer preserves the source episode. End dates are inclusive. An existing finite end is retained by default on transfer unless explicitly replaced. HR must verify these date semantics during acceptance.
- Frozen submitted comparisons include assignment before-values from the immutable submission audit. New/source assignments and both affected capacities are included in command audit related state.

## Verification

- Final native run: [83 checks passed across seven suites](evidence/s2-regression-012b73e818c7.json), source unchanged: 18 individual-assignment checks, 11 joining, 11 joining-correction, 13 imports, 10 structural commands, 9 organization reads and 11 portal commands.
- Final assignment browser/API journey: [18 checks passed](../portal/evidence/assignments-2118251b82d9/results.json), including actual independent sessions, native REST create/edit denial, branch-scope denial and real simultaneous duplicate final approvals producing one effect/audit.
- [Arabic mobile](../portal/evidence/assignments-2118251b82d9/review-ar-mobile.png) and [English desktop](../portal/evidence/assignments-2118251b82d9/transfer-en.png) screenshots were visually inspected. The allocation being approved is explicitly visible and translated.
- Existing structural browser regression: [21 checks passed](../portal/evidence/structure-d74ec1787e5c/results.json). Existing hiring-to-vacancy browser regression: [24 checks passed](../portal/evidence/browser-a902601d8877/results.json), with [source/cleanup record](../portal/evidence/browser-a902601d8877/regression.json).
- TypeScript checking and Vite build pass (34 modules). Runtime font URLs are served from the local app.
- Intermediate attempts are retained. Native runs caught an over-broad helper replacement affecting imports, synthetic own-employee User Permissions, synthetic user-creation throttling, and the need to preserve reviewed joining plus trusted later-episode fixture setup under the new direct-write guard. These were fixed and the final full affected run passed; the policy guard was not weakened.
- Browser harness attempts are also retained: a stale reviewer list and uncaught response wait (`64b0d64e1b91`, separately cleaned up), duplicate synthetic reason labels (`2039a49bcf6f`), and a JSON property-order comparison in the repeated-decision assertion (`a446ab172a68`). Final verification uses refreshed scoped lists, distinct reasons and semantic object equality. Every failed cohort's six accounts were retired; historical/future synthetic episodes were retained.
- Future synthetic assignments have zero **current-date** occupancy at cleanup, not a claim that occupancy stays zero for all dates. Current-date transfer/decrement/increment is separately covered by native rollback tests.

## Remaining gates

- Full S2 JD editor/approvals, weighted and monitoring KPIs, document views, complete history/differences and HR review.
- A real business scenario review of individual changes, including people who themselves occupy HR/CEO authority positions; replacement authority policy is not invented.
- Security review, identity/MFA, sustained load/capacity proof for 1,000+ accounts, monitoring, recovery, hosting, migration and HR/IT production acceptance.
- Re-run older broad acceptance scenarios whose positive fixture setup depended on direct assignment writes before claiming their entire historical baseline is current. This slice runs the affected suites listed in its evidence, not every older suite.
- The frozen 98 requirement IDs and historical 72 passed / 4 partial / 4 blocked baseline are unchanged by this increment.
