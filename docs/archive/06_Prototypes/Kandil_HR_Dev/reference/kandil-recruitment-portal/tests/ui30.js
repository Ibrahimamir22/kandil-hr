// v0.26.0 UI: KPI screen (process tiles + cases, team table + card, HR site, managers, filters, export), print on every form and page,
// stay interview and manager survey on the probation page; English + phone.
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
const p55 = ctx.all_('PROBATIONS').filter(p => p.Status === 'ACTIVE').find(p => { const d = ctx.daysBetween_(p.Start_Date, ctx.today_()); return d >= 50 && d < 75; }).Probation_ID;
const pConf = ctx.all_('PROBATIONS').find(p => p.Status === 'CONFIRMED').Probation_ID;

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 }, acceptDownloads: true });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ctxB.route('**/cdnjs.cloudflare.com/**', r => r.abort());
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();').replace('</head>', TALL + '</head>')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0260-' + n + '.png', fullPage: true });
  const mshot = async n => { await (await page.$('.modal')).screenshot({ path: OUT + '/v0260-' + n + '.png' }); };

  await openTok(tO);
  if (!(await page.$('#nav [data-v="kpi"]'))) errors.push('menu: KPIs');
  await page.evaluate(() => go('kpi')); await page.waitForSelector('.kpitile');
  await page.selectOption('#kP', 'year'); await page.waitForTimeout(800); await page.waitForSelector('.kpitile');
  const tiles = (await page.$$('.kpitile')).length; if (tiles < 20) errors.push('process tiles: ' + tiles);
  if ((await page.$$('.kpih')).length !== 5) errors.push('five groups');
  await shot('1-process');
  await page.click('.kpitile.st-OK, .kpitile.st-BAD, .kpitile.st-WARN, .kpitile'); await page.waitForSelector('.modal .facts'); await mshot('2-cases'); await page.evaluate(() => closeModal());
  // team
  await page.click('[data-kv="TEAM"]'); await page.waitForSelector('.kpitab, .kpigrid');
  if (!(await page.$('.kpitab tbody tr'))) errors.push('team table');
  await shot('3-team');
  await page.click('.kpitab tbody tr'); await page.waitForSelector('.modal .kpigrid'); await mshot('4-card'); await page.evaluate(() => closeModal());
  await page.click('[data-kv="SITE"]'); await page.waitForSelector('#kpiBody .kpigrid, #kpiBody .kpitab'); await shot('5-site');
  await page.click('[data-kv="MANAGERS"]'); await page.waitForSelector('#kpiBody .kpitab, #kpiBody .msg'); await shot('6-managers');
  // filters + export
  await page.click('[data-kv="PROCESS"]'); await page.waitForSelector('.kpitile');
  await page.selectOption('#kC', 'TECH'); await page.waitForTimeout(800); await page.waitForSelector('.kpitile');
  if ((await page.evaluate(() => S.kpi.cls)) !== 'TECH') errors.push('class filter kept');
  const dl = page.waitForEvent('download', { timeout: 8000 }); await page.click('#kX'); const f = await dl;
  const csv = fs.readFileSync(await f.path(), 'utf8'); if (!/المؤشر/.test(csv) || csv.split('\n').length < 10) errors.push('export (CSV fallback) content');

  // print a modal form with values
  await page.evaluate(() => noteModal()); await page.waitForSelector('#mPrint');
  await page.fill('.modal textarea', 'الشاشة بطيئة شوية الصبح');
  await page.click('#mPrint'); await page.waitForTimeout(300);
  const pr = await page.textContent('#printArea');
  if (!/الشاشة بطيئة شوية الصبح/.test(pr) || !/قنديل مصر/.test(pr) || /إغلاق/.test(pr)) errors.push('modal print: values in, buttons out');
  await page.emulateMedia({ media: 'print' }); await page.screenshot({ path: OUT + '/v0260-7-print-modal.png', fullPage: true }); await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => closeModal());
  // print a page form (empty → lines to fill by hand)
  await page.evaluate(() => go('newreq')); await page.waitForSelector('#main select');
  await page.click('[data-pp]'); await page.waitForTimeout(300);
  if (!(await page.$('#printArea .prf-blank')) || (await page.$('#printArea button'))) errors.push('page print: blank lines, no buttons');
  await page.emulateMedia({ media: 'print' }); await page.screenshot({ path: OUT + '/v0260-8-print-page.png', fullPage: true }); await page.emulateMedia({ media: 'screen' });

  // stay interview + manager survey
  await page.evaluate(id => go('prob', id), p55); await page.waitForSelector('#prStay');
  await page.click('#prStay'); await page.waitForSelector('#syL'); await mshot('9-stay');
  await page.fill('#syL', 'الفريق متعاون'); await page.fill('#syV', 'المواصلات'); await page.selectOption('#syS', '4'); await page.selectOption('#syN', '4'); await page.selectOption('#syR', 'LOW');
  await page.click('#mActions button:has-text("حفظ")'); await page.waitForTimeout(800);
  if (!/نية البقاء 4\/5/.test(await page.textContent('#main'))) errors.push('stay interview saved and shown');
  await page.evaluate(id => go('prob', id), pConf); await page.waitForSelector('#prSat');
  await page.click('#prSat'); await page.waitForSelector('#msF'); await mshot('10-mgr-sat');
  await page.selectOption('#msF', '5'); await page.selectOption('#msS', '4'); await page.selectOption('#msA', '4');
  await page.click('#mActions button:has-text("إرسال")'); await page.waitForTimeout(800);
  if (!/المتوسط/.test(await page.textContent('#main'))) errors.push('manager survey saved');
  await shot('11-prob');

  // English
  api('me.setLang', tO, { lang: 'en' });
  await openTok(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  for (const v of ['PROCESS', 'TEAM', 'SITE', 'MANAGERS']) {
    await page.evaluate(x => { S.kpi = null; go('kpi', x); }, v); await page.waitForSelector('#kpiBody .kpigrid, #kpiBody .kpitab, #kpiBody .msg'); await page.waitForTimeout(300);
    const left = await page.evaluate(() => { const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.getElementById('main'), NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE/.test(p.nodeName) || p.closest('[data-nt]') || p.closest('tbody td:first-child')) continue; if (p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim()); } return [...out]; });
    left.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push('English (' + v + '): dictionary text left in Arabic: ' + s));
  }
  await shot('12-en');
  api('me.setLang', tO, { lang: 'ar' });

  // phone
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  await ph.evaluate(() => go('kpi')); await ph.waitForSelector('#kpiBody .kpigrid, #kpiBody .msg'); await ph.waitForTimeout(300);
  await ph.screenshot({ path: OUT + '/v0260-phone.png', fullPage: true });
  const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow: ' + w);
  await browser.close();
  if (errors.length || failN) { console.log('ERRORS:\n' + errors.join('\n') + (failN ? '\nsetup failures: ' + failN : '')); process.exit(1); }
  console.log('ui30 OK');
})().catch(e => { console.error(e); process.exit(1); });
