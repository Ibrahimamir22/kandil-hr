# Native HR acceptance runbook / دليل اختبار الموارد البشرية

This is a test procedure, not a test result. Use the local synthetic test site `http://localhost:8101`. Do not run these cases on real staff data or the main site. Do not reset/reseed an existing site as part of reviewing this guide.

هذا دليل خطوات وليس شهادة نجاح. الاختبار على بيانات تجريبية فقط في المنفذ 8101. لا تستخدم بيانات موظفين حقيقية، ولا تمسح قاعدة البيانات الحالية.

## Accounts and languages / الحسابات واللغات

Use separate real role accounts or log out between roles. An Administrator-only demonstration is not a permissions test. Keep credentials in the private development credential file; never copy them into this repository or screenshots.

Switch the test user's supported Frappe language to English and then Arabic, reload after saving, and repeat critical actions. Record any mixed labels, clipped RTL fields, ambiguous dates, unreadable print or untranslated error. Native Frappe translations and custom Kandil translations are separate layers. Business data such as a person's name does not auto-translate.

غيّر لغة المستخدم التجريبي إلى الإنجليزية ثم العربية، وأعد تحميل الصفحة. أعد نفس السيناريوهات، وتحقق من اتجاه الكتابة والأزرار ورسائل الخطأ والتواريخ والطباعة. تغيير لغة الواجهة لا يترجم أسماء الأشخاص أو النصوص التي أدخلها المستخدم.

## Evidence required / الأدلة المطلوبة

For each case record: case ID, commit, site, timestamp/timezone, role, record IDs, input, expected/actual, screenshot or machine assertion, pass/fail/block and issue link. Redact personal data and session tokens. Mark local notification capture as “captured locally”, not “email delivered”. Keep exact baseline IDs and expected outcomes unchanged. Record dated execution evidence separately, then update status only to match the complete case: `not_run`, `passed`, `partial`, `failed` or `blocked`. A `passed` row requires commit, checked_at and evidence; implementation evidence is not HR acceptance.

## P0 — Scope / النطاق

1. Read `requirements-baseline.json`: all98 unique IDs must exist. First four phases mean P0 through P3; P4 candidates is not this batch.
2. Review `POLICY_DECISIONS.md`; record agreement or disagreement without changing current approved business records.
3. Mark source-deferred features as planned extensions. A source “Built” label never counts as a Frappe test pass.

## P1 — Permissions and safe actions / الصلاحيات والأوامر

1. Create disposable companies A/B and locations A1/A2/B1 using the approved seed procedure. Assign requester, manager, HR, exception approver and delegate accounts explicit scopes.
2. As A1 requester, try to view B1 via list, direct URL, link search, export, print and private attachment. Every surface must enforce scope.
3. Submit a request; record revision and active step. As assigned approver, approve once and retry the exact command. Same result, no additional decision or notification.
4. Reuse command ID with different payload; expect conflict. Submit old step/version after another actor progresses the request; expect stale-action error.
5. Revoke delegation/disable an account and retry API action without refreshing browser; it must fail.
6. Verify one captured notification per event even after retry; no external email is sent from local testing.

بصفتك موظف الموقع الأول جرّب فتح سجل شركة أخرى من الرابط المباشر والبحث والتصدير والمرفقات. اختبر تكرار الاعتماد وتغيير بيانات نفس الأمر وانتهاء التفويض. إخفاء الزر وحده ليس نجاحاً للصلاحيات.

## P2 — Structure and job descriptions / الهيكل والوصف الوظيفي

1. Create two Positions sharing one Designation; verify independent IDs and capacities. A Position is an organizational seat, not merely a title.
2. Create dated assignment, check occupied capacity and history. Future assignment must not count as currently occupied.
3. Attempt cycle and cross-company parent link; expect rejection.
4. Approve JD revision1; create revision2 without editing approved1. Test KPI weights100 versus90 and responsibility-band exception reason.
5. Capture structure snapshot, change hierarchy and compare the old snapshot; it remains reproducible.
6. Import same external IDs twice in preview/commit workflow; reconcile totals and duplicates. Missing mappings must be reported rather than guessed.

أنشئ منصبين بنفس المسمى الوظيفي وتحقق أن لكل منهما رقم وسعة مستقلة. جرّب علاقة دائرية في الهيكل، ومراجعة وصف وظيفي معتمد، واستيراداً مكرراً، وراجع عدم تغيير النسخ التاريخية.

