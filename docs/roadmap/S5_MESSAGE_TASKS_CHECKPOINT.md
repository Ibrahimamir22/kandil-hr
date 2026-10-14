# S5 rejection-message tasks

14 October 2026. Partial engineering delivery under SCR-002, ACT-001/002 and COM-001/002; the 98-requirement goal, S5 and release acceptance remain open.

## Connected workflow

The Arabic/English portal now has **Rejection messages / رسائل الاعتذار** with pending, resolved and all-task filters, search, exact current-scope counts and bounded pagination. Opening a task navigates to its existing candidate application. The original rejection-message draft remains distinct from the confidential rejection explanation.

**Copy draft** copies only the original draft. It neither sends a message nor completes the task. If clipboard access fails, the text remains selectable and the page explains how to copy it manually. No clipboard content is read.

An authorized recruiter can record one reviewed outcome:

- **Manually reported sent / إرسال يدوي حسب إفادة المستخدم** requires a channel (WhatsApp, email or Other), the actual text the user reports sending and explicit confirmation. An optional internal explanation is stored separately.
- **Not needed / لا تحتاج رسالة** requires a reason of at least three characters. No channel or sent text is stored for this outcome.

Both are human reports. The response and record explicitly carry `sent_by_system=false` and `provider_verified=false`. No external service is contacted and no verified-delivery claim is made. The timestamp is when the report was recorded, not a provider delivery timestamp.

## Records and security boundary

A new immutable **Kandil Candidate Message Resolution** links to exactly one closure and application. Its actual-message text and internal note do not overwrite the closure decision, original reason, draft or original pending snapshot. Current message state is derived from the resolution. A linked, non-voidable MESSAGE activity records the outcome without copying the private text into the activity feed. General command audits retain references/content hashes rather than message/note content.

Mutation uses the existing company/request/application locking and current native/team permissions. It verifies application/request versions, closure identity and hash. Cross-application substitution is denied. Exact-command retries return the original record; competing outcomes cannot overwrite it. Audit/activity failure rolls back the entire effect. Native document CRUD does not bypass these controls. The UI does not offer corrections or deletion of the recorded outcome; any later correction capability needs an explicit append-only review contract.

Encrypted actor-owned recovery preserves the exact outcome/channel/text/note after an uncertain response or reload. A user can review and recover the original result; current permissions are checked again before inspection/execution/replay. Acknowledgement removes the recovery copy while retaining business history. The recovery screen labels message outcomes independently of call outcomes.

The queue excludes private draft/message/reason text. It uses current candidate permission scope and native record filters, not a historical updater identity. Candidate person/application identity, owner, headcount and the original closure record remain unchanged by task resolution.

## Reference mapping and unfinished clauses

Inspected reference: `Candidates.gs` `rejectMsgDone_` and `candTasks_`, pinned reference commit `7824be24292c4743b4005e14e2df540786cfe167`. The reference permits SENT or reasoned NOT_NEEDED; its pending queue includes vacancy-team members or the last updater. This implementation makes the human-report nature explicit, requires the reported channel/text and uses current authorized scope. HR must accept that permission mapping; an old updater does not retain access after revocation.

COM-001 remains partial: copying an existing draft is implemented; reusable approved templates and dynamic template substitution remain open. COM-002's manual outcome step is connected; configured provider delivery and any provider verification are not implemented or claimed. The complete task screen still needs duplicate/knockout/ad-close categories. Legacy native rejections without Kandil closure records are not silently assigned new tasks; any backfill requires a reviewed migration policy.

Reopening and repeated closure cycles, coordinated live interview/offer/referral handling, sourcing credits/agency/referral rules, full private candidate documents, batch imports, consent/retention and candidate self-service remain required S5 work. Later S6–S12 scope remains unchanged. This checkpoint does not accept a whole frozen requirement by implication.

## Review and deployment

Use **http://kandil-review.localhost:8112/hr-portal → Rejection messages / رسائل الاعتذار**. To produce a task, open an eligible synthetic candidate and save a reviewed rejection; withdrawal creates no message task. Recording an outcome changes only that synthetic task. Existing personal credentials and roles are preserved.

Both isolated synthetic sites received targeted schema reloads for the resolution, activity link and recovery operation. Only web services restarted. Review workers/scheduler remain stopped; shared workers/backlog, company-data site, Odoo, upstream dependency pins and external delivery were untouched.

## Verification

- [86 native checks](evidence/s2-regression-c3c8b9688e6b.json) passed: 18 message-task, 20 closure, 27 activity and 21 recovery checks. These exercise input validation, immutable originals, current scope/revocation, audit and activity rollback, native CRUD denial, exact encrypted recovery, derived status and scoped queue counts/pages. Test transactions rolled back; backend source hashes were unchanged.
- [33 final message browser checks](../portal/evidence/candidate-messages-242f382b7881/results.json) passed on ordinary authenticated sessions: copy success/failure, search/pagination, required review, manual and not-needed outcomes, uncertain-response recovery across reload, current permission checks, native endpoint denial, concurrent same/different commands and AR mobile presentation.
- Affected workflow regressions passed: [25 closure checks](../portal/evidence/candidate-closure-026de9d75d17/results.json), [42 recovery checks](../portal/evidence/recovery-ui-77023e97a333/results.json) and [23 combined activity/follow-up checks](../portal/evidence/candidate-activity-actions-166da7c0e724/results.json). Together with the final message run: **123 workflow browser checks**. These affected runs predate only the new message component's final bidi/timestamp presentation change, which is covered by the final message run.
- [18 final read-only review checks](../portal/evidence/review-work-1791949800105/results.json) passed for the existing personal account in English and Arabic. Message/follow-up queues and candidate activity/closure panels loaded; complete tracked business-record digests, including message resolutions, were unchanged. No user review record was reseeded, rejected or resolved by that harness.
- [Final visual review](../portal/evidence/candidate-messages-242f382b7881/visual-review.json) covers five English desktop/Arabic mobile screenshots. Timestamp direction and English draft punctuation were corrected after inspecting the earlier run; the queue screenshot now waits for navigation animation to settle.
- All mutation cohorts retired six synthetic accounts, restored their feature lease and left zero fixture capacity ledgers while retaining audit history. No browser errors, server 5xx or external requests occurred in the successful runs. The clipboard test uses a page stub and does not claim real OS clipboard permission evidence.
- TypeScript/Vite build passed. Its existing runtime-font and bundle-size advisories remain; passing functional tests is not a sustained-capacity claim. Frozen mapping remains 98 unique IDs; upstream pins remain unchanged.

The [first browser attempt](../portal/evidence/candidate-messages-c6b9d8f985e0/results.json) stopped because its search assertion ran before the asynchronous response; the harness now waits for that response and the rendered result. Its cohort was retired. The [31-check intermediate run](../portal/evidence/candidate-messages-7def45af913e/results.json) and [earlier 18-check review](../portal/evidence/review-work-1791949536499/results.json) remain historical evidence and are superseded by the final runs above, not added again to the totals.

## Remaining delivery gates

Continue approved templates and candidate communication, reviewed reopening/history cycles, downstream cancellation integration and remaining S5 clauses. S6 interviews, S7 offers, S8 joining/onboarding, S9 lifecycle, S10 reports/integrations, S11 security/capacity/migration and S12 staged release remain open. HR terminology/policy/UAT, IT identity/hosting/backups, independent security, sustained 1,000+ account workload and real-data rollout need their own evidence. This is an isolated engineering checkpoint, not production acceptance.
