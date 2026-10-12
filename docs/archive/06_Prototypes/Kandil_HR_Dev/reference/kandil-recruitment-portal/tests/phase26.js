// v0.26.0: recruitment KPIs (process, recruiter, HR site, managers) on demo data; access by role; stay interview on day 60;
// the manager's satisfaction survey after confirmation; the monthly KPI e-mail.
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
must(api('emp.save', tR, { isNew: 'Y', Employee_ID: 'R1', Full_Name: 'موظف حقيقي', Position_ID: P['محاسب تكاليف'].Position_ID, Hire_Date: '2024-01-01', Employment_Kind: 'PERMANENT' }), 'real employee');
const S0 = must(api('demo.status', tO, {}), 'status');
S0.stages.forEach(s => must(api('demo.seed', tO, { stage: s.key }), 'seed ' + s.key));
fresh();
const demo = n => ctx.all_('USERS').find(u => u.Full_Name_AR === n).User_ID;
const tAs = id => must(api('demo.as', tO, { User_ID: id }), 'as').token;
const U = { hr: demo('منى عادل (تجريبي)'), site: demo('هبة منصور (تجريبي)'), rm: demo('طارق فهمي (تجريبي)'), rec1: demo('سارة نبيل (تجريبي)') };
const T2 = { hr: tAs(U.hr), site: tAs(U.site), rm: tAs(U.rm), rec1: tAs(U.rec1) };

// ---- process view
let K = must(api('kpi.run', tO, { view: 'PROCESS', period: 'year' }), 'process');
const all = {}; K.groups.forEach(g => g.kpis.forEach(k => { all[k.code] = k; }));
ok(K.groups.length === 5 && Object.keys(all).length >= 20, 'five groups, 20+ KPIs: ' + Object.keys(all).length);
ok(['OK', 'WARN', 'BAD', 'FEW', 'NA'].every(s => typeof s === 'string') && Object.values(all).every(k => ['OK', 'WARN', 'BAD', 'FEW', 'NA'].indexOf(k.status) >= 0), 'every KPI has a status');
// cross-check two by hand
fresh();
const offers = ctx.all_('OFFERS').filter(o => (o.Status === 'ACCEPTED' || o.Status === 'DECLINED') && o.Responded_At.slice(0, 4) === ctx.today_().slice(0, 4));
const acc = offers.filter(o => o.Status === 'ACCEPTED').length;
ok(all.OFFER_ACCEPT.n === offers.length && all.OFFER_ACCEPT.value === Math.round(acc / offers.length * 1000) / 10, 'offer acceptance = accepted ÷ answered: ' + all.OFFER_ACCEPT.value + ' / n ' + all.OFFER_ACCEPT.n);
const ivs = ctx.all_('INTERVIEWS').filter(i => i.Date.slice(0, 4) === ctx.today_().slice(0, 4) && i.Date <= ctx.today_() && ['CANCELLED', 'WAIVED', 'RESCHEDULED'].indexOf(i.Status) < 0);
ok(all.NO_SHOW.n === ivs.length && all.NO_SHOW.cases.length === ivs.filter(i => i.Status === 'NO_SHOW').length, 'no-shows counted with their cases');
ok(all.PROB_PASS.n === 1 && all.PROB_PASS.value === 100 && all.PROB_PASS.status === 'FEW', 'probation pass: one confirmed → shown but too few cases for a score');
ok(all.QOH.n >= 1, 'quality of hire from final evaluations');
ok(all.COST_PER_HIRE.dir === 0 && all.COST_PER_HIRE.score === null, 'cost per hire: information only');
// scoring rule
fresh();
const TG = ctx.kpiTargets_();
let m = ctx.kpiMake_('OFFER_ACCEPT', 85, 10, TG); ok(m.status === 'OK' && m.score === 3, 'exactly on target → green, 3/5');
m = ctx.kpiMake_('OFFER_ACCEPT', 79, 10, TG); ok(m.status === 'WARN' && m.score === 2, 'within 10 % → amber');
m = ctx.kpiMake_('APPROVAL_DAYS', 10, 10, TG); ok(m.status === 'BAD' && m.score === 1, 'lower-is-better: twice the target → red, 1/5');
m = ctx.kpiMake_('APPROVAL_DAYS', 4, 10, TG); ok(m.status === 'OK' && m.score === 5, 'faster than target → 5/5');
m = ctx.kpiMake_('APPROVAL_DAYS', 4, 2, TG); ok(m.status === 'FEW' && m.score === null, 'two cases → not scored');
ok(ctx.kpiCardScore_([{ code: 'A', score: 5 }, { code: 'B', score: 1 }, { code: 'C', score: null }], { A: 75, B: 25, C: 50 }) === 4, 'card score = weighted, unscored left out');
// filters
const K2 = must(api('kpi.run', tO, { view: 'PROCESS', period: 'year', cls: 'LEAD' }), 'class filter');
const o2 = {}; K2.groups.forEach(g => g.kpis.forEach(k => { o2[k.code] = k; }));
ok(o2.OFFER_ACCEPT.n <= all.OFFER_ACCEPT.n, 'job-class filter narrows');
bad(api('kpi.run', tO, { view: 'PROCESS', period: 'custom', from: '2026-12-01', to: '2026-01-01' }), /بعد نهايتها/, 'from after to');
fresh(); ctx.update_('CONFIG', 'KPI_TARGETS', { Config_Value: '{"OFFER_ACCEPT":50}' }, 'x');
const K3 = must(api('kpi.run', tO, { view: 'PROCESS', period: 'year' }), 'target from settings');
ok(K3.targets.OFFER_ACCEPT === 50 && K3.targets.PROB_PASS === 85, 'targets overridable from settings, others default');
fresh(); ctx.update_('CONFIG', 'KPI_TARGETS', { Config_Value: '{}' }, 'x');

