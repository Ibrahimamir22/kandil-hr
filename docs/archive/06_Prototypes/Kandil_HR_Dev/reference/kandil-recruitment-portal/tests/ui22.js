// v0.16.0 UI: org chart — by unit / by position, status colours + sector stripes, filter, search, unit details, zoom,
// print, manager scope; English + phone.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks.js');
const OUT = process.env.SHOTS || '.';
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) { fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x')); mails.length = 0; pub('auth.requestCode', { email }); const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1]; return pub('auth.verifyCode', { email, code }).data.token; }
ctx.setupSystem(); vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx); fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com'); const T = '\t';
const rows = [['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', '']];
const SECT = { 'القطاع المالي': ['الحسابات', 'الخزينة', 'التكاليف'], 'قطاع التصنيع': ['مصنع النجف', 'مصنع الأثاث', 'الصيانة'], 'القطاع التجاري': ['المعارض', 'التسويق'], 'قطاع الموارد البشرية': ['شؤون العاملين', 'التوظيف'] };
const JOBS = { 'الحسابات': [['محاسب عام', 4]], 'الخزينة': [['أمين خزينة', 2]], 'التكاليف': [['محاسب تكاليف', 3]], 'مصنع النجف': [['فني تجميع', 12], ['مشرف إنتاج', 2]], 'مصنع الأثاث': [['نجار', 8]], 'الصيانة': [['فني صيانة', 3]],
  'المعارض': [['مندوب مبيعات', 10]], 'التسويق': [['أخصائي تسويق', 2]], 'شؤون العاملين': [['أخصائي شؤون عاملين', 2]], 'التوظيف': [['أخصائي توظيف', 2]] };
