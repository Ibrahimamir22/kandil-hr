# S3 — indirect attachment access

13 October 2026. Synthetic engineering checkpoint; S3 remains in progress.

## What changed

Private HR files now follow File-to-File and child-record links to the protected owning document before allowing metadata, document detail, download or ZIP access. Current parent permissions and native User Permissions apply to the resolved target and intermediate File references. Child links must match the real parent table field. Missing intermediate files, invalid child bindings, cycles and paths beyond four intermediate hops fail closed.

Retained records that share the same file URL must all allow the reader. An old unattached alias can no longer expose protected HR content after access is revoked. Ordinary owned, unattached uploads remain available. The same permission policy runs in SQL before pagination; it does not fetch an entire permitted HR document list into Python or filter a returned page afterward. Native File restrictions remain additional restrictions.

The root query also uses each protected parent type's own query hook and native User Permissions, preserving specialized confidential-note restrictions. No upstream code, schema or stored audit history was changed. The fixture inserts are guarded CLI-only synthetic legacy records, not an application upload API.

## Evidence

- [Affected native regression](evidence/s2-regression-e9d9b4e8e82c.json): **110 checks passed** — 10 indirect attachment, 21 raw history, 10 note access, 52 foundation and 17 Board checks. Source stayed unchanged during this run. The HTTP-only indirect fixture was added afterward; the production implementation remained unchanged.
- [Signed-in HTTP checks](../portal/evidence/indirect-files-5e132c520f04/results.json): **34 checks passed**. Authorized files remain readable; outsiders, revoked historical scope and fully revoked HR scope are denied. Mixed ZIPs contain only permitted files; a fully denied ZIP is empty. One-row pages return only allowed metadata without denied-row gaps. Retained bytes, links and actual requester ownership remain unchanged; no server errors. All six temporary accounts were disabled and capacity ledgers reconciled to zero.

- [Existing structured-history HTTP regression](../portal/evidence/history-notes-913d9f3fa605/results.json): **18 checks passed** with the corrected actual-owner fixture. Historical team restrictions still deny raw revision/file access while projected quantities and safe timeline reasons remain available. No server failures; six accounts disabled and ledgers zero.

## Test corrections and diagnostics

Frappe's raw database insertion sets owner from the current session when creation metadata is absent. Earlier history fixtures supplied an owner field while inserting as Administrator, so they did not prove the claimed uploader-owner bypass case. Existing scope and download results remain evidence of those narrower checks. The corrected fixtures insert under the requester session and explicitly assert persisted ownership; this checkpoint tests actual ownership.

The initial [native diagnostic](evidence/s2-regression-0c1cf1317df0.json) exposed File-chain metadata and invalid-link behavior, alongside two fixture assumptions. The [next diagnostic](evidence/s2-regression-347f211abb33.json) narrowed the remaining failures to fixture ownership. The [third diagnostic](evidence/s2-regression-0985d99ed0fc.json) reproduced an unattached-alias detail bypass even after metadata was guarded. Removing the unattached early return fixed it. These failed runs are retained for traceability and are not counted as passing checks.

## Limits and next step

Native Frappe File lists exclude direct child attachments when the child DocType lacks standalone role read rights. Authorized detail, download and ZIP access still work through the parent. We preserve this restriction; a File-to-child chain has its own positive and revocation checks. This is a documented native-list limitation, not a claim that every authorized attachment appears in every native list.

The recursive SQL query is bounded by link depth, but its workload grows with file and child-record volume. This local functional run does not certify performance for 1,000+ accounts. Representative sustained load and recovery remain in S11. Complex/custom reports remain restricted pending their scoped implementation. Known non-HR attachment behavior is retained; this checkpoint does not certify all non-HR dangling references.

Next: integrated S3 verification against all 17 requirements in [the acceptance matrix](S3_ACCEPTANCE_MATRIX.md), then S4 vacancy/recruiter operations. All 98 frozen requirements remain in scope. HR/IT acceptance, independent security review, real deployment identity/email/hosting, production data and capacity approval remain open.
