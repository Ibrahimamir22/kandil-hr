// v0.12.0 UI (4B): round templates, assessment rounds in the plan, safety checklist, assessment result form with evidence,
// failed-test flag on the candidate card + comparison, reconfirmation, interviewer analytics; English + phone.
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
  ['قنديل مصر', 'قطاع الإنتاج', '', '', '', '', 'مدير قطاع الإنتاج', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع الإنتاج', 'مصنع الإضاءة', '', '', '', 'مدير المصنع', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع الإنتاج', 'مصنع الإضاءة', '', '', '', 'فني تجميع', 'العبور', '', '', '', '9']].map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) { const u = api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }); if (roles) api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }); return u.User_ID; }
const mgr = user('mgr@t.com', 'مدير المصنع', P['مدير المصنع'].Position_ID); user('hr@t.com', 'منى', '', ['HR_MANAGER']); user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']);
const rec = user('rec@t.com', 'سارة عبد الله', '', ['RECRUITER']); const sup = user('sup@t.com', 'مشرف التجميع', '');
const t = { hr: login('hr@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), mgr: login('mgr@t.com'), sup: login('sup@t.com') };
const JOB = P['فني تجميع'].Job_Code;
fresh(); ctx.update_('JOBS', JOB, { Job_Family: 'PRD' }, 'x'); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
api('jd.import', t.hr, { kind: 'library', commit: true,
  comps: [{ code: 'C01', group: 'CORE', name: 'الالتزام', levels: ['يلتزم', 'يلتزم دايماً', 'يساعد غيره', 'قدوة'], req: [2, 2, 2, 3, 3, 4, 4] },
          { code: 'PR01', group: 'PRD', name: 'قراءة الرسومات', levels: ['يقرا', 'يفهم', 'يشرح', 'يصمم'], req: [2, 2, 3, 3, 3, 3, 3] },
          { code: 'PR02', group: 'PRD', name: 'إتقان الحرفة', levels: ['ينفذ', 'يتقن', 'يطور', 'يعلّم'], req: [2, 2, 3, 3, 3, 3, 3] }],
  questions: [], tests: [{ code: 'PR01', name: 'قراءة رسم تنفيذي', how: 'يشرح رسمة وحدة إضاءة', duration: '15 دقيقة', pass: 'يحدد المقاسات صح', owner: 'مشرف القسم' }] });
api('jd.import', t.hr, { kind: 'jds', commit: true, reason: 'x', jds: [{ code: JOB, title: 'فني تجميع', level: 'JL2', purpose: 'تجميع وحدات الإضاءة بجودة', resp: ['يجمع', 'يختبر', 'ينظف'],
  comps: [{ c: 'C01', l: 2 }, { c: 'PR01', l: 2 }, { c: 'PR02', l: 3 }], test: 'تجميع وحدة إضاءة كاملة في ساعة' }] });
api('jd.approve', t.hr, { all: 'Y', reason: 'x' });
const rq = api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'شاغر فني تجميع للواجهة', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['فني تجميع'].Position_ID, Requested_HC: 2 }] });
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
api('vac.assign', t.rm, { Vacancy_ID: VAC, Lead_Recruiter_ID: rec }); api('vac.update', t.rm, { Vacancy_ID: VAC, action: 'OPEN' });
function cand(name, mobile) { const a = api('cand.create', t.rec, { Vacancy_ID: VAC, Full_Name: name, Mobile: mobile, Source: 'WALK_IN', consent: 'Y', Experience_Years: '4' }).application.Application_ID; api('cand.move', t.rec, { Application_ID: a, to: 'SHORTLISTED' }); return a; }
const A1 = cand('أحمد علي حسن', '01011112222'), A2 = cand('كريم محمود سالم', '01033334444');
fresh(); const LOC = ctx.all_('LOCATIONS')[0].Location_ID, today = ctx.today_(), tmr = ctx.tomorrow_();

