# S5 combined candidate contact and follow-up

14 October 2026. Engineering increment against ACT-001 within the unchanged 98-requirement goal. S5, HR acceptance and production release remain open.

## What is connected

In **Candidates → Communication and notes → Record activity**, a recruiter can record an interaction and explicitly choose to mark a new application as contacted, keep the existing follow-up, set/replace its task/date/owner, or clear it. All selected effects belong to one reviewed command and database transaction. A rejected follow-up, stale application version, failed stage event or failed audit leaves none of those effects saved.

The reference is `Candidates.gs` at `7824be2`, `actAdd_` and `nextPatch_`. Reference NEW → CONTACTED maps to native HRMS Open → Replied. The stage changes only when explicitly selected, the application is still Open, and the activity represents contact: a call with REACHED/CALL_BACK or a non-NOTE discussion. Failed calls and notes do not advance it. Later stages are preserved. Template/rejection-message behavior is not included in this increment.

The existing owner/lead/configured-HR authority remains required for follow-up changes. A team member who can record a conversation does not automatically gain follow-up authority. This is stricter than the reference's broad team-level follow-up access; HR policy acceptance remains explicit. Follow-up and application ownership remain independent. Invalid/disabled/out-of-team follow-up owners are rejected by the existing current-authority check. Non-managers receive no follow-up-owner choices in the activity response.

## Transaction, history and recovery

- The handler saves the application once when combining stage and follow-up. It reuses internal ownership validation/effects under the outer command, without calling a nested transaction-retry wrapper after writing an activity.
- A separate immutable STAGE entry records Open → Replied and links to the contact activity. The stage entry cannot be manually voided. Voiding the original contact preserves the stage and follow-up, with an explicit bilingual explanation.
- Existing plain-activity command signatures remain compatible. Compound signatures include the follow-up hash. Activity command audits include related event hashes and hashed applicant follow-up text/history; raw note and follow-up content stay in their permission-controlled records and private encrypted recovery copies. Other operation projections are unchanged.
- The recovery inbox displays the originally reviewed stage/follow-up choices. An uncertain response freezes the form; retry or reload/inbox recovery returns the same recorded result. Replay rechecks current scope, and competing application edits reject stale versions.
- The extra exported activity fields are `stage_from`, `stage_to` and `source_activity`. Both synthetic sites received a targeted DocType reload before the new shared frontend bundle. Only their web services were restarted. Review workers/scheduler remain stopped; no company-data site or production deployment was changed.

## Verified evidence

- [71 native checks passed](evidence/s2-regression-1e72fea29978.json): 27 activity checks, 12 candidate-work checks, 21 recovery checks and 11 ownership checks. The nine new activity cases include rollback without an outer test savepoint, immutable stage hashes, exact recovery, stale edits, closed vacancies, invalid inputs, ownership boundaries and void/clear semantics.
- [23 compound browser checks passed](../portal/evidence/candidate-activity-actions-ce0d62c79dd0/results.json): ordinary-role form choices, lost-response/reload recovery, stage display, void semantics, Arabic clear action, competing commands, forged owner changes, current-access replay rejection and unchanged identity/capacity. Synthetic cleanup disabled six accounts, restored the candidate feature flag and reconciled capacity.
- [31 existing activity browser checks passed](../portal/evidence/candidate-activities-33a8620eb0cf/results.json), retaining ordinary manual recording, voids, pagination, concurrency, native read denial and exact recovery. [42 shared recovery browser checks passed](../portal/evidence/recovery-ui-d1ace11682e3/results.json) for intake, corrections, migration, lost responses, storage unavailable, expiry and revocation. Both cohorts restored their flags, disabled six accounts and left zero capacity ledgers.
- [Eight command-audit checks passed](evidence/s2-regression-71c5788fabff.json), including seven command integration cases and one fixture callback-isolation check. This gives **79 backend checks, 96 workflow browser checks and 12 read-only review checks** in this checkpoint, without adding earlier superseded runs.
- [12 read-only review checks passed](../portal/evidence/review-work-1791945280350/results.json) for the existing personal login, English/Arabic queue/work/activity screens, viewport and unchanged business-record digests.
- [Visual inspection](../portal/evidence/candidate-activity-actions-ce0d62c79dd0/visual-review.json) covers the English desktop combined form and Arabic mobile clear/history view. The screenshot capture hides the fixed topbar only to avoid occluding the captured section; viewport assertions use the ordinary page.
- TypeScript/Vite build passed. Existing bundle-size and runtime font-resolution advisories remain; no production performance claim is made.

The [first native run](evidence/s2-regression-e2a00394d7fd.json) exposed the double-save ownership conflict; it was fixed by the single-save effect. Its older privacy assertion covered the entire response rather than just the actor history and now also explicitly checks the permitted owner choices. The [first browser run](../portal/evidence/candidate-activity-actions-66cf9e3bde03/results.json) passed the workflow/concurrency checks but used an already acknowledged recovery record for its revocation assertion. The final harness checks the original command receipt and an unclosed pending recovery record instead. Failed evidence and successful cleanup are retained.

## How to review

Open **http://kandil-review.localhost:8112/hr-portal** with the existing personal login. Choose **Candidates / المرشحون**, open a candidate, then **Communication and notes / سجل التواصل والملاحظات → Record activity / تسجيل نشاط**. Choose a reached call, explicitly select the contact-stage change if the application is new, and select a follow-up option if you have ownership authority. Review the values before saving. Review examples are synthetic; your login and existing records were not reset.

## Remaining scope

Editable activity/reason catalogs, template/rejection-message activities, complete managerial void-authority mapping and HR terminology/policy approval remain under ACT-001/S5. Candidate rejection, duplicate/knockout/ad-closure tasks, recruiter-wide MOVE_ALL, sourcing/imports, complete profiles/private uploads/consent and all S6–S12 requirements remain. Independent security assessment, sustained 1,000+ account capacity testing, IT hosting/identity/backup decisions, real-role HR UAT and production migration/release are separate unfinished gates. No reference IDs were removed or accepted by implication.
