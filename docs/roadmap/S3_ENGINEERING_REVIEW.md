# S3 engineering review — hiring requests and approvals

13 October 2026. The configured S3 workflows passed this engineering review. HR policy/terminology/UAT, independent security and production acceptance are still pending; S3 therefore remains open for acceptance while engineering moves to S4. This is not completion of the 98-requirement HR system.

## Evidence and outcome

- [Native workflow acceptance](evidence/s2-regression-51e45850d96c.json): **215 checks across 17 suites passed**, with no skips. Coverage includes delegation, structural and individual assignment approvals, complete hiring fields, routing, HR actions, headcount, version history, Board decisions and scoped request registers.
- [Main browser sequence](evidence/s3-browser-acceptance-73c43299eeb1.json): **307 checks passed** using personal sessions and real AR/EN screens. It includes the form, preview, HR actions, delegation, Board, historical workflows, pending revision and the original submit → approve → vacancy journey.
- [Structural browser workflow](../portal/evidence/structure-6f531c180bfa/results.json): **21 checks passed**. [Employee assignment workflow](../portal/evidence/history-assignments-b8f932c519c5/results.json): **22 checks passed**. These verify the HR + CEO route, scope/native bypass checks and retained history. Together with the main sequence, this is **350 browser checks**. Temporary accounts were disabled and current-date synthetic capacity commitments reconciled. Historical/future synthetic assignment episodes remain isolated and are not claimed deleted.
- [Board recapture](../portal/evidence/board-1ada29bd0a4b/results.json): the same **51 Board checks passed again** after hiding the sticky topbar only during panel screenshots. This repeated run replaces the earlier Board visual evidence; it is not added to the 350-check total. [Visual review](evidence/s3-visual-review-2026-10-13.json) records inspected captures and their limits.
- [Concurrent HTTP admission and approval](evidence/s3-concurrency-confirmed-2026-10-13.json): **three scenarios / 60 requests**, peak 20 in-flight per scenario. Twenty submissions for five seats produced exactly five reservations and fifteen controlled denials. Twenty identical manager approvals and then twenty identical HR approvals each created one decision, one receipt, one audit and one revision, with exact notification counts. Final approval created one opening. Cleanup restored five available seats and verified all cohort accounts disabled.

The [17-ID requirement results](S3_REQUIREMENT_RESULTS.json) retain exact native test identifiers. The [acceptance matrix](S3_ACCEPTANCE_MATRIX.md) explains the clauses and configured policy. All 98 IDs and original requirement text remain in the coverage register. The frozen source CSV is unchanged.

## Source and diagnostic accounting

Production business logic and frontend were unchanged throughout this review. The previous attachment checkpoint remains the production source baseline. New work consists of an acceptance runner, explicit requirement results, clearer Board screenshot capture, and synthetic concurrency fixture maintenance.

After native/browser execution, the concurrency fixture alone was updated to use the same guarded bulk-import User creation approach as the existing portal fixture and synchronously create contacts only for its exact synthetic account cohort. Employee linking also saves the User, so the contact context covers that setup. Normal signup throttling, queued jobs and production hooks are unchanged. Cleanup now checks persisted enabled flags instead of reporting a constant success. No worker was started and no shared queue was flushed.

The browser aggregator initially searched `assignments-*` instead of the harness's actual `history-assignments-*` output. Its [diagnostic result](evidence/s3-browser-acceptance-5036f7507834.json) correctly stopped the sequence; the child assignment suite independently passed all 22 checks and cleanup. The prefix is corrected, and the remaining Board run has [its own successful aggregate](evidence/s3-browser-acceptance-0d316e8d3fb2.json). No product assertion was weakened.

Three concurrency setup diagnostics are retained separately: [stopped service target](evidence/s3-concurrency-2026-10-13.json), [synthetic User creation throttling](evidence/s3-concurrency-final-2026-10-13.json), and [Employee-linked contact enqueue against the existing backlog](evidence/s3-concurrency-verified-2026-10-13.json). They executed no concurrency assertions and are not passing evidence. The harness now targets `parity-web` and retains failure details privately. [Exact failed-cohort counts](evidence/s3-concurrency-setup-cleanup-2026-10-13.json) verify those failed preparations retained no Company or User records.

The native and main-browser source fingerprints predate only this fixture/harness maintenance, not a business implementation change. The final concurrency evidence records the updated fixture hashes. This distinction avoids describing earlier tests as reruns of later fixture code.

## Remaining acceptance and next implementation

HR must approve the configured decision table (including personal-interest routing), WARN/BLOCK transition semantics, terminology and review layouts. Independent security, production MFA/session design, live external email, audit key/seal operation, migration/recovery, representative sustained 1,000+ account testing and hosting remain separate gates. The short race test is not a capacity certification. Payroll and Odoo are outside this HR goal.

**Next engineering work is S4:** a dedicated server-filtered vacancy queue with accurate totals, recruiter teams/bulk assignment, lifecycle actions and explainable priority; then dashboard/inbox and isolated scheduled notification recovery. The [S4 implementation brief](S4_IMPLEMENTATION_BRIEF.md) records the actual current limitations and delivery order. Candidate, interview, offer, joining/onboarding, lifecycle and reporting sprints remain in scope.
