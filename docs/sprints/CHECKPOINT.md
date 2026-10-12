# قنديل — HR implementation checkpoint

12 October 2026. Tested source: `d94afe79ec59b9d38a15cdd00345684f38dcc6d0`.
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

**45 passed / 27 partial / 8 blocked**, up from 28 / 42 / 10. The 80 original
case definitions are unchanged; 17 cases gained sufficient technical proof.
A separate Block-denial case received more evidence but remains partial. These
counts are test cases, not implementation-effort percentages or HR sign-off.

Implemented and newly verified:

- **Approved HR corrections:** reasoned type/date/specification/priority changes,
  immutable before/after revisions and requester notices; actual-joiner minimum;
  unfilled-seat relocation; no repeated release of closed seats. Increases use a
  linked amendment and add only the approved delta to the existing vacancy.
- **Structural Return:** preserves review rounds and reasons, allows only the
  author to revise, and requires a fresh independent approval chain. Final replay
  creates no duplicate position/capacity.
- **Organization codes:** reviewed Unit/Job/Position imports preserve company-scoped
  external codes, reject remapping conflicts and support scoped search/export.
  Native target rename/delete/company moves cannot bypass preserved identity.
- **Identity and access:** committed server-side account disable revokes active
  sessions; expiry and disabled login fail in UI/API. The real browser scope
  matrix covered equal-looking positions across companies/branches, private files,
  reports, links and the new narrow CSV register.
- **Policy and capacity:** Cairo-effective authority and frozen decision policy
  snapshots; independent Sector exception; exact headcount arithmetic. Actual
  English and Arabic forms display requested 3 / available 1 / shortage 2 and
  reject missing justification.

The native **Correct Approved Request** button is available to scoped HR on
approved originals. **Download Position Register** is on the Position list.
Review the bilingual [test runbook](../phases_0_3/TEST_RUNBOOK_AR_EN.md) and
[organization guide](../organization-evidence/RETURN_AND_CODES.md) before trying
mutations. Use only synthetic review data.

## Verification

- Final unchanged-source serial run: occupancy 9, recruitment 26, contracts 9,
  corrections 6, joining 11, SLA 9, privacy 8 and foundation 52 mixed checks all
  passed. See [final regression](evidence/corrections-contracts-final-2026-10-12.json).
- Organization 47 native checks plus 11 exact cases passed. Independent review
  found a stale-read rename/delete gap; the fix passed four independent-connection
  probes and the affected organization suite again.
- Session 7, scope 12 and bilingual workflow 5 grouped real browser/API checks
  passed. The scope gate used the actual native CSV button/download.
- Three HTTP batches each ran 20 concurrent requests: capacity admitted five of
  20 contenders for five seats; repeated manager/final approvals each advanced
  once. Cleanup reconciled the synthetic ledger.
- Eight independent workers across two companies and one recipient produced
  exactly two local notification receipts and no email.
- 158 Python, 32 JSON and 15 application JS files passed syntax checks; Ruff and
  staged known-credential/private-key checks passed. All 863 extracted translation
  keys are present in the 937-entry Arabic catalogue. HR terminology review remains.
- The initial bilingual run exposed realtime polling 404s. The parity-only local
  service now sets its development flag and site namespace; a separate real
  authenticated browser check connected on port 9102 with no polling/console error.
  Earlier evidence retains its original caveat. Local orchestration commit:
  `5b290c8`; no main/pilot service was recreated by this fix.

[Combined evidence](evidence/correction-security-checkpoint-summary-2026-10-12.json)
and [case-by-case mapping](../phases_0_3/ACCEPTANCE_EVIDENCE_MAPPING.md) distinguish
current proof, historical proof and remaining clauses. Failed initial fixtures and
resolved defects remain in the evidence history.

## Next work and limits

The next implementation work covers remaining vacancy ownership/queue behavior,
joining reversal/reopening, delegated/Board authority and selected organization/JD
workflows. HR/IT still need to settle identity/MFA/recovery, authority and headcount
policies, Arabic terminology, real mapping and external audit-seal custody.

The final source still needs its fresh installation/restore rehearsal and eventual
reviewable release tag. Earlier install/restore proof covered an older checkpoint.
Human HR UAT remains a separate gate. No production migration, provider/email,
Odoo, BioTime, Sheets or AI integration is represented as complete.

Specific limits: parent units must be imported before children; existing shared job
titles require explicit reviewed mapping. Code replacement/company migration are
unsupported. Concurrent import versus native master operations may require a
transaction retry. Confidential-note requests cannot expand capacity scope.
Later exception hires outside an earlier commitment cohort may require fresh
review. Old shared snapshots are not rewritten; old pending requests lacking a
headcount basis must be returned and freshly reviewed.
