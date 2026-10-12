// v0.27.0: KPI settings edited on the screen (validated, audited, used at once); every user sees his own evaluation ("my evaluation");
// the probation employee sees his follow-ups and, after the HR decision, his final evaluation.
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

const tPlain = (() => { must(api('users.save', tO, { Email: 'plain@t.com', Full_Name_AR: 'موظف عادي', Position_ID: '' }), 'plain user'); return login('plain@t.com'); })();

// ---- settings: who reads, who edits
let G = must(api('kpi.settings', T2.hr, { op: 'get' }), 'settings (HR manager)');
ok(G.canEdit && G.targets.OFFER_ACCEPT === 85 && G.ttf.LABOR === 21 && G.minCases === 3 && G.monthly === true, 'defaults shown, HR manager can edit');
ok(G.grades.length >= 2 && G.grades.every(g => g.auto), 'grades listed with their automatic class');
ok(['RECRUITER', 'SITE', 'LEAD'].every(k => Object.values(G.weights[k]).reduce((s, x) => s + x, 0) === 100), 'current weights per card sum to 100');
ok(G.cardCodes.SITE.length === 6 && G.cardCodes.RECRUITER.indexOf('TASKS_ON_TIME') >= 0 && G.cardCodes.LEAD.indexOf('ASSIGN_DAYS') >= 0, 'KPIs available per card');
G = must(api('kpi.settings', T2.rec1, { op: 'get' }), 'settings (recruiter)');
ok(!G.canEdit, 'a recruiter reads the settings but cannot edit');
bad(api('kpi.settings', tPlain, { op: 'get' }), /لفريق الموارد البشرية/, 'someone without a role: no settings');
fresh();
ok(ctx.consultantMay_('kpi.settings', { op: 'get' }) && !ctx.consultantMay_('kpi.settings', { op: 'save' }), 'consultant: read only');

const base = () => ({ op: 'save', reason: 'مراجعة الأهداف', targets: Object.assign({}, G.targets), ttf: Object.assign({}, G.ttf), jobClass: {},
  weights: { RECRUITER: Object.assign({}, G.weights.RECRUITER), SITE: Object.assign({}, G.weights.SITE), LEAD: Object.assign({}, G.weights.LEAD) }, minCases: 3, monthly: true });
bad(api('kpi.settings', T2.rec1, base()), /لمالك النظام/, 'a recruiter cannot save');
bad(api('kpi.settings', T2.hr, Object.assign(base(), { reason: '' })), /سبب/, 'reason required');
let x = base(); x.weights.RECRUITER.TTF_ON_TIME = 24;
bad(api('kpi.settings', T2.hr, x), /لازم يكون 100 \(دلوقتي 99\)/, 'weights must sum to 100');
x = base(); x.weights.SITE.TTF_ON_TIME = 0;
bad(api('kpi.settings', T2.hr, x), /مش متاح/, 'a KPI outside the card is refused');
x = base(); x.weights.LEAD = {};
bad(api('kpi.settings', T2.hr, x), /مؤشر واحد على الأقل/, 'an empty card is refused');
x = base(); x.targets.OFFER_ACCEPT = 120;
bad(api('kpi.settings', T2.hr, x), /من 0 لـ 100/, 'percent target above 100');
x = base(); x.targets.NHV_AVG = 6;
bad(api('kpi.settings', T2.hr, x), /من 5/, 'score target above 5');
x = base(); x.targets.APPROVAL_DAYS = -1;
bad(api('kpi.settings', T2.hr, x), /رقم موجب/, 'negative target');
x = base(); x.ttf.LABOR = 0;
bad(api('kpi.settings', T2.hr, x), /من 1 لـ 365/, 'days to fill 1–365');
x = base(); x.jobClass = { '99': 'LEAD' };
bad(api('kpi.settings', T2.hr, x), /درجة غير موجودة/, 'unknown grade');
x = base(); x.jobClass = { [G.grades[0].code]: 'BOSS' };
bad(api('kpi.settings', T2.hr, x), /نوع وظيفة غير معروف/, 'unknown class');
x = base(); x.minCases = 0;
bad(api('kpi.settings', T2.hr, x), /من 1 لـ 50/, 'minimum cases 1–50');

