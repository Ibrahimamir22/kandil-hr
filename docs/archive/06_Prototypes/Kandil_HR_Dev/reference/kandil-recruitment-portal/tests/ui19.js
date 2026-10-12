// v0.14.1 UI: separate consents on the apply page, privacy card on the candidate page, pool consent, privacy screens
// (requests, retention, legal entities, settings); English + phone.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks.js');
const OUT = process.env.SHOTS || '.';
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) { fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x')); mails.length = 0; pub('auth.requestCode', { email }); const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1]; return pub('auth.verifyCode', { email, code }).data.token; }
ctx.setupSystem();
for (const [k, v] of [['RETENTION_REJECTED_MONTHS', '6'], ['RETENTION_DNJ_MONTHS', '3'], ['RETENTION_POOL_MONTHS', '12']]) ctx.update_('CONFIG', k, { Config_Value: v }, 'x');   // the earlier values this test was written with (v0.38: 24)
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx); fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com'); const T = '\t';
api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '6']].map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) { const u = api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }); if (roles) api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }); return u.User_ID; }
user('mgr@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID); user('sec@t.com', 'مدير قطاع HR', '', ['HR_SECTOR_MANAGER']); user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']);
const rec = user('rec@t.com', 'سارة عبد الله', '', ['RECRUITER']);
const t = { sec: login('sec@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), mgr: login('mgr@t.com') };
const JOB = P['محاسب تكاليف'].Job_Code;
fresh(); ctx.update_('JOBS', JOB, { Grade_Code: '7', Collar: 'W' }, 'x'); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const rq = api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'شاغر محاسب تكاليف للواجهة', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 2 }] });
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
api('vac.assign', t.rm, { Vacancy_ID: VAC, Lead_Recruiter_ID: rec }); api('vac.update', t.rm, { Vacancy_ID: VAC, action: 'OPEN' });
function cand(name, mobile, extra) { const a = api('cand.create', t.rec, Object.assign({ Vacancy_ID: VAC, Full_Name: name, Mobile: mobile, Source: 'WALK_IN', consent: 'Y' }, extra || {})).application.Application_ID; api('cand.move', t.rec, { Application_ID: a, to: 'SHORTLISTED' }); return a; }
const A1 = cand('أحمد علي حسن', '01011112222', { Current_Salary: '5500', Expected_Salary: '9000' }), A2 = cand('كريم محمود سالم', '01033334444');
fresh(); const today = ctx.today_();
for (const A of [A1, A2]) { const iv = api('int.create', t.rec, { Application_ID: A, Round_ID: 'R1', Date: today, Time: '09:00', Mode: 'PHONE', panel: [{ User_ID: rec, Role: 'LEAD' }] }).interview; api('int.action', t.rec, { Interview_ID: iv.Interview_ID, action: 'START' }); }

const shim0 = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['مدير القطاع المالي', 'محاسب تكاليف', 'مدير الحسابات', 'الرئيس التنفيذي', 'سارة', 'محمد عمارة', 'مدير التوظيف', 'مدير قطاع HR', 'قنديل مصر', 'أحمد', 'كريم', 'العبور', 'القطاع المالي', 'الحسابات', 'شاغر',
  'خبرة', 'وقّع', 'الخطاب', 'فترة اختبار', 'المدير وافق', 'signed', 'تكاليف', 'هيكل', 'محاسب', 'سرعة'];