// ---- team, site, managers
K = must(api('kpi.run', T2.rm, { view: 'TEAM', period: 'year' }), 'team (recruitment manager)');
ok(K.cards.length >= 2 && K.lead && K.lead.kpis.length >= 5 && K.cards.every(c => c.kpis.length === 7 && c.workload), 'one card per recruiter + the lead card');
const card1 = K.cards.find(c => c.user === U.rec1);
ok(card1 && card1.workload.all >= 1 && Object.keys(card1.weights).reduce((s, k) => s + card1.weights[k], 0) === 100, 'recruiter card: workload and weights summing to 100');
K = must(api('kpi.run', T2.rec1, { view: 'TEAM', period: 'year' }), 'recruiter asks for the team');
ok(K.cards.length === 1 && K.cards[0].user === U.rec1 && !K.lead, 'a recruiter sees only his own card');
K = must(api('kpi.run', T2.rec1, { view: 'PROCESS', period: 'year' }), 'recruiter process');
ok(K.groups.every(g => g.kpis.every(k => !k.cases.length)), 'recruiter sees process numbers without the names behind them');
bad(api('kpi.run', T2.rec1, { view: 'SITE', period: 'year' }), /لمديرين الموارد البشرية/, 'site cards for HR managers');
K = must(api('kpi.run', T2.hr, { view: 'SITE', period: 'year' }), 'site');
ok(K.cards.length >= 1 && K.cards[0].kpis.length === 6, 'HR site card with six KPIs');
K = must(api('kpi.run', T2.hr, { view: 'MANAGERS', period: 'year' }), 'managers');
ok(K.rows.length >= 1 && K.rows.every(r => r.kpis.length === 5), 'managers and approvers rows');
K = must(api('kpi.run', T2.rec1, { view: 'MANAGERS', period: 'year' }), 'managers as recruiter');
ok(K.rows.every(r => r.user === U.rec1), 'others see only their own service row');
const plain = must(api('users.save', tO, { Email: 'plain@t.com', Full_Name_AR: 'موظف عادي', Position_ID: '' }), 'plain user');
bad(api('kpi.run', login('plain@t.com'), { view: 'PROCESS' }), /لفريق الموارد البشرية/, 'someone without a role: no process KPIs');