const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['مدير المصنع', 'فني تجميع', 'الرئيس التنفيذي', 'منى', 'سارة', 'محمد عمارة', 'مدير التوظيف', 'قنديل مصر', 'مشرف', 'أحمد', 'كريم', 'العبور', 'قطاع الإنتاج', 'مصنع الإضاءة',
  'الالتزام', 'قراءة', 'إتقان الحرفة', 'تجميع', 'يشرح رسمة', 'المقاسات', '15 دقيقة', 'الورشة', 'التوصيلات', 'الوحدة', 'سرعة', 'خلّص', 'شاغر', 'مقابلة HR', 'اختبار عملي في الورشة', 'مقابلة مدير',
  'الإنتاج', 'قرا', 'الرسمة', 'ساعتين', 'sheet', 'يلتزم', 'يقرا', 'ينفذ'];

(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const open = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0120-' + n + '.png', fullPage: true });
  const main = async () => (await page.textContent('#main')) || '';

  // --- recruitment manager: a round template for the production family
  await open(t.rm);
  await page.evaluate(() => go('interviews', 'templates')); await page.waitForSelector('#rtNew');
  await page.click('#rtNew'); await page.waitForSelector('[data-pn="1"]');
  if (await page.$eval('[data-pt="1"]', e => e.value) !== 'PRACTICAL' || !(await page.isChecked('[data-psf="1"]'))) errors.push('new template: practical test with safety by default');
  await page.selectOption('#rtF', 'PRD'); await page.fill('[data-pn="0"]', 'مقابلة HR سريعة'); await page.fill('[data-pn="1"]', 'اختبار عملي في الورشة'); await page.fill('[data-pn="2"]', 'مقابلة مدير المصنع');
  await page.check('[data-pc="2"]');
  await shot('1-template-form');
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => /اختبار عملي في الورشة/.test(document.getElementById('ivBody').textContent));
  await shot('2-templates');
  fresh(); const tpl = ctx.all_('ROUND_TEMPLATES')[0]; if (!tpl || tpl.Scope_Value !== 'PRD' || JSON.parse(tpl.Rounds_JSON)[2].reconfirm !== 'Y') errors.push('template not saved from the form');
  // analytics tab
  await page.evaluate(() => go('interviews', 'analytics')); await page.waitForSelector('#anOut .msg, #anOut table'); await shot('3-analytics');

  // --- recruiter: vacancy follows the template; schedule the practical test
  await open(t.rec);
  await page.evaluate(id => go('pipe', id), VAC); await page.waitForSelector('#plEdit');
  if (!/اختبار عملي في الورشة/.test(await main())) errors.push('pipeline plan does not show the template rounds');
  await page.click('#plEdit'); await page.waitForSelector('[data-psf="1"]');
  if (!(await page.isVisible('[data-psf="1"]')) || await page.isVisible('[data-psw="0"]')) errors.push('safety option only on assessment rounds');
  await shot('4-plan-editor'); await page.click('#mClose').catch(() => page.keyboard.press('Escape'));
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('#ivCard [data-ivs="R2"]');
  if (!/حدد معاد الاختبار/.test(await page.textContent('#ivCard'))) errors.push('card: test round button');
  await page.click('#ivCard [data-ivs="R2"]'); await page.waitForSelector('#ivD');
  if (!/اختبار جديد/.test(await page.textContent('.modal, #modal, body'))) errors.push('schedule dialog title for a test');
  await page.fill('#ivD', today); await page.fill('#ivT', '10:00'); await page.fill('#ivP', 'الورشة');
  await page.selectOption('[data-pu="0"]', { label: 'مشرف التجميع' }); await page.selectOption('[data-pro="0"]', 'LEAD');
  for (let i = 1; await page.$('[data-pdel="1"]') && i < 5; i++) await page.click('[data-pdel="1"]');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('.stages');
  fresh(); const IV = ctx.find_('INTERVIEWS', { Application_ID: A1, Round_ID: 'R2' })[0];
  if (!IV || IV.Kind !== 'ASSESSMENT' || IV.Safety_Required !== 'Y') errors.push('test not created as an assessment with safety');
  api('int.action', t.sup, { Interview_ID: IV.Interview_ID, action: 'CONFIRM' });
  api('int.action', t.rec, { Interview_ID: IV.Interview_ID, action: 'INVITED', channel: 'CALL' });
  api('int.action', t.rec, { Interview_ID: IV.Interview_ID, action: 'CAND_CONFIRM' }); api('int.action', t.rec, { Interview_ID: IV.Interview_ID, action: 'CHECKIN' });

  // --- assessor: safety checklist, then the result form
  await open(t.sup);
  await page.evaluate(id => go('intv', id), IV.Interview_ID); await page.waitForSelector('[data-ia="START"]');
  if (!/السلامة الأول/.test(await main()) || !/ابدأ الاختبار/.test(await page.textContent('[data-ia="START"]'))) errors.push('assessment page: safety alert + start label');
  if (!/يحدد المقاسات صح/.test(await main())) errors.push('assessment guide shows the pass criteria');
  await shot('5-assessment-before');
  await page.click('[data-ia="START"]'); await page.waitForSelector('[data-sf]');
  await shot('6-safety');
  await page.check('[data-sf="BRIEF"]'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(300);
  if (!/كل بنود السلامة/.test(await page.textContent('#mMsg'))) errors.push('safety: all items required');
  await page.check('[data-sf="PPE"]'); await page.check('[data-sf="SUPERVISOR"]'); await page.click('#mActions .btn.primary');
  await page.waitForSelector('#asForm');
  fresh(); if (!ctx.get_('INTERVIEWS', IV.Interview_ID).Safety_JSON) errors.push('safety not recorded');
  await page.check('input[name="cr_PR01"][value="PASS"]'); await page.fill('[data-crn="PR01"]', 'قرا الرسمة صح');
  await page.check('input[name="cr_PR02"][value="FAIL"]'); await page.fill('[data-crn="PR02"]', 'التوصيلات غلط والوحدة ماشتغلتش');
  await page.click('#asAddC'); await page.fill('[data-acq="0"]', 'سرعة الشغل'); await page.selectOption('[data-acr="0"]', 'FAIL'); await page.fill('[data-acn="0"]', 'خلّص في ساعتين');
  await page.fill('#asScore', '45');
  await page.setInputFiles('#asUp', { name: 'sheet.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await page.click('#asDraft'); await page.waitForSelector('#asFiles [data-evf]');
  await page.check('input[name="asRes"][value="FAIL"]'); await page.fill('#asSum', 'الوحدة ماشتغلتش بعد التجميع والوقت ضعف المطلوب');
  await shot('7-assessment-form');
  await page.click('#asSubmit'); await page.waitForFunction(() => !document.getElementById('asForm') && /راسب/.test(document.getElementById('main').textContent));
  await shot('8-assessment-submitted');
  fresh(); const ev = ctx.find_('EVALUATIONS', { Interview_ID: IV.Interview_ID, Status: 'SUBMITTED' })[0];
  const dd = ev ? JSON.parse(ev.Data_JSON) : {};
  if (!ev || ev.Recommendation !== 'FAIL' || dd.score !== '45' || (dd.files || []).length !== 1 || (dd.added || []).length !== 1 || dd.crit.length !== 2) errors.push('assessment result not saved from the form: ' + (ev && ev.Data_JSON));

  // --- recruiter: candidate card + comparison + evidence file
  await open(t.rec);
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('#ivCard');
  const card = await page.textContent('#ivCard');
  if (!/راسب في اختبار — محتاج قرار/.test(card) || !/45\/100/.test(card)) errors.push('card: failed test flag + score: ' + card.slice(0, 300));
  await shot('9-candidate-failed');
  await page.evaluate(id => go('intv', id), IV.Interview_ID); await page.waitForSelector('[data-evf]');
  await page.click('[data-evf]'); await page.waitForTimeout(300);
  await page.evaluate(id => go('compare', id), VAC); await page.waitForSelector('[data-cmp]');
  if (!/الاختبارات/.test(await main()) || !/راسب في اختبار/.test(await main())) errors.push('comparison: tests column + failed flag');
  await shot('10-compare');

  // --- reconfirmation of the manager round (reconfirm = Y in the template)
  const iv3 = api('int.create', t.rec, { Application_ID: A2, Round_ID: 'R3', Date: tmr, Time: '11:00', Mode: 'IN_PERSON', Location_ID: LOC, panel: [{ User_ID: mgr, Role: 'LEAD' }] }).interview;
  api('int.action', t.mgr, { Interview_ID: iv3.Interview_ID, action: 'CONFIRM' }); api('int.action', t.rec, { Interview_ID: iv3.Interview_ID, action: 'INVITED', channel: 'CALL' });
  api('int.action', t.rec, { Interview_ID: iv3.Interview_ID, action: 'CAND_CONFIRM' });
  await open(t.rec);
  if (!/محتاج تأكيد تاني من المرشح/.test(await main())) errors.push('home: reconfirm row');
  await page.evaluate(id => go('intv', id), iv3.Interview_ID); await page.waitForSelector('[data-ia="RECONFIRM"]');
  await shot('11-reconfirm');
  await page.click('[data-ia="RECONFIRM"]'); await page.waitForFunction(() => !document.querySelector('[data-ia="RECONFIRM"]') && document.querySelector('.stages'));
  fresh(); if (!ctx.get_('INTERVIEWS', iv3.Interview_ID).Reconfirmed_At) errors.push('reconfirm not saved');

  // --- English
  api('me.setLang', tO, { lang: 'en' });
  const own = ctx.find_('USERS', { Email: 'owner@test.com' })[0].User_ID;
  const iv4 = api('int.create', tO, { Application_ID: A2, Round_ID: 'R2', Date: today, Time: '12:00', Mode: 'IN_PERSON', Location_ID: LOC, panel: [{ User_ID: own, Role: 'LEAD' }] }).interview;
  api('int.action', tO, { Interview_ID: iv4.Interview_ID, action: 'CHECKIN' });
  api('int.action', tO, { Interview_ID: iv4.Interview_ID, action: 'START', safety: { BRIEF: 'Y', PPE: 'Y', SUPERVISOR: 'Y' } });
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
    await page.screenshot({ path: OUT + '/v0120-en-' + name + '.png', fullPage: true });
  }
  await page.evaluate(id => go('intv', id), iv4.Interview_ID); await page.waitForSelector('#asForm'); await page.waitForTimeout(300); await leftovers('assessment-form');
  await page.evaluate(id => go('intv', id), IV.Interview_ID); await page.waitForSelector('.stages'); await page.waitForTimeout(300); await leftovers('assessment-done');
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('#ivCard'); await page.waitForTimeout(300); await leftovers('candidate');
  await page.evaluate(id => go('compare', id), VAC); await page.waitForSelector('[data-cmp]'); await page.waitForTimeout(300); await leftovers('compare');
  await page.evaluate(() => go('interviews', 'templates')); await page.waitForSelector('[data-rt]'); await page.waitForTimeout(300); await leftovers('templates');
  await page.click('[data-rt]'); await page.waitForSelector('[data-pn]'); await page.waitForTimeout(300); await leftovers('template-form'); await page.click('#mClose').catch(() => page.keyboard.press('Escape'));
  await page.evaluate(() => go('interviews', 'analytics')); await page.waitForSelector('#anOut .msg, #anOut table'); await page.waitForTimeout(300); await leftovers('analytics');
  // --- phone
  api('me.setLang', tO, { lang: 'ar' });
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  for (const [n, v, a] of [['form', 'intv', iv4.Interview_ID], ['done', 'intv', IV.Interview_ID], ['templates', 'interviews', 'templates'], ['analytics', 'interviews', 'analytics'], ['compare', 'compare', VAC], ['app', 'app', A1]]) {
    await ph.evaluate(x => go(x[0], x[1]), [v, a]); await ph.waitForTimeout(700);
    await ph.screenshot({ path: OUT + '/v0120-phone-' + n + '.png', fullPage: true });
    const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on ' + n + ': ' + w);
  }
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui16 OK');
})().catch(e => { console.error(e); process.exit(1); });
