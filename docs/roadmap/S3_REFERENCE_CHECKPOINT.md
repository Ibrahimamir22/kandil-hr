# S3 — frozen route references and projected identities

13 October 2026. Verified synthetic development checkpoint; full S3 acceptance remains pending. The goal still includes all 98 frozen requirements and the later HR modules.

## Changes

Raw request history now checks resolved/skipped positions, assignment IDs, route configuration/rules, captured User IDs, headcount basis/cohort keys and pending evaluation line references. These checks apply inside both captures of an HR correction as well. The [reference policy](S3_REFERENCE_POLICY.md) defines the boundary between a shared audit reference and permission to read a full User, Employee, assignment or configuration record.

A raw revision containing an inaccessible historical reference is withheld; its stored bytes stay unchanged. A projected command/saved-version history can still show permitted content. Structured identities restricted by native User Permissions become null with an explicit restriction marker. The UI renders **Identity restricted by permissions / هوية مقيدة بالصلاحيات** for actors, principals, actual Board members, requester and named policy authorities. It preserves visible dates, quantities, outcomes, reasons and permitted identities, and does not substitute the chair for a restricted actual Board member.

Disabled former authorities and ended assignments remain readable when the caller's current reference permissions allow it. Current routing/settings are not substituted for captured facts. Other requests' cohort line IDs now require access to those other requests, not merely the same capacity ledger.

## Verification

- [Final affected native regression](evidence/s2-regression-0f512eee3656.json): **104 checks passed** across projected identities (6), command history (14), saved versions (15), authority/history workflows (7), frozen references (14), nested shapes (10), correction notes (10), native history access (21) and recruitment acceptance (7). Source fingerprints stayed unchanged.
- [Personal-session HTTP boundary](../portal/evidence/history-references-fd945c91376e/results.json): **16 checks passed**, including permitted original revision/file bytes and denial after historical Position permission restriction while current request access remains. Cleanup disabled six fixture accounts and reconciled fixture ledgers to zero.
- [AR/EN browser workflows](../portal/evidence/history-workflows-0085dcd92e00/results.json): **75 checks passed**, including delegate/CEO/Board historical reviews, corrections, approval restarts and restricted-identity display in both languages. No JavaScript errors, server failures or external browser traffic; captured history bytes and source fingerprints stayed unchanged. Cleanup disabled nine fixture accounts and reconciled fixture ledgers to zero. [Focused visual review](../portal/evidence/history-workflows-0085dcd92e00/visual-review.json) covers the new restriction display only, not complete product design acceptance.
- Frontend TypeScript/Vite build passed. No schema change or upstream code modification was required; only the synthetic parity service was restarted.
- [Earlier native reference run](evidence/s2-regression-d80836960d09.json) passed all 69 checks before projected-identity changes. It is not added to the final total. [Initial diagnostic](evidence/s2-regression-3cb3263f875e.json) found that an older synthetic correction test changed a line capacity without updating its recorded headcount basis. The fixture now keeps both references coherent; the original permission allow/deny assertions are preserved. [Projection diagnostic](evidence/s2-regression-15ae37e20349.json) found a new test comparing full list and detail metadata even though the list intentionally adds status/location context. The test now compares the shared fields and asserts status separately. Neither diagnostic is a passing result.

## Remaining work

- Review other serialized vacancy/ownership note families and indirect File/child/report paths.
- Reconcile the 17 mapped S3 requirements clause by clause against the complete current request/authority workflow before claiming sprint exit. The reference allocation and definitions are unchanged.
- Continue S4 vacancy operations and subsequent candidate, interview, offer, onboarding, lifecycle and reporting delivery. HR/IT/UAT, independent security, sustained 1,000+ account capacity/recovery, hosting and real-data rollout remain explicit gates.
