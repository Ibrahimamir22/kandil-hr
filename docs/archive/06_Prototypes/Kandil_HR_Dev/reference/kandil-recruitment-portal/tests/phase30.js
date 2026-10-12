// v0.30.0: go-live readiness (automatic checks, manual items ticked and audited, access) and the hiring forecast
// (leavers per month × 3 + open vacancies, empty approved positions apart, time to fill per job class, confidence).
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks');
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
const bad = (r, re, m) => ok(!r.ok && (!re || re.test(r.error)), m + ' → ' + (r.ok ? 'accepted' : r.error));
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
let failN = 0, pass = 0; function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const T = '\t';
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
const rows = [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4'],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب عام', 'العبور', '', '', '', '3'],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مراجع حسابات', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'مدير الخزينة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'أمين خزينة', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'محصل', 'إنشاص', '', '', '', '3'],
  ['قنديل مصر', 'قطاع المصانع', '', '', '', '', 'مدير قطاع المصانع', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'مدير الإنتاج', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'فني تشغيل', 'العبور', '', '', '', '6'],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'مشرف إنتاج', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'عامل تعبئة', 'العبور', '', '', '', '5'],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'مدير الجودة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'مراقب جودة', 'العبور', '', '', '', '3'],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'فني معمل', 'العبور', '', '', '', '2']];
