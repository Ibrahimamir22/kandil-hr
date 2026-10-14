# S5 candidate message templates

14 October 2026. Partial COM-001 engineering delivery within the unchanged 98-requirement goal. HR wording/authority acceptance and complete communication workflows remain open.

## What is connected

**Message templates / قوالب الرسائل** provides a company-scoped Arabic/English library. The configured company HR authority with current company-wide management access can create and revise templates, choose a language and purpose, edit the subject/body, publish or unpublish, and record a reason. A separate confirmation reviews wording, placeholders and publication state. Recruiters can read published templates but cannot publish, inspect private change history or bypass the editor through native document endpoints.

Six optional starter texts cover Arabic/English application acknowledgement, attempted contact and rejection. They are suggestions, not an HR-approved catalog: opening the library creates no database records, and selecting a starter leaves it unpublished until HR explicitly enables publication and saves. Code plus language identifies a template and cannot silently change. Previous versions remain immutable; current status does not rewrite earlier content. Exact command retries return the same revision, and stale competing editors cannot overwrite each other.

Every candidate page now has **Prepare a template message / تجهيز رسالة من قالب**. Recruiters select the message language independently of interface language, select a published template, preview the substituted subject/body and confirm their review before copying either. Values come from the currently accessible application/person, job designation, company, vacancy location and acting recruiter. Templates do not receive confidential rejection notes, salary data, contact lists or arbitrary database objects.

Only named placeholders are allowed. This is literal text substitution, with no template-programming language, expression evaluation or HTML rendering. Unknown tokens, doubled braces and code expressions are rejected when saving; missing required values prevent copying. Substitution happens once, so braces appearing in a person's actual name remain literal. Rendered content has bounded length.

Before a copy, the server rechecks current candidate access and template publication/version, then renders the current values again. If the rendered content changed, the user must review it again. If access or publication changed, copying stops and the preview is cleared. Clipboard denial leaves selectable text and a manual-copy explanation. No clipboard contents are read.

Copying is not sending. It neither completes a rejection-message task nor records consent, delivery or an activity. To record a human-reported send, use the separate reviewed message-outcome action from S5_MESSAGE_TASKS_CHECKPOINT.md. The original rejection draft stays unchanged when preparing or copying a template. No email, WhatsApp or other provider is contacted.

## Scope against the reference

Reference inspected: `Candidates.gs` templatesList_/templateSave_, `Setup.gs` defaultTemplates_ and `Index.html` loadTemplatesAdmin/tplForm at reference commit `7824be24292c4743b4005e14e2df540786cfe167`.

The library supports CONTACT, REJECT, OTHER, INTERVIEW, OFFER and AD purposes with purpose-specific placeholder lists. Candidate contact/rejection/other previews are connected now. Interview, offer and advertising templates are configurable but explicitly excluded from this general composer until their own workflows can supply and authorize the required date/location/interviewer, compensation/terms or apply-link fields. This is a tracked gap, not evidence that those message workflows are implemented.

The reference gives several HR/recruitment management roles template-edit rights. This increment reuses the existing configured company HR-authority boundary used by HR lists. HR must validate that role mapping before acceptance; we have not silently granted every recruiter editing rights or elevated the personal review account. Publication means that configured HR authority enabled the template, not independent four-eyes approval or completed company UAT.

The template library is bounded to 250 templates per company with 20-row display pages, bounded search and five-row history pages. It is not a benchmark for sustained 1,000+ account operation. General-purpose messages currently have copy-only previews; provider delivery, interview/offer/ad consumers, final wording approval, durable sent-template provenance and the broader S5–S12 acceptance work remain open.

## Local review

Review at **http://kandil-review.localhost:8112/hr-portal**. The existing personal recruiter sees a read-only library and the candidate composer. An empty library is expected until an authorized HR reviewer publishes wording. Test evidence uses disposable HR/recruiter accounts on the separate parity site; no template was silently published into the user's persistent review company and no review role/password was changed.

A targeted schema reload installs Kandil Message Template Revision on each isolated synthetic site. Only web processes are restarted. Upstream dependencies and company-data site remain unchanged; shared background workers and their queues are not started or drained.

## Verification

- **47 native checks**, without double-counting earlier runs: [15 final template checks](evidence/s2-regression-bc62740d5423.json), plus [14 catalog and 18 message checks](evidence/s2-regression-12db3feeff0d.json). The earlier 15 template tests in the latter file are superseded by the final run. Coverage includes current HR authority/full scope, revocation, immutable CRUD denial, stale and exact retries, rollback on failed insert, language/purpose validation, literal substitution, missing-variable blocking, inactive-template denial and read-only previews. Backend source hashes stayed unchanged during each run.
- **58 workflow browser checks**: [25 final template checks](../portal/evidence/message-templates-77ef19f9d611/results.json) plus [33 rejection-message regressions](../portal/evidence/candidate-messages-8f5740558c7e/results.json). The final template run includes a real, reasoned candidate-profile correction between preview and copy; copying stops until the new name is reviewed. It also covers template withdrawal between preview/copy, HTML-as-literal-text, copy denial, English/Arabic publication, exact lost-response retry, concurrent editors and current revocation. Rejection tasks remain pending after preview/copy. The affected message run predates only the template response's readable revision number; final template checks cover that change.
- [24 final personal review checks](../portal/evidence/review-work-1791950864256/results.json) passed with identical before/after business-record digests, including the new template revision table. The existing personal recruiter remains read-only in template administration. Candidate composer, activity/closure panels and message/follow-up queues load in both languages without errors.
- [Four final screenshots](../portal/evidence/message-templates-77ef19f9d611/visual-review.json) were inspected in English desktop and Arabic mobile. The long internal template revision ID was replaced by readable code and revision sequence after the first visual pass.
- All parity cohorts retired six synthetic accounts, restored their feature lease and left zero fixture ledgers while retaining history. Successful browser runs recorded no page errors, server 5xx or external requests. A template copy did not create delivery, consent or message-resolution records.
- TypeScript/Vite build passed. Existing runtime-font and bundle-size advisories remain. All 98 reference mappings and upstream source pins are preserved.

The [first 24-check template run](../portal/evidence/message-templates-148d494d9585/results.json) and [earlier 24-check review](../portal/evidence/review-work-1791950703211/results.json) remain historical evidence, not additional tests in the totals. Templates and preview passed before the final readable-revision display refinement; the final run additionally tests changed candidate values.

## Next

Connect reviewed reopening/history cycles and the required downstream interview/offer/referral transitions, then finish remaining S5 sourcing, private documents, batch imports and consent/self-service clauses. Connect template consumers in S6 interviews, S7 offers and advertising rather than synthesizing their missing values. S8 onboarding, S9 employee lifecycle, S10 reports/integrations, S11 independent security/capacity/migration and S12 release/handover remain open, alongside HR/IT decisions and real-data rollout.
