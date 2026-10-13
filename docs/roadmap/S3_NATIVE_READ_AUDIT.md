# S3 native historical-read audit

13 October 2026. This is a surface-by-surface engineering audit, not a security certification or permission to deploy. It preserves the frozen 98 requirements and the authorized immutable-history contract. S3-04 remains in progress.

## Confirmed defect and correction

A native `File` list could reveal a retained Request Revision attachment's filename and private URL after the caller lost access to that historical revision. The caller still had access to the live request and owned the File. File detail and download correctly denied access, but `foundation.security.file_query` used only the parent request scope for both Recruitment Event and Request Revision attachments.

The regression reproduced two disclosure paths: reducing a department-wide grant to one current branch, and restricting a historical Position through native User Permissions. The fix gives Request Revision attachments their parent's full `recruitment.history_access.condition`, plus native User Permissions on the Revision itself. Filtering happens before File pagination. It preserves authorized list/detail/download behavior and does not rewrite snapshots or attachments. Event attachments remain on their existing distinct policy and still require separate review.

## Native verification and diagnostics

- [Final focused regression](evidence/s2-regression-66ef36379b2d.json): **54 checks passed** — 21 history access, 7 native recruitment acceptance, 8 privacy, 11 history navigation and 7 authority/correction history checks.
- [Final foundation regression](evidence/s2-regression-833829c7c273.json): **52 checks passed**, including six native boundary and four report/account tests. Source fingerprints stayed unchanged during both runs. Total: **106 native checks** across separate suites.
- [Reproduction](evidence/s2-regression-0ba4355b0557.json): 17 of 19 passed; the two failing checks exposed attachment filenames/URLs despite historical scope or Position User Permission restrictions. Both now pass, with additional parent Revision User Permission and export checks.
- Two broader-suite diagnostic runs are retained: [signup throttle](evidence/s2-regression-5ab843523012.json) and [deferred contact queue](evidence/s2-regression-900e41f62ef9.json). These were fixture setup/update failures, not accepted security results. The isolated foundation fixture now uses Frappe's import flag only during synthetic User creation, restores it immediately, and runs only that fixture user's contact updates synchronously for the fixture lifetime. It is restricted to the opted-in parity CLI; no shared queue flushing, worker execution or site limit change was performed.

[Personal-session HTTP verification](../portal/evidence/history-files-d1f0b24d7985/results.json): **16 checks passed**. An authorized owner can list/read/download the exact private bytes; an outsider cannot. After reducing the owner to branch-only scope, the same session retains current portal request access but cannot list/read/download its unredacted historical revision or attachment. Snapshot/file bytes remain unchanged, with no HTTP 500s. Cleanup disabled all six fixture accounts, reconciled all ledgers to zero, and retained private synthetic history/attachment evidence. This is an HTTP boundary test, not a visual/browser or production-capacity test. No frontend files or schema changed, so this increment does not require a frontend rebuild or schema migration. Only the synthetic parity web service was restarted to load the new Python code.

## Audit map

| Surface | Verified boundary / source | Remaining work |
|---|---|---|
| Native Hiring Request embedded snapshots | Permission level 1 hides submitted/route/reviewed JSON; ordinary command replies and receipt replays omit it. Prior native and HTTP evidence in S3_NATIVE_HISTORY_CHECKPOINT.md. | Recheck when adding new response adapters or fields. |
| Raw Request Revision list/detail | Shared pre-pagination SQL guard checks current parent, historical department, Position/Capacity references, replacement identity and native User Permissions; safe original bytes stay readable. | Complete recursive type/schema and nested-reference review below. |
| Direct Revision attachment File metadata | This increment matches Revision access and User Permissions; positive owner access and branch/reference denials covered. | Indirect File-to-File/child attachment metadata and other historical parents remain separate surfaces. |
| Revision attachment File detail/download | Existing strict parent permission hook; verified against list behavior and current scope changes. | Keep download, owner, aliases and archive paths in future integration acceptance. |
| Native report-builder Revision query | Uses the same row query; safe original JSON returned, unknown private top-level field excluded with its record. | More complex join, aggregate and custom reporting paths are not certified by this focused query. |
| Native data export | Requester, manager and HR cannot export raw revisions without export permission. | Any future export grant requires separate row/field and download tests. |
| Script/query/custom HR reports and prepared files | Existing deny-until-reviewed policy in foundation.reports; foundation regression is recorded with this checkpoint. | This gate is not delivery of the HR reporting requirements; build scoped reports in the planned reporting sprint. |
| Portal projected history | Explicit public field projection, recorded policy/reasons, current request/location/employee/proof access; prior 182-check browser checkpoint. | Recursive validation of values under allowed scalar fields should be included in the nested-schema audit. |

## Next security implementation, before S3 closeout

1. **Nested frozen route shape and references.** Raw `snapshot_json.route_snapshot` is an encoded JSON string. Current top-level key checks do not establish an allowlist/type contract for all nested content. Inspect resolved/skipped positions, assignment IDs, excluded-interest users, policy rule/config identities, headcount-basis cohort request-line keys and pending-quantity evaluation lines. Reproduce unauthorized reference or unknown nested data cases; add guards while retaining safe authorized original bytes. Never regenerate an old route from current policy or silently mutate stored history.
2. **Other raw references.** Verify `amends`, line `job_opening`, approval `board_evidence` and Board/actor/principal identity against their intended historical disclosure policy. The portal's restricted markers do not prove native raw JSON has equivalent protection. Where individual redaction is impossible, withhold only records whose raw disclosure cannot be authorized and preserve the projected portal alternative.
3. **Historical Events and indirect attachments.** Check direct native Event list/detail, event-attached files, child links, aliases and File-to-File metadata separately from Request Revision attachments. Include ownership and revoked/expired grants.
4. **Integrated S3 acceptance.** Reconcile every mapped requirement and prior HR action/retry/quantity/authority test with current source, add missing positive and negative proof, and only then consider the sprint engineering exit. HR/IT sign-off, independent security/UAT and terminology review remain external gates.

A file metadata fix is not proof of full native-history security. All later vacancy, candidate, interview, offer, joining/onboarding, lifecycle and reporting work remains in scope. Sustained 1,000+ account capacity, recovery, hosting and real-data rollout remain explicit release gates.
