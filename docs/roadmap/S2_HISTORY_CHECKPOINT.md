# Sprint 2 — scoped history and comparison

13 October 2026. Engineering checkpoint on the isolated synthetic parity site. S2 and the full HR delivery goal remain active.

## What is connected

Open `http://localhost:8102/hr-portal` and either **Job descriptions / الوصف الوظيفي** or **Structure changes / تغييرات الهيكل**. Open a record, then **History and comparison / السجل والمقارنة → Open history / فتح السجل**.

- JD records show saved draft creation/edits and independent approval events, with actor, event time and explicit before/after fields. The private command audit remains inaccessible through raw REST.
- JD comparisons select another readable revision of the same company/job. Both record timestamps are shown because drafts remain editable. Responsibilities, weighted KPIs, authorities and competencies are projected as structured rows, with grade/salary data excluded.
- Structural records show recorded submissions and decisions, including returned/rejected states. Related differences are limited to the proposal's source/destination/new positions and changed position, capacity, hierarchy and assignment snapshots.
- Assignment comparisons preserve the captured effective dates, allocation and authorized employee identity. An earlier transfer's snapshot does not change after a later assignment end. A missing captured before/after record is labelled as capture absence, not proof of creation/deletion.
- All panels are bilingual; desktop uses two columns and mobile stacks before/after. User-authored text is preserved; only recognized enum fields are translated. React renders values as text, without raw HTML insertion.

## Permissions and data boundaries

`portal/history.py` first authenticates the personal session, checks the current target's native read permission and Kandil scope, then selects the private audit records for exactly that target, company and organization domain. It validates the envelope identity and historical before/after scopes. Guessed event IDs from another target are denied.

Public projections use explicit field allowlists. Private envelope/payload/receipt data, full-company baseline snapshots, salary/grades, employee account data and assignment remarks are not returned. Related snapshots additionally require current native access to the related record and position; employee/assignment/parent-position references are redacted when unreadable. Whole-company structural permission remains required for structural history. A department reader does not acquire structural history through this panel.

Events and revision lists default to 20 rows, capped at 100. Event pagination advances candidate rows, so a page may have no visible events and still offer a next page. Related differences likewise page candidates before current native checks. An event's existing audit envelope is parsed server-side; this is not sustained-load proof. The later capacity/security gates must assess large organizations and long histories.

Revocation applies on every request. A legitimate previously downloaded copy cannot be recalled by changing permissions. Application-level immutable audit records are not an independently anchored forensic log; external custody remains an open gate.

## Verification

- [Final native tests](evidence/s2-regression-71dcff2fa65d.json): **45 passing checks** across history (14), JD portal (12), structural portal (10) and organization portal (9), run serially. Includes actual native Employee User Permission restrictions, hidden anchors, revoked/disabled users, event/target confusion, exact frozen resize/transfer snapshots and bounded pages.
- [Final JD browser journey](../portal/evidence/history-jd-0b0c5ba48599/results.json): **28 passing checks**, including English edit/comparison screens, Arabic mobile approval history, guessed events, raw-audit REST denial, revocation and prior authoring/concurrent-approval regressions.
- [Final assignment browser journey](../portal/evidence/history-assignments-5dce1bbdaa4b/results.json): **22 passing checks**, including assign/move/end, preserved transfer snapshots after later ending, bilingual history UI, restricted-role denials and repeated final approval.
- Both final browser cohorts completed setup and cleanup with the existing full queue. Six accounts per cohort disabled; current ledgers zero; synthetic history and future episodes retained. No external requests, browser exceptions or HTTP 5xx recorded. Zero current occupancy does not mean future episodes can never become active.
- [JD visual review](../portal/evidence/history-jd-0b0c5ba48599/visual-review.json) and [structural visual review](../portal/evidence/history-assignments-5dce1bbdaa4b/visual-review.json): inspected English desktop and Arabic mobile history; readable before/after fields and translated authority values.
- TypeScript/Vite build passed (37 modules). Final native/browser source hashes match the checked files. Upstream source pins unchanged; no migration or schema change.

These are focused engineering checks, not all 98 requirements, full S2 acceptance or 1,000+ account load certification.

The local shared development queue reached its 650-job limit during synthetic account retirement. The CLI fixture now executes only matching synthetic User contact jobs inline, preserving native account-disable hooks and leaving other jobs/accounts unchanged. Native fixtures use the same bounded approach inside their rollback transaction. No queue was cleared, worker started or upstream source edited. The existing backlog remains an operational issue for a separately scoped worker/drain plan before queue-dependent testing or rollout.

Earlier attempts:

- `history-jd-bd1873292783`: setup hit the same queue limit through ERPNext's Employee-to-User hook. The matching synchronous contact context now also covers that synthetic link. Guarded verification found zero users, zero companies and no private manifest for the aborted run; [rollback proof](../portal/evidence/history-jd-bd1873292783/setup-rollback.json) is retained.

- `s2-regression-5ae747e69d2b`: ten checks passed and one setup errored because a synthetic different-job JD lacked its required position. The fixture now creates a real separate job/position and uses the normal JD command. No production validation was relaxed.
- `s2-regression-7bbd4f3a19d9`: 33 checks passed at that source snapshot. A subsequent CLI fixture helper and further reference-redaction tests required the final run below.
- `history-assignments-09c3edeede8a`: all 22 workflow checks passed but cleanup failed on the queue limit, so the original overall result remains FAIL. Guarded cleanup was retried successfully; all six accounts are disabled, current ledgers are zero, and [recovery evidence](../portal/evidence/history-assignments-09c3edeede8a/cleanup-recovery.json) is retained.
- `history-jd-74cd4f3ee999` and `history-assignments-e258ee051e92`: 28 and 22 browser checks passed. Their screenshots identified English authority enum labels in the Arabic history panel; final proof follows the translation correction and explicit assignment-reference redaction.

## Remaining work

This panel shows recorded commands; it does not invent missing structural draft-save events or reconstruct every past write from current records. Imported baseline changes and joining/reversal sources are not yet a unified position timeline. Existing dated assignment browsing remains available in Organization. S2-05 stays in progress until that navigation/coverage and the agreed history acceptance are completed.

S2 also retains full organization-tree navigation and HR terminology/document acceptance, plus configured live-email acceptance. The frozen 98 requirement IDs and historical 72 passed / 4 partial / 4 blocked register are unchanged. Identity/MFA, independent security, sustained 1,000+ account capacity, recovery/hosting, real-data migration and HR/IT/UAT remain separate gates. Odoo and other departments are outside this increment.
