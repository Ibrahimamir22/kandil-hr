// v0.39.0 UI: «send the candidate his page» from the candidate page, and the candidate's own page on a phone: consent,
// completing data with the preferred channel, confirming an invited interview.
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
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tR) + ' || loadToken();')); await page.waitForSelector('.shell');
  await page.evaluate(id => go('app', id), C.Application_ID); await page.waitForSelector('#aSelf');
  await page.click('#aSelf'); await page.waitForSelector('#slCopy');
  const txt = await page.inputValue('#mBody textarea');
  if (!/\?me=[A-Za-z0-9]{20,}/.test(txt)) errors.push('page link in the text: ' + txt);
  await page.screenshot({ path: OUT + '/v0390-link.png' });
  const tok = /\?me=([A-Za-z0-9]+)/.exec(txt)[1];
  // an invited interview
  api('cand.move', tR, { Application_ID: C.Application_ID, to: 'CONTACTED' });
  fresh(); ctx.update_('PERSONS', C.Person_ID, { Consent_Version: '' }, 'x');
  const sp = await browser.newPage({ viewport: { width: 390, height: 844 } }); sp.on('pageerror', e => errors.push('self page: ' + e.message));
  await sp.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'SelfPage.html'), 'utf8').replace(/<\?=\s*token\s*\?>/, tok).replace('<script>', shim + '<script>');
  await sp.setContent(html); await sp.waitForSelector('#cGo');
  await sp.check('#c1'); await sp.check('#c2'); await sp.click('#cGo'); await sp.waitForSelector('#save');
  await sp.fill('#f_City', 'مدينة نصر'); await sp.selectOption('#f_Preferred_Channel', 'WHATSAPP'); await sp.click('#save'); await sp.waitForSelector('.msg.ok');
  fresh(); const per = ctx.get_('PERSONS', C.Person_ID);
  if (per.City !== 'مدينة نصر' || per.Preferred_Channel !== 'WHATSAPP') errors.push('data saved from the page: ' + per.City + ' ' + per.Preferred_Channel);
  await sp.screenshot({ path: OUT + '/v0390-self-page.png', fullPage: true });
  const w = await sp.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('self page overflow: ' + w);
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui40 OK');
})().catch(e => { console.log(e); process.exit(1); });