fresh(); const company = ctx.all_('ORG_UNITS').find(u => u.Unit_Type === 'COMPANY').Org_Unit_ID;
api('privacy.entity', tO, { Name_AR: 'شركة قنديل للنجف', Name_EN: 'Kandil Lighting Co.', units: [company] });
api('privacy.save', tO, { cfg: { PRIVACY_EMAIL: 'privacy@kandil.test', PRIVACY_FULL_AR: 'الإشعار الكامل — مسودة للاختبار.' } });
const code = api('cand.applySettings', t.rec, { Vacancy_ID: VAC, Apply_Enabled: 'Y' }).code;
const applyHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'Apply.html'), 'utf8').replace(/<\?= code \?>/g, code).replace(/<\?= src \?>/g, '').replace(/<\?= lang \?>/g, 'ar').replace(/<\?= ad \?>/g, '').replace('<script>', shim0 + '<script>');
// an old closed candidate for the retention list
api('cand.move', t.rec, { Application_ID: A2, to: 'REJECTED', reasonCode: 'NOT_QUALIFIED' });
fresh(); ctx.update_('APPLICATIONS', A2, { Stage_At: '2025-01-01T10:00:00' }, 'x');
DATA.push('شركة قنديل', 'Kandil Lighting', 'الإشعار الكامل — مسودة', 'منى', 'سعيد');

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const open = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0141-' + n + '.png', fullPage: true });

  // --- apply page (phone)
  const ap = await browser.newPage({ viewport: { width: 390, height: 844 } }); ap.on('pageerror', e => errors.push('apply: ' + e.message));
  await ap.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ap.setContent(applyHtml); await ap.waitForSelector('#f_Full_Name');
  if (!/شركة قنديل للنجف/.test(await ap.textContent('body')) || !(await ap.$('#cTransfer')) || !(await ap.$('#cPool')) || !(await ap.$('#fullLink'))) errors.push('apply page: employer + separate consents + full notice link');
  await ap.fill('#f_Full_Name', 'منى سعيد حسن'); await ap.fill('#f_Mobile', '01055556666'); await ap.selectOption('#f_Governorate', 'القاهرة'); await ap.selectOption('#f_Education', 'BACHELOR');
  await ap.fill('#f_Experience_Years', '3'); await ap.fill('#f_Expected_Salary', '8000');
  await ap.evaluate(() => { ST.t0 = Date.now() - 10000; });
  await ap.check('#consent'); await ap.click('#send'); await ap.waitForTimeout(300);
  if (!/حفظ البيانات/.test(await ap.textContent('#err'))) errors.push('storage consent required on the page');
  await ap.check('#cTransfer'); await ap.click('#send'); await ap.waitForTimeout(300);
  if (!/المرتب/.test(await ap.textContent('#err'))) errors.push('salary consent required when a salary is typed');
  await ap.click('#fullLink'); await ap.check('#cSalary'); await ap.check('#cPool');
  await ap.screenshot({ path: OUT + '/v0141-apply-consents.png', fullPage: true });
  await ap.click('#send'); await ap.waitForFunction(() => /APP-/.test(document.body.textContent), null, { timeout: 8000 });
  fresh(); const newP = ctx.all_('PERSONS').find(p => p.Mobile_Norm === '01055556666' || /منى سعيد/.test(p.Full_Name));
  if (!newP || newP.Pool_Consent !== 'Y' || ctx.find_('CONSENTS', { Person_ID: newP.Person_ID }).length !== 4) errors.push('apply consents not recorded');
  if (await ap.evaluate(() => document.documentElement.scrollWidth) > 392) errors.push('apply page overflow');
  await ap.close();

  // --- recruiter: candidate page privacy card, pool consent
  await open(t.rec);
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('#privCard');
  await page.click('#pcG'); await page.waitForSelector('#pcN'); await page.fill('#pcN', 'وافق في مكالمة'); await page.click('#mActions .btn.primary');
  await page.waitForFunction(() => /قاعدة المرشحين لحد/.test((document.getElementById('privCard') || {}).textContent || ''));
  await (await page.$('#privCard')).screenshot({ path: OUT + '/v0141-privcard.png' });
  await page.click('#aPool'); await page.waitForSelector('#plC'); await shot('pool-dialog'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(400);
  fresh(); if (!ctx.find_('TALENT_POOL', { Status: 'Active' }).length) errors.push('pool add after consent');

  // --- HR manager: privacy screens
  await open(tO);
  await page.evaluate(() => go('privacy', 'requests')); await page.waitForSelector('#dsN'); await shot('1-requests');
  await page.click('#dsN'); await page.waitForSelector('#dqQ'); await page.fill('#dqQ', 'كريم'); await page.waitForSelector('input[name="dqPick"]');
  await page.check('input[name="dqPick"]'); await page.selectOption('#dqK', 'ACCESS'); await page.fill('#dqT', 'عايز نسخة من بياناته'); await shot('2-new-request');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('[data-dsx]');
  const [pop] = await Promise.all([ctxB.waitForEvent('page'), page.click('[data-dsx]')]);
  await pop.waitForLoadState(); await pop.waitForTimeout(400); if (!/كريم محمود سالم/.test(await pop.content())) errors.push('data export'); await pop.screenshot({ path: OUT + '/v0141-3-export.png', fullPage: true }); await pop.close();
  await page.click('[data-dsc]'); await page.fill('#dcO', 'اتبعتله نسخة بالإيميل'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(400);
  await page.evaluate(() => go('privacy', 'retention')); await page.waitForSelector('[data-pg]'); await shot('4-retention');
  await page.click('[data-pg]'); await page.fill('#pgR', 'مدة الاحتفاظ خلصت'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
  fresh(); if (ctx.get_('PERSONS', ctx.get_('APPLICATIONS', A2).Person_ID).Status !== 'Purged') errors.push('purge from retention list');
  await page.evaluate(() => go('privacy', 'entities')); await page.waitForSelector('[data-ene]'); await page.click('[data-ene]'); await page.waitForSelector('#enA'); await shot('5-entity');
  await page.fill('#enC', '12345'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(400);
  fresh(); if (ctx.all_('LEGAL_ENTITIES')[0].Commercial_Reg !== '12345') errors.push('entity edit');
  await page.evaluate(() => go('privacy', 'settings')); await page.waitForSelector('#psSave2'); await shot('6-settings');
  if (!(await page.$('#RETENTION_ENABLED:not([disabled])'))) errors.push('owner can switch deletion');

  // --- English
  api('me.setLang', tO, { lang: 'en' });
  await open(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
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
    await page.screenshot({ path: OUT + '/v0141-en-' + name + '.png', fullPage: true });
  }
  for (const tb of ['requests', 'retention', 'entities', 'settings']) { await page.evaluate(x => go('privacy', x), tb); await page.waitForSelector('#prBody table, #prBody .msg, #psSave2'); await page.waitForTimeout(300); await leftovers('privacy-' + tb); }
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('#privCard'); await page.waitForTimeout(300); await leftovers('app');
  // --- phone
  api('me.setLang', tO, { lang: 'ar' });
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  for (const tb of ['requests', 'retention', 'entities', 'settings']) {
    await ph.evaluate(x => go('privacy', x), tb); await ph.waitForTimeout(700);
    await ph.screenshot({ path: OUT + '/v0141-phone-' + tb + '.png', fullPage: true });
    const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on ' + tb + ': ' + w);
  }
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui19 OK');
})().catch(e => { console.error(e); process.exit(1); });
