/**
 * Readiness.gs — v0.30.0: «جاهزية التشغيل», the go-live checklist. One screen for the system owner and the HR Sector
 * Manager (the HR manager reads) that says what is still missing before the portal replaces the current form:
 *   - automatic checks, computed from the system on every open (daily job, e-mail, demo data, the people in the key roles,
 *     structure, job descriptions, salary structures, offer authority, question bank, documents, onboarding, medical
 *     insurance providers, legal entities …), each with the screen that fixes it;
 *   - manual items the owner ticks with a date and a note (lawyer review, the old passwords sheet, parallel run, training,
 *     user tests, moving the current form's requests), kept in CONFIG GOLIVE_CHECKS and audited.
 * Status per item: OK (ready), WARN (works, but worth a look), TODO (must be done before go-live).
 */

var GOLIVE_MANUAL_ = [
  ['LEGAL_REVIEW', 'مراجعة المحامي', 'خطابات فترة الاختبار، إقرار السرية للاستشاري، نص الخصوصية في استمارة التقديم'],
  ['PASSWORDS', 'تأمين شيت الباسوردات القديم', 'شيت «IT - Kandil - Old»: نقل أو حذف الباسوردات وقفل المشاركة'],
  ['UAT', 'اختبار البوابة بالأدوار', 'تنفيذ خطة الاختبار (مدير، موارد بشرية، توظيف، رئيس تنفيذي، الصفحات العامة)'],
  ['TRAINING', 'تدريب المستخدمين', 'دليل المدير لمديرين الوحدات، وجلسة لفريق الموارد البشرية والتوظيف'],
  ['MIGRATION', 'نقل طلبات الاستمارة الحالية', 'الطلبات المفتوحة في الاستمارة الحالية (HR-REC-F02) اتسجلت في البوابة'],
  ['PARALLEL_RUN', 'تشغيل موازي شهر', 'البوابة والاستمارة الحالية شغالين مع بعض شهر قبل إيقاف الاستمارة'],
  ['TRANSFER_LICENCE', 'ترخيص نقل البيانات للخارج', 'قراءة السير الذاتية بالذكاء الاصطناعي بتبعت ملف السيرة لـ Anthropic برّه مصر — الترخيص قبل قراءة سير حقيقية (CHG-73)']
];

function goliveRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER]; }
function goliveEditRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR]; }
function goliveManual_() { return kpiJson_('GOLIVE_CHECKS', {}); }