must(api('import.commit', tO, { reason: 'x', text: rows.map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x'); ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, 'x');
['محاسب تكاليف', 'محاسب عام', 'مراجع حسابات', 'أمين خزينة', 'مراقب جودة', 'فني معمل', 'مشرف إنتاج'].forEach(n => ctx.update_('JOBS', P[n].Job_Code, { Grade_Code: '7' }, 'x'));
['محصل', 'فني تشغيل', 'عامل تعبئة'].forEach(n => ctx.update_('JOBS', P[n].Job_Code, { Grade_Code: '5' }, 'x'));
// real data that must survive the wipe: a real HR user (with a manager position) and a real employee
const real = must(api('users.save', tO, { Email: 'real.hr@t.com', Full_Name_AR: 'مستخدم حقيقي', Position_ID: P['مدير الحسابات'].Position_ID }), 'real user');
must(api('users.setRoles', tO, { User_ID: real.User_ID, roles: [{ Role_Code: 'HR_MANAGER' }], reason: 'x' }), 'real roles');
const tR = login('real.hr@t.com');

// v0.36: the wipe is asked by an HR user and approved (and run) by the owner
function wipeVia(p) {
  fresh(); let d = ctx.all_('DUAL_REQUESTS').find(x => x.Kind === 'WIPE' && x.Status === 'PENDING');
  if (!d) { const rq = api('dual.request', login('real.hr@t.com'), { Kind: 'WIPE', reason: p.reason || 'مسح بعد الاختبار' }); if (!rq.ok) return rq; d = rq.data; }
  const r = api('dual.decide', tO, { Dual_ID: d.Dual_ID, decision: 'APPROVE', phrase: p.phrase, code: p.code, comment: '' });
  return r.ok ? { ok: true, data: r.data.data } : r;
}
must(api('emp.save', tR, { isNew: 'Y', Employee_ID: 'R1', Full_Name: 'موظف حقيقي', Position_ID: P['محاسب تكاليف'].Position_ID, Hire_Date: '2024-01-01', Employment_Kind: 'PERMANENT' }), 'real employee');
const S0 = must(api('demo.status', tO, {}), 'status');
S0.stages.forEach(s => must(api('demo.seed', tO, { stage: s.key }), 'seed ' + s.key));
fresh();
const demo = n => ctx.all_('USERS').find(u => u.Full_Name_AR === n).User_ID;
const tAs = id => must(api('demo.as', tO, { User_ID: id }), 'as').token;
const U = { hr: demo('منى عادل (تجريبي)'), site: demo('هبة منصور (تجريبي)'), rm: demo('طارق فهمي (تجريبي)'), rec1: demo('سارة نبيل (تجريبي)') };
const T2 = { hr: tAs(U.hr), site: tAs(U.site), rm: tAs(U.rm), rec1: tAs(U.rec1) };

const tPlain = (() => { must(api('users.save', tO, { Email: 'plain@t.com', Full_Name_AR: 'موظف عادي', Position_ID: '' }), 'plain user'); return login('plain@t.com'); })();

// ================= readiness =================
bad(api('golive.get', tPlain, {}), /جاهزية التشغيل/, 'no role: refused');
bad(api('golive.get', T2.rm, {}), /جاهزية التشغيل/, 'recruitment manager: refused');
fresh(); ok(ctx.consultantMay_('golive.get', {}) && !ctx.consultantMay_('golive.tick', {}), 'consultant reads, cannot tick');
let G = must(api('golive.get', tO, {}), 'owner');
const C = {}; G.auto.forEach(c => { C[c.code] = c; });
ok(G.auto.length >= 18 && G.manual.length === 7 && G.total === G.auto.length + 7, 'automatic and manual items: ' + G.auto.length + ' + ' + G.manual.length);
ok(G.auto.every(c => ['OK', 'WARN', 'TODO'].indexOf(c.status) >= 0 && c.name && c.group), 'every check has a status, a name and a group');
ok(C.DEMO.status === 'TODO' && /امسحها/.test(C.DEMO.detail), 'demo data present → must be wiped');
vm.runInContext("PropertiesService.getScriptProperties().setProperty('DAILY_TRIGGER', '')", ctx);
ok(ctx.goliveChecks_().find(c => c.code === 'TRIGGER').status === 'TODO', 'no daily trigger → to do');
ok(C.MEDICAL.status === 'TODO', 'no medical providers → to do');
ok(C.POSITIONS.status === 'OK' && C.SOURCES.status === 'OK' && C.DOCS.status === 'OK', 'structure, sources and documents ready');
ok(C.PAY.status === 'TODO' && /درجات مالهاش/.test(C.PAY.detail) || C.PAY.status === 'OK', 'salary structures per grade checked');
ok(G.canEdit && G.ready <= G.total && G.todo >= 3, 'owner can tick; ready ' + G.ready + ' / ' + G.total + ', to do ' + G.todo);
G = must(api('golive.get', T2.hr, {}), 'HR manager reads');
ok(!G.canEdit, 'HR manager cannot tick');
bad(api('golive.tick', T2.hr, { code: 'UAT', done: true, note: 'تم' }), /لمالك النظام/, 'HR manager tick refused');
// fixing things turns checks green
fresh(); ctx.update_('CONFIG', 'MEDICAL_PROVIDERS', { Config_Value: '["أكسا","ميدنت"]' }, 'x');
vm.runInContext("PropertiesService.getScriptProperties().setProperty('DAILY_TRIGGER', 'Y'); PropertiesService.getScriptProperties().setProperty('DAILY_RUN', today_() + 'T07:00:00');", ctx);
G = must(api('golive.get', tO, {}), 'after fixes'); G.auto.forEach(c => { C[c.code] = c; });
ok(C.MEDICAL.status === 'OK' && /أكسا/.test(C.MEDICAL.detail), 'medical providers → ready');
ok(C.TRIGGER.status === 'OK', 'trigger installed and ran today → ready');
vm.runInContext("PropertiesService.getScriptProperties().setProperty('DAILY_RUN', addDaysYmd_(today_(), -5) + 'T07:00:00');", ctx);
ok(ctx.goliveChecks_().find(c => c.code === 'TRIGGER').status === 'WARN', 'last run 5 days ago → warning');
// manual items (v0.32.1: the daily job no longer runs inside a request, so put the last run back to today first)
vm.runInContext("PropertiesService.getScriptProperties().setProperty('DAILY_RUN', today_() + 'T07:00:00')", ctx);
bad(api('golive.tick', tO, { code: 'NOPE', done: true, note: 'x x x' }), /غير معروف/, 'unknown item');
bad(api('golive.tick', tO, { code: 'LEGAL_REVIEW', done: true, note: '' }), /ملاحظة/, 'note required');
const before = G.ready;
G = must(api('golive.tick', tO, { code: 'LEGAL_REVIEW', done: true, note: 'المحامي راجع الخطابات وإقرار السرية' }), 'tick');
const L = G.manual.find(m => m.code === 'LEGAL_REVIEW');
ok(L.done && L.at === ctx.today_() && L.by && /المحامي/.test(L.note) && G.ready === before + 1, 'ticked with date, who and note');
fresh(); ok(ctx.all_('AUDIT_LOG').some(a => a.Entity_Type === 'GOLIVE' && a.Entity_ID === 'LEGAL_REVIEW' && a.Action === 'DONE'), 'audited');
ok(JSON.parse(ctx.get_('CONFIG', 'GOLIVE_CHECKS').Config_Value).LEGAL_REVIEW, 'kept in GOLIVE_CHECKS');
G = must(api('golive.tick', tO, { code: 'LEGAL_REVIEW', done: false }), 'untick');
ok(!G.manual.find(m => m.code === 'LEGAL_REVIEW').done, 'untick clears it');
// wiping demo data clears the demo item
fresh(); must(wipeVia({ phrase: 'امسح الحركات', reason: 'قبل التشغيل الفعلي' }), 'wipe');
G = must(api('golive.get', tO, {}), 'after wipe'); ok(G.auto.find(c => c.code === 'DEMO').status === 'OK', 'no demo data → ready');

// ================= forecast (on fresh demo data) =================
S0.stages.forEach(s => must(api('demo.seed', tO, { stage: s.key }), 'reseed ' + s.key));
fresh();
const T3 = { hr: tAs(demo('منى عادل (تجريبي)')) };
// leavers over the year: mark some demo employees as left in different months
const emps = ctx.all_('EMPLOYEES').filter(e => e.Status === 'Active');
const exits = [-20, -50, -80, -110, -140, -170, -200, -230, -260, -290, -320, -350];
emps.slice(0, 12).forEach((e, i) => ctx.update_('EMPLOYEES', e.Employee_ID, { Status: 'Exited', Exit_Date: ctx.addDaysYmd_(ctx.today_(), exits[i]), Exit_Reason: 'RESIGNATION' }, 'x'));
fresh();
let R = must(api('ins.run', T3.hr, { view: 'FORECAST', period: 'month' }), 'forecast');
const Fc = R.forecast;
ok(Fc.leavers === 12 && Fc.months >= 11 && Fc.confidence !== 'LOW', 'twelve leavers over ~a year → enough history: ' + Fc.months + ' months, ' + Fc.confidence);
const sumExp = Fc.byClass.reduce((s, r) => s + r.expected, 0);
ok(Math.abs(sumExp - 12 / Fc.months * 3) < 0.3, 'expected leavers next quarter ≈ 12 ÷ months × 3: ' + sumExp);
fresh(); const openLeft = ctx.all_('VACANCIES').filter(v => ['APPROVED', 'PREPARATION', 'OPEN', 'ON_HOLD', 'PARTIALLY_FILLED'].indexOf(v.Status) >= 0).reduce((s, v) => s + Math.max(0, Number(v.Required_HC) - Number(v.Joined_HC || 0)), 0);
ok(Fc.total.open === openLeft, 'open still to fill = open vacancies left (' + openLeft + ')');
ok(Fc.byClass.every(r => r.need === Math.ceil(r.expected + r.open)), 'need = expected leavers + open (rounded up)');
ok(Fc.bySector.length >= 2 && Fc.bySector.reduce((s, r) => s + r.leavers, 0) === 12, 'by sector adds up to the leavers');
ok(Fc.ttf.length === 4 && Fc.ttf.every(t => t.use > 0 && ['HISTORY', 'TARGET'].indexOf(t.from) >= 0), 'time to fill per job class (history or target)');
ok(Fc.recruiters >= 2 && Fc.perRecruiter !== null, 'load per recruiter');
ok(Fc.byClass.every(r => r.turnover === null || r.turnover >= 0), 'annual turnover per class');
// filters apply; little history → low confidence
R = must(api('ins.run', T3.hr, { view: 'FORECAST', cls: 'LEAD' }), 'forecast filtered');
ok(R.forecast.byClass.every(r => r.key === 'LEAD'), 'job-class filter keeps one class');
fresh(); ctx.all_('EMPLOYEES').filter(e => e.Exit_Date && e.Exit_Date < ctx.addDaysYmd_(ctx.today_(), -40)).forEach(e => ctx.update_('EMPLOYEES', e.Employee_ID, { Exit_Date: '' , Status: 'Active' }, 'x'));
fresh(); R = must(api('ins.run', T3.hr, { view: 'FORECAST' }), 'little history');
ok(R.forecast.confidence === 'LOW' && R.forecast.leavers === 1, 'one leaver in the last month → low confidence');
bad(api('ins.run', tPlain, { view: 'FORECAST' }), /لإدارة الموارد البشرية/, 'no role: no forecast');
console.log('phase30: ' + pass + ' passed, ' + failN + ' failed');