## P3 — Requests and vacancies / الطلبات والشواغر

1. Start a two-location request; compare availability to ledger terms. Submit and verify exact reserved delta.
2. Verify correct hierarchy route; vacant head is skipped with recorded reason. Complete approvals using actual assigned roles.
3. Return with reason, amend and resubmit; earlier version and approval snapshots remain readable. Stale action from earlier version fails.
4. Request above availability; verify justified independent exception route. Test configured warning/block behaviour explicitly.
5. Approve reduced quantity and check released seats. Do not allow approved quantity below already joined employees.
6. After approval, test allowed HR amendment with reason; test increase through linked reapproval, retaining one opening per original location line.
7. Pause/resume/close vacancy; inspect parent status and remaining capacity. Assign recruiter lead/team; disable owner and verify unassigned queue.
8. Run contention tests with deterministic fixtures; reconcile structural, occupied, reserved, open and available after every terminal state.

اختبر الطلب متعدد المواقع، الإرجاع والتعديل، تخفيض العدد، زيادة العدد بإعادة الاعتماد، والشاغر بعد التعليق أو الإغلاق. تحقق من بقاء النسخ القديمة ومن عدم حجز العدد مرتين. سجّل نتيجة كل خطوة ولا تعتمد على ظهور رسالة النجاح فقط.

## Acceptance boundary / حدود القبول

Implementation and machine tests are engineering evidence. HR must still accept authority rules, forms, terminology and ordinary/exception paths. Authentication parity, provider delivery, restore drills, production scale and full P0–P3 completeness must be listed separately when not demonstrated. No current case authorizes production cutover.

نجاح الاختبارات التقنية لا يساوي اعتماد الموارد البشرية ولا الجاهزية للإنتاج. سجّل بوضوح ما تم اختباره فعلياً وما لا يزال ناقصاً.

## Actual joining handoff / تسليم الالتحاق الفعلي

The parity path uses the existing `kandil_hr.pilot.api.record_outcome` endpoint.
The original non-parity pilot path is preserved. After an accepted submitted offer,
an authorized recruiter records actual joining with joining date, date of birth
and gender. A successful transaction creates one Employee, one dated Primary
Position Assignment, transfers one open seat to occupied, updates the linked
vacancy and prepares a **Draft Employee Onboarding**. `onboarding_status` is `Draft`.
This is a handoff for HR review; no Project, Task, assignment share or external
notification is created by onboarding submission because onboarding is not submitted.
Full onboarding orchestration belongs to P7.

بعد قبول العرض واعتماده، يسجّل مسؤول التوظيف المخوّل الالتحاق الفعلي وتاريخه
وتاريخ الميلاد والنوع. تنشئ العملية سجل الموظف وتكليفه الأساسي المؤرّخ، وتنقل
مقعدًا واحدًا من الشاغر إلى المشغول، وتُعدّ **مسودة تهيئة موظف** لمراجعة الموارد
البشرية. إعداد المسودة لا يعني اكتمال التهيئة أو إنشاء مهامها.

Vacancy `Filled` means its approved seats have been accounted for by joining and/or
an explicitly closed remainder; native Job Opening status becomes `Closed`.
The request closes when every line is accounted for. No Show and Withdrawn require
a reason and leave capacity unfilled. Hold/Freeze prevent a new joining outcome.
Repeating the same completed outcome returns the original Employee/Assignment/
Onboarding links without an additional occupancy change, including after a later
assignment episode. Changed replay facts/reason fail.

تظل إعادة نفس النتيجة مرتبطة بالسجلات الأصلية دون تكرار احتساب العدد. لا توجد
حاليًا عملية معتمدة لإلغاء التحاق سابق أو عكس التكليف؛ لا تحذف سجلات الموظفين
أو تغيّر نهايات التكليف للتحايل على ذلك. حالات تصحيح الالتحاق وإعادة فتح الشاغر
تظل معلّقة حتى تحديد عقد عكس معتمد واختباره.

Run only on the explicitly opted-in isolated parity site:

```sh
bench --site kandil-parity.localhost execute kandil_hr.recruitment.test_joining.run
```

This native suite uses synthetic fixtures rolled back per case. Its sequential
Hold/Freeze denial is not an independent-connection concurrency test. Refer to the
recorded evidence checkpoint for executed case counts and source hashes.
