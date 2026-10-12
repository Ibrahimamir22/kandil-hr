# Sprint 2 — reviewed structural changes in the portal

**Status: engineering increment verified; Sprint 2 remains in progress.** The AR/EN custom portal now supports structural proposals and independent approval. This checkpoint complements the [organization browser](S2_CHECKPOINT.md); it does not complete imports, assignment editing, JD editing, all 98 requirements or production acceptance.

## What is connected

At http://localhost:8102/hr-portal select **Structure changes / تغييرات الهيكل**.

1. A company-wide authorized author drafts one or more Create, Resize, Reparent or Close operations, with a reason and effective date. Existing department/job/branch/position choices support server search and pagination.
2. Save validates the proposed operations against the current company structure without changing positions or headcount. The author prepares a preview and explicitly reviews the changes before submission.
3. The existing domain resolves the approval chain, including independently configured HR and CEO users. Additional hierarchy authorities remain domain-controlled. The author cannot approve their own change or replace an authority in the browser.
4. Approvers can approve, return with a reason, or reject. A return preserves the earlier proposal/reason/steps; only the author edits it, prepares a new preview and starts a fresh round. Terminal rejection cannot be reopened.
5. Final approval applies the existing transactional domain command. New positions, capacity changes, reporting episodes, snapshots and command audit remain native backend responsibilities.
6. Submitted/approved before-values come from the matching immutable submission audit, not the already-updated live position. Only whitelisted position values cross this read adapter; no raw audit envelope or company-wide employee snapshot is returned.

Creation, resizing and closure must take effect today under the existing domain policy. Reparenting can be future-dated. The browser states this limitation; no untested scheduler was added.

## Permissions and reference setup

- Whole-company scope is required for a Structure Change because it can span departments and must be reviewed against the company baseline. A department-only or branch-only grant does not authorize structural writes or access to company-wide proposals.
- Branch and Designation are existing **shared reference catalogs**, not company-private employee records. The three structural-author roles (Kandil Recruiter, Approver and Sector Approver) receive **select-only** reference rules, allowing names to be chosen without granting master read/write/create access. The portal catalog also checks the selected company's whole-company grant. Departments and positions remain company-filtered.
- The permission installer is `kandil_hr.portal.reference_permissions.install`, called from the existing after-migrate setup. It sets `read=0` explicitly because a new Custom DocPerm otherwise defaults to read access even when created for select. It changes only these application-owned role rules; it does not change upstream source or other roles.
- This installer was executed only on the isolated parity site. The clean-install/migration package reaches the same function; a fresh full installation was not rerun in this increment.
- Personal sessions and CSRF remain required. Native resource updates cannot turn a pending proposal into an approved one. No Administrator fallback, shared browser key or second HR database was introduced.

## Commands, retries and audit

Draft save and preview use namespaced actor/company command receipts. The receipt table's optional hiring-request link is left empty for these structural receipts; the target identity is in the bounded result. It grants no new receipt-table access. Native draft versions and private receipts preserve save evidence; full structural command envelopes remain attached to the existing submit/decide commands.

Concurrent duplicate save initially exposed a repeatable-read race: after waiting for Company, a retry could see the committed receipt but not its new target through a snapshot-based metadata lookup. The adapter now locks and reads the receipt target under the already-held Company mutex, then rechecks native permissions and current scope. Identical retries return the original result; changed-payload reuse is denied.

Preview/submit/decision versions, baseline hash checks, independent authority, capacity limits and final command audit reuse the existing domain. Simultaneous final approve/reject requests have one winner; the ledger and exactly one final-authority decision envelope match that winner. No transaction sends external messages.

The frontend retains retry IDs only while the component/attempt is alive. After navigation or reload following an unknown connection result, inspect the saved list before repeating a create. Durable cross-reload recovery remains a later enhancement; there is no claim of that behavior here.

## Final verification

| Verification | Evidence | Result |
|---|---|---|
| Native structural adapter and organization read regression | `evidence/s2-regression-7d565d0b4ca3.json` | 10 structural + 9 read tests passed |
| Real personal-session structural UI/API journey | `../portal/evidence/structure-26b11b56e6b2/results.json` | 21 checks passed |
| Existing hiring/approval/vacancy browser journey | `../portal/evidence/browser-d5b3d2cef1f4/regression.json` and `results.json` | 24 checks passed |
| TypeScript and Vite build | `npm run build --prefix frontend/portal` | Passed |

The structural browser run covers English author and CEO screens, Arabic mobile HR return and approval, revised quantities, retained prior rounds, a new position, native API bypass refusal, denial for department-only and unscoped users, duplicate save and preview HTTP races, conflicting final decisions, persisted ledgers, exactly one final decision audit and retained pre-change values. Its screenshots were inspected. After testing, only a trailing blank-line space was removed from the browser harness; all application files still match the recorded browser fingerprints. No JavaScript exceptions, 5xx responses, external requests or horizontal mobile overflow were observed in that journey.

The final synthetic structural cohort was retired: six accounts disabled, private fixture passwords scrubbed, all four company capacity ledgers checked with zero occupied/reserved/open commitments. Synthetic proposal/audit/company history remains for inspection; no real business data was imported. These short local races are not sustained performance certification for 1,000+ users.

## Earlier failures and corrections retained

- Native `9f84ea44baf5`: position catalog searched title only; code/name/Arabic title search was added. `94df6dbd2b5b` passed the initial ten tests.
- Native `d53db1f1f82a` and browser `f30aa4739ba8`: Branch reference selection lacked native permission. The new installer added the scoped portal entry check plus native select-only reference rules.
- Native `b98e47b57898`: Frappe's Custom DocPerm default also enabled read. The installer explicitly removed that default; `1ef3b8e61da2` proved select without read/write. Later tests include the same check.
- Browser `7f0cb263853c` and `2c953eee51d5`: duplicate save retry encountered the stale metadata read described above. The locked target lookup resolved it.
- Browser `37dc98a83b30`: preview results were semantically equal but JSON property order differed after receipt serialization. The test now compares parsed objects, without weakening version/payload equality.
- Browser `c8dee6c82b02` passed 20 checks before the comparison improvement. Native `a825fa5f10ed` passed 19 before that improvement. Final evidence above adds the frozen-before-value check.

## Remaining Sprint 2 work

- Reviewed organization/assignment imports: CSV preview, row errors, identity reconciliation, independent review/apply, no partial overwrite and baseline provenance.
- Dated assignment editing and complete structural/JD/assignment differences, beyond the connected structural return rounds.
- JD editor, weighted KPIs, approved revisions, worker cards and AR/EN document/PDF acceptance.
- Broader organization tree/unit interactions, accessible role workflows and HR terminology/layout acceptance.

The unchanged 80-case historical register remains **72 passed / 4 partial / 4 blocked**. These new focused checks are not added to that denominator. S2-01, S2-02 and S2-05 remain in progress; imports and JD editing remain planned. Identity/MFA, independent security review, representative staging capacity, recovery, HR UAT and approved production rollout remain separate later gates. Odoo and other departments remain outside this goal.
