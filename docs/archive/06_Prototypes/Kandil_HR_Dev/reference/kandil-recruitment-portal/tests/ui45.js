// v0.44.2 UI (CHG-93): a job with no level of its own shows the level from its grade, marked «من الدرجة», on the JD list and the
// job page; a new JD starts at that level; the printed JD carries no grade (D-21).
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
api('import.commit', tO, { reason: 'x', text: [['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''], ['قنديل مصر', 'العمليات', 'الدهان', '', '', '', 'مشرف الرش', 'العبور', '', 'Y', '8', '']].map(r => r.join('\t')).join('\n') });
fresh(); const code = ctx.all_('JOBS').find(j => j.Job_Title_AR === 'مشرف الرش').Job_Code;
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
  await page.evaluate(() => { window.open = () => null; window.print = () => {}; });
  await page.evaluate(() => go('jds')); await page.waitForSelector('tr[data-jd="' + code + '"]');
  const row = await page.textContent('tr[data-jd="' + code + '"]');
  if (!/مشرف\s*\(من الدرجة\)/.test(row)) errors.push('the list shows the grade level, marked: ' + row);
  await page.screenshot({ path: OUT + '/v0442-1-list.png' });
  await page.evaluate(c => go('jd', c), code); await page.waitForSelector('#jdEditB');
  if (!/مشرف \(من الدرجة\)/.test(await page.textContent('.pagehead, h1'))) errors.push('the job page head');
  await page.click('#jdEditB'); await page.waitForSelector('#jeL');
  if (await page.$eval('#jeL', s => s.value) !== 'JL4') errors.push('a new JD starts at the level from the grade');
  // a draft, then its print: no grade on it
  fresh(); const r = ctx.api('jd.save', tO, { Job_Code: code, Purpose: 'الإشراف على خط الرش بجودة وفي الموعد', Career_Level: 'JL4', resp: Array.from({ length: 8 }, (_, i) => 'مسؤولية رقم ' + (i + 1) + ' بنتيجتها') });
  if (!r.ok) errors.push('draft: ' + r.error);
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await page.waitForSelector('.shell');
  await page.evaluate(() => { window.open = () => null; window.print = () => {}; });
  await page.evaluate(c => go('jd', c), code); await page.waitForSelector('#jdPrintB'); await page.click('#jdPrintB');
  await page.waitForSelector('#printArea .pr-t', { state: 'attached' });
  const pr = await page.textContent('#printArea');
  if (!/مشرف الرش/.test(pr) || /الدرجة/.test(pr) || /Job Level/.test(pr)) errors.push('the printed JD has the job but no grade');
  await page.emulateMedia({ media: 'print' }); await page.screenshot({ path: OUT + '/v0442-2-print.png', fullPage: true });
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui45 OK');
})().catch(e => { console.log(e); process.exit(1); });