function goliveChecks_() {
  var out = [], add = function (g, code, name, st, detail, go) { out.push({ group: g, code: code, name: name, status: st, detail: detail || '', go: go || '' }); };
  var t = today_();
  // ---- system
  var ds = dailyStatus_();
  var stale = ds.lastRun && str_(ds.lastRun).slice(0, 10) < addDaysYmd_(t, -2);
  add('SYSTEM', 'TRIGGER', 'المهمة اليومية (التذكيرات والتصعيد والملخص)', !ds.trigger ? 'TODO' : stale || !ds.lastRun ? 'WARN' : 'OK',
    !ds.trigger ? 'شغّل installTriggers مرة واحدة من محرر Apps Script.' : 'آخر تشغيل: ' + (ds.lastRun ? str_(ds.lastRun).slice(0, 16).replace('T', ' ') : 'لسه') + (ds.hour ? ' · الساعة ' + ds.hour : ''), 'config');
  var quota = 0; try { quota = MailApp.getRemainingDailyQuota(); } catch (e) { quota = 0; }
  add('SYSTEM', 'MAIL', 'الإيميل', quota > 20 ? 'OK' : 'WARN', 'المتبقي من حد جوجل النهارده: ' + quota + ' · حد البوابة ' + ds.mailBudget + ' في اليوم', 'config');
  // v0.49.0 (CHG-106): the audit log's seals, as the daily job last checked them
  var ac = {}; try { ac = JSON.parse(PropertiesService.getScriptProperties().getProperty('AUDIT_CHAIN_STATUS') || '{}') || {}; } catch (e) { ac = {}; }
  add('SYSTEM', 'AUDIT_CHAIN', 'سلامة سجل التدقيق', !ac.at ? 'WARN' : ac.ok ? 'OK' : 'TODO',
    !ac.at ? 'لسه ماتفحصش — بيتفحص مع المهمة اليومية.' : ac.ok ? 'آخر فحص ' + str_(ac.at).slice(0, 16).replace('T', ' ') + ': ' + ac.checked + ' سطر سليم' + (ac.partial ? ' (فحص جزئي)' : '') + '.'
      : 'آخر فحص لقى تعديل من برا البوابة: ' + (ac.problems || []).map(function (p) { return (p.id || 'آخر السجل') + ' ' + p.kind; }).join('، ') + ' — راجع مين عنده وصول للشيتات.', 'audit');
  // v0.35.0: room left — cells per spreadsheet (Google stops writes at 10 million) and Drive space (15 GB on a Gmail account)
  var cells = sheetsFill_();
  add('SYSTEM', 'CELLS', 'مساحة الشيتات', cells.max >= 90 ? 'TODO' : cells.max >= 70 ? 'WARN' : 'OK',
    'أكبر شيت مليان ' + cells.max + '% من حد جوجل (10 مليون خانة)' + (cells.max >= 70 ? ' — السجلات القديمة بتتنقل للأرشيف أول كل شهر؛ قلّل LOG_ARCHIVE_MONTHS أو انقل لقاعدة بيانات.' : '.'), 'config');
  var drive = driveFill_();
  if (drive) add('SYSTEM', 'DRIVE', 'مساحة Drive', drive.pct >= 90 ? 'TODO' : drive.pct >= 70 ? 'WARN' : 'OK',
    'مستخدم ' + drive.usedGb + ' من ' + drive.limitGb + ' جيجا (' + drive.pct + '%)' + (drive.pct >= 70 ? ' — Google Workspace أو Google One قبل ما الرفع يقف.' : '.'), 'config');
  var demoUsers = where_('USERS', function (u) { return isDemoUser_(u); }).length, demoEmp = where_('EMPLOYEES', function (e) { return str_(e.Is_Demo) === 'Y'; }).length;
  add('SYSTEM', 'DEMO', 'البيانات التجريبية', demoUsers || demoEmp ? 'TODO' : 'OK',
    demoUsers || demoEmp ? 'فيه ' + demoUsers + ' مستخدم تجريبي و' + demoEmp + ' موظف تجريبي — امسحها قبل التشغيل من «البيانات التجريبية».' : 'مفيش بيانات تجريبية.', 'demo');
  // ---- people
  var real = function (role) { return roleHolders_(role).filter(function (u) { return !isDemoUser_(get_('USERS', u)); }); };
  var need = [[ROLE.HR_SECTOR, 'مدير قطاع الموارد البشرية'], [ROLE.HR_MANAGER, 'مدير الموارد البشرية'], [ROLE.REC_MANAGER, 'مدير التوظيف'], [ROLE.RECRUITER, 'أخصائي توظيف'], [ROLE.CEO, 'الرئيس التنفيذي']];
  var missing = need.filter(function (r) { return !real(r[0]).length; }).map(function (r) { return r[1]; });
  add('PEOPLE', 'ROLES', 'الأدوار الأساسية', missing.length ? 'TODO' : 'OK', missing.length ? 'مفيش حد بدور: ' + missing.join('، ') : 'كل الأدوار الأساسية ليها أصحاب.', 'users');
  var noMfa = 0;
  var mfa = {}; try { all_('USER_MFA').forEach(function (m) { if (m.Enabled_At) mfa[m.User_ID] = 1; }); } catch (e) { mfa = {}; }
  all_('USERS').forEach(function (u) {
    if (u.Status !== 'Active' || isDemoUser_(u) || mfa[u.User_ID]) return;
    if (mfaNeeded_(u.User_ID)) noMfa++;
  });
  add('PEOPLE', 'MFA', 'تطبيق التحقق (Google Authenticator)', noMfa ? 'WARN' : 'OK', noMfa ? noMfa + ' مستخدم لازم يفعّله — البوابة هتطلبه منهم أول دخول.' : 'كل الأدوار المطلوبة مفعّلة.', 'users');
  var mgrs = where_('ORG_UNITS', function (u) { return u.Status === 'Active' && u.Org_Version_ID === activeVersion_() && u.Unit_Type !== 'COMPANY'; });
  var noHead = mgrs.filter(function (u) { return !u.Head_Position_ID; }).length;
  add('PEOPLE', 'HEADS', 'رؤساء الوحدات', noHead ? 'WARN' : 'OK', noHead ? noHead + ' وحدة من غير وظيفة رئيس — مسار الاعتماد بيطلع للوحدة اللي فوقها.' : 'كل وحدة ليها رئيس.', 'org');
  var headPos = {}; mgrs.forEach(function (u) { if (u.Head_Position_ID) headPos[u.Head_Position_ID] = 1; });
  var withUser = {}; all_('USERS').forEach(function (u) { if (u.Status === 'Active' && u.Position_ID && !isDemoUser_(u)) withUser[u.Position_ID] = 1; });
  var headsNoUser = Object.keys(headPos).filter(function (p) { return !withUser[p]; }).length;
  add('PEOPLE', 'HEAD_USERS', 'حسابات رؤساء الوحدات', headsNoUser ? 'WARN' : 'OK', headsNoUser ? headsNoUser + ' وظيفة رئيس وحدة مالهاش مستخدم على البوابة — مش هيقدروا يرفعوا طلبات أو يعتمدوا.' : 'كل رئيس وحدة ليه حساب.', 'users');
  var locs = where_('LOCATIONS', function (l) { return l.Status !== 'Inactive' && l.Location_Type !== 'BRANCH_GROUP'; });
  var noSite = locs.filter(function (l) { return !l.HR_Site_User_ID; }).length;
  add('PEOPLE', 'SITES', 'أخصائي الموارد البشرية لكل موقع', noSite ? 'WARN' : 'OK', noSite ? noSite + ' موقع من غير أخصائي موارد بشرية — مهام التهيئة والمسوغات بتروح لمدير الموارد البشرية.' : 'كل موقع ليه أخصائي.', 'locs');
  // ---- structure and jobs
  var pos = find_('POSITIONS', { Status: ['Active', 'Frozen'] });
  add('STRUCTURE', 'POSITIONS', 'الهيكل والوظائف', pos.length ? 'OK' : 'TODO', pos.length ? pos.length + ' مكان وظيفي في الهيكل.' : 'الهيكل لسه ما اتحمّلش.', 'org');
  var realEmp = where_('EMPLOYEES', function (e) { return e.Status === 'Active' && str_(e.Is_Demo) !== 'Y'; }).length;
  add('STRUCTURE', 'EMPLOYEES', 'بيانات الموظفين', realEmp ? 'OK' : 'TODO', realEmp ? realEmp + ' موظف على رأس العمل — العدد الفعلي بيتحسب منهم.' : 'حمّل الموظفين عشان العدد الفعلي والمتاح في الهيكل يبقوا صح.', 'empimp');
  var jobs = {}; pos.forEach(function (p) { jobs[p.Job_Code] = 1; });
  var jobList = Object.keys(jobs), withJd = jobList.filter(function (j) { return jdApproved_(j); }).length;
  var pct = jobList.length ? Math.round(withJd / jobList.length * 100) : 0;
  add('STRUCTURE', 'JDS', 'الأوصاف الوظيفية المعتمدة', !jobList.length ? 'TODO' : pct >= 80 ? 'OK' : 'WARN', withJd + ' من ' + jobList.length + ' وظيفة ليها وصف معتمد (' + pct + '%).', 'jds');
  // ---- pay and offers
  var grades = {}; jobList.forEach(function (j) { var x = get_('JOBS', j); if (x && x.Grade_Code) grades[x.Grade_Code] = 1; });
  var withPay = {}; all_('SALARY_STRUCTURES').forEach(function (s) { if (s.Status === 'Active') withPay[s.Grade_Code] = 1; });
  var noPay = Object.keys(grades).filter(function (g) { return !withPay[g]; });
  add('OFFERS', 'PAY', 'هيكل الرواتب لكل درجة', !Object.keys(grades).length ? 'TODO' : noPay.length ? 'TODO' : 'OK',
    noPay.length ? 'درجات مالهاش هيكل رواتب: ' + noPay.sort().join('، ') + ' — العروض على الوظايف دي مش هتتعمل.' : 'كل الدرجات المستخدمة ليها هيكل رواتب.', 'pay');
  var auth = find_('OFFER_AUTHORITY', { Status: 'Active' }).length;
  add('OFFERS', 'AUTHORITY', 'صلاحيات اعتماد العروض', auth ? 'OK' : 'TODO', auth ? auth + ' مستوى صلاحية.' : 'حدد مين يعتمد العرض حسب الراتب.', 'pay');
  // ---- interviews and documents
  var qs = find_('COMP_QUESTIONS', { Status: 'Active' }).length, comps = find_('COMPETENCIES', {}).filter(function (c) { return c.Status !== 'Inactive'; }).length;
  add('INTERVIEWS', 'QUESTIONS', 'مكتبة الكفاءات وبنك الأسئلة', comps && qs ? 'OK' : 'WARN', comps + ' كفاءة · ' + qs + ' سؤال' + (!qs ? ' — المقابلات هتشتغل بأسئلة الموارد البشرية الثابتة بس.' : ''), 'jds');
  var docs = find_('DOC_TYPES', { Status: 'Active' }).length;
  add('INTERVIEWS', 'DOCS', 'المسوغات المطلوبة', docs ? 'OK' : 'TODO', docs ? docs + ' نوع مستند.' : 'حدد مستندات الاستلام.', 'joinings|types');
  var srcs = find_('RECRUITMENT_SOURCES', { Status: 'Active' }).length;
  add('INTERVIEWS', 'SOURCES', 'مصادر التوظيف', srcs ? 'OK' : 'TODO', srcs + ' مصدر نشط.', 'sources');
  // ---- new hire
  var onb = find_('ONB_TEMPLATES', { Status: 'Active' }).length;
  add('NEWHIRE', 'ONB', 'قوالب التهيئة', onb ? 'OK' : 'WARN', onb ? onb + ' قالب.' : 'مفيش قالب تهيئة — الموظف الجديد هيتعمل له خطة فاضية.', 'onboarding');
  var prov = medProviders_();
  add('NEWHIRE', 'MEDICAL', 'شركات التأمين الطبي', prov.length ? 'OK' : 'TODO', prov.length ? prov.join('، ') : 'ضيف الشركات في الإعدادات: MEDICAL_PROVIDERS.', 'config');
  var le = find_('LEGAL_ENTITIES', { Status: 'Active' }).length;
  add('NEWHIRE', 'LEGAL', 'الكيانات القانونية (لنص الخصوصية)', le ? 'OK' : 'TODO', le ? le + ' كيان.' : 'سجّل الشركات في «الخصوصية».', 'privacy');
  // ---- operations (v0.37.0, CHG-79 / CHG-82)
  var op = opsStatus_();
  add('OPS', 'BACKUP', 'النسخ الاحتياطي الأسبوعي', op.backupLast && op.backupLast >= addDaysYmd_(t, -8) ? 'OK' : ds.trigger ? 'WARN' : 'TODO',
    op.backupLast ? 'آخر نسخة: ' + op.backupLast + ' (' + op.backupCopies + ' ملف) — بتتعمل كل ' + str_(cfg_('BACKUP_WEEKDAY', 'FRI')) + ' وبتتشال بعد ' + num_(cfg_('BACKUP_KEEP_WEEKS', 8), 8) + ' أسابيع.' : 'لسه مفيش نسخة — المهمة اليومية بتعملها يوم ' + str_(cfg_('BACKUP_WEEKDAY', 'FRI')) + '.', 'config');
  add('OPS', 'RESTORE', 'تجربة الاسترجاع (كل 3 شهور)', op.restoreLast && op.restoreLast >= addDaysYmd_(t, -92) ? 'OK' : 'WARN',
    op.restoreLast ? 'آخر تجربة: ' + op.restoreLast : 'لسه ماتعملتش — رجّع نسخة في مكان تجريبي وسجّلها هنا.', '');
  add('OPS', 'DPO', 'مسؤول حماية البيانات', op.dpo ? 'OK' : 'TODO', op.dpo ? (userNames_()[op.dpo] || op.dpo) : 'عيّن شخص من برّه الموارد البشرية: DPO_USER_ID في الإعدادات.', 'config');
  if (op.hasKey) add('OPS', 'KEY', 'عمر مفتاح الذكاء الاصطناعي', op.keyDays !== null && op.keyDays >= op.keyLimit ? 'WARN' : 'OK',
    op.keyAt ? 'اتحفظ ' + op.keyAt + ' (' + op.keyDays + ' يوم) — بيتغيّر كل ' + op.keyLimit + ' يوم.' : 'تاريخ حفظه مش معروف — احفظه تاني عشان التذكير يشتغل.', '');
  var cons = where_('USERS', function (u) { return u.Status === 'Active' && isConsultant_(u.User_ID) && !accountExpired_(u); }).length;
  if (cons) add('OPS', 'CONSULTANT', 'حسابات الاستشاري', 'WARN', cons + ' حساب استشاري شغال — بعد التشغيل الفعلي مش هيشوفوا السير الذاتية وملفات المرشحين والموظفين والصور.', 'users');
  return out;
}

