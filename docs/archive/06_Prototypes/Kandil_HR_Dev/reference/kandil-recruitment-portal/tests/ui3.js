const { navClick } = require('./navhelp.js');
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks.js');
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
function login(email) { mails.length = 0; pub('auth.requestCode', { email }); const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1]; return pub('auth.verifyCode', { email, code }).data.token; }
ctx.setupSystem(); vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx); fresh(); ctx.bootstrapOwner();
const tok = login('owner@test.com'); const T = '\t';
fresh(); ctx.api('import.commit', tok, { reason: 'x', text: [
  ['قنديل مصر','','','','','','الرئيس التنفيذي','العبور','','Y','',''],
  ['قنديل مصر','القطاع المالي','','','','','مدير القطاع المالي','العبور','','Y','',''],
  ['قنديل مصر','القطاع المالي','الحسابات','','','','مدير الحسابات','العبور','','Y','',''],
  ['قنديل مصر','القطاع المالي','الحسابات','','','','محاسب','العبور','','','','2']].map(r => r.join(T)).join('\n') });
let html = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
html = html.replace('<script>', shim + '<script>').replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();');
(async () => {
  const errors = []; const browser = await chromium.launch();
  for (const vp of [{ width: 1280, height: 850, n: 'd' }, { width: 390, height: 844, n: 'm' }]) {
    const page = await browser.newPage({ viewport: vp });
    page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
    await page.setContent(html); await page.waitForSelector('.shell');
    await navClick(page, 'org'); await page.waitForSelector('#tree .node');
    await page.click('#tree .node:has-text("الحسابات") .nm');
    await page.waitForSelector('[data-ub="add"]');
    await page.screenshot({ path: `o-${vp.n}-1-unit.png` });
    if (vp.n === 'd') {
      await page.click('[data-ub="add"]'); await page.fill('#ufN', 'الخزينة'); await page.fill('#ufW', 'قرار الإدارة');
      await page.screenshot({ path: 'o-d-2-addunit.png' });
      await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
      await page.waitForSelector('[data-ub="pos"]'); await page.click('[data-ub="pos"]'); await page.waitForSelector('#pfJob');
      await page.fill('#pfNew', 'رئيس الخزينة'); await page.selectOption('#pfFam', 'ACC'); await page.fill('#pfW', 'وظيفة جديدة');
      await page.screenshot({ path: 'o-d-3-addpos.png' });
      await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
      await page.click('[data-ub="head"]'); await page.waitForSelector('#hfP');
      await page.selectOption('#hfP', { index: 1 }); await page.fill('#hfW', 'تعيين');
      await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
      await page.screenshot({ path: 'o-d-4-withhead.png' });
      await page.click('[data-ub="hist"]'); await page.waitForSelector('.modal .hist'); await page.screenshot({ path: 'o-d-5-hist.png' });
      await page.click('.modal .btn.secondary');
      await page.click('#posList tr.click'); await page.waitForSelector('#pMove'); await page.click('#pMove'); await page.waitForSelector('#mpU');
      await page.screenshot({ path: 'o-d-6-movepos.png' });
    }
    await page.close();
  }
  await browser.close(); console.log(errors.length ? errors.join('\n') : 'NO_UI_ERRORS');
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
