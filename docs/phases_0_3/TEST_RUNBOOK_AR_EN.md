# Native HR acceptance runbook / دليل اختبار الموارد البشرية

This is a test procedure, not a test result. Use the isolated local synthetic parity site `http://localhost:8102` (`kandil-parity.localhost`). Preserve the earlier sites on ports 8100 and 8101. Do not run these cases on real staff data or the main site. Do not reset/reseed an existing site as part of reviewing this guide.

هذا دليل خطوات وليس شهادة نجاح. الاختبار على بيانات تجريبية فقط في المنفذ 8102. حافظ على الموقعين السابقين في المنفذين 8100 و8101. لا تستخدم بيانات موظفين حقيقية، ولا تمسح قاعدة البيانات الحالية.

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

A separate bounded correction is implemented through **Job Offer → Void Incorrect
Joining**, available to the configured company HR authority. Test it only for an
unchanged external-hire joining with unused draft onboarding. It retains all
historical records, marks the assignment/onboarding voided and the employee
inactive, and restores one approved open seat without changing structural or
reserved capacity. Hold/Freeze states remain in effect. A replay must not release
another seat. Later operational use, including the supported payroll/HR references,
blocks this correction; it is not a general transfer, exit or payroll reversal.
See [Ownership and joining review](OWNERSHIP_AND_JOINING_REVIEW.md) for the exact
boundaries and manual checks.

تظل إعادة نفس النتيجة مرتبطة بالسجلات الأصلية دون تكرار احتساب العدد. توجد الآن
عملية منفصلة محدودة هي **إلغاء تسجيل مباشرة بالخطأ (Void Incorrect Joining)**
من عرض العمل، لمسؤول الموارد البشرية المحدد للشركة. تُستخدم فقط قبل الاستخدام
التشغيلي اللاحق ومع مسودة تهيئة غير مستخدمة. تحتفظ بالسجلات والتاريخ، وتلغي أثر
التكليف على الإشغال، وتجعل الموظف غير نشط، وتعيد مقعدًا معتمدًا واحدًا دون تغيير
السعة الهيكلية أو المحجوزة. يجب ألا يعيد تكرار الأمر مقعدًا آخر، وتبقى حالات
التعليق والتجميد محفوظة. لا تحذف الموظف أو تعدّل تاريخه للتحايل على القيود؛ هذه
ليست عملية عامة للنقل أو إنهاء الخدمة أو عكس الرواتب. راجع
[دليل المسؤوليات وتصحيح المباشرة](OWNERSHIP_AND_JOINING_REVIEW.md).

Run only on the explicitly opted-in isolated parity site:

```sh
bench --site kandil-parity.localhost execute kandil_hr.recruitment.test_joining.run
```

This native suite uses synthetic fixtures rolled back per case. Its sequential
Hold/Freeze denial is not an independent-connection concurrency test. Refer to the
recorded evidence checkpoint for executed case counts and source hashes.

## Approved HR corrections / تصحيح طلب معتمد

On the synthetic parity site, sign in as the ordinary scoped HR recruiter and open
an approved original request. Use **Correct Approved Request**, edit its permitted
fields and enter a reason. The saved revision records the previous and new values
and notifies the requester locally. The requester cannot invoke this action.

من حساب الموارد البشرية المخوّل، افتح الطلب الأصلي المعتمد واختر **تصحيح الطلب
المعتمد**. سجّل السبب مع التعديل؛ يحتفظ النظام بالقيم قبل التغيير وبعده في نسخة
جديدة، ويُخطر مقدم الطلب داخل النظام.

- Increasing approved quantity uses a linked amendment and fresh approval. It
  adds only the difference to the existing vacancy after final approval.
- Decreasing quantity cannot go below actual joiners. Only unused open seats are
  released; seats already closed are not released twice.
- Moving location relocates unfilled seats only. Employees already joined and
  their historical position assignments stay at the original location. The
  destination must have available approved capacity and requires a fresh
  recruitment-team assignment before intake.
- Resolve active amendments and unresolved candidates before corrections that
  affect their seats. A request containing confidential HR notes cannot expand
  into a different capacity scope. Field-only corrections remain possible.
- Changing a request does not reverse actual joining, edit payroll, or move an
  employee. The separate **Void Incorrect Joining** action has the bounded
  pre-operational-use contract described in
  [Ownership and joining review](OWNERSHIP_AND_JOINING_REVIEW.md).

زيادة العدد تحتاج إلى تعديل مرتبط وإعادة اعتماد. تخفيض العدد لا يقل عن الملتحقين
فعليًا. نقل الموقع ينقل المقاعد الشاغرة فقط، ولا ينقل الموظفين أو سجلات تكليفهم.
الطلب الذي يحتوي ملاحظات سرية لا يمكن توسيع نطاق مواقعه بهذه العملية.

## Position register / سجل الوظائف التنظيمية

