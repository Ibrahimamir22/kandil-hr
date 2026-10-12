// v0.37.0 UI: the readiness screen's go-live card (restore test, the go-live button and what it hides), the incident log
// (report, decide, notified, close) and the home row for the decider; phone width.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const adminItem = async (pg, v) => { await pg.evaluate(() => go('settings')); await pg.waitForSelector('.pagehead'); return pg.$('#setList [data-v="' + v + '"]'); };     // v0.46.0: administration screens behind the gear
const { ctx, mails, fresh, vm } = require('./mocks');
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
const hs = api('users.save', tO, { Email: 'hs@t.com', Full_Name_AR: 'مدير القطاع' }).User_ID;
api('users.setRoles', tO, { User_ID: hs, roles: [{ Role_Code: 'HR_SECTOR_MANAGER' }], reason: 'x' });
const OUT = process.env.SHOTS || '.';
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0370-' + n + '.png', fullPage: true });

  // ---- readiness: restore test, then go live
  await openTok(tO);
  if (!(await adminItem(page, 'incidents'))) errors.push('menu: incidents');
  await page.evaluate(() => go('golive')); await page.waitForSelector('#glStart');
  if (!/التشغيل والنسخ الاحتياطي/.test(await page.textContent('#glBody'))) errors.push('operations group');
  await page.click('#glRestore'); await page.waitForSelector('#glRt'); await page.fill('#glRt', 'رجّعت نسخة الأسبوع اللي فات واتأكدت من الطلبات');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('.toast'); await page.waitForSelector('#glStart');
  fresh(); if (ctx.cfg_('RESTORE_TEST_LAST') !== ctx.today_()) errors.push('restore test saved from the screen');
  await shot('1-readiness');
  // ---- incidents: report, decide (owner while no DPO), notified, close
  await page.evaluate(() => go('incidents')); await page.waitForSelector('#incNew');
  await page.click('#incNew'); await page.waitForSelector('#inT');
  await page.fill('#inD', ctx.addMinutesIso_(-120).slice(0, 16));
  await page.fill('#inT', 'إيميل فيه شيت موبايلات مرشحين اتبعت لعنوان غلط'); await page.fill('#inA', 'أسماء وموبايلات'); await page.fill('#inN', '12');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('[data-inc]');
  fresh(); const inc = ctx.all_('INCIDENTS')[0];
  if (!inc || inc.People_Count !== '12' || inc.Status !== 'OPEN') errors.push('incident saved: ' + JSON.stringify(inc));
  if (!/فاضل 7\d ساعة|فاضل 70 ساعة/.test(await page.textContent('#incBody'))) errors.push('72-hour clock shown: ' + await page.textContent('#incBody'));
  await shot('2-incident');
  await page.click('[data-inc]'); await page.waitForSelector('#isD'); await page.selectOption('#isD', 'NOTIFY'); await page.fill('#isR', 'موبايلات اتبعتت لحد برّه الشركة');
  await page.click('#mActions .btn.primary'); await page.waitForTimeout(400); await page.waitForSelector('[data-inc]');
  await page.click('[data-inc]'); await page.waitForSelector('#isA'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(400); await page.waitForSelector('[data-inc]');
  await page.click('[data-inc]'); await page.waitForSelector('#isC'); await page.fill('#isC', 'الشيتات بقت بتتبعت بلينك محمي');
  await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
  fresh(); if (ctx.get_('INCIDENTS', inc.Incident_ID).Status !== 'CLOSED') errors.push('incident closed from the screen: ' + ctx.get_('INCIDENTS', inc.Incident_ID).Status);
  // ---- go live from the screen
  await page.evaluate(() => go('golive')); await page.waitForSelector('#glStart');
  await page.click('#glStart'); await page.waitForSelector('#glPh'); await page.fill('#glPh', 'تشغيل'); await page.click('#mActions .btn.primary'); await page.waitForSelector('#mMsg .msg.err');
  await page.fill('#glPh', 'تشغيل فعلي'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(1500); await page.waitForSelector('.shell');
  fresh(); if (!ctx.golive_()) errors.push('go-live recorded');
  if (await adminItem(page, 'demo')) errors.push('demo menu hidden after go-live');
  await page.evaluate(() => go('golive')); await page.waitForSelector('#glBody .msg.ok');
  if (await page.$('#glStart')) errors.push('no second go-live button');
  await shot('3-live');
  // ---- phone
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  await ph.evaluate(() => go('incidents')); await ph.waitForSelector('#incBody table'); await ph.waitForTimeout(300);
  const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on incidents: ' + w);
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui38 OK');
})().catch(e => { console.log(e); process.exit(1); });
