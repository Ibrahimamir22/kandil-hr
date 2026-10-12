# قنديل — HR implementation checkpoint

12 October 2026. Tested source: `1ea28738982841adf475681f03bbf349b28c6ef7`.
The goal remains active. This is a local development checkpoint; P0–P3, HR acceptance and production release are not complete.

## Repository and scope

Private custom source: [Ibrahimamir22/kandil-hr](https://github.com/Ibrahimamir22/kandil-hr). Official Frappe, ERPNext and HRMS clones remain separate, clean and pinned. Odoo, other departments and production are outside this goal. Five sprints and 31 tasks use four parallel source lanes; shared database work runs serially. The tracker updates at verified checkpoints, not continuously.

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


## Current acceptance

**70 passed / 6 partial / 4 blocked**, up from 69 / 7 / 4. All 80 frozen definitions remain unchanged. These are technical results, not HR acceptance or effort percentages. AT-AUD-001-01 now passes against the finite original P0–P3 decision inventory.

- **Joining:** exact submitted outcome and actual source/effect records captured atomically. Replay returns the original Employee/Assignment/Onboarding without refreshing the stored ledger. Twenty concurrent original calls create one effect set; twenty later replays preserve state despite a synthetic dated occupancy discrepancy.
- **Delegation:** create, CEO decide, scope/date revision and fresh revocation retain before/after, actor/principal, reviewed input and timestamp. Native observed deltas are distinguished from endpoint commands; hooks do not create duplicate envelopes.
- **Native organization changes:** occupied baseline reconciliation retains previous/new count, basis and as-of date plus exact invocation. Department records retain explicit native field deltas and reviewed version.
- **Disabled recruiter cleanup:** original actor or explicitly unknown scheduler is distinct from the system executor. Private opening/application audits survive Applicant deletion; shared events omit private task content. Audit failure rolls back all handoff effects and preserves pre-existing callbacks. Separate application records and Long Text storage handle aggregate and individual histories above 64 KiB.

Previous private hiring-notification and approved-JD capture behavior remains covered by regression. Local capture does not send provider email. Older audit records are not backfilled.

## Verification

- **31 suites PASS in one uninterrupted serial gate**, with unchanged application hashes. Dedicated audit suites include foundation15, recruitment8, delegation8, joining8, handoff7, revision/import11; counts are regression tests, not the 80 baseline cases. Handoff storage tests include 20 Applicants with aggregate Arabic content above 64 KiB and a valid 64,800-byte legacy source reason whose full audit exceeds 65,535 bytes.
- **Two 20-call ordinary-session HTTP batches PASS:** one original joining effect/audit; later replay preserves exact result, counts and record fingerprints. The later closed assignment is explicitly labeled CLI-only synthetic historical seeding, not an allowed backdated product edit or production load certification. Cleanup disables the run's four accounts, releases commitments and retains synthetic audit history.
- Static: 210 Python, 35 JSON, 19 JavaScript files; Ruff, strict baseline/reference hashes and Arabic catalogue pass. 1,225 translations, zero missing extracted keys. HR terminology review remains separate.
- Independent review found and corrected both aggregate and individual TEXT-storage overflow. Focused fixture/exception mismatches, the pre-migration storage failure, and the source-changing preliminary gate are retained. They are not labeled as passing frozen-source evidence.
- Only 8102 was migrated and seeded. Official Frappe/ERPNext/HRMS repositories stay clean at pinned versions. 8100/8101 were not migrated or seeded. No production deployment or external transport.

Evidence: [31 suites](evidence/decision-audit-frozen-2026-10-12.json), [joining HTTP](evidence/joining-http-2026-10-12.json), [static](evidence/decision-audit-static-2026-10-12.json), [review](DECISION_AUDIT_REVIEW.md), [finite inventory](../phases_0_3/DECISION_AUDIT_INVENTORY.md), [case mapping](../phases_0_3/ACCEPTANCE_EVIDENCE_MAPPING.md).

Prior tested source `9066ce0fbd42d13fc4a74f42d4a923c6e23c7ce9` retains [six EN/AR mail browser groups](evidence/browser/mail-capture/a173fb4920ce/results.json). Source `428f5c38579065beb65cb5635b730face3251fb5` retains [approval/capacity HTTP races](evidence/audit-document-http-2026-10-12.json), [JD/browser7](evidence/browser/document-delivery/dd8be062a154/results.json) and [PDF review](evidence/browser/document-delivery/dd8be062a154/pdf-visual-review.json). Those observations keep their original source/time; they were not rerun for this audit-only checkpoint.

## Remaining work

Six cases remain partial: exact pending reservation2→3, durable shortage-denial history, full probation isolation, override governance, operational Administrator review, and the overdue-document payroll-isolation clause. The latter depends on absent P7 DOC-002; it is retained as a dependency rather than replaced by a no-op.

Four blocked cases require actual MFA/new-device/idle proof, external identity mapping/provider failure, and protected external audit anchors. HR/IT must choose identity/recovery policy and audit custody. HR must review authority/headcount policies, terminology and real employee mapping. Odoo, BioTime, Sheets, payroll and AI integrations are not claimed complete.

Next independent implementation: [headcount increment](NEXT_HEADCOUNT_INCREMENT.md). A fresh restore of the eventual release, final review, release tag and human HR UAT remain. Previous restore proof covers an earlier source. Use the [bilingual runbook](../phases_0_3/TEST_RUNBOOK_AR_EN.md) and tracker for local review.
