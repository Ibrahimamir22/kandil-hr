# S3 — structured vacancy notes and retained history

13 October 2026. Synthetic engineering checkpoint. Full S3 acceptance, all later HR modules and production gates remain open.

## Change and user-visible behavior

Vacancy/recruiter-team snapshots now capture an explicit list of shared fields and only each team member's User reference. A new field on a recruiter-team child record cannot silently become part of the request's shared audit history.

Existing stored JSON is not rewritten. Native unredacted Request Revision reads now recognize the declared vacancy/disabled-recruiter note schemas and authorize their nested references before pagination. The before/after opening must match the same request and appear in that capture's own lines. Historical lead/team/initiator identities respect current native User Permissions. Declared legacy child metadata remains readable if safe; unknown fields, nested objects in scalar fields, malformed JSON-looking notes, and mismatched child parents are withheld.

Joining-reversal notes have a separate declared schema. Reading their original provenance requires current read rights to the exact linked Employee, Position Assignment, Job Offer and Employee Onboarding records. Their identities must match the recorded request and each other. Ordinary request access alone does not grant offer or employee access; the portal timeline retains the safe reversal reason.

The disabled-recruiter invocation preserves actor/principal/executor provenance and verifies payload identities. The literal unknown-scheduler provenance label remains a label, not a fabricated User. Disabled historical users remain legitimate identities when currently permitted. Candidate ownership/task details remain in protected applicant/security audit records, outside the shared vacancy snapshot.

When full raw history is restricted, the custom portal's existing projection still presents the permitted reason, quantities and decision history. It never exposes the structured note payload. Ordinary plain-text comments and empty notes preserve their established behavior. This is not semantic redaction of arbitrary free text or uploaded content.

## Verification

- [Final personal-session HTTP](../portal/evidence/history-notes-41f6694ef061/results.json): **18 checks passed** on the final source. Authorized exact revision/file reads and downloads succeed; outsider/restricted historical-team reads fail, including same-session File ownership paths. Projected saved quantities and safe timeline reasons remain available without the hidden identity or encoded note. Original revision/file bytes and source fingerprints stay unchanged, no server failures; cleanup disabled all six fixture accounts and reconciled their ledgers to zero. No browser rendering or sustained capacity claim is made from these HTTP checks.

- [Final affected native regression](evidence/s2-regression-392125117ec4.json): **92 checks passed**, including 16 focused structured-note/Event tests, seven actual handoff tests, 11 joining-reversal workflow tests and the 58 remaining affected history/privacy/timeline checks. All recorded Python source fingerprints still match.

- [Earlier affected native regression](evidence/s2-regression-164c0b6016f3.json), before adding explicit joining-reversal coverage: **78 checks passed**: structured notes and native Event identity restrictions (13), actual disabled-recruiter handoff audit (7), correction notes (10), raw history (21), frozen references (14), confidential notes (8) and timeline views (5). Original stored bytes remain unchanged by reads. These are isolated rollback fixtures.
- [Earlier personal-session HTTP](../portal/evidence/history-notes-dee01ec24771/results.json): **18 checks passed** before the joining-note schema extension; this is supporting evidence and is not added to the final totals. No frontend or schema change is required for this increment.
- The earlier native run's source remained unchanged while it executed. The HTTP setup fixture was subsequently corrected to use keyword arguments and the domain API's `step_key`, not the child row name. Final writer inventory then identified joining-reversal notes, leading to their explicit schema/reference checks and a fresh affected regression.
- [Initial native diagnostic](evidence/s2-regression-98b8d73063cb.json): the first 11 new checks passed; the existing deletion audit hit the synthetic environment's 650 queued-job limit. The test now runs only the exact fixture applicant's `delete_dynamic_links` cleanup synchronously, with its normal native deletion and audit assertions intact. No worker was started and no queue was flushed or limit raised. The final run includes the two additional note/file tests and all seven handoff tests.
- [Initial HTTP fixture diagnostic](../portal/evidence/history-notes-c2f660839581/results.json): preparation used a child row name where the API requires an approval step key. No security assertion was accepted from this run. Cleanup disabled all six accounts and reconciled fixture ledgers to zero.

- [Second HTTP diagnostic](../portal/evidence/history-notes-ce34b9889427/results.json): all 13 raw revision/file access checks passed, then a new assertion incorrectly expected a reason in saved-version fields. Reasons belong to the existing portal timeline. The final harness checks both saved quantities and the safe timeline reason, without removing any access assertion. Cleanup again disabled six accounts and reconciled ledgers.

## Sprint exit and next work

The [S3 acceptance matrix](S3_ACCEPTANCE_MATRIX.md) now maps all 17 unchanged requirement IDs to their clauses, implementation checks, portal evidence and policy gates. Native Event actor/principal User Permission denial is explicitly verified; the existing native Link permission compiler enforces it without a new implementation.

Remaining focused work is the indirect File/child/alias boundary review and any fixes it establishes, followed by integrated S3 acceptance against the matrix. Complex/custom HR reports remain restricted until their scoped reporting implementation is delivered. S4 vacancy/recruiter operations, then candidate/interview/offer/onboarding/lifecycle/reporting delivery remain in scope. HR/IT/UAT, independent security, sustained representative 1,000+ account capacity/recovery, hosting and real-data rollout remain separate gates.
