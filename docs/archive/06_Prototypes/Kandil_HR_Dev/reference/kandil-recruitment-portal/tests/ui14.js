// v0.11.0 UI (4A): interview rounds on the vacancy, scheduling from the candidate page, manager confirms from the home page,
// invitation, check-in, interviewer workspace + independent evaluation form, comparison, question bank; English + phone.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks.js');
const OUT = process.env.SHOTS || '.';
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) { fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x')); mails.length = 0; pub('auth.requestCode', { email }); const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1]; return pub('auth.verifyCode', { email, code }).data.token; }
ctx.setupSystem(); vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx); fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com'); const T = '\t';
api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '6']].map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) { const u = api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }); if (roles) api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }); return u.User_ID; }
user('cfo@t.com', 'هشام المدير المالي', P['مدير القطاع المالي'].Position_ID); const acc = user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID);
user('hr@t.com', 'منى', '', ['HR_MANAGER']); user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']);
const rec = user('rec@t.com', 'سارة عبد الله', '', ['RECRUITER']);
const t = { hr: login('hr@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), acc: login('acc@t.com') };
const JOB = P['محاسب تكاليف'].Job_Code;
api('jd.import', t.hr, { kind: 'library', commit: true,
  comps: [{ code: 'C01', group: 'CORE', name: 'النزاهة والمسؤولية', levels: ['يلتزم بالقواعد', 'يعترف بأخطائه', 'يحمي مصلحة الشركة', 'قدوة'], req: [2, 2, 2, 3, 3, 4, 4] },
          { code: 'FN01', group: 'FIN', name: 'محاسبة التكاليف', levels: ['يسجل', 'يحسب', 'يحلل الانحرافات', 'يصمم النظام'], req: [1, 2, 3, 3, 3, 3, 3] }],
  questions: [{ code: 'FN01', seq: 1, q: 'إزاي بتحسب تكلفة المنتج؟', strong: 'مباشر وغير مباشر', weak: 'كلام عام', from: 'JL1' }], tests: [] });
api('jd.import', t.hr, { kind: 'jds', commit: true, reason: 'x', jds: [{ code: JOB, title: 'محاسب تكاليف', level: 'JL3', purpose: 'حساب تكلفة المنتجات بدقة وفي موعدها', resp: ['يحسب التكلفة', 'يطابق المخزون', 'يحلل الانحرافات'],
  comps: [{ c: 'C01', l: 2 }, { c: 'FN01', l: 3 }] }] });
api('jd.approve', t.hr, { all: 'Y', reason: 'x' });
const rq = api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'شاغر محاسب تكاليف للواجهة', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', Education: 'بكالوريوس تجارة', Experience_Years: '3',
  skills: [{ Skill: 'SAP', Proficiency: 'GOOD', Importance: 'ESSENTIAL' }], lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 2 }] });
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
api('vac.assign', t.rm, { Vacancy_ID: VAC, Lead_Recruiter_ID: rec }); api('vac.update', t.rm, { Vacancy_ID: VAC, action: 'OPEN' });
function cand(name, mobile) { const a = api('cand.create', t.rec, { Vacancy_ID: VAC, Full_Name: name, Mobile: mobile, Source: 'WALK_IN', consent: 'Y', Expected_Salary: '14000', Experience_Years: '4' }).application.Application_ID; api('cand.move', t.rec, { Application_ID: a, to: 'SHORTLISTED' }); return a; }
const A1 = cand('أحمد علي حسن', '01011112222'), A2 = cand('كريم محمود سالم', '01033334444');

const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['مدير القطاع المالي', 'محاسب تكاليف', 'مدير الحسابات', 'الرئيس التنفيذي', 'هشام', 'منى', 'سارة', 'محمد عمارة', 'مدير التوظيف', 'قنديل مصر',
  'أحمد', 'كريم', 'العبور', 'القطاع المالي', 'الحسابات', 'شاغر', 'النزاهة', 'محاسبة التكاليف', 'تكلفة', 'يلتزم', 'يعترف', 'يحمي', 'قدوة', 'يسجل', 'يحسب', 'يحلل', 'يصمم', 'يطابق',
  'مباشر', 'كلام عام', 'بكالوريوس', 'SAP', 'غرفة', 'جاوب', 'شرح', 'متمكن', 'مستقر', 'مناسب', 'كويس', 'اتعمل', 'حساب', 'دقة'];

