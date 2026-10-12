// v0.22.0: operational reports — six reports, filters, scope per role, no contact data, offer amounts for pay roles only,
// export recorded in the audit log, consultants view but do not export.
const { ctx, mails, fresh, vm, props } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
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
mails.length = 0;
const S0 = must(api('demo.status', tO, {}), 'status');
S0.stages.forEach(s => must(api('demo.seed', tO, { stage: s.key }), 'seed ' + s.key));
const S = must(api('demo.status', tO, {}), 'status after');
const asUser = re => { const u = S.users.find(x => x.roles.some(r => re.test(r))); return u ? must(api('demo.as', tO, { User_ID: u.id }), 'try as ' + u.id).token : null; };
const tRec = asUser(/^أخصائي توظيف$/), tHrDemo = asUser(/^مدير الموارد البشرية$/);
const mgr = S.users.find(x => !x.roles.length);
const tMgr = mgr ? must(api('demo.as', tO, { User_ID: mgr.id }), 'try as a manager').token : null;
ok(tRec && tHrDemo && tMgr, 'demo recruiter, HR manager and a plain manager found');

// an ad (the demo data has none)
fresh(); const openVac = ctx.all_('VACANCIES').find(v => ['OPEN', 'PARTIALLY_FILLED'].indexOf(v.Status) >= 0);
const srcs = must(api('ad.list', tO, { Vacancy_ID: openVac.Vacancy_ID }), 'ad sources').sources;
must(api('ad.create', tO, { Vacancy_ID: openVac.Vacancy_ID, Source_Code: srcs.find(x => !x.usesCredits).code, Language: 'ar', Campaign: 'تجربة' }), 'ad');

const run = (t, p) => api('report.run', t, p);
const TYPES = ['REQUESTS', 'VACANCIES', 'CANDIDATES', 'ADS', 'OFFERS', 'JOINERS'];
const R = {};
TYPES.forEach(ty => { R[ty] = must(run(tO, { type: ty }), 'owner runs ' + ty); ok(R[ty].rows.length > 0, ty + ' has rows (' + (R[ty].rows.length) + ')'); });

// every row carries every column, and the counts per status add up
TYPES.forEach(ty => {
  const X = R[ty];
  ok(X.rows.every(r => X.columns.every(c => c.k in r)), ty + ': all columns present');
  ok(X.statuses.reduce((s, x) => s + x.n, 0) === X.total, ty + ': status counts = total');
});
// no contact data anywhere
const banned = /mobile|phone|email|national|موبايل|تليفون|إيميل|الرقم القومي/i;
ok(TYPES.every(ty => R[ty].columns.every(c => !banned.test(c.k) && !banned.test(c.l))), 'no contact or ID columns');
fresh(); const anyMobile = ctx.all_('PERSONS').map(p => p.Mobile).filter(Boolean)[0];
ok(!anyMobile || !JSON.stringify(R.CANDIDATES.rows).includes(anyMobile), 'candidate mobiles never in the report');

// filters
const st = R.REQUESTS.statuses[0].name;
const F = must(run(tO, { type: 'REQUESTS', status: st }), 'status filter');
ok(F.rows.length === R.REQUESTS.statuses[0].n && F.rows.every(r => r.status === st), 'status filter: only ' + st);
ok(must(run(tO, { type: 'CANDIDATES', from: '2999-01-01' }), 'future').rows.length === 0, 'date from in the future → nothing');
ok(must(run(tO, { type: 'CANDIDATES', to: '2000-01-01' }), 'past').rows.length === 0, 'date to in the past → nothing');
const today = ctx.today_();
ok(must(run(tO, { type: 'CANDIDATES', from: today, to: today }), 'today').rows.length > 0, 'today\'s applications found');
const loc = R.VACANCIES.locations.find(l => R.VACANCIES.rows.some(r => r.location === l.name));
const FL = must(run(tO, { type: 'VACANCIES', location: loc.id }), 'location filter');
ok(FL.rows.length > 0 && FL.rows.every(r => r.location === loc.name), 'location filter');
const sec = R.VACANCIES.sectors.find(s => R.VACANCIES.rows.some(r => r.sector === s.name));
if (sec) { const FS = must(run(tO, { type: 'VACANCIES', sector: sec.id }), 'sector filter'); ok(FS.rows.length > 0 && FS.rows.every(r => r.sector === sec.name), 'sector filter'); }
bad(run(tO, { type: 'NOPE' }), /غير معروف/, 'unknown report');
bad(run(tO, { type: 'REQUESTS', from: '2026-05-01', to: '2026-01-01' }), /بعد/, 'from after to');
bad(run(tO, { type: 'REQUESTS', from: '01/05/2026' }), /التاريخ/, 'bad date');