function goliveGet_(ctx) {
  if (!hasAnyRole_(ctx, goliveRoles_())) throw userError_('جاهزية التشغيل لمالك النظام ومدير قطاع ومدير الموارد البشرية.');
  var auto = goliveChecks_(), m = goliveManual_(), names = userNames_();
  var manual = GOLIVE_MANUAL_.map(function (x) {
    var d = m[x[0]] || {};
    return { code: x[0], name: x[1], detail: x[2], done: !!d.at, at: d.at || '', by: d.by ? names[d.by] || d.by : '', note: d.note || '' };
  });
  var all = auto.length + manual.length, ok = auto.filter(function (c) { return c.status === 'OK'; }).length + manual.filter(function (c) { return c.done; }).length;
  return { auto: auto, manual: manual, ready: ok, total: all, todo: auto.filter(function (c) { return c.status === 'TODO'; }).length + manual.filter(function (c) { return !c.done; }).length,
    canEdit: hasAnyRole_(ctx, goliveEditRoles_()) && !ctx.readOnly,
    golive: str_(cfg_('GOLIVE_AT', '')), blockers: goliveBlockers_(), phrase: GOLIVE_PHRASE_,
    canStart: !ctx.readOnly && realRoles_(ctx.user.User_ID).indexOf(ROLE.OWNER) >= 0, aiOn: !!cfg_('CVAI_ENABLED', false) };
}

