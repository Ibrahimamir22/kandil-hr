const { navClick } = require('./navhelp.js');
// Locations & branches screen, branch picking in the request form, printed copy with status stamp.
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
  ['قنديل مصر', 'التجاري', '', '', '', '', 'رئيس القطاع التجاري', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'التجاري', 'المعارض', '', '', '', 'مدير المعارض', 'الفروع', '', 'Y', '', ''],
  ['قنديل مصر', 'التجاري', 'المعارض', '', '', '', 'أخصائي مبيعات', 'الفروع', '', '', '', '30']].map(r => r.join(T)).join('\n') });
fresh(); const grp = ctx.all_('LOCATIONS').find(l => l.Name_AR === 'الفروع');
api('locations.save', tO, { Location_ID: grp.Location_ID, Name_AR: 'الفروع', Location_Type: 'BRANCH_GROUP', Status: 'Active' });
['فرع النزهة', 'فرع المعادي', 'فرع مول مصر'].forEach(n => api('locations.save', tO, { Name_AR: n, Location_Type: 'SHOWROOM', Governorate: 'القاهرة', Address: 'عنوان ' + n }));
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');
(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();'));
  await page.waitForSelector('.shell');
  await navClick(page, 'locs'); await page.waitForSelector('tr[data-loc]');
  await page.screenshot({ path: OUT + '/l-1-branches.png' });
  await page.click('#lcNew'); await page.waitForSelector('#lfN'); await page.fill('#lfN', 'فرع الإسكندرية'); await page.selectOption('#lfG', 'الإسكندرية'); await page.fill('#lfA', 'العطارين');
  await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
  const n = await page.$$eval('tr[data-loc]', r => r.length); if (n !== 4) errors.push('branches rows ' + n);
  // request form: pick the shared showroom position twice for two branches
  await navClick(page, 'newreq'); await page.waitForSelector('#rfPosQ');
  await page.fill('#rfPosQ', 'أخصائي'); await page.waitForSelector('#rfPick [data-p]'); await page.click('#rfPick [data-p]');
  await page.waitForSelector('#rfLines [data-br]');
  await page.fill('#rfPosQ', 'أخصائي'); await page.waitForSelector('#rfPick [data-p]'); await page.click('#rfPick [data-p]');
  const sels = await page.$$('#rfLines [data-br]'); if (sels.length !== 2) errors.push('branch selects ' + sels.length);
  const opts = await page.$$eval('#rfLines [data-br] option', o => o.map(x => x.textContent));
  await page.selectOption('#rfLines [data-br] >> nth=0', { label: 'فرع النزهة' });
  await page.selectOption('#rfLines [data-br] >> nth=1', { label: 'فرع المعادي' });
  await page.screenshot({ path: OUT + '/l-2-request-branches.png', fullPage: false });
  if (!opts.includes('فرع مول مصر')) errors.push('branch options missing');
  // submit via API with the same content then print
  fresh(); const pos = ctx.all_('POSITIONS').find(p => ctx.get_('JOBS', p.Job_Code).Job_Title_AR === 'أخصائي مبيعات').Position_ID;
  const L = n2 => ctx.all_('LOCATIONS').find(l => l.Name_AR === n2).Location_ID;
  const rq = api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'DAILY', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'EXPANSION',
    Justification: 'افتتاح موسم المبيعات في الفروع', Requested_Priority: 'IMPORTANT', Required_By_Date: '2099-01-01',
    lines: [{ Position_ID: pos, Requested_HC: 2, Location_ID: L('فرع النزهة') }, { Position_ID: pos, Requested_HC: 1, Location_ID: L('فرع المعادي') }] });
  await page.evaluate(id => go('req', id), rq.Request_ID); await page.waitForSelector('#rdPrint');
  await page.screenshot({ path: OUT + '/l-3-request-detail.png' });
  // v0.46.2: pop-ups allowed → the request prints from a window of its own, named after the request
  { const pop = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
    await page.evaluate(() => { const o = window.open; window.open = function () { const w = o.apply(window, arguments); if (w) w.print = function () {}; return w; }; });
    await page.click('#rdPrint'); const w = await pop;
    if (!w) errors.push('the request print opens its own window');
    else { await w.waitForFunction(() => /طلب تعيين/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
      if (await w.title() !== 'طلب تعيين ' + rq.Request_ID) errors.push('window title: ' + await w.title());
      if (!/معتمد/.test(await w.textContent('.pr-stamp').catch(() => ''))) errors.push('the window holds the request with its stamp');
      await w.close(); } }
  await page.evaluate(() => { window.open = () => null; window.print = () => { window.__printed = true; }; });     // pop-ups blocked → in-page print
  await page.click('#rdPrint'); await page.waitForFunction(() => window.__printed === true);
  await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/l-4-print-approved.png', fullPage: true });
  const stamp = await page.textContent('.pr-stamp'); if (!/معتمد/.test(stamp)) errors.push('stamp ' + stamp);
  await page.emulateMedia({ media: 'screen' });
  await browser.close(); console.log(errors.length ? errors.join('\n') : 'NO_UI_ERRORS');
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