// scope: a recruiter sees only the candidates of his own vacancies; a plain manager has no reports
const RC = must(run(tRec, { type: 'CANDIDATES' }), 'recruiter candidates');
ok(RC.rows.length > 0 && RC.rows.length <= R.CANDIDATES.rows.length, 'recruiter sees ' + RC.rows.length + ' of ' + R.CANDIDATES.rows.length);
bad(run(tMgr, { type: 'REQUESTS' }), /صلاحية/, 'manager without a recruitment role: no reports');
ok(must(api('me', tRec, {}), 'me').can.reports === true && must(api('me', tMgr, {}), 'me').can.reports === false, 'menu flag follows the role');

// offer amounts: pay roles only
ok(R.OFFERS.columns.some(c => c.k === 'pkg'), 'owner sees offer amounts');
const RO = must(run(tRec, { type: 'OFFERS' }), 'recruiter offers');
ok(!RO.columns.some(c => c.k === 'pkg' || c.k === 'agreed') && RO.rows.every(r => !('pkg' in r)), 'recruiter: no amounts');

// export: recorded; consultant views but cannot export
fresh(); const aBefore = ctx.all_('AUDIT_LOG').filter(a => a.Action === 'EXPORT' && a.Entity_Type === 'REPORT').length;
must(run(tO, { type: 'JOINERS', export: true }), 'export');
fresh(); ok(ctx.all_('AUDIT_LOG').filter(a => a.Action === 'EXPORT' && a.Entity_Type === 'REPORT').length === aBefore + 1, 'export audited');
const con = must(api('users.save', tO, { Email: 'consult@t.com', Full_Name_AR: 'استشاري', Access_Expires_At: ctx.addDaysYmd_(today, 30) }), 'consultant user');
must(api('users.setRoles', tO, { User_ID: con.User_ID, roles: [{ Role_Code: 'CONSULTANT' }], reason: 'x' }), 'consultant role');
const tC = login('consult@t.com');
must(api('nda.accept', tC, {}), 'nda');
const RCon = must(run(tC, { type: 'REQUESTS' }), 'consultant views a report');
ok(RCon.canExport === false, 'consultant: no export button');
bad(run(tC, { type: 'REQUESTS', export: true }), /للعرض فقط/, 'consultant cannot export');

// process map: settings for everyone, counts for the recruitment view only
const PM = must(api('process.map', tO, {}), 'process map (owner)');
ok(PM.cfg.OFFER_VALID_DAYS === 7 && PM.cfg.EVAL_SLA_HOURS === 24 && PM.cfg.NHV_DAYS === '7,30', 'live settings');
ok(PM.counts && PM.counts.vac > 0 && PM.counts.apply > 0 && PM.counts.offer > 0 && PM.counts.join >= 0, 'counts per step: ' + JSON.stringify(PM.counts));
fresh(); ok(PM.counts.vac === ctx.all_('VACANCIES').filter(v => ['APPROVED', 'PREPARATION', 'OPEN', 'ON_HOLD', 'PARTIALLY_FILLED'].indexOf(v.Status) >= 0).length, 'open vacancy count matches');
ok(must(api('process.map', tMgr, {}), 'process map (manager)').counts === null, 'a plain manager sees the steps, not the company counts');
ok(!!must(api('process.map', tC, {}), 'process map (consultant)').cfg, 'consultant can open it');

console.log(`phase24: ${pass} passed, ${failN} failed`);
if (failN) process.exit(1);