// ---- stay interview and manager satisfaction
fresh();
const pr = ctx.all_('PROBATIONS').filter(p => p.Status === 'ACTIVE').sort((a, b) => a.Start_Date < b.Start_Date ? -1 : 1);
const p55 = pr.find(p => ctx.daysBetween_(p.Start_Date, ctx.today_()) >= 50 && ctx.daysBetween_(p.Start_Date, ctx.today_()) < 75);
ok(!!p55, 'a probation near day 60');
fresh(); ok(ctx.find_('PROB_REVIEWS', { Probation_ID: p55.Probation_ID, Kind: 'STAY' }).length === 1, 'stay interview scheduled');
let D = must(api('prob.get', tO, { Probation_ID: p55.Probation_ID }), 'detail HR');
ok(D.reviews.some(r => r.kind === 'STAY') && D.can.stay, 'HR sees the stay interview');
const mgrTok = p55.Manager_User_ID ? tAs(p55.Manager_User_ID) : null;
if (mgrTok) { D = must(api('prob.get', mgrTok, { Probation_ID: p55.Probation_ID }), 'detail manager'); ok(!D.reviews.some(r => r.kind === 'STAY'), 'the manager does not'); }
bad(api('prob.action', tO, { Probation_ID: p55.Probation_ID, action: 'STAY', likes: 'الفريق', leave: 'المواصلات', support: 4, stay: 9, risk: 'LOW' }), /من 1 لـ 5/, 'scores 1–5');
mails.length = 0;
must(api('prob.action', T2.hr, { Probation_ID: p55.Probation_ID, action: 'STAY', likes: 'الفريق متعاون', leave: 'المواصلات بعيدة جداً', support: 3, stay: 2, risk: 'HIGH', note: 'نشوف بدل انتقالات' }), 'stay interview');
fresh(); ok(ctx.find_('NOTIFICATIONS', { Link_ID: p55.Probation_ID }).some(n => /يسيب الشغل/.test(n.Title)), 'high risk alerts HR');
bad(api('prob.action', T2.hr, { Probation_ID: p55.Probation_ID, action: 'STAY', likes: 'x', leave: 'y', support: 3, stay: 3, risk: 'LOW' }), /قبل كده/, 'once');
// old probation without a stay interview gets one
fresh(); const old = pr.find(p => p.Probation_ID !== p55.Probation_ID);
ctx.find_('PROB_REVIEWS', { Probation_ID: old.Probation_ID, Kind: 'STAY' }).forEach(r => ctx.update_('PROB_REVIEWS', r.Review_ID, { Kind: 'GONE' }, 'x'));
fresh(); ctx.probDaily_(); fresh(); ok(ctx.find_('PROB_REVIEWS', { Probation_ID: old.Probation_ID, Kind: 'STAY' }).length === 1, 'probations from before get their stay interview');
// manager satisfaction after the demo confirmation
fresh(); const conf = ctx.all_('PROBATIONS').find(p => p.Status === 'CONFIRMED');
const ms = ctx.find_('PROB_REVIEWS', { Probation_ID: conf.Probation_ID, Kind: 'MGR_SAT' })[0];
ok(ms && ms.Status === 'OPEN', 'confirmation opens the manager survey');
bad(api('prob.action', T2.rec1, { Probation_ID: conf.Probation_ID, action: 'MGR_SAT', fit: 5, service: 4, again: 4 }), null, 'not for others');
must(api('prob.action', T2.hr, { Probation_ID: conf.Probation_ID, action: 'MGR_SAT', fit: 5, service: 4, again: 3, note: 'تمام' }), 'manager survey (HR on his behalf)');
fresh(); ok(ctx.get_('PROB_REVIEWS', ms.Review_ID).Overall === '4', 'average 4');
K = must(api('kpi.run', tO, { view: 'PROCESS', period: 'year' }), 'process again');
const k2 = {}; K.groups.forEach(g => g.kpis.forEach(k => { k2[k.code] = k; }));
ok(k2.MGR_SAT.n === 1 && k2.MGR_SAT.value === 4, 'manager satisfaction feeds the quality KPI');

// ---- monthly e-mail
fresh(); vm.runInContext("today_ = function () { return '2027-03-01'; };", ctx);
mails.length = 0; fresh(); let r = ctx.kpiMonthly_();
ok(r.sent >= 2 && mails.some(m => /مؤشرات التوظيف — 2027-02/.test(m.subject)), 'on the 1st: last month by e-mail');
fresh(); ok(ctx.kpiMonthly_().skipped, 'once a month');
console.log('phase26: ' + pass + ' passed, ' + failN + ' failed');
