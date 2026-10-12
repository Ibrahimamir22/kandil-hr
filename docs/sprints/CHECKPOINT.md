# قنديل — HR implementation checkpoint

12 October 2026. Tested source checkpoint: `daf3685df4418bd8ce21129e64e61a4d5e95b3bd`. The implementation goal remains active. This is a development checkpoint, not completion of P0–P3, HR acceptance, or a production release.

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

## Evidence, with limits

- Final frozen-source suites passed 186 checks: foundation 52 (25 native, 14 pure, 13 mocked), organization 47 native +35 pure, recruitment 26, joining 11, SLA 9, priority 6. These are technical checks, not a project-completion percentage.
- Independent connection gates passed: organization 6, authorization mutation 4 and outbox 5. Strict baseline assessment: 10 passed, 53 partial, 17 blocked; HR acceptance remains pending.
- Three HTTP race batches checked 20 submissions competing for five seats and 20 identical manager/final approvals. Each replay advanced once; excess requests were controlled rejections.
- Eight independent database workers proved one outbox identity, one delivered local notification, rollback recovery and no outbound email.
- Native browser checks cover English/Arabic screens, mobile overflow, ordinary-account boundaries, manager/HR approval buttons, bulk assignment and vacancy opening.
- Native CSV file selection, normalized preview and explicit local draft load passed. A fresh server read proved the preview did not save or apply data.
- Four actual HTTP PDF downloads and authorized/unauthorized JD document checks passed. Separate visual samples show readable Arabic and English.
- A separate fresh sandbox booted the pinned upstream stack. A synthetic restore retained database IDs, private file bytes and an encrypted field, then migrated. It was a blank-company development rehearsal, not production disaster-recovery certification.
- Existing main/pilot login endpoints and the old pilot's review offer remain available. This was read-only smoke; the unchanged older process was not a complete regression of current phase code.

Use `ACCEPTANCE_EVIDENCE_MAPPING.md` under `docs/phases_0_3` for each baseline case. Partial technical evidence is distinct from HR approval. Missing clauses stay partial or blocked.

## Still required

Complete remaining cases and review findings (including strict in-flight notification-delivery revocation and cross-company shared-recipient contention); select and test identity/MFA/provider rules; confirm CEO/Board delegation and self-interest rules; settle audit-key/external-seal custody; finish selected structural scheduling, JD review/distribution, amendment/correction and ownership workflows; verify no payroll side effects; run final source/restore checks and HR UAT.

No Odoo, BioTime, Sheets, AI provider, external email or production integration is represented as complete. Production data has not been migrated. Source publication, when recorded, is a checkpoint rather than permission to deploy.