for (const [s, depts] of Object.entries(SECT)) {
  rows.push(['قنديل مصر', s, '', '', '', '', 'مدير ' + s, 'العبور', '', 'Y', '', '']);
  for (const d of depts) { rows.push(['قنديل مصر', s, d, '', '', '', 'مدير ' + d, 'العبور', '', 'Y', '', '']); for (const [j, n] of JOBS[d]) rows.push(['قنديل مصر', s, d, '', '', '', j, 'العبور', '', '', '', String(n)]); }
}
api('import.commit', tO, { reason: 'x', text: rows.map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
const OCC = { 'محاسب عام': 5, 'أمين خزينة': 0, 'محاسب تكاليف': 2, 'فني تجميع': 12, 'مشرف إنتاج': 1, 'نجار': 9, 'فني صيانة': 0, 'مندوب مبيعات': 7, 'أخصائي تسويق': 2, 'أخصائي شؤون عاملين': 2, 'أخصائي توظيف': 1, 'الرئيس التنفيذي': 1, 'مدير الحسابات': 1, 'مدير مصنع النجف': 1 };
fresh(); for (const [j, n] of Object.entries(OCC)) ctx.update_('POSITIONS', P[j], { Occupied_HC: String(n) }, 'x');
const mgr = api('users.save', tO, { Email: 'mgr@t.com', Full_Name_AR: 'أحمد سامي', Position_ID: P['مدير قطاع التصنيع'] }).User_ID;
api('users.save', tO, { Email: 'acc@t.com', Full_Name_AR: 'هالة محمود', Position_ID: P['مدير الحسابات'] });
fresh(); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD', Justification: 'شاغر مندوبين للواجهة', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['مندوب مبيعات'], Requested_HC: 3 }] });
const tM = login('mgr@t.com');
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['محمد عمارة', 'أحمد سامي', 'هالة محمود', 'قنديل', 'قطاع', 'القطاع', 'مدير', 'الحسابات', 'الخزينة', 'التكاليف', 'مصنع', 'الصيانة', 'المعارض', 'التسويق', 'شؤون العاملين', 'التوظيف', 'محاسب', 'أمين', 'فني', 'مشرف', 'نجار', 'مندوب', 'أخصائي', 'الرئيس', 'العبور'];

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0160-' + n + '.png', fullPage: true });

  await openTok(tO);
  if (!(await page.$('#nav [data-v="orgchart"]'))) errors.push('menu item');
  await page.evaluate(() => go('orgchart')); await page.waitForSelector('#ocTree .ocn');
  const n1 = (await page.$$('#ocTree .ocn')).length;
  if (n1 !== 15) errors.push('small structure (< 40 units): first view opens two levels: ' + n1);
  await page.click('#ocNone'); await page.waitForTimeout(200);
  if ((await page.$$('#ocTree .ocn')).length !== 5) errors.push('close all = company + its sectors');
  if (!(await page.$('#ocTree .ocn.st-OVER')) && !(await page.$('#ocTree .ocn.st-SHORT'))) errors.push('status colours');
  const stripe = await page.$$eval('#ocTree .ocn[data-u]', a => new Set(a.slice(1).map(x => getComputedStyle(x).borderTopColor)).size);
  if (stripe !== 4) errors.push('4 sector stripe colours: ' + stripe);
  await shot('1-chart');
  await page.click('#ocAll'); await page.waitForTimeout(300);
  if ((await page.$$('#ocTree .ocn')).length !== 15) errors.push('open all = 15 units');
  await shot('2-all-units');
  await page.evaluate(() => { const w = document.getElementById('ocWrap'); w.style.maxHeight = 'none'; }); await (await page.$('#ocWrap')).screenshot({ path: OUT + '/v0160-2b-tree.png' }); await page.evaluate(() => { document.getElementById('ocWrap').style.maxHeight = ''; });
  await page.click('[data-by="position"]'); await page.waitForSelector('.ocp');
  if ((await page.$$('.ocp')).length < 20) errors.push('positions inside units');
  await shot('3-by-position');
  await page.selectOption('#ocF', 'OVER'); await page.waitForTimeout(200);
  if (!(await page.$('#ocTree li.dim'))) errors.push('filter dims the rest');
  await shot('4-filter-over');
  await page.selectOption('#ocF', ''); await page.click('[data-by="unit"]');
  await page.click('#ocNone'); await page.fill('#ocQ', 'نجار'); await page.press('#ocQ', 'Enter'); await page.waitForSelector('.ocp.hit');
  await shot('5-search');
  await page.selectOption('#ocSec', { label: 'القطاع التجاري' }); await page.waitForTimeout(200);
  if ((await page.$$eval('#ocTree > ul > li', a => a.length)) !== 1 || !/القطاع التجاري/.test(await page.textContent('#ocTree > ul > li > .ocn'))) errors.push('sector filter = that sector as the top');
  if (!/في السكة/.test(await page.textContent('#ocTree'))) errors.push('open vacancy shown');
  await page.click('#ocTree .ocn[data-u]'); await page.waitForSelector('#mBody .facts'); await shot('6-unit-modal'); await page.evaluate(() => closeModal());
  await page.selectOption('#ocSec', ''); await page.click('#ocAll'); await page.waitForTimeout(200);
  const zf = await page.evaluate(() => Number(document.getElementById('ocTree').style.zoom));
  if (!(zf > 0 && zf <= 1)) errors.push('fit zoom: ' + zf);
  await page.click('#ocZi'); const zi = await page.evaluate(() => Number(document.getElementById('ocTree').style.zoom)); if (!(zi > zf)) errors.push('zoom in');
  if (!(await page.$('#ocTree ul.ocstack'))) errors.push('leaf units stack in one column');
  const wide = await page.evaluate(() => document.getElementById('ocTree').scrollWidth / (Number(document.getElementById('ocTree').style.zoom) || 1));
  if (wide > 1300) errors.push('chart stays narrow with stacked leaves: ' + wide);
  await page.click('#ocPr'); await page.waitForSelector('.ocopts');
  await shot('7a-print-options');
  await page.click('#mActions button:has-text("اطبع")'); await page.waitForTimeout(300);
  if (!(await page.$('#printArea .ocprint .ocn'))) errors.push('print area built');
  const pgs = await page.$$eval('#printArea .ocpage', a => a.map(x => [x.className, Number(x.querySelector('.ocpbody > div').style.zoom)]));
  if (pgs.length !== 5) errors.push('print: overview + one page per sector: ' + pgs.length);
  if (pgs.some(p => !(p[1] > 0.3) || !/a4[lp]/.test(p[0]))) errors.push('print pages scaled + oriented: ' + JSON.stringify(pgs));
  if (await page.$('#ocMeasure')) errors.push('measure box removed');
  await page.emulateMedia({ media: 'print' }); await page.screenshot({ path: OUT + '/v0160-7-print.png', fullPage: true });
  await page.pdf({ path: OUT + '/v0160-7-print.pdf', preferCSSPageSize: true, printBackground: true }); await page.emulateMedia({ media: 'screen' });

  // manager: his sector only
  await openTok(tM); await page.evaluate(() => go('orgchart')); await page.waitForSelector('#ocTree .ocn');
  const top = await page.textContent('#ocTree > ul > li > .ocn .ocname');
  if (top !== 'قطاع التصنيع') errors.push('manager top unit: ' + top);
  if (await page.$('#ocSec')) errors.push('no sector filter for one sector');
  await shot('8-manager');
  // a plain employee: no menu item
  const tA = login('acc@t.com'); await openTok(tA);
  if (!(await page.$('#nav [data-v="orgchart"]'))) errors.push('unit manager (accounts) sees the item');

  // English
  api('me.setLang', tO, { lang: 'en' });
  await openTok(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  await page.evaluate(() => { S.oc = null; go('orgchart'); }); await page.waitForSelector('#ocTree .ocn'); await page.click('[data-by="position"]'); await page.waitForTimeout(300);
  const found = await page.evaluate(() => { const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.getElementById('main'), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE/.test(p.nodeName) || p.closest('[data-nt]')) continue; if (p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim()); } return [...out]; });
  const real = found.filter(s => !DATA.some(d => s.indexOf(d) >= 0));
  if (real.length) console.log('[en] Arabic left: ' + real.join(' | '));
  real.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push('dictionary text left in Arabic: ' + s));
  await shot('9-en');

  // phone
  api('me.setLang', tO, { lang: 'ar' });
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  await ph.evaluate(() => go('orgchart')); await ph.waitForSelector('#ocTree .ocn'); await ph.click('#ocAll'); await ph.waitForTimeout(400);
  await ph.screenshot({ path: OUT + '/v0160-phone.png', fullPage: true });
  const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow: ' + w);
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui22 OK');
})().catch(e => { console.error(e); process.exit(1); });
