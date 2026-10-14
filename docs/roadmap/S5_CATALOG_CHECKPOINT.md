# S5 editable HR lists and activity types

14 October 2026. Partial engineering delivery within the unchanged 98-requirement goal. S5, HR acceptance and production release remain open.

## Delivered behavior

HR lists now provides seven company-specific lists in Arabic/English: request rejection, request return, candidate rejection, candidate withdrawal, employee exit, activity types and hiring restrictions. The reference is Admin.gs and Setup.gs at 7824be2. The 45 versioned defaults include the protected DUPLICATE withdrawal code used by the reference candidate merge, although absent from its initial seed table.

Only activity types are connected to their consuming workflow in this increment. The other six lists explicitly warn that their workflow screens do not use them yet. Configuring a rejection reason does not yet implement candidate rejection or message delivery.

Configured company HR with a company-wide manage grant can add items, change Arabic/English labels, note requirements and ordering, or deactivate unprotected items. Codes stay fixed. Normalized duplicate labels, invalid ordering, new inactive entries, removal of the last active entry and protected-code deactivation are rejected. Recruiters can read scoped company choices but cannot edit them. This authority mapping is stricter than the reference role list and still needs HR acceptance; existing review-user privileges were not broadened.

Each change saves an immutable snapshot, reason, actor, sequence and hashes. Current authority is checked on retries; exact command replay returns the existing result, competing edits reject stale versions, and failed writes roll back. This is a database revision audit, not an externally anchored tamper-proof log.

## Candidate activity integration

Activity forms use the active company choices and their note policy. Historical records preserve the label and catalog version used at recording; renaming or disabling a type does not rewrite history. A disabled type cannot be selected for a new activity, but earlier manual entries retain their authorized void path. Stale catalog versions are rejected. Recovery displays the originally reviewed type label. Existing plain-activity signatures and old event hashes remain compatible.

Catalog saves freeze their original payload after an uncertain response and support exact retry while the form remains open. After leaving or reloading, the user must review list history before making a replacement change. Catalog writes do not yet have the durable candidate recovery inbox; candidate activities continue to use their existing encrypted recovery mechanism.

The new Kandil HR List Revision DocType stores list_process (rather than the reserved process attribute). Activity kind now uses a Data field with server validation to allow custom stable codes, with additional read-only label/version fields. Both synthetic sites received targeted schema reloads and the rebuilt portal; only web services were restarted. Upstream core/pins are unchanged. The company-data site, Odoo, external email and production were untouched; review workers/scheduler remain stopped.

## Evidence

- [62 native checks](evidence/s2-regression-b3737f827333.json): 14 catalogs, 27 activities and 21 recovery. Includes protected codes, normalization, permissions, native read/write denial, transaction rollback, current-authority replay, historical labels, stale configuration and recovery compatibility.
- [25 final catalog browser checks](../portal/evidence/hr-lists-effca42dd068/results.json): ordinary roles, seven lists, explicit unconnected-consumer notice, lost-response retry, custom required notes, AR/EN history, competing saves, native read denial, revocation and preserved candidate identity/capacity.
- [23 combined activity browser checks](../portal/evidence/candidate-activity-actions-cab81a338041/results.json) and [42 shared recovery browser checks](../portal/evidence/recovery-ui-6835f10e39dd/results.json). Total: **90 workflow browser checks**, without counting superseded runs.
- [12 read-only review-site checks](../portal/evidence/review-work-1791946730259/results.json): existing personal login, English/Arabic queue/work/activity views and unchanged business-record digests, including catalog revisions.
- [Visual review](../portal/evidence/hr-lists-effca42dd068/visual-review.json): English create form and Arabic mobile edit/history. Checkbox spacing was repaired before the final browser run. TypeScript/Vite build passed; bundle-size and runtime font-resolution advisories remain.

The native suites predate the final CLI fixture grant repair and review-inspection digest addition; final browser checks exercise those changes. Synthetic cohorts were cleaned up, temporary candidate settings restored, six accounts per cohort disabled and capacity reconciled.

Failed evidence is retained: the [first native run](evidence/s2-regression-8ecf3007bd38.json) exposed the old fixed Select field rejecting custom activity codes; the [first browser fixture run](../portal/evidence/hr-lists-a86162c1eea6/results.json) rejected mutation of an immutable permission grant. The fixture now inserts a new isolated grant and uses a scoped cleanup grant after revocation. The earlier 24-check browser run and earlier review run are superseded, not added to totals.

## Review and next work

Open http://kandil-review.localhost:8112/hr-portal and choose **HR lists / قوائم الموارد البشرية**. The existing personal recruiter login has read-only lists; company-wide HR editing was verified with isolated authorized test accounts. Candidate activity choices appear under Candidates → Communication and notes → Record activity.

Next: coded candidate rejection/withdrawal actions, separate internal reasons from candidate messages, and connect the relevant catalogs. Template/message activities, full managerial void-authority mapping, recruiter-wide MOVE_ALL, sourcing/imports, complete profiles/private uploads/consent and remaining S5 work stay open. S6–S12, HR/IT policy decisions, independent security review, sustained 1,000+ account capacity testing, real-role HR UAT and production hosting/migration/release remain unfinished. No reference requirement is accepted by implication.
