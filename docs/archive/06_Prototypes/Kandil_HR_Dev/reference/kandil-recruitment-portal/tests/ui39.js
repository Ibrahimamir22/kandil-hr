// v0.38.0 UI: the candidate page's consent alert and link, the public consent page, the apply form's privacy questions
// (salary range, relative, accommodation, disability, under 18 with a guardian), and the usage-policy gate.
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
const T = '\t';
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
ctx.__consentReal = true;
const tO = login('owner@test.com');
api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4']].map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
const rec = api('users.save', tO, { Email: 'rec@t.com', Full_Name_AR: 'سارة' }).User_ID; api('users.setRoles', tO, { User_ID: rec, roles: [{ Role_Code: 'RECRUITER' }], reason: 'x' });
const rm = api('users.save', tO, { Email: 'rm@t.com', Full_Name_AR: 'مدير التوظيف' }).User_ID; api('users.setRoles', tO, { User_ID: rm, roles: [{ Role_Code: 'RECRUITMENT_MANAGER' }], reason: 'x' });
const mgr = api('users.save', tO, { Email: 'mgr@t.com', Full_Name_AR: 'مدير الحسابات', Position_ID: P['مدير الحسابات'].Position_ID }).User_ID;
const tR = login('rec@t.com'), tM = login('rm@t.com');
const rq = api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'محتاجين محاسب تكاليف للمصنع', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 2 }] });
fresh(); const V = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0];
api('vac.assign', tM, { Vacancy_ID: V.Vacancy_ID, Lead_Recruiter_ID: rec }); api('vac.update', tM, { Vacancy_ID: V.Vacancy_ID, action: 'OPEN' });
fresh(); ctx.update_('VACANCIES', V.Vacancy_ID, { Apply_Enabled: 'Y', Apply_Code: ctx.get_('VACANCIES', V.Vacancy_ID).Apply_Code || 'APPLY39X' }, 'x');
fresh(); const CODE = ctx.get_('VACANCIES', V.Vacancy_ID).Apply_Code;
const C = api('cand.create', tR, { Vacancy_ID: V.Vacancy_ID, Full_Name: 'كريم عادل منصور', Mobile: '01011112222', Source: 'WALK_IN', consent: 'Y' }).application;

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
  const openTok = async (tok, sel) => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector(sel || '.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0380-' + n + '.png', fullPage: true });

  // ---- candidate page: the consent alert and the link
  await openTok(tR);
  await page.evaluate(id => go('app', id), C.Application_ID); await page.waitForSelector('#aConsent');
  if (!/لسه ماوافقش بنفسه/.test(await page.textContent('#main'))) errors.push('consent alert text');
  await page.click('#aConsent'); await page.waitForSelector('#clCopy');
  const txt = await page.inputValue('#mBody textarea');
  if (!/\?consent=[A-Za-z0-9]{20,}/.test(txt)) errors.push('link in the WhatsApp text: ' + txt);
  await shot('1-consent-link');
  const tok = /\?consent=([A-Za-z0-9]+)/.exec(txt)[1];
  // ---- the public consent page
  const cp = await browser.newPage({ viewport: { width: 390, height: 844 } }); cp.on('pageerror', e => errors.push('consent page: ' + e.message));
  await cp.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const cph = fs.readFileSync(path.join(__dirname, '..', 'src', 'ConsentPage.html'), 'utf8').replace(/<\?=\s*token\s*\?>/, tok).replace('<script>', shim + '<script>');
  await cp.setContent(cph); await cp.waitForSelector('#go');
  await cp.click('#go'); await cp.waitForSelector('.msg.err');
  await cp.check('#c1'); await cp.check('#c2'); await cp.click('#go'); await cp.waitForSelector('.msg.ok');
  await cp.screenshot({ path: OUT + '/v0380-consent-page.png', fullPage: true });
  fresh(); if (ctx.get_('PERSONS', C.Person_ID).Consent_Version !== String(ctx.cfg_('PRIVACY_VERSION', '1'))) errors.push('consent saved from the page');
  const w = await cp.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('consent page overflow: ' + w);
  // ---- the apply form
  const ap = await browser.newPage({ viewport: { width: 1000, height: 1400 } }); ap.on('pageerror', e => errors.push('apply: ' + e.message));
  await ap.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const aph = fs.readFileSync(path.join(__dirname, '..', 'src', 'Apply.html'), 'utf8');
  await ap.setContent(aph.replace(/<\?=\s*code\s*\?>/, CODE).replace(/<\?=\s*src\s*\?>/, '').replace(/<\?=\s*lang\s*\?>/, 'ar').replace(/<\?=\s*ad\s*\?>/, '').replace('<script>', shim + '<script>'));
  await ap.waitForSelector('#f_Expected_Salary_Max');
  if (await ap.$('#f_Current_Salary')) errors.push('apply: no current salary field any more');
  await ap.check('input[name="rel"][value="Y"]'); await ap.waitForSelector('#f_Relative_Name:visible');
  await ap.check('#cMinor'); await ap.waitForSelector('#f_Guardian_Name:visible');
  if (!(await ap.$('#cDis')) || !(await ap.$('#f_Accommodation'))) errors.push('apply: accommodation / disability');
  await ap.screenshot({ path: OUT + '/v0380-apply.png', fullPage: true });
  // ---- the usage-policy gate
  fresh(); ctx.update_('CONFIG', 'USAGE_POLICY_REQUIRED', { Config_Value: 'Y' }, 'x');
  await openTok(login('mgr@t.com'), '.login.gate'); await page.waitForSelector('#polOk');
  if (!/مؤشرات خدمة/.test(await page.textContent('.ndabox'))) errors.push('policy text with the service indicators');
  await shot('2-policy');
  await page.check('#polOk'); await page.click('#polGo'); await page.waitForSelector('.shell');
  fresh(); if (!ctx.get_('USERS', mgr).Policy_Accepted_At) errors.push('policy accepted from the gate');
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui39 OK');
})().catch(e => { console.log(e); process.exit(1); });
