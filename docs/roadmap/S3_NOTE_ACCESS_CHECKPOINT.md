# S3 — correction explanations and historical Event access

13 October 2026. Verified synthetic development checkpoint. S3-04 and the full 98-requirement goal remain active.

## What changes for users

Ordinary users can read the explanation for a correction without receiving its internal before/after audit payload. Current requests show **Decision Reason / سبب القرار** and native Recruitment Events show **Public Note / الملاحظة المعروضة**. The portal timeline retains its existing `note` contract, populated from the public explanation. Plain-text explanations, actors, principals, timestamps and pagination remain intact.

Original `decision_note` and Event `note` values are retained at permission level 1 and hidden in ordinary forms/prints; no new elevated grants are added. Current command responses, including old receipt replays, project encoded notes to their textual `reason` while keeping internal receipts unchanged. Invalid structured values or non-string reasons do not become displayed content. Request/Event validation derives the public field on the server; a submitted client display value is not authority or audit evidence.

## Historical access

A raw Request Revision carrying an HR correction must authorize both captured request versions using the existing shape, historical scope, parent, Position/Capacity, replacement identity, amendment, opening and proof guards. This also recognizes captures retained in another revision's note. Both captures must match the revision's request/company/department. Unknown fields, missing captures, non-text reasons and recursively embedded notes fail closed. Authorized original bytes remain readable; access checks never regenerate or rewrite the stored capture.

Native Event list and detail now share a pre-pagination condition requiring the current parent under native User Permissions, the explicit Event snapshot schema, and access to each historical Capacity and opening reference. Direct Event-attached File metadata applies the same condition plus the Event's own native User Permissions. File detail/download retain the strict parent access hook. An attachment's ownership does not override these historical permissions.

These checks do not authorize every identity in every legacy serialized note. Frozen route positions/assignments, policy/config identities, interest users, cohort keys and the remaining actor/principal and non-correction structured-note families still require the reference-policy audit described below.

## Migration and deployment

The two DocTypes add derived display fields and change the raw-note field permissions. Normal deployment requires model sync and the registered post-model-sync `kandil_hr.recruitment.note_projection` patch. Its keyset batches update only the new fields, preserving raw values and `modified` dates; it is idempotent and only runs on opted-in extended recruitment sites. It sends no messages and changes no grants.

On the isolated parity site, the explicit CLI rehearsal reloaded only those two DocTypes and backfilled the display fields. [Migration evidence](evidence/note-display-migration-2026-10-13.json) verifies unchanged hashes for 664 request raw notes/timestamps, 1,863 Event raw notes/snapshots/timestamps and 1,601 Revision snapshots/timestamps. These are record inventories, not concurrent-user capacity tests. The main company-data site and earlier pilot were not migrated.

## Verification

- [Affected native regression](evidence/s2-regression-79adb33ed05e.json): **95 checks passed** across nine suites: 10 note/access cases, 10 nested-history cases, 5 review views, 6 correction cases, 8 privacy cases, 21 native history-access cases, 14 portal operations, 14 command-history cases and 7 authority/history workflows. Source fingerprints stayed unchanged throughout the run.
- [Personal-session HTTP](../portal/evidence/note-access-35ec5e9d89c7/results.json): **35 checks passed**. Actual HR correction/replay; requester/HR v1/v2 native reads, wildcard lists, explicit raw get_value denial, public timeline and standard print; authorized exact-byte raw revisions; outsider denial; Event User Permission restriction with retained current-request access and removal of File metadata/detail/download. No HTTP 500s; raw note/capture bytes and source fingerprints unchanged. Cleanup disabled six users and reconciled fixture ledgers to zero.
- [AR/EN browser regression](../portal/evidence/history-workflows-68e909d16eab/results.json): **65 checks passed**, covering delegated/CEO/Board reviews, retained evidence, corrections, pending-quantity restart/no-change and revocation on English desktop and Arabic mobile. No runtime JS errors, HTTP server failures or external browser traffic. Audit/revision bytes and source fingerprints unchanged. Cleanup disabled nine users and reconciled fixture ledgers to zero. Visual inspection of the two correction captures confirms readable reasons, changed-field highlighting and stacked mobile comparison cards; this is a focused layout check, not full accessibility or HR acceptance.
- Diagnostics are retained: [initial note-suite run](evidence/s2-regression-56a44b62644b.json) found that the new replay assertion compared native datetime objects against receipt JSON strings; comparison now uses canonical Frappe JSON, with no production change to replay semantics. [Intermediate regression](evidence/s2-regression-3e243be73a8d.json) passed both new suites, then hit an old expansion fixture that implicitly selected the manager's Employee default outside its branch grant. That fixture now explicitly leaves replacement employee empty. Its native Position/Capacity denial expectations and the production permission rules are unchanged. These diagnostic counts are not added to the final 95.

## Remaining work

- Finish frozen-route/cohort reference authorization, explicit Board/actor/principal identity policy and remaining non-correction serialized audit-note families. The existing public portal projection and raw native history have different disclosure contracts.
- Review indirect File-to-File and child attachment metadata, complex report paths and remaining historical parents.
- Reconcile every S3 mapped requirement against current positive and negative workflow evidence before closing S3 engineering work.
- Complete later vacancy, candidate, interview, offer, onboarding, lifecycle and reporting sprints. HR/IT/UAT, independent security, sustained 1,000+ account workloads, recovery/hosting and real-data rollout remain explicit acceptance gates.
