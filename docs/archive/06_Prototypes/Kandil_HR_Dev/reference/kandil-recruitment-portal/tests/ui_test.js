const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks.js');
(async () => {
  ctx.setupSystem();
  vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
  fresh(); ctx.bootstrapOwner();
  let html = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8');
  const shim = `<script>
  window.google = { script: { get run(){ var s={}, f={};
    var o = { withSuccessHandler:function(fn){s.fn=fn;return o;}, withFailureHandler:function(fn){f.fn=fn;return o;},
      apiPublic:function(){ window.__srv('apiPublic', Array.from(arguments)).then(s.fn, f.fn); },
      api:function(){ window.__srv('api', Array.from(arguments)).then(s.fn, f.fn); } };
    return o; } } };</script>`;
  html = html.replace('<script>', shim + '<script>');
  const browser = await chromium.launch();
  const errors = [];
  for (const vp of [{ width: 1280, height: 850, name: 'desktop' }, { width: 390, height: 844, name: 'mobile' }]) {
    const page = await browser.newPage({ viewport: vp });
    page.on('pageerror', e => errors.push(vp.name + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(vp.name + ' console: ' + m.text()); });
    await page.exposeFunction('__srv', (fn, args) => { fresh(); return JSON.parse(JSON.stringify(ctx[fn].apply(null, args))); });
    await page.setContent(html);
    await page.waitForSelector('#loginEmail'); await page.screenshot({ path: `shot-${vp.name}-login.png` });
    await page.fill('#loginEmail', 'owner@test.com');
    mails.length = 0;
    await page.click('#btnSendCode');
    await page.waitForSelector('#loginStep2:not(.hidden)');
    const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
    await page.fill('#loginCode', code);
    await page.click('#btnVerify');
    await page.waitForSelector('.shell');
    await page.waitForTimeout(300);
    if (vp.name === 'desktop') {
      await page.evaluate(() => go('import'));
      const T = '\t';
      const txt = [
        ['قنديل مصر','','','','','','الرئيس التنفيذي','العبور','','Y','',''],
        ['قنديل مصر','القطاع المالي','','','','','مدير القطاع المالي','العبور','','Y','',''],
        ['قنديل مصر','القطاع المالي','الحسابات','','','','مدير الحسابات','العبور','','Y','',''],
        ['قنديل مصر','القطاع المالي','الحسابات','التكاليف','','','محاسب تكاليف','العبور','','','','2'],
      ].map(r => r.join(T)).join('\n');
      await page.fill('#impText', txt);
      await page.click('#impPrev');
      await page.waitForSelector('#impCommit');
      await page.screenshot({ path: 'shot-import-preview.png', fullPage: true });
      await page.click('#impCommit');
      await page.waitForSelector('#impRes .msg.ok');
    }
    for (const v of ['home', 'org', 'users', 'audit', 'config']) {
      await page.evaluate(x => go(x), v);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `shot-${vp.name}-${v}.png`, fullPage: true });
    }
    // open a position modal
    await page.evaluate(() => go('org')); await page.waitForTimeout(250);
    const row = await page.$('tr.click');
    if (row) { await row.click(); await page.waitForSelector('.modal'); await page.screenshot({ path: `shot-${vp.name}-position.png` }); await page.click('.modal .btn.secondary'); }
    // roles modal
    await page.evaluate(() => go('users')); await page.waitForTimeout(250);
    await page.click('[data-r]'); await page.waitForSelector('.modal');
    await page.screenshot({ path: `shot-${vp.name}-roles.png` });
    await page.close();
  }
  await browser.close();
  console.log(errors.length ? errors.join('\n') : 'NO_UI_ERRORS');
})();
