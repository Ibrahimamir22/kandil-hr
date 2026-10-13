# S3 historical reference visibility

13 October 2026. Engineering contract for the retained recruitment history. It does not grant User/Employee profiles or configuration access, and it does not authorize production release.

A requester must be able to understand a decision using its recorded content. The system must also respect later restrictions. We preserve the stored audit bytes and apply different read contracts to raw native JSON and the custom portal: raw JSON cannot selectively redact its references, while the portal deliberately returns a smaller projection.

| Reference | Native raw revision contract | Custom history projection |
|---|---|---|
| Requested, resolved and skipped positions | Position role/read scope, company and native User Permissions; resolved request position matches the capture | Requested/line locations retain their existing captured-location checks. Skipped explanations expose authority/reason, not the skipped position ID. |
| Resolved assignment | Exact recorded assignment/position/principal relationship, company, current assignment scope and native User Permissions. No grant to the full assignment or Employee profile. | Assignment IDs are not exposed. Decision principal/actor references follow the identity projection below. |
| Route config and applied rule IDs | Current reference exists in the request company and applicable department/position; native User Permissions apply. Stored policy values and dates remain historical. | Internal config/rule IDs are omitted. Explicit captured policy and rule explanations remain; named authorities follow identity restrictions. |
| Requester, beneficiary, actor, principal, Board member/vice and named policy authorities | Captured User ID exists and meets native User Permissions. A formerly active account need not still be enabled or hold its old role. | A restricted or unavailable identity becomes null with a `restricted_identities` field marker. AR/EN screens label it explicitly. Permitted identities, dates, quantities and other captured details remain visible. |
| Headcount basis capacity keys | Must correspond to a captured request line and meet current Capacity permissions | Internal basis keys are omitted from these history views. Separate authorized headcount guidance remains a different endpoint. |
| Headcount cohort line keys | Exact native line/capacity/parent relationship; caller must be able to read the other request under scope, relationship and native User Permissions | Other requests' internal line IDs are omitted. A restricted cohort does not by itself remove otherwise permitted projected history. |
| Pending-quantity evaluation lines | Match line ID and capacity inside the same frozen capture | Requested/proposed/reserved/approved values continue to come from the stored request capture. |

The raw checks apply to the main capture and both embedded full captures in an HR correction. Revision-attached File listing inherits the same raw-history condition and native Revision User Permissions. Ownership of an attachment cannot bypass its parent history restriction.

Portal command metadata, saved-version metadata, request identity fields, approval-step actors/principals/Board members and named policy authorities use the same projection helper. Account existence and permissions are evaluated with bounded ID lookups per projected capture, without loading User profiles. A hidden actual Board member is never replaced by the nominal chair: the UI displays the restriction instead. Stored command envelopes and revision JSON are never modified by redaction.

A disabled historical authority remains a valid reference. Ending an assignment or changing current policy must not rewrite an old decision, and read-time checks do not re-run the current approval chain. These rules do not permit that former authority to perform a new action; command authorization has its existing enabled-account, role, scope and independence checks.

## Limits and remaining review

This contract covers structured reference fields and the declared route schema. User-written reasons, comments and uploaded document contents are not automatically scrubbed for names or email addresses. They require the source workflow's ordinary content and document permissions; this helper is not a semantic data-loss-prevention system.

Other serialized audit-note families, including vacancy/ownership before-and-after payloads, need their own declared schema/reference checks. Indirect File-to-File/child metadata, complex report paths and remaining S3 acceptance cases stay open. HR/IT review of actual role visibility and retention is still required. Query count and JSON predicate cost must be measured under the S11 sustained 1,000+ account workload before production capacity is claimed.
