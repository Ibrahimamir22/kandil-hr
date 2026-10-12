# Sprint 2 — unified position history

13 October 2026. Engineering checkpoint on the isolated synthetic parity site. The full HR goal and S2 acceptance remain open.

## What HR can see

Open `http://localhost:8102/hr-portal` → **Organization / الهيكل التنظيمي** → select a readable position → **History and comparison / السجل والمقارنة → Open history / فتح السجل**.

The position timeline brings together recorded organization imports, structural changes, JD revisions and hiring/joining effects. Each event shows its source record, actor and recorded time. Selecting it shows explicit before/after differences for that position's capacity, hierarchy and assignments. Original joining remains visible after a joining reversal; later assignment changes do not rewrite the captured earlier history. A no-show remains associated with its destination without inventing an assignment.

The reporting date filters the organization browser's effective-dated records. It does not filter the timeline's recorded command timestamps; the screen says so. History does not reconstruct unrecorded historical writes. This is not the future complete hiring/candidate timeline or proof of those later portal sprints.

## Permissions and data ownership

Frappe remains the HR system of record. `portal/position_history.py` authenticates a personal session, checks current native position access, rechecks the underlying source's native permission and business scope, validates its frozen company/target/position association, then projects explicit allowed fields. Department access to a position does not grant whole-company import or structural-history access. Revoking the source grant removes those events immediately, including a previously known event ID.

The new private `Kandil Position Audit Link` is a derived lookup, not an authorization source or a second HR database. Ordinary users cannot create/edit/delete it or browse its raw records. Related-record reads also require current native access and historical scope. Unreadable employee/position references are redacted. Salary, birth date, gender, contact details, raw payloads, full-company baseline snapshots and private audit envelopes are excluded from the portal projection.

Events default to 20 candidates, capped at 100, with a composite company/position/time/audit index. Related differences page candidates too. Pages can have no visible rows while still offering Next. An event envelope is still parsed on the server; the later load gate must measure large histories and organizations. Application immutability is not independently protected audit custody.

## Migration and reproducibility

`patches.txt` registers the post-model-sync index/backfill patch. New command audits generate their position links in the command's transaction. Failure to index rolls the command/audit back. Sites sharing code without the new table keep their existing commands working; their position timeline explicitly requires migration. Only `kandil-parity.localhost` was migrated for this checkpoint.

A local backup with files preceded migration. The first migration completed schema/backfill but failed in the existing after-migrate setup because recreating identical Property Setters tried to queue redundant cleanup against the full development queue. `pilot/setup.py` now retains an identical setter; real changes still use the native setter path. The standard migration retry completed successfully. No upstream core changes, queue clearing or worker execution were used. Migration DDL has its normal database commit behavior; restoring previous code alone is not a schema rollback.

[Migration/index verification](evidence/position-history-index-2026-10-13.json) independently confirms the successful Patch Log, all **696 audit records / 631 links**, zero missing/orphan links, zero links created on replay, unchanged audit digest, and database selection of `position_history_lookup`. It is a synthetic consistency check, not deployment certification. The verifier's first launch failed before connection because Frappe logging required the sites working directory; that invocation was corrected.

## Verification

- [Final native history regression](evidence/s2-regression-96776fcd6669.json): **26 checks passed**, including frozen imported/structural/joining/reversal/move history, no-show association, native User Permissions, scope revocation, guest/disabled roles, corrupt/guessed links, bounded pages, no read side effects and transaction rollback on indexing failure.
- [Broader affected regression](evidence/s2-regression-317cfd98097f.json): **74 checks passed** across position history (12), existing history (14), command audit (15), revision/import audit (11), joining (11) and joining corrections (11). It predates the browser-only fixture corrections; product source from that run is unchanged. The final focused run captures the current package source.
- [Final browser journey](../portal/evidence/position-history-526d609093dc/results.json): **21 checks passed** through ordinary authenticated HTTP sessions and actual AR/EN screens. Includes the four source types, before/after display, English joining reversal, Arabic mobile imports, hidden raw index/audit, current-source revocation, guessed IDs and zero observed exceptions/5xx/external requests.
- [Visual review](../portal/evidence/position-history-526d609093dc/visual-review.json): English desktop and Arabic 390px mobile, with native-scale inspection of the displayed differences.
- Browser cleanup disabled all six cohort accounts and reconciled all three company capacity ledgers to zero. Synthetic history is retained. The imported assignment episode is historical and ended.
- Frontend build and upstream-pin verification are included in source publication checks. No upstream pin changed.

### Earlier attempts retained

- `s2-regression-f386128733be`: one assertion reused a Document carrying `ignore_permissions` from setup. The test now fetches a fresh document under the ordinary user. Production permission rules were unchanged.
- `position-history-58f5c2b71fab`: setup attempted a future baseline import; the normal domain rule rejected it. The scenario now uses an ended historical assignment.
- `position-history-eeb098a0301e`: setup's HR actor lacked the sensitive grant needed to create an offer. The fixture now provisions that authority explicitly.
- `position-history-3074f3316943`: editing the existing grant was correctly rejected as immutable. The fixture now revokes it and creates a replacement through normal administrative validation.

All three browser attempts retain their original FAIL results and successful cleanup. These fixture corrections did not relax business or security controls.

## Remaining gates and next work

S2-05 is engineering-complete; HR acceptance of history/terminology remains separate. S2-04 retains HR document acceptance and configured external email testing. The full queue of 650 parity User contact jobs remains untouched: a scoped aggregate inventory found no missing-account jobs matching the exact current fixture pattern, so nothing was arbitrarily discarded. Worker/drain ownership, notifications and queue recovery remain open.

Next independent engineering work is S3's full hiring request and authority portal. Preserve the 98 frozen reference IDs and existing 72 passed / 4 partial / 4 blocked acceptance register; this checkpoint does not reclassify those cases. Production identity/MFA, external audit custody, independent security, sustained 1,000+ account workload, recovery/hosting, real-data reconciliation and HR/IT/UAT remain explicit gates. Odoo and other company departments remain outside scope.
