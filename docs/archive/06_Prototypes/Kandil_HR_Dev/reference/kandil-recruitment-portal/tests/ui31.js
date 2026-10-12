// v0.27.0 UI: KPI settings tab (targets, days to fill, class per grade, weights with a live sum, save), "my evaluation" for
// everyone (recruiter, HR site, someone with nothing assigned), the probation employee's evaluations on his page; English + phone.
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
const TALL = '<style>.shell{height:auto!important}.body{min-height:0}.main{overflow:visible!important}.scroll{overflow:visible!important;flex:none!important}</style>';
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
fresh();
const demo = n => ctx.all_('USERS').find(u => u.Full_Name_AR === n).User_ID;
const tAs = id => must(api('demo.as', tO, { User_ID: id }), 'as').token;
const tRec = tAs(demo('سارة نبيل (تجريبي)')), tSite = tAs(demo('هبة منصور (تجريبي)'));
must(api('users.save', tO, { Email: 'plain@t.com', Full_Name_AR: 'موظف عادي', Position_ID: '' }), 'plain user');
const tPlain = login('plain@t.com');
fresh();
const pConf = ctx.all_('PROBATIONS').find(p => p.Status === 'CONFIRMED');
const pRun = ctx.all_('PROBATIONS').filter(p => p.Status === 'ACTIVE').find(p => ctx.find_('PROB_REVIEWS', { Probation_ID: p.Probation_ID, Kind: 'D30', Status: 'DONE' }).length);

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ctxB.route('**/cdnjs.cloudflare.com/**', r => r.abort());
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();').replace('</head>', TALL + '</head>')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0270-' + n + '.png', fullPage: true });

  // ---- settings tab
  await openTok(tO);
  await page.evaluate(() => go('kpi', 'SETTINGS')); await page.waitForSelector('#ksSave');
  if ((await page.$$('[data-kt]')).length < 30) errors.push('targets listed: ' + (await page.$$('[data-kt]')).length);
  if ((await page.$$('[data-kg]')).length < 2) errors.push('grades listed');
  for (const c of ['RECRUITER', 'SITE', 'LEAD']) if (!/✓/.test(await page.textContent('#ksSum' + c))) errors.push('sum 100 shown for ' + c);
  await page.fill('[data-kw="RECRUITER.TTF_ON_TIME"]', '20');
  if (!/لازم 100/.test(await page.textContent('#ksSumRECRUITER'))) errors.push('live sum warns');
  await page.fill('#ksWhy', 'تجربة'); await page.click('#ksSave'); await page.waitForSelector('#ksMsg .msg, #ksMsg:not(:empty)');
  if (!/لازم يكون 100/.test(await page.textContent('#ksMsg'))) errors.push('server refuses a wrong sum: ' + await page.textContent('#ksMsg'));
  await page.fill('[data-kw="RECRUITER.TTF_ON_TIME"]', '30'); await page.fill('[data-kw="RECRUITER.CLOSE_MSG"]', '');
  await page.fill('[data-kt="OFFER_ACCEPT"]', '70'); await page.fill('[data-kd="LABOR"]', '25');
  await page.selectOption('[data-kg="5"]', 'LABOR');
  await page.fill('#ksWhy', 'مراجعة الأهداف'); await page.click('#ksSave');
  await page.waitForFunction(() => /متعدّل/.test(document.getElementById('ksBody').textContent));
  fresh();
  ok(ctx.kpiTargets_().OFFER_ACCEPT === 70 && ctx.kpiTtf_().LABOR === 25 && JSON.parse(ctx.get_('CONFIG', 'KPI_JOB_CLASS').Config_Value)['5'] === 'LABOR', 'saved from the screen');
  ok(JSON.parse(ctx.get_('CONFIG', 'KPI_WEIGHTS_RECRUITER').Config_Value).CLOSE_MSG === undefined, 'an emptied weight drops the KPI from the card');
  await shot('1-settings');
  await page.click('[data-kwd="RECRUITER"]');
  if ((await page.inputValue('[data-kw="RECRUITER.CLOSE_MSG"]')) !== '5') errors.push('restore default weights');
  // print the settings page
  await page.click('[data-pp]'); await page.waitForTimeout(300);
  if (!/70/.test(await page.textContent('#printArea'))) errors.push('settings print with values');

  // ---- recruiter: my evaluation
  await openTok(tRec);
  if (!(await page.$('#nav [data-v="kpi"]'))) errors.push('menu: KPIs for the recruiter');
  await page.evaluate(() => { S.kpi = null; go('kpi'); }); await page.waitForSelector('#kpiBody .kpih');
  if (!/بطاقة أخصائي التوظيف/.test(await page.textContent('#kpiBody'))) errors.push('recruiter: own card');
  if (await page.$('[data-kv="SETTINGS"]')) errors.push('recruiter: no settings tab');
  await shot('2-mine-recruiter');
  // HR site
  await openTok(tSite);
  await page.evaluate(() => { S.kpi = null; go('kpi', 'MINE'); }); await page.waitForSelector('#kpiBody .kpih');
  if (!/بطاقة أخصائي الموارد البشرية بالموقع/.test(await page.textContent('#kpiBody'))) errors.push('HR site: own card');
  await shot('3-mine-site');
  // someone with no role: the menu shows "my evaluation" only
  await openTok(tPlain);
  const lbl = await page.textContent('#nav [data-v="kpi"]'); if (!/تقييمي/.test(lbl || '')) errors.push('menu label for everyone: ' + lbl);
  await page.evaluate(() => { S.kpi = null; go('kpi'); }); await page.waitForSelector('#kpiBody .msg');
  if (await page.$('.subtabs [data-kv]')) errors.push('no tabs for someone with only his own evaluation');
  if (!/مفيش مؤشرات مسندة لك/.test(await page.textContent('#kpiBody'))) errors.push('empty evaluation explained');
  await shot('4-mine-empty');

  // ---- the probation employee's page
  const pageFor = async (pr, vp, tok) => {
    tok = tok || /prob=([A-Za-z0-9]+)/.exec(must(api('prob.action', tO, { Probation_ID: pr.Probation_ID, action: 'LINK' }), 'link').link)[1];
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'ProbPage.html'), 'utf8').replace(/<\?= token \?>/g, tok).replace('<script>', shim + '<script>');
    const ep = await browser.newPage({ viewport: vp || { width: 420, height: 900 } }); ep.on('pageerror', e => errors.push('employee page: ' + e.message));
    await ep.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
    await ep.setContent(html); await ep.waitForSelector('.foot'); return ep;
  };
  if (pRun) {
    const ep = await pageFor(pRun);
    if (!(await ep.$('.rv')) || !/متابعة يوم 30/.test(await ep.textContent('#app'))) errors.push('running probation: day-30 follow-up shown');
    if ((await ep.$$eval('.rv .h b', b => b.map(x => x.textContent))).some(t => /التقييم النهائي/.test(t))) errors.push('no final evaluation while running');
    await ep.screenshot({ path: OUT + '/v0270-5-employee-followup.png', fullPage: true }); await ep.close();
  } else errors.push('no running probation with a day-30 follow-up');
  {
    // the link the employee got during probation keeps working after the decision (until its end date)
    const tk = 'T'.repeat(12) + 'confirmedLink42'; fresh(); ctx.update_('PROBATIONS', pConf.Probation_ID, { Token_Hash: ctx.hash_('PROB:' + tk), Token_Until: ctx.addDaysYmd_(ctx.today_(), 30) }, 'x');
    const ep = await pageFor(pConf, null, tk);
    if (!/التقييم النهائي/.test(await ep.textContent('#app')) || (await ep.$$('.rvb')).length !== 6) errors.push('confirmed: final evaluation with six items');
    if (!/القرار: تثبيت/.test(await ep.textContent('#app'))) errors.push('decision shown');
    await ep.screenshot({ path: OUT + '/v0270-6-employee-final.png', fullPage: true });
    await ep.click('[data-l="en"]'); await ep.waitForTimeout(200);
    if (!/Final evaluation/.test(await ep.textContent('#app'))) errors.push('employee page in English');
    await ep.screenshot({ path: OUT + '/v0270-7-employee-final-en.png', fullPage: true }); await ep.close();
  }

  // ---- English
  api('me.setLang', tO, { lang: 'en' });
  await openTok(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  await page.evaluate(() => { S.kpi = null; go('kpi', 'SETTINGS'); }); await page.waitForSelector('#ksSave');
  const left = await page.evaluate(() => { const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.getElementById('main'), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE/.test(p.nodeName) || p.closest('[data-nt]')) continue; if (p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim()); } return [...out]; });
  left.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push('English (settings): dictionary text left in Arabic: ' + s));
  await shot('8-settings-en');
  api('me.setLang', tO, { lang: 'ar' });

  // ---- phone
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  await ph.evaluate(() => go('kpi', 'SETTINGS')); await ph.waitForSelector('#ksSave'); await ph.waitForTimeout(300);
  await ph.screenshot({ path: OUT + '/v0270-phone.png', fullPage: true });
  const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow: ' + w);
  await browser.close();
  if (errors.length || failN) { console.log('ERRORS:\n' + errors.join('\n') + (failN ? '\nsetup failures: ' + failN : '')); process.exit(1); }
  console.log('ui31 OK');
})().catch(e => { console.error(e); process.exit(1); });
