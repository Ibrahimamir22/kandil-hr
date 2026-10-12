// v0.29.0: Phase 8 insights on demo data — source return (funnel to confirmation, quality, time to hire, cost per hire),
// bottlenecks (each step: done / waiting / overdue / slowest people), interviewer calibration (panel deviation, agreement, prediction).
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

// ---- access
bad(api('ins.run', tPlain, { view: 'SOURCES', period: 'year' }), /لإدارة الموارد البشرية/, 'no role: no insights');
bad(api('ins.run', T2.hr, { view: 'XX', period: 'year' }), /غير معروف/, 'unknown view');
fresh(); ok(ctx.consultantMay_('ins.run', {}), 'consultant may read');
let B = must(api('me', T2.hr, {}), 'me'); ok(B.can && B.can.insights, 'HR manager has the insights flag');

// ---- SOURCES
let R = must(api('ins.run', T2.hr, { view: 'SOURCES', period: 'year' }), 'sources');
const S = R.sources;
ok(S.rows.length >= 2 && S.total.applied >= 10, 'rows per source with applications: ' + S.rows.length + ' / ' + S.total.applied);
fresh();
const apps = ctx.all_('APPLICATIONS').filter(a => ctx.kpiIn_(a.Applied_At, R.period) && a.Close_Code !== 'TRANSFERRED' && a.Close_Code !== 'DUPLICATE');
ok(S.total.applied === apps.length, 'total applied = applications in the period');
const joinedApps = apps.filter(a => ctx.all_('JOININGS').some(j => j.Application_ID === a.Application_ID && j.Status === 'JOINED'));
ok(S.total.joined === joinedApps.length && S.total.joined >= 1, 'joined counted from the cohort: ' + S.total.joined);
ok(S.rows.every(r => r.applied >= r.shortlisted && r.shortlisted >= 0 && r.joined <= r.accepted + 1), 'funnel shrinks');
const withCost = S.rows.filter(r => r.cost > 0);
ok(withCost.length >= 1 && withCost.every(r => r.cost === r.costParts.ads + r.costParts.subs + r.costParts.agency + r.costParts.referral || Math.abs(r.cost - (r.costParts.ads + r.costParts.subs + r.costParts.agency + r.costParts.referral)) <= 2), 'cost = ads + subscriptions + agency + referrals');
ok(S.rows.filter(r => r.joined && r.cost).every(r => r.perHire === Math.round(r.cost / r.joined)), 'cost per hire = cost ÷ hires');
// ads cross-check
const adSpend = ctx.all_('ADVERTISEMENTS').filter(a => ctx.kpiIn_(a.Published_At, R.period)).reduce((s, a) => s + Number(a.Cost || 0), 0);
ok(S.rows.reduce((s, r) => s + r.costParts.ads, 0) === Math.round(adSpend) || Math.abs(S.rows.reduce((s, r) => s + r.costParts.ads, 0) - adSpend) <= S.rows.length, 'ad spend matches the ads');
// subscriptions spread over the period; none when a filter is set
const subs = ctx.all_('SOURCE_SUBSCRIPTIONS').filter(s => Number(s.Cost || 0) > 0);
if (subs.length) ok(S.rows.some(r => r.costParts.subs > 0), 'subscription cost spread over the period');
R = must(api('ins.run', T2.hr, { view: 'SOURCES', period: 'year', cls: 'TECH' }), 'sources filtered');
ok(R.sources.filtered && R.sources.rows.every(r => r.costParts.subs === 0) && R.sources.total.applied <= S.total.applied, 'filter: fewer applications, no subscription share');
// referral bonus estimate from settings
fresh(); ctx.update_('CONFIG', 'INSIGHT_REFERRAL_BONUS', { Config_Value: '1000' }, 'x');
const elig = ctx.all_('REFERRALS').filter(r => r.Status === 'Active' && r.Kind === 'PRIMARY' && ['ELIGIBLE', 'PAID'].indexOf(r.Bonus_Status) >= 0);
if (!elig.length) { const r0 = ctx.all_('REFERRALS').find(r => r.Kind === 'PRIMARY'); if (r0) { ctx.update_('REFERRALS', r0.Referral_ID, { Bonus_Status: 'ELIGIBLE', Bonus_At: ctx.nowIso_(), Status: 'Active' }, 'x'); } }
fresh();
R = must(api('ins.run', T2.hr, { view: 'SOURCES', period: 'year' }), 'sources with bonus');
const nElig = ctx.all_('REFERRALS').filter(r => r.Status === 'Active' && r.Kind === 'PRIMARY' && ['ELIGIBLE', 'PAID'].indexOf(r.Bonus_Status) >= 0 && ctx.kpiIn_(r.Bonus_At || r.Created_At, R.period)).length;
ok(R.sources.rows.reduce((s, r) => s + r.costParts.referral, 0) === nElig * 1000, 'referral bonuses: ' + nElig + ' × 1000');
// agency fee estimate
fresh();
const ag = ctx.insert_('AGENCIES', { Agency_ID: 'AGY-T1', Name_AR: 'مكتب تجربة', Fee_Type: 'MONTHS_SALARY', Fee_Value: '1', Status: 'Active' }, 'x');
ok(ctx.insAgencyFee_({ Agency_ID: 'AGY-T1', Agency_Terms_JSON: '' }, { Final_Accepted: '9000' }) === 9000, 'agency fee: one month of the accepted package');
ok(ctx.insAgencyFee_({ Agency_Terms_JSON: JSON.stringify({ feeType: 'PERCENT_ANNUAL', feeValue: 10 }) }, { Final_Accepted: '10000' }) === 12000, 'agency fee: 10 % of the annual package, from the frozen terms');
ok(ctx.insAgencyFee_({ Agency_Terms_JSON: JSON.stringify({ feeType: 'FIXED', feeValue: 5000 }) }, null) === 5000, 'agency fee: fixed');

