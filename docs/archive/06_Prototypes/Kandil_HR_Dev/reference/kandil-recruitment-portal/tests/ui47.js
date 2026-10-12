// v0.45.1 UI (CHG-97): «رجوع» in the top bar returns to the previous screen with its argument; the browser's Back
// (google.script.history) does the same; nothing to go back to → the button is hidden.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
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
fresh(); if (!ctx.all_('GRADES').length) ctx.seedGrades_();
api('import.commit', tO, { reason: 'x', text: [['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''], ['قنديل مصر', 'العمليات', 'الدهان', '', '', '', 'فني رش', 'العبور', '', '', '5', '']].map(r => r.join('\t')).join('\n') });
fresh(); const code = ctx.all_('JOBS').find(j => j.Job_Title_AR === 'فني رش').Job_Code;
const OUT = process.env.SHOTS || '.';
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const hist = `<script>window.google.script.history={pushes:[],replaced:null,h:null,push:function(s){this.pushes.push(s);},replace:function(s){this.replaced=s;},setChangeHandler:function(f){this.h=f;}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + hist + '<script>');
(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 950 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await page.waitForSelector('.shell');
  const view = () => page.evaluate(() => [S.view, S.arg]);
  const hidden = () => page.$eval('#btnBack', b => b.classList.contains('hidden'));
  if (!(await hidden())) errors.push('nothing to go back to → the button is hidden');
  // home → the JD list (menu) → one job → manager review
  await page.evaluate(() => go('jds')); await page.waitForSelector('tr[data-jd]');
  await page.click('tr[data-jd="' + code + '"]'); await page.waitForSelector('#jdBody');
  await page.evaluate(() => go('jdrev')); await page.waitForSelector('#jrBox');
  if (await hidden()) errors.push('the button shows after moving');
  await page.screenshot({ path: OUT + '/v0451-1-back.png' });
  await page.click('#btnBack'); await page.waitForSelector('#jdBody');
  let v = await view();
  if (v[0] !== 'jd' || v[1] !== code) errors.push('back → the same job: ' + v);
  if (!/فني رش/.test(await page.textContent('#main'))) errors.push('the job page is shown again');
  await page.click('#btnBack'); await page.waitForSelector('tr[data-jd]');
  v = await view(); if (v[0] !== 'jds') errors.push('back again → the JD list: ' + v);
  await page.click('#btnBack'); await page.waitForTimeout(300);
  v = await view(); if (v[0] !== 'home') errors.push('back again → home: ' + v);
  if (!(await hidden())) errors.push('at the start again → hidden');
  // the browser's Back: each move adds a history entry, the change handler goes back inside the portal
  const pushes = await page.evaluate(() => google.script.history.pushes.map(s => s.v));
  if (pushes.join(',') !== 'jds,jd,jdrev') errors.push('browser history entries: ' + pushes);
  if (await page.evaluate(() => !google.script.history.replaced || google.script.history.replaced.v !== 'home')) errors.push('the first screen replaces the browser entry');
  await page.evaluate(() => go('jds')); await page.waitForSelector('tr[data-jd]');
  await page.evaluate(c => go('jd', c), code); await page.waitForSelector('#jdBody');
  await page.evaluate(() => google.script.history.h({ state: { v: 'jds', arg: null } })); await page.waitForSelector('tr[data-jd]');
  v = await view(); if (v[0] !== 'jds') errors.push('browser Back → the JD list: ' + v);
  if (await page.evaluate(() => google.script.history.pushes.length) !== 5) errors.push('going back adds no new entry');
  await page.evaluate(() => google.script.history.h({ state: { v: 'nosuch' } })); await page.waitForTimeout(200);
  v = await view(); if (v[0] !== 'jds') errors.push('an unknown state is ignored');
  // phone width: the button fits (no horizontal overflow)
  await page.setViewportSize({ width: 390, height: 800 }); await page.evaluate(c => go('jd', c), code); await page.waitForSelector('#jdBody');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 2) errors.push('phone width overflows by ' + over + 'px');
  if (await hidden()) errors.push('the button is there on the phone');
  // with nothing to go back to, the logo is back and nothing overflows
  await page.evaluate(() => { S.hist = []; go('home', null, 'back'); }); await page.waitForTimeout(400);
  const markW = await page.$eval('.top .mark', m => m.getBoundingClientRect().width);
  const over2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (markW < 30 || over2 > 2) errors.push('phone, no back: logo ' + markW + 'px, overflow ' + over2 + 'px');
  await page.screenshot({ path: OUT + '/v0451-2-phone.png' });
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui47 OK');
})().catch(e => { console.log(e); process.exit(1); });
