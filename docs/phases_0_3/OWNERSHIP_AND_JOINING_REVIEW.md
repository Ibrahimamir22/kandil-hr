# قنديل — Ownership and joining review / مراجعة المسؤوليات وتصحيح المباشرة

This is the local synthetic P0–P3 implementation. Use port **8102** and ordinary role accounts. The full candidate journey, transfers/exits, production payroll and HR policy sign-off remain separate.

## Application responsibility / مسؤولية طلب التوظيف

A vacancy may have several recruiters and one lead. An application has one responsible recruiter. Native **Job Applicant → Application actions** provides **Assign application owner**, **Set next action**, and **HR unassigned applications**.

- The creating recruiter is responsible when they belong to the active team; otherwise the explicitly assigned lead is used.
- Handoff requires a current team member, a reason, current scope and the reviewed request/application versions. Replaying the same command does not repeat its effects.
- Disabling an account clears its active application and next-action ownership, plus its lead/team membership. Task text and due date remain visible. HR sees an explicit unassigned queue; the system does not invent a substitute user.
- Cleanup follows the committed account change. If cleanup fails, the visible effective owner is already unassigned and an hourly internal scan retries persisted cleanup. This is not a guarantee of an active production scheduler: deployment must verify worker/scheduler health.
- Original owner/history remains recorded. Background retries explicitly identify that the original initiating actor is unavailable.

المقصود بالمهام هنا هو **الإجراء التالي داخل طلب المرشح**. لا يشمل هذا الاختبار نقل كل مهام ToDo العامة في Frappe أو تكاملات الأقسام الأخرى.

## Incorrect joining / إلغاء تسجيل مباشرة بالخطأ

Use **Job Offer → Void Incorrect Joining** as the configured company HR authority. Enter the reason and review the confirmation.

The command applies only to an unchanged external-hire joining with an unused draft onboarding record. It retains the offer, employee, dated assignment, onboarding and audit records:

1. Marks the dated assignment voided and removes it from current occupancy and authority resolution.
2. Sets the unused Employee to Inactive and marks its joining voided.
3. Marks the onboarding draft voided and blocks submission/deletion.
4. Decreases actual joiners/occupied seats by one, reopens one approved vacancy, and reopens the parent request when necessary. Structural and reserved counts do not change.
5. Records reason, actor, time and before/after evidence; one command receipt prevents duplicate effects.

The original offer outcome **Joined** remains an original historical fact; the separate **Joining Voided** marker and metadata record the correction. Paused vacancies retain Hold/Freeze state, including nested Hold → Freeze. No employee or audit history is deleted by the business command.

A later assignment, linked user account, submitted onboarding, payroll selection or supported downstream HR record blocks this narrow reversal. Payroll calculations and monetary records are never changed by the reversal. The explicit protected native references are in `kandil_hr/recruitment/employee_links.py`, with Payroll Entry employee child rows checked separately. Arbitrary custom applications and unrelated ERP child tables require integration review before production. Transfers, exits, date corrections after operational use and rehiring the same application require separate reviewed workflows.

## Native request views / عرض الطلبات وسجل القرارات

**My Requests** filters the native request list to the signed-in requester. **Requests in My Scope** restores the organizationally scoped list. The server still enforces company, unit, vacancy-line branches and the selected Position's own branch.

**Decision Timeline** shows immutable event order, actor, acting principal and time. It does not reconstruct missing old principals from today's route. Historical entries without a recorded principal stay explicitly unknown. HR-private notes and revision payloads are not returned by this timeline.

## Organization / الهيكل التنظيمي

A Sector authority with company-wide management scope can create/update a native Department with a change reason. An ordinary requester may read their allowed unit but cannot change it through the browser or direct API. Assignment imports have a **Reconcile Assignments** preview listing every unmatched Employee/Position reference; review/apply remain blocked until resolved. Repeating accepted imports must not duplicate occupancy.

## Manual synthetic review

- Create two candidate applications in an approved, open, assigned test vacancy. Confirm owner and next action; hand one to another authorized team member and inspect retained history.
- Review the unassigned queue after disabling that test owner. Account cleanup is post-commit; inspect the recorded reason and worker log if it remains pending.
- Record one actual synthetic joining. As company HR authority, void it and compare the vacancy, parent, assignment and capacity. Attempt the action again: it must not release another seat.
- Attempt a new operational record for the voided employee: the supported native HR/payroll paths must reject it.
- Compare My Requests and the permitted list as requester versus manager. Open the decision timeline in English and Arabic and compare an actual delegated decision.

Automated test fixtures are not production employee data. Technical test passes do not replace HR review of policy and terminology.