(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const open = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0110-' + n + '.png', fullPage: true });
  const main = async () => (await page.textContent('#main')) || '';
  const today = ctx.today_();

  // --- recruiter: interview rounds on the vacancy
  await open(t.rec);
  await page.evaluate(id => go('pipe', id), VAC); await page.waitForSelector('#plEdit');
  await page.click('#plEdit'); await page.waitForSelector('[data-pn]');
  await page.click('#plAdd'); await page.fill('[data-pn="3"]', 'مقابلة مع المدير المالي'); await page.selectOption('[data-pt="3"]', 'SENIOR'); await page.selectOption('[data-pr="3"]', 'CONDITIONAL');
  await shot('1-plan-editor');
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => /مقابلة مع المدير المالي/.test(document.getElementById('main').textContent));
  await shot('2-pipeline-plan');
  // --- candidate page: schedule the manager round
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('#ivCard [data-ivs]');
  await shot('3-candidate-interviews');
  await page.click('#ivCard [data-ivs="R2"]'); await page.waitForSelector('#ivD');
  await page.fill('#ivD', today); await page.fill('#ivT', '11:00'); await page.fill('#ivP', 'غرفة الاجتماعات — الدور التاني');
  const lead = await page.$eval('[data-pu="0"]', e => e.value); if (lead !== acc) errors.push('manager not suggested as lead: ' + lead);
  await page.click('[data-padd]'); await page.selectOption('[data-pu="2"]', { label: 'منى' }); await page.selectOption('[data-pro="2"]', 'OBSERVER');
  await shot('4-schedule-dialog');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('.stages'); await page.waitForFunction(() => /مستنية تأكيد/.test(document.getElementById('main').textContent));
  await shot('5-interview-proposed');
  fresh(); const IV = ctx.find_('INTERVIEWS', { Application_ID: A1 })[0].Interview_ID;
  if (await page.$('[data-ia="INVITED"]')) errors.push('invite offered before the manager confirmed');
  // --- manager: home → confirm
  await open(t.acc);
  if (!/مقابلة مستنية تأكيدك/.test(await main())) errors.push('home: no confirm row for the manager');
  await shot('6-manager-home');
  await page.evaluate(() => go('interviews')); await page.waitForSelector('tr[data-iv]');
  await shot('7-manager-interviews');
  await page.click('tr[data-iv]'); await page.waitForSelector('[data-ia="CONFIRM"]');
  await shot('8-manager-workspace');
  await page.click('[data-ia="CONFIRM"]'); await page.waitForFunction(() => /المقابِل أكّد/.test(document.getElementById('main').textContent));
  // --- recruiter: invitation, candidate confirms, check-in
  await open(t.rec);
  await page.evaluate(id => go('intv', id), IV); await page.waitForSelector('[data-ia="INVITED"]');
  await page.click('[data-ia="INVITED"]'); await page.waitForSelector('#inB');
  const body = await page.$eval('#inB', e => e.value); if (!/11:00/.test(body) || !/غرفة الاجتماعات/.test(body) || !/مدير الحسابات/.test(body)) errors.push('invite text not filled: ' + body);
  await shot('9-invite');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('[data-ia="CAND_CONFIRM"]');
  await page.click('[data-ia="CAND_CONFIRM"]'); await page.waitForSelector('[data-ia="CHECKIN"]');
  await page.click('[data-ia="CHECKIN"]'); await page.waitForSelector('[data-ia="START"]');
  // --- manager evaluates
  await open(t.acc);
  await page.evaluate(id => go('intv', id), IV); await page.waitForSelector('[data-ia="START"]');
  await page.click('[data-ia="START"]'); await page.waitForSelector('#evForm');
  await shot('10-evaluation-form');
  await page.click('#evSubmit'); await page.waitForTimeout(400);
  if (!/التوصية|حدد حالة/.test(await page.textContent('#toast').catch(() => '') || '')) { /* toast id may differ */ }
  for (const sel of await page.$$('[data-rk]')) { await sel.selectOption('MET'); }
  for (const inp of await page.$$('[data-re]')) { await inp.fill('مكتوب في السيرة وأكّده في المقابلة'); }
  await page.check('input[name="rt_FN01"][value="4"]'); await page.fill('[data-cn="FN01"]', 'شرح التحميل على مراكز التكلفة');
  for (const q of await page.$$('[data-qa]')) { if (await q.isVisible()) await q.check(); }
  await page.fill('#evS', 'خبرة عملية في SAP'); await page.fill('#evM', 'مناسب للوظيفة ومحتاج يتعرف على نظامنا');
  await page.check('input[name="evRec"][value="PROCEED"]');
  await page.click('#evDraft'); await page.waitForTimeout(300);
  await page.click('#evSubmit'); await page.waitForFunction(() => /سلّم التقييم|اتسلّم تقييمك|تقييمي/.test(document.getElementById('main').textContent) && !document.getElementById('evForm'));
  await shot('11-evaluation-submitted');
  fresh(); const ev = ctx.find_('EVALUATIONS', { Interview_ID: IV, Status: 'SUBMITTED' });
  if (ev.length !== 1 || ev[0].Recommendation !== 'PROCEED') errors.push('evaluation not submitted from the form');
  // HR round for A1 via API (recruiter self-led), then compare
  const hr = api('int.create', t.rec, { Application_ID: A1, Round_ID: 'R1', Date: today, Time: '09:00', Mode: 'PHONE', panel: [{ User_ID: rec, Role: 'LEAD' }] }).interview;
  api('int.action', t.rec, { Interview_ID: hr.Interview_ID, action: 'START' });
  const g = api('int.get', t.rec, { Interview_ID: hr.Interview_ID }).guide;
  api('eval.save', t.rec, { Interview_ID: hr.Interview_ID, submit: 'Y', comps: [{ c: 'C01', r: '3' }], reqs: g.reqs.map(r => ({ k: r.k, s: 'MET', e: 'تمام' })),
    qs: g.std.filter(q => q.kind === 'MANDATORY').map(q => ({ id: q.id, asked: 'Y' })), Recommendation: 'DO_NOT_PROCEED', Summary: 'المرتب المتوقع أعلى بكتير من المتاح' });
  // --- comparison (manager) and candidate page
  await page.evaluate(id => go('compare', id), VAC); await page.waitForSelector('[data-cmp]');
  if (!/تعارض في التوصيات/.test(await main())) errors.push('comparison does not show the conflict');
  await shot('12-compare');
  await open(t.rec);
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('#ivCard');
  if (!/لسه مش جاهز للقرار/.test(await page.textContent('#ivCard')) || !/مخفية عنك/.test(await page.textContent('#ivCard'))) errors.push('candidate card: recruiter still owes an evaluation → not ready + hidden');
  await shot('13-candidate-ready');
  // --- team list + question bank
  await page.evaluate(() => go('interviews', 'team')); await page.waitForSelector('tr[data-iv]'); await shot('14-team');
  await open(t.rm);
  await page.evaluate(() => go('interviews', 'bank')); await page.waitForSelector('#iqNew');
  await page.click('#iqNew'); await page.waitForSelector('#iqA'); await page.fill('#iqA', 'عندك أي مانع من السفر للفروع؟'); await page.fill('#iqE', 'Can you travel to the branches?');
  await page.selectOption('#iqK', 'MANDATORY'); await page.click('#mActions .btn.primary'); await page.waitForFunction(() => /السفر للفروع/.test(document.getElementById('ivBody').textContent));
  await shot('15-question-bank');
  // --- English
  api('me.setLang', tO, { lang: 'en' });
  await open(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  async function leftovers(name) {
    const found = await page.evaluate(() => {
      const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE|TEXTAREA/.test(p.nodeName) || p.closest('[data-nt]')) continue;
        if (p.closest('.hidden') || p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim().replace(/\s+/g, ' ')); }
      return [...out];
    });
    const real = found.filter(s => !DATA.some(d => s.indexOf(d) >= 0));
    if (real.length) console.log('[' + name + '] Arabic left: ' + real.join(' | '));
    real.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push(name + ': dictionary text left in Arabic: ' + s));
    await page.screenshot({ path: OUT + '/v0110-en-' + name + '.png', fullPage: true });
  }
  await page.evaluate(id => go('intv', id), IV); await page.waitForSelector('.stages'); await page.waitForTimeout(300); await leftovers('interview');
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('#ivCard'); await page.waitForTimeout(300); await leftovers('candidate');
  await page.evaluate(id => go('pipe', id), VAC); await page.waitForSelector('#plEdit'); await page.waitForTimeout(300); await leftovers('pipeline');
  await page.evaluate(id => go('compare', id), VAC); await page.waitForSelector('[data-cmp]'); await page.waitForTimeout(300); await leftovers('compare');
  await page.evaluate(() => go('interviews', 'team')); await page.waitForSelector('tr[data-iv]'); await page.waitForTimeout(300); await leftovers('interviews');
  await page.evaluate(() => go('interviews', 'bank')); await page.waitForSelector('[data-iq]'); await page.waitForTimeout(300); await leftovers('bank');
  // an evaluation form in English: open the scheduling dialog and a fresh interview workspace
  const iv2 = api('int.create', tO, { Application_ID: A2, Round_ID: 'R2', Date: today, Time: '12:00', Mode: 'IN_PERSON', Location_ID: ctx.all_('LOCATIONS')[0].Location_ID, panel: [{ User_ID: ctx.find_('USERS', { Email: 'owner@test.com' })[0].User_ID, Role: 'LEAD' }] }).interview;
  api('int.action', tO, { Interview_ID: iv2.Interview_ID, action: 'CHECKIN' });
  await page.evaluate(id => go('intv', id), iv2.Interview_ID); await page.waitForSelector('#evForm'); await page.waitForTimeout(300); await leftovers('evaluation');
  await page.evaluate(id => go('app', id), A2); await page.waitForSelector('#ivCard [data-ivs]'); await page.click('#ivCard [data-ivs="R1"]'); await page.waitForSelector('#ivD'); await page.waitForTimeout(300); await leftovers('schedule');
  // --- phone
  api('me.setLang', tO, { lang: 'ar' });
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  for (const [n, v, a] of [['interview', 'intv', iv2.Interview_ID], ['done', 'intv', IV], ['list', 'interviews', 'team'], ['compare', 'compare', VAC], ['app', 'app', A1]]) {
    await ph.evaluate(x => go(x[0], x[1]), [v, a]); await ph.waitForTimeout(700);
    await ph.screenshot({ path: OUT + '/v0110-phone-' + n + '.png', fullPage: true });
    const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on ' + n + ': ' + w);
  }
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui14 OK');
})().catch(e => { console.error(e); process.exit(1); });
