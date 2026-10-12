// v0.20.0 UI: demo-data screen (stages, report), «try as» with the banner and the way back, the wipe; English + phone.
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
fresh(); const _x = ctx.all_('POSITIONS').length, cfgBefore = ctx.all_('CONFIG').length, tplBefore = ctx.all_('ONB_TEMPLATES').length;
const occBefore = {}; ctx.all_('POSITIONS').forEach(p => { occBefore[p.Position_ID] = p.Occupied_HC; });

const OUT = process.env.SHOTS || '.';
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['محمد عمارة', '(تجريبي)', 'مدير', 'مستخدم حقيقي', 'امسح الحركات', 'العبور'];


(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0200-' + n + '.png', fullPage: true });

  // only the owner sees the screen
  await openTok(tR); if (await adminItem(page, 'demo')) errors.push('HR manager should not see the demo screen');
  await openTok(tO); if (!(await adminItem(page, 'demo'))) errors.push('owner menu item');
  await page.evaluate(() => go('demo')); await page.waitForSelector('#demoAll'); await shot('1-empty');
  await page.click('#demoAll');
  await page.waitForFunction(() => document.querySelectorAll('#demoBox .demostage.done').length === 7, null, { timeout: 300000 }); await page.waitForTimeout(400);
  const txt = await page.textContent('#demoBox');
  if (!/كل المراحل اتعملت/.test(txt)) errors.push('all stages done message');
  if ((await page.$$('#demoBox .demostage.done')).length !== 7) errors.push('7 stages done');
  if ((await page.$$('#demoBox [data-das]')).length < 7) errors.push('demo users listed');
  if (await page.$('#demoBox .msg.warn')) errors.push('warnings shown: ' + await page.textContent('#demoBox .msg.warn'));
  await shot('2-seeded');
  // the report shows while running: run one more stage is not possible; check the log via a new seed after wipe below
  // try as the demo HR manager
  const btn = await page.$('#demoBox tr:has-text("منى عادل") [data-das]'); await btn.click();
  await page.waitForSelector('.demobar'); await page.waitForTimeout(500);
  if (!/منى عادل/.test(await page.textContent(".demobar"))) errors.push('banner names the demo user');
  if (await adminItem(page, 'demo')) errors.push('demo user must not see the demo screen');
  await shot('3-try-as');
  await page.evaluate(() => go('reqs')); await page.waitForTimeout(700); await shot('4-try-as-reqs');
  await page.click('#btnDemoBack'); await page.waitForSelector('#demoBox [data-das]');
  if (await page.$('.demobar')) errors.push('banner gone after return');
  if (!/محمد عمارة/.test(await page.textContent('#btnMe'))) errors.push('back as the owner');
  // the wipe
  // v0.36.0: with another admin, the owner can't wipe alone (CHG-77) — the HR manager asks, the owner approves
  await page.fill('#dwPhrase', 'امسح الحركات'); await page.fill('#dwReason', 'خلصنا الاختبار'); await page.click('#dwGo'); await page.waitForSelector('#dwMsg .msg.err');
  if (!/شخصين/.test(await page.textContent('#dwMsg'))) errors.push('wipe alone refused');
  await shot('5-wipe-form');
  const dreq = (api('dual.request', tR, { Kind: 'WIPE', reason: 'خلصنا الاختبار' }) || {}).data;
  if (!dreq || !dreq.Dual_ID) errors.push('wipe request: ' + JSON.stringify(dreq));
  await page.evaluate(() => go('dual')); await page.waitForSelector('[data-dud]'); await shot('5b-dual');
  await page.click('[data-dud]'); await page.waitForSelector('#duPh'); await page.fill('#duPh', 'امسح'); await page.click('#mActions .btn.primary');
  await page.waitForSelector('#mMsg .msg.err'); if (!/بالظبط/.test(await page.textContent('#mMsg'))) errors.push('wrong phrase refused');
  await page.fill('#duPh', 'امسح الحركات');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('.toast'); await page.waitForTimeout(300);
  if (!/اتمسح/.test(await page.textContent('.toast').catch(() => ''))) errors.push('wipe report');
  await page.evaluate(() => go('demo')); await page.waitForSelector('#demoBox'); await page.waitForTimeout(600);
  if ((await page.$$('#demoBox .demostage.done')).length) errors.push('stages reset');
  fresh(); const dd = ctx.get_('DUAL_REQUESTS', dreq.Dual_ID); if (!dd || dd.Status !== 'DONE') errors.push('dual request done');
  await shot('6-wiped');
  fresh(); if (ctx.WIPE_TABLES_.some(t => ctx.all_(t).length)) errors.push('tables not empty after the UI wipe');
  // one stage with its report line
  await page.click('#demoBox [data-ds="PEOPLE"]'); await page.waitForSelector('#demoLog b'); 
  if (!/مستخدم تجريبي/.test(await page.textContent('#demoLog'))) errors.push('stage report');
  await page.waitForTimeout(1200);

  // English
  api('me.setLang', tO, { lang: 'en' });
  await openTok(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  async function left(name) {
    const found = await page.evaluate(() => { const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE|TEXTAREA/.test(p.nodeName) || p.closest('[data-nt]') || p.closest('#printArea')) continue; if (p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim()); } return [...out]; });
    const real = found.filter(s => !DATA.some(d => s.indexOf(d) >= 0));
    if (real.length) console.log('[' + name + '] Arabic left: ' + real.join(' | '));
    real.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push(name + ': dictionary text left in Arabic: ' + s));
    await page.screenshot({ path: OUT + '/v0200-en-' + name + '.png', fullPage: true });
  }
  await page.evaluate(() => go('demo')); await page.waitForSelector('#dwGo'); await page.waitForTimeout(300); await left('demo');
  api('me.setLang', tO, { lang: 'ar' });

  // phone
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  await ph.evaluate(() => go('demo')); await ph.waitForSelector('#dwGo'); await ph.waitForTimeout(400);
  await ph.screenshot({ path: OUT + '/v0200-phone-demo.png', fullPage: true });
  let w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on demo: ' + w);
  await ph.click('#demoBox [data-das]'); await ph.waitForSelector('.demobar'); await ph.waitForTimeout(400);
  await ph.screenshot({ path: OUT + '/v0200-phone-banner.png', fullPage: false });
  w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow with the banner: ' + w);
  await browser.close();
  if (errors.length || failN) { console.log('ERRORS:\n' + errors.join('\n') + (failN ? '\nsetup failures: ' + failN : '')); process.exit(1); }
  console.log('ui26 OK');
})().catch(e => { console.error(e); process.exit(1); });
