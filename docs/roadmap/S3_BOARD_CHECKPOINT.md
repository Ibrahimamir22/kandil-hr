# Sprint 3 — Board approval and private evidence

13 October 2026. The custom Arabic/English portal now connects the Board part of slice 4 over the existing native recruitment command. This checkpoint covers engineering and synthetic verification; it does not close S3, all 98 requirements or production acceptance.

## What a user can do

Open `http://localhost:8102/hr-portal`, open an authorized hiring request, and use **Board approval / اعتماد مجلس الإدارة** after the configured CEO step has completed.

- The frozen Chair or Vice can approve, reject or return directly. They cannot record another member's decision merely because they are a Board member.
- The designated Sector recorder can record an eligible Chair/Vice's external decision. The form requires the member, method, explanatory note and private supporting file; Return/Reject additionally require a reason.
- The confirmation shows the reviewed request/version, recording mode, deciding member, actor, outcome, reason and proof. A file upload does not record a decision.
- The current-round result keeps the actor distinct from the deciding member, with method, note, time and a permission-checked proof download. Full previous-round comparisons belong to slice 5 and are still pending.
- EN desktop and AR mobile use the same personal-session APIs and server decisions. An outside-scope account cannot read the request context or download its proof.

## Code and security boundaries

`frontend/portal/src/BoardApproval.tsx` supplies the UI. `kandil_hr/portal/board.py` supplies bounded context/file projections, exact proof lookup, private uploads and the minimal decision adapter. Business authority remains in `recruitment/authority.py` and `recruitment/api.py`; upstream Frappe/ERPNext/HRMS source is unchanged.

The native decision command enforces the frozen route, CEO-before-Board order, current enabled roles/scope, personal-interest exclusions, reviewed version, exact retry identity and transactional audit/headcount rules. Ordinary delegation does not confer Board authority. Sector recording authority is separate from the named member whose external decision is recorded.

Upload accepts a nonempty PDF, PNG, JPEG or UTF-8 text file up to 10 MiB with signature/extension checks. It uses the same-origin authenticated session, CSRF protection, request write permission, current eligible Board stage and Company-first locking. A minimal atomic receipt returns one File ID for an exact retry. An exact permission-checked proof lookup avoids relying on the first attachment page after uploading.

Proof must be a local private nonfolder File attached to this exact request. Ordinary File lifecycle writes cannot replace an existing request attachment's bytes, privacy, URL, name or attachment target. The decision audit records an explicit File ID/name/size/SHA-256 projection. Recorded proof remains protected against deletion/rename after a returned request is revised and its current approval rows are replaced. Deletion is checked before the native physical-file removal hook. Tests check both retained database records and actual file content.

These are application controls, not malware scanning, external immutable archiving or protection from privileged database/filesystem operators. File retention policy, independent security review, operational administrator accountability and infrastructure limits remain release work. Files remain readable to current authorized request readers under native File permissions; they are not advertised as Board-only secrets. No external email is sent.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Board, authority, audit, recruitment command and portal native suites | 81 passed | [Final native run](evidence/s2-regression-5ad50ab48e80.json) |
| Personal-session Board workflows, EN desktop and AR mobile | 51 passed | [Final Board browser run](../portal/evidence/board-35ff8b093670/results.json) |
| Original hiring → approvals → vacancy and return/revision journey | 24 passed | [Final original journey](../portal/evidence/browser-a3fe86fb1571/regression.json) |
| TypeScript / Vite build | Passed, 43 modules | `npm --prefix frontend/portal run build` |
| Scoped screenshot review | Passed for listed full-page/EN panel views; mobile element crops have a sticky-header capture limitation | [Visual review](../portal/evidence/board-35ff8b093670/visual-review.json) |

Native total: 17 Board adapter cases, 12 original authority cases, 15 command-audit cases, 26 recruitment command cases and 11 portal API cases. Final evidence fingerprints match the published source. The two final browser cohorts both have account-disabling and zero-commitment cleanup evidence.

The native tests cover direct Chair/Vice decisions, missing/ineligible member/method/note/proof, cross-request and remote/public/folder proof denial, private upload replay, malformed input, current disabled/revoked/self-interested authority, bounded listing, exact scoped proof lookup, immutable bytes/metadata, retained evidence after revision, and atomic rejection of malformed audit identities. Existing authority, audit, command and portal suites are included.

The browser tests use nine fresh synthetic accounts and ordinary sessions. They exercise the actual review/confirm forms in EN desktop and AR at 390px, direct Vice approval and Chair rejection, Sector recording a Vice return, private upload/download, exact and simultaneous upload retries, old decision replay after revision, retained proof deletion denial, Guest/outside-scope/read-only HR denials, GET/CSRF denial and no observed JS errors, HTTP 5xx or external traffic. Screenshots and cleanup are retained with the results. Synthetic accounts are disabled and all cohort commitments reconcile to zero; decision history and proof stay retained privately.

## Diagnostics retained

- Native `008ec13f29ff`: the new evidence identity was not yet included in the central audit allowlist; four cases errored. The fix validates exactly the reviewed fields and their shape rather than opening arbitrary audit data.
- Native `1ec035720cec`: 14 cases passed; the remaining test used an unsupported `ignore_links` deletion keyword. The test now uses the actual native force-delete parameter and verifies bytes plus rename protection.
- Native `51f5dd21880e`: all 80 cases passed before the final exact-proof lookup addition.
- Native `582e9473746c`: all 81 cases passed before the concurrent receipt visibility fix; final native evidence includes that fix.
- Browser `c055350b91c0`: 47 checks passed before exact-proof lookup/concurrent-first-upload coverage was added; nine accounts disabled and ledgers zero.
- Original browser `abdc80e4c427`: 24 checks passed before that final lookup addition. Final-source evidence is listed above.

- Browser `d17cc2a2e3a8` and `070724393bb9`: concurrent first-upload retries exposed a current-receipt versus older File snapshot mismatch (one HTTP 200, one 404). Refreshing the test request version did not resolve it. The upload replay now locks/reads the referenced File with current visibility, then repeats its attachment and permission checks. Both diagnostic cohorts were cleaned with all nine accounts disabled and zero commitments.

## Next

Connect server-filtered **My Requests / All within my scope**, search and pagination, then immutable submitted revision and per-decision review comparisons. Keep HR confidential notes and restricted employee fields outside ordinary request history. Test changed policy, returned/revised requests, revoked readers and guessed historical IDs.

S3-03 engineering combines this checkpoint with the previously verified delegation checkpoint. S3-04/S3-05 and full S3 acceptance remain open. All 98 frozen reference IDs and the historical 80-case result (72 passed / 4 partial / 4 blocked) remain unchanged. HR/IT identity/MFA and workflow sign-off, sustained 1,000+ account capacity, independent security, backup/recovery, hosting, authorized real-data migration, UAT and staged release remain explicit gates. The full goal remains active.