// ---- a valid save is stored, audited and used at once
x = base();
x.targets.OFFER_ACCEPT = 70; x.ttf.LABOR = 25; x.jobClass = { '5': 'LABOR' }; x.minCases = 2; x.monthly = false;
x.weights.RECRUITER = { TTF_ON_TIME: 40, PROB_PASS: 30, TASKS_ON_TIME: 20, OFFER_ACCEPT: 10, NO_SHOW: 0 };
let Sv = must(api('kpi.settings', T2.hr, x), 'save');
ok(Sv.changed.length === 6 && Sv.changed.indexOf('KPI_WEIGHTS_SITE') < 0, 'only the changed settings are written: ' + Sv.changed.join(','));
fresh();
ok(ctx.get_('CONFIG', 'KPI_TARGETS').Config_Value === '{"OFFER_ACCEPT":70}', 'targets stored as the differences from the defaults only');
ok(JSON.parse(ctx.get_('CONFIG', 'KPI_TTF_TARGETS').Config_Value).LABOR === 25 && ctx.get_('CONFIG', 'KPI_MONTHLY_EMAIL').Config_Value === 'N' && ctx.get_('CONFIG', 'KPI_MIN_CASES').Config_Value === '2', 'days to fill, e-mail, minimum stored');
ok(ctx.all_('AUDIT_LOG').filter(a => /^KPI_/.test(a.Entity_ID) && a.Reason === 'مراجعة الأهداف').length === 6, 'each change in the audit log with the reason');
ok(Sv.settings.targets.OFFER_ACCEPT === 70 && Sv.settings.jobClass['5'] === 'LABOR', 'the screen gets the saved values back');
const cache = {}; const j5 = ctx.all_('JOBS').find(j => j.Grade_Code === '5');
ok(ctx.kpiClassOf_(j5.Job_Code, cache) === 'LABOR', 'grade 5 now counted as labour');
let K = must(api('kpi.run', tO, { view: 'TEAM', period: 'year' }), 'team after save');
ok(K.targets.OFFER_ACCEPT === 70 && K.ttf.LABOR === 25 && K.minCases === 2, 'KPIs use the new targets at once');
ok(K.cards.every(c => c.kpis.length === 5 && c.weights.TTF_ON_TIME === 40), 'recruiter cards use the new weights (NO_SHOW shown for information)');
ok(K.cards[0].kpis.find(k => k.code === 'NO_SHOW'), 'a weight of 0 keeps the KPI on the card');
Sv = must(api('kpi.settings', T2.hr, x), 'save again');
ok(Sv.changed.length === 0, 'saving the same values changes nothing');
fresh(); ok(ctx.kpiMonthly_().skipped, 'monthly e-mail off from the screen');
// back to the defaults
x = base(); x.weights = { RECRUITER: G.defWeights.RECRUITER, SITE: G.defWeights.SITE, LEAD: Object.assign({}, G.defWeights.LEAD) };
must(api('kpi.settings', tO, x), 'owner restores the defaults');

