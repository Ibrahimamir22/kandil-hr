# S5 — employee referral intake and original evidence

Engineering increment, 14 October 2026. Partial SRC-003/S5-03 delivery. The 98 frozen requirements and later release gates remain intact.

## Reference and behavior

The pinned reference `7824be24292c4743b4005e14e2df540786cfe167` defines `empSearchLite_`, `referralCheck_` and `referralRecord_` in `src/Referrals.gs`, consumed by manual intake in `src/Candidates.gs`. This checkpoint implements the initial referral record and its selection/review path; it does not claim the reference's separate referral replacement or bonus-decision register.

A **Referral** source requires a reviewed referrer. Other ordinary sources can optionally record an **influencing referral**. Recruiters search active employees within their currently permitted company and see only code, name, job and a selection version. This dedicated projection does not grant access to native Employee records, contacts, compensation or unrelated company data. Inactive employees cannot be chosen, and a changed employee version requires fresh review. The server snapshots the current employee name/job rather than accepting a forged display name.

If the company has no employee records at all, the reference's name-only fallback is allowed and explicitly labelled unverified. An inactive-only register is not empty. Once any employee register exists, a name-only fallback cannot bypass selection. Relationship is stored, and a configuration version binds the selection to the lookback/required-relationship policy. Reference defaults are 180 prior days and optional relationship; these are not a claimed HR policy approval. Operator configuration uses `kandil_referral_prior_days` and `kandil_referral_relationship_required`; an HR policy editor is still pending.

The application, source snapshot, referral snapshot, command receipt and audit references commit atomically. Lost replies reuse the exact encrypted intake action, never a new command. A later employee rename does not alter the original snapshot. First-referrer checks operate on the same explicitly identified person and vacancy. A competing employee is denied without revealing the other referrer's name, application or date. Contacts never automatically merge identities.

Initial bonus classification is a review cue only: primary referrals await HR; recent prior applications and influencing referrals require review; an explicitly linked active internal employee is ineligible under the reference rule. No bonus approval, payout or provider verification occurs. The current Employee → Job Applicant → Person relation supplies internal identity; missing historical/imported links are not inferred by name or phone. Full internal/former-employee identity reconciliation remains open.

The candidate panel shows the original referral, relationship, initial classification and the existing permanent outcome-lock state in Arabic/English. The snapshot is immutable even before closure. Referral replacements, voids, primary/influencing changes and the bonus decision/history/register remain separate unfinished work. Legacy referrals are not assigned a fabricated employee or bonus decision.

## Verification

- Schema installed twice on isolated parity/review sites without changing existing business-record hashes: `evidence/referrals-schema-2026-10-14.json`.
- **63 native checks passed:** 14 referral, 14 agency, 14 source and 21 recovery checks in `evidence/s2-regression-0a6f4e617c9b.json`. Includes employee selection/version/status, empty-register fallback, policy versions, influencing referrals, recent/old applications, first referrer, known linked self/internal identity, immutable/native evidence, rollback and revoked-access replay. The internal-employee test seeds an established link; it is not proof of joining or employee-import integration.
- **21 final connected browser checks passed:** `../portal/evidence/referrals-54570a10c5b0/results.json`. Includes English primary intake, a lost-reply retry, simultaneous competing referrers, Arabic mobile influencing intake, native-read denial, revoked scope and preservation of existing applications/profiles/capacity. Four final captures were manually inspected; see `visual-review.json` alongside the results.
- **64 read-only review checks passed:** `../portal/evidence/review-work-1792009646047/results.json`. The existing personal account still signs in, both languages render, and no legacy referrer or bonus decision is invented. Business records were preserved.
- Final cohort cleanup disabled six accounts, inactivated two newly created referral employees, reconciled capacity ledgers and restored feature leases. No JavaScript errors, HTTP 5xx or external requests were seen in the final run. Shared workers/scheduler and the company-data site were untouched.
- TypeScript/Vite build passed: 79 modules, approximately 697 kB JavaScript. Existing font-resolution and bundle-size advisories remain. Upstream pins are unchanged; all frozen requirement rows remain intact.

Earlier failure evidence is retained. The first native run incorrectly assumed its inherited fixture had an empty employee register and tried to seed a linked employee through the intentionally blocked live-joining shortcut; fixture setup was corrected without weakening production guards. The first browser run sent a malformed `fields` query to Frappe's native list API; the final properly encoded request proved the expected permission denial. These failed attempts are not counted as passing evidence.

Automated checks and rendered captures do not prove independent security, sustained capacity, HR wording/policy acceptance, accessibility certification or production readiness.

## Review and remaining work

Open **http://kandil-review.localhost:8112/hr-portal → Candidates → New application**. Select a referral source to choose the referring employee, or enable **Add an influencing employee referral** with an ordinary source. An application shows **Employee referral / الترشيح من موظف**. Preserved review records and accounts are not reseeded.

Next: complete reviewed referral changes/voids and HR bonus decision history/register with permanent outcome locks and current authority; finish dedicated source changes, advertisements/apply links and subscription credits. Continue private candidate documents/imports, internal/former identity and privacy/retention. S6–S12 interviews, offers, joining, lifecycle, reporting, independent security, representative 1,000+ account load, migration, real-role HR UAT and staged production release remain open. This increment does not certify production readiness. The goal stays active.
