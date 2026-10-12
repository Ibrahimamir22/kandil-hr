# قنديل — HR implementation checkpoint

12 October 2026. Tested source checkpoint: `d3e2c66100926cfa8ad8f886e6a3debf5a4c0865`. The implementation goal remains active. This is a development checkpoint, not completion of P0–P3, HR acceptance, or a production release.

## What exists

The private custom app repository is [Ibrahimamir22/kandil-hr](https://github.com/Ibrahimamir22/kandil-hr). It contains Kandil code, DocType schemas, native Frappe forms and queue, Arabic translations, tests, evidence, and a pinned installation package. Frappe Framework, ERPNext and HRMS are separate official dependency clones. Odoo and the broader company platform remain outside this work.

Implemented areas include scoped access, private files, local audit records, transactional notifications, business calendar and reminders; positions/hierarchy/assignments, structural review and JD versions; multi-location requests, approvals, revisions, reservations, vacancies, recruiter teams and priority queue. Exact limitations are recorded case by case.

## Review it locally

Open **http://localhost:8102/login**. This is the new synthetic P0–P3 review site. Port 8101 remains the earlier pilot; do not judge the new implementation from that older site.

Use the generated ordinary role accounts in the private local file:

`development/frappe-bench/sites/kandil-parity.localhost/private/kandil-review.json`

That path is relative to the parent `Kandil_HR_Dev` workspace. It is deliberately excluded from Git. Choose `requester`, `manager`, `hr`, `sector` or `organization` for the corresponding review; `outsider` is a negative-permission account. Avoid Administrator when reviewing business permissions.

| Role | Review path | Expected result |
|---|---|---|
| Requester | `/desk/kandil-hiring-request/cvcic163jg` | Own synthetic draft and native Submit for Approval action |
| Manager / HR | `/desk/kandil-hiring-request/cvds1h2rbk` | Request approved by actual native manager/HR buttons; both approval records retained |
| HR | `/desk/kandil-vacancy-queue` | Two openings from that request assigned through the native bulk dialog; one was opened for intake |
| HR | `/desk/job-opening/HR-OPN-2026-0004` | Open vacancy with assigned recruiter team and guarded actions |
| Organization reviewer | `/desk/kandil-organization-import/REC-9f49a7984b-CSV-REVIEW` | Draft CSV import; Load CSV validates first, then explicitly loads unsaved rows. Independent review/apply remains separate. |
| Organization reviewer | `/desk/kandil-jd-revision/REC-9f49a7984b-JD-REVIEW` | Approved revision; Documents menu provides AR/EN JD and worker card HTML/PDF |
| Outsider | Known request/JD URLs | Access denied; recruitment queue contains no out-of-scope records |

These IDs are synthetic examples on this machine, not portable installation defaults. The private manifest is the authoritative record of generated fixtures. The automated workflow deliberately advanced its pending request; do not rerun that one-shot mutation script against the already-completed scenario and interpret state-precondition failures as product defects.

For Arabic, set the account's language to Arabic and reload. Native request/queue desktop and mobile RTL were checked using the saved user language, not only a URL parameter. HR must still review the business terminology.

## Latest checkpoint

Strict baseline: **28 passed /42 partial /10 blocked**. These are 80 requirement cases, not percentages of implementation effort. HR acceptance remains pending.

- Dated assignments now drive headcount at recruitment and structure command boundaries. Imported discrepancies require explicit authorized reconciliation with immutable audit. Earlier commitments are tracked through vacancy-to-employee conversion.
- Confidential HR notes are separate immutable records. HR can create them through the native form; requester responses, notices, timeline, print and exports exclude them. Noted request scope cannot move. Public decision reasons remain public.
- Notification delivery rechecks current scope, account and roles after acquiring locks. Explicit concurrent revocation probes passed; already delivered notifications are not retroactively removed.
- Priority audit records use the live score; exact priority, duplicate-line, quantity, delegation duration, notification-recipient and historical-revision cases passed.
- Organization revisions render their stored EN/AR relationships independently. Approved JD and historical organization records reject native mutation/deletion.
- Recruitment roles are denied payroll mutation endpoints. Existing recruitment jobs leave payroll records unchanged; future overdue-document automation is still absent.

**New note walkthrough:** log in as `hr`, open the approved request from the private manifest, click **Add Confidential HR Note**, enter text and save. The saved record is immutable; corrections require a new note. As `requester`, the note controls and data are absent. A synthetic saved note is listed as `docs.confidential_note` in the private manifest.

## Evidence, with limits

- Serial checkpoint: occupancy9, organization47 plus8 exact cases, recruitment26, joining11, SLA9, privacy8, payroll3, acceptance7, foundation52 mixed checks and organization independent-connection6 all passed. The initial SLA launcher entry-point failure is preserved; continuation changed only test wiring. See `evidence/checkpoint-summary-2026-10-12.json`.
- The browser exposed a note-form create permission issue; the fix then passed all8 privacy checks and4 native/HTTP note checks. Six AR/EN desktop/mobile checks passed afterward. Note form strings are statically translated; this is not a full Arabic note-form UAT.
- Outbox revocation5, existing outbox races5 and native access3 passed earlier in this checkpoint at their recorded hashes. These are technical probes, not sustained production load tests.
- Three HTTP race batches checked 20 submissions competing for five seats and 20 identical manager/final approvals. Each replay advanced once; excess requests were controlled rejections.
- Eight independent database workers proved one outbox identity, one delivered local notification, rollback recovery and no outbound email.
- Native browser checks cover English/Arabic screens, mobile overflow, ordinary-account boundaries, manager/HR approval buttons, bulk assignment and vacancy opening.
- Native CSV file selection, normalized preview and explicit local draft load passed. A fresh server read proved the preview did not save or apply data.
- Four actual HTTP PDF downloads and authorized/unauthorized JD document checks passed. Separate visual samples show readable Arabic and English.
- A separate fresh sandbox booted the pinned upstream stack. A synthetic restore retained database IDs, private file bytes and an encrypted field, then migrated. It was a blank-company development rehearsal, not production disaster-recovery certification.
- Existing main/pilot login endpoints and the old pilot's review offer remain available. This was read-only smoke; the unchanged older process was not a complete regression of current phase code.

Use `ACCEPTANCE_EVIDENCE_MAPPING.md` under `docs/phases_0_3` for each baseline case. Partial technical evidence is distinct from HR approval. Missing clauses stay partial or blocked.

## Still required

Complete the remaining42 partial and10 blocked cases: identity/MFA/provider rules; CEO/Board delegation and self-interest proof; audit-key/external-seal custody; selected structural scheduling, JD review/distribution, amendment/correction and ownership workflows; future overdue-document payroll noninterference; final source/restore checks and HR UAT. Cross-company shared-recipient contention still needs its complete proof.

Known limits: later approved exception hires beyond the frozen commitment cohort can conservatively require renewed review of earlier requests. Historical shared snapshots are not scrubbed by the new allowlist. Pending requests submitted before the new headcount basis must be returned and freshly reviewed. The current clean-checkout preflight passed; a fresh installation/restore of this exact source is still pending.

No Odoo, BioTime, Sheets, AI provider, external email or production integration is represented as complete. Production data has not been migrated. Source publication, when recorded, is a checkpoint rather than permission to deploy.
