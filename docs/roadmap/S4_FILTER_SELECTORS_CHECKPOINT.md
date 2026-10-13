# S4 — searchable vacancy organization filters

13 October 2026. The vacancy portal now offers searchable company, department and location choices instead of requiring users to type exact record names. **31 native and 65 browser checks passed across the runs below. S4 remains in progress.**

## Behavior

- Each selector searches and pages on the server, with 20 choices per page and a hard server limit of 100. The query fetches one extra distinct value to determine whether another page exists. Duplicate openings in the same location do not duplicate choices.
- Choices come exclusively from readable approved/terminal vacancy records across all vacancy states. They are not a company-wide employee or organization directory. Using all states keeps a selected filter valid when a user changes the state filter.
- Company narrows department and location choices; department narrows locations. Changing company resets both dependent filters; changing department resets location. Search applies the selected filters to the existing counted vacancy listing.
- A chosen value is separately resolved within current permissions, so searching for another option or moving pages does not silently clear it. Unavailable values receive a generic unavailable/loading label. Refresh rechecks selectors; neither a selected ID nor cached UI state grants access.
- The endpoint reuses the listing's native Job Opening and parent-request access predicates, including child Link User Permissions and all-location scope, before distinct selection or pagination. It returns only contextual IDs/labels already available through readable vacancies. Guessed company/location names cannot broaden access.
- Native select controls, labelled search inputs, Enter-to-search, previous/next buttons, retry feedback and stale-response cancellation are available in AR/EN. Search failures remove stale result options; a newer search cannot be overwritten by an older delayed response. No backend workflow, priority, assignment or headcount writer changed.

## Evidence

| Run | Verified scope |
|---|---|
| [Final native regression](evidence/s2-regression-c96ee83c4d43.json) | **31 passed:** 20 vacancy tests (five new selector cases plus expanded existing child/all-location checks) and 11 portal API regressions. Distinct pagination, selected-value lookup, literal search, dependent filters, terminal history, draft exclusion, missing/revoked scope, native opening/child permissions, disabled/Guest access and bounded invalid inputs. |
| [Vacancy browser result](../portal/evidence/vacancies-d8f90f3149a8/results.json) | **41 passed:** 28 real synthetic openings; exact pages/counts, AR mobile and EN desktop, location filtering, dependent resets, keyboard search, empty-search selection retention, delayed response, failed-network retry, outsider discovery denial and current lead revocation. |
| [Original hiring journey](../portal/evidence/browser-ee2a5765c37f/regression.json) | **24 passed:** fresh personal-session hiring → manager → HR → vacancies → assignment, including existing stale/return/revision and mobile checks. Source and cleanup verified. |
| [Visual inspection](../portal/evidence/vacancies-d8f90f3149a8/visual-review.json) | EN desktop and AR mobile screenshots reviewed. Original captures and top-of-page inspection crops retained. |

Both browser cohorts retired all six synthetic accounts and reconciled their capacity ledgers. Native tests rolled back. Browser runs report no JavaScript errors, HTTP 5xx or external requests. TypeScript/Vite build passed. Product Python remained identical to the final native run; browser source fingerprints were unchanged during each run.

The [initial native attempt](evidence/s2-regression-f6e7a8e2a2fd.json) caught a local `_` query-unpacking variable masking the translation helper on invalid input; the endpoint now avoids that collision. A separate test referenced an absent `outsider` fixture role; it now tests an existing recruiter after revoking their scope, while the browser still tests a real outsider account. Both failures are retained and the complete affected suite passed after repair. No product assertion was removed.

## Review and remaining work

Open http://localhost:8102/hr-portal → Vacancies / الشواغر. Search within company/department/location choices, select a result, then use the main Search button. Change the company and confirm the dependent selections clear; change language and try a mobile width.

This closes the exact-name selector gap in the [eight-ID reconciliation](S4_REQUIREMENT_RECONCILIATION.md). Remaining work includes final team event-policy reconciliation and S5 candidate/application ownership, then interviews/offers/joining/lifecycle/reporting. HR wording/policy/UAT, external email, identity/MFA, independent security, representative sustained 1,000+ account load/recovery, migration, hosting and rollout remain explicit gates. No production readiness claim follows from these functional cohorts.
