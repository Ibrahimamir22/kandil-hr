// The forms inventory for tools/forms_book.js — one entry per form, in the order of the work.
// g = section, t = form name, d = one line on what it is for, open = how to reach it on demo data.
// Options: as = open it as that demo user · print = the printed copy · pub = a public page (candidate / new hire).
module.exports = function (ID) {
  const go = (v, arg, sel) => async ({ page }) => {
    await page.evaluate(([v, a]) => go(v, a), [v, arg === undefined ? null : arg]);
    await page.waitForTimeout(600);
    if (sel) await page.waitForSelector(sel, { timeout: 5000 });
  };
  const btn = (text, scope) => async ({ page }) => {
    const b = page.locator((scope || '#main') + ' :is(button,a.btn)', { hasText: text }).filter({ visible: true }).first();
    await b.click({ timeout: 4000 }); await page.waitForTimeout(600);
  };
  const ex = (text, scope) => async ({ page }) => {                 // the button whose whole label is exactly this
    const b = page.locator((scope || '#main') + ' :is(button,a.btn)', { hasText: new RegExp('^\\s*' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }).filter({ visible: true }).first();
    await b.click({ timeout: 4000 }); await page.waitForTimeout(600);
  };
  const js = expr => async ({ page }) => { await page.evaluate(expr); await page.waitForTimeout(600); };
  const seq = (...f) => async H => { for (const x of f) await x(H); };
  const S = [];
  const add = (g, t, d, open, more) => S.push(Object.assign({ g, t, d, open }, more || {}));
  const app = st => ID.appBy[st];

  const G0 = 'الدخول والعام';
  add(G0, 'تسجيل الدخول', 'الدخول بالإيميل وكود من 6 أرقام.', async () => {}, { pub: H => H.idx, el: 'body' });
  add(G0, 'ملاحظة أو اقتراح', 'أي مستخدم يبعت ملاحظة على الشاشة اللي هو فيها.', js(() => noteModal()));
  add(G0, 'الأمان وتسجيل الدخول', 'إعدادات الأمان للحساب.', js(() => securityModal()));

  const G1 = '1. الهيكل والوظائف والموظفين';
  add(G1, 'وحدة جديدة', 'إضافة وحدة للهيكل.', seq(go('org'), btn('إضافة وحدة')));
  add(G1, 'وظيفة جديدة في وحدة', 'إضافة وظيفة بعددها المعتمد.', seq(js(`S.selUnit = '${ID.unit}'`), go('org'), ex('وظيفة')));
  add(G1, 'مدير الوحدة', 'تحديد وظيفة مدير الوحدة.', seq(js(`S.selUnit = '${ID.unit}'`), go('org'), btn('مدير الوحدة')));
  add(G1, 'نقل وحدة', 'نقل وحدة تحت وحدة تانية.', seq(js(`S.selUnit = '${ID.unit}'`), go('org'), btn('نقل')));
  add(G1, 'استيراد الهيكل', 'تحميل الهيكل من شيت.', go('import'));
  add(G1, 'بيانات الوظيفة والدرجة', 'الدرجة والعائلة الوظيفية.', seq(go('jd', ID.job), btn('بيانات الوظيفة والدرجة')));
  add(G1, 'كتابة الوصف الوظيفي', 'الغرض والمسؤوليات والمؤشرات والصلاحيات والكفاءات.', go('jdedit', ID.job, '#main textarea'));
  add(G1, 'الوصف الوظيفي — نسخة الطباعة', 'الوصف كما يطبع ويتوقع.', seq(go('jd', ID.job), ex('الوصف'), js(() => document.getElementById('jdPrintB').click())), { print: true });
  add(G1, 'ملف المقابلة — نسخة الطباعة', 'أسئلة المقابلة حسب كفاءات الوصف.', seq(go('jd', ID.job), ex('ملف المقابلة'), js(() => document.getElementById('kitPrint').click())), { print: true });
  add(G1, 'تحميل الأوصاف من ملف', 'استيراد أوصاف وظيفية.', go('jdimp'));
  add(G1, 'موظف جديد', 'إضافة موظف على وظيفة.', seq(go('emps'), btn('إضافة موظف')));
  add(G1, 'تحميل الموظفين من ملف', 'استيراد الموظفين.', go('empimp'));
  add(G1, 'قيد على إعادة التعيين', 'منع إعادة تعيين شخص بسبب.', seq(go('restrict'), btn('قيد جديد')));
  add(G1, 'موقع / فرع جديد', 'إضافة موقع أو فرع.', seq(go('locs'), btn('موقع / فرع جديد')));

  const G2 = '2. طلبات التوظيف والاعتماد';
  add(G2, 'طلب توظيف جديد', 'نموذج طلب التوظيف كامل.', go('newreq', null, '#main select'));
  add(G2, 'طلب التوظيف — الاعتماد', 'الطلب ومسار الاعتماد وقرار المعتمد.', go('req', ID.reqBy.IN_APPROVAL || ID.req));
  add(G2, 'طلب التوظيف — نسخة الطباعة', 'الطلب المعتمد بالتوقيعات الإلكترونية.', seq(go('req', ID.reqBy.APPROVED), btn('طباعة / PDF')), { print: true });
  add(G2, 'ملاحظات HR الداخلية', 'ملاحظة داخلية على الطلب.', seq(go('req', ID.reqBy.APPROVED), btn('إضافة ملاحظة')));
  add(G2, 'طلب وظيفة جديدة بالهيكل', 'طلب إضافة وظيفة للهيكل.', seq(go('pcr'), btn('طلب وظيفة جديدة')));
  add(G2, 'قاعدة اعتماد جديدة', 'مين يعتمد إيه.', seq(go('rules'), ex('قاعدة جديدة')));
  add(G2, 'تفويض جديد', 'تفويض الاعتماد لحد تاني لفترة.', seq(go('rules'), btn('التفويض والإنابة'), btn('تفويض جديد')));

  const G3 = '3. الشواغر والإعلانات والمرشحين';
  add(G3, 'إعدادات الشاغر', 'لينك التقديم والإعدادات.', go('pipe', ID.vac));
  add(G3, 'أسئلة الفرز', 'أسئلة يجاوب عليها المتقدم.', seq(go('pipe', ID.vac), btn('إضافة أسئلة')));
  add(G3, 'إعلان جديد', 'كتابة إعلان الوظيفة.', seq(go('pipe', ID.vac), btn('إعلان جديد')));
  add(G3, 'اشتراك جديد', 'اشتراك في موقع توظيف أو مكتب.', seq(go('sources'), btn('الاشتراكات'), btn('اشتراك جديد')));
  add(G3, 'قالب إعلان', 'قالب جاهز للإعلانات.', seq(go('sources'), btn('قوالب الإعلانات'), btn('قالب جديد')));
  add(G3, 'نموذج التقديم (للمرشح)', 'الصفحة اللي المرشح بيقدم منها من اللينك أو الـ QR.', async () => {}, { pub: H => H.applyHtml(), el: 'body', w: 480 });
  add(G3, 'إضافة مرشح', 'إدخال مرشح يدويًا.', go('candnew', ID.vac, '#main input'));
  add(G3, 'استيراد مرشحين من ملف', 'تحميل مرشحين من شيت.', seq(go('cands'), btn('استيراد من ملف')));
  add(G3, 'الرسائل الجاهزة', 'رسائل للمرشحين.', seq(go('cands'), btn('الرسائل الجاهزة')));
  add(G3, 'ملف المرشح على الشاغر', 'كل بيانات الترشيح والخطوة الجاية.', go('app', app('SCREENING')));
  add(G3, 'رفض المرشح', 'الرفض بسبب من القائمة.', seq(go('app', app('SCREENING')), btn('✕ رفض')));
  add(G3, 'انسحاب المرشح', 'تسجيل انسحاب بسبب.', seq(go('app', app('SCREENING')), btn('انسحب')));
  add(G3, 'رسالة جاهزة للمرشح', 'إرسال رسالة من القوالب.', seq(go('app', app('SCREENING')), btn('رسالة جاهزة')));
  add(G3, 'نقل المرشح لشاغر تاني', 'نقل الترشيح.', seq(go('app', app('SCREENING')), btn('نقل لشاغر تاني')));
  add(G3, 'إضافة لقاعدة المرشحين', 'حفظ المرشح للمستقبل.', seq(go('app', app('SCREENING')), btn('ضيفه لقاعدة المرشحين')));
  add(G3, 'تعديل بيانات المرشح', 'تعديل البيانات الأساسية.', seq(go('app', app('SCREENING')), btn('تعديل البيانات')));
  add(G3, 'تغيير المسؤول عن المرشح', 'تغيير مسؤول التوظيف.', seq(go('app', app('SCREENING')), btn('تغيير المسؤول')));
  add(G3, 'تغيير المصدر', 'تصحيح مصدر المرشح.', seq(go('app', app('SCREENING')), btn('تغيير المصدر')));
  add(G3, 'ترشيح من موظف', 'تسجيل ترشيح موظف للمرشح.', seq(go('app', app('SCREENING')), btn('تسجيل ترشيح من موظف')));
  add(G3, 'تسجيل متابعة', 'نشاط أو مكالمة مع المرشح.', seq(go('app', app('SCREENING')), btn('تسجيل متابعة')));

  const G4 = '4. المقابلات والاختيار والعروض';
  add(G4, 'دعوة للمقابلة', 'ميعاد ولجنة المقابلة.', seq(go('app', app('INTERVIEW')), ex('حدد مقابلة')));
  add(G4, 'تعديل لجنة المقابلة', 'أعضاء اللجنة.', seq(go('intv', ID.ivBy.STARTED), btn('اللجنة')));
  add(G4, 'تقييم المقابلة', 'نموذج تقييم عضو اللجنة بالكفاءات.', go('intv', ID.ivBy.STARTED, '#main'), { as: ID.panel[ID.ivBy.STARTED] });
  add(G4, 'قرار الاختيار', 'اختيار المرشح أو احتياطي أو رفض.', seq(go('app', app('INTERVIEW')), ex('تسجيل القرار')));
  add(G4, 'مقارنة المرشحين', 'مقارنة المرشحين على الشاغر.', go('compare', ID.vac));
  add(G4, 'العرض الوظيفي', 'المرتب والبدلات وميعاد الاستلام.', go('app', ID.offerApp.DRAFT));
  add(G4, 'موافقة على العرض', 'قرار المعتمد على العرض.', seq(go('offers'), btn('موافقة')));
  add(G4, 'خطاب العرض', 'خطاب العرض الوظيفي للمرشح.', seq(go('app', ID.offerApp.PRESENTED), ex('خطاب العرض')), { popup: true });
  add(G4, 'المرشح قبل العرض', 'تسجيل قبول المرشح.', seq(go('app', ID.offerApp.PRESENTED), ex('المرشح قبل')));
  add(G4, 'المرشح رفض العرض', 'تسجيل الرفض بسبب.', seq(go('app', ID.offerApp.PRESENTED), ex('المرشح رفض')));
  add(G4, 'تفاوض — نسخة جديدة', 'عرض جديد بعد التفاوض.', seq(go('app', ID.offerApp.PRESENTED), btn('تفاوض')));
  add(G4, 'مد صلاحية العرض', 'تمديد صلاحية العرض.', seq(go('app', ID.offerApp.PRESENTED), ex('مد الصلاحية')));
  add(G4, 'سحب العرض', 'سحب العرض بسبب.', seq(go('app', ID.offerApp.PRESENTED), ex('سحب العرض')));

  const G5 = '5. الاستلام والتهيئة والتأمينات';
  add(G5, 'ميعاد الاستلام', 'تحديد ميعاد الاستلام.', seq(go('app', ID.joinApp.PENDING), ex('تغيير الميعاد')));
  add(G5, 'استلم العمل', 'تسجيل الاستلام وكود الموظف.', seq(go('app', ID.joinApp.PENDING), btn('استلم العمل')));
  add(G5, 'المرشح ماستلمش', 'تسجيل عدم الاستلام بسبب.', seq(go('app', ID.joinApp.PENDING), ex('ماستلمش')));
  add(G5, 'إضافة مستند للمرشح', 'رفع مستند من مسوغات التعيين.', seq(go('app', ID.joinApp.PENDING), ex('مستند زيادة')));
  add(G5, 'لينك رفع المستندات', 'لينك للمرشح يرفع مستنداته.', seq(go('app', ID.joinApp.PENDING), ex('لينك رفع المستندات للمرشح')));
  add(G5, 'مراجعة مستند', 'قبول أو رفض مستند رفعه المرشح.', seq(go('app', ID.joinApp.PENDING), ex('مراجعة')));
  add(G5, 'إيصال استلام المسوغات', 'إيصال للمرشح بالمستندات اللي اتسلمت.', seq(go('app', ID.joinApp.JOINED), ex('إيصال استلام المسوغات')), { popup: true });
  add(G5, 'رفع المستندات (للمرشح)', 'الصفحة اللي المرشح بيرفع منها مسوغات التعيين.', async () => {}, { pub: H => H.docsHtml(), el: 'body', w: 480 });
  add(G5, 'هدية الترحيب', 'تسجيل هدية الترحيب.', seq(go('onb', ID.onb), js(() => document.getElementById('giftBtn').click())));
  add(G5, 'برنامج تهيئة لموظف حالي', 'بدء تهيئة لموظف موجود.', seq(go('onboarding'), btn('برنامج لموظف حالي')));
  add(G5, 'برنامج التهيئة', 'مهام التهيئة ومين مسؤول عنها.', go('onb', ID.onb));
  add(G5, 'المسؤولين والزميل المرافق', 'مسؤولين التهيئة والـ Buddy.', seq(go('onb', ID.onb), btn('المسؤولين والـ Buddy')));
  add(G5, 'مهمة إضافية', 'مهمة زيادة في البرنامج.', seq(go('onb', ID.onb), ex('مهمة')));
  add(G5, 'قفل برنامج التهيئة', 'إقفال البرنامج وإقرار الموظف.', seq(go('onb', ID.onb), btn('قفل البرنامج')));
  add(G5, 'برنامج التهيئة — نسخة التوقيع', 'البرنامج للطباعة وتوقيع الموظف.', seq(go('onb', ID.onb), btn('طباعة للتوقيع')), { print: true });
  add(G5, 'قالب تهيئة', 'قالب برنامج التهيئة.', seq(go('onboarding'), btn('القوالب'), btn('قالب جديد')));
  add(G5, 'استبيان الموظف الجديد (للموظف)', 'صفحة الاستبيان يوم 7 ويوم 30.', async () => {}, { pub: H => H.voiceHtml(), el: 'body', w: 480 });
  add(G5, 'رد على الاستبيان', 'متابعة HR لرد الموظف.', seq(go('onboarding'), btn('صوت الموظف الجديد'), js(`nhvAnswerModal('${ID.nhvBy.ANSWERED}')`)));
  add(G5, 'ملف التأمينات', 'تسجيل الموظف في التأمينات.', seq(go('insurance'), js(() => document.querySelector('[data-ic]').click())));

  const G55 = '6. فترة الاختبار والتأمين الطبي';
  const pr = ID.prob || {};
  add(G55, 'فترة اختبار لموظف حالي', 'فتح فترة اختبار لموظف اتعين برا البوابة.', seq(go('probation'), ex('فترة اختبار لموظف حالي')));
  add(G55, 'صفحة فترة الاختبار', 'الأهداف، المتابعة، التقييم، سجل الأداء، الخطة، والقرار.', go('prob', pr.dec, '.prbrev'));
  add(G55, 'أهداف فترة الاختبار', '3 لـ 5 أهداف قابلة للقياس في أول أسبوع.', seq(go('prob', pr.mid, '#prGoals'), js(() => document.getElementById('prGoals').click())));
  add(G55, 'ملاحظة في سجل الأداء', 'موقف إيجابي أو محتاج تحسين بتاريخه.', seq(go('prob', pr.mid, '#prNote'), js(() => document.getElementById('prNote').click())));
  add(G55, 'إلغاء ملاحظة', 'الملاحظة بتتلغي بسبب ومابتتمسحش.', seq(go('prob', pr.mid, '[data-vn]'), js(() => document.querySelector('[data-vn]').click())));
  add(G55, 'لينك الموظف', 'لينك خاص للموظف يشوف أهدافه وملاحظاته ويقيّم نفسه.', seq(go('prob', pr.mid, '#prLink'), js(() => document.getElementById('prLink').click())), { wait: 900 });
  add(G55, 'متابعة يوم 30 / 60', 'وضع كل هدف والتقييم العام.', seq(go('prob', pr.early, '[data-rv="D30"]'), js(() => document.querySelector('[data-rv="D30"]').click())));
  add(G55, 'التقييم النهائي', 'بنود التقييم السنوي من 1 لـ 5 بدليل، والنتيجة المحسوبة.', seq(go('prob', pr.early, '[data-rv="FINAL"]'), js(() => document.querySelector('[data-rv="FINAL"]').click())));
  add(G55, 'خطة تحسين الأداء', 'أهداف تحسين ودعم وميعاد مراجعة (بحد أقصى يوم 60).', seq(go('prob', pr.mid, '#prPip'), js(() => document.getElementById('prPip').click())));
  add(G55, 'نتيجة خطة التحسين', 'نجح / جزئياً / لم ينجح بدليل.', seq(go('prob', pr.pip, '#prPipO'), js(() => document.getElementById('prPipO').click())));
  add(G55, 'قرار فترة الاختبار', 'تثبيت أو عدم تثبيت (عدم التثبيت لمدير القطاع بس).', seq(go('prob', pr.dec, '#prDec'), js(() => document.getElementById('prDec').click())));
  add(G55, 'تغيير المدير المباشر', 'لو المدير اتغير أثناء الفترة.', seq(go('prob', pr.mid, '#prMgr'), js(() => document.getElementById('prMgr').click())), { wait: 900 });
  add(G55, 'اجتماع إبلاغ القرار', 'تاريخ الاجتماع بعد القرار.', seq(go('prob', pr.conf, '#prMeet'), js(() => document.getElementById('prMeet').click())));
  add(G55, 'خطاب التثبيت', 'الخطاب للطباعة والتوقيع.', seq(go('prob', pr.conf, '#prLetter'), js(() => document.getElementById('prLetter').click())), { print: true });
  add(G55, 'مقابلة البقاء (يوم 60)', 'بين الموارد البشرية والموظف من غير المدير.', seq(go('prob', pr.pip, '#prStay'), js(() => document.getElementById('prStay').click())));
  add(G55, 'رضا المدير عن التعيين', '3 أسئلة للمدير بعد التثبيت.', seq(go('prob', pr.conf, '#prSat'), js(() => document.getElementById('prSat').click())));
  add(G55, 'صفحة فترة الاختبار (للموظف)', 'الموظف يقر بالأهداف، يرد على الملاحظات، ويقيّم نفسه.', async () => {}, { pub: H => H.probHtml(), el: 'body', w: 480 });
  add(G55, 'التأمين الطبي', 'إضافة الموظف المثبت لشركة التأمين ورقم الكارت.', seq(go('medical', 'all', '#medBody'), js(() => document.querySelector('[data-mc]').click())));

  const G6 = '7. النقل الداخلي والرواتب';
  add(G6, 'طلب نقل داخلي', 'نقل موظف لوظيفة أو موقع تاني.', seq(go('transfers'), btn('طلب نقل')));
  add(G6, 'اعتماد النقل', 'قرار المعتمد على النقل.', seq(go('trf', ID.trfMine), btn('اعتماد')));
  add(G6, 'رفض النقل', 'رفض النقل بسبب.', seq(go('trf', ID.trfMine), btn('رفض')));
  add(G6, 'إخطار تعديل مفردات الراتب', 'الإخطار للمرتبات بعد النقل.', seq(go('trf', ID.trfBy.DONE), btn('إخطار تعديل مفردات الراتب')), { print: true });
  add(G6, 'هيكل الرواتب', 'الحد الأدنى والمتوسط والأقصى لكل درجة.', seq(go('pay'), ex('هيكل الرواتب')));
  add(G6, 'جدول البدلات', 'البدلات حسب الدرجة والموقع.', seq(go('pay'), btn('جدول البدلات')));
  add(G6, 'بدل انتقالات مؤقت', 'بدل انتقالات لفترة.', seq(go('pay'), ex('الانتقالات'), ex('بدل مؤقت')));

  const G8 = '8. مؤشرات الأداء';
  add(G8, 'مؤشرات عملية التوظيف', 'السرعة والجودة والكفاءة وتجربة المرشح والالتزام — بالفترة والقطاع والموقع ونوع الوظيفة.', go('kpi', 'PROCESS', '.kpitile'));
  add(G8, 'تقييمي (بطاقة أخصائي التوظيف)', 'كل موظف يشوف تقييمه في الشغل اللي اتسند له.', seq(js(() => { S.kpi = null; }), go('kpi', 'MINE', '#kpiBody .kpih')), { as: ID.recruiter });
  add(G8, 'الأهداف والأوزان', 'أهداف المؤشرات، مدة شغل الشاغر، نوع الوظيفة لكل درجة، وأوزان البطاقات.', go('kpi', 'SETTINGS', '#ksSave'));

  const G7 = '9. الإدارة والإعدادات والخصوصية';
  add(G7, 'مستخدم جديد', 'حساب على البوابة.', seq(go('users'), btn('مستخدم جديد')));
  add(G7, 'أدوار المستخدم', 'صلاحيات المستخدم ونطاقها.', seq(go('users'), btn('الأدوار')));
  add(G7, 'إعداد من الإعدادات', 'تعديل قيمة إعداد.', seq(go('config'), btn('تعديل')));
  add(G7, 'بند في القوائم', 'أسباب الرفض والانسحاب وغيرها.', seq(go('lists'), btn('بند جديد')));
  add(G7, 'طلب صاحب بيانات', 'طلب اطلاع أو حذف بيانات شخصية.', seq(go('privacy'), btn('طلب جديد')));
  add(G7, 'إقفال طلب صاحب البيانات', 'الرد على الطلب وإقفاله.', seq(go('privacy'), btn('إقفال الطلب')));
  return S;
};
