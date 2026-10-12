# قنديل — HR implementation checkpoint

12 October 2026. Tested source: `df95160b35002edd7fd62ff730b9bd611e5e7317`.
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

**67 passed / 9 partial / 4 blocked**, up from 58 / 15 / 7.
Nine original cases gained sufficient technical proof. All 80 definitions remain
unchanged. These are technical case results, not effort percentages or HR approval.

Newly implemented and verified:

- **Delegation:** APPROVALS, TEAM and ALL are explicit capabilities. CEO delegation
  remains Pending CEO until the configured CEO approves it. Scope changes create a
  new version and revoke the former grant without rewriting its history. Disabled
  principals, revoked grants and revoked scopes fail the next decision. Legacy
  records missing approval metadata remain inactive until explicitly reviewed or
  replaced with a new version; they can still be revoked.
- **Migration safety:** the approval field has no automatic Active default. Five real
  schema checks prove that an older row remains NULL when the column is added. One
  already-disabled synthetic legacy grant from the intermediate local schema was
  individually revoked with its audit retained; no blanket grant update occurred.
- **Independent authority:** creator, requester, beneficiary and own-position
  interests are frozen. An interested delegate cannot act for an independent
  principal. Interested HR/Sector routes require an independent CEO. Vacant manager
  levels retain a reason and notify HR once.
- **Board:** CEO decisions precede Board decisions. The frozen Chairman or Vice may
  decide directly. A frozen Sector recorder must identify the deciding member,
  method, explanatory note and private request-specific evidence for an external
  Board decision. Actor, original principal and actual member remain distinct.
- **Completion:** the last filled, closed or cancelled vacancy closes its parent
  and queues one completion notice. Partial fill and replay preserve the correct
  remainder, ledger and notice count.
- **Applicant/joining UI:** English and Arabic owner assignment, next actions and
  incorrect-joining reversal have browser proof plus authenticated HTTP denial and
  replay checks. The earlier User autocomplete finding led to a bounded eligible
  team-member Select; its later browser evidence is separate.

Earlier ownership/disable callbacks, safe joining correction, structural approvals,
imports, scope/session security, reviewed documents and request timeline evidence
remain linked to their prior source commits. Generic task ownership and downstream
transfer/payroll reversal are excluded from the implemented correction flow.

Use the bilingual [ownership and joining guide](../phases_0_3/OWNERSHIP_AND_JOINING_REVIEW.md),
[authority browser runbook](../phases_0_3/AUTHORITY_BROWSER_RUNBOOK.md), and
[test runbook](../phases_0_3/TEST_RUNBOOK_AR_EN.md). Automated authority and ownership
fixtures were cleaned or rolled back, with audit retained where specified. Their
IDs are evidence examples rather than persistent demo records.

## Verification at this checkpoint

- The frozen-source serial regression gate contains **19 suites**. It combines native
  database tests with explicitly labeled pure/mocked checks; suite totals are not
  the 80 acceptance cases. Foundation 52 includes 25 native and 27 pure/mocked checks.
  Delegation 8, authority 12, completion 3 and schema 5 execute separately.
  The final run resumed after a background queue limit interrupted suite 17 fixture
  setup: 16 passed results were retained only after exact application-file hash
  equality was verified; the remaining 3 passed after bounded cleanup of 141 stale
  queued contact jobs for absent synthetic parity users. Other sites/live users
  were preserved. Original failure and maintenance evidence remain available.
- Ownership browser evidence covers 7 grouped AR/EN checks and 7 authenticated HTTP
  checks, including denied requester mutation, reason validation, exact replay,
  immutable retained joining links and restored capacity after cleanup.
- Authority/delegation browser and private-proof HTTP evidence are recorded separately
  from native authority assertions. Source fingerprints and cleanup status are in
  each evidence file; no screenshot alone establishes authorization correctness.
- Independent HTTP concurrency passed three batches of 20 simultaneous calls:
  five seats admitted five submissions; Manager and final HR replay each advanced
  once. Cleanup restored structural 5 / occupied 0 / reserved 0 / open 0 / available 5 and
  disabled fixture accounts. This is local concurrency proof, not a production
  load certification. All mutations target synthetic 8102 fixtures; no external email.
- Static syntax, Ruff, strict baseline/reference validation, translations and the
  staged known-credential/private-key scan passed before the source commit.
  Translation coverage does not substitute for Arabic terminology approval.
- Independent source review found no additional actionable defect in the reviewed
  authority/delegation and owner-picker changes. This was not a full production
  security review, and it does not establish deadlock-free operation.
- Official Frappe, ERPNext and HRMS clones stay separate and unchanged. The parity
  service remains on loopback port 8102; previous 8100/8101 sites were not migrated or seeded.

Current source evidence: [serial regression](evidence/authority-final-2026-10-12.json),
[HTTP concurrency](evidence/authority-http-2026-10-12.json),
[ownership browser/API](evidence/browser/ownership-joining/results.json),
[authority browser](evidence/browser/authority-delegation/results.json),
[queue maintenance](evidence/authority-queue-maintenance-2026-10-12.json),
[case mapping](../phases_0_3/ACCEPTANCE_EVIDENCE_MAPPING.md).
Earlier failures and resolved fixture/UI findings remain in the evidence history.

## Next work and limits

The next implementation work is the [command audit envelope](../phases_0_3/COMMAND_AUDIT_DESIGN.md),
remaining document recipient/delivery guards and the [exact headcount cases](../phases_0_3/HEADCOUNT_REMAINING.md).
Delegation process isolation is tested, but the later probation workflow has no
explicit authorization gate in this milestone, so ORG-005-02 remains partial.
Mail-sink capture and future overdue-document jobs are not represented as complete.

HR/IT decisions remain for native MFA/new-device/recovery and external identity,
personal-interest and CEO/Board policy, headcount exceptions, real employee mapping,
Arabic terminology and external audit-seal custody. Explicit actor/principal
records and immutable local events do not replace complete command envelopes or
an externally protected tamper-evidence anchor. Privileged operational access still
needs a reviewable logging policy.

A fresh install/restore rehearsal of the eventual release, final independent review,
release tag and human HR UAT remain. Historical restore proof covers an earlier
checkpoint. This is a published development checkpoint, not production go-live.
No provider/email, Odoo, BioTime, Sheets or AI integration is claimed complete.
P4–P10 and the broader company platform remain separate.
