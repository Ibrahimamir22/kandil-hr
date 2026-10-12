# Revision/import audit and hiring notification capture review

12 October 2026. Isolated synthetic parity site only. Goal remains active.

## Changes

- Revision approval and all five organization import kinds now write exact private command envelopes in the same transaction as the business changes. Explicit server invocation identities distinguish these existing endpoints from client-command endpoints. Child JD content, private Grade range, reviewed rows/digest, actual created/reused records and snapshots are projected through reviewed allowlists.
- Hiring Request outbox delivery now captures a private MIME artifact and one local Notification Log in one transaction. The capture uses the already-approved persisted body, current recipient email and request permissions. A stable outbox identity prevents duplicate captures on retries. No SMTP/provider operation is performed. The native capture UI is translated; notification subject/body retain their persisted language and are not automatically rewritten per recipient.
- Native mail read/list/download/file/report/export boundaries are covered. Revoked request access and disabled recipients suppress delivery; previous downloaded copies cannot be revoked.
- Native Employee confirmation and Employee Transfer endpoints are denied to an APPROVALS-only delegate while the permitted hiring approval still succeeds. This does not implement the P8 probation lifecycle.

## Findings retained

1. Independent review caught unconditional audit adapters changing non-parity-site behavior. Adapter capture and recording now no-op outside active parity flags; a focused test verifies no database reads or audit writes.
2. Initial JD audit test found in-memory timestamp strings versus reloaded datetime normalization. Only declared temporal fields are canonicalized; user-authored date-like text is preserved.
3. Initial mail test expected raw markup that Frappe sanitizes before storing the approved outbox body. The corrected test compares MIME content against that persisted approved body, preserving native sanitation.
4. Review found the frozen Board Vice was omitted by the current outbox relationship check, and that the old delegation predicate lacked the full process/status/current-principal checks. Final checkpoint records the resulting fix and native proof.

5. The first serial regression stopped after 19 passing suites because the central audit runner still expected 13 tests after a new 14th test was added. Its discovery counts were corrected; the prefix and suffix reports retain the exact source change.

Initial focused failures remain in evidence/revision-mail-focused-initial-2026-10-12.json. Full regression/browser evidence and tested commit are recorded by CHECKPOINT.md after execution.

## Boundaries

AUD-001-01 remains partial: original joining, delegation and selected native/system operations still need compatible exact-envelope adapters. Local audit immutability does not replace independent external tamper evidence. WAG-001-01 still depends on the real overdue-document job from P7; the frozen P0–P3 case wording is not weakened. HR terminology, identity provider/MFA deployment, audit custody and human acceptance remain separate.