// ---- "my evaluation" for everyone
K = must(api('kpi.run', T2.rec1, { view: 'MINE', period: 'year' }), 'mine (recruiter)');
ok(K.cards.length === 1 && K.cards[0].kind === 'RECRUITER' && K.cards[0].user === U.rec1 && K.cards[0].kpis.length === 7, 'recruiter: own scorecard');
K = must(api('kpi.run', T2.rm, { view: 'MINE', period: 'year' }), 'mine (recruitment manager)');
ok(K.cards.some(c => c.kind === 'LEAD' && c.kpis.length >= 5 && c.score !== undefined), 'recruitment manager: the lead card');
K = must(api('kpi.run', T2.site, { view: 'MINE', period: 'year' }), 'mine (HR site)');
ok(K.cards.some(c => c.kind === 'SITE' && c.kpis.length === 6), 'HR site specialist: the site card');
ok(!K.cards.some(c => c.kind === 'RECRUITER'), 'no recruiter card for someone who leads no vacancy');
K = must(api('kpi.run', T2.hr, { view: 'MINE', period: 'year' }), 'mine (HR manager)');
ok(K.rows.every(r => r.user === U.hr), 'service row: own only');
K = must(api('kpi.run', tPlain, { view: 'MINE', period: 'year' }), 'mine (no role)');
ok(K.cards.length === 0 && K.rows.length === 0, 'someone with nothing assigned: an empty evaluation, not an error');
bad(api('kpi.run', tPlain, { view: 'TEAM', period: 'year' }), /لمديرين التوظيف/, 'no role: no team cards');
// a manager who approves and evaluates sees his service row
fresh(); const appr = ctx.all_('APPROVAL_INSTANCES').find(a => a.Decision_By && a.Decision_At && a.Decision_At.slice(0, 4) === ctx.today_().slice(0, 4) && a.Decision_By.indexOf('U') === 0);
if (appr) {
  const tm = tAs(appr.Decision_By);
  K = must(api('kpi.run', tm, { view: 'MINE', period: 'year' }), 'mine (approver)');
  ok(K.rows.length === 1 && K.rows[0].user === appr.Decision_By && K.rows[0].kpis[0].n >= 1, 'approver: own service row with his approvals');
}

// ---- probation: the employee sees his own evaluations
fresh();
const conf = ctx.all_('PROBATIONS').find(p => p.Status === 'CONFIRMED');
let PI = ctx.probPublic_(conf);
const fin = PI.reviews.find(r => r.kind === 'FINAL');
ok(fin && fin.weighted > 0 && Object.keys(fin.items).length === 6 && fin.decision === 'CONFIRMED' && fin.strengths, 'after the decision: the final evaluation with each item, strengths and improvements');
ok(PI.reviews.filter(r => r.kind === 'D30' || r.kind === 'D60').every(r => r.overall >= 1 && Array.isArray(r.goals)), 'follow-ups shown');
ok(PI.reviews.every(r => r.note === undefined), 'private notes stay out');
ok(!PI.reviews.some(r => ['SELF', 'STAY', 'MGR_SAT'].indexOf(r.kind) >= 0), 'stay interview and manager survey never shown');
// the final evaluation is hidden until HR decides
fresh(); ctx.update_('PROBATIONS', conf.Probation_ID, { Decision: '' }, 'x'); fresh();
PI = ctx.probPublic_(ctx.get_('PROBATIONS', conf.Probation_ID));
ok(!PI.reviews.some(r => r.kind === 'FINAL'), 'final evaluation hidden before the HR decision');
fresh(); ctx.update_('PROBATIONS', conf.Probation_ID, { Decision: conf.Decision }, 'x');
// an open follow-up is not shown; a done one is, through the employee link
fresh();
const act = ctx.all_('PROBATIONS').filter(p => p.Status === 'ACTIVE').find(p => ctx.find_('PROB_REVIEWS', { Probation_ID: p.Probation_ID, Kind: 'D30', Status: 'DONE' }).length);
if (act) {
  const link = must(api('prob.action', tO, { Probation_ID: act.Probation_ID, action: 'LINK' }), 'link').link;
  const I = must(pub('prob.info', { token: /prob=([A-Za-z0-9]+)/.exec(link)[1] }), 'employee page');
  const d30 = I.reviews.find(r => r.kind === 'D30');
  ok(d30 && d30.day === 30 && d30.strengths && d30.improve && d30.goals.length >= 1, 'employee page: the day-30 follow-up with goals, strengths and improvements');
  ok(!I.reviews.some(r => r.kind === 'FINAL'), 'no final evaluation while the probation is running');
} else ok(false, 'a running probation with a done day-30 follow-up');
console.log('phase27: ' + pass + ' passed, ' + failN + ' failed');
