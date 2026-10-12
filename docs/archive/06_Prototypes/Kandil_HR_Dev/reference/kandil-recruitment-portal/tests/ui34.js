// v0.30.0 UI: go-live readiness screen (checks, open the fixing screen, tick / untick manual items) and the hiring forecast tab; English + phone.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const adminItem = async (pg, v) => { await pg.evaluate(() => go('settings')); await pg.waitForSelector('.pagehead'); return pg.$('#setList [data-v="' + v + '"]'); };     // v0.46.0: administration screens behind the gear
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
const tHr = tAs(demo('منى عادل (تجريبي)'));
fresh();
ctx.all_('EMPLOYEES').filter(e => e.Status === 'Active').slice(0, 6).forEach((e, i) => ctx.update_('EMPLOYEES', e.Employee_ID, { Status: 'Exited', Exit_Date: ctx.addDaysYmd_(ctx.today_(), -30 - i * 50) }, 'x'));

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ctxB.route('**/cdnjs.cloudflare.com/**', r => r.abort());
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();').replace('</head>', TALL + '</head>')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0300-' + n + '.png', fullPage: true });
  const mshot = async n => { await (await page.$('.modal')).screenshot({ path: OUT + '/v0300-' + n + '.png' }); };

  await openTok(tO);
  if (!(await adminItem(page, 'golive'))) errors.push('menu: readiness');
  await page.evaluate(() => go('golive')); await page.waitForSelector('.glrow');
  if ((await page.$$('.glrow')).length < 24) errors.push('rows: ' + (await page.$$('.glrow')).length);
  if (!(await page.$('.glrow.st-TODO'))) errors.push('to-do items shown');
  await shot('1-readiness');
  // open the fixing screen
  const goBtn = await page.$('.glrow.st-TODO [data-glgo="demo"]');
  if (goBtn) { await goBtn.click(); await page.waitForTimeout(500); if ((await page.evaluate(() => S.view)) !== 'demo') errors.push('«open» goes to the demo screen'); }
  await page.evaluate(() => go('golive')); await page.waitForSelector('[data-gltick]');
  await page.click('[data-gltick="UAT"]'); await page.waitForSelector('#glNote'); await page.fill('#glNote', 'خطة الاختبار اتنفذت بالأدوار'); await mshot('2-tick');
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => /خطة الاختبار اتنفذت/.test(document.getElementById('glBody').textContent));
  fresh(); ok(JSON.parse(ctx.get_('CONFIG', 'GOLIVE_CHECKS').Config_Value).UAT, 'ticked from the screen');
  await shot('3-after-tick');
  await page.click('[data-gltick="UAT"][data-gldone="Y"]'); await page.waitForFunction(() => !/خطة الاختبار اتنفذت/.test(document.getElementById('glBody').textContent));
  // HR manager reads only
  await openTok(tHr); await page.evaluate(() => go('golive')); await page.waitForSelector('.glrow');
  if (await page.$('[data-gltick]')) errors.push('HR manager sees tick buttons');
  // forecast tab
  await openTok(tO);
  await page.evaluate(() => { S.kpi = null; go('kpi', 'FORECAST'); }); await page.waitForSelector('#kpiBody .kpitab');
  if ((await page.$$('#kpiBody .kpitab')).length !== 3) errors.push('three forecast tables');
  if (!/دقة التوقع/.test(await page.textContent('#kpiBody'))) errors.push('confidence shown');
  await shot('4-forecast');
  // English
  api('me.setLang', tO, { lang: 'en' });
  await openTok(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  const leftOn = async label => {
    const left = await page.evaluate(() => { const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.getElementById('main'), NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE/.test(p.nodeName) || p.closest('[data-nt]') || p.closest('tbody td:first-child')) continue; if (p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim()); } return [...out]; });
    left.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push('English (' + label + '): dictionary text left in Arabic: ' + s));
  };
  await page.evaluate(() => go('golive')); await page.waitForSelector('.glrow'); await leftOn('readiness'); await shot('5-readiness-en');
  await page.evaluate(() => { S.kpi = null; go('kpi', 'FORECAST'); }); await page.waitForSelector('#kpiBody .kpitab'); await leftOn('forecast');
  api('me.setLang', tO, { lang: 'ar' });
  // phone
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  await ph.evaluate(() => go('golive')); await ph.waitForSelector('.glrow'); await ph.waitForTimeout(300);
  await ph.screenshot({ path: OUT + '/v0300-phone.png', fullPage: true });
  const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow: ' + w);
  await browser.close();
  if (errors.length || failN) { console.log('ERRORS:\n' + errors.join('\n') + (failN ? '\nsetup failures: ' + failN : '')); process.exit(1); }
  console.log('ui34 OK');
})().catch(e => { console.error(e); process.exit(1); });
