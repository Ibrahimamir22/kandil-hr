# Sprint 2 — job descriptions in the custom portal

13 October 2026. Engineering increment; S2 and the full HR goal remain in progress.

## Delivered workflow

Open `http://localhost:8102/hr-portal` → **Job descriptions / الوصف الوظيفي**.

1. An authorized company-wide HR author selects a scoped active position and creates a draft. Search and position/revision lists are paginated on the server.
2. Enter Arabic/English purpose, qualifications, experience, skills, working conditions, certificates, structured responsibilities, KPIs, authorities and competencies. The editor preserves legacy responsibility text when present.
3. Save, reopen and edit the author's draft. The server reuses native JD validation: 3–16 responsibilities, level-band warnings/reasons, weighted KPI total of 100%, and zero weight for monitoring indicators. Native mandatory row fields remain enforced; the current schema requires the primary purpose/indicator/formula fields even when Arabic alternatives are supplied.
4. A separate **Kandil Sector Approver** with whole-company management scope reviews the content/date/weights and approves. This is the existing JD domain rule, not a new HR → CEO policy. The user-selected HR → CEO route continues to apply to individual position assignments.
5. Approved records cannot be edited. **Create new revision** copies editable content into a new draft with a later effective date and a predecessor link. Approval rechecks that it supersedes the latest approved version for that company/job; competing stale successors cannot both advance the chain.
6. Open Arabic or English JD and worker-card HTML through the existing scoped view/print endpoint. Draft output remains labelled unapproved. Salary and grade references are absent from the portal projection/documents.

Changes extend the existing `kandil_hr` app and React portal. No upstream source, database engine or schema changed. No migration, real employee data, Odoo connection, outbound email or production deployment was performed.

## Controls and limits

- Personal session + CSRF, native permissions, company/department/branch scope and live locked role/grant checks protect commands and receipt replay.
- Whole-company management is required to author/review; narrower readers retain scoped read access where native permissions permit it. Guessed IDs and document URLs cannot bypass scope.
- Draft author/position/predecessor identity is fixed for an edit. Unknown/protected fields, oversized content/rows and stale versions are rejected.
- Company locking and per-actor command receipts cover duplicate saves and approval retries. The UI retains the same command ID when the mutation succeeds but the following detail response is lost.
- Creation and edits have private immutable audit envelopes. Creation explicitly records absent before-state; updates capture the existing revision. Approval continues to use the established revision audit. Ordinary users cannot read raw envelopes.
- Hidden grade references remain untouched on an existing draft edit. A new successor does **not** silently copy a sensitive grade-band link. Grade administration is outside this portal slice and needs separate authorized handling.
- Current UI shows version identifiers/predecessor and independent approval metadata. Complete JD/assignment/structure history comparisons remain S2-05 work.

## Verification

- [58 native checks passed](evidence/s2-regression-388118be3749.json): 12 JD portal contracts, 15 audit primitives/database checks, 11 revision/import audit checks, 9 organization read checks, and 11 existing portal command checks. Synthetic rollback fixtures, unchanged Python source.
- Final [20 browser/API checks passed](../portal/evidence/jd-1baa1b2ba681/results.json), including lost-response save recovery, real English author and Arabic mobile reviewer sessions, simultaneous duplicate approvals, version preservation, scope denial and all four document views. [Arabic mobile](../portal/evidence/jd-1baa1b2ba681/approved-ar-mobile.png) and [English desktop](../portal/evidence/jd-1baa1b2ba681/revision-en.png) captures are included. The preceding 19-check run is retained separately.
- TypeScript + Vite build passed (35 modules). Runtime-local font warnings remain build-time warnings; English desktop and Arabic mobile screenshots were visually reviewed and text rendered correctly.
- Intermediate native evidence is retained: first attempt lacked Docker socket access; subsequent tests exposed missing draft-audit operation/creation-state support; one test needed HTTP-equivalent date serialization. Fixes preserve permission checks. The final affected suite passes.
- First browser attempt used an incorrect harness selector (`.jd-changes`); corrected to the actual `.job-descriptions` page. That cohort's six accounts were disabled with zero current commitments. Final cohorts likewise retain synthetic history and retire all temporary accounts.

## Still required

S2-04 is **in progress**, not fully accepted: PDF pagination/rendering, mail delivery/capture UI and document acceptance remain separate evidence requirements. The existing PDF backend alone is not fresh PDF proof. ORG-003 includes email and must not be marked complete on HTML views alone.

Finish S2 history/difference presentation and review the actual organization/JD terminology and layouts with HR. All 98 frozen requirement IDs and the historical 72 passed / 4 partial / 4 blocked acceptance baseline remain unchanged. Identity/MFA, independent security, sustained load for 1,000+ accounts, production hosting, monitoring/recovery, real-data migration and HR/IT/UAT gates remain open.
