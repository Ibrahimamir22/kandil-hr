# S5 candidate ownership and dated follow-up

14 October 2026. Engineering increment; S5 and all 98 reference requirements remain in scope. This is not HR acceptance or production readiness.

## Delivered behavior

The custom candidate detail screen now exposes responsibility and follow-up in Arabic and English. A permitted recruiter, vacancy lead or configured HR authority can change the application owner, set a separately owned dated next action, or explicitly clear that action. Every change requires a reason. Changing the application owner does not silently transfer the next action. Historical before/after values remain visible through permission-filtered paginated history.

The new controls call the existing transactional ownership commands. No upstream Frappe, ERPNext or HRMS core was changed. Server checks require a nonblank task to have a valid ISO calendar date; overdue dates remain valid. Native Desk mandatory-field hints follow that rule. Three existing fixtures now supply valid dates without changing their assertions.

Owner/follow-up commands join the actor-owned encrypted recovery mechanism. A lost response freezes the original action; retry or the unfinished-actions inbox recovers that same command. Application/request versions reject stale writes. Same-command simultaneous execution produces one result/history entry; competing commands against the same version permit one update. Recovery and native receipt replay recheck current team and document access. A former owner still on the team can recover their completed handoff but cannot perform a new owner-only action. Revoked team access denies history/context/replay.

## Verification

- [44 native checks](evidence/s2-regression-99dd8b0f48e4.json): ownership/follow-up context and recovery, existing recovery backend and ownership commands.
- [8 audit checks](evidence/s2-regression-ad56eff2bb12.json) passed. The final localization change then received a [20-check affected rerun](evidence/s2-regression-d5d0d54f0e58.json): 12 candidate-work and 8 command-audit cases. These are overlapping reruns, not 72 unique cases.
- [26 final ordinary-role browser checks](../portal/evidence/candidate-work-36ef7453b067/results.json): EN desktop/AR mobile, dated actions, separate owners, explicit clearing, reasoned history, lost replies, exact retry, reload recovery, self-handoff, stale edits, simultaneous execution, access revocation and unchanged person/application/capacity counts. Six fixture accounts retired; capacity ledgers reconciled to zero; candidate test flag restored. No browser runtime errors, server 5xx or external requests were observed.
- [42 existing recovery browser checks](../portal/evidence/recovery-ui-d9f46c3ed6bf/results.json) passed after the final change, covering intake/correction/migration, lost responses, competing UI sessions, storage failure, expiry and permission revocation. Fixture cleanup retired six test accounts, reconciled zero ledgers and restored its temporary flag.
- TypeScript/Vite build and JS syntax checks passed. Build retains bundle-size and runtime-font advisories; it is not performance certification.

Earlier browser failures are retained in evidence. They exposed a select accessible-name issue and duplicate React sibling keys, which were fixed in product code. Two harness failures were corrected by waiting for the actual lost-response error and explicitly restoring English after reload. The final run above covers these corrections. The preceding 25-check run is supplementary, not final-source evidence.

## Boundaries and next work

This delivers individual ownership and next-action detail/history, not the complete activity log or action queue. ACT-001 call/discussion entries and explicit voiding, ACT-002 cross-application follow-up queue, coded rejection/communication flows and recruiter-wide MOVE_ALL remain open. Full profiles, sourcing/imports, private documents, consent/self-service and the rest of S5–S12 retain their original scope. HR/IT policy, independent security review, sustained 1,000+ account capacity, backup/operations and HR UAT remain release gates.

The persistent human-review stack shares the development source but has separate database/Redis services. Review worker/scheduler remain stopped and outgoing email muted. The 8100 company-data site is not a test target. Individual employee-position changes continue to use the user-selected HR + CEO approval route.

## Persistent review update

The new recovery operation schema was loaded on the dedicated review site and only its web service restarted. [Update evidence](evidence/candidate-work-review-update-2026-10-14.json) confirms all inspected business rows were preserved. The original prepared intake example lacked an explicit empty phone key required by intake: the guarded CLI repair cancelled only that exact original pending envelope through its normal command and prepared a corrected replacement, preserving its reviewed request version. A repeated repair was a no-op. No request, application, person, capacity or command-audit row changed.

[Eight read-only personal-role review checks](../portal/evidence/review-work-1791941562846/results.json) passed after the update: English/Arabic sign-in, one connected work panel, correct direction/viewport, unchanged business records and no browser errors/5xx/external requests. No review candidate mutation or account reset was performed by this smoke check.
