// v0.45.1 UI (CHG-98): «مين أونلاين» — the owner sees who is online and the screen's name; an HR manager has no such item.
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
const hr = api('users.save', tO, { Email: 'hr@t.com', Full_Name_AR: 'منى' }).User_ID; api('users.setRoles', tO, { User_ID: hr, roles: [{ Role_Code: 'HR_MANAGER' }], reason: 'x' });
const tH = login('hr@t.com');
fresh(); ctx.api('me', tH, {}, 'jdrev');
const OUT = process.env.SHOTS || '.';
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 950 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await page.waitForSelector('.shell');
  await page.click('#nav [data-v="settings"]'); await page.waitForSelector('#setList');
  if (!(await page.$('#setList [data-v="online"]'))) errors.push('the owner has the item behind the gear');
  await page.evaluate(() => go('online')); await page.waitForSelector('#olTbl');
  const t = await page.textContent('#olTbl');
  if (!/منى/.test(t) || !/مراجعة المديرين/.test(t)) errors.push('the HR manager and her screen: ' + t);
  if (!/إنت/.test(t) || !/مين أونلاين/.test(t)) errors.push('the owner himself, on this screen');
  await page.screenshot({ path: OUT + '/v0451-3-online.png' });
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tH) + ' || loadToken();')); await page.waitForSelector('.shell');
  await page.evaluate(() => go('settings')); await page.waitForSelector('.pagehead');
  if (await page.$('#setList [data-v="online"]')) errors.push('the HR manager has no such item');
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui48 OK');
})().catch(e => { console.log(e); process.exit(1); });
