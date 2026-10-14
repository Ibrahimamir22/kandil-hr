# S5 — controlled recruitment sources and application attribution

Engineering increment, 14 October 2026. The frozen 98 requirements remain unchanged. This advances SRC-001 and S5-03; it does not complete advertisements, referrals, agencies, subscriptions or S5.

## Reference and behavior

The pinned reference (`7824be24292c4743b4005e14e2df540786cfe167`) defines thirteen default sources and nine source kinds in `src/Sourcing.gs`, a source editor with active/inactive states, and a source/sub-source requirement in `src/Candidates.gs:candCreate_`.

- **Recruitment sources / مصادر التوظيف** shows company-scoped source codes, bilingual names, kind, link/paid-credit metadata, active state and ordering. Company HR authority can add a source, rename or deactivate an existing source, with reasoned immutable revisions and paginated history. Other scoped recruiters can read, not edit.
- Codes are bounded uppercase identifiers. The default CAREER_PAGE and OTHER remain active. Kind is immutable once a code exists: changing semantic kind requires a new code, so a formerly ordinary source cannot silently become an agency/referral source. This deliberately strengthens the reference's mutable kind behavior.
- Catalogue edits lock the company and current authority before checking prior receipts or versions. Stale editors fail; exact retries return the same revision. Native edit/delete/rename/copy and unrestricted audit reads are denied.
- On sites with controlled sources enabled, new manual intake requires an active source code and the reviewed catalogue version. A stale list requires another review. Source detail remains required. The dropdown and encrypted unfinished-action envelope retain that version.
- Intake atomically stores a private `Kandil Application Source` record containing the selected source definition, catalogue version, sub-source and hash. Source capture failure rolls back the person/application/command effects. Candidate detail shows the name recorded at creation, rather than relabelling history from the current catalogue.
- A later rename/deactivation does not alter existing records or prevent an authorized exact receipt replay. Old receipts without catalogue versions remain replayable; old application source values are preserved and receive no fabricated source snapshots.
- Generic intake cannot stand in for dedicated REFERRAL, AGENCY, INTERNAL or POOL handling. These kinds are shown as unavailable in the generic dropdown and rejected server-side. The already implemented pool intake can resolve TALENT_POOL under its reviewed eligibility checks and capture its source definition. Referral, agency and internal-candidate consumers remain required unfinished work.
- Link and credit fields are descriptive configuration only. They do not create public application links, publish advertisements, consume credits, buy subscriptions, or prove where a real candidate came from.

## Rollout boundary

`kandil_source_catalog_enabled=1` opts a site into controlled-source writes. It is enabled only on the preserved **synthetic review** site and temporarily leased during isolated browser testing. The company-data site and upstream Frappe/ERPNext/HRMS source are untouched. The base legacy mode is retained for staged compatibility, not claimed as controlled-source acceptance. Production installation must explicitly enable the control after historical-source review and complete the remaining source workflows.

New tables were installed idempotently on parity and review with all existing business-record hashes unchanged: `evidence/source-catalog-schema-2026-10-14.json`. Review activation preserved those hashes: `evidence/source-catalog-review-activation-2026-10-14.json`. Email and background workers remain disabled; no credentials or account rights were changed.

## Verification

- **52 native checks passed:** 14 new source tests, 17 identity and 21 recovery regressions. Evidence: `evidence/s2-regression-990223b8e4ee.json`.
- **54 final preserved-review browser checks passed**, including AR/EN source visibility, personal read-only rights, controlled intake choices and unchanged review business records. Evidence: `../portal/evidence/review-work-1792007434810/results.json`.
- **24 connected browser checks passed:** real source selection/intake, lost-response retry, competing edits, stale versions, revocation and historical attribution. Evidence: `../portal/evidence/sources-8324e00b64c4/results.json`. All six disposable accounts were disabled, fixture ledgers cleared and both feature leases restored.
- Four rendered English desktop / Arabic mobile captures were visually reviewed; see `../portal/evidence/sources-8324e00b64c4/visual-review.json`. This is engineering review, not HR acceptance.
- Build passed with 76 modules. Existing font-resolution and bundle-size advisories remain; this is not sustained-capacity or accessibility certification.
- Initial browser findings: bilingual select controls needed explicit accessible labels; the test also needed to read native option `disabled` properties and enable its disposable intake lease. These changes preserve server-side denials and are covered by the final browser run.
- Initial native failures were fixture errors: a nonexistent outsider fixture key and nested fixture creation while the identity guard was already enabled. Both were corrected without weakening product permissions.

## How to review

Open **http://kandil-review.localhost:8112/hr-portal** → **Recruitment sources / مصادر التوظيف**. The existing personal account can inspect the catalogue; it does not gain company-wide configuration authority. In **Candidates → New application**, choose a vacancy to see controlled source choices. No application is submitted simply by inspecting the form.

## Remaining requirements

Finish source attribution corrections/locks, referral identities and agency terms/ownership, internal/former-employee restrictions, advertisement generation and server-resolved apply links, subscriptions/credits/expiry alerts, batch imports, private documents, public privacy/retention workflows and human source-policy acceptance. All S6–S12 interview, offer, joining/lifecycle, reporting, independent security, 1,000+ capacity, migration/UAT and production gates remain open. The overall goal stays active.
