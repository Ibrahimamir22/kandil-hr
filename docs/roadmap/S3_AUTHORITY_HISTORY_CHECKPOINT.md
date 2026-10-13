# S3 — authority, correction and quantity-change history

13 October 2026. This increment connects explicit action reasons and restart/no-change explanations to the existing AR/EN history screen, and exercises delegated, CEO and retained Board decisions after later revisions and corrections. Native raw-history/reference/File/reporting review remains open; this is not S3 or production closeout.

## What users can inspect

In the local synthetic portal (`http://localhost:8102/hr-portal`), open **Hiring requests**, a permitted request, then **View review history / عرض سجل المراجعات**.

- A delegated decision distinguishes the person who acted from the principal whose authority they used.
- A CEO or Board review preserves original requested quantities separately from HR's proposal. A completed CEO decision may still leave the request Pending for the Board.
- A Board return retains its deciding member, recorder, method, comment and private evidence even after resubmission, a later approval and an HR correction. The original submission can be compared with exactly what the Board reviewed then.
- An HR correction shows the recorded reason, changed requirements, revision and before/after approved amounts, while preserving the original requested amount and earlier decisions.
- A pending quantity change shows the reservation before and after, the new revision and a notice that approvals restarted. Earlier completed decisions remain in their original captured revision.
- A backend no-change quantity submission has its own explicit message: no new revision or approval restart occurred. The existing portal editor already rejects unchanged input before submission; historical API-origin no-ops still need an accurate display.
- Saved source-version and amendment labels now have Arabic translations, including the content immediately before a quantity change.

## Source and behavior

`portal.request_history.event` returns an `action` projection with only the recorded reason/comment and two derived booleans (`approval_restart`, `no_change`). It does not return the raw payload, HR correction's embedded before/after note, receipt or confidential fields. Values are rendered as text. The restart explanation comes from the selected command's recorded before/after revisions and steps, never today's request state.

`RequestHistory.tsx` shows this explanation beside the comparison. `RequestRevisions.tsx` supplies the missing saved-action translations. In `request_revisions.py`, known no-op pending-quantity commands no longer compete with the actual snapshot-writing command for historical location matching. Their identical AFTER timestamp must not make a valid saved version unavailable. Strict complete snapshot matching, current permissions and legacy missing-location behavior remain unchanged.

A dedicated opt-in CLI fixture uses nine isolated synthetic accounts, with a pure Approver delegate, independent CEO/Chair/Vice, HR, requester, Sector recorder and outsider. It builds the historical scenarios through the existing commands; browser sessions inspect them using personal logins. Previously published action-screen tests remain the proof for those mutation interfaces. The fixture fingerprints every saved version and command envelope before the browser run, verifies they remain unchanged, then disables accounts and reconciles ledgers during cleanup. Private proof is retained with its historical decision.

## Verification

- **47 native checks passed:** seven new workflow-history cases plus the saved-version, command-history and navigation regressions. [Native evidence](evidence/s2-regression-786d6db90634.json) confirms source fingerprints unchanged.
- **65 expanded history browser checks passed:** delegated/CEO/Board roles, HR corrections, pending restart/no-op, retained evidence, exact saved quantities after a no-op, scope revocation and unchanged historical bytes in English desktop and Arabic mobile. [Final result](../portal/evidence/history-workflows-3582232e6013/results.json). The earlier 61-check run is retained as intermediate evidence and is not added to the final count.
- **101 existing history browser checks passed:** original snapshots, selected-decision comparisons, route reasons, amendment navigation, native permission boundaries and browser stability. [Result](../portal/evidence/request-history-596ebb3de5e4/results.json).
- **16 pending-quantity browser checks passed:** real 2→3 reservation delta and approval restart, shortage denial with preserved input, stale submission denial, requester-only action and AR/EN layout. [Result](../portal/evidence/pending-1e170027e543/results.json). These refresh the action UI evidence; the concurrent/idempotent retry contracts remain covered by the separate [S1 checkpoint](S1_CHECKPOINT.md).
- **182 final browser checks total** across the three serial runs above; no runtime JavaScript errors, HTTP 500s or external requests were reported. Synthetic cleanup and retained-history limits are recorded per run.
- Four focused rendered captures were inspected: Arabic restart and retained Board history, English correction and unchanged quantities. [Visual review](../portal/evidence/history-workflows-3582232e6013/visual-review.json). This is not an independent accessibility or HR terminology sign-off.
- Frontend build passed with 48 modules; existing font-path warnings remain runtime-resolved. No schema migration is required for this increment.

S3-05 is engineering-complete for the integrated pending-quantity action and historical explanation. This does not close S3-04, the sprint acceptance criteria or any release gate.

## Remaining gates

The projected history adapter and screens do not certify native raw Revision JSON, nested route/reference disclosure, attachment metadata, native list/export or reporting surfaces. Finish that audit and the S3 clause-by-clause acceptance check before closing the sprint. Preserve safe, authorized native history reads rather than replacing their contract with blanket denial.

All 98 frozen requirements remain in scope. Vacancy, candidate, interview, offer, onboarding/lifecycle and reporting sprints remain on the roadmap. HR/IT/UAT acceptance, independent security review, sustained 1,000+ account capacity, recovery, production hosting and real-data rollout are explicit release gates. No Odoo changes, real HR data or external email were used.
