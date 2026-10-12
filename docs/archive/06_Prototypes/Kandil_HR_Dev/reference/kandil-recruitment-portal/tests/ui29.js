// v0.25.0 UI: probation — list, the probation page (goals, log, reviews, final evaluation, plan, decision, letter), medical insurance,
// the employee's private page; English + phone.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
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
let failN = 0; function ok(c, m) { if (!c) { failN++; console.log('FAIL: ' + m); } }
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
const OUT = process.env.SHOTS || '.';
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
fresh();
const PR = ctx.all_('PROBATIONS'), byDay = {};
PR.forEach(p => { byDay[ctx.daysBetween_(p.Start_Date, ctx.today_())] = p.Probation_ID; });
const pEarly = byDay[12], pMid = byDay[40], pPip = byDay[55], pDec = byDay[77], pConf = byDay[79];
ok(pEarly && pMid && pPip && pDec && pConf, 'five demo probations: ' + JSON.stringify(Object.keys(byDay)));

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const TALL = '<style>.shell{height:auto!important}.body{min-height:0}.main{overflow:visible!important}.scroll{overflow:visible!important;flex:none!important}</style>';
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();').replace('</head>', TALL + '</head>')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0250-' + n + '.png', fullPage: true });
  const mshot = async n => { await page.evaluate(() => { const m = document.querySelector('.modal'); if (m) { m.style.maxHeight = 'none'; } }); await (await page.$('.modal')).screenshot({ path: OUT + '/v0250-' + n + '.png' }); };
  const btn = t => page.locator('#main button', { hasText: t }).first();

  await openTok(tO);
  if (!(await page.$('#nav [data-v="probation"]'))) errors.push('menu: probation');
  if (!(await page.$('#nav [data-v="medical"]'))) errors.push('menu: medical');
  await page.evaluate(() => go('probation', 'active')); await page.waitForSelector('#prbBody table');
  if ((await page.$$('#prbBody tbody tr')).length !== 4) errors.push('four open (one already confirmed)');
  await shot('1-list');
  // early: goals + ack + link
  await page.evaluate(id => go('prob', id), pEarly); await page.waitForSelector('#prGoals');
  await shot('2-early');
  await page.click('#prGoals'); await page.waitForSelector('#pg0t'); await mshot('3-goals');
  await page.fill('#pg3t', 'يحضر تدريب نظام المخزون'); await page.fill('#pg3m', 'شهادة حضور');
  await page.click('#mActions button:has-text("حفظ الأهداف")'); await page.waitForTimeout(600);
  if (!/يحضر تدريب نظام المخزون/.test(await page.textContent('#main'))) errors.push('goals saved (4)');
  await page.click('#prNote'); await page.waitForSelector('#pnT'); await page.click('#pnK [data-k="COR"]');
  await page.fill('#pnT', 'اتأخر نص ساعة يومين ورا بعض من غير إذن'); await mshot('4-note');
  await page.click('#mActions button:has-text("حفظ")'); await page.waitForTimeout(600);
  if (!(await page.$('.prbnote.cor'))) errors.push('corrective note shown');
  await page.click('#prLink'); await page.waitForSelector('#plT'); await mshot('5-link');
  const link = await page.inputValue('#plT'); const tok = /prob=([A-Za-z0-9]+)/.exec(link)[1];
  await page.evaluate(() => closeModal());
  // mid: D30 done, D60 not open → no button; PIP start allowed
  await page.evaluate(id => go('prob', id), pMid); await page.waitForSelector('.prbrev');
  if ((await page.$$('.prbrev.done')).length !== 1) errors.push('day 30 done on the mid one');
  await page.click('#prPip'); await page.waitForSelector('#ppS'); await mshot('6-pip');
  await page.evaluate(() => closeModal());
  // pip one: shows the plan
  await page.evaluate(id => go('prob', id), pPip); await page.waitForSelector('.prbrev');
  if (!/خطة تحسين/.test(await page.textContent('#main')) || !(await page.$('#prPipO'))) errors.push('plan shown with its outcome button');
  await shot('7-pip');
  // waiting on the decision: final table with self scores, decide modal
  await page.evaluate(id => go('prob', id), pDec); await page.waitForSelector('#prDec');
  if (!/تقييم الموظف/.test(await page.textContent('#main'))) errors.push('self scores next to the manager’s');
  await shot('8-final');
  await page.click('#prDec'); await page.waitForSelector('#pdD'); await mshot('9-decide');
  await page.selectOption('#pdD', 'CONFIRMED'); await page.fill('#pdN', 'تثبيت حسب التوصية');
  await page.click('#mActions button:has-text("حفظ القرار")'); await page.waitForTimeout(800);
  if (!(await page.$('#prLetter'))) errors.push('letter after the decision');
  await page.click('#prLetter'); await page.waitForTimeout(500);
  if (!/خطاب تثبيت/.test(await page.textContent('#printArea'))) errors.push('confirmation letter');
  await page.emulateMedia({ media: 'print' }); await page.screenshot({ path: OUT + '/v0250-10-letter.png', fullPage: true }); await page.emulateMedia({ media: 'screen' });
  // a review modal and the final evaluation modal (as owner on a fresh one: the mid one has D60 closed; use the joined early one's D30? not open) — final on a shifted copy
  fresh(); const pF = pConf;
  // medical
  await page.evaluate(() => go('medical', 'all')); await page.waitForSelector('#medBody');
  if ((await page.$$('#medBody tbody tr')).length !== 2) errors.push('two medical cases (demo + just confirmed)');
  await shot('11-medical');
  await page.click('[data-mc]'); await page.waitForSelector('#mcC'); await mshot('12-medical-modal');
  await page.fill('#mcP', 'أكسا'); await page.fill('#mcC', 'AX-55821');
  await page.click('#mActions button:has-text("اتضاف")'); await page.waitForTimeout(600);
  if (!/AX-55821/.test(await page.textContent('#medBody'))) errors.push('card saved');
  // review + final modals on a probation whose windows are open: shift the early one to day 76 with nothing done
  fresh();
  const pp = ctx.get_('PROBATIONS', pEarly); const st = ctx.addDaysYmd_(ctx.today_(), -75);
  ctx.update_('PROBATIONS', pEarly, { Start_Date: st, End_Date: ctx.addDaysYmd_(st, 89), Decision_Due: ctx.addDaysYmd_(st, 79) }, 'x');
  ctx.find_('PROB_REVIEWS', { Probation_ID: pEarly }).forEach(r => ctx.update_('PROB_REVIEWS', r.Review_ID, { Due_Date: ctx.addDaysYmd_(st, { D30: 29, D60: 59, FINAL: 74, SELF: 74, STAY: 59 }[r.Kind]) }, 'x'));
  await page.evaluate(id => go('prob', id), pEarly); await page.waitForSelector('[data-rv="D30"]');
  await page.click('[data-rv="D30"]'); await page.waitForSelector('#rO'); await mshot('13-review');
  await page.evaluate(() => closeModal());
  await page.click('[data-rv="FINAL"]'); await page.waitForSelector('#fsPROD');
  for (const c of ['PROD', 'QUAL', 'V1', 'V2', 'V3', 'V4']) { await page.selectOption('#fs' + c, c === 'V4' ? '2' : '4'); await page.fill('#fe' + c, 'مثال من الشغل'); }
  if ((await page.textContent('#fAvg')) !== '3.8 / 5') errors.push('live weighted score: ' + await page.textContent('#fAvg'));
  await mshot('14-final');
  await page.evaluate(() => closeModal());
  await shot('15-timeline-late');

  // the employee's private page
  const probHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'ProbPage.html'), 'utf8').replace(/<\?= token \?>/g, tok).replace('<script>', shim + '<script>');
  const ep = await browser.newPage({ viewport: { width: 420, height: 900 } }); ep.on('pageerror', e => errors.push('employee page: ' + e.message));
  await ep.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ep.setContent(probHtml); await ep.waitForSelector('.goal');
  if ((await ep.$$('.goal')).length !== 4) errors.push('employee sees four goals');
  if (!(await ep.$('.scale.n'))) errors.push('self-assessment open on day 76');
  await ep.click('#ack'); await ep.waitForSelector('.ackd');
  await ep.fill('[data-rt]', 'كان في زحمة مواصلات'); await ep.click('[data-rs]'); await ep.waitForSelector('.nt .rep');
  for (const c of ['PROD', 'QUAL', 'V1', 'V2', 'V3', 'V4']) await ep.click('[data-q="' + c + '"][data-v="4"]');
  await ep.screenshot({ path: OUT + '/v0250-16-employee.png', fullPage: true });
  await ep.click('#selfB'); await ep.waitForFunction(() => /اتسجل تقييمك/.test(document.body.textContent));
  await ep.click('[data-l="en"]'); await ep.waitForTimeout(200);
  if (/[ء-ي]{4,}/.test((await ep.textContent('.sec h2')) || '')) errors.push('employee page in English');
  await ep.screenshot({ path: OUT + '/v0250-17-employee-en.png', fullPage: true });
  fresh(); ok(ctx.find_('PROB_REVIEWS', { Probation_ID: pEarly }).find(r => r.Kind === 'SELF').Status === 'DONE', 'self-assessment saved');

  // English portal
  api('me.setLang', tO, { lang: 'en' });
  await openTok(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  for (const [v, a, sel] of [['probation', 'all', '#prbBody table'], ['prob', pDec, '.prbrev'], ['medical', 'all', '#medBody table']]) {
    await page.evaluate(([v, a]) => go(v, a), [v, a]); await page.waitForSelector(sel); await page.waitForTimeout(300);
    const left = await page.evaluate(() => { const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.getElementById('main'), NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE/.test(p.nodeName) || p.closest('[data-nt]')) continue; if (p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim()); } return [...out]; });
    left.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push('English (' + v + '): dictionary text left in Arabic: ' + s));
  }
  await shot('18-en');
  api('me.setLang', tO, { lang: 'ar' });

  // phone
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  await ph.evaluate(id => go('prob', id), pMid); await ph.waitForSelector('.prbrev'); await ph.waitForTimeout(300);
  await ph.screenshot({ path: OUT + '/v0250-phone.png', fullPage: true });
  const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow: ' + w);
  await browser.close();
  if (errors.length || failN) { console.log('ERRORS:\n' + errors.join('\n') + (failN ? '\nsetup failures: ' + failN : '')); process.exit(1); }
  console.log('ui29 OK');
})().catch(e => { console.error(e); process.exit(1); });
