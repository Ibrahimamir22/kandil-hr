# S5 — recruitment agencies and submission terms

Engineering increment, 14 October 2026. Advances the agency portion of SRC-003 and S5-03. All 98 frozen requirements remain intact. Full sourcing, HR acceptance and production readiness remain open.

## Reference and delivered behavior

The reference at `7824be24292c4743b4005e14e2df540786cfe167` defines agency catalogue editing and application-bound terms in `src/Referrals.gs:agencySave_`, `agencyAttach_`, and `agencyOwnership_`; `src/Candidates.gs` connects them to manual intake. This increment connects those agency concepts to the custom Arabic/English portal over Frappe HR.

- **Recruitment agencies / مكاتب التوظيف:** configured company HR can add agencies, review changes and retain immutable revisions. Fields cover Arabic/English names, contact details, fee basis/value/currency, guarantee, replacement terms, ownership days, contract reference, notes and active status. Recruiters can read applicable terms; contact details, contract URLs and HR notes stay restricted to company HR. Other companies cannot enumerate the catalogue.
- **Candidates → New application:** an agency source requires an active agency and the exact terms revision displayed for review. The server rechecks both source and agency versions before saving. It creates the application, source evidence, agency snapshot and command receipt atomically. Optional agency data is included in encrypted intake recovery.
- **Agency submission terms / شروط مكتب التوظيف:** each application retains its original agency name, fee/guarantee/replacement/ownership terms. Renaming, changing fees or deactivating the agency does not rewrite existing submissions. Generic source correction cannot bypass this dedicated attribution path.
- Ownership begins on the Cairo submission date and ends after the recorded number of days, with the final date inclusive, matching the reference date rule. While a claim is active, a different agency cannot submit the same explicitly identified person. Same-agency submissions to another vacancy remain allowed. Non-agency applications show an HR-review notice if that person has an active agency claim.
- Company-first locking serializes catalogue changes and intake. Actual concurrent HTTP submissions by two agencies for one existing person produced one successful application and one permission denial. The rejected response does not disclose another team's application, agency or ownership dates.

## Deliberate boundaries

These are recorded commercial terms, not payments, contract signing, automatic fee calculations or legal approval. No agency, agreement or policy was seeded into the preserved review site. Company HR must enter reviewed terms before agency intake is available there.

The implementation adds explicit currency, required bilingual names, HTTPS-only contract references, immutable catalogue history and private contact projection. These differences from the reference require HR terminology/policy acceptance. The catalogue is bounded at 250 agencies; the tested ownership rule uses explicit person identity, never an automatic contact merge. A duplicate-person bypass remains part of broader identity/deduplication acceptance, not a claim that this increment identifies every real-world duplicate.

Legacy attribution without recorded agency evidence remains legacy; no original agreement or ownership is invented. Existing feature switches remain in force. Company-data port 8100, shared workers/scheduler, external email, Odoo and real HR data were untouched. Ownership disputes/reassignment, referral identity/bonuses, person-wide first-source attribution and downstream hiring/offer consumers remain open.

## Verification and evidence

- Schema installation repeated on isolated parity and review sites with business-record preservation: `evidence/agencies-schema-2026-10-14.json`.
- **57 native checks passed:** 14 agency, 14 source, 21 recovery and 8 command-audit checks (one is fixture isolation). `evidence/s2-regression-f0e595fae5ae.json`. Includes invalid inputs, stale terms, exact retries, current/revoked authority, private fields, immutable evidence, expiry boundaries, conflicting/same agency intake and rollback after a late capture failure.
- **27 final browser checks passed:** `../portal/evidence/agencies-7c0043b674f9/results.json`. Covers real English intake, Arabic mobile terms editing and snapshot viewing, lost catalogue reply recovery, simultaneous identical/competing catalogue edits, concurrent ownership claims, native read denial and revoked HR replay. Five rendered captures were manually inspected; `visual-review.json` records scope. The earlier 23-check run is retained as preceding evidence.
- **62 read-only preserved-review checks passed:** `../portal/evidence/review-work-1792009027829/results.json`. Existing personal sign-in, business records and AR/EN candidate screens remain intact; empty agency selection does not fabricate terms or permit incomplete intake. No password reset or role elevation occurred.
- Final test cleanup disabled six cohort accounts, cleared cohort capacity ledgers and restored both temporary feature leases. History is retained as synthetic evidence. No browser JavaScript errors, HTTP 5xx or external requests were observed.
- TypeScript/Vite build passed, 78 modules. Existing font-resolution and bundle-size advisories remain. Dependency pins were checked without changes; the frozen requirements CSV hash remains `25dbbe46c0bdcac9b2f33fa466cb21c26eedf80888f1b06d8052b7f7746ba2fd`.

Tests demonstrate these synthetic scenarios only. Independent security assessment, sustained representative 1,000+ account capacity, accessibility/UAT and production deployment remain unproven.

## Review and remaining work

Open **http://kandil-review.localhost:8112/hr-portal → Recruitment agencies / مكاتب التوظيف**. The existing personal recruiter account can inspect terms but cannot edit company agreements. In **Candidates → New application**, selecting an agency source requires a specific agency; the preserved review catalogue intentionally starts empty. The committed browser captures demonstrate the completed synthetic HR-edit and intake path.

Next: implement dedicated employee referrals and their immutable attribution/eligibility rules; finish advertisements/apply links and subscription credits. Continue private candidate documents/imports, internal/former-employee rules and privacy/retention. All S6–S12 interview, offer, joining, lifecycle, reporting, security/capacity, migration, HR UAT and staged rollout gates stay open. The full goal remains active.