/** p = { code, done: true|false, note } — the owner / HR Sector Manager ticks a manual item (audited). */
function goliveTick_(ctx, p) {
  if (ctx.readOnly || !hasAnyRole_(ctx, goliveEditRoles_())) throw userError_('تسجيل بنود الجاهزية لمالك النظام ومدير قطاع الموارد البشرية.');
  var code = str_(p.code), item = GOLIVE_MANUAL_.filter(function (x) { return x[0] === code; })[0];
  if (!item) throw userError_('بند غير معروف.');
  var note = str_(p.note).slice(0, 300), done = p.done === true || p.done === 'Y';
  if (done && note.length < 3) throw userError_('اكتب ملاحظة قصيرة (مين عمل إيه).');
  var m = goliveManual_();
  if (done) m[code] = { at: today_(), by: ctx.user.User_ID, note: note }; else delete m[code];
  withLock_(function () {
    var c = get_('CONFIG', 'GOLIVE_CHECKS');
    if (!c) insert_('CONFIG', { Config_Key: 'GOLIVE_CHECKS', Config_Value: JSON.stringify(m), Value_Type: 'JSON', Description: 'Go-live checklist: manual items ticked on the readiness screen' }, ctx.user.User_ID);
    else update_('CONFIG', 'GOLIVE_CHECKS', { Config_Value: JSON.stringify(m) }, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'GOLIVE', entityId: code, action: done ? 'DONE' : 'UNDONE', newValue: item[1], reason: note });
  return goliveGet_(ctx);
}

/** Highest fill of the portal's spreadsheets, as a % of Google's 10-million-cell limit. */
function sheetsFill_() {
  var out = { max: 0, by: {} };
  Object.keys(SS_PROP).forEach(function (g) {
    try {
      var n = 0; ss_(g).getSheets().forEach(function (sh) { n += sh.getMaxRows() * sh.getMaxColumns(); });
      var pct = Math.round(n / 100000);
      out.by[g] = pct; if (pct > out.max) out.max = pct;
    } catch (e) {}
  });
  return out;
}
/** Drive space of the account (null when it cannot be read). */
function driveFill_() {
  try {
    var used = DriveApp.getStorageUsed(), limit = DriveApp.getStorageLimit();
    if (!limit) return null;
    return { usedGb: Math.round(used / 1e8) / 10, limitGb: Math.round(limit / 1e8) / 10, pct: Math.round(used / limit * 100) };
  } catch (e) { return null; }
}
