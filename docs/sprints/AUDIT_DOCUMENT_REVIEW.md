# Audit and document checkpoint review — 12 October 2026

Scope: current custom application on the isolated synthetic parity site. This is
an implementation review, not HR acceptance or a production security certification.
The final execution report and tested source identity are linked in CHECKPOINT.md.

## Findings addressed in source

| Finding | Correction | Verification boundary |
|---|---|---|
| HR review/escalation could lose the delegated principal in the new audit envelope | Freeze the active authority for review and escalation as well as decisions | Native delegated-review assertion; final regression still required |
| Relocation after-state omitted the capacity released at the old location | Retain previously captured targets when building the after-state | Both old and destination capacities asserted before/after |
| New related-record locks followed User locks | Acquire known related domain records before the sorted User/grant locks | Local HTTP concurrency gate; no universal deadlock-free claim |
| Native delegation JSON saves compared date strings with database date objects | Normalize immutable date/datetime comparisons | Native revocation retains original approval metadata |
| Raw MIME stored in Long Text was altered by native sanitization | Store base64 of the original MIME; verify its decoded SHA-256 for download | Actual AR/EN MIME and PDF attachment checks |
| Recipient picker called a GET-only endpoint using POST | Set the method explicitly in the native dialog | Browser action, not only direct Python invocation |
| Filtering ineligible recipients could leave error popups despite a successful picker response | Suppress messages only within eligibility evaluation; restore the previous flag | Native message-log and browser checks |
| A broad recipient could widen the sender's captured document | Include only location and manager scopes visible to both parties | Native narrow-sender/broad-recipient MIME assertion |
| A saved MIME remained accessible after losing a non-anchor location | Persist every included scope and recheck each on native read/list/download, replay and queued dispatch | Partial branch revocation while anchor access remains |
| Saved PDF access did not require current JD print permission | Require both read and print; current-row checks during queued dispatch | Print revoked while read remains enabled |
| English output preferred Arabic manager titles | Choose the requested language with a fallback | Native English MIME and Arabic/English browser coverage |

Failed attempts remain in the evidence directory. Test-selector failures, native
sanitization differences and fixture ordering failures are distinguished from
product defects. No failed attempt is silently relabeled as a passing run.

An independent read-only follow-up review of the corrected capture helper,
included-scope schema and queued-delivery adapter found no additional actionable
authorization or transaction defect. It did not execute database/browser tests;
those results are recorded separately. This is not a full-system security audit.

## Limits retained

- Central command envelopes currently cover recruitment and structural wrappers;
  other decision boundaries remain listed in COMMAND_AUDIT_DESIGN.md.
- Immutable application records are not external tamper evidence and do not prove
  administrator/database-operator governance.
- Captured mail is local only. No mail provider or external delivery was enabled.
- Capture list permission evaluates the user's candidate records against their
  recorded scopes. Production-scale performance is not certified by these tests.
- Revocation blocks future system access; it cannot recall a file already
  downloaded by an authorized recipient.
- HR/IT policy decisions, final restore rehearsal and human acceptance remain open.
