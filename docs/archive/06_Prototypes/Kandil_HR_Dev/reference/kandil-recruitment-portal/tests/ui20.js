// v0.15.0 UI: sign-in method choice, authenticator set-up gate with recovery codes, sign-in with the app,
// consultant (confidentiality gate, view-only chip, refused save), notes button + notes screen, users screen
// (sign-in column, reset, end date), home nudge; English + phone.
const { chromium } = require('playwright');
const adminItem = async (pg, v) => { await pg.evaluate(() => go('settings')); await pg.waitForSelector('.pagehead'); return pg.$('#setList [data-v="' + v + '"]'); };     // v0.46.0: administration screens behind the gear
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { ctx, mails, fresh, vm } = require('./mocks.js');
const OUT = process.env.SHOTS || '.';
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) { fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x')); mails.length = 0; pub('auth.requestCode', { email }); const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1]; return pub('auth.verifyCode', { email, code }).data.token; }
function b32dec(s) { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; s = s.replace(/\s/g, ''); let bits = 0, val = 0; const out = []; for (const ch of s) { val = (val << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
const stepNow = () => Math.floor(Date.now() / 30000);
function totp(secret, step) { const msg = Buffer.alloc(8); msg.writeUInt32BE(step >>> 0, 4); const h = crypto.createHmac('sha1', b32dec(secret)).update(msg).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000).padStart(6, '0'); }
function enrollApi(tok) { const s = api('mfa.start', tok, {}); api('mfa.confirm', tok, { code: totp(s.secret, stepNow()) }); return s.secret; }

ctx.__keepMfa = true;
ctx.setupSystem(); vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx); fresh(); ctx.bootstrapOwner();
const tO0 = login('owner@test.com');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['محمد عمارة', 'هشام', 'مدير الحسابات', 'منى', 'قنديل مصر', 'القطاع المالي', 'الحسابات', 'محاسب تكاليف', 'الرئيس التنفيذي', 'العبور', 'جدول البدلات', 'عايز فلتر', 'هنضيفه'];

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const openTok = async (tok, sel) => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector(sel || '.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0150-' + n + '.png', fullPage: true });

  // --- owner signed in by email: the set-up gate
  await openTok(tO0, '.login.gate');
  await page.waitForSelector('#mfaKey'); await page.waitForTimeout(600); await shot('1-gate-setup');
  if (!(await page.$('#mfaQr.on svg'))) errors.push('QR code drawn on the page');
  const key = (await page.textContent('#mfaKey')).trim();
  await page.fill('#mfaCode', '000000' === totp(key, stepNow()) ? '111111' : '000000'); await page.click('#mfaGo'); await page.waitForSelector('#mfaMsg .msg.err');
  await page.fill('#mfaCode', totp(key, stepNow())); await page.click('#mfaGo'); await page.waitForSelector('.rcodes code');
  if ((await page.$$('.rcodes code')).length !== 8) errors.push('8 recovery codes shown');
  const rc = await page.$$eval('.rcodes code', a => a.map(x => x.textContent));
  await shot('2-recovery-codes');
  if (!(await page.$('#rcDone[disabled]'))) errors.push('continue waits for "saved"');
  await page.check('#rcOk'); await page.click('#rcDone'); await page.waitForSelector('.shell');
  if (!(await page.$('#btnNote'))) errors.push('notes button on the shell');

  // --- sign in with the app from the login page
  await page.evaluate(() => logoutLocal()); await page.waitForSelector('.seg');
  await shot('3-login-email');
  await page.click('[data-lm="app"]'); await page.waitForSelector('#loginCodeA:visible');
  await page.fill('#loginEmailA', 'owner@test.com'); await page.fill('#loginCodeA', '123456'); await page.click('#btnAppLogin'); await page.waitForSelector('#loginMsg .msg.err');
  await shot('4-login-app-wrong');
  await page.fill('#loginCodeA', totp(key, stepNow() + 1)); await page.click('#btnAppLogin'); await page.waitForSelector('.shell');
  const tO = await page.evaluate(() => S.token);
  // recovery code from the login page
  await page.evaluate(() => logoutLocal()); await page.waitForSelector('#loginCodeA');
  if (!(await page.$('#loginCodeA:visible'))) errors.push('login page remembers the app method');
  await page.fill('#loginCodeA', rc[0]); await page.click('#btnAppLogin'); await page.waitForSelector('.shell');
  await page.waitForFunction(() => /كود استرداد/.test((document.querySelector('.toast') || {}).textContent || ''));

  // --- data: a manager, an HR sector manager, a consultant
  const T = '\t';
  api('import.commit', tO, { reason: 'x', text: [
    ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
    ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
    ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
    ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '6']].map(r => r.join(T)).join('\n') });
  fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
  const mgr = api('users.save', tO, { Email: 'mgr@t.com', Full_Name_AR: 'مدير الحسابات', Position_ID: P['مدير الحسابات'] }).User_ID;
  const hr = api('users.save', tO, { Email: 'hr@t.com', Full_Name_AR: 'منى', Position_ID: '' }).User_ID;
  api('users.setRoles', tO, { User_ID: hr, roles: [{ Role_Code: 'HR_MANAGER' }], reason: 'x' });
  const exp = ctx.addDaysIso_(45).slice(0, 10);
  const C = api('users.save', tO, { Email: 'consult@t.com', Full_Name_AR: 'د. هشام الاستشاري', Access_Expires_At: exp }).User_ID;
  api('users.setRoles', tO, { User_ID: C, roles: [{ Role_Code: 'CONSULTANT' }], reason: 'تقييم النظام' });
  const tHr = login('hr@t.com'); enrollApi(tHr);

  // --- manager: v0.37.0 (CHG-82) the app is set up from the first sign-in, like everyone
  const tM = login('mgr@t.com');
  await openTok(tM, '.login.gate'); await page.waitForSelector('#mfaKey');
  await shot('5-manager-gate');

  // --- consultant: authenticator (API), then the confidentiality page
  const tC = login('consult@t.com'); enrollApi(tC);
  await openTok(tC, '.login.gate'); await page.waitForSelector('#ndaOk');
  if (!/سرية/.test(await page.textContent('.ndabox'))) errors.push('acknowledgement text');
  await shot('7-consultant-nda');
  await page.check('#ndaOk'); await page.click('#ndaGo'); await page.waitForSelector('.shell');
  if (!/عرض فقط/.test(await page.textContent('.chip-ro'))) errors.push('view-only chip');
  if (!(await adminItem(page, 'pay')) || !(await adminItem(page, 'feedback'))) errors.push('consultant sees pay and notes in the menu');
  await shot('8-consultant-home');
  await page.evaluate(() => go('users')); await page.waitForSelector('#uList [data-e]');
  await page.click('#uNew'); await page.fill('#uAr', 'تجربة'); await page.fill('#uEm', 'x@t.com'); await page.click('#mActions .btn.primary');
  await page.waitForSelector('#mMsg .msg.err'); if (!/للعرض فقط/.test(await page.textContent('#mMsg'))) errors.push('save refused for the consultant');
  await shot('9-consultant-refused'); await page.evaluate(() => closeModal());
  await page.evaluate(() => go('pay')); await page.waitForTimeout(600);
  await page.click('#btnNote'); await page.waitForSelector('#nTxt');
  if (!/الرواتب/.test(await page.textContent('#mBody'))) errors.push('note carries the screen title');
  await page.fill('#nTxt', 'جدول البدلات محتاج عمود للمنطقة.'); await shot('10-note');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('.toast');
  fresh(); const fb = ctx.all_('FEEDBACK')[0]; if (!fb || fb.Screen !== 'pay' || !/الرواتب/.test(fb.Screen_Title)) errors.push('note saved with the screen');

  // --- owner: notes screen, users screen
  await openTok(tO); await page.evaluate(() => go('feedback')); await page.waitForSelector('[data-fg]');
  if (!/استشاري/.test(await page.textContent('#fbList'))) errors.push('consultant note marked');
  await page.selectOption('[data-fs]', 'PLANNED'); await page.fill('[data-fr]', 'هنضيفه في الإصدار الجاي.'); await page.click('[data-fg]');
  await page.waitForTimeout(500); await page.click('[data-f=""]'); await page.waitForSelector('.fbreply'); await shot('11-notes-owner');
  await page.evaluate(() => go('users')); await page.waitForSelector('[data-mr]'); await shot('12-users');
  await page.click('[data-mr]'); await page.waitForSelector('#mrWhy'); await page.fill('#mrWhy', 'غيّرت الموبايل — اتأكدت بالتليفون'); await shot('13-reset');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('.toast');
  // v0.36.0: an admin account's reset needs a second person (CHG-77) — the screen sends a request instead
  fresh(); if (!ctx.get_('USER_MFA', hr).Enabled_At) errors.push('admin reset done by one person');
  if (!ctx.all_('DUAL_REQUESTS').some(d => d.Kind === 'MFA_RESET' && d.Ref_ID === hr && d.Status === 'PENDING')) errors.push('reset request from the users screen');
  await page.click('#btnMe'); await page.waitForSelector('#secNew'); await shot('14-security-modal'); await page.evaluate(() => closeModal());
  // consultant sees the reply
  await openTok(tC); await page.evaluate(() => go('feedback')); await page.waitForSelector('.fbreply'); await shot('15-notes-consultant');

  // --- English
  api('me.setLang', tO, { lang: 'en' }); api('me.setLang', tC, { lang: 'en' });
  async function leftovers(name) {
    const found = await page.evaluate(() => {
      const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE|TEXTAREA/.test(p.nodeName) || p.closest('[data-nt]')) continue;
        if (p.closest('.hidden') || p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim().replace(/\s+/g, ' ')); }
      return [...out];
    });
    const real = found.filter(s => !DATA.some(d => s.indexOf(d) >= 0));
    if (real.length) console.log('[' + name + '] Arabic left: ' + real.join(' | '));
    real.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push(name + ': dictionary text left in Arabic: ' + s));
    await page.screenshot({ path: OUT + '/v0150-en-' + name + '.png', fullPage: true });
  }
  await openTok(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  await page.evaluate(() => go('feedback')); await page.waitForSelector('#fbList .fbcard, #fbList .msg'); await page.waitForTimeout(300); await leftovers('notes');
  await page.evaluate(() => go('users')); await page.waitForSelector('#uList table'); await page.waitForTimeout(300); await leftovers('users');
  await page.click('#btnMe'); await page.waitForSelector('#secNew'); await leftovers('security'); await page.evaluate(() => closeModal());
  await page.click('#btnNote'); await page.waitForSelector('#nTxt'); await leftovers('note'); await page.evaluate(() => closeModal());
  await openTok(tC); await page.waitForTimeout(300); await leftovers('consultant-home');
  await page.evaluate(() => logoutLocal()); await page.waitForSelector('.seg'); await leftovers('login-app');
  await page.click('[data-lm="email"]'); await leftovers('login-email');
  const tM2 = login('mgr@t.com'); api('me.setLang', tM2, { lang: 'en' });
  await openTok(tM2, '.login.gate'); await page.waitForSelector('#mfaKey'); await leftovers('manager-gate');
  // gate in English: a fresh HR user
  const hr2 = api('users.save', tO, { Email: 'hr2@t.com', Full_Name_AR: 'منى', Lang: 'en' }).User_ID; api('users.setRoles', tO, { User_ID: hr2, roles: [{ Role_Code: 'HR_STAFF' }], reason: 'x' });
  await openTok(login('hr2@t.com'), '.login.gate'); await page.waitForSelector('#mfaKey'); await leftovers('gate');

  // --- phone
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  api('me.setLang', tO, { lang: 'ar' });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  for (const v of ['feedback', 'users', 'home']) {
    await ph.evaluate(x => go(x), v); await ph.waitForTimeout(700);
    await ph.screenshot({ path: OUT + '/v0150-phone-' + v + '.png', fullPage: true });
    const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on ' + v + ': ' + w);
  }
  const hr3 = api('users.save', tO, { Email: 'hr3@t.com', Full_Name_AR: 'سارة' }).User_ID; api('users.setRoles', tO, { User_ID: hr3, roles: [{ Role_Code: 'RECRUITER' }], reason: 'x' });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(login('hr3@t.com')) + ' || loadToken();')); await ph.waitForSelector('#mfaKey'); await ph.waitForTimeout(500);
  await ph.screenshot({ path: OUT + '/v0150-phone-gate.png', fullPage: true });
  if (await ph.evaluate(() => document.documentElement.scrollWidth) > 392) errors.push('phone overflow on the gate');
  await ph.evaluate(() => logoutLocal()); await ph.waitForSelector('.seg'); await ph.screenshot({ path: OUT + '/v0150-phone-login.png', fullPage: true });
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui20 OK');
})().catch(e => { console.error(e); process.exit(1); });