// ---- FLOW
R = must(api('ins.run', T2.hr, { view: 'FLOW', period: 'year' }), 'flow');
const F = R.flow, st = {}; F.steps.forEach(s => { st[s.code] = s; });
ok(F.steps.length === 13 && F.steps.every(s => s.name && s.target > 0), 'thirteen steps with names and targets');
ok(st.REQ_APPROVAL.n >= 3 && st.REQ_APPROVAL.parts.length >= 2 && st.REQ_APPROVAL.parts.some(p => p.code === 'HR'), 'request approval by step: ' + st.REQ_APPROVAL.parts.map(p => p.code).join(','));
ok(F.steps.every(s => s.avg === null || (s.median !== null && s.p90 !== null && s.p90 >= s.median)), 'average, median and 90th percentile');
fresh(); const pending = ctx.all_('APPROVAL_INSTANCES').filter(a => a.Entity_Type === 'REQUEST' && a.Status === 'PENDING' && a.Activated_At).length;
ok(st.REQ_APPROVAL.waiting === pending, 'waiting approvals = pending steps now (' + pending + ')');
ok(st.ST_NEW.waiting === ctx.all_('APPLICATIONS').filter(a => a.Stage === 'NEW').length, 'waiting in «new» = applications in NEW');
ok(st.IV_CONFIRM.waiting === ctx.all_('INTERVIEWS').filter(i => i.Kind !== 'ASSESSMENT' && i.Status === 'PROPOSED').length, 'interviews waiting for the interviewer');
ok(st.OFFER_APPROVAL.waiting === ctx.all_('OFFERS').filter(o => o.Status === 'PENDING_APPROVAL' && o.Submitted_At).length, 'offers waiting for approval');
ok(F.steps.every(s => s.oldest.every((x, i, a) => i === 0 || a[i - 1].days >= x.days)), 'oldest cases first');
ok(F.steps.every(s => s.overdue === s.oldest.filter(x => x.days > s.target).length || s.waiting > 15), 'overdue = waiting beyond the target');
// make one step clearly slow → it becomes the bottleneck
fresh();
const off = ctx.all_('OFFERS').find(o => o.Status === 'PENDING_APPROVAL') || ctx.all_('OFFERS')[0];
['OFFER_APPROVAL'].forEach(() => {
  const old = ctx.addDaysYmd_(ctx.today_(), -30) + 'T09:00:00';
  ctx.all_('OFFERS').slice(0, 4).forEach(o => ctx.update_('OFFERS', o.Offer_ID, { Status: 'PENDING_APPROVAL', Submitted_At: old }, 'x'));
});
fresh(); R = must(api('ins.run', T2.hr, { view: 'FLOW', period: 'year' }), 'flow again');
const oa = R.flow.steps.find(s => s.code === 'OFFER_APPROVAL');
ok(oa.overdue >= 3 && oa.status === 'BAD', 'four offers stuck a month → step in red');
ok(R.flow.bottleneck === 'OFFER_APPROVAL' || R.flow.steps.find(s => s.code === R.flow.bottleneck).overdue >= oa.overdue, 'bottleneck = the step with the most overdue work: ' + R.flow.bottleneck);
// slowest people on request approvals
ok(st.REQ_APPROVAL.people.every(p => p.name && p.avg !== null), 'slowest approvers listed with their average');
// insDays_ / stats helpers
ok(ctx.insDays_('2026-01-01T00:00:00', '2026-01-03T12:00:00') === 2.5 && ctx.insDays_('2026-01-03', '2026-01-01') === null, 'durations in days, out of order ignored');
const s5 = ctx.insStats_([1, 2, 3, 4, 10]); ok(s5.n === 5 && s5.avg === 4 && s5.median === 3 && s5.p90 === 10, 'stats: avg 4, median 3, p90 10');
// step targets from settings
fresh(); ctx.update_('CONFIG', 'INSIGHT_STEP_DAYS', { Config_Value: '{"OFFER_APPROVAL":60}' }, 'x');
R = must(api('ins.run', T2.hr, { view: 'FLOW', period: 'year' }), 'flow with targets');
ok(R.flow.steps.find(s => s.code === 'OFFER_APPROVAL').target === 60 && R.flow.steps.find(s => s.code === 'OFFER_APPROVAL').overdue === 0, 'targets from settings');

