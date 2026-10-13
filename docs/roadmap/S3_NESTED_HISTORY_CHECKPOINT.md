# S3 — nested history shape and linked-record guards

13 October 2026. This increment validates the declared nested structure of raw request revisions, checks amendment/opening/Board-proof references, and prevents objects or arrays under allowed scalar fields from escaping through the portal. It does not close the deeper frozen-route identity audit or S3.

## What changed

`recruitment.history_schema` compiles an explicit stored-shape definition into SQL predicates. The native Revision permission condition applies it before list pagination and during direct reads; revision-attached File listings inherit that same condition. It covers the shared request/line/step structure, encoded route object, resolved/skipped route rows, policy/rules, interest user collection, headcount basis/cohort maps and pending-quantity evaluation rows. Unknown object keys and invalid collection/object shapes are withheld. Scalar fields cannot contain nested objects or arrays. Dynamic map keys are escaped with JSON_QUOTE and bounded to the native ID length; stored data never becomes executable SQL.

The schema is an access guard, not a transformation. It neither rewrites historical JSON nor substitutes current policy for old facts. Empty/missing optional route data remains supported. Authorized original bytes stay unchanged, including valid pending changes, original headcount cohorts, approved openings, applied amendments, HR corrections and relocations.

`recruitment.history_access` additionally requires:

- A captured amendment parent to be in the same company and currently readable under the request scope and native User Permissions.
- A captured Job Opening ID to match the exact historical request, company and capacity, and satisfy native User Permissions. This is reference-only visibility within an authorized request; it does not grant access to candidates or the full opening record, and no role permissions were added.
- Captured Board proof to be a private, non-folder local File attached to this exact request and satisfy native File User Permissions. A readable File on a different record is not accepted as this request's proof.

The portal history adapter independently checks types of the scalar request, quantity, step and policy values it exposes. It continues omitting unlisted fields and using the existing restricted-reference projections. A structured value under a supposedly scalar public field produces an unavailable-history permission response instead of leaking nested data or crashing the React view.

## Verification

- [Final native regression](evidence/s2-regression-93077df92760.json): **93 checks passed** — 10 nested-shape/reference cases, 21 native history-access cases, 7 recruitment acceptance cases, 8 privacy cases, 14 command-history cases, 15 saved-version cases, 11 history-navigation cases and 7 authority/correction history cases. This includes positive exact-byte reads after pending changes, approval, amendment application, correction and relocation, alongside negative nested-data and User Permission cases.
- [Personal-session HTTP regression](../portal/evidence/history-files-8f8148810a45/results.json): **16 checks passed** for authorized private attachment list/detail/download, outsider denial, same-session historical restriction with retained current-request access and unchanged stored bytes.
- [AR/EN browser regression](../portal/evidence/request-history-a23d0f7dc428/results.json): **101 checks passed** for history/saved-version comparisons, amendment navigation, captured route explanations, scoped native reads and revocation. No runtime JS errors, HTTP 500s or external traffic were recorded. Native and browser source fingerprints remained unchanged during each run. Six synthetic accounts were disabled and ledgers reconciled per HTTP/browser cohort; historical evidence was retained.
- [Reproduction](evidence/s2-regression-56f7f7307475.json) failed on the demonstrated malformed nested content and restricted references while valid pending/cohort history remained readable. [Initial implementation diagnostic](evidence/s2-regression-c13f9eaf25f5.json) exposed a literal percent in the SQL private-path predicate being interpreted by parameter formatting; replacing LIKE with a fixed-prefix comparison resolved it. [Intermediate 65-check run](evidence/s2-regression-be37a5a6c3cb.json) passed before the final two positive/reference cases were added. These runs are retained and are not added to the final 93-case count.

No schema or frontend asset change was needed. The synthetic parity web service alone was restarted to load Python changes. The existing browser harness fingerprints the new schema module; no real-data site, upstream source, shared worker queue or external email was changed.

## Remaining work before S3 closeout

Shape validation does not prove authorization of every identity contained inside a valid shape. Complete the audit of frozen resolved/skipped position and assignment IDs, interest users, policy rule/config identities and headcount cohort request-line keys. Distinguish permission to see a historical reference in its request context from permission to read the full referenced record, and retain safe authorized original-byte contracts.

Also inspect structured `decision_note` text on HR corrections: `corrections.correct_approved` stores before/after content inside an encoded string, and `api.snapshot` copies it to native Event `note`. The same value can appear on the current request and ordinary command response. The portal timeline extracts the reason, but this does not establish equivalent protection for native current-request/Event reads or raw revision notes. A scalar-type check alone does not establish nested historical-reference authorization there. Prioritize these related note surfaces in the next security increment; do not claim this checkpoint protects every encoded string or every nested identity.

Historical Events, indirect File/child metadata and more complex report paths remain listed in [the native-read audit](S3_NATIVE_READ_AUDIT.md). Complete the integrated S3 requirements check after these guards. All 98 frozen requirements, later recruitment/lifecycle/reporting sprints, HR/IT/UAT, independent security, sustained 1,000+ account capacity/recovery and production rollout gates remain intact.
