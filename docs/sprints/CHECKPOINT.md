# قنديل — HR implementation checkpoint

12 October 2026. Tested source: `11936e50f9faa51b16f5d884ab9ed3616c67993b`.
The implementation goal remains active. This is a local development checkpoint;
P0–P3, HR acceptance and a production release are not complete.

## Code and repository

The private custom repository is [Ibrahimamir22/kandil-hr](https://github.com/Ibrahimamir22/kandil-hr).
It contains Kandil code, schemas, native Frappe forms/queue, AR translations, tests,
evidence and a pinned installation package. Official Frappe, ERPNext and HRMS
clones remain separate and unchanged. Odoo and other company departments remain
outside this HR implementation.

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

**58 passed / 15 partial / 7 blocked**, up from 45 / 27 / 8. The 80 original case
definitions are unchanged; 13 cases gained sufficient technical proof. These are
case results, not effort percentages or human HR acceptance.

Newly implemented and verified:

- **Recruitment ownership:** one explicit responsible owner and next-action owner
  per live application, reasoned reassignment, visible HR fallback and no guessed
  replacement. Committed account disable moves affected live ownership to unassigned,
  preserves history/task text and survives two users disabled in one transaction.
  A rolled-back disable leaves ownership intact. Source tasks mean application
  next actions; generic Frappe ToDo is outside this proof.
- **Joining correction:** configured scoped HR can void an unused erroneous external
  hire. Original offer/Employee/assignment/onboarding history stays stored, the
  Employee becomes inactive, occupancy drops and the open vacancy returns. Full
  parents reopen; held/frozen state remains. Replay, failure rollback, forged
  markers and downstream-use denials pass. Payroll Entry child references are
  checked; no payroll reversal or transfer correction is implemented by this action.
- **Organization:** preview reports every unmatched Employee/Position reference.
  Repeated reviewed imports do not double occupancy. Identical titles in two legal
  entities resolve separate authority. Scoped structure owners maintain native
  Departments with reasons and immutable audit; ordinary requester edits to the
  same record fail through authenticated REST. Payroll cost center edits are excluded.
- **Native review UI:** own-only requests versus organizational scope, read-only
  event timelines with exact actor/principal/time, delegated decisions and escaped
  notes, verified in English and saved Arabic/RTL accounts.

Earlier approved-request corrections, structural Return, reviewed external-code
imports, private-note boundaries, session revocation and company/branch access
remain in the case mapping with their original evidence commits.

Use the bilingual [ownership and joining review guide](../phases_0_3/OWNERSHIP_AND_JOINING_REVIEW.md)
alongside the [test runbook](../phases_0_3/TEST_RUNBOOK_AR_EN.md). The Applicant
ownership and Void Incorrect Joining controls have native/API tests but their
browser interactions are **not yet verified**. Existing review fixtures are synthetic;
joining/ownership regression fixtures were rolled back or specifically cleaned.
Do not expect them to remain as browser demonstration records.

## Verification at this checkpoint

- **13 serial suites passed with unchanged source:** organization 47 native checks
  plus 15 acceptance groups; occupancy 9; recruitment 26; contracts 9; approved
  corrections 6; joining 11; joining corrections 11; ownership 10; callback queues 2
  (pure mocked); request review 5; SLA 9; privacy 8; payroll boundary 3.
- **Committed callback proof:** six checkpoints, including two disabled accounts in
  one commit, savepoint rollback followed by commit, repeat cleanup and restoration
  of original settings. 111 captured synthetic documents/children cleaned.
- **Browser/API:** six grouped native UI checks plus authenticated same-record
  requester REST denial. The requester could GET the unit (200), modified save
  returned 403 and the complete stored-record hash stayed identical. Temporary
  read grant revoked and requester disabled again.
- **HTTP concurrency:** three batches of 20 overlapping calls. Five seats admitted
  five submissions; repeated manager and final HR approvals each advanced once.
  Synthetic cleanup restored the capacity ledger; no external email.
- **Static:** 171 Python, 32 JSON and 16 application JS files passed syntax checks;
  Ruff and staged known-credential/private-key scanner passed. 98 baseline IDs,
  40 selected requirements and 80 cases preserved, six reference hashes verified.
  All 944 extracted keys exist in the 1,029-row Arabic catalogue. Translation
  coverage does not substitute for HR terminology review.
- Official Frappe, ERPNext and HRMS trees remain separate and unchanged. Current
  parity service is loopback 8102. Earlier 8100/8101 sites were not migrated or seeded.

[Combined evidence](evidence/ownership-joining-summary-2026-10-12.json),
[serial regression](evidence/ownership-joining-final-2026-10-12.json),
[HTTP concurrency](evidence/ownership-joining-http-2026-10-12.json) and
[case mapping](../phases_0_3/ACCEPTANCE_EVIDENCE_MAPPING.md) distinguish current,
historical and remaining proof. Initial failures and corrected findings remain
in the history.

## Next work and limits

Next source/test work covers the remaining independent-authority and delegation
clauses, Board proof and actor audit, completion notices, document delivery and
native Applicant/joining-correction browser acceptance. Unresolved policy/provider
choices must remain explicit; this checkpoint does not invent HR approval.

HR/IT decisions remain for identity/MFA/recovery, personal-interest and CEO/Board
routes, headcount exceptions, real employee mapping, Arabic terminology and external
audit-seal custody. Their owners and impacted cases are in POLICY_DECISIONS.md.

A fresh install/restore rehearsal of the eventual release, independent final review,
release tag and HR UAT remain. Historical restore proof covered an earlier checkpoint.
No production migration, provider/email, Odoo, BioTime, Sheets or AI integration is
represented as complete. P4–P10 and the broader company platform remain separate.

Specific limits: unused external-hire void supports the pinned native HR/payroll
reference set, not arbitrary future custom integrations. Generic task ownership
is not covered. Parent units must precede children; existing shared titles require
reviewed mapping. Registry contention can require a transaction retry. Historical
snapshots are not rewritten, and old pending requests without a headcount basis
must be returned and freshly reviewed.
