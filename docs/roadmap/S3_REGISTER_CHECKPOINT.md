# Sprint 3 — permission-filtered request register

13 October 2026. The custom Arabic/English portal now has a server-filtered hiring-request register. This completes the register portion of slice 5, not full revision/decision history or S3 acceptance.

## User workflow

Open `http://localhost:8102/hr-portal` and choose **Hiring requests / طلبات التوظيف**. The default view is **All within my scope / كل الطلبات ضمن صلاحياتي**. Choose **My Requests / طلباتي** for requests submitted by your account. Neither choice expands native access.

- Search by title or request ID across permitted matching records, including those beyond the first page. Search treats wildcard characters literally.
- Apply a status filter and see the matching total. Search and status intersect the selected own/scoped mode.
- Navigate 25-row pages and open the actual saved request. HR, requester and manager views follow their own current scope and relationship to each record.
- Refresh rechecks current access. Revoked access removes both records and counts. Empty results do not reveal hidden records.
- EN desktop and AR mobile share the same backend behavior. Returning from detail currently resets the register to its default scope view; query persistence is not implemented.

## Implementation and boundaries

`kandil_hr/portal/requests.py` uses native permission-aware count and page queries with identical filters, then rechecks detail access for each result. A compact field allowlist excludes request bodies, employee profiles, confidential notes and raw snapshots. `RequestRegister.tsx` clears obsolete rows and ignores superseded responses. It replaces only the hiring-request list; dashboard, approval and vacancy overview counts remain explicitly page-local and are tracked separately.

The aggregate uses the pinned Frappe query builder's structured COUNT syntax. Search length is bounded to 140, status/mode values are allowlisted and page size is capped at 100. Offset pagination describes the current matching dataset; records changed between page reads can change ordering. This is not a frozen report, full security certification or sustained 1,000+ account capacity proof.

## Final-source verification

| Evidence | Scope | Result |
|---|---|---|
| [Native regression](evidence/s2-regression-287e05a9795f.json) | 12 request-register cases plus 11 existing portal API cases | 23 passed |
| [Focused browser](../portal/evidence/requests-23b1cb057901/results.json) | Ordinary HR, requester, manager and outside-scope sessions; EN desktop and AR mobile | 39 passed |
| [Original journey](../portal/evidence/browser-ecc33636118c/regression.json) and [checks](../portal/evidence/browser-ecc33636118c/results.json) | Existing request/approval/vacancy journey after the list replacement | 24 passed |
| [Visual review](../portal/evidence/requests-23b1cb057901/visual-review.json) | Four captured search/status screens at desktop and 390px Arabic mobile | Reviewed, no blocking clipping |

The 29-request focused fixture proves a complete first/second page, old-record search, literal wildcard search, own-versus-scoped counts and status intersections. Native tests also cover User Permissions, every-location scope, disabled accounts, revocation, bounded input and read-only behavior. Guessed other-scope details, Guest listing and invalid modes are denied in browser/API checks. Browser results record no observed JavaScript exceptions, HTTP 5xx or external traffic.

Source fingerprints in all three final results matched current files at publication preparation. Each browser cohort disabled six synthetic accounts and reconciled all fixture commitments to zero; history remains retained. Native cases use rollback isolation. No production records or the real-data site at port 8100 were used.

## Diagnostics retained

- Native `69cc868eb98b`: the pinned Frappe version rejected string aggregate syntax. The endpoint now uses a structured COUNT expression while preserving native permissions.
- Native `ed91650be9bc`: 23 checks passed before the fixture deep-copy adjustment; final native source evidence is `287e05a9795f`.
- Browser `229c841c44fe`: fixture creation reused mutable child-row dictionaries. The fixture now deep-copies each request payload. Cleanup disabled all six accounts and cleared commitments.
- Browser `a7bbb6aed692`: the test asserted the second page before the asynchronous response completed. The harness now awaits the exact listing response and settled screen. The final run retains the same page-count/content assertions. Cleanup passed.

## Remaining work

Full immutable submission/revision/per-decision comparisons follow [S3_HISTORY_DESIGN.md](S3_HISTORY_DESIGN.md). They must preserve what each principal reviewed, current and historical access checks, private-note separation, restricted employee references and explicit missing-capture states. Existing current-round Board evidence and reason timeline are not substitutes for that history.

S3-04/S3-05 and S3 remain in progress. All 98 frozen requirements and the historical 80-case result (72 passed / 4 partial / 4 blocked) remain unchanged. HR/IT sign-off, configured live email, independent security, sustained capacity, recovery, hosting, authorized migration and production release remain explicit gates. The full delivery goal remains active.
