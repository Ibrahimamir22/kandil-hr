# S5 basic profile corrections and history

**Engineering checkpoint; full S5 and production acceptance remain open.** This extends the candidate workspace with reasoned corrections to the existing basic professional profile. Sensitive disclosures, identity merging and employee relationships are separate work.

## Behavior and design

- Authorized recruiters open **Correct profile / تصحيح الملف**, edit the shared basic profile, provide a reason and review before/after values before confirming. Preferred language is available in Arabic and English.
- A correction is anchored to a currently readable application and its hiring request. The server rechecks current request scope, recruiter/team authority, opening/application/person consistency and native person read permission before both new writes and receipt replay.
- Request and person versions are checked. Competing corrections cannot silently overwrite each other. A correction changes the person master only; application name/contact/source snapshots remain unchanged.
- Each change appends a server-generated `Kandil Candidate Profile Revision` containing actor, reason, reviewed/result versions, the explicit basic profile before/after and a content hash. Ordinary accounts cannot read the raw revision DocType or edit/delete it. Native person edits remain prohibited.
- The existing recruitment command receipt and private audit cover the correction and revision hash. Audit failure rolls the whole operation back. This is application-level immutability, not independent external audit custody.
- Portal history returns only field differences for revisions anchored to applications currently readable by the viewer. Counts use that same scope. Hidden applications, raw audit envelopes and their revision reasons are not exposed.
- After a lost or malformed success response, the mounted correction form retains the exact command/payload and disables editing while offering the same retry. This does not yet provide recovery after navigation/reload.

## Evidence

Native verification:

- [74 passed checks](evidence/s2-regression-af2113b62e28.json): 9 correction, 17 identity, 7 candidate projection, 15 command-audit and 26 recruitment-command cases.
- After adding the earlier application/person consistency check, [24 affected checks passed](evidence/s2-regression-26690a91ea57.json): the same 9 correction and 15 audit cases, now proving that a mismatched or guessed person is rejected before an unrelated person document is read. These are reruns, not 24 additional distinct cases.
- Source hashes remained stable within each run. [37 browser checks passed](../portal/evidence/candidates-4ba92b6ede6e/results.json) on final source: existing intake/paging/reuse, EN correction review, lost/malformed-response recovery, one revision on retry, stale and competing-edit protection, AR mobile correction/history, and revoked history/replay denial. [Four correction/history screenshots](../portal/evidence/candidates-4ba92b6ede6e/visual-review.json) were visually reviewed. The six synthetic accounts were disabled, capacity reconciled to zero and the intake setting restored. No browser runtime errors, 5xx or external requests were observed. Earlier native pass `d190bd7faefb` covered 46 checks before final contact validation and rollback cases. Browser run `2a5ab5973604` passed English correction/retry/concurrent-edit checks but stopped at the Arabic preferred-language selector; the selector now has an explicit accessible label. Its failed evidence and successful cleanup are retained.

## Remaining work and activation

The identity feature flag remains restored to disabled after synthetic tests. Correction controls therefore remain hidden for ordinary review traffic; existing authorized directory/detail/history reads still work. Candidate mode must not be enabled on a company-data site by copying test commands.

Still required: controlled legacy migration preview, intake/correction draft recovery across navigation, broader person search and duplicate review using corrected master contacts, sensitive disclosure states, full profile and former/internal employee relationships, candidate ownership/follow-up/activity and recruiter-wide handoff, sourcing, private files, consent/retention, imports and candidate communications. The frozen reference supports more fields and workflows than this basic-profile checkpoint; none are removed from scope.

S6–S12 and the existing HR/IT/security/capacity/recovery/production gates remain open. No cloud deployment, real-candidate messages or production acceptance is implied.
