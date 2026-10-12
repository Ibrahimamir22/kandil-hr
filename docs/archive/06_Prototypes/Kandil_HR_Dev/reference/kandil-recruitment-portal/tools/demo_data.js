// Demo data for the documentation tools (forms book, print book, admin guide): the same mocks the tests use, a small
// real-looking structure, one approved JD, and every demo stage seeded. require() it once; it returns the ids to open.
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('../tests/mocks.js');
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}

// ---------- demo data on a small real-looking structure ----------
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com'); const T = '\t';
const rows = [['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', '']];
const SECT = { 'القطاع المالي': { 'الحسابات': [['محاسب تكاليف', 4], ['محاسب عام', 3]], 'الخزينة': [['أمين خزينة', 2], ['محصل', 3]] },
  'قطاع المصانع': { 'الإنتاج': [['فني تشغيل', 6], ['مشرف إنتاج', 2], ['عامل تعبئة', 5]], 'الجودة': [['مراقب جودة', 3], ['فني معمل', 2]] },
  'القطاع التجاري': { 'المعارض': [['مندوب مبيعات', 8], ['مدير معرض', 2]] } };
for (const [s, depts] of Object.entries(SECT)) {
  rows.push(['قنديل مصر', s, '', '', '', '', 'مدير ' + s, 'العبور', '', 'Y', '', '']);
  for (const [d, jobs] of Object.entries(depts)) {
    rows.push(['قنديل مصر', s, d, '', '', '', 'مدير ' + d, 'العبور', '', 'Y', '', '']);
    for (const [j, n] of jobs) rows.push(['قنديل مصر', s, d, '', '', '', j, 'العبور', '', '', '', String(n)]);
  }
}
api('import.commit', tO, { reason: 'تحميل الهيكل', text: rows.map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x'); ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, 'x');
Object.values(P).forEach(p => ctx.update_('JOBS', p.Job_Code, { Grade_Code: /مدير|الرئيس/.test(ctx.get_('JOBS', p.Job_Code).Job_Title_AR) ? '9' : '6' }, 'x'));
{ api('jd.import', tO, { kind: 'library', commit: true, reason: 'مكتبة الكفاءات',
    comps: [{ code: 'C01', group: 'CORE', name: 'النزاهة والمسؤولية', levels: ['يلتزم بالتعليمات', 'يتحمل مسؤولية شغله', 'قدوة في الالتزام', 'يبني ثقافة النزاهة'], req: [2, 2, 2, 3, 3, 4, 4] },
      { code: 'LD01', group: 'LEAD', name: 'العمل الجماعي', levels: ['يتعاون لما يتطلب منه', 'يساعد زمايله', 'يقود عمل الفريق', 'يبني فرق قوية'], req: [1, 1, 1, 2, 2, 3, 4] },
      { code: 'PR02', group: 'PRD', name: 'الدقة والإتقان', levels: ['يراجع شغله', 'شغله دقيق باستمرار', 'يطور طرق المراجعة', 'مرجع في الدقة'], req: [1, 2, 3, 3, 3, 3, 3] }],
    questions: [{ code: 'C01', seq: 1, q: 'احكي عن غلطة عملتها في الشغل وعملت إيه بعدها', strong: 'اعترف وصلّح وعلّم غيره', weak: 'برّر ورمى اللوم', from: 'JL1' },
      { code: 'LD01', seq: 1, q: 'احكي عن مرة ساعدت فيها زميل يخلص شغل متأخر', strong: 'مثال محدد ونتيجة', weak: 'كلام عام', from: 'JL1' },
      { code: 'PR02', seq: 1, q: 'إزاي بتراجع تقرير قبل ما تسلمه؟', strong: 'خطوات واضحة', weak: 'مفيش طريقة', from: 'JL1' }],
    tests: [{ code: 'PR02', name: 'حساب تكلفة أمر تشغيل', how: 'حالة عملية على الورق', duration: 'ساعة', pass: 'الفرق أقل من 2%', owner: 'مدير الحسابات' }] });
  const jd = { code: P['محاسب تكاليف'].Job_Code, title: 'محاسب تكاليف', level: 'JL3', purpose: 'حساب تكلفة المنتجات بدقة وفي موعدها لدعم قرارات التسعير',
    resp: ['يحسب تكلفة أوامر التشغيل', 'يطابق المخزون مع الحسابات', 'يجهز تقرير التكاليف الشهري', 'يحلل الانحرافات عن التكلفة المعيارية'],
    kpis: [['دقة تقارير التكلفة', 'الأخطاء ÷ التقارير', 'شهري'], ['الالتزام بمواعيد الإقفال', 'أيام التأخير', 'شهري']], auth: [['تسوية فروق صغيرة في المخزون', 'يوصي']],
    comps: [{ c: 'C01', l: 2, m: '' }, { c: 'LD01', l: 1, m: '' }, { c: 'PR02', l: 3, m: '' }], edu: 'بكالوريوس تجارة', exp: 'سنتين في التكاليف', test: 'حساب تكلفة أمر تشغيل' };
  if (process.env.IDS_ONLY) console.log(JSON.stringify(api('jd.import', tO, { kind: 'jds', jds: [jd] }).errors));
  api('jd.import', tO, { kind: 'jds', jds: [jd], commit: true, reason: 'وصف للكتيّب' }); api('jd.approve', tO, { all: 'Y', reason: 'اعتماد' }); }
api('demo.status', tO, {}).stages.forEach(s => api('demo.seed', tO, { stage: s.key }));
fresh();
const first = (t, f) => { const r = ctx.all_(t).filter(f || (() => true)); return r[0] || null; };
const idOf = r => r ? Object.values(r)[0] : null;
const ID = {
  req: idOf(first('RECRUITMENT_REQUESTS')), vac: idOf(first('VACANCIES')), app: idOf(first('APPLICATIONS')),
  iv: idOf(first('INTERVIEWS')), offer: idOf(first('OFFERS')), join: idOf(first('JOININGS')), onb: idOf(first('ONBOARDINGS')),
  trf: idOf(first('TRANSFER_REQUESTS')), pcr: idOf(first('POSITION_CHANGE_REQUESTS')), job: P['محاسب تكاليف'].Job_Code,
  emp: idOf(first('EMPLOYEES')), unit: P['محاسب تكاليف'].Org_Unit_ID, pos: P['محاسب تكاليف'].Position_ID
};
const byCol = (t, col) => { const m = {}; ctx.all_(t).forEach(r => { const k = r[col]; if (k && !m[k]) m[k] = idOf(r); }); return m; };
ID.appBy = byCol('APPLICATIONS', 'Stage'); ID.reqBy = byCol('RECRUITMENT_REQUESTS', 'Status'); ID.offerBy = byCol('OFFERS', 'Status');
ID.joinBy = byCol('JOININGS', 'Status'); ID.trfBy = byCol('TRANSFER_REQUESTS', 'Status'); ID.ivBy = byCol('INTERVIEWS', 'Status');
ID.nhvBy = byCol('NHV_SURVEYS', 'Status'); ID.onbBy = byCol('ONBOARDINGS', 'Status'); ID.insBy = byCol('INSURANCE_CASES', 'Status');
ID.offerApp = {}; ctx.all_('OFFERS').forEach(o => { if (!ID.offerApp[o.Status]) ID.offerApp[o.Status] = o.Application_ID; });
ID.joinApp = {}; ctx.all_('JOININGS').forEach(j => { if (!ID.joinApp[j.Status]) ID.joinApp[j.Status] = j.Application_ID; });
ID.recruiter = (ctx.all_('VACANCIES').find(v => v.Lead_Recruiter_ID) || {}).Lead_Recruiter_ID;
ID.panel = {}; ctx.all_('INTERVIEW_PANEL').forEach(p => { if (!ID.panel[p.Interview_ID]) ID.panel[p.Interview_ID] = p.User_ID; });
// probations: by day of the period; the earliest one moved to day 76 so its reviews and final evaluation are open
const PB = {}; ctx.all_('PROBATIONS').forEach(p => { PB[ctx.daysBetween_(p.Start_Date, ctx.today_())] = p.Probation_ID; });
ID.prob = { early: PB[12], mid: PB[40], pip: PB[55], dec: PB[77], conf: PB[79] };
if (ID.prob.early) {
  const st = ctx.addDaysYmd_(ctx.today_(), -75);
  ctx.update_('PROBATIONS', ID.prob.early, { Start_Date: st, End_Date: ctx.addDaysYmd_(st, 89), Decision_Due: ctx.addDaysYmd_(st, 79) }, 'x');
  ctx.find_('PROB_REVIEWS', { Probation_ID: ID.prob.early }).forEach(r => ctx.update_('PROB_REVIEWS', r.Review_ID, { Due_Date: ctx.addDaysYmd_(st, { D30: 29, D60: 59, FINAL: 74, SELF: 74, STAY: 59 }[r.Kind]) }, 'x'));
  fresh();
}
const me = ctx.all_('USERS').filter(u => u.Email === 'owner@test.com')[0].User_ID;
ID.trfMine = idOf(ctx.all_('TRANSFER_REQUESTS').filter(t => t.Status === 'PENDING' && JSON.parse(t.Steps_JSON || '[]').some(x => x.step === t.Current_Step && (x.users || []).indexOf(me) >= 0))[0]);
if (process.env.IDS) console.log('ids', JSON.stringify(ID));

// ---------- the portal page in a browser ----------
const SRC = n => fs.readFileSync(path.join(__dirname, '..', 'src', n), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = SRC('Index.html').replace("<?!= include_('QrLib') ?>", SRC('QrLib.html')).replace('<script>', shim + '<script>');
const asUser = (html, token) => html.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(token) + ' || loadToken();');
// the portal's fonts (Google Fonts) fetched once with curl, which trusts this machine's certificates, and served from a cache
const FONT_DIR = path.join(require('os').tmpdir(), 'portal-fonts');
function fontFile(url) {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const f = path.join(FONT_DIR, require('crypto').createHash('md5').update(url).digest('hex'));
  if (!fs.existsSync(f)) require('child_process').execFileSync('curl', ['-sSfL', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36', '-o', f, url]);
  return fs.readFileSync(f);
}
async function browserCtx(chromium, opts) {
  const browser = await chromium.launch();
  const bctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }, opts || {}));
  await bctx.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await bctx.route('**/cdnjs.cloudflare.com/**', r => r.abort());
  await bctx.route(/fonts\.(googleapis|gstatic)\.com/, r => {
    const u = r.request().url();
    try { r.fulfill({ status: 200, body: fontFile(u), contentType: /googleapis/.test(u) ? 'text/css' : 'font/woff2', headers: { 'access-control-allow-origin': '*' } }); }
    catch (e) { r.abort(); }
  });
  return { browser, bctx };
}

module.exports = { ctx, mails, fresh, vm, pub, api, login, tO, ID, P, me, SRC, shim, idx, asUser, browserCtx };
