// v0.45.0 UI (CHG-96): HR previews and starts a manager review round from the JD screen; the manager finds it in
// «المطلوب منك», reads the draft (no grade) and answers with notes; HR sees the note, exports and closes the round.
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
api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'العمليات', 'الدهان', 'خط الرش', '', '', 'مشرف الرش', 'العبور', '', 'Y', '8', ''],
  ['قنديل مصر', 'العمليات', 'الدهان', 'خط الرش', '', '', 'فني رش', 'العبور', 'مشرف الرش', '', '5', ''],
  ['قنديل مصر', 'الجودة', '', '', '', '', 'مدير الجودة', 'العبور', '', 'Y', '13', ''],
  ['قنديل مصر', 'الجودة', '', '', '', '', 'أخصائي جودة', 'العبور', 'مدير الجودة', '', '6', '']].map(r => r.join('\t')).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
const sup = api('users.save', tO, { Email: 'sup@t.com', Full_Name_AR: 'مشرف الرش', Position_ID: P['مشرف الرش'].Position_ID }).User_ID;
const tSup = login('sup@t.com');
const resp = Array.from({ length: 8 }, (_, i) => 'مسؤولية رقم ' + (i + 1) + ' بنتيجتها');
['فني رش', 'أخصائي جودة'].forEach(t => api('jd.save', tO, { Job_Code: P[t].Job_Code, Purpose: 'الغرض من وظيفة ' + t + ' بوضوح', Career_Level: 'JL2', resp }));
const OUT = process.env.SHOTS || '.';
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 950 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const as = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  // HR: preview and start from the JD screen
  await as(tO);
  await page.evaluate(() => go('jds')); await page.waitForSelector('#jdRev'); await page.click('#jdRev');
  await page.waitForSelector('#jrPrev'); await page.click('#jrPrev'); await page.waitForSelector('#jrGo');
  const pv = await page.textContent('#jrPv');
  if (!/مشرف الرش/.test(pv)) errors.push('the preview names the manager');
  if (!/مالوش حساب/.test(pv) || !/أخصائي جودة/.test(pv)) errors.push('the preview lists the job whose manager has no account');
  await page.screenshot({ path: OUT + '/v0450-1-preview.png', fullPage: true });
  await page.click('#jrGo'); await page.waitForSelector('#jrTbl');
  if (!/فني رش/.test(await page.textContent('#jrTbl'))) errors.push('the round table after starting');
  if (!mails.some(m => m.to === 'sup@t.com' && /مراجعتك/.test(m.subject))) errors.push('the manager got the e-mail');
  // the manager: inbox → list → the draft → notes
  await as(tSup);
  await page.waitForSelector('.todo-row[data-cat] [data-go="jdrmine"]', { timeout: 8000 }).catch(() => errors.push('the inbox item'));
  await page.screenshot({ path: OUT + '/v0450-2-inbox.png' });
  await page.click('.todo-go[data-go="jdrmine"]'); await page.waitForSelector('tr[data-jr]');
  await page.click('tr[data-jr]'); await page.waitForSelector('#jvSave');
  const body = await page.textContent('#main');
  if (!/الغرض من وظيفة فني رش/.test(body)) errors.push('the manager reads the draft');
  if (/Job Level|الدرجة/.test(body)) errors.push('no grade on the manager\'s screen');
  await page.click('#jvSave'); await page.waitForSelector('#jvMsg .msg');
  if (!/اختار «موافق» أو «عندي ملاحظات»/.test(await page.textContent('#jvMsg'))) errors.push('saving with no choice says what is missing: ' + await page.textContent('#jvMsg'));
  await page.check('input[name="jvD"][value="NOTES"]'); await page.fill('#jvC', 'المسؤولية 3 بتاعة المشرف مش الفني');
  await page.screenshot({ path: OUT + '/v0450-3-review.png', fullPage: true });
  await page.click('#jvSave'); await page.waitForSelector('tr[data-jr]');
  if (!/عنده ملاحظات/.test(await page.textContent('#jmBox'))) errors.push('the answer shows in his list');
  // HR: the note, export, close
  await as(tO);
  await page.evaluate(() => go('jdrev')); await page.waitForSelector('#jrTbl');
  if (!/المسؤولية 3 بتاعة المشرف/.test(await page.textContent('#jrTbl'))) errors.push('HR sees the note');
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('#jrCsv'); const d = await dl;
  if (!d) errors.push('the notes export'); else { const txt = require('fs').readFileSync(await d.path(), 'utf8'); if (!/المسؤولية 3 بتاعة المشرف/.test(txt) || !/عنده ملاحظات/.test(txt)) errors.push('the export carries the note'); }
  await page.screenshot({ path: OUT + '/v0450-4-round.png', fullPage: true });
  await page.click('#jrClose'); await page.click('#mActions .btn.primary');
  await page.waitForFunction(() => /مقفولة/.test(document.getElementById('jrBox') ? document.getElementById('jrBox').textContent : ''), null, { timeout: 8000 }).catch(() => errors.push('the round closes'));
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui46 OK');
})().catch(e => { console.log(e); process.exit(1); });
