# S3 slice 1 — complete hiring request form

13 October 2026. Engineering checkpoint for the bilingual custom portal at `http://localhost:8102/hr-portal`. This is the first S3 slice, not completion of the 98-requirement goal or production acceptance.

## Delivered

- Dedicated typed request wizard with all four need reasons, replacement employee, employment type, qualifications, skills, experience, working conditions, requested priority, need date, exception reason, Position and multiple location quantities.
- Searchable paginated Position, Capacity and replacement selectors. The UI no longer eagerly downloads the legacy 500-item choices list. The native test traverses 503 Positions without omissions or duplicates and checks selected-ID hydration.
- Full company/department and business-field review before submission, and full permitted saved detail. Draft reopen/edit retains values; submitted content remains protected from draft edits.
- Arabic RTL and English UI with a mobile quantity table that fits its own container. User-entered mixed-language text remains unchanged.
- Existing command IDs, stale-version protection, return/revision, approval transitions and reservation accounting remain in use.

## Identity access contract

Replacement selection returns only Employee ID and name. It requires an explicit recruitment role, current management scope, selected Position company/department and native Employee User Permissions. It does not grant native Employee profile read access. A guessed or newly changed replacement reference is checked on native draft saves as well as the portal path. The selected Position itself must pass native read and management scope checks.

If an unchanged stored replacement reference becomes restricted, the custom portal hides it and preserves it when editing other fields; saved-command replay also rechecks current identity access. An explicit changed reference is validated again. Native User Permissions may deny the whole request when it links to a restricted Employee. The submitted-content check uses an authorized HR reviewer; this slice does not certify every manager/CEO/Board replacement approval route. HR/IT configuration and later S3 authority tests must settle those paths without granting unnecessary profile access.

Selectors advance bounded candidate pages; permission filtering can produce an empty page with more candidates available. The interface permits continuing to the next page. Recorded capacity values are guidance; submission revalidates and locks authoritative data. This is not a load test.

## Evidence

| Verification | Result | Evidence |
|---|---|---|
| Native form/API/command/contracts/corrections | 60 checks passed | [Native regression](evidence/s2-regression-57c373649bb5.json) |
| New full form, EN desktop and AR mobile | 23 checks passed | [Form browser results](../portal/evidence/request-form-7fde9d159047/results.json) |
| Visual inspection of final review screens | Passed for captured views | [Visual review](../portal/evidence/request-form-7fde9d159047/visual-review.json) |
| Existing full hiring journey | 24 checks passed | [Journey and cleanup](../portal/evidence/browser-5e6a9d62e494/regression.json) |
| Pending quantity revisions | 16 checks passed | [Pending revision and cleanup](../portal/evidence/pending-f5ec656b39a1/results.json) |

The production build passed with 39 transformed modules. The form and pending-browser source hashes match the current files. After the original journey, only its shared CLI browser-fixture module changed for synthetic account/contact setup; product source remained identical, and the pending-revision run exercised that final fixture. New form and original journey cohorts each disabled six synthetic accounts and reconciled their ledgers on cleanup. Pending revision cleanup disabled four accounts and left all fixture ledgers zero. Original failed attempts remain recorded rather than being replaced by successful evidence.

## Failures found and resolved

- Native `f94834edc138`: test comparison needed date normalization and an independent deep-copied JSON payload because Frappe populates child dictionaries. Application validation was not weakened.
- Native `5a0cd1d948f2`: a fixture manager's native Employee User Permission correctly denied the linked replacement request. Complete-content proof now uses authorized HR. The broader role-configuration gate remains open.
- Native `40e75be062ac`: the pre-existing 650-job queue ceiling blocked a synthetic CEO User contact job. The guarded command-test handler now recognizes only that exact cohort's synthetic accounts, including CEO accounts. Production hooks and queued jobs remain unchanged.
- Form browser `ad2e9ed628e2`: initial assertions passed but visual inspection found inner mobile table overflow. `a61728586112` retained the new failing inner-width assertion. A scoped table min-width override resolved it; final `7fde9d159047` passed both outer and inner width checks.
- Pending browser `b48442efe4c3`: the older fixture hit hourly User creation throttling before browser launch. Read-only verification found zero Company/User/request rows for that failed cohort. Guarded CLI-only bulk-import account creation and exact-cohort contact handling now apply to this fixture; normal account throttling, production hooks and the shared backlog are unchanged. The harness stores raw failures only in a private temporary file. Final `f5ec656b39a1` passed.

No real employee data, external email, production role changes, core edits or dependency pin changes were used.

## Next and remaining gates

1. S3-02: read-only route/headcount preview, showing effective approvers, skipped levels, shortages, conflicts and actionable missing-authority errors without reserving seats or creating an approval snapshot.
2. Complete native HR actions in the portal: HR review, CEO routing, cancellations, approved corrections and linked increases.
3. Connect dated delegation and independent CEO/Board evidence, then complete My Requests and frozen review-history screens.
4. Run full role-specific S3 acceptance, including linked replacement Employee visibility and current revocation.

S2 HR terminology/document/history acceptance and configured live email remain open. Independent security, identity/MFA, external audit custody, representative 1,000+ account capacity, recovery, clean deployment, migration and HR/IT UAT remain separate gates. All 98 reference IDs remain unchanged. The historical 80-case register remains 72 passed / 4 partial / 4 blocked.
