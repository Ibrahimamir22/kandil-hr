# قنديل — HR implementation checkpoint

12 October 2026. Tested source: `9066ce0fbd42d13fc4a74f42d4a923c6e23c7ce9`.
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

**69 passed / 7 partial / 4 blocked**, up from 68 / 8 / 4. The 80 frozen case definitions are unchanged; these are technical results, not HR acceptance or effort percentages. This checkpoint closes the hiring-request mail-sink case.

- **Private hiring notifications:** successful local outbox delivery now creates one immutable MIME capture and one local notice atomically. Retries preserve both identities. Recipient access is checked against current request scope; disabled or revoked recipients receive neither. Status is **Captured locally**. No email provider is called.
- **Current authority:** exact frozen Board Vice recipients are supported. A queued delegate notice rechecks APPROVALS process, status, principal availability and CEO/Board rules under ordered locks. An independent-connection race confirms principal disablement after an older authorized snapshot suppresses capture and notification.
- **Revision/import audit:** JD/Grade approvals and all five import kinds retain explicit before/after projections, full JD child/content fields, reviewed raw rows/digest, exact affected records and resulting snapshots. Deterministic server invocation IDs are labeled separately from client command IDs. Audit failure rolls back business effects; replay produces one envelope. Older records are not backfilled.
- **Delegation isolation:** native Employee confirmation and Employee Transfer endpoints reject an APPROVALS-only delegate. Records, roles and grants remain unchanged, while the intended hiring approval still works. This is not the full P8 probation workflow.

A recipient can open **Kandil Mail Capture** from Desk search, open their captured request notice, and select **Download captured mail**. Other HR users cannot open that recipient's capture merely because they share the company. The browser fixture accounts have been disabled after testing. Existing private review accounts remain available through the manifest above. Earlier approved-JD document capture remains under its Documents menu.

## Verification

- **28 suites PASS** across two serial segments. The first 19 passed before a test-runner discovery-count guard stopped execution; the remaining 9 passed after updating that count for the added test. Only that test file changed between segments; product source stayed identical. Each segment has unchanged before/after hashes. New focused coverage: mail 13, Board 4, independent authority race 1, revision/import 11, native delegation isolation 2; central command-origin coverage is added. These counts are distinct from 80 baseline cases.
- **Six actual browser groups PASS**: native EN/AR forms and EML downloads, exact replay counts, same-company HR outsider 403, no client runtime errors and unchanged source hashes. Temporary downloaded MIME was checked then removed; no credentials or raw MIME payloads are included in evidence. Cleanup disabled this run's accounts and retained immutable synthetic history.
- Static checks: 204 Python, 35 JSON and 19 JavaScript files; Ruff, strict baseline/reference hashes and Arabic catalogue pass. There are 1,224 translation rows and zero missing extracted keys. HR terminology approval remains separate.
- Independent review found and fixed non-parity audit compatibility and Board/delegation delivery issues. Initial focused content/timestamp failures and the test discovery-count failure are retained with their corrections. A local Python 3.12 AST attempt was incompatible with this pinned Python 3.14 source; checks were rerun with Python 3.14.6.
- Only 8102 received schema changes. Earlier 8100/8101 were not migrated or seeded. Upstream source is unchanged. No production deployment or external transport is claimed.

Evidence: [serial 28](evidence/revision-mail-final-2026-10-12.json), [browser 6](evidence/browser/mail-capture/a173fb4920ce/results.json), [cleanup](evidence/browser/mail-capture/a173fb4920ce/cleanup.json), [static](evidence/revision-mail-static-2026-10-12.json), [review findings](REVISION_MAIL_REVIEW.md), [case mapping](../phases_0_3/ACCEPTANCE_EVIDENCE_MAPPING.md).

Prior checkpoint `428f5c38579065beb65cb5635b730face3251fb5` retains [three 20-call HTTP races](evidence/audit-document-http-2026-10-12.json), [JD/browser 7](evidence/browser/document-delivery/dd8be062a154/results.json) and [PDF visual review](evidence/browser/document-delivery/dd8be062a154/pdf-visual-review.json). Those observations keep their original source/time; they are not relabeled as fresh runs of this commit.

## Remaining work

Seven cases remain partial: complete audit adapter inventory, override/operator governance, exact pending reservation 2→3, durable shortage-denial history, full probation isolation and the overdue-document payroll-isolation clause. Original joining/delegation/native/system audit adapters remain. Frozen DOC-002 overdue-document automation belongs to P7 and is absent; the exact P1 case is retained as a dependency, not replaced by a no-op.

Four blocked cases require actual MFA/new-device/idle proof, external identity mapping/provider failure, and protected external audit anchors. HR/IT must choose identity/recovery policy and audit custody. HR must review authority/headcount policies, terminology and real employee mapping. No Odoo, BioTime, Sheets, payroll or AI integration is claimed complete.

A fresh restore of the eventual release, final review, release tag and human HR UAT remain. Previous restore evidence covers an earlier source checkpoint. Use the [bilingual runbook](../phases_0_3/TEST_RUNBOOK_AR_EN.md) and tracker for local review.
