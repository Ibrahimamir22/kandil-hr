# S5 reviewed talent-pool membership and scoped discovery

Engineering increment: 2026-10-14. All 98 frozen requirements remain in scope. CAN-008 and S5 remain partial: membership and discovery are connected; matching, pool-to-vacancy intake and cancellation disposition consumers remain unfinished.

## Reference alignment

The pinned reference `src/Pool.gs` requires job-family/category and profile/job-derived tag suggestions, recruiter confirmation, add/update/remove, category/tag/text discovery and reuse on an open vacancy. This increment implements the membership/discovery part. The earlier separate pool policy/consent checkpoint remains a dependency. No employer wording, retention period or consent is invented.

The custom website uses Frappe sessions and the existing Kandil application/person permissions. It does not copy records to a separate frontend database or change upstream Frappe HR.

## Delivered behavior

- Explicit reviewed add/update/removal, up to ten bounded tags, an optional configured job family, a private note and a required reason. Suggestions come from the permitted requested position's job family and current profile/opening values; the recruiter confirms or edits them.
- One current membership per person/company, represented by ordered immutable events. Each addition is bound to the exact POOL grant reviewed at that time. Expiry and withdrawal remove it from eligible discovery immediately, without a scheduler. A later grant does not reactivate the old entry; another reviewed membership action is required.
- Removal preserves recorded category/tags/note and history. It neither withdraws POOL consent nor deletes the application or APPLY evidence. Membership changes do not change application stage, person profile or headcount.
- Company locking, current application/person versions, expected membership/consent events, and exact command retries prevent stale or concurrent changes from overwriting each other. A retry after removal returns its original receipt without restoring membership. Current authority is rechecked before every replay.
- Native membership record APIs cannot read, edit, copy, delete or rename the private evidence. Current source-application access is required before viewing or changing membership via another same-person application.
- Paginated search uses current permitted person profiles and source applications, literal text/tag matching and category filtering. Counts and category facets apply the same search/tag/permission/consent conditions. A restricted person's name, notes or category count cannot be exposed through a visible application. Results open the source application; they do not yet represent the reference's latest-application projection.
- AR/EN membership editor, reasoned removal, private history and separate Talent pool navigation/search. Uncertain requests freeze the reviewed payload and offer an exact retry. After a full reload the user reviews current membership/history before another action; this panel does not claim durable encrypted cross-reload command recovery.

## Verification

- `evidence/talent-pool-schema-2026-10-14.json`: empty-schema installation and repeat-install on isolated parity and preserved review left existing hashed business records unchanged. No company-data site or shared worker backlog was touched. The initial pre-mutation attempt found a Python syntax error; it was corrected before the successful migration.
- `evidence/s2-regression-226a98974224.json`: **42 native checks passed**, no skips, Python sources unchanged and fixtures rolled back: 20 membership/discovery, 17 pool policy/consent and five corrected-profile search tests. Includes real native User Permissions, current source restrictions, configured family suggestions, same-person membership, expiry/renewal, rollback, immutable evidence and exact retry behavior.
- `../portal/evidence/talent-pool-1e34067a2713/results.json`: **29 connected browser checks passed**. Includes real membership form and lost-response exact retry, Arabic tag search and source navigation, concurrent identical commands, competing update/removal and withdrawal, no automatic reactivation after renewed consent, native event-read denial, revoked authority, literal wildcard queries and scoped counts. Applications/people/capacity remained unchanged; six temporary users were disabled, fixture ledgers zeroed and feature leases restored. No browser errors, unexpected 5xx or external requests.
- The earlier `talent-pool-bf67c17ed298` run passed 21 checks before a harness assertion incorrectly expected an empty list for an outsider account configured only as Requester. It correctly received 403. The assertion now requires 403 for that non-recruiter; recruiter record/grant filtering remains independently tested. No application access rule was relaxed.
- Four final rendered captures were inspected; see `../portal/evidence/talent-pool-1e34067a2713/visual-review.json`.
- `../portal/evidence/review-work-1792004704550/results.json`: **46 read-only AR/EN checks passed**, preserved business records unchanged. Personal recruiter access sees the new pool navigation and truthful empty membership/consent states. Policy publication rights and credentials were not changed.
- TypeScript/Vite build passed with 74 modules. Existing font-resolution and bundle-size advisories remain. These tests do not establish production throughput or accessibility certification.

## Review

Open `http://kandil-review.localhost:8112/hr-portal`:

1. **Talent pool / قاعدة المرشحين**: search, tag filter, permitted category counts and paginated results. The preserved dataset is empty because no actual employer policy or candidate POOL consent was seeded.
2. **Candidates / المرشحون → an application → Talent-pool membership / عضوية قاعدة المرشحين**: current status and immutable history. Adding requires a current separate pool grant; refresh membership after recording a consent choice.
3. **Talent-pool consent / موافقة قاعدة المرشحين** remains separate. Removing membership and withdrawing consent have different recorded meanings.

## Still required

- Reference-complete pool reuse: permission-scoped latest application/status projection, matching and reviewed add-to-open-vacancy with explicit source attribution, duplicate prevention, fresh consent/version/authority checks, safe retry and connected tests.
- Vacancy cancellation/transfer dispositions, reviewed former/internal-candidate and rehire restrictions, small-batch sourcing/imports, private CV/documents and candidate self-service.
- Public optional POOL consent, data-subject identity checks, AI opt-out, purpose-specific privacy, retention/holds/export/erasure and HR/privacy-owner acceptance.
- Remaining interviews, offers, joining/onboarding, lifecycle/reporting and all security/capacity/UAT/migration/release gates in S6–S12. Existing S2–S4 acceptance gaps remain explicit in the tracker.

The full goal remains active. This is synthetic engineering evidence, not production or HR acceptance.
