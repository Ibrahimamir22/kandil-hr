// v0.9.0 UI (3B-2): agencies tab, referral picker on the add-candidate form, attribution card (owner, source, referral,
// agency terms), hand-over, referrals register with the bonus decision; English and phone.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks.js');
const OUT = process.env.SHOTS || '.';
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) { fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x')); mails.length = 0; pub('auth.requestCode', { email }); const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1]; return pub('auth.verifyCode', { email, code }).data.token; }
ctx.setupSystem(); vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx); fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com'); const T = '\t';
api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4']].map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
function user(email, name, pos, roles) { const u = api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }); if (roles) api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }); return u.User_ID; }
user('cfo@t.com', 'هشام المدير المالي', P['مدير القطاع المالي']); user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات']);
user('hr@t.com', 'منى', '', ['HR_MANAGER']); user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']);
const rec = user('rec@t.com', 'سارة عبد الله', '', ['RECRUITER']); const rec2 = user('rec2@t.com', 'علي حسن', '', ['RECRUITER']);
const t = { acc: login('acc@t.com'), cfo: login('cfo@t.com'), hr: login('hr@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com') };
const rq = api('req.submit', t.acc, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'ضغط شغل في الإقفال الشهري', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 2 }] });
api('req.action', t.cfo, { Request_ID: rq.Request_ID, action: 'APPROVE' });
const vacId = api('req.action', t.hr, { Request_ID: rq.Request_ID, action: 'APPROVE', hr: { HR_Classification: 'NORMAL' } }).vacancies[0];
api('vac.assign', t.rm, { Vacancy_ID: vacId, Lead_Recruiter_ID: rec, recruiters: [rec2] }); api('vac.update', t.rm, { Vacancy_ID: vacId, action: 'OPEN' });
fresh();
[['1001', 'خالد محمود'], ['1002', 'هبة سامي']].forEach(e => ctx.insert_('EMPLOYEES', { Employee_ID: e[0], Full_Name: e[1], Position_ID: P['محاسب تكاليف'], Location_ID: '', Hire_Date: '2020-01-01',
  Employment_Kind: 'PERMANENT', Job_Type: '', Status: 'Active', Exit_Date: '', Exit_Reason: '', Exit_Note: '', Source: 'TEST', Notes: '' }, 'x'));

const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['مدير القطاع المالي', 'محاسب تكاليف', 'مدير الحسابات', 'الرئيس التنفيذي', 'هشام', 'منى', 'سارة', 'علي', 'محمد عمارة', 'مدير التوظيف', 'قنديل مصر',
  'خالد', 'هبة', 'أحمد', 'سامح', 'مكتب النيل', 'جار', 'بديل مجاني', 'توزيع', 'العبور', 'القطاع المالي', 'الحسابات', 'ضغط شغل'];

(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const open = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v090-' + n + '.png', fullPage: true });

  // --- recruitment manager adds an agency
  await open(t.rm);
  await page.evaluate(() => go('sources', 'agencies')); await page.waitForSelector('#agNew');
  await page.click('#agNew'); await page.waitForSelector('#agA');
  await page.fill('#agA', 'مكتب النيل للتوظيف'); await page.selectOption('#agF', 'MONTHS_SALARY'); await page.fill('#agV', '1');
  await page.fill('#agG', '90'); await page.fill('#agO', '60'); await page.fill('#agR', 'بديل مجاني خلال الضمان'); await page.fill('#agP', '01234567890');
  await shot('1-agency-form');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('[data-ag]');
  await shot('2-agencies');
  // --- recruiter adds a referred candidate through the picker
  await open(t.rec);
  await page.evaluate(id => go('candnew', id), vacId); await page.waitForSelector('#cnS');
  await page.selectOption('#cnS', 'REFERRAL'); await page.waitForSelector('#cnrQ', { state: 'visible' });
  await page.fill('#cnrQ', 'خالد'); await page.waitForSelector('#cnrR [data-ep]'); await page.click('#cnrR [data-ep]');
  await page.fill('#cnRel', 'جار');
  await page.fill('#pf_Full_Name', 'أحمد علي حسن'); await page.fill('#pf_Mobile', '01011112222');
  await page.check('#cnOk');
  await shot('3-new-referral');
  await page.click('#cnSave'); await page.waitForSelector('#atOwner').catch(async () => errors.push('candidate not created: ' + (await page.textContent('#cnMsg'))));
  fresh(); const ref = ctx.all_('REFERRALS')[0];
  if (!ref || ref.Employee_ID !== '1001' || ref.Relationship !== 'جار') errors.push('referral not recorded from the form');
  await shot('4-attribution');
  // hand over to the support recruiter
  await page.click('#atOwner'); await page.waitForSelector('#aoU'); await page.fill('#aoW', 'توزيع الشغل');
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => /علي حسن/.test(document.getElementById('main').textContent));
  // --- agency candidate
  await page.evaluate(id => go('candnew', id), vacId); await page.waitForSelector('#cnS');
  await page.selectOption('#cnS', 'AGENCY'); await page.waitForSelector('#cnAg', { state: 'visible' });
  await page.selectOption('#cnAg', { label: 'مكتب النيل للتوظيف' });
  await page.fill('#pf_Full_Name', 'سامح عادل فهمي'); await page.fill('#pf_Mobile', '01077778888');
  await page.check('#cnOk'); await page.click('#cnSave'); await page.waitForSelector('#atSrc');
  if (!/مكتب النيل للتوظيف/.test(await page.textContent('#main')) || !/ضمان 90 يوم/.test(await page.textContent('#main'))) errors.push('agency terms not on the candidate');
  await shot('5-agency-candidate');
  // --- HR: referrals register and bonus decision
  await open(t.hr);
  await page.evaluate(() => go('sources', 'refs')); await page.waitForSelector('[data-bon]');
  await shot('6-referrals');
  await page.click('[data-bon]'); await page.waitForSelector('#bnS'); await page.selectOption('#bnS', 'NOT_ELIGIBLE'); await page.fill('#bnN', 'قرار للتجربة');
  await page.click('#mActions .btn.primary'); await page.waitForTimeout(400);
  fresh(); if (ctx.all_('REFERRALS')[0].Bonus_Status !== 'NOT_ELIGIBLE') errors.push('bonus decision not saved');
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
    await page.screenshot({ path: OUT + '/v090-en-' + name + '.png', fullPage: true });
  }
  fresh(); const appA = ctx.all_('REFERRALS')[0].Application_ID;
  await page.evaluate(id => go('app', id), appA); await page.waitForSelector('#atOwner'); await page.waitForTimeout(300); await leftovers('attribution');
  await page.evaluate(() => go('sources', 'agencies')); await page.waitForSelector('[data-ag]'); await page.waitForTimeout(300); await leftovers('agencies');
  await page.evaluate(() => go('sources', 'refs')); await page.waitForSelector('[data-bon]'); await page.waitForTimeout(300); await leftovers('referrals');
  // --- phone
  api('me.setLang', tO, { lang: 'ar' });
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  for (const [n, v, a] of [['app', 'app', appA], ['agencies', 'sources', 'agencies'], ['refs', 'sources', 'refs']]) {
    await ph.evaluate(x => go(x[0], x[1]), [v, a]); await ph.waitForTimeout(500);
    await ph.screenshot({ path: OUT + '/v090-phone-' + n + '.png', fullPage: true });
    const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on ' + n + ': ' + w);
  }
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui12 OK');
})().catch(e => { console.error(e); process.exit(1); });
