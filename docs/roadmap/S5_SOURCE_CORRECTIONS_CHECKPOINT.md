# S5 — reviewed source correction and outcome locks

Engineering increment, 14 October 2026. Advances SRC-001 and the attribution-lock portion of SRC-003. The 98 frozen requirements remain intact; referral identity, agency terms, dedicated source changes and complete S5 acceptance remain open.

## Reference and implemented workflow

The pinned reference (`7824be24292c4743b4005e14e2df540786cfe167`) defines `src/Referrals.gs:appSourceSet_` and `lockAttribution_`: an application source may be corrected with a reason before the outcome, and becomes locked after rejection, withdrawal or hiring. Reopening does not erase its original lock.

The connected portal now presents **Application source and history / مصدر طلب الترشح وسجله** in a candidate application. A scoped recruiter can review the current source, original value for this application, replacement source and sub-source, and a reason before confirming. Only active ordinary sources may be selected. Each correction stores a private immutable revision, actor, reason, before/after source definitions and a hash chain. The Job Applicant source fields reflect the latest reviewed revision; the original intake snapshot is unchanged. A later source-catalogue rename does not relabel either snapshot.

The panel supports Arabic/English, mobile layouts, exact retries after an uncertain reply, and the existing encrypted **Unfinished actions** inbox. Preparing a recovery entry does not change the source. The server checks current role, grant, candidate team and native object permissions before execution and completed-result replay. Request, application, catalogue and attribution versions are reviewed independently.

## Boundaries and preservation

- Company-first transaction locking serializes corrections with catalogue updates and recruitment outcomes. Two competing corrections cannot silently overwrite one another. A failure in the final command audit rolls back the source projection, correction, activity and receipt together.
- Any historical rejection/withdrawal closure permanently locks attribution, even after a real reviewed reopening. Accepted applicant/offer outcomes, recorded joining/no-show/withdrawal offer outcomes and linked employees also block generic source changes; full offer/lifecycle integration remains subject to S7–S9 acceptance.
- An authorized exact retry of a correction completed **before** closure returns the original receipt; it does not perform another correction. Revoked access cannot recover that receipt.
- Candidate identity, profile, application contact details, recruiter ownership, vacancy capacity and original intake evidence are unchanged. The generic command audit carries fingerprints and references, not the private correction explanation.
- Native source edits and native correction-document create/edit/copy/delete/rename remain denied. Correction history is served only through the current application scope.
- Known legacy referral/agency/internal/pool values and sources with those kinds cannot be changed through this generic path. Their dedicated consumers must maintain referrals, agency terms and eligibility; blocking this bypass is not delivery of those consumers.
- Unknown legacy source values can be explicitly corrected, while their original string remains clearly marked as lacking a recorded catalogue snapshot. No catalogue provenance or first-ever-person acquisition source is fabricated. Full person-wide original-source attribution remains part of unfinished sourcing reconciliation.
- The existing controlled-source feature switch governs this workflow. The preserved synthetic review site is enabled; the company-data site is untouched. No external email, background workers, purchase or real candidate contact was enabled.

## Verification

Schema and recovery-operation metadata were installed twice on isolated parity/review sites, preserving existing business-record hashes: `evidence/source-corrections-schema-2026-10-14.json`.

**57 native checks passed:** 14 source-correction, 14 source-catalogue, 21 recovery and 8 command-audit checks (including one fixture-isolation check): `evidence/s2-regression-18cadef92a7a.json`. **26 connected browser checks passed:** `../portal/evidence/source-corrections-e5fe0fced123/results.json`. Includes real AR/EN corrections, lost-reply retry, concurrent identical/competing commands, correction-versus-closure race, native bypass and revoked-access denials. Six fixture accounts were disabled, cohort ledgers cleared and feature leases restored.

**58 final preserved-review checks passed:** `../portal/evidence/review-work-1792008347208/results.json`; existing review business records stayed unchanged. Four final rendered captures were manually inspected: `../portal/evidence/source-corrections-e5fe0fced123/visual-review.json`.

The first native run identified a missing registration in the command-audit operation allowlist; this was corrected with explicit related-effect projections. A nested reopening test also needed an explicit synthetic screening switch after fixture initialization. Neither repair removes authorization or outcome checks. The first browser run passed 18 checks before a test navigation timeout: the helper now uses the visible Back to candidates action before searching again. Visual inspection also prompted clearer confirmation spacing and labelled before/after history on mobile. Earlier failure evidence is retained.

Build: 77 modules, passed TypeScript and Vite compilation. Existing font-resolution and bundle-size advisories remain. Automated tests and manual visual review do not prove independent security, sustained 1,000+ account capacity, accessibility certification, HR acceptance or production readiness.

## Review and next work

Open **http://kandil-review.localhost:8112/hr-portal → Candidates → an application → Application source and history**. The existing review records are preserved; some legacy referral records correctly require a dedicated workflow and show no generic correction form. Ordinary-source correction is demonstrated by the isolated browser evidence.

Next: dedicated referrals and agencies, advertisement/apply attribution, source subscriptions and credits; private candidate files, imports, internal/former-employee rules and remaining privacy/retention work. Preserve all S6–S12 interview, offer, joining/lifecycle, reporting, independent security/capacity, migration/UAT and staged release gates. Overall goal stays active.
