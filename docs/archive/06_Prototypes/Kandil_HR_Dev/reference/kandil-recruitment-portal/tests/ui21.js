// v0.15.1 UI: short intro on each screen (close / reopen, remembered), menu scope colours for the owner / HR sector manager,
// new guide answers; English + phone.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks.js');
const OUT = process.env.SHOTS || '.';
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) { fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x')); mails.length = 0; pub('auth.requestCode', { email }); const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1]; return pub('auth.verifyCode', { email, code }).data.token; }
ctx.setupSystem(); vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx); fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
const hr = api('users.save', tO, { Email: 'hr@t.com', Full_Name_AR: 'منى' }).User_ID; api('users.setRoles', tO, { User_ID: hr, roles: [{ Role_Code: 'HR_MANAGER' }], reason: 'x' });
const tHr = login('hr@t.com');
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['محمد عمارة', 'منى'];
const VIEWS = ['reqs', 'approvals', 'vacancies', 'pcr', 'cands', 'interviews', 'offers', 'joinings', 'sources', 'org', 'jds', 'emps', 'locs', 'users', 'pay', 'privacy', 'rules', 'lists', 'import', 'audit', 'config', 'feedback', 'notif'];

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0151-' + n + '.png', fullPage: true });

  await openTok(tO);
  for (const v of VIEWS) {
    await page.evaluate(x => go(x), v); await page.waitForTimeout(250);
    const n = await page.$$eval('#introBox', a => a.length);
    if (n !== 1 || !(await page.$('#introBox:not(.hidden)'))) errors.push('intro on ' + v + ': ' + n);
    if (!(await page.$('#introBtn'))) errors.push('ⓘ on ' + v);
  }
  await page.evaluate(() => go('users')); await page.waitForSelector('#introBox'); await shot('1-users-intro');
  await page.click('#introHide'); await page.waitForSelector('#introBox.hidden', { state: 'attached' });
  await page.waitForTimeout(300);
  await openTok(tO); await page.evaluate(() => go('users')); await page.waitForSelector('#introBox', { state: 'attached' });
  if (!(await page.$('#introBox.hidden'))) errors.push('closed intro remembered after reload');
  await page.click('#introBtn'); await page.waitForSelector('#introBox:not(.hidden)'); await page.waitForTimeout(300);
  fresh(); if (/users/.test(ctx.get_('USERS', ctx.findUserByEmail_('owner@test.com').User_ID).Prefs_JSON)) errors.push('reopened intro saved');
  // re-render of the same screen keeps its intro (notes screen redraws itself)
  await page.evaluate(() => { go('feedback'); }); await page.waitForTimeout(300); await page.evaluate(() => viewFeedback()); await page.waitForTimeout(300);
  if ((await page.$$('#introBox')).length !== 1) errors.push('intro after a redraw');

  // v0.46.0 (CHG-99): the audience dots left the menu; the owner finds them on the settings page behind the gear
  if (await page.$('#nav .sdot') || await page.$('#scopeT')) errors.push('no dots or switch in the menu');
  await page.click('#nav [data-v="settings"]'); await page.waitForSelector('#setScope');
  const dots = await page.$$eval('#setScope .sdot', a => a.length), items = await page.$$eval('#setScope li', a => a.length);
  if (!items || dots !== items) errors.push('every screen has its audience: ' + dots + '/' + items);
  if ((await page.$$('#setScope .scopekey')).length !== 4) errors.push('legend with 4 levels');
  await shot('2-scope-colours');
  // HR manager: no audience list
  await openTok(tHr); await page.evaluate(() => go('settings')); await page.waitForSelector('.pagehead');
  if (await page.$('#setScope')) errors.push('HR manager has no audience list');
  await page.evaluate(() => go('guide')); await page.waitForTimeout(300);
  if (!/Authenticator/.test(await page.textContent('#main'))) errors.push('guide answer about the app');

  // English
  api('me.setLang', tO, { lang: 'en' });
  await openTok(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  for (const v of VIEWS) {
    await page.evaluate(x => go(x), v); await page.waitForTimeout(250);
    const left = await page.evaluate(() => { const b = document.getElementById('introBox'); return b ? b.textContent : ''; });
    if (/[ء-ي]/.test(left)) errors.push('English intro on ' + v + ': ' + left);
  }
  await page.evaluate(() => go('settings')); await page.waitForSelector('#setScope');
  const navLeft = await page.evaluate(() => document.querySelector('#setScope').textContent + document.querySelector('#nav').textContent);
  if (/[ء-ي]/.test(navLeft)) errors.push('English legend and menu: ' + navLeft);
  await page.evaluate(() => go('pay')); await page.waitForTimeout(300); await shot('3-en-pay');

  // phone
  api('me.setLang', tO, { lang: 'ar' });
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  for (const v of ['home', 'reqs', 'users', 'pay']) {
    await ph.evaluate(x => go(x), v); await ph.waitForTimeout(500);
    await ph.screenshot({ path: OUT + '/v0151-phone-' + v + '.png', fullPage: true });
    const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on ' + v + ': ' + w);
  }
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui21 OK');
})().catch(e => { console.error(e); process.exit(1); });
