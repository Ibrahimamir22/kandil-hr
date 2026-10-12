// v0.46.0 UI (CHG-99): calmer side menu — one section open at a time, the open screen in its section colour with white text,
// a «section › screen» path above the title, administration behind the gear on one settings page, no dots in the menu.
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
const hr = api('users.save', tO, { Email: 'hr@t.com', Full_Name_AR: 'منى' }).User_ID; api('users.setRoles', tO, { User_ID: hr, roles: [{ Role_Code: 'HR_MANAGER' }], reason: 'x' });
const mg = api('users.save', tO, { Email: 'mg@t.com', Full_Name_AR: 'مدير' }).User_ID;
const tH = login('hr@t.com'), tM = login('mg@t.com');
const OUT = process.env.SHOTS || '.';
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
const { navClick } = require('./navhelp');
(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 950 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const as = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const openGroups = () => page.$$eval('#nav .navg.open', a => a.map(x => x.dataset.g));
  await as(tO);
  // administration is not in the menu, the gear is; no dots
  for (const v of ['users', 'config', 'audit', 'online', 'demo']) if (await page.$('#nav [data-v="' + v + '"]')) errors.push('admin item in the menu: ' + v);
  if (!(await page.$('#nav .navgear[data-v="settings"]'))) errors.push('the gear');
  if (await page.$('#nav .sdot')) errors.push('no dots in the menu');
  // v0.46.1: every label on one line and whole (all sections open, the owner has the most items)
  await page.evaluate(() => { each('#nav .navg', b => b.classList.add('open')); each('#nav .navkids', k => k.classList.add('open')); });
  const lines = await page.$$eval('#nav .nav > span:not(.count)', a => a.map(s => [s.textContent, s.getClientRects().length, s.scrollWidth - s.clientWidth]).filter(x => x[1] !== 1 || x[2] > 0));
  if (lines.length) errors.push('labels not on one whole line: ' + JSON.stringify(lines));
  await page.screenshot({ path: OUT + '/v0461-1-labels.png' });
  await page.evaluate(() => { S.navOpen = {}; renderShellNavOnly(); navMark(); });
  // one section at a time
  await page.click('#nav .navg[data-g="req"]'); await page.click('#nav .navg[data-g="orgg"]');
  let og = await openGroups(); if (og.join() !== 'orgg') errors.push('one open section: ' + og);
  await page.click('#nav [data-v="jds"]'); await page.waitForSelector('tr[data-jd]');
  const on = await page.$eval('#nav .nav.on', b => [b.dataset.v, getComputedStyle(b).color, getComputedStyle(b).backgroundColor]);
  if (on[0] !== 'jds' || on[1] !== 'rgb(255, 255, 255)' || on[2] === 'rgba(0, 0, 0, 0)') errors.push('the open screen in its colour with white text: ' + on);
  let crumb = await page.textContent('.pagehead .crumb');
  if (!/الهيكل والموظفين/.test(crumb) || !/الأوصاف الوظيفية/.test(crumb)) errors.push('path: ' + crumb);
  await page.screenshot({ path: OUT + '/v0460-1-menu.png' });
  // a sub-page: the parent is a link back
  await page.click('tr[data-jd="' + code + '"]'); await page.waitForSelector('#jdBody');
  if (!(await page.$('.pagehead .crumb [data-crumb="jds"]'))) errors.push('sub-page path links to its parent');
  await page.click('.pagehead .crumb [data-crumb="jds"]'); await page.waitForSelector('tr[data-jd]');
  // moving to a screen in another section opens that section and closes this one
  await page.evaluate(() => go('reqs')); await page.waitForTimeout(300);
  og = await openGroups(); if (og.join() !== 'req') errors.push('moving opens the screen\'s section only: ' + og);
  // the gear → settings page in groups; an admin screen keeps the gear lit and its path
  await page.click('#nav [data-v="settings"]'); await page.waitForSelector('#setList');
  const grp = await page.$$eval('#setList .setgrp h3', a => a.map(x => x.textContent));
  if (grp.length !== 4) errors.push('four groups for the owner: ' + grp);
  if (!(await page.$('#setScope'))) errors.push('audience list for the owner');
  await page.screenshot({ path: OUT + '/v0460-2-settings.png', fullPage: true });
  await page.click('#setList [data-v="users"]'); await page.waitForTimeout(400);
  if ((await page.$eval('#nav .nav.on', b => b.dataset.v)) !== 'settings') errors.push('the gear stays lit on an admin screen');
  crumb = await page.textContent('.pagehead .crumb');
  if (!/الإدارة والإعدادات/.test(crumb) || !/المستخدمين/.test(crumb)) errors.push('admin path: ' + crumb);
  // the new-user form explains how a consultant account is made (a role, not a job)
  await page.click('#uNew'); await page.waitForSelector('#uConsHint');
  if (!/دور مش وظيفة/.test(await page.textContent('#uConsHint')) || !/«الأدوار»/.test(await page.textContent('#uConsHint'))) errors.push('the consultant hint in the user form');
  await page.evaluate(() => closeModal());
  await navClick(page, 'audit'); await page.waitForTimeout(400);
  if ((await page.evaluate(() => S.view)) !== 'audit') errors.push('the nav helper reaches an admin screen through the gear');
  // HR manager: settings lists only his screens; a plain manager has no gear
  await as(tH); await page.click('#nav [data-v="settings"]'); await page.waitForSelector('#setList');
  if (await page.$('#setList [data-v="demo"]') || await page.$('#setList [data-v="config"]') || await page.$('#setScope')) errors.push('HR manager sees only his screens');
  await as(tM); if (await page.$('#nav [data-v="settings"]')) errors.push('a manager with no admin screen has no gear');
  // phone: the gear is one item of the bottom bar, nothing overflows
  await as(tO); await page.setViewportSize({ width: 390, height: 800 }); await page.evaluate(() => go('jds')); await page.waitForTimeout(400);
  if (!(await page.$('#nav [data-v="settings"]'))) errors.push('the gear on the phone');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 2) errors.push('phone overflows by ' + over);
  await page.screenshot({ path: OUT + '/v0460-3-phone.png' });
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui49 OK');
})().catch(e => { console.log(e); process.exit(1); });
