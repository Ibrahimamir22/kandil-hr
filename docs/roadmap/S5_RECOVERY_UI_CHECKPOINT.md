# S5 candidate recovery UI checkpoint

14 October 2026. Partial engineering delivery on the isolated synthetic site. S5 remains in progress; ordinary candidate mode remains disabled pending transient payload cleanup and an activation rehearsal.

## Delivered

All three forms—candidate intake, basic profile correction and reviewed legacy migration—now prepare an encrypted server-side recovery envelope before executing the original command. The same command ID and reviewed values survive a lost response, navigation or a new signed-in session. The client stores no candidate payload in localStorage/sessionStorage. Leaving a form while preparation is pending prevents that form from starting unseen execution.

The AR/EN **Unfinished actions / إجراءات غير مكتملة** inbox lists only the signed-in actor's saved actions. Opening it never executes work. Users inspect the saved values, explicitly confirm resumption of Pending actions, recover Completed results and open the actual application. They can discard an unexecuted request or acknowledge a completed result; the private recovery copy is cleared while the business receipt and audit remain. Current permissions are rechecked server-side. A revoked scope clears reviewed private details after the denied action.

The shared helper validates the original result identity and migration reconciliation before treating execution as confirmed. Unknown execution or cancellation outcomes retain the original reference for retry. Known validation failures permit correction only after pending recovery is safely closed. The successful form path acknowledges a validated client receipt; the inbox provides explicit result acknowledgement after recovery.

## Verification

- [63 candidate browser checks](../portal/evidence/candidates-0122d5ad96cf/results.json) passed with all three forms using recovery.
- [33 recovery UI checks](../portal/evidence/recovery-ui-2b757e1024e3/results.json) passed: lost preparation/execution responses, leaving during preparation, reload, competing sessions, unavailable browser storage, Arabic mobile correction/migration, stale discard, another actor's isolation and revoked access.
- Both final runs recorded no browser errors, server 5xx or external requests. Source hashes match the current source. Cleanup disabled all six temporary users per cohort, reconciled fixture ledgers and restored the candidate feature flag.
- Earlier recovery UI runs `403044fb3e71` and `ab9c3c0d47d7` remain recorded as failures. The harness first needed to await mobile drawer transitions, then explicitly refresh an already-open inbox after another session created a request. Both failed cohorts were cleaned; final tests passed without further product changes.
- TypeScript/Vite build passed. The approximately 503 kB minified entry chunk exceeds Vite's advisory size threshold; splitting remains performance work. Local font path warnings remain. These checks are not sustained 1,000-user load or an independent security assessment.

English desktop review and Arabic mobile correction/result/migration screenshots were inspected. Labels and primary controls are readable and within the viewport. Long opaque application/person references and sparse profile fields still need HR UX review. The full-page Arabic result capture includes the fixed header at the captured scroll position; this is not proof of accessibility acceptance.

## Next and limits

Implement bounded expiry/cleanup of unacknowledged transient recovery payloads, test that cleanup cannot duplicate or reverse a business action, and rehearse controlled activation. Retention policy and encryption-key recovery/rotation remain operational decisions. Session expiry during an in-flight UI action needs dedicated acceptance beyond the recorded reload/new-session and permission-revocation cases.

Then continue complete profiles, ownership/follow-up/rejection/activity, recruiter-wide handoff, sources, private files, consent and batch imports. All 98 frozen requirements, S6–S12, HR/IT acceptance, independent security, sustained capacity for 1,000+ accounts, hosting and real-data release gates remain in scope. Odoo and other departments are outside this HR increment.
