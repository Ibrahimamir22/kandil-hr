// v0.41.0 UI: a transfer opened by the receiving manager — the current manager's opinion buttons and the handover list;
// the transfer form with the temporary type; «arriving tomorrow» for the IT owner; the custody log; freezing a vacancy.
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
const tO = login('owner@test.com');
api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'مدير الخزينة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'أمين خزينة', 'العبور', '', '', '', '3']].map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x'); ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, 'x');
const user = (email, name, pos, roles) => { const u = api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }).User_ID; if (roles) api('users.setRoles', tO, { User_ID: u, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }); return u; };
const acc = user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID), trs = user('trs@t.com', 'مدير الخزينة', P['مدير الخزينة'].Position_ID);
const hr = user('hr@t.com', 'منى', '', ['HR_MANAGER']), it = user('it@t.com', 'تكنولوجيا', '', null);
const tA = login('acc@t.com'), tT = login('trs@t.com'), tH = login('hr@t.com'), tI = login('it@t.com');
['E1|أحمد علي حسن|محاسب تكاليف', 'E2|كريم محمود سالم|محاسب تكاليف', 'E3|هاني فؤاد علي|أمين خزينة'].forEach(x => { const [id, n, p] = x.split('|');
  api('emp.save', tH, { isNew: 'Y', Employee_ID: id, Full_Name: n, Position_ID: P[p].Position_ID, Hire_Date: '2024-01-01', Employment_Kind: 'PERMANENT' }); });
fresh(); ctx.update_('CONFIG', 'ONB_IT_USERS', { Config_Value: 'it@t.com' }, 'x');
const today = ctx.today_();
// a transfer opened by the receiving manager, waiting for the current manager's opinion
const TR = api('trf.submit', tT, { Employee_ID: 'E1', To_Position_ID: P['أمين خزينة'].Position_ID, Effective_Date: ctx.addDaysYmd_(today, 7), Reason: 'محتاجين أمين خزينة زيادة في الإقفال', Pay_Note: 'نفس المرتب' });
// an onboarding program with an IT owner, and a joiner tomorrow
fresh(); const loc = P['أمين خزينة'].Location_ID;
const OB = ctx.onbCreate_(hr, { Employee_ID: 'E3', Full_Name: 'هاني فؤاد علي', Position_ID: P['أمين خزينة'].Position_ID, Location_ID: loc, Start_Date: today, Template_ID: 'ONT-OFFICE' });
const rq = api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'محتاجين أمين خزينة للاختبار', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['أمين خزينة'].Position_ID, Requested_HC: 1 }] });
fresh(); const V = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0];
ctx.insert_('PERSONS', { Person_ID: 'PER-U1', Full_Name: 'وليد سمير حسن', Status: 'Active' }, 'x');
ctx.insert_('JOININGS', { Joining_ID: 'JN-U1', Application_ID: 'APP-U1', Vacancy_ID: V.Vacancy_ID, Person_ID: 'PER-U1', Status: 'PENDING', Planned_Date: ctx.nextWorkDay_(), Date_Confirmed_At: ctx.nowIso_() }, 'x');
fresh(); ctx.onbCreate_(hr, { joining: { Joining_ID: 'JN-U1', Person_ID: 'PER-U1' }, Full_Name: 'وليد سمير حسن', Position_ID: V.Position_ID, Location_ID: V.Location_ID, Start_Date: ctx.nextWorkDay_(), Template_ID: 'ONT-OFFICE' });

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
  const shot = n => page.screenshot({ path: OUT + '/v0410-' + n + '.png', fullPage: true });
  // ---- the current manager: opinion buttons, handover list
  await openTok(tA);
  await page.evaluate(id => go('trf', id), TR.id); await page.waitForSelector('#trA');
  if (!/موافق \(رأيي\)/.test(await page.textContent('#trA')) || !/معترض/.test(await page.textContent('#trR'))) errors.push('opinion buttons');
  if (!/قائمة التسليم/.test(await page.textContent('#trfD')) || (await page.$$('#trHo [data-ho]')).length !== 4) errors.push('handover list of 4');
  await page.click('#trHo [data-ho="0"]'); await page.waitForFunction(() => document.querySelector('#trHo [data-ho="0"]') && document.querySelector('#trHo [data-ho="0"]').checked, null, { timeout: 8000 }).catch(() => errors.push('handover ticked'));
  await page.click('#trR'); await page.waitForSelector('#trNt'); await page.fill('#trNt', 'محتاجه في الإقفال'); await page.click('#mActions button:first-child');
  await page.waitForFunction(() => /معترض/.test(document.querySelector('.trfsteps') ? document.querySelector('.trfsteps').textContent : ''), null, { timeout: 8000 }).catch(() => errors.push('objection shown on the steps'));
  fresh(); if (ctx.get_('TRANSFER_REQUESTS', TR.id).Status !== 'PENDING') errors.push('objection did not end the request');
  await shot('1-transfer-opinion');
  // ---- HR: the new transfer form with the type
  await openTok(tH);
  await page.evaluate(() => go('transfers')); await page.waitForSelector('#trfNew'); await page.click('#trfNew'); await page.waitForSelector('#tfY');
  await page.selectOption('#tfY', 'TEMPORARY'); await page.waitForSelector('#tfEnd:visible');
  await shot('2-transfer-form');
  await page.evaluate(() => closeModal());
  // ---- onboarding: arriving tomorrow, custody
  await openTok(tI);
  await page.evaluate(() => go('onboarding', 'arrivals')); await page.waitForSelector('.arv');
  if (!/وليد سمير حسن/.test(await page.textContent('#onbBody')) || !/عليك/.test(await page.textContent('#onbBody'))) errors.push('arriving tomorrow with my task');
  await shot('3-arrivals');
  await page.evaluate(id => go('onb', id), OB.Onboarding_ID); await page.waitForSelector('#cusAdd');
  await page.click('#cusAdd'); await page.waitForSelector('#cuI');
  await page.fill('#cuI', 'لابتوب Dell'); await page.fill('#cuS', 'SN-123'); await page.check('#cuG'); await page.click('#mActions button:first-child');
  await page.waitForFunction(() => /لابتوب Dell/.test(document.getElementById('cusBox').textContent), null, { timeout: 8000 }).catch(() => errors.push('custody shown after issue'));
  fresh(); if (!ctx.all_('ONB_CUSTODY').some(c => c.Item === 'لابتوب Dell' && c.Employee_ID === 'E3' && c.Signed === 'Y')) errors.push('custody saved');
  await shot('4-custody');
  // ---- HR: freeze the vacancy
  await openTok(tH);
  await page.evaluate(() => go('vacancies')); await page.waitForTimeout(800);
  await page.evaluate(id => openVacancy(id), V.Vacancy_ID); await page.waitForSelector('[data-va="FREEZE"]');
  await page.click('[data-va="FREEZE"]'); await page.waitForSelector('#vaWhy'); await page.fill('#vaWhy', 'قرار تجميد التعيينات للربع الأخير'); await page.click('#mActions button:first-child');
  await page.waitForTimeout(1200);
  fresh(); if (ctx.get_('VACANCIES', V.Vacancy_ID).Status !== 'FROZEN') errors.push('vacancy frozen from the page');
  await page.evaluate(id => openVacancy(id), V.Vacancy_ID); await page.waitForSelector('[data-va="UNFREEZE"]');
  if (!/مجمّد بقرار الإدارة/.test(await page.textContent('#mBody'))) errors.push('frozen pill');
  await shot('5-frozen');
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui42 OK');
})().catch(e => { console.log(e); process.exit(1); });
