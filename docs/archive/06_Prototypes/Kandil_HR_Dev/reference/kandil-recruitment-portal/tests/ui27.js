// v0.22.0 UI: operational reports — tabs, filters, status chips, opening a row, export; English + phone.
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

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 }, acceptDownloads: true });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  // the Excel library comes from a CDN the test cannot reach: refuse it so the CSV fallback is exercised
  await ctxB.route('**/cdnjs.cloudflare.com/**', r => r.abort());
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0220-' + n + '.png', fullPage: true });

  await openTok(tO);
  if (!(await page.$('#nav [data-v="reports"]'))) errors.push('menu item for the owner');
  await page.evaluate(() => go('reports')); await page.waitForSelector('#rpBody table'); await shot('1-requests');
  const nReq = (await page.$$('#rpBody tbody tr')).length; if (!nReq) errors.push('requests rows');
  // every tab loads a table
  for (const t of ['VACANCIES', 'CANDIDATES', 'OFFERS', 'JOINERS']) {
    await page.click('[data-rpt="' + t + '"]'); await page.waitForFunction(x => S.rpData && S.rpData.type === x && document.querySelector('#rpBody table'), t);
    if (!(await page.$$('#rpBody tbody tr')).length) errors.push(t + ' rows');
  }
  await shot('2-joiners');
  // status chip filters
  await page.click('[data-rpt="CANDIDATES"]'); await page.waitForFunction(() => S.rpData && S.rpData.type === 'CANDIDATES');
  const all = (await page.$$('#rpBody tbody tr')).length;
  const chip = await page.$('#rpBody [data-rps]:not([data-rps=""])'); const chipName = await chip.getAttribute('data-rps'); await chip.click();
  await page.waitForFunction(n => S.rp.status === n && S.rpData.rows.every(r => r._status === n), chipName);
  const some = (await page.$$('#rpBody tbody tr')).length; if (!(some > 0 && some <= all)) errors.push('status chip: ' + some + ' of ' + all);
  await shot('3-chip');
  // date range: a future start empties it, «الكل» brings it back
  await page.fill('#rpF', '2999-01-01'); await page.dispatchEvent('#rpF', 'change'); await page.waitForSelector('#rpBody .msg.info');
  await page.click('[data-rpr="all"]'); await page.waitForSelector('#rpBody table');
  // a row opens its page
  await page.click('#rpBody tbody tr.click'); await page.waitForFunction(() => S.view === 'app');
  // export (CSV fallback here)
  await page.evaluate(() => go('reports', 'JOINERS')); await page.waitForSelector('#rpX');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#rpX')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  if (!/^﻿/.test(csv) || !/الموظف الجديد/.test(csv)) errors.push('CSV export: BOM + Arabic header');
  fresh(); if (!ctx.all_('AUDIT_LOG').some(a => a.Entity_Type === 'REPORT' && a.Action === 'EXPORT')) errors.push('export audited');

  // English
  api('me.setLang', tO, { lang: 'en' });
  await openTok(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  await page.evaluate(() => go('reports', 'OFFERS')); await page.waitForSelector('#rpBody table'); await page.waitForTimeout(300);
  const left = await page.evaluate(() => { const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.querySelector('.pagehead').parentElement, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE/.test(p.nodeName) || p.closest('tbody')) continue; if (p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim()); } return [...out]; });
  left.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push('English: dictionary text left in Arabic: ' + s));
  const head = await page.textContent('#rpBody thead'); if (!/Offer no\./.test(head)) errors.push('English column names: ' + head.slice(0, 80));
  await shot('4-english');
  api('me.setLang', tO, { lang: 'ar' });

  // phone: no sideways scroll of the page (the table scrolls inside its box)
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  await ph.evaluate(() => go('reports')); await ph.waitForSelector('#rpBody table'); await ph.waitForTimeout(300);
  await ph.screenshot({ path: OUT + '/v0220-phone.png', fullPage: true });
  const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow: ' + w);
  await browser.close();
  if (errors.length || failN) { console.log('ERRORS:\n' + errors.join('\n') + (failN ? '\nsetup failures: ' + failN : '')); process.exit(1); }
  console.log('ui27 OK');
})().catch(e => { console.error(e); process.exit(1); });
