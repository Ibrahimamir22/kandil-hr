# S5 — candidate identity and reviewed intake foundation

13 October 2026. Backend engineering increment; candidate portal, full person profile and complete S5 acceptance remain open. The existing review portal continues its previous behavior: `kandil_candidate_identity_enabled` is **not enabled** for ordinary review traffic. Tests activate it only inside rollback-scoped synthetic fixtures. No real records were migrated and no external messages were sent.

## Implemented boundary

- `Kandil Candidate Person` supplies an opaque company-scoped identity. It deliberately holds no contact details, salary, private notes or hidden-application counts at this foundation stage. The full person profile and its correction/consent workflow remain required work.
- HRMS `Job Applicant` remains the application used by interviews, offers and employee links. New reviewed intake uses an opaque application ID and explicit person reference, immutable source channel/detail and a contact snapshot. Shared contacts never merge people or become an identity key. Explicit repeat applications can have distinct IDs; an exact command retry returns the original result.
- Recruiters may create a new unreviewed person or explicitly select a currently readable person in the same company with a reviewed version and reason. Linking to a person grants no access to their other applications. Current team, native role, native User Permission and dated scope checks still apply before command replay.
- Intake uses the existing Company → request → position/capacity/opening → related identity → User/grant command lock order, transactional receipts and immutable private command audit. The audit captures person/application effects and hashes the intake details instead of copying contact data into its payload. No capacity is consumed by intake itself.
- Duplicate review returns at most twenty readable application matches and a continuation hint from the same scope. Exact normalized email/phone and exact name matches are warnings only. National-ID matching, fuzzy name matching, reviewed merge/correction and a person-level search UI remain open.
- Native insert cannot bypass the reviewed command when this intake mode is enabled. Identity/source fields remain protected after the feature switch is disabled. Person records cannot be edited, renamed or deleted through ordinary document operations.

## Legacy migration

`candidates.intake.migrate_application` is a non-whitelisted primitive for a reviewed legacy application. It requires the configured HR authority (or the documented Administrator break-glass identity), request/application versions and an idempotent command ID. It creates one unreviewed person per legacy application, preserving the original application name, contact fields, unique legacy key and downstream references. It never infers that two old rows identify the same human and never invents source attribution or consent.

This primitive is not a completed migration rollout. A preview/batch manifest, missing/invalid-record review, downstream interview/employee/file reconciliation, committed concurrency proof and ordinary-session HTTP tests remain required before site-wide activation. The default-off switch is a staging boundary, not permanent dual ownership or acceptance of the old contact-based model.

## Verification

[Final native run](evidence/s2-regression-269ddacc42c4.json): **80 checks passed** — 17 identity/intake/migration cases, 26 recruitment commands, 11 ownership cases, 15 command-audit cases and 11 joining cases. All synthetic fixtures rolled back, with source fingerprints unchanged. This proves native transactions and permissions; it is not personal-session HTTP, committed concurrency, browser or production-scale evidence. Initial attempts ([first](evidence/s2-regression-071273108126.json), [second](evidence/s2-regression-6d0ffbe51acb.json)) are retained: the first exposed an over-restrictive same-person/opening rule, which was removed to allow explicit distinct repeat applications; the second passed permission assertions but failed when fixture cleanup tried to enqueue native User Permission deletion against the stopped shared backlog. The fixture now uses its existing transaction rollback. No worker was started and no backlog was flushed.

[Installed-state check](evidence/s5-identity-install-2026-10-13.json) confirmed the new metadata and protected fields, zero persisted person records, disabled intake mode and HTTP 200 after restarting only parity-web. An initial read-only inspection used the wrong Frappe working directory and failed before connecting; the corrected sites-directory inspection succeeded.

## Next implementation

1. Add the full candidate/person projection and controlled profile changes; handle salary disclosure states without inventing the stage-specific HR decision.
2. Build the AR/EN candidate workspace and intake form, including visible duplicate review, explicit identity reuse, current source options and account-scoped feedback.
3. Add migration preview/batch reconciliation and committed HTTP/concurrency evidence, then explicitly activate the mode on the synthetic review site and test the whole request → candidate path.
4. Continue source catalogs/attribution, private files and consent, activity/rejection/follow-up, imports and recruiter-wide MOVE_ALL. All twenty S5 IDs and the shared VAC-003/VAC-005 clauses remain tracked.

HR/privacy policy, real email/providers, independent security, sustained 1,000+ account capacity/recovery, hosting and production release remain separate gates. This increment makes no claim that those have passed.