Open the native **Kandil Position** list and choose **Download Position Register**.
Its dialog has separate optional company, department and branch filters. The CSV
contains only public organizational fields from records the current account can
read. It excludes pay, employee data and confidential notes. Downloading the
register does not enable unrestricted native data export.

من قائمة الوظائف التنظيمية اختر **تنزيل سجل الوظائف التنظيمية** وحدد المرشحات
داخل نافذة التنزيل. لا يوسّع التصدير صلاحيات المستخدم ولا يتضمن الرواتب أو بيانات
الموظفين أو الملاحظات السرية.

## Delegation revocation / إلغاء التفويض

1. On the synthetic site, use a scoped Sector Approver account to open an active
   **Kandil Delegation**. Record its process, dates, version and an earlier completed
   delegated decision. Select **Delegation actions → Revoke delegation**, enter a
   reason, and save through the native action.
2. Keep the delegate's existing browser session open. Attempt a **new** decision
   that previously depended on this delegation through both UI and API: it must
   fail. Do not mistake replay of an already completed command for new authority.
   The earlier decision, actor/principal, delegation version and revocation reason
   must remain recorded.
3. Test an out-of-process action against an APPROVALS-only or TEAM-only delegation;
   it must not inherit the other process. Test disabled principal/delegate and
   expired dates separately. For a CEO delegation, use **New delegation version**
   and verify it stays **Pending CEO** until the currently configured CEO principal
   explicitly approves; a previous approval must not authorize the new version.

افتح تفويضًا تجريبيًا نشطًا بحساب معتمد القطاع ذي النطاق المناسب، ثم اختر
**إلغاء التفويض (Revoke delegation)** وأدخل السبب. من جلسة المفوَّض إليه المفتوحة
جرّب قرارًا جديدًا يعتمد على التفويض؛ يجب رفضه من الواجهة والـ API، مع بقاء القرار
السابق وهوية المنفذ والأصيل والنسخة وسبب الإلغاء. إعادة أمر مكتمل ليست قرارًا
جديدًا. اختبر نطاق العملية والتاريخ وتعطيل كل طرف على حدة. نسخة تفويض الرئيس
التنفيذي الجديدة تظل معلّقة حتى اعتماده الصريح، ولا ترث اعتماد النسخة القديمة.

## Local document capture / حفظ مراسلة المستند محليًا

These review steps accompany the final 13 native document checks and seven browser
groups linked in CHECKPOINT.md. They are a walkthrough, not a substitute for the
individual evidence or HR acceptance.

1. As an authorized HR/manager account, open a saved **Approved Kandil JD Revision**.
   Select **Documents → Capture document delivery locally**. Choose eligible
   synthetic portal recipients (at most ten), Arabic or English, and **Job
   Description** or **Worker Card**. Enter an optional non-sensitive note and
   select **Capture locally**.
2. Open **Captured document deliveries** and the relevant immutable **Kandil
   Document Delivery**. Use **Download captured mail** and inspect the captured
   mail's HTML and PDF for the chosen language, approved revision and intended
   recipient. Verify **Captured locally** and no provider transmission. This
   composes a local mail artifact; it does **not** send external email or prove
   inbox delivery.
3. Repeat the exact API command ID and payload: no duplicate capture or local
   notification. A changed payload with the same ID, stale revision, unapproved
   revision or ineligible recipient must be rejected.
4. Compare allowed and disallowed branch accounts. Revoke read/print access or
   disable a synthetic recipient, then test list, direct detail, captured-mail
   download, native print and attachment paths. Check every scope included in a
   worker card, not just its JD's primary scope. Previously captured artifacts
   must not grant new access after revocation. Record each surface independently;
   native scope, list/detail/download/replay/queued-delivery and print-permission
   checks have evidence; the capture button alone does not prove other surfaces.

هذه خطوات مراجعة مرتبطة بأدلة الاختبارات التقنية في CHECKPOINT.md؛ ولا تعني
اعتماد الموارد البشرية. تم اختبار حدود النطاق وصلاحيات الطباعة. افتح نسخة وصف وظيفي محفوظة ومعتمدة،
واختر **Capture document delivery locally** من قائمة المستندات. حدد مستلمين
تجريبيين مؤهلين، واللغة العربية أو الإنجليزية، ووصفًا وظيفيًا أو بطاقة عامل.
راجع المراسلة المحفوظة وملفي HTML وPDF عبر **Download captured mail**.
الحالة **Captured locally** تعني حفظًا محليًا فقط؛ لم يُرسل بريد خارجي.

أعد نفس الأمر للتأكد من عدم التكرار، ثم اختبر نسخة قديمة ومستلمًا غير مؤهل.
قارن حسابين بنطاقي فروع مختلفين، وألغِ صلاحية القراءة أو الطباعة أو عطّل المستلم
التجريبي. اختبر القائمة والرابط المباشر والتنزيل والطباعة والمرفقات، مع فحص جميع
النطاقات المضمّنة في بطاقة العامل. سجّل نتيجة كل مسار؛ ظهور الزر وحده لا يثبت
نجاح حماية الخصوصية.
