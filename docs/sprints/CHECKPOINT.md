# قنديل — HR implementation checkpoint

12 October 2026. Tested source: `428f5c38579065beb65cb5635b730face3251fb5`.
The implementation goal remains active. This is a local development checkpoint;
P0–P3, HR acceptance and production release are not complete.

## Repository and scope

The private custom repository is [Ibrahimamir22/kandil-hr](https://github.com/Ibrahimamir22/kandil-hr).
It contains Kandil code, native Frappe forms, Arabic translations, tests, evidence
and the pinned installer. Official Frappe, ERPNext and HRMS clones remain separate,
clean and unchanged. Odoo, other departments and production remain outside this goal.

The plan has five sprints and 31 tracked tasks across four parallel lanes. Source
work runs in parallel; migrations, shared-site fixtures and integration tests run
serially. The tracker is updated at evidence checkpoints, not continuously.

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

**68 passed / 8 partial / 4 blocked**, up from 67 / 9 / 4. All 80 baseline
case definitions remain unchanged. These are technical outcomes, not an effort
percentage or HR approval. Only the approved-document output/distribution case
has gained complete acceptance evidence in this checkpoint.

Implemented and verified in this checkpoint:

- **Command audits:** recruitment and structural commands retain the exact reviewed
  payload/version, actor, acting principal, Board member/evidence when applicable,
  before/after state, related capacity/ownership effects, result and Cairo timestamp.
  Relocation includes capacity released at the old location. Failed audit insertion
  rolls back the effect and receipt. Replayed commands do not create extra audits.
- **Private audit access:** native forgery/edit/delete/rename, ordinary read/list/share,
  actual private file/download/ZIP, report and export checks pass. Stale shares are
  handled by the existing purge/strict attachment controls; database-operator tampering
  remains outside this ordinary-API guarantee.
- **Document capture:** approved JD HTML/PDF can be composed for 1–10 distinct eligible
  portal users and downloaded as private EML. External candidates, invalid addresses,
  extra recipients and out-of-scope users are rejected. Content is limited to scopes
  visible to both sender and recipient. Losing an included scope or JD print permission
  blocks subsequent access/replay/queued delivery. Old captures without valid scope
  metadata fail closed. Status is **Captured locally**; no email is sent externally.
- **Delegation:** native revocation requires a fresh reason and preserves original
  reasons and approval metadata. Date normalization fixes native JSON form saves.
  Existing CEO approval, process scopes and immutable version rules still pass.
- **Headcount:** BLOCK rejects shortage before justification handling; WARN requires
  at least ten trimmed characters and independent exception authority. The existing
  Return/revise/resubmit lifecycle proves reservation 2→0→3, without double counting.

The local capture command is under **Documents → Capture document delivery locally**
on an approved JD revision. Its sender needs current native JD read/print and manage
scope. A recipient opens the saved capture and chooses **Download captured mail**.
These actions are local review tools; no mail provider is configured. For delegation,
use **Delegation actions → Revoke delegation** and enter the new reason.

## Verification

- **23 suites** pass in one uninterrupted serial run on unchanged application source.
  Organization has 51 checks plus 15 grouped acceptance scenarios; foundation audit
  has 13 checks (5 pure and 8 native); recruitment audit has 8; delegation 10; authority
  12; document capture 13; exact headcount 4. The suite report distinguishes native,
  pure and mocked checks. These totals are separate from the 80 baseline cases.
- **7 browser groups** pass for actual English/Arabic capture, recipient EML/PDF download,
  outsider HTTP403, required revocation reason and persisted revocation. No client
  runtime errors; source hashes stayed unchanged. The two downloaded PDF attachments
  were rendered and visually checked: Arabic/English text is readable with no clipping
  in these synthetic samples. This does not certify every possible long document.
- **3 batches of 20 simultaneous HTTP calls** pass. Five seats admit five requests;
  Manager and final HR replay each produce one transition, receipt and audit. Cleanup
  restores structural5 / occupied0 / reserved0 / open0 / available5 and disables fixture
  accounts. This is a short local race test, not production load certification.
- Syntax checks cover 193 Python, 34 JSON and 18 JavaScript files. Ruff and the strict
  frozen-baseline/reference validator pass. The Arabic catalogue has 1,204 rows with
  zero missing statically extracted keys; HR terminology approval remains separate.
- Independent review found and corrected document scope/print disclosure paths.
  Follow-up review found no further actionable issue in those reviewed boundaries.
  Prior failures remain preserved, including selector, fixture and actual UI findings.
- New schema work targeted only synthetic port8102. Previous8100/8101 were not seeded
  or migrated. Browser test users were disabled; immutable synthetic history is retained.
  Queue inventory before the full run required no cleanup.

Evidence: [serial regression](evidence/audit-document-final-2026-10-12.json),
[HTTP concurrency](evidence/audit-document-http-2026-10-12.json),
[browser7](evidence/browser/document-delivery/dd8be062a154/results.json),
[PDF review](evidence/browser/document-delivery/dd8be062a154/pdf-visual-review.json),
[cleanup](evidence/browser/document-delivery/dd8be062a154/cleanup.json),
[review findings](AUDIT_DOCUMENT_REVIEW.md),
[case mapping](../phases_0_3/ACCEPTANCE_EVIDENCE_MAPPING.md).
Earlier ownership, session, authority and mobile proof keeps its own tested commit/time.

## Remaining work

The command-audit envelope still needs adapters for original joining outcomes,
JD/grade approval, imports, delegation and selected native/system operations.
See [coverage and limits](../phases_0_3/COMMAND_AUDIT_DESIGN.md).
The exact pending2→3 case, durable shortage-denial history, hiring-request mail capture,
probation isolation, overdue-document job and full override/operator governance remain
partial. JD capture does not establish hiring-request mail-sink completion.

Four blocked cases concern MFA/new-device/idle proof, external identity mapping/provider
failure and externally protected audit seals. HR/IT must choose identity and recovery
policy and audit-anchor custody. HR must review authority/headcount policy, terminology
and real employee mapping. No provider, Odoo, BioTime, Sheets, payroll or AI integration
is claimed complete.

A fresh restore rehearsal of the eventual release, final independent review, release
tag and human HR UAT remain. Historical restore proof covers an earlier checkpoint.
The bilingual [test runbook](../phases_0_3/TEST_RUNBOOK_AR_EN.md),
[ownership/joining guide](../phases_0_3/OWNERSHIP_AND_JOINING_REVIEW.md) and tracker support
local review. P4–P10 and the broader company platform are separate milestones.