// ---- CALIB
R = must(api('ins.run', T2.hr, { view: 'CALIB', period: 'year' }), 'calibration');
const C = R.calib;
ok(C.rows.length >= 2 && C.company.interviews >= 3, 'evaluators listed: ' + C.rows.length);
ok(C.rows.every(r => r.n >= 1 && r.avg >= 1 && r.avg <= 5 && ['FEW', 'LENIENT', 'STRICT', 'ALIGNED'].indexOf(r.tilt) >= 0), 'average 1–5 and a tilt for everyone');
// build a clear case: on 4 shared interviews one evaluator gives 5, the other 2
fresh();
const users = ctx.all_('USERS').filter(u => u.Status === 'Active').slice(0, 2).map(u => u.User_ID);
const ivs = ctx.all_('INTERVIEWS').filter(i => i.Kind !== 'ASSESSMENT').slice(0, 4);
const comps = r => JSON.stringify({ comps: [{ c: 'X1', r: String(r), n: 'دليل' }, { c: 'X2', r: String(r), n: 'دليل' }], reqs: [], qs: [] });
ivs.forEach(iv => {
  ctx.update_('INTERVIEWS', iv.Interview_ID, { Date: ctx.today_() }, 'x');
  ctx.find_('EVALUATIONS', { Interview_ID: iv.Interview_ID }).forEach(e => ctx.update_('EVALUATIONS', e.Evaluation_ID, { Status: 'DRAFT' }, 'x'));
  users.forEach((u, k) => ctx.insert_('EVALUATIONS', { Evaluation_ID: 'EVT-' + iv.Interview_ID + '-' + k, Interview_ID: iv.Interview_ID, Application_ID: iv.Application_ID, Evaluator_ID: u, Panel_Role: 'MEMBER', Version: '1', Status: 'SUBMITTED',
    Data_JSON: comps(k ? 2 : 5), Recommendation: k ? 'DO_NOT_PROCEED' : 'STRONG_PROCEED', Submitted_At: ctx.nowIso_() }, 'x'));
});
fresh(); R = must(api('ins.run', T2.hr, { view: 'CALIB', period: 'year' }), 'calibration case');
const hi = R.calib.rows.find(r => r.user === users[0]), lo = R.calib.rows.find(r => r.user === users[1]);
ok(hi && hi.tilt === 'LENIENT' && hi.dev >= 1.5 && hi.apart >= 4, 'the one who always gives 5 reads as lenient: ' + (hi && hi.dev));
ok(lo && lo.tilt === 'STRICT' && lo.dev <= -1.5, 'the one who always gives 2 reads as strict: ' + (lo && lo.dev));
ok(R.calib.company.lenient >= 1 && R.calib.company.strict >= 1, 'company counts the outliers');
ok(hi.agree === null || (hi.agree >= 0 && hi.agree <= 100), 'agreement with what happened is a percentage');
ok(ctx.insCorr_([[1, 1], [2, 2], [3, 3], [4, 4]]) === 1 && ctx.insCorr_([[1, 4], [2, 3], [3, 2], [4, 1]]) === -1 && ctx.insCorr_([[1, 1]]) === null, 'correlation helper');
console.log('phase29: ' + pass + ' passed, ' + failN + ' failed');
